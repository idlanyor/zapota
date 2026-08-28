import http from 'http';
import { Server } from 'socket.io';
import crypto from 'crypto';
import url from 'url';
import logger from '\.\./utils/logger\.js';
import * as financeService from './financeService.js';
import { jadibotService } from './jadibotService.js';
import User from '../database/models/User.js';
import Settings from '../database/models/Settings.js';
import bcrypt from 'bcrypt';
import { settings } from '../config/settings.js';
import * as cloudflare from './cloudflare.js';
import { getCachedSettings } from '../handlers/messageFlow.js';
import { decodeJid } from '\.\./utils/serialize\.js';
import { coreRequest } from './kanataCore.js';

const DEFAULT_PORT = 8787;
const MAX_BODY_BYTES = 1 * 1024 * 1024; // Increased to 1MB for image/audio data
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 60;

const rateStore = new Map();

const normalizeOwners = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string' || !value.trim()) return [];

    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
    } catch {
        // Support legacy comma-separated values.
    }

    return value
        .split(',')
        .map((owner) => owner.trim())
        .filter(Boolean);
};

const isOwner = async (jid) => {
    if (!jid) return false;
    const botSettings = await getCachedSettings();
    const ownerJid = decodeJid(settings.ownerNumber);
    const ownerLid = settings.ownerLid ? decodeJid(settings.ownerLid) : null;

    const staticOwners = [ownerJid, ownerLid].filter(Boolean);
    const dbOwners = normalizeOwners(botSettings.owners).map((o) => decodeJid(o));

    // Web client (Kanata Core) mengirim UUID user, bukan JID — resolve dulu.
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(jid))) {
        try {
            const me = await coreRequest('GET', `/v1/users/${jid}`);
            if (me.ok && me.data) return me.data.role === 'owner';
        } catch {
            // fallback ke perbandingan JID
        }
    }

    const normalizedJid = decodeJid(jid);
    return [...staticOwners, ...dbOwners].includes(normalizedJid);
};

const readJsonBody = (req) =>
    new Promise((resolve, reject) => {
        let body = '';
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                reject(new Error('Payload too large'));
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
                reject(new Error('Invalid JSON body'));
            }
        });
        req.on('error', reject);
    });

const respond = (res, statusCode, payload) => {
    res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
};

const getClientIp = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
};

const normalizeJid = (to) => {
    if (!to || typeof to !== 'string') return null;
    const trimmed = to.trim();
    if (!trimmed) return null;
    if (trimmed.includes('@')) return trimmed;
    const digits = trimmed.replace(/\D/g, '');
    if (!digits) return null;
    return `${digits}@s.whatsapp.net`;
};

const decodeBase64Data = (value) => {
    if (typeof value !== 'string' || !value.trim()) return null;
    const raw = value.includes(',') ? value.split(',').pop() : value;
    try {
        return Buffer.from(raw, 'base64');
    } catch {
        return null;
    }
};

const validateToken = (incoming, expected) => {
    if (!incoming || !expected) return false;
    const a = Buffer.from(incoming);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
};

const checkRateLimit = (key) => {
    const now = Date.now();
    const current = rateStore.get(key);
    if (!current || now > current.resetAt) {
        rateStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return true;
    }
    if (current.count >= RATE_LIMIT_MAX) return false;
    current.count += 1;
    return true;
};

