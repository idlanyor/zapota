import fs from 'node:fs';
import { jest } from '@jest/globals';
import { env, ENV_SPEC, validateEnv, assertEnv } from '../src/config/env.js';
import { settings } from '../src/config/settings.js';
import { createLiveSocket } from '../src/lib/liveSocket.js';
import { pendingServerDeletes } from '../src/state/pendingServerDeletes.js';

const VALID = { OWNER_NUMBER: '628111222333' };

describe('env', () => {
    test('reads declared variables live from process.env', () => {
        const before = process.env.BOT_NAME;
        process.env.BOT_NAME = 'LiveName';
        expect(env.BOT_NAME).toBe('LiveName');
        process.env.BOT_NAME = 'Changed';
        expect(env.BOT_NAME).toBe('Changed');
        if (before === undefined) delete process.env.BOT_NAME;
        else process.env.BOT_NAME = before;
    });

    test('throws on undeclared variables (typos) and is read-only', () => {
        expect(() => env.BOT_NAEM).toThrow('env.BOT_NAEM is not declared');
        expect(() => {
            env.BOT_NAME = 'x';
        }).toThrow(TypeError);
    });

    test('ignores non-env property lookups (inspection, symbols)', () => {
        expect(env.toJSON).toBeUndefined();
        expect(env[Symbol.toStringTag]).toBeUndefined();
    });

    test('every declared variable is documented in .env.example', () => {
        const example = fs.readFileSync('.env.example', 'utf8');
        const documented = new Set(
            example
                .split('\n')
                .map((l) => l.match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
                .filter(Boolean)
        );
        expect(Object.keys(ENV_SPEC).filter((k) => !documented.has(k))).toEqual([]);
    });
});

describe('validateEnv', () => {
    test('OWNER_NUMBER is required', () => {
        expect(validateEnv({}).errors).toEqual([
            expect.stringContaining('OWNER_NUMBER is required'),
        ]);
        expect(validateEnv(VALID).errors).toEqual([]);
    });

    test('core format problems are fatal', () => {
        const { errors } = validateEnv({
            ...VALID,
            WA_TRANSPORT: 'zappo',
            BOT_WEBHOOK_PORT: '99999',
            OWNER_LID: 'abc',
            BOT_PHONE_NUMBER: '12',
        });
        expect(errors).toHaveLength(4);
        expect(errors.join('\n')).toMatch(
            /WA_TRANSPORT must be one of zapo, baileys \(got "zappo"\)/
        );
    });

    test('feature-level problems are warnings, and secrets are never echoed', () => {
        const { errors, warnings } = validateEnv({
            ...VALID,
            PTERO_URL: 'not a url',
            PTERO_API_KEY: 'super-secret',
            DS_API_KEY: 'only-key',
        });
        expect(errors).toEqual([]);
        expect(warnings).toEqual(
            expect.arrayContaining([
                expect.stringContaining('PTERO_URL must be an http(s) URL (got "not a url")'),
                'deepseek is partially configured; missing DS_BASE_URL',
            ])
        );
        expect(warnings.join('\n')).not.toContain('super-secret');
        expect(warnings.join('\n')).not.toContain('only-key');
    });

    test('reports feature status', () => {
        const { features } = validateEnv({ ...VALID, GEMINI_API_KEY: 'k' });
        expect(features.gemini).toBe('on');
        expect(features.pterodactyl).toBe('off');
    });

    test('assertEnv logs and throws on fatal problems', () => {
        const log = { info: jest.fn(), warn: jest.fn() };
        expect(() => assertEnv(log, {})).toThrow(/Invalid environment:\n {2}- OWNER_NUMBER/);
        expect(() => assertEnv(log, VALID)).not.toThrow();
        expect(log.info).toHaveBeenCalledWith(expect.stringContaining('[env] features on'));
    });
});

describe('settings', () => {
    const keys = ['OWNER_NUMBER', 'OWNER_LID', 'WA_TRANSPORT', 'BOT_PHONE_NUMBER', 'OWNER_NAME'];
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    afterEach(() => {
        for (const [k, v] of Object.entries(saved)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
    });

    test('normalizes owner identifiers to JIDs', () => {
        process.env.OWNER_NUMBER = '628111222333';
        process.env.OWNER_LID = '4455';
        expect(settings.ownerNumber).toBe('628111222333@s.whatsapp.net');
        expect(settings.ownerLid).toBe('4455@lid');

        process.env.OWNER_NUMBER = '628111222333@s.whatsapp.net';
        delete process.env.OWNER_LID;
        expect(settings.ownerNumber).toBe('628111222333@s.whatsapp.net');
        expect(settings.ownerLid).toBeUndefined();
    });

    test('has no hardcoded personal defaults', () => {
        delete process.env.OWNER_NUMBER;
        delete process.env.OWNER_LID;
        delete process.env.OWNER_NAME;
        expect(settings.ownerNumber).toBeUndefined();
        expect(settings.ownerLid).toBeUndefined();
        expect(settings.ownerName).toBe('Owner');
    });

    test('reflects .env reloads without restart', () => {
        process.env.WA_TRANSPORT = 'zapo';
        expect(settings.transport).toBe('zapo');
        process.env.WA_TRANSPORT = 'something-else';
        expect(settings.transport).toBe('baileys');
        process.env.BOT_PHONE_NUMBER = '+62 800-0000-001';
        expect(settings.pairingNumber).toBe('628000000001');
    });
});

describe('createLiveSocket', () => {
    test('forwards to the current socket, bound, across reconnects', () => {
        let current = {
            id: 1,
            send(x) {
                return `${this.id}:${x}`;
            },
        };
        const live = createLiveSocket(() => current);
        const send = live.send;
        expect(send('a')).toBe('1:a');

        current = {
            id: 2,
            send(x) {
                return `${this.id}:${x}`;
            },
        };
        expect(live.send('b')).toBe('2:b');
        expect(live.id).toBe(2);
    });

    test('throws a clear error while disconnected', () => {
        const live = createLiveSocket(() => null);
        expect(() => live.sendMessage).toThrow('WhatsApp socket is not connected');
    });
});

describe('pendingServerDeletes', () => {
    afterEach(() => pendingServerDeletes.clearAll());

    test('add / has / take', () => {
        pendingServerDeletes.add('a@s', { pteroId: 7, force: true });
        expect(pendingServerDeletes.has('a@s')).toBe(true);
        expect(pendingServerDeletes.take('a@s')).toMatchObject({ pteroId: 7, force: true });
        expect(pendingServerDeletes.has('a@s')).toBe(false);
        expect(pendingServerDeletes.take('a@s')).toBeNull();
    });

    test('entries expire', () => {
        jest.useFakeTimers();
        pendingServerDeletes.add('a@s', { pteroId: 1, force: false }, 1000);
        jest.advanceTimersByTime(999);
        expect(pendingServerDeletes.has('a@s')).toBe(true);
        jest.advanceTimersByTime(1);
        expect(pendingServerDeletes.has('a@s')).toBe(false);
        jest.useRealTimers();
    });
});
