import logger from '../utils/logger.js';

class TaskQueue {
    constructor(concurrency = 2) {
        this.concurrency = concurrency;
        this.running = 0;
        this.queue = [];
    }

    /**
     * Pushes a task to the queue and returns a promise that resolves when the task finishes.
     * @param {Function} taskFn - An async function representing the task.
     * @param {Function} onQueueStatus - Callback to notify user of queue position.
     * @returns {Promise<any>} Resolves with the result of taskFn.
     */
    push(taskFn, onQueueStatus) {
        return new Promise((resolve, reject) => {
            const item = { taskFn, resolve, reject, onQueueStatus };
            this.queue.push(item);
            this.process();
        });
    }

    process() {
        if (this.running >= this.concurrency || this.queue.length === 0) {
            // Notify remaining tasks about their position in the queue
            this.queue.forEach((item, index) => {
                if (typeof item.onQueueStatus === 'function') {
                    item.onQueueStatus(index + 1);
                }
            });
            return;
        }

        const item = this.queue.shift();
        this.running++;

        // Notify that the task is starting (position 0 / active)
        if (typeof item.onQueueStatus === 'function') {
            item.onQueueStatus(0);
        }

        item.taskFn()
            .then(item.resolve)
            .catch(item.reject)
            .finally(() => {
                this.running--;
                this.process();
            });
    }
}

// Global queue instances
export const videoQueue = new TaskQueue(2); // max 2 video converts/downloads at once
