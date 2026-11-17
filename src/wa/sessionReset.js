import fs from 'node:fs/promises';
import path from 'node:path';

const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');

const exists = async (p) => {
    try {
        await fs.access(p);
        return true;
    } catch {
        return false;
    }
};

/**
 * Move a logged-out session's credentials aside (never deletes them), so
 * the next connect starts a fresh login (pairing code / QR).
 *   - zapo:    the SQLite store file plus its -wal/-shm siblings
 *   - baileys: the auth folder
 *
 * @param {{ transport?: string, storePath?: string, authFolder?: string, close?: Function }} t
 * @returns {Promise<string | null>} backup directory, or null if nothing was moved
 */
export const archiveCredentials = async (
    t,
    { backupRoot = 'data/backups', now = new Date() } = {}
) => {
    try {
        await t.close?.();
    } catch {
        // already closed
    }

    const sources =
        t.transport === 'zapo' && t.storePath
            ? [t.storePath, `${t.storePath}-wal`, `${t.storePath}-shm`]
            : t.authFolder
              ? [t.authFolder]
              : [];
    const present = [];
    for (const s of sources) if (await exists(s)) present.push(s);
    if (!present.length) return null;

    const dir = path.join(backupRoot, `${t.transport || 'wa'}-auth-loggedout-${stamp(now)}`);
    await fs.mkdir(dir, { recursive: true });
    for (const s of present) await fs.rename(s, path.join(dir, path.basename(s)));
    return dir;
};

/**
 * Allow at most `max` attempts per `windowMs`. Guards against a logout →
 * re-login → logout storm hammering WhatsApp.
 */
export const createAttemptGuard = ({ max = 3, windowMs = 10 * 60_000, clock = Date.now } = {}) => {
    let attempts = [];
    return () => {
        const now = clock();
        attempts = attempts.filter((t) => now - t < windowMs);
        if (attempts.length >= max) return false;
        attempts.push(now);
        return true;
    };
};
