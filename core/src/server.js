import http from 'node:http';
import { config } from './config.js';
import { handleRequest } from './app.js';
import { pool } from './database/pool.js';

const server = http.createServer(handleRequest);

server.listen(config.port, config.host, () => {
    console.log(`kanata-core listening on http://${config.host}:${config.port}`);
});

const shutdown = async (signal) => {
    console.log(`[core] received ${signal}, shutting down`);
    server.close(async () => {
        await pool.end();
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
