import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { jest } from '@jest/globals';
import { archiveCredentials, createAttemptGuard } from '../src/wa/sessionReset.js';

let dir;
beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-reset-'));
});
afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

const now = new Date('2026-11-17T14:28:58Z');

describe('archiveCredentials', () => {
    test('zapo: closes the client, then moves the store and its WAL/SHM files', async () => {
        const store = path.join(dir, 'zapo-auth.sqlite');
        for (const f of [store, `${store}-wal`, `${store}-shm`]) await fs.writeFile(f, 'x');
        const close = jest.fn(async () => {});

        const backup = await archiveCredentials(
            { transport: 'zapo', storePath: store, close },
            { backupRoot: path.join(dir, 'backups'), now }
        );

        expect(close).toHaveBeenCalled();
        expect(backup).toBe(path.join(dir, 'backups', 'zapo-auth-loggedout-20261117-142858'));
        expect((await fs.readdir(backup)).sort()).toEqual([
            'zapo-auth.sqlite',
            'zapo-auth.sqlite-shm',
            'zapo-auth.sqlite-wal',
        ]);
        await expect(fs.access(store)).rejects.toThrow();
    });

    test('baileys: moves the auth folder', async () => {
        const auth = path.join(dir, 'auth_info_baileys');
        await fs.mkdir(auth);
        await fs.writeFile(path.join(auth, 'creds.json'), '{}');

        const backup = await archiveCredentials(
            { transport: 'baileys', authFolder: auth },
            { backupRoot: path.join(dir, 'b'), now }
        );
        expect(await fs.readdir(path.join(backup, 'auth_info_baileys'))).toEqual(['creds.json']);
    });

    test('returns null when there is nothing to move, and tolerates close() failing', async () => {
        const close = jest.fn(async () => {
            throw new Error('already closed');
        });
        expect(
            await archiveCredentials({
                transport: 'zapo',
                storePath: path.join(dir, 'none.sqlite'),
                close,
            })
        ).toBeNull();
    });
});

describe('createAttemptGuard', () => {
    test('allows `max` attempts per window', () => {
        let t = 0;
        const allow = createAttemptGuard({ max: 3, windowMs: 1000, clock: () => t });
        expect([allow(), allow(), allow(), allow()]).toEqual([true, true, true, false]);
        t = 1001;
        expect(allow()).toBe(true);
    });
});
