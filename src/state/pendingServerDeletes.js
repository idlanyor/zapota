/**
 * Owner's pending `.delsrv` confirmations, keyed by sender JID.
 * An entry expires on its own after `ttlMs` (default 30s).
 */
const pending = new Map();

export const pendingServerDeletes = {
    /** @param {string} sender @param {{ pteroId: string|number, force: boolean }} data */
    add(sender, data, ttlMs = 30_000) {
        this.take(sender);
        const timeout = setTimeout(() => pending.delete(sender), ttlMs);
        timeout.unref?.();
        pending.set(sender, { ...data, timeout });
    },
    has: (sender) => pending.has(sender),
    get: (sender) => pending.get(sender) || null,
    /** Remove and return the entry (cancels its expiry). */
    take(sender) {
        const entry = pending.get(sender);
        if (!entry) return null;
        clearTimeout(entry.timeout);
        pending.delete(sender);
        return entry;
    },
    clearAll() {
        for (const sender of [...pending.keys()]) this.take(sender);
    },
};
