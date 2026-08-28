import bcrypt from 'bcryptjs';
import { query } from '../database/pool.js';
import { resolveIdentity } from '../identity/service.js';

export const hashPassword = (password) => bcrypt.hash(password, 10);

export const verifyPassword = (password, hash) => {
    if (!hash) return false;
    return bcrypt.compare(password, hash);
};

// username dapat berupa phone, JID, atau LID -> resolve ke user.
export const findUserByLogin = async (username) => {
    if (!username) return null;
    try {
        return await resolveIdentity(String(username), { includePasswordHash: true });
    } catch {
        return null;
    }
};

export const setUserPassword = async ({ userId, password, webEnabled = true }) => {
    const hash = await hashPassword(password);
    const result = await query(
        'UPDATE users SET password_hash = ?, web_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [hash, webEnabled ? 1 : 0, userId]
    );
    return { ok: result.affectedRows > 0 };
};

export const checkWebAccess = (user) => Boolean(user?.web_enabled) && Boolean(user?.password_hash);
