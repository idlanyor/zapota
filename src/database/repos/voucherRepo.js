import { getKnex } from '../knexInstance.js';
import { createCodec } from '../codec.js';

const TABLE = 'vouchers';
const codec = createCodec({
    json: ['usedBy'],
    bool: ['isPublic'],
    date: ['expiredAt', 'createdAt', 'updatedAt'],
});

export const voucherRepo = {
    async create({ code, value, quota = 1, isPublic = false, expiredAt = null }) {
        const now = Date.now();
        await getKnex()(TABLE).insert(
            codec.toRow({
                code,
                value,
                quota,
                usedBy: [],
                isPublic,
                expiredAt,
                createdAt: now,
                updatedAt: now,
            })
        );
    },

    async findByCode(code) {
        return codec.fromRow(await getKnex()(TABLE).where({ code }).first());
    },

    /**
     * Atomically redeem `code` for `jid`: checks quota and prior use,
     * decrements quota, records the user and credits their balance in one
     * transaction, so concurrent claims cannot exceed the quota or double-pay.
     * The user row must already exist.
     *
     * @returns {Promise<
     *   | { ok: true, value: number, balance: number }
     *   | { ok: false, reason: 'invalid' | 'exhausted' | 'already-claimed' | 'no-user' }>}
     */
    async redeem(code, jid) {
        return getKnex().transaction(async (trx) => {
            const row = await trx(TABLE).where({ code }).first();
            if (!row) return { ok: false, reason: 'invalid' };
            const voucher = codec.fromRow(row);
            if (voucher.quota <= 0) return { ok: false, reason: 'exhausted' };
            if (voucher.usedBy.includes(jid)) return { ok: false, reason: 'already-claimed' };

            const credited = await trx('users').where({ jid }).increment('balance', voucher.value);
            if (!credited) return { ok: false, reason: 'no-user' };

            await trx(TABLE)
                .where({ id: row.id })
                .update(
                    codec.toRow({
                        quota: voucher.quota - 1,
                        usedBy: [...voucher.usedBy, jid],
                        updatedAt: Date.now(),
                    })
                );

            const { balance } = await trx('users').where({ jid }).first('balance');
            return { ok: true, value: voucher.value, balance };
        });
    },
};
