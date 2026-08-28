import crypto from 'node:crypto';
import { query, withTransaction } from '../database/pool.js';
import { classifyIdentity, identityCandidates } from './normalize.js';

export const resolveIdentity = async (value, { includePasswordHash = false } = {}) => {
    const candidates = identityCandidates(value);
    const tuples = candidates.map(() => '(?, ?)').join(', ');
    const params = candidates.flatMap((item) => [item.type, item.normalizedValue]);

    // Cari user lewat salah satu candidate identity.
    const users = await query(
        `SELECT u.*
         FROM users u
         JOIN user_identities matched ON matched.user_id = u.id
         WHERE (matched.type, matched.normalized_value) IN (${tuples})
         LIMIT 1`,
        params
    );
    const user = users[0];
    if (!user) return null;

    const identities = await query(
        `SELECT type, normalized_value AS value, is_primary
         FROM user_identities
         WHERE user_id = ?
         ORDER BY created_at ASC`,
        [user.id]
    );
    const publicUser = {
        ...user,
        identities: identities.map((row) => ({
            type: row.type,
            value: row.value,
            isPrimary: Boolean(row.is_primary),
        })),
    };
    if (!includePasswordHash) delete publicUser.password_hash;
    return publicUser;
};

export const attachIdentity = async ({ userId, value, isPrimary = false, verified = false }) => {
    const identity = classifyIdentity(value);
    const trimmed = String(value).trim();

    return withTransaction(async (tx) => {
        // Upsert dulu supaya duplikat lintas user tidak menghapus primary lama.
        await tx(
            `INSERT INTO user_identities
                (id, user_id, type, value, normalized_value, is_primary, verified_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                verified_at = COALESCE(verified_at, VALUES(verified_at))`,
            [
                crypto.randomUUID(),
                userId,
                identity.type,
                trimmed,
                identity.normalizedValue,
                0,
                verified ? new Date() : null,
            ]
        );

        // Ambil row aktual (bisa milik user lain bila duplikat).
        const rows = await tx(
            `SELECT * FROM user_identities
             WHERE type = ? AND normalized_value = ?
             LIMIT 1`,
            [identity.type, identity.normalizedValue]
        );
        const stored = rows[0];
        if (!stored) throw new Error('Identity upsert did not persist');

        if (stored.user_id !== userId) {
            const error = new Error('Identity already belongs to another user');
            error.status = 409;
            throw error;
        }

        if (isPrimary) {
            await tx('UPDATE user_identities SET is_primary = 0 WHERE user_id = ?', [userId]);
            await tx('UPDATE user_identities SET is_primary = 1 WHERE id = ?', [stored.id]);
        }

        const [final] = await tx('SELECT * FROM user_identities WHERE id = ? LIMIT 1', [
            stored.id,
        ]);

        return {
            id: final.id,
            userId: final.user_id,
            type: final.type,
            value: final.value,
            normalizedValue: final.normalized_value,
            isPrimary: Number(final.is_primary),
            verifiedAt: final.verified_at,
        };
    });
};

export const createUser = async ({ displayName = '', role = 'user' }) => {
    const id = crypto.randomUUID();
    await query(
        'INSERT INTO users (id, display_name, role, status) VALUES (?, ?, ?, ?)',
        [id, displayName, role, 'active']
    );
    return { id, display_name: displayName, role, status: 'active' };
};

export const getOrCreateByIdentity = async ({ value, displayName = '', role = 'user' }) => {
    const existing = await resolveIdentity(value);
    if (existing) return existing;
    const user = await createUser({ displayName, role });
    await attachIdentity({ userId: user.id, value, isPrimary: true, verified: true });
    return resolveIdentity(value);
};
