import { createCodec } from '../codec.js';
import { createRepo } from './createRepo.js';

const base = createRepo({
    table: 'servers',
    codec: createCodec({
        date: ['expiredAt', 'lastAutoRenewAt', 'suspendedAt', 'createdAt', 'updatedAt'],
        bool: ['autoRenewEnabled'],
    }),
    timestamps: true,
});

const toMs = (d) => base.codec.toRow({ expiredAt: d }).expiredAt;

export const serverRepo = {
    ...base,

    /** Look up by Pterodactyl numeric id or short identifier. */
    async findByPteroIdOrIdentifier(id) {
        const row = await base
            .query()
            .where((q) => q.where({ pteroId: id }).orWhere({ identifier: id }))
            .first();
        return base.codec.fromRow(row);
    },

    /** Servers whose expiredAt is before `date` (plus optional equality filter). */
    async findExpiredBefore(date, filter = {}) {
        const rows = await base
            .query()
            .where(base.codec.toRow(filter))
            .where('expiredAt', '<', toMs(date));
        return rows.map((r) => base.codec.fromRow(r));
    },

    /** Servers whose expiredAt is within [from, to] (plus optional equality filter). */
    async findExpiringBetween(from, to, filter = {}) {
        const rows = await base
            .query()
            .where(base.codec.toRow(filter))
            .whereBetween('expiredAt', [toMs(from), toMs(to)]);
        return rows.map((r) => base.codec.fromRow(r));
    },
};
