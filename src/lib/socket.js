import { io } from 'socket.io-client';
import logger from '../utils/logger.js';

class BotSocket {
    constructor() {
        this.socket = null;
        this.url = process.env.WEBAPP_URL || 'http://localhost:3000';
        this.auth = process.env.ACCESS_KEY;
    }

    connect() {
        this.socket = io(this.url, {
            query: {
                type: 'bot',
                auth: this.auth,
            },
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
        });

        this.socket.on('connect', () => {
            logger.info('Connected to WebApp via WebSocket');
            this.emitStatus('online');
        });

        this.socket.on('disconnect', () => {
            logger.warn('Disconnected from WebApp WebSocket');
        });

        this.socket.on('error', (err) => {
            logger.error(`WebSocket Error: ${err.message}`);
        });

        // Listen for commands from WebApp
        this.socket.on('bot:command', (data) => {
            logger.info(`Received command from WebApp: ${data.command}`);
            // Handle specific commands if needed
        });
    }

    emitStatus(status, details = {}) {
        if (this.socket?.connected) {
            this.socket.emit('bot:status', { status, ...details, timestamp: new Date() });
        }
    }

    emitLog(message, type = 'info') {
        if (this.socket?.connected) {
            this.socket.emit('bot:log', { message, type, timestamp: new Date() });
        }
    }
}

export const botSocket = new BotSocket();
