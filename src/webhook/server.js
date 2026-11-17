/**
 * Bot webhook HTTP API + Socket.IO for the web client.
 *
 * Request flow: route lookup → (public routes skip auth) → IP allowlist →
 * bearer token → rate limit → 404 for unknown paths → owner check
 * (`ownerOnly` routes) → handler. Routes live in ./routes/*.js.
 */
import http from 'node:http';
import { Server } from 'socket.io';
import logger from '../utils/logger.js';
import { env } from '../config/env.js';
import { jadibotService } from '../services/jadibotService.js';
import {
    HttpError,
    readJsonBody,
    sendJson,
    getClientIp,
    validateToken,
    createRateLimiter,
} from './http.js';
import { createRouter } from './router.js';
import { isOwner } from './owner.js';
import health from './routes/health.js';
import payment from './routes/payment.js';
import auth from './routes/auth.js';
import cloudflare from './routes/cloudflare.js';
import users from './routes/users.js';
import settingsRoutes from './routes/settings.js';
import messaging from './routes/messaging.js';
import qris from './routes/qris.js';
import finance from './routes/finance.js';
import jadibot from './routes/jadibot.js';

const DEFAULT_PORT = 8787;

export const router = createRouter([
    ...health,
    ...payment,
    ...auth,
    ...cloudflare,
    ...users,
    ...settingsRoutes,
    ...messaging,
    ...qris,
    ...finance,
    ...jadibot,
]);

/** Build the request handler (exported for tests). */
export const createRequestHandler = ({ getSocket, token, allowList = [] }) => {
    const withinRateLimit = createRateLimiter({ windowMs: 60_000, max: 60 });

    return async (req, res) => {
        const parsed = new URL(req.url || '/', 'http://localhost');
        const pathname = parsed.pathname;
        const method = req.method || 'GET';
        logger.info(`Webhook Request: ${method} ${pathname}`, 'WEBHOOK');

        const route = router.match(method, pathname);
        const ip = getClientIp(req);

        if (!route?.public) {
            if (allowList.length > 0 && !allowList.includes(ip)) {
                return sendJson(res, 403, { ok: false, error: 'IP not allowed' });
            }
            const header = req.headers.authorization || '';
            const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
            if (!validateToken(bearer, token)) {
                return sendJson(res, 401, { ok: false, error: 'Unauthorized' });
            }
            if (!withinRateLimit(`${ip}:${bearer}`)) {
                return sendJson(res, 429, { ok: false, error: 'Too many requests' });
            }
        }

        if (!route) return sendJson(res, 404, { ok: false, error: 'Not found' });

        let bodyPromise;
        const ctx = {
            req,
            ip,
            getSocket,
            query: Object.fromEntries(parsed.searchParams),
            // Read the stream once; every caller gets the same parsed body.
            body: () => (bodyPromise ??= readJsonBody(req)),
        };

        try {
            if (route.ownerOnly) {
                const userId = method === 'GET' ? ctx.query.userId : (await ctx.body()).userId;
                if (!userId || !(await isOwner(userId))) {
                    return sendJson(res, 403, {
                        ok: false,
                        error: `Forbidden: Only owner can access ${route.ownerOnly}`,
                    });
                }
            }
            const { status, body } = await route.handler(ctx);
            return sendJson(res, status, body);
        } catch (err) {
            logger.error(`Webhook API error: ${method} ${pathname}: ${err.message}`, 'WEBHOOK');
            const status = err instanceof HttpError ? err.status : 500;
            return sendJson(res, status, {
                ok: false,
                error: err.message || 'Internal server error',
            });
        }
    };
};

export const startWebhookApi = ({ getSocket }) => {
    const port = Number(env.BOT_WEBHOOK_PORT || DEFAULT_PORT);
    const host = env.BOT_WEBHOOK_HOST || '127.0.0.1';
    const token = env.BOT_WEBHOOK_TOKEN;
    const allowList = (env.BOT_WEBHOOK_ALLOWLIST || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);

    if (!token) {
        logger.warn('BOT_WEBHOOK_TOKEN is not set, webhook API will not start', 'WEBHOOK');
        return null;
    }

    const server = http.createServer(createRequestHandler({ getSocket, token, allowList }));

    const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });
    jadibotService.setIo(io);
    io.on('connection', () => logger.debug('Dashboard client connected via WebSocket', 'WEBHOOK'));

    server.listen(port, host, () => logger.success(`Listen ${host}:${port}`, 'WEBHOOK'));
    server.on('error', (err) => logger.error(`Webhook API error: ${err.message}`, 'WEBHOOK'));
    return server;
};
