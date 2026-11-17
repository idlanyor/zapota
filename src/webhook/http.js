import crypto from 'node:crypto';

export const MAX_BODY_BYTES = 1 * 1024 * 1024; // 1MB (image/audio payloads)

/** An error with an HTTP status; message is sent to the client. */
export class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

/** Handler result helper: `return reply(200, { ok: true })`. */
export const reply = (status, body) => ({ status, body });

export const readJsonBody = (req) =>
    new Promise((resolve, reject) => {
        let body = '';
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                reject(new HttpError(400, 'Payload too large'));
                req.destroy();
                return;
            }
            body += chunk;
        });
        req.on('end', () => {
            if (!body) return resolve({});
            try {
                resolve(JSON.parse(body));
            } catch {
                reject(new HttpError(400, 'Invalid JSON body'));
            }
        });
        req.on('error', reject);
    });

export const sendJson = (res, statusCode, payload) => {
    res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
};

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Client IP. `X-Forwarded-For` is only trusted when the request comes from
 * a local reverse proxy; otherwise any client could claim an allowlisted IP.
 */
export const getClientIp = (req) => {
    const remote = req.socket.remoteAddress || 'unknown';
    const forwarded = req.headers['x-forwarded-for'];
    if (LOOPBACK.has(remote) && typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0].trim();
    }
    return remote;
};

export const validateToken = (incoming, expected) => {
    if (!incoming || !expected) return false;
    const a = Buffer.from(incoming);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
};

/** Fixed-window limiter; expired keys are pruned so the map can't grow forever. */
export const createRateLimiter = ({ windowMs = 60_000, max = 60 } = {}) => {
    const store = new Map();
    return (key) => {
        const now = Date.now();
        if (store.size > 1000) {
            for (const [k, v] of store) if (now > v.resetAt) store.delete(k);
        }
        const current = store.get(key);
        if (!current || now > current.resetAt) {
            store.set(key, { count: 1, resetAt: now + windowMs });
            return true;
        }
        if (current.count >= max) return false;
        current.count += 1;
        return true;
    };
};

/** `628123` / `+62 812-3` → `628123@s.whatsapp.net`; full JIDs pass through. */
export const normalizeJid = (to) => {
    if (!to || typeof to !== 'string') return null;
    const trimmed = to.trim();
    if (!trimmed) return null;
    if (trimmed.includes('@')) return trimmed;
    const digits = trimmed.replace(/\D/g, '');
    return digits ? `${digits}@s.whatsapp.net` : null;
};

/** Accepts raw base64 or a data URL. */
export const decodeBase64Data = (value) => {
    if (typeof value !== 'string' || !value.trim()) return null;
    const raw = value.includes(',') ? value.split(',').pop() : value;
    try {
        return Buffer.from(raw, 'base64');
    } catch {
        return null;
    }
};
