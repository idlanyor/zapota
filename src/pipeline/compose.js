/**
 * Koa-style middleware composition.
 *
 * Each step is `async (ctx, next) => {}`. Calling `await next()` hands control
 * to the following step; returning without calling it stops the pipeline.
 * Code after `await next()` runs on the way back out (useful for cleanup).
 *
 * @template T
 * @param {Array<(ctx: T, next: () => Promise<void>) => Promise<void> | void>} steps
 * @returns {(ctx: T) => Promise<void>}
 */
export const compose = (steps) => {
    for (const step of steps) {
        if (typeof step !== 'function') throw new TypeError('Pipeline step must be a function');
    }

    return (ctx) => {
        let lastIndex = -1;
        const dispatch = async (i) => {
            if (i <= lastIndex) throw new Error('next() called multiple times');
            lastIndex = i;
            const step = steps[i];
            if (!step) return;
            await step(ctx, () => dispatch(i + 1));
        };
        return dispatch(0);
    };
};
