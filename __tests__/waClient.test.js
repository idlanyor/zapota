import { jest } from '@jest/globals';

const createBaileysAdapter = jest.fn(async (options) => ({
    transport: 'baileys',
    options,
}));
const createZapoAdapter = jest.fn(async (options) => ({ transport: 'zapo', options }));

await jest.unstable_mockModule('../src/wa/baileysAdapter.js', () => ({ createBaileysAdapter }));
await jest.unstable_mockModule('../src/wa/zapoAdapter.js', () => ({ createZapoAdapter }));

const { settings } = await import('../src/config/settings.js');
const { createTransport } = await import('../src/wa/client.js');

describe('WhatsApp transport factory', () => {
    afterEach(() => {
        settings.transport = 'baileys';
        jest.clearAllMocks();
    });

    test('defaults to the existing Baileys session', async () => {
        const result = await createTransport();
        expect(result.transport).toBe('baileys');
        expect(createBaileysAdapter).toHaveBeenCalledWith({ authFolder: 'auth_info_baileys' });
    });

    test('uses stable Zapo session and SQLite path', async () => {
        settings.transport = 'zapo';
        settings.zapoDbPath = 'data/test-zapo.sqlite';
        const result = await createTransport({ sessionId: '628123' });
        expect(result.transport).toBe('zapo');
        expect(createZapoAdapter).toHaveBeenCalledWith({
            storePath: 'data/jadibot-628123.sqlite',
            sessionId: '628123',
        });
    });
});
