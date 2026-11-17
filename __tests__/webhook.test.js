/**
 * Behavior contract for the webhook HTTP API (src/webhook/server.js).
 * External services are mocked; requests go over a real HTTP server on an
 * ephemeral port.
 */
import { jest } from '@jest/globals';

const TOKEN = 'test-token-123456';
const OWNER = '628111000111@s.whatsapp.net';
process.env.OWNER_NUMBER = OWNER;
process.env.BOT_WEBHOOK_TOKEN = TOKEN;
process.env.BOT_WEBHOOK_PORT = '0';
process.env.BOT_WEBHOOK_HOST = '127.0.0.1';

const noop = () => {};
const logger = new Proxy({}, { get: () => noop });

const finance = {
    getMonthlyReport: jest.fn(async () => ({ transactions: [] })),
    processAiTransaction: jest.fn(async () => ({ success: true })),
    addTransaction: jest.fn(async (tx) => ({ id: 't1', ...tx })),
    deleteTransaction: jest.fn(async () => ({ id: 't1' })),
    updateTransaction: jest.fn(async () => ({ id: 't1' })),
    getTransaction: jest.fn(async () => ({ id: 't1' })),
    getKakeiboReport: jest.fn(async () => ({ k: 1 })),
    setBudget: jest.fn(async () => ({ b: 1 })),
};
const jadibot = {
    setIo: jest.fn(),
    startSession: jest.fn(async (p) => ({ success: true, phoneNumber: p })),
    stopSession: jest.fn(async () => ({ success: true })),
    listSessions: jest.fn(() => [{ phoneNumber: '62' }]),
};
const cloudflare = {
    fetchAllZones: jest.fn(async () => ['z']),
    listDnsRecords: jest.fn(async () => ['r']),
    addDnsRecord: jest.fn(async () => ({ id: 'd' })),
    listRules: jest.fn(async () => []),
    createRule: jest.fn(async () => ({ id: 'rule' })),
    deleteRule: jest.fn(async () => true),
};
const coreRequest = jest.fn(async () => ({ ok: true, status: 200, data: {} }));
const qris = {
    markInvoiceSettled: jest.fn(() => null),
    markInvoiceSettledByAmount: jest.fn(() => null),
    generateDynamicQris: jest.fn(() => 'QRIS'),
    getQrImageUrl: jest.fn(() => 'https://qr.example/x.png'),
};
const settingsRepo = { update: jest.fn(async (p) => ({ settingsId: 'bot_settings', ...p })) };
const userRepo = { findOne: jest.fn(async () => null) };
const getCachedSettings = jest.fn(async () => ({ owners: [], mode: 'public' }));
const clearSettingsCache = jest.fn();

jest.unstable_mockModule('../src/utils/logger.js', () => ({ default: logger }));
jest.unstable_mockModule('../src/services/financeService.js', () => finance);
jest.unstable_mockModule('../src/services/jadibotService.js', () => ({ jadibotService: jadibot }));
jest.unstable_mockModule('../src/services/cloudflare.js', () => cloudflare);
jest.unstable_mockModule('../src/services/kanataCore.js', () => ({ coreRequest }));
jest.unstable_mockModule('../src/services/qrisService.js', () => qris);
jest.unstable_mockModule('../src/database/repos/settingsRepo.js', () => ({ settingsRepo }));
jest.unstable_mockModule('../src/database/repos/userRepo.js', () => ({ userRepo }));
jest.unstable_mockModule('../src/handlers/messageFlow.js', () => ({
    getCachedSettings,
    clearSettingsCache,
}));
jest.unstable_mockModule('../src/handlers/messageHandler.js', () => ({ clearSettingsCache }));

const { startWebhookApi, router } = await import('../src/webhook/server.js');

let server;
let base;
let sock;

const call = async (method, path, { body, token = TOKEN, headers = {}, raw } = {}) => {
    const res = await fetch(base + path, {
        method,
        headers: {
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            ...(body !== undefined || raw ? { 'content-type': 'application/json' } : {}),
            ...headers,
        },
        body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
        signal: AbortSignal.timeout(3000),
    });
    return { status: res.status, json: await res.json() };
};

beforeAll(async () => {
    sock = { sendMessage: jest.fn(async () => ({ key: { id: 'MSG1' } })) };
    server = startWebhookApi({ getSocket: () => sock });
    await new Promise((r) => (server.listening ? r() : server.once('listening', r)));
    base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
    await new Promise((r) => server.close(r));
});

