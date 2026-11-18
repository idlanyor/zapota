/**
 * JadibotService against a real (in-memory) database and a fake transport.
 */
import { jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import knexFactory from 'knex';

process.env.OWNER_NUMBER = '628000000001@s.whatsapp.net';

const noop = () => {};
jest.unstable_mockModule('../src/utils/logger.js', () => ({
    default: new Proxy({}, { get: () => noop }),
}));
jest.unstable_mockModule('../src/handlers/messageHandler.js', () => ({
    messageHandler: jest.fn(),
}));

const { setKnex } = await import('../src/database/knexInstance.js');
const { migrateIfSafe } = await import('../src/database/migrate.js');
const { jadibotRepo } = await import('../src/database/repos/jadibotRepo.js');
const wallet = await import('../src/services/walletService.js');
const { JadibotService, JADIBOT } = await import('../src/services/jadibotService.js');
const { getBotProfile } = await import('../src/lib/botProfile.js');

const NUMBER = '628000000004';
const OWNER_JID = `${NUMBER}@s.whatsapp.net`;
const DAY = 24 * 60 * 60 * 1000;

/** Fake transport: tests drive it through `emit(update)`. */
const fakeTransport = (transport = 'zapo') => {
    const created = [];
    const factory = jest.fn(async ({ sessionId, pairingNumber }) => {
        const ev = new EventEmitter();
        const client = {
            ev,
            authState: { creds: { registered: false } },
            user: { id: `${sessionId}:3@s.whatsapp.net` },
            sendMessage: jest.fn(async () => ({ key: { id: `out${created.length}` } })),
            logout: jest.fn(async () => {}),
            end: jest.fn(),
            requestPairingCode: jest.fn(async () => 'BAIL3YS1'),
        };
        const adapter = { client, transport, connect: jest.fn(async () => {}), pairingNumber };
        created.push(adapter);
        return adapter;
    });
    const emit = (update, i = created.length - 1) =>
        created[i].client.ev.emit('connection.update', update);
    return { factory, created, emit };
};

let knex;
let clock;
let mainSock;
let removed;

const makeService = (transport, overrides = {}) =>
    new JadibotService({
        transportFactory: transport.factory,
        getMainSocket: () => mainSock,
        removeSessionFiles: (n) => removed.push(n),
        now: () => clock,
        maxFree: () => 2,
        reconnectDelayMs: 0,
        ...overrides,
    });

const notices = () => mainSock.sendMessage.mock.calls.map(([jid, c]) => [jid, c.text]);
const flush = () => new Promise((r) => setTimeout(r, 10));

/**
 * Wait until the fake transport's client #`count` listens for connection
 * updates. requestPairing first does a few DB round trips, so a fixed sleep
 * is not enough on a slow CI runner.
 */
const untilListening = async (transport, count) => {
    const ready = () =>
        transport.created.length >= count &&
        transport.created[count - 1].client.ev.listenerCount('connection.update') > 0;
    for (let i = 0; i < 500 && !ready(); i++) await flush();
    if (!ready()) throw new Error(`fake transport #${count} never started listening`);
};

/** Run requestPairing while the fake transport hands out a code. */
const pairWithCode = async (service, transport, req = { number: NUMBER, ownerJid: OWNER_JID }) => {
    const count = transport.created.length + 1;
    const pending = service.requestPairing(req);
    await untilListening(transport, count);
    transport.emit({ pairingCode: 'ABCD1234' });
    return pending;
};

beforeEach(async () => {
    knex = knexFactory({
        client: 'sqlite3',
        connection: { filename: ':memory:' },
        useNullAsDefault: true,
        pool: { min: 1, max: 1 },
    });
    setKnex(knex);
    await migrateIfSafe(knex, { info() {}, warn() {} });
    clock = Date.UTC(2026, 10, 18);
    mainSock = {
        user: { id: '628000000009@s.whatsapp.net' },
        sendMessage: jest.fn(async () => ({})),
    };
    removed = [];
});

afterEach(async () => {
    await knex.destroy();
});

describe('pairing', () => {
    test('returns the code and records a pending sub-bot for the requester', async () => {
        const transport = fakeTransport();
        const service = makeService(transport);
        const result = await pairWithCode(service, transport);

        expect(result).toEqual({ ok: true, code: 'ABCD1234' });
        expect(transport.factory).toHaveBeenCalledWith({
            sessionId: NUMBER,
            pairingNumber: NUMBER,
        });
        const row = await jadibotRepo.findByNumber(NUMBER);
        expect(row).toMatchObject({ status: 'pending', ownerJid: OWNER_JID, tier: 'free' });
        await service.closeSession(NUMBER);
    });

    test('first open marks it active and tells the owner through the main bot', async () => {
        const transport = fakeTransport();
        const service = makeService(transport);
        await pairWithCode(service, transport);

        transport.emit({ connection: 'open' });
        await flush();

        expect((await jadibotRepo.findByNumber(NUMBER)).status).toBe('active');
        expect(notices()).toEqual([[OWNER_JID, expect.stringContaining('Jadibot tersambung')]]);
        expect(service.isRunning(NUMBER)).toBe(true);
        expect(await service.requestPairing({ number: NUMBER, ownerJid: OWNER_JID })).toEqual({
            ok: false,
            reason: 'running',
        });
    });

    test('Baileys sockets ask for their own pairing code', async () => {
        const transport = fakeTransport('baileys');
        const service = makeService(transport);
        const pending = service.requestPairing({ number: NUMBER, ownerJid: OWNER_JID });
        await untilListening(transport, 1);
        transport.emit({ qr: 'qr-data' });
        expect(await pending).toEqual({ ok: true, code: 'BAIL3YS1' });
        expect(transport.created[0].client.requestPairingCode).toHaveBeenCalledWith(NUMBER);
        await service.closeSession(NUMBER);
    });

    test('free slots are capped; premium sub-bots do not need a slot', async () => {
        await jadibotRepo.create({ number: '628000000005', status: 'active' });
        await jadibotRepo.create({ number: '628000000006', status: 'pending' });
        const transport = fakeTransport();
        const service = makeService(transport);

        expect(await service.requestPairing({ number: NUMBER, ownerJid: OWNER_JID })).toEqual({
            ok: false,
            reason: 'full',
            max: 2,
        });
        expect(transport.factory).not.toHaveBeenCalled();

        await jadibotRepo.create({
            number: NUMBER,
            status: 'stopped',
            tier: 'premium',
            premiumUntil: clock + DAY,
        });
        expect((await pairWithCode(service, transport)).ok).toBe(true);
        await service.closeSession(NUMBER);
    });

    test('an unused pairing is cancelled: files removed, owner told', async () => {
        const transport = fakeTransport();
        const service = makeService(transport);
        await pairWithCode(service, transport);
        removed = [];

        await service.cancelPairing(NUMBER, service.sessions.get(NUMBER));

        expect(service.sessions.has(NUMBER)).toBe(false);
        expect(removed).toEqual([NUMBER]);
        expect((await jadibotRepo.findByNumber(NUMBER)).status).toBe('stopped');
        expect(notices()[0][1]).toMatch(/pairing Jadibot habis/);
    });

    test('a second request while the first waits for its code is refused', async () => {
        const transport = fakeTransport();
        const service = makeService(transport);
        const first = service.requestPairing({ number: NUMBER, ownerJid: OWNER_JID });
        expect(await service.requestPairing({ number: NUMBER, ownerJid: OWNER_JID })).toEqual({
            ok: false,
            reason: 'busy',
        });
        await untilListening(transport, 1);
        transport.emit({ pairingCode: 'ABCD1234' });
        expect((await first).ok).toBe(true);
        await service.closeSession(NUMBER);
    });
});

describe('connection lifecycle', () => {
    const connected = async (kind = 'zapo') => {
        const transport = fakeTransport(kind);
        const service = makeService(transport);
        await pairWithCode(service, transport);
        transport.emit({ connection: 'open' });
        await flush();
        mainSock.sendMessage.mockClear();
        removed = [];
        return { transport, service };
    };

    test('logout purges the session and tells the owner', async () => {
        const { transport, service } = await connected();
        transport.emit({
            connection: 'close',
            lastDisconnect: { error: { output: { statusCode: 401 } } },
        });
        await flush();

        expect(service.sessions.has(NUMBER)).toBe(false);
        expect(removed).toEqual([NUMBER]);
        expect((await jadibotRepo.findByNumber(NUMBER)).status).toBe('stopped');
        expect(notices()[0][1]).toMatch(/ter-logout/);
    });

    test('zapo reconnects on its own: no second client for the session', async () => {
        const { transport } = await connected('zapo');
        transport.emit({ connection: 'close', lastDisconnect: { error: { output: {} } } });
        await flush();
        expect(transport.factory).toHaveBeenCalledTimes(1);
    });

    test('a closed Baileys socket is replaced', async () => {
        const { transport } = await connected('baileys');
        transport.emit({ connection: 'close', lastDisconnect: { error: { output: {} } } });
        await flush();
        expect(transport.factory).toHaveBeenCalledTimes(2);
    });

    test('stop logs out, removes files, keeps premium time', async () => {
        const { transport, service } = await connected();
        await jadibotRepo.update(
            { number: NUMBER },
            { tier: 'premium', premiumUntil: clock + DAY }
        );
        await service.stopSession(NUMBER);

        expect(transport.created[0].client.logout).toHaveBeenCalled();
        expect(removed).toEqual([NUMBER]);
        expect(await jadibotRepo.findByNumber(NUMBER)).toMatchObject({
            status: 'stopped',
            tier: 'premium',
        });
    });

    test('init resumes active sub-bots only', async () => {
        await jadibotRepo.create({ number: '628000000005', status: 'active' });
        await jadibotRepo.create({ number: '628000000006', status: 'stopped' });
        const transport = fakeTransport();
        const service = makeService(transport);
        await service.init();
        await flush();
        clearInterval(service.maintenanceTimer);

        expect(transport.factory.mock.calls.map(([o]) => o)).toEqual([
            { sessionId: '628000000005', pairingNumber: undefined },
        ]);
    });
});

describe('premium', () => {
    test('charges the wallet and extends from the current end date', async () => {
        const transport = fakeTransport();
        const service = makeService(transport);
        await service.ensureRecord(NUMBER, OWNER_JID);
        await wallet.credit(OWNER_JID, 40_000);

        const first = await service.upgradePremium({ number: NUMBER, payerJid: OWNER_JID });
        expect(first).toMatchObject({ ok: true, balance: 25_000 });
        expect(first.premiumUntil.getTime()).toBe(clock + 30 * DAY);

        clock += 10 * DAY;
        const second = await service.upgradePremium({ number: NUMBER, payerJid: OWNER_JID });
        expect(second.premiumUntil.getTime()).toBe(Date.UTC(2026, 10, 18) + 60 * DAY);
        expect(second.balance).toBe(10_000);
    });

    test('not enough balance changes nothing', async () => {
        const service = makeService(fakeTransport());
        await service.ensureRecord(NUMBER, OWNER_JID);
        await wallet.credit(OWNER_JID, JADIBOT.PRICE - 1);

        expect(await service.upgradePremium({ number: NUMBER, payerJid: OWNER_JID })).toEqual({
            ok: false,
            reason: 'balance',
            balance: JADIBOT.PRICE - 1,
        });
        expect((await jadibotRepo.findByNumber(NUMBER)).tier).toBe('free');
    });

    test('upgrading a running sub-bot switches its live tier', async () => {
        const transport = fakeTransport();
        const service = makeService(transport);
        await pairWithCode(service, transport);
        const sock = transport.created[0].client;
        expect(getBotProfile(sock).tier).toBe('free');

        await wallet.credit(OWNER_JID, JADIBOT.PRICE);
        await service.upgradePremium({ number: NUMBER, payerJid: OWNER_JID });
        expect(getBotProfile(sock).tier).toBe('premium');
        await service.closeSession(NUMBER);
    });
});

describe('maintenance', () => {
    test('reminds once before premium ends, then downgrades to free', async () => {
        const transport = fakeTransport();
        const service = makeService(transport);
        await pairWithCode(service, transport);
        await jadibotRepo.update(
            { number: NUMBER },
            { status: 'active', tier: 'premium', premiumUntil: clock + 2 * DAY }
        );
        service.setLiveTier(NUMBER, 'premium');

        await service.runMaintenance();
        await service.runMaintenance();
        expect(notices().filter(([, t]) => /berakhir/.test(t))).toHaveLength(1);

        clock += 3 * DAY;
        await service.runMaintenance();
        expect((await jadibotRepo.findByNumber(NUMBER)).tier).toBe('free');
        expect(getBotProfile(transport.created[0].client).tier).toBe('free');
        expect(notices().at(-1)[1]).toMatch(/tetap jalan sebagai \*Free\*/);
        await service.closeSession(NUMBER);
    });

    test('stops free sub-bots idle for 7 days, not active ones', async () => {
        const service = makeService(fakeTransport());
        await jadibotRepo.create({
            number: '628000000005',
            ownerJid: 'idle@s.whatsapp.net',
            status: 'active',
            lastActiveAt: clock - 8 * DAY,
        });
        await jadibotRepo.create({
            number: '628000000006',
            status: 'active',
            lastActiveAt: clock - DAY,
        });

        await service.runMaintenance();

        expect((await jadibotRepo.findByNumber('628000000005')).status).toBe('stopped');
        expect((await jadibotRepo.findByNumber('628000000006')).status).toBe('active');
        expect(notices()).toEqual([['idle@s.whatsapp.net', expect.stringMatching(/7 hari/)]]);
    });

    test('activity is written at most once an hour', async () => {
        const transport = fakeTransport();
        const service = makeService(transport);
        await pairWithCode(service, transport);
        const spy = jest.spyOn(jadibotRepo, 'update');

        service.recordActivity(NUMBER);
        service.recordActivity(NUMBER);
        clock += JADIBOT.ACTIVITY_WRITE_MS;
        service.recordActivity(NUMBER);
        await flush();

        expect(spy.mock.calls.filter(([, p]) => 'lastActiveAt' in p)).toHaveLength(2);
        spy.mockRestore();
        await service.closeSession(NUMBER);
    });
});
