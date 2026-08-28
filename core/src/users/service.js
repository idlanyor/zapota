import { query } from '../database/pool.js';
import { resolveIdentity } from '../identity/service.js';

export const listUsers = async ({ page = 1, limit = 20, search = '' } = {}) => {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safePage = Math.max(Number(page) || 1, 1);
    const offset = (safePage - 1) * safeLimit;

    let where = '';
    const params = [];
    if (search) {
        where = 'WHERE u.display_name LIKE ? OR u.id LIKE ? OR EXISTS (SELECT 1 FROM user_identities ui WHERE ui.user_id = u.id AND ui.normalized_value LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const rows = await query(
        `SELECT u.* FROM users u ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
        [...params, safeLimit, offset]
    );
    const countRows = await query(`SELECT COUNT(*) AS total FROM users u ${where}`, params);
    const total = Number(countRows[0].total) || 0;

    // Lampirkan identities (jid/phone/lid) per user untuk tampilan web.
    const users = await Promise.all(
        rows.map(async (user) => {
            const identities = await query(
                'SELECT type, value, normalized_value, is_primary FROM user_identities WHERE user_id = ?',
                [user.id]
            );
            const { password_hash, ...safe } = user;
            return {
                ...safe,
                identities,
                jid: identities.find((i) => i.type === 'whatsapp_jid')?.normalized_value || null,
                phoneNumber: identities.find((i) => i.type === 'phone')?.normalized_value || null,
                lid: identities.find((i) => i.type === 'whatsapp_lid')?.normalized_value || null,
            };
        })
    );

    return {
        users,
        total,
        page: safePage,
        totalPages: Math.ceil(total / safeLimit),
    };
};

export const getUserById = async (id) => {
    const rows = await query('SELECT * FROM users WHERE id = ?', [id]);
    const user = rows[0];
    if (!user) return null;
    const { password_hash, ...safe } = user;
    return safe;
};

export const updateUser = async (id, fields) => {
    const allowed = ['display_name', 'role', 'status', 'balance'];
    const entries = Object.entries(fields).filter(([key]) => allowed.includes(key));
    if (entries.length === 0) return null;

    const setClause = entries.map(([key]) => `${key} = ?`).join(', ');
    await query(`UPDATE users SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [
        ...entries.map(([, value]) => value),
        id,
    ]);
    return getUserById(id);
};