beforeEach(() => {
    jest.clearAllMocks();
    getCachedSettings.mockResolvedValue({ owners: [], mode: 'public' });
});

describe('access control', () => {
    test('health is public', async () => {
        expect(await call('GET', '/health', { token: null })).toEqual({
            status: 200,
            json: { ok: true, service: 'webhook-api' },
        });
    });

    test('protected routes need the bearer token', async () => {
        expect((await call('GET', '/api/webhook/jadibot/sessions', { token: null })).status).toBe(
            401
        );
        expect(
            (await call('GET', '/api/webhook/jadibot/sessions', { token: 'wrong' })).status
        ).toBe(401);
        expect((await call('GET', '/api/webhook/jadibot/sessions')).status).toBe(200);
    });

    test('unknown paths: 401 without token, 404 with token', async () => {
        expect((await call('GET', '/nope', { token: null })).status).toBe(401);
        expect(await call('GET', '/nope')).toEqual({
            status: 404,
            json: { ok: false, error: 'Not found' },
        });
        expect((await call('DELETE', '/api/webhook/jadibot/sessions')).status).toBe(404);
    });

    test('invalid JSON body is a 400', async () => {
        const r = await call('POST', '/api/webhook/jadibot/start', { raw: '{nope' });
        expect(r).toEqual({ status: 400, json: { ok: false, error: 'Invalid JSON body' } });
    });

    test('owner-only areas reject non-owners with a domain message', async () => {
        const r = await call('GET', '/api/webhook/settings?userId=628999@s.whatsapp.net');
        expect(r.status).toBe(403);
        expect(r.json.error).toMatch(/Bot Settings/);
        const cf = await call('GET', '/api/webhook/cloudflare/zones?userId=628999@s.whatsapp.net');
        expect(cf.json.error).toMatch(/Cloudflare/);
        const u = await call('GET', '/api/webhook/users/list?userId=628999@s.whatsapp.net');
        expect(u.json.error).toMatch(/User Management/);
    });

    test('owners may be configured in DB settings', async () => {
        getCachedSettings.mockResolvedValue({
            owners: '["628222000222@s.whatsapp.net"]',
            mode: 'self',
        });
        const r = await call('GET', '/api/webhook/settings?userId=628222000222@s.whatsapp.net');
        expect(r).toEqual({
            status: 200,
            json: { ok: true, data: { owners: '["628222000222@s.whatsapp.net"]', mode: 'self' } },
        });
    });

    test('web-client UUIDs are resolved through Kanata Core', async () => {
        coreRequest.mockResolvedValueOnce({ ok: true, data: { role: 'owner' } });
        const uuid = '123e4567-e89b-12d3-a456-426614174000';
        expect((await call('GET', `/api/webhook/settings?userId=${uuid}`)).status).toBe(200);
        expect(coreRequest).toHaveBeenCalledWith('GET', `/v1/users/${uuid}`);
    });
});

describe('settings', () => {
    test('update reads the body once and applies only allowed fields', async () => {
        const r = await call('POST', '/api/webhook/settings/update', {
            body: { userId: OWNER, mode: 'self', owners: ['hacker'] },
        });
        expect(r).toEqual({
            status: 200,
            json: { ok: true, data: { settingsId: 'bot_settings', mode: 'self' } },
        });
        expect(settingsRepo.update).toHaveBeenCalledWith({ mode: 'self' });
        expect(clearSettingsCache).toHaveBeenCalled();
    });

    test('update with no allowed fields is a 400', async () => {
        const r = await call('POST', '/api/webhook/settings/update', { body: { userId: OWNER } });
        expect(r).toEqual({ status: 400, json: { ok: false, error: 'No valid fields to update' } });
    });
});

describe('users (Kanata Core)', () => {
    test('list forwards paging and search', async () => {
        coreRequest.mockResolvedValueOnce({ ok: true, status: 200, data: ['u'] });
        const r = await call(
            'GET',
            `/api/webhook/users/list?userId=${OWNER}&page=2&limit=5&search=a b`
        );
        expect(r.json).toEqual({ ok: true, status: 200, data: ['u'] });
        expect(coreRequest).toHaveBeenLastCalledWith(
            'GET',
            '/v1/users?page=2&limit=5&search=a%20b'
        );
    });

    test('update maps fields to Core', async () => {
        await call('POST', '/api/webhook/users/update', {
            body: { userId: OWNER, targetJid: '62x@s', balance: '10', role: 'admin', name: 'N' },
        });
        expect(coreRequest).toHaveBeenLastCalledWith('PATCH', '/v1/users/62x%40s', {
            balance: 10,
            role: 'admin',
            display_name: 'N',
        });
    });
});