export const startWebhookApi = ({ getSocket }) => {
    const port = Number(process.env.BOT_WEBHOOK_PORT || DEFAULT_PORT);
    const token = process.env.BOT_WEBHOOK_TOKEN;
    const allowList = (process.env.BOT_WEBHOOK_ALLOWLIST || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);

    if (!token) {
        logger.warn('BOT_WEBHOOK_TOKEN is not set, webhook API will not start', 'WEBHOOK');
        return null;
    }

    const server = http.createServer(async (req, res) => {
        const parsedUrl = url.parse(req.url || '/', true);
        const pathname = parsedUrl.pathname;
        const method = req.method || 'GET';

        logger.info(`Webhook Request: ${method} ${pathname}`, 'WEBHOOK');

        if (method === 'GET' && pathname === '/health') {
            return respond(res, 200, { ok: true, service: 'webhook-api' });
        }

        const ip = getClientIp(req);
        if (allowList.length > 0 && !allowList.includes(ip)) {
            return respond(res, 403, { ok: false, error: 'IP not allowed' });
        }

        const authHeader = req.headers.authorization || '';
        const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
        if (!validateToken(bearer, token)) {
            return respond(res, 401, { ok: false, error: 'Unauthorized' });
        }

        if (!checkRateLimit(`${ip}:${bearer}`)) {
            return respond(res, 429, { ok: false, error: 'Too many requests' });
        }

        try {
            // Authentication Endpoint — delegate ke Kanata Core
            if (pathname === '/api/webhook/auth/login' && method === 'POST') {
                const body = await readJsonBody(req);
                const { username, password } = body;
                if (!username || !password)
                    return respond(res, 400, {
                        ok: false,
                        error: 'Username and password are required',
                    });

                const core = await coreRequest('POST', '/v1/auth/login', { username, password });
                if (!core.ok) {
                    return respond(res, core.status || 401, {
                        ok: false,
                        error: core.error || 'Invalid credentials',
                    });
                }
                const d = core.data;
                const user = await User.findOne({ jid: d.userId });
                return respond(res, 200, {
                    ok: true,
                    data: {
                        userId: d.userId,
                        username: d.username || username,
                        whatsappNumber: d.whatsappNumber || username,
                        isOwner: d.isOwner ?? (user ? await isOwner(user.jid) : false),
                    },
                });
            }

            // Cloudflare API Endpoints
            if (pathname.startsWith('/api/webhook/cloudflare/')) {
                let body = {};
                if (method !== 'GET') {
                    body = await readJsonBody(req);
                }

                const userId = method === 'GET' ? parsedUrl.query.userId : body.userId;
                if (!userId || !(await isOwner(userId))) {
                    return respond(res, 403, {
                        ok: false,
                        error: 'Forbidden: Only owner can access Cloudflare features',
                    });
                }

                if (pathname === '/api/webhook/cloudflare/zones' && method === 'GET') {
                    const zones = await cloudflare.fetchAllZones(parsedUrl.query.page || 1);
                    return respond(res, 200, { ok: true, data: zones });
                }

                if (pathname === '/api/webhook/cloudflare/dns' && method === 'GET') {
                    const { zoneId, page } = parsedUrl.query;
                    if (!zoneId)
                        return respond(res, 400, { ok: false, error: 'zoneId is required' });
                    const records = await cloudflare.listDnsRecords(zoneId, page || 1);
                    return respond(res, 200, { ok: true, data: records });
                }

                if (pathname === '/api/webhook/cloudflare/dns' && method === 'POST') {
                    const { zoneId, type, name, content, proxied } = body;
                    if (!zoneId || !type || !name || !content)
                        return respond(res, 400, { ok: false, error: 'Missing required fields' });
                    const result = await cloudflare.addDnsRecord(
                        zoneId,
                        type,
                        name,
                        content,
                        !!proxied
                    );
                    return respond(res, 200, { ok: true, data: result });
                }

                if (pathname === '/api/webhook/cloudflare/rules' && method === 'GET') {
                    const { mode, page } = parsedUrl.query;
                    const rules = await cloudflare.listRules(mode, page || 1);
                    return respond(res, 200, { ok: true, data: rules });
                }

                if (pathname === '/api/webhook/cloudflare/rules' && method === 'POST') {
                    const { ip, mode, notes } = body;
                    if (!ip || !mode)
                        return respond(res, 400, { ok: false, error: 'ip and mode are required' });
                    const result = await cloudflare.createRule(ip, mode, notes);
                    return respond(res, 200, { ok: true, data: result });
                }

                if (pathname === '/api/webhook/cloudflare/rules' && method === 'DELETE') {
                    const { ip } = body;
                    if (!ip) return respond(res, 400, { ok: false, error: 'ip is required' });
                    const result = await cloudflare.deleteRule(ip);
                    return respond(res, 200, { ok: !!result, data: result });
                }
            }

            // User Management Endpoints — delegate ke Kanata Core (data source)
            if (pathname.startsWith('/api/webhook/users')) {
                // Baca body sekali (POST) agar tidak hang saat baca kedua kali.
                const body = method === 'GET' ? null : await readJsonBody(req);
                const userId = method === 'GET' ? parsedUrl.query.userId : body.userId;
                if (!userId || !(await isOwner(userId))) {
                    return respond(res, 403, {
                        ok: false,
                        error: 'Forbidden: Only owner can access User Management',
                    });
                }

                if (pathname === '/api/webhook/users/list' && method === 'GET') {
                    const page = parseInt(parsedUrl.query.page) || 1;
                    const limit = parseInt(parsedUrl.query.limit) || 20;
                    const search = parsedUrl.query.search || '';
                    const core = await coreRequest(
                        'GET',
                        `/v1/users?page=${page}&limit=${limit}&search=${encodeURIComponent(search || '')}`
                    );
                    return respond(res, core.status || 200, core);
                }

                if (pathname === '/api/webhook/users/update' && method === 'POST') {
                    const { targetJid, balance, role, name, emailCloud, phoneNumber } = body;
                    if (!targetJid)
                        return respond(res, 400, { ok: false, error: 'targetJid is required' });

                    const fields = {};
                    if (balance !== undefined) fields.balance = parseInt(balance);
                    if (role) fields.role = role;
                    if (name) fields.display_name = name;

                    const core = await coreRequest(
                        'PATCH',
                        `/v1/users/${encodeURIComponent(targetJid)}`,
                        fields
                    );
                    return respond(res, core.status || 200, core);
                }
            }

            // Bot Settings Endpoints
            if (pathname.startsWith('/api/webhook/settings')) {
                const userId =
                    method === 'GET' ? parsedUrl.query.userId : (await readJsonBody(req)).userId;
                if (!userId || !(await isOwner(userId))) {
                    return respond(res, 403, {
                        ok: false,
                        error: 'Forbidden: Only owner can access Bot Settings',
                    });
                }

                if (pathname === '/api/webhook/settings' && method === 'GET') {
                    const botSettings = await getCachedSettings();
                    return respond(res, 200, { ok: true, data: botSettings });
                }

                if (pathname === '/api/webhook/settings/update' && method === 'POST') {
                    const body = await readJsonBody(req);
                    const updateableFields = [
                        'mode',
                        'autoStatusRead',
                        'autoAiPrivate',
                        'mustJoinGroup',
                        'groupInviteLink',
                        'privateAiPersona',
                    ];

                    const updateData = {};
                    updateableFields.forEach((field) => {
                        if (body[field] !== undefined) {
                            updateData[field] = body[field];
                        }
                    });

                    if (Object.keys(updateData).length === 0) {
                        return respond(res, 400, { ok: false, error: 'No valid fields to update' });
                    }

                    const updated = await Settings.findOneAndUpdate(
                        { id: 'bot_settings' },
                        updateData,
                        { new: true, upsert: true }
                    );

                    const { clearSettingsCache } = await import('../handlers/messageHandler.js');
                    clearSettingsCache();

                    return respond(res, 200, { ok: true, data: updated });
                }
            }

            // WhatsApp Messaging Endpoints
            if (
                method === 'POST' &&
                (pathname === '/api/webhook/send-text' ||
                    pathname === '/api/webhook/send-document' ||
                    pathname === '/api/webhook/send-image')
            ) {
                const body = await readJsonBody(req);
                const sock = getSocket();
                if (!sock) return respond(res, 503, { ok: false, error: 'Bot socket unavailable' });

                const to = normalizeJid(body.to);
                if (!to)
                    return respond(res, 400, { ok: false, error: 'Invalid payload. Required: to' });

                let result;
                if (pathname === '/api/webhook/send-text') {
                    const text = typeof body.text === 'string' ? body.text.trim() : '';
                    if (!text)
                        return respond(res, 400, {
                            ok: false,
                            error: 'Invalid payload. Required: text',
                        });
                    result = await sock.sendMessage(to, { text });
                } else if (pathname === '/api/webhook/send-document') {
                    const documentBuffer = decodeBase64Data(body.data);
                    if (!documentBuffer)
                        return respond(res, 400, {
                            ok: false,
                            error: 'Invalid payload. Required: base64 data',
                        });
                    result = await sock.sendMessage(to, {
                        document: documentBuffer,
                        mimetype: body.mimetype || 'application/pdf',
                        fileName: body.fileName || 'document.pdf',
                        caption: body.caption || '',
                    });
                } else {
                    const imageUrl = typeof body.url === 'string' ? body.url.trim() : '';
                    if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
                        return respond(res, 400, {
                            ok: false,
                            error: 'Invalid payload. Required: https image url',
                        });
                    }
                    const imageResponse = await fetch(imageUrl, {
                        signal: AbortSignal.timeout(10_000),
                    });
                    if (!imageResponse.ok)
                        throw new Error(`Thumbnail HTTP ${imageResponse.status}`);
                    const thumbnail = Buffer.from(await imageResponse.arrayBuffer());
                    result = await sock.sendMessage(to, {
                        text: typeof body.caption === 'string' ? body.caption : '',
                        contextInfo: {
                            externalAdReply: {
                                title: '⌂ W E R E W O L F',
                                body: 'Ultimate Werewolf',
                                mediaType: 1,
                                renderLargerThumbnail: true,
                                thumbnail,
                                thumbnailUrl: imageUrl,
                                sourceUrl: '',
                                mediaUrl: imageUrl,
                            },
                        },
                    });
                }
                return respond(res, 200, { ok: true, data: { to, messageId: result?.key?.id } });
            }

            // Finance API Endpoints
            if (pathname === '/api/webhook/finance/report' && method === 'GET') {
                const { userId, month, year, type, category, startDate, endDate } = parsedUrl.query;
                if (!userId) return respond(res, 400, { ok: false, error: 'userId is required' });

                const report = await financeService.getMonthlyReport(
                    userId,
                    month ? parseInt(month) - 1 : undefined,
                    year ? parseInt(year) : undefined,
                    { type, category, startDate, endDate }
                );
                return respond(res, 200, { ok: true, data: report });
            }

            if (pathname === '/api/webhook/finance/catat' && method === 'POST') {
                const body = await readJsonBody(req);
                const { userId, userName, text, fileBase64, mimeType } = body;
                if (!userId) return respond(res, 400, { ok: false, error: 'userId is required' });

                let result;
                if (text || fileBase64) {
                    const fileData = fileBase64
                        ? {
                              buffer: decodeBase64Data(fileBase64),
                              mimeType: mimeType || 'image/jpeg',
                          }
                        : null;
                    result = await financeService.processAiTransaction(
                        userId,
                        userName || 'Web User',
                        text,
                        fileData
                    );
                } else {
                    const { type, amount, category, description, date, kakeiboCategory } = body;
                    if (!type || !amount)
                        return respond(res, 400, {
                            ok: false,
                            error: 'type and amount are required',
                        });
                    const tx = await financeService.addTransaction({
                        userId,
                        userName: userName || 'Web User',
                        type,
                        amount,
                        category,
                        description,
                        date,
                        kakeiboCategory,
                    });
                    result = { success: true, transactions: [tx] };
                }
                return respond(res, 200, { ok: true, data: result });
            }

            if (pathname === '/api/webhook/finance/delete' && method === 'DELETE') {
                const body = await readJsonBody(req);
                const { userId, transactionId } = body;
                if (!userId) return respond(res, 400, { ok: false, error: 'userId is required' });
                const deleted = await financeService.deleteTransaction(userId, transactionId);
                return respond(res, 200, { ok: true, deleted: !!deleted, data: deleted });
            }

            if (pathname === '/api/webhook/finance/update' && method === 'POST') {
                const body = await readJsonBody(req);
                const {
                    userId,
                    transactionId,
                    type,
                    amount,
                    category,
                    description,
                    date,
                    kakeiboCategory,
                } = body;
                if (!userId || !transactionId)
                    return respond(res, 400, {
                        ok: false,
                        error: 'userId and transactionId are required',
                    });

                const updateData = {};
                if (type) updateData.type = type;
                if (amount) updateData.amount = amount;
                if (category) updateData.category = category;
                if (description) updateData.description = description;
                if (kakeiboCategory !== undefined) updateData.kakeiboCategory = kakeiboCategory;
                if (date) updateData.date = new Date(date);

                const updated = await financeService.updateTransaction(
                    userId,
                    transactionId,
                    updateData
                );
                return respond(res, 200, { ok: !!updated, data: updated });
            }

            if (pathname === '/api/webhook/finance/detail' && method === 'GET') {
                const { userId, transactionId } = parsedUrl.query;
                if (!userId || !transactionId)
                    return respond(res, 400, {
                        ok: false,
                        error: 'userId and transactionId are required',
                    });

                const transaction = await financeService.Transaction.findOne({
                    _id: transactionId,
                    userId,
                });
                return respond(res, 200, { ok: !!transaction, data: transaction });
            }

            if (pathname === '/api/webhook/finance/kakeibo' && method === 'GET') {
                const { userId, month, year } = parsedUrl.query;
                if (!userId) return respond(res, 400, { ok: false, error: 'userId is required' });
                const data = await financeService.getKakeiboReport(
                    userId,
                    month ? parseInt(month) - 1 : undefined,
                    year ? parseInt(year) : undefined
                );
                return respond(res, 200, { ok: true, data });
            }

            if (pathname === '/api/webhook/finance/budget' && method === 'POST') {
                const body = await readJsonBody(req);
                const { userId, month, year, incomeTarget, savingsTarget } = body;
                if (!userId || !month || !year)
                    return respond(res, 400, {
                        ok: false,
                        error: 'userId, month, and year are required',
                    });

                const budget = await financeService.setBudget(userId, month, year, {
                    incomeTarget,
                    savingsTarget,
                });
                return respond(res, 200, { ok: true, data: budget });
            }

            // Jadibot API Endpoints
            if (pathname === '/api/webhook/jadibot/start' && method === 'POST') {
                const body = await readJsonBody(req);
                const { phoneNumber } = body;
                if (!phoneNumber)
                    return respond(res, 400, { ok: false, error: 'phoneNumber is required' });
                const result = await jadibotService.startSession(phoneNumber);
                return respond(res, 200, { ok: true, data: result });
            }

            if (pathname === '/api/webhook/jadibot/sessions' && method === 'GET') {
                const sessions = jadibotService.listSessions();
                return respond(res, 200, { ok: true, data: sessions });
            }

            if (pathname === '/api/webhook/jadibot/stop' && method === 'POST') {
                const body = await readJsonBody(req);
                const { phoneNumber } = body;
                if (!phoneNumber)
                    return respond(res, 400, { ok: false, error: 'phoneNumber is required' });
                const result = await jadibotService.stopSession(phoneNumber);
                return respond(res, 200, { ok: result.success, data: result });
            }

            return respond(res, 404, { ok: false, error: 'Not found' });
        } catch (err) {
            logger.error(`Webhook API error: ${err.message}`, 'WEBHOOK');
            const status =
                err.message === 'Payload too large' || err.message === 'Invalid JSON body'
                    ? 400
                    : 500;
            return respond(res, status, {
                ok: false,
                error: err.message || 'Internal server error',
            });
        }
    });

    const io = new Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
    });

    jadibotService.setIo(io);

    io.on('connection', (socket) => {
        logger.debug('Dashboard client connected via WebSocket', 'WEBHOOK');
    });

    server.listen(port, () => {
        logger.success(`Listen :${port}`, 'WEBHOOK');
    });

    server.on('error', (err) => {
        logger.error(`Webhook API error: ${err.message}`, 'WEBHOOK');
    });

    return server;
};
