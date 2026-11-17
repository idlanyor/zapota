import { getKnex } from '../knexInstance.js';

const columnCache = new Map();

/** Values of delta columns as last read from / written to the DB. */
const LOADED = Symbol('loadedDeltaValues');

/**
 * Small table repository over Knex. Records are plain objects (decoded by
 * `codec`); filters are plain equality objects (`{ jid, isPaid: false }`).
 * Anything more specific (ranges, OR) belongs in a named method on the
 * table's own repo, written with Knex directly.
 *
 * @param {object} opts
 * @param {string} opts.table
 * @param {ReturnType<import('../codec.js').createCodec>} opts.codec
 * @param {boolean} [opts.timestamps]   maintain createdAt/updatedAt (epoch ms)
 * @param {() => object} [opts.createDefaults]  values for new rows not covered by DB defaults
 * @param {string} [opts.key]  column `save()` uses to locate the row (default `id`)
 * @param {string[]} [opts.deltaColumns]  numeric columns that `save()` persists as
 *   `col = col + (current - loaded)` instead of overwriting, so concurrent
 *   read-modify-save code (e.g. two commands changing a balance) cannot lose
 *   each other's updates
 */
export const createRepo = ({
    table,
    codec,
    timestamps = false,
    createDefaults = () => ({}),
    key = 'id',
    deltaColumns = [],
}) => {
    const db = (k = getKnex()) => k(table);
    const remember = (record) => {
        if (record && deltaColumns.length) {
            Object.defineProperty(record, LOADED, {
                value: Object.fromEntries(deltaColumns.map((c) => [c, record[c]])),
                enumerable: false,
                configurable: true,
                writable: true,
            });
        }
        return record;
    };
    const decode = (row) => remember(codec.fromRow(row));
    const encodeFilter = (filter = {}) => codec.toRow(filter);
    const stamp = (data, isCreate) => {
        if (!timestamps) return data;
        const now = Date.now();
        return isCreate ? { createdAt: now, updatedAt: now, ...data } : { ...data, updatedAt: now };
    };

    /** Real column names (cached per Knex instance), so `save()` ignores ad-hoc props. */
    const columns = async () => {
        const knex = getKnex();
        let byTable = columnCache.get(knex);
        if (!byTable) columnCache.set(knex, (byTable = new Map()));
        if (!byTable.has(table)) byTable.set(table, Object.keys(await knex(table).columnInfo()));
        return byTable.get(table);
    };

    const repo = {
        table,
        codec,

        /** Raw Knex query builder for this table (for named methods in table repos). */
        query: db,

        async findOne(filter) {
            return decode(await db().where(encodeFilter(filter)).first());
        },

        async find(filter = {}, { orderBy, limit } = {}) {
            let q = db().where(encodeFilter(filter));
            if (orderBy) q = q.orderBy(orderBy);
            if (limit) q = q.limit(limit);
            return (await q).map(decode);
        },

        async count(filter = {}) {
            const [{ n }] = await db().where(encodeFilter(filter)).count({ n: '*' });
            return Number(n);
        },

        async create(data = {}) {
            const row = codec.toRow(stamp({ ...createDefaults(), ...data }, true));
            const [id] = await db().insert(row);
            return decode(await db().where({ id }).first());
        },

        /** Update every row matching `filter`; returns the number of rows changed. */
        async update(filter, patch) {
            return db()
                .where(encodeFilter(filter))
                .update(codec.toRow(stamp(patch, false)));
        },

        /** Update the first row matching `filter` and return it (null if none). */
        async updateOne(filter, patch) {
            const row = await db().where(encodeFilter(filter)).first('id');
            if (!row) return null;
            await db()
                .where({ id: row.id })
                .update(codec.toRow(stamp(patch, false)));
            return decode(await db().where({ id: row.id }).first());
        },

        /** Update the matching row, or create it from `filter` + `patch`. */
        async upsert(filter, patch) {
            return (await repo.updateOne(filter, patch)) ?? repo.create({ ...filter, ...patch });
        },

        async findOrCreate(filter, defaults = {}) {
            return (await repo.findOne(filter)) ?? repo.create({ ...filter, ...defaults });
        },

        /** Persist all column values of a record previously read from this repo. */
        async save(record) {
            if (record?.[key] === undefined || record?.[key] === null) {
                throw new Error(`${table}.save(): record has no ${key}`);
            }
            const cols = await columns();
            const loaded = record[LOADED];
            const patch = {};
            const deltas = [];
            for (const c of cols) {
                if (c === 'id' || c === 'createdAt' || c === key) continue;
                if (record[c] === undefined) continue;
                if (loaded && deltaColumns.includes(c)) {
                    const delta = Number(record[c]) - Number(loaded[c] ?? 0);
                    if (delta) deltas.push([c, delta]);
                    continue;
                }
                patch[c] = record[c];
            }
            const row = codec.toRow(stamp(patch, false));
            for (const [c, delta] of deltas) row[c] = getKnex().raw('?? + ?', [c, delta]);
            if (Object.keys(row).length) {
                await db()
                    .where({ [key]: record[key] })
                    .update(row);
            }
            if (deltas.length) {
                // Reflect the real stored values (other writers may have changed them).
                const fresh = await db()
                    .where({ [key]: record[key] })
                    .first(deltas.map(([c]) => c));
                if (fresh) Object.assign(record, fresh);
            }
            return remember(record);
        },

        /** Delete rows matching `filter`; returns the number removed. */
        async remove(filter) {
            return db().where(encodeFilter(filter)).delete();
        },
    };
    return repo;
};