describe('cloudflare', () => {
    test('dns add validates and forwards', async () => {
        expect(
            (await call('POST', '/api/webhook/cloudflare/dns', { body: { userId: OWNER } })).status
        ).toBe(400);
        const r = await call('POST', '/api/webhook/cloudflare/dns', {
            body: {
                userId: OWNER,
                zoneId: 'z',
                type: 'A',
                name: 'a',
                content: '1.1.1.1',
                proxied: 1,
            },
        });
        expect(r.json).toEqual({ ok: true, data: { id: 'd' } });
        expect(cloudflare.addDnsRecord).toHaveBeenCalledWith('z', 'A', 'a', '1.1.1.1', true);
    });

    test('rules list/create/delete', async () => {
        await call('GET', `/api/webhook/cloudflare/rules?userId=${OWNER}&mode=block`);
        expect(cloudflare.listRules).toHaveBeenCalledWith('block', 1);
        expect(
            (
                await call('POST', '/api/webhook/cloudflare/rules', {
                    body: { userId: OWNER, ip: '1.2.3.4' },
                })
            ).status
        ).toBe(400);
        const del = await call('DELETE', '/api/webhook/cloudflare/rules', {
            body: { userId: OWNER, ip: '1.2.3.4' },
        });
        expect(del.json).toEqual({ ok: true, data: true });
    });
});

describe('messaging', () => {
    test('send-text validates and sends', async () => {
        expect(
            (await call('POST', '/api/webhook/send-text', { body: { text: 'hi' } })).status
        ).toBe(400);
        expect(
            (await call('POST', '/api/webhook/send-text', { body: { to: '628123' } })).status
        ).toBe(400);
        const r = await call('POST', '/api/webhook/send-text', {
            body: { to: '62 812-3', text: ' hi ' },
        });
        expect(r.json).toEqual({
            ok: true,
            data: { to: '628123@s.whatsapp.net', messageId: 'MSG1' },
        });
        expect(sock.sendMessage).toHaveBeenCalledWith('628123@s.whatsapp.net', { text: 'hi' });
    });

    test('send-document decodes base64', async () => {
        await call('POST', '/api/webhook/send-document', {
            body: { to: '628123', data: 'data:application/pdf;base64,aGVsbG8=', fileName: 'a.pdf' },
        });
        const [, content] = sock.sendMessage.mock.calls[0];
        expect(content.document.toString()).toBe('hello');
        expect(content.fileName).toBe('a.pdf');
    });

    test('503 when the bot socket is down', async () => {
        const saved = sock;
        sock = null;
        expect(
            (await call('POST', '/api/webhook/send-text', { body: { to: '1', text: 'x' } })).status
        ).toBe(503);
        sock = saved;
    });
});

describe('finance (Kanata Core)', () => {
    test('report converts 1-based month', async () => {
        await call('GET', '/api/webhook/finance/report?userId=u&month=3&year=2026&type=expense');
        expect(finance.getMonthlyReport).toHaveBeenCalledWith('u', 2, 2026, {
            type: 'expense',
            category: undefined,
            startDate: undefined,
            endDate: undefined,
        });
        expect((await call('GET', '/api/webhook/finance/report')).status).toBe(400);
    });

    test('catat: manual entry vs AI extraction', async () => {
        const manual = await call('POST', '/api/webhook/finance/catat', {
            body: { userId: 'u', type: 'expense', amount: 5 },
        });
        expect(manual.json.data.transactions[0]).toMatchObject({
            userId: 'u',
            userName: 'Web User',
            amount: 5,
        });
        await call('POST', '/api/webhook/finance/catat', {
            body: { userId: 'u', text: 'beli kopi 5rb' },
        });
        expect(finance.processAiTransaction).toHaveBeenCalledWith(
            'u',
            'Web User',
            'beli kopi 5rb',
            null
        );
    });

    test('detail, kakeibo, budget, delete, update', async () => {
        expect(
            (await call('GET', '/api/webhook/finance/detail?userId=u&transactionId=t1')).json
        ).toEqual({
            ok: true,
            data: { id: 't1' },
        });
        expect(finance.getTransaction).toHaveBeenCalledWith('u', 't1');
        await call('GET', '/api/webhook/finance/kakeibo?userId=u&month=1&year=2026');
        expect(finance.getKakeiboReport).toHaveBeenCalledWith('u', 0, 2026);
        expect(
            (await call('POST', '/api/webhook/finance/budget', { body: { userId: 'u' } })).status
        ).toBe(400);
        const del = await call('DELETE', '/api/webhook/finance/delete', {
            body: { userId: 'u', transactionId: 't1' },
        });
        expect(del.json).toMatchObject({ ok: true, deleted: true });
        await call('POST', '/api/webhook/finance/update', {
            body: { userId: 'u', transactionId: 't1', amount: 9, date: '2026-01-02' },
        });
        expect(finance.updateTransaction).toHaveBeenCalledWith('u', 't1', {
            amount: 9,
            date: new Date('2026-01-02'),
        });
    });
});

