import { jest } from '@jest/globals';

const createBaileysAdapter = jest.fn(async (options) => ({
    transport: 'baileys',
    options,
}));
const createZapoAdapter = jest.fn(async (options) => ({ transport: 'zapo', options }));

await jest.unstable_mockModule('../src/wa/baileysAdapter.js', () => ({ createBaileysAdapter }));
await jest.unstable_mockModule('../src/wa/zapoAdapter.js', () => ({ createZapoAdapter }));

const { createTransport } = await import('../src/wa/client.js');

const ENV_KEYS = ['WA_TRANSPORT', 'ZAPO_DB_PATH', 'BOT_PHONE_NUMBER'];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

describe('WhatsApp transport factory', () => {
    beforeEach(() => {
        for (const k of ENV_KEYS) delete process.env[k];
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    afterAll(() => {
        for (const [k, v] of Object.entries(savedEnv)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
    });

    test('defaults to the existing Baileys session', async () => {
        const result = await createTransport();
        expect(result.transport).toBe('baileys');
        expect(createBaileysAdapter).toHaveBeenCalledWith({ authFolder: 'auth_info_baileys' });
    });

    test('uses stable Zapo session and SQLite path', async () => {
        process.env.WA_TRANSPORT = 'zapo';
        process.env.ZAPO_DB_PATH = 'data/test-zapo.sqlite';
        process.env.BOT_PHONE_NUMBER = '62 800-0000-001';
        const result = await createTransport({ sessionId: '628123' });
        expect(result.transport).toBe('zapo');
        expect(createZapoAdapter).toHaveBeenCalledWith({
            storePath: 'data/jadibot-628123.sqlite',
            sessionId: '628123',
            pairingNumber: undefined,
        });
    });

    test('sub-bot zapo session pairs with its own number, not the main one', async () => {
        process.env.WA_TRANSPORT = 'zapo';
        process.env.ZAPO_DB_PATH = 'data/test-zapo.sqlite';
        process.env.BOT_PHONE_NUMBER = '62 800-0000-001';
        await createTransport({ sessionId: '628000000002', pairingNumber: '628000000002' });
        expect(createZapoAdapter).toHaveBeenCalledWith({
            storePath: 'data/jadibot-628000000002.sqlite',
            sessionId: '628000000002',
            pairingNumber: '628000000002',
        });
    });

    test('main zapo session gets the pairing number (digits only)', async () => {
        process.env.WA_TRANSPORT = 'zapo';
        process.env.ZAPO_DB_PATH = 'data/test-zapo.sqlite';
        process.env.BOT_PHONE_NUMBER = '62 800-0000-001';
        await createTransport();
        expect(createZapoAdapter).toHaveBeenCalledWith({
            storePath: 'data/test-zapo.sqlite',
            sessionId: 'default',
            pairingNumber: '628000000001',
        });
    });
});
