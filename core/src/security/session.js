import crypto from 'node:crypto';
import { config } from '../config.js';
import { query } from '../database/pool.js';

const sha256Hex = (value) => crypto.createHash('sha256').update(value).digest('hex');

export const parseCookies = (cookieHeader = '') => {
    const cookies = {};
    for (const part of cookieHeader.split(';')) {
        const idx = part.indexOf('=');
        if (idx === -1) continue;
        const key = part.slice(0, idx).trim();
        const value = part.slice(idx + 1).trim();
        if (key) {
            try {
                cookies[key] = decodeURIComponent(value);
            } catch {
                // Cookie malformed dianggap tidak ada, bukan error server.
            }
        }
    }
    return cookies;
};

export const createSession = async ({ userId, ipAddress, userAgent }) => {
    const token = crypto.randomBytes(32).toString('base64url');
    await query(
        'INSERT INTO web_sessions (session_token_hash, user_id, expires_at, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)',
        [
            sha256Hex(token),
            userId,
            new Date(Date.now() + config.cookieMaxAgeSeconds * 1000),
            ipAddress || null,
            userAgent ? String(userAgent).slice(0, 255) : null,
        ]
    );
    return token;
};

export const resolveSession = async (token) => {
    if (!token) return null;
    const rows = await query(
        `SELECT s.user_id, s.expires_at, u.*
         FROM web_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.session_token_hash = ?
           AND u.status = 'active'
           AND u.web_enabled = 1`,
        [sha256Hex(token)]
    );
    const session = rows[0];
    if (!session) return null;
    if (new Date(session.expires_at) < new Date()) return null;
    return session;
};

export const destroySession = async (token) => {
    if (!token) return;
    await query('DELETE FROM web_sessions WHERE session_token_hash = ?', [sha256Hex(token)]);
};

export const sessionCookie = (token) =>
    [
        `${config.cookieName}=${encodeURIComponent(token)}`,
        'HttpOnly',
        'SameSite=Strict',
        'Path=/',
        `Max-Age=${config.cookieMaxAgeSeconds}`,
    ].join('; ');