describe('jadibot', () => {
    test('start / sessions / stop', async () => {
        expect((await call('POST', '/api/webhook/jadibot/start', { body: {} })).status).toBe(400);
        expect(
            (await call('POST', '/api/webhook/jadibot/start', { body: { phoneNumber: '62' } })).json
        ).toEqual({
            ok: true,
            data: { success: true, phoneNumber: '62' },
        });
        expect((await call('GET', '/api/webhook/jadibot/sessions')).json.data).toEqual([
            { phoneNumber: '62' },
        ]);
        expect(
            (await call('POST', '/api/webhook/jadibot/stop', { body: { phoneNumber: '62' } })).json
                .ok
        ).toBe(true);
    });
});

describe('qris', () => {
    test('generate validates amount and returns the QR', async () => {
        expect(
            (await call('POST', '/api/webhook/qris/generate', { body: { amount: -1 } })).status
        ).toBe(400);
        const r = await call('POST', '/api/webhook/qris/generate', { body: { amount: '15000' } });
        expect(r.json).toEqual({
            ok: true,
            data: {
                amount: 15000,
                qris_string: 'QRIS',
                qr_image_url: 'https://qr.example/x.png',
                sent: false,
                messageId: null,
            },
        });
    });
});

describe('payment callback (public)', () => {
    test('settlement notifies owner, invoice chat and customer', async () => {
        qris.markInvoiceSettled.mockReturnValue({ orderId: 'INV-1', chatId: '120@g.us' });
        const r = await call('POST', '/api/webhook/payment/callback', {
            token: null,
            body: {
                order_id: 'INV-1',
                transaction_status: 'settlement',
                gross_amount: '25000',
                customer_phone: '628555',
            },
        });
        expect(r).toEqual({
            status: 200,
            json: {
                ok: true,
                message: 'Payment notification processed successfully',
                data: { orderId: 'INV-1', status: 'settlement', amount: 25000 },
            },
        });
        const targets = sock.sendMessage.mock.calls.map(([jid]) => jid);
        expect(targets).toEqual([OWNER, '120@g.us', '628555@s.whatsapp.net']);
    });

    test('a non-success status sends nothing and does not settle the invoice', async () => {
        await call('POST', '/api/webhook/payment/callback', {
            token: null,
            body: { order_id: 'INV-2', transaction_status: 'expire', gross_amount: 1000 },
        });
        expect(sock.sendMessage).not.toHaveBeenCalled();
        expect(qris.markInvoiceSettled).not.toHaveBeenCalled();
        expect(qris.markInvoiceSettledByAmount).not.toHaveBeenCalled();
    });

    test('notification text (MacroDroid) is parsed for the amount', async () => {
        qris.markInvoiceSettledByAmount.mockReturnValue({ orderId: 'INV-9', chatId: null });
        const r = await call('POST', '/api/webhook/payment/callback', {
            token: null,
            body: { title: 'GoPay', text: 'Pembayaran QRIS Rp 50.000 berhasil diterima' },
        });
        expect(r.json.data).toEqual({ orderId: 'INV-9', status: '', amount: 50000 });
        expect(qris.markInvoiceSettledByAmount).toHaveBeenCalledWith(50000);
    });
});

describe('route table', () => {
    test('only health and the payment callback are public', () => {
        expect(
            router.routes
                .filter((r) => r.public)
                .map((r) => r.path)
                .sort()
        ).toEqual(['/api/webhook/payment/callback', '/health']);
    });

    test('owner-only areas are cloudflare, users and settings', () => {
        const areas = new Set(
            router.routes.filter((r) => r.ownerOnly).map((r) => r.path.split('/')[3])
        );
        expect([...areas].sort()).toEqual(['cloudflare', 'settings', 'users']);
    });
});
