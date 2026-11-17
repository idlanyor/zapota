import { getKnex } from '../knexInstance.js';
import { createCodec } from '../codec.js';

const TABLE = 'afk';
const codec = createCodec({ date: ['time', 'createdAt', 'updatedAt'] });

/**
 * @typedef {{ userId: string, userName: string, reason: string, time: Date }} AfkRecord
 */
export const afkRepo = {
    table: TABLE,
    codec,

    /** @returns {Promise<AfkRecord[]>} */
    async all() {
        const rows = await getKnex()(TABLE).select('userId', 'userName', 'reason', 'time');
        return rows.map((r) => codec.fromRow(r));
    },

    /** Create or replace the AFK status of a user. */
    async upsert({ userId, userName = '', reason = 'Tanpa alasan', time = new Date() }) {
        const now = Date.now();
        const row = codec.toRow({ userId, userName, reason, time, updatedAt: now });
        await getKnex()(TABLE)
            .insert({ ...row, createdAt: now })
            .onConflict('userId')
            .merge(['userName', 'reason', 'time', 'updatedAt']);
    },

    /** @returns {Promise<boolean>} whether a record was removed */
    async remove(userId) {
        return (await getKnex()(TABLE).where({ userId }).delete()) > 0;
    },
};
