import { getKnex } from '../knexInstance.js';
import { createCodec } from '../codec.js';
import { createRepo } from './createRepo.js';

const TABLE = 'jadibots';
const codec = createCodec({
    date: ['premiumUntil', 'reminderSentAt', 'lastActiveAt', 'createdAt', 'updatedAt'],
});

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @typedef {object} JadibotRecord
 * @property {number} id
 * @property {string} number
 * @property {string | null} ownerJid
 * @property {'free'|'premium'} tier
 * @property {'pending'|'active'|'stopped'} status
 * @property {Date | null} premiumUntil
 * @property {Date | null} reminderSentAt
 * @property {Date | null} lastActiveAt
 */

const base = createRepo({ table: TABLE, codec, timestamps: true });

export const jadibotRepo = {
    ...base,

    /** @returns {Promise<JadibotRecord | null>} */
    findByNumber: (number) => base.findOne({ number }),

    /** Rows whose session should be running (resumed at startup). */
    findActive: () => base.find({ status: 'active' }),

    /** Sessions that take a slot: pending pairings and running free sub-bots. */
    async countFreeSlotsUsed() {
        const [{ n }] = await getKnex()(TABLE)
            .whereIn('status', ['pending', 'active'])
            .andWhere('tier', 'free')
            .count({ n: '*' });
        return Number(n);
    },

    /** Premium sub-bots whose paid period has ended at `now`. */
    async findExpiredPremium(now = Date.now()) {
        const rows = await getKnex()(TABLE)
            .where({ tier: 'premium' })
            .andWhere('premiumUntil', '<=', now);
        return rows.map((r) => codec.fromRow(r));
    },

    /** Premium sub-bots ending within `withinMs` that were not reminded yet. */
    async findPremiumDueForReminder(withinMs, now = Date.now()) {
        const rows = await getKnex()(TABLE)
            .where({ tier: 'premium' })
            .andWhere('premiumUntil', '>', now)
            .andWhere('premiumUntil', '<=', now + withinMs)
            .whereNull('reminderSentAt');
        return rows.map((r) => codec.fromRow(r));
    },

    /** Running free sub-bots with no activity since `before` (ms epoch). */
    async findIdleFree(before) {
        const rows = await getKnex()(TABLE)
            .where({ tier: 'free', status: 'active' })
            .andWhere((q) =>
                q
                    .where('lastActiveAt', '<', before)
                    .orWhere((q2) =>
                        q2.whereNull('lastActiveAt').andWhere('updatedAt', '<', before)
                    )
            );
        return rows.map((r) => codec.fromRow(r));
    },

    /**
     * Charge `price` from `payerJid`'s balance and extend the sub-bot's premium
     * by `days` (from its current end date if still running, otherwise from
     * now) in one transaction. Nothing changes when the balance is too low.
     *
     * @returns {Promise<{ ok: false, reason: 'balance' | 'missing', balance: number }
     *   | { ok: true, premiumUntil: Date, balance: number }>}
     */
    async purchasePremium({ number, payerJid, price, days, now = Date.now() }) {
        return getKnex().transaction(async (trx) => {
            const bot = await trx(TABLE).where({ number }).first();
            const balanceOf = async () =>
                Number(
                    (await trx('users').where({ jid: payerJid }).first('balance'))?.balance ?? 0
                );
            if (!bot) return { ok: false, reason: 'missing', balance: await balanceOf() };

            const charged = await trx('users')
                .where({ jid: payerJid })
                .andWhere('balance', '>=', price)
                .decrement('balance', price);
            if (!charged) return { ok: false, reason: 'balance', balance: await balanceOf() };

            const current = codec.fromRow(bot).premiumUntil?.getTime() ?? 0;
            const premiumUntil = new Date(Math.max(now, current) + days * DAY_MS);
            await trx(TABLE)
                .where({ number })
                .update(
                    codec.toRow({
                        tier: 'premium',
                        premiumUntil,
                        reminderSentAt: null,
                        updatedAt: now,
                    })
                );
            return { ok: true, premiumUntil, balance: await balanceOf() };
        });
    },
};
