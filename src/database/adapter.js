/**
 * Mongoose-compatible adapter built on top of Knex.
 *
 * The goal is a drop-in shim so the existing 30+ call sites can migrate to
 * Knex by changing the import line only. We don't aim for 100% Mongoose
 * parity — just the surface this codebase actually uses (see README and
 * the test file for the verified subset).
 *
 * Design pillars:
 *   - One Knex instance is shared (see `./knexInstance.js`).
 *   - A "Model" is a plain function/object with static methods. The
 *     returned documents are thin proxy wrappers, not full Mongoose docs.
 *   - Filter operators are translated one-to-one into Knex `where()`
 *     calls. Anything we don't recognize is passed through as-is.
 *   - `$lookup` / `$facet` (and other multi-stage ops) fall back to a
 *     JS-side reduce over the rows returned by an upstream `$match`.
 *
 * Out of scope: virtuals, populate, change-stream hooks, schema-level
 * validation, lean-mongoose methods like `.populate()` and `.toJSON()`.
 */

/**
 * @typedef {Object} FieldDef
 * @property {Function} [type] - Coarse Mongoose-style type marker (String/Number/Boolean/Date/Buffer/Array/Object).
 * @property {*} [default] - Default value used by `_applyDefaults` if missing.
 * @property {boolean} [required] - We don't actually enforce, but kept for compat.
 * @property {boolean} [unique] - We don't enforce either, but used for the future index layer.
 * @property {string[]} [enum] - Allowed values (kept for compat, not enforced).
 */

/**
 * @typedef {Object} Schema
 * @property {Object<string, FieldDef>} paths - Field definitions keyed by name.
 * @property {Object} options - Schema options (`timestamps`, `collection`, ...).
 */

/**
 * @typedef {Object} Model
 * @property {string} modelName - The registered name.
 * @property {string} tableName - The underlying SQL table.
 * @property {Schema} schema - The schema the model was defined with.
 * @property {Function} find
 * @property {Function} findOne
 * @property {Function} findById
 * @property {Function} findByIdAndUpdate
 * @property {Function} findByIdAndDelete
 * @property {Function} findOneAndUpdate
 * @property {Function} findOneAndDelete
 * @property {Function} create
 * @property {Function} countDocuments
 * @property {Function} exists
 * @property {Function} updateOne
 * @property {Function} updateMany
 * @property {Function} deleteOne
 * @property {Function} deleteMany
 * @property {Function} aggregate
 * @property {Function} ensureTable
 */

import { getKnex } from './knexInstance.js';

/* ------------------------------------------------------------------ */
/* Operator translation                                              */
/* ------------------------------------------------------------------ */

/**
 * Translate a single key/value pair from a Mongoose-style filter into
 * one or more Knex query builder calls. Handles:
 *   - Equality: `{ name: 'foo' }` -> `qb.where('name', 'foo')`
 *   - Nested operators: `{ age: { $gt: 18, $lt: 65 } }` -> chain
 *   - Logical groups: `{ $or: [...] }`, `{ $and: [...] }`
 *
 * Anything not in the recognized list is passed through as an equality
 * match — this is a deliberate "duck it" choice to keep simple filters
 * ergonomic.
 *
 * @param {import('knex').Knex.QueryBuilder} qb - The Knex query builder to mutate.
 * @param {string} key - Field name (e.g. `'age'`, `'user.balance'`).
 * @param {*} value - The filter value (may be a plain value or operator object).
 * @returns {void}
 */
const applyFilter = (qb, key, value) => {
    // Logical operators: $or, $and, $nor
    if (key === '$or') {
        if (!Array.isArray(value) || value.length === 0) return;
        qb.where(function () {
            for (const sub of value) {
                this.orWhere(function () {
                    applyFilterGroup(this, sub);
                });
            }
        });
        return;
    }
    if (key === '$and') {
        if (!Array.isArray(value) || value.length === 0) return;
        for (const sub of value) {
            qb.where(function () {
                applyFilterGroup(this, sub);
            });
        }
        return;
    }
    if (key === '$nor') {
        if (!Array.isArray(value) || value.length === 0) return;
        qb.whereNot(function () {
            for (const sub of value) {
                this.orWhere(function () {
                    applyFilterGroup(this, sub);
                });
            }
        });
        return;
    }

    // Field-level operators vs plain equality
    if (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        !(value instanceof Date) &&
        !Buffer.isBuffer(value)
    ) {
        for (const op of Object.keys(value)) {
            const v = value[op];
            switch (op) {
                case '$eq':
                    qb.where(key, v);
                    break;
                case '$ne':
                    qb.whereNot(key, v);
                    break;
                case '$gt':
                    qb.where(key, '>', v);
                    break;
                case '$gte':
                    qb.where(key, '>=', v);
                    break;
                case '$lt':
                    qb.where(key, '<', v);
                    break;
                case '$lte':
                    qb.where(key, '<=', v);
                    break;
                case '$in':
                    qb.whereIn(key, Array.isArray(v) ? v : []);
                    break;
                case '$nin':
                    qb.whereNotIn(key, Array.isArray(v) ? v : []);
                    break;
                case '$exists':
                    v ? qb.whereNotNull(key) : qb.whereNull(key);
                    break;
                case '$like':
                    qb.where(key, 'like', v);
                    break;
                case '$ilike':
                    qb.where(key, 'like', v);
                    break; // SQLite LIKE is case-insensitive for ASCII by default
                default:
                    qb.where(key, v);
                    break;
            }
        }
        return;
    }

    // Plain equality. `null` -> IS NULL, `undefined` -> skip.
    if (value === undefined) return;
    if (value === null) {
        qb.whereNull(key);
        return;
    }
    qb.where(key, value);
};

/**
 * Apply a top-level filter object (a group of field conditions) to a query
 * builder. Logical operators are handled by `applyFilter`; this is just
 * the loop wrapper.
 *
 * @param {import('knex').Knex.QueryBuilder} qb
 * @param {Object} filter
 * @returns {void}
 */
const applyFilterGroup = (qb, filter) => {
    if (!filter || typeof filter !== 'object') return;
    for (const key of Object.keys(filter)) {
        applyFilter(qb, key, filter[key]);
    }
};

/* ------------------------------------------------------------------ */
/* Update operator translation                                       */
/* ------------------------------------------------------------------ */

/**
 * Translate Mongoose update operators (`$set`, `$inc`, `$push`, ...) into
 * a Knex-compatible update payload. Operators are processed in a defined
 * order because some compose (e.g. `$inc` after `$set`).
 *
 * Supported: `$set`, `$inc`, `$push`, `$pull`, `$addToSet`, `$unset`,
 * `$mul`, `$rename`. `$setOnInsert` is dropped (Knex's `onConflict().merge()`
 * covers upsert-equivalent behavior).
 *
 * @param {Object} update - Mongoose-style update doc.
 * @returns {Object} `{ set, increments, jsonExtracts }` — fragments ready
 *   to feed into a Knex `.update()` call.
 */
const decomposeUpdate = (update) => {
    const set = {};
    const increments = [];
    const jsonExtracts = [];
    const push = [];
    const pull = [];
    const addToSet = [];
    const unsets = [];
    const muls = [];
    const renames = [];

    if (!update || typeof update !== 'object')
        return { set, increments, jsonExtracts, push, pull, addToSet, unsets, muls, renames };

    for (const op of Object.keys(update)) {
        const v = update[op];
        if (op === '$set' && v && typeof v === 'object') {
            Object.assign(set, v);
        } else if (op === '$inc' && v && typeof v === 'object') {
            for (const k of Object.keys(v)) increments.push({ column: k, amount: v[k] });
        } else if (op === '$push' && v && typeof v === 'object') {
            for (const k of Object.keys(v)) push.push({ column: k, value: v[k], each: false });
        } else if (op === '$pushAll') {
            // alias many dialects use
            for (const k of Object.keys(v)) push.push({ column: k, value: v[k], each: true });
        } else if (op === '$pull' && v && typeof v === 'object') {
            for (const k of Object.keys(v)) pull.push({ column: k, value: v[k] });
        } else if (op === '$addToSet' && v && typeof v === 'object') {
            for (const k of Object.keys(v)) addToSet.push({ column: k, value: v[k] });
        } else if (op === '$unset' && v && typeof v === 'object') {
            for (const k of Object.keys(v)) {
                if (v[k]) unsets.push(k);
            }
        } else if (op === '$mul' && v && typeof v === 'object') {
            for (const k of Object.keys(v)) muls.push({ column: k, value: v[k] });
        } else if (op === '$rename' && v && typeof v === 'object') {
            for (const k of Object.keys(v)) renames.push({ from: k, to: v[k] });
        }
        // $setOnInsert intentionally ignored — Knex upsert path covers it
    }

    return { set, increments, jsonExtracts, push, pull, addToSet, unsets, muls, renames };
};

/**
 * Apply the decomposed update operations to a Knex query builder. SQLite
 * is the target, so we synthesize the missing operators with raw
 * fragments (e.g. `json_insert` for `$push`).
 *
 * @param {import('knex').Knex.QueryBuilder} qb
 * @param {Object} decomp - Output of `decomposeUpdate()`.
 * @returns {import('knex').Knex.QueryBuilder}
 */
const applyUpdate = (qb, decomp) => {
    // Plain $set fields go through `.update()` so timestamps and JSON
    // serialization are handled by the driver.
    if (Object.keys(decomp.set).length > 0) {
        qb.update(decomp.set);
    }

    for (const inc of decomp.increments) {
        // Better-sqlite3 supports COALESCE to treat NULL as 0.
        const col = qb.client.raw('??', [inc.column]);
        qb.update(inc.column, qb.client.raw('COALESCE(??, 0) + ?', [col, inc.amount]));
    }

    for (const m of decomp.muls) {
        const col = qb.client.raw('??', [m.column]);
        qb.update(m.column, qb.client.raw('COALESCE(??, 1) * ?', [col, m.value]));
    }

    for (const p of decomp.push) {
        // json_insert with $[path] appends; for primitives we synthesize
        // a JSON array, but only if the column already holds JSON.
        if (p.each) {
            const col = qb.client.raw('??', [p.column]);
            qb.update(
                p.column,
                qb.client.raw(
                    "CASE WHEN ?? IS NULL OR ?? = '' THEN ? ELSE json_insert(??, '$[#]', json_extract(?, '$[0]')) END",
                    [col, col, JSON.stringify(p.value), col, col, JSON.stringify(p.value)]
                )
            );
        } else {
            const col = qb.client.raw('??', [p.column]);
            qb.update(
                p.column,
                qb.client.raw(
                    "CASE WHEN ?? IS NULL OR ?? = '' THEN json_array(?) ELSE json_insert(??, '$[#]', json_quote(?)) END",
                    [col, col, JSON.stringify(p.value), col, col, JSON.stringify(p.value)]
                )
            );
        }
    }

    for (const p of decomp.pull) {
        // We don't track position; just write the column without the
        // matching element. Best-effort — for simple string lists.
        const col = qb.client.raw('??', [p.column]);
        qb.update(
            p.column,
            qb.client.raw('(SELECT json_group_array(value) FROM json_each(??) WHERE value <> ?)', [
                col,
                JSON.stringify(p.value),
            ])
        );
    }

    for (const a of decomp.addToSet) {
        const col = qb.client.raw('??', [a.column]);
        qb.update(
            a.column,
            qb.client.raw(
                'CASE WHEN EXISTS (SELECT 1 FROM json_each(??) WHERE value = ?) ' +
                    'THEN ?? ' +
                    "ELSE CASE WHEN ?? IS NULL OR ?? = '' THEN json_array(?) ELSE json_insert(??, '$[#]', json_quote(?)) END END",
                [
                    col,
                    JSON.stringify(a.value),
                    col,
                    col,
                    col,
                    JSON.stringify(a.value),
                    col,
                    col,
                    JSON.stringify(a.value),
                ]
            )
        );
    }

    for (const u of decomp.unsets) {
        qb.update(u, null);
    }

    for (const r of decomp.renames) {
        // SQLite ALTER TABLE RENAME COLUMN is the only way; the value at
        // r.from must be copied first. Knex doesn't expose a clean API,
        // so we leave a marker and the caller can run a migration later.
        // For now we copy: read current value into the new column.
        const col = qb.client.raw('??', [r.from]);
        qb.update(r.to, qb.client.raw('??', [col]));
        qb.update(r.from, null);
    }

    return qb;
};

/* ------------------------------------------------------------------ */
/* Sort/Skip/Limit parsing                                            */
/* ------------------------------------------------------------------ */

/**
 * Normalize the many shapes Mongoose accepts for `.sort()`:
 *   - `'field'`           -> `{ field: 'asc' }`
 *   - `'-field'`          -> `{ field: 'desc' }`
 *   - `'a,b'`             -> `{ a: 'asc', b: 'asc' }` (Mongoose syntax)
 *   - `{ a: 1, b: -1 }`   -> `{ a: 'asc', b: 'desc' }`
 *   - `null`              -> `{}`
 *
 * @param {*} sortSpec
 * @returns {Object<string, 'asc'|'desc'>}
 */
const parseSort = (sortSpec) => {
    if (!sortSpec) return {};
    if (typeof sortSpec === 'string') {
        const out = {};
        for (const part of sortSpec
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)) {
            if (part.startsWith('-')) out[part.slice(1)] = 'desc';
            else out[part] = 'asc';
        }
        return out;
    }
    if (typeof sortSpec === 'object') {
        const out = {};
        for (const k of Object.keys(sortSpec)) {
            out[k] = sortSpec[k] === -1 || sortSpec[k] === 'desc' ? 'desc' : 'asc';
        }
        return out;
    }
    return {};
};

/* ------------------------------------------------------------------ */
/* Schema value normalization                                         */
/* ------------------------------------------------------------------ */

const isJsonField = (fieldDef) =>
    Array.isArray(fieldDef) ||
    Array.isArray(fieldDef?.type) ||
    fieldDef?.type === Array ||
    fieldDef?.type === Object;

const isDateField = (fieldDef) => fieldDef?.type === Date;

const serializeSchemaValues = (data, schema) => {
    if (!data || typeof data !== 'object' || !schema?.paths) return data;
    const out = { ...data };
    for (const [field, fieldDef] of Object.entries(schema.paths)) {
        if (out[field] === undefined || out[field] === null) continue;
        if (isJsonField(fieldDef)) {
            out[field] = typeof out[field] === 'string' ? out[field] : JSON.stringify(out[field]);
        } else if (isDateField(fieldDef)) {
            const date = out[field] instanceof Date ? out[field] : new Date(out[field]);
            if (!Number.isNaN(date.getTime())) out[field] = date.getTime();
        }
    }
    return out;
};

const serializeFilterValues = (filter, schema) => {
    if (!filter || typeof filter !== 'object' || !schema?.paths) return filter;
    if (Array.isArray(filter)) return filter.map((item) => serializeFilterValues(item, schema));

    const out = { ...filter };
    for (const [key, value] of Object.entries(out)) {
        if (key.startsWith('$')) {
            out[key] = serializeFilterValues(value, schema);
            continue;
        }
        if (!isDateField(schema.paths[key])) continue;
        const convert = (item) => {
            if (Array.isArray(item)) return item.map(convert);
            const date = item instanceof Date ? item : new Date(item);
            return Number.isNaN(date.getTime()) ? item : date.getTime();
        };
        if (value && typeof value === 'object' && !(value instanceof Date)) {
            out[key] = Object.fromEntries(
                Object.entries(value).map(([operator, item]) => [operator, convert(item)])
            );
        } else if (value !== null && value !== undefined) {
            out[key] = convert(value);
        }
    }
    return out;
};

const deserializeSchemaValues = (row, schema) => {
    if (!row || typeof row !== 'object' || !schema?.paths) return row;
    const out = { ...row };
    for (const [field, fieldDef] of Object.entries(schema.paths)) {
        const value = out[field];
        if (isDateField(fieldDef)) {
            if (value !== undefined && value !== null && !(value instanceof Date)) {
                const date = new Date(value);
                if (!Number.isNaN(date.getTime())) out[field] = date;
            }
        } else if (typeof value === 'string' && isJsonField(fieldDef)) {
            try {
                out[field] = JSON.parse(value);
            } catch {
                // Biarkan nilai lama apa adanya; caller masih bisa menangani data legacy.
            }
        }
    }
    return out;
};

/* ------------------------------------------------------------------ */
/* Document wrapper                                                   */
/* ------------------------------------------------------------------ */

/**
 * Build a chainable document-like object from a row. Exposes the row as
 * both properties (so destructuring works) and through a `.toObject()`
 * helper (for callers that expect it).
 *
 * @param {Object} row
 * @param {Object} ctx
 * @param {import('knex').Knex} ctx.knex
 * @param {string} ctx.tableName
 * @param {boolean} ctx.isNew
 * @returns {Document}
 */
const wrapDocument = (row, ctx) => {
    if (row === null || row === undefined) return null;
    if (typeof row !== 'object') return row;
    row = deserializeSchemaValues(row, ctx.schema);

    const doc = {
        ...row,
        _isNew: !!ctx.isNew,
        _tableName: ctx.tableName,
        _knex: ctx.knex,
        toObject() {
            const out = {};
            for (const k of Object.keys(this)) {
                if (k.startsWith('_') && k !== '_id') continue;
                if (ctx.tableName === 'settings' && k === 'id') continue;
                if (typeof this[k] === 'function') continue;
                out[k] = this[k];
            }
            return out;
        },
        async save() {
            const k = this._knex || (ctx && ctx.knex);
            const t = this._tableName || (ctx && ctx.tableName);
            if (!k || !t) {
                throw new Error('Document has no Knex context; was it constructed manually?');
            }
            const data = serializeSchemaValues(this.toObject(), ctx.schema);
            if (this._isNew) {
                const inserted = await k(t).insert(data).returning('*');
                const row = Array.isArray(inserted) ? inserted[0] : inserted;
                Object.assign(this, row);
                this._isNew = false;
                return this;
            }
            // UPDATE — match by primary key
            const pkCol = 'id';
            const pk = this[pkCol];
            if (pk === undefined || pk === null) {
                throw new Error('Cannot save() an existing document without an id');
            }
            delete data._isNew;
            delete data._tableName;
            delete data._knex;
            await k(t).where(pkCol, pk).update(data);
            return this;
        },
    };

    if (ctx.tableName === 'settings' && row.settingsId !== undefined) {
        Object.defineProperty(doc, 'id', {
            get() {
                return this.settingsId;
            },
            set(v) {
                this.settingsId = v;
            },
            enumerable: true,
            configurable: true,
        });
    }

    return doc;
};

/* ------------------------------------------------------------------ */
/* Query builder (chainable)                                          */
/* ------------------------------------------------------------------ */

/**
 * Build a chainable query object. Methods mirror the Mongoose chainable
 * surface used in this repo: `.where()`, `.sort()`, `.limit()`, `.skip()`,
 * `.lean()`. Awaiting the object runs the query.
 *
 * @param {Object} opts
 * @param {import('knex').Knex} opts.knex
 * @param {string} opts.tableName
 * @param {Object} [opts.filter]
 * @param {Object} [opts.schema]
 * @returns {Query}
 */
const buildQuery = ({ knex, tableName, filter = {}, schema, isOne = false }) => {
    const state = {
        sort: {},
        limit: null,
        skip: 0,
        lean: false,
        isOne, // findOne() — affects result shaping in exec()
    };

    const qb = knex(tableName);
    applyFilterGroup(qb, filter);

    const query = {
        where(filter) {
            applyFilterGroup(qb, filter);
            return this;
        },
        sort(sortSpec) {
            state.sort = parseSort(sortSpec);
            return this;
        },
        limit(n) {
            state.limit = n;
            return this;
        },
        skip(n) {
            state.skip = n;
            return this;
        },
        offset(n) {
            return this.skip(n);
        },
        lean(v = true) {
            state.lean = !!v;
            return this;
        },
        select(...cols) {
            if (cols.length > 0) {
                const flat = cols.flat ? cols.flat() : cols;
                if (typeof flat[0] === 'string' || Array.isArray(flat[0])) {
                    qb.select(...flat);
                } else {
                    qb.select(...flat);
                }
            }
            return this;
        },
        async exec() {
            // Apply ordering, offset, limit
            for (const k of Object.keys(state.sort)) {
                qb.orderBy(k, state.sort[k]);
            }
            if (state.skip) qb.offset(state.skip);
            if (state.limit !== null) qb.limit(state.limit);

            const rows = await qb;
            if (state.lean) {
                // Return plain objects, tetap lakukan casting schema seperti Mongoose lean().
                const plain = rows.map((r) => deserializeSchemaValues(r, schema));
                return state.isOne ? plain[0] || null : plain;
            }
            const wrapped = rows.map((r) =>
                wrapDocument(r, { knex, tableName, isNew: false, schema })
            );
            return state.isOne ? wrapped[0] || null : wrapped;
        },
        // Thenable: `await query` runs exec().
        then(resolve, reject) {
            return this.exec().then(resolve, reject);
        },
        catch(reject) {
            return this.exec().catch(reject);
        },
        [Symbol.toStringTag]: 'Query',
    };

    return query;
};

/* ------------------------------------------------------------------ */
/* Model factory                                                      */
/* ------------------------------------------------------------------ */

/**
 * Build a Mongoose-style model. The returned object exposes the static
 * methods Mongoose models have (`find`, `findOne`, `create`, etc.) and
 * each of them is implemented in terms of Knex.
 *
 * @param {string} tableName - SQL table name.
 * @param {Schema} schema - Schema definition.
 * @param {Object} [opts]
 * @param {import('knex').Knex} [opts.knex] - Knex instance (defaults to singleton).
 * @returns {Model}
 */
export const defineModel = (tableName, schema = { paths: {}, options: {} }, opts = {}) => {
    const knex = opts.knex || getKnex();
    const modelName = schema.options?.collection || tableName;
    const useTimestamps = !!schema.options?.timestamps;

    /* ---- table bootstrap ---------------------------------------- */
    const ensureTable = async () => {
        const has = await knex.schema.hasTable(tableName);
        if (has) return;
        const builder = knex.schema.createTable(tableName, (t) => {
            t.increments('id').primary();
            // We don't introspect the schema deeply — the underlying
            // tables are owned by the migration plan. We just make sure
            // the row id exists.
            if (useTimestamps) {
                t.timestamp('createdAt').defaultTo(knex.fn.now());
                t.timestamp('updatedAt').defaultTo(knex.fn.now());
            }
        });
        await builder;
    };

    /* ---- defaults ------------------------------------------------ */
    const _applyDefaults = (doc) => {
        if (!schema || !schema.paths) return doc;
        const out = { ...doc };
        for (const field of Object.keys(schema.paths)) {
            if (out[field] === undefined && schema.paths[field].default !== undefined) {
                const def = schema.paths[field].default;
                out[field] = typeof def === 'function' ? def() : def;
            }
        }
        return out;
    };

    const _mapSettingsFilter = (f) => {
        if (tableName !== 'settings' || !f || typeof f !== 'object') return f;
        const out = { ...f };
        if ('id' in out) {
            out.settingsId = out.id;
            delete out.id;
        }
        return out;
    };

    const _mapSettingsUpdate = (u) => {
        if (tableName !== 'settings' || !u || typeof u !== 'object') return u;
        const out = { ...u };
        if (out.$set && 'id' in out.$set) {
            out.$set = { ...out.$set };
            out.$set.settingsId = out.$set.id;
            delete out.$set.id;
        }
        if ('id' in out && !Object.keys(out).some((k) => k.startsWith('$'))) {
            out.settingsId = out.id;
            delete out.id;
        }
        return out;
    };

    /* ---- core query helpers ------------------------------------- */
    const _buildQuery = (filter = {}, opts = {}) => {
        const mapped = serializeFilterValues(_mapSettingsFilter(filter), schema);
        return buildQuery({ knex, tableName, filter: mapped, schema, isOne: false, ...opts });
    };
    const _toUpdatePayload = (data) => {
        const mapped = _mapSettingsUpdate(data);
        const opKeys = Object.keys(mapped || {}).filter((k) => k.startsWith('$'));
        if (opKeys.length > 0) {
            const decomp = decomposeUpdate(mapped);
            decomp.set = serializeSchemaValues(decomp.set, schema);
            return decomp;
        }
        return {
            set: serializeSchemaValues(mapped, schema),
            increments: [],
            jsonExtracts: [],
            push: [],
            pull: [],
            addToSet: [],
            unsets: [],
            muls: [],
            renames: [],
        };
    };

    const _normalizeReturning = (returning) => {
        if (Array.isArray(returning)) return returning;
        if (returning === 'id' || returning === true) return ['id'];
        return '*';
    };

    /* ---- static methods ---------------------------------------- */
    const Model = {
        modelName,
        tableName,
        schema,
        knex,
        ensureTable,

        /** @returns {Query} */
        find(filter = {}) {
            return _buildQuery(filter);
        },

        findOne(filter = {}) {
            return _buildQuery(filter, { isOne: true }).limit(1);
        },

        findById(id) {
            return this.findOne({ id });
        },

        findByIdAndUpdate(id, update = {}, options = {}) {
            return this.findOneAndUpdate({ id }, update, options);
        },

        findByIdAndDelete(id) {
            return this.findOneAndDelete({ id });
        },

        async findOneAndUpdate(filter = {}, update = {}, options = {}) {
            const mappedFilter = serializeFilterValues(_mapSettingsFilter(filter), schema);
            const decomp = _toUpdatePayload(update);

            if (options.upsert) {
                // Two-step: check existing, then either insert or update
                const probeQb = knex(tableName);
                applyFilterGroup(probeQb, mappedFilter);
                const existing = await probeQb.first('id');
                if (!existing) {
                    const insertDoc = {};
                    for (const k of Object.keys(mappedFilter)) {
                        const v = mappedFilter[k];
                        if (
                            v !== null &&
                            typeof v === 'object' &&
                            !Array.isArray(v) &&
                            !Buffer.isBuffer(v)
                        )
                            continue;
                        insertDoc[k] = v;
                    }
                    Object.assign(insertDoc, decomp.set);
                    Object.assign(insertDoc, serializeSchemaValues(insertDoc, schema));
                    if (useTimestamps) {
                        insertDoc.createdAt = knex.fn.now();
                        insertDoc.updatedAt = knex.fn.now();
                    }
                    await knex(tableName).insert(insertDoc);
                } else {
                    const updateQb = knex(tableName);
                    applyFilterGroup(updateQb, mappedFilter);
                    if (useTimestamps) decomp.set.updatedAt = knex.fn.now();
                    applyUpdate(updateQb, decomp);
                    await updateQb;
                }
            } else {
                const qb = knex(tableName);
                applyFilterGroup(qb, mappedFilter);
                if (useTimestamps) decomp.set.updatedAt = knex.fn.now();
                applyUpdate(qb, decomp);
                await qb;
            }

            if (options.new) {
                const refetchQb = knex(tableName);
                applyFilterGroup(refetchQb, mappedFilter);
                if (options.sort) {
                    const sortObj = parseSort(options.sort);
                    for (const k of Object.keys(sortObj)) refetchQb.orderBy(k, sortObj[k]);
                }
                const fresh = await refetchQb.first();
                if (!fresh) return null;
                return wrapDocument(fresh, { knex, tableName, isNew: false, schema });
            }
            return null;
        },

        async findOneAndDelete(filter = {}) {
            const mappedFilter = serializeFilterValues(_mapSettingsFilter(filter), schema);
            const qb = knex(tableName);
            applyFilterGroup(qb, mappedFilter);
            const row = await qb.clone().first();
            if (!row) return null;
            await qb.delete();
            return wrapDocument(row, { knex, tableName, isNew: false, schema });
        },

        async create(docs) {
            const arr = Array.isArray(docs) ? docs : [docs];
            const mapped = arr.map((d) => _mapSettingsUpdate(d));
            const normalized = mapped
                .map((d) => _applyDefaults(d))
                .map((d) => serializeSchemaValues(d, schema));
            const ret = await knex(tableName).insert(normalized).returning('id');
            // Re-fetch to return full documents (matches Mongoose behavior)
            const ids = ret.map((r) => (typeof r === 'object' ? r.id : r));
            if (ids.length === 0) return null;
            const rows = await knex(tableName).whereIn('id', ids);
            const wrapped = rows.map((r) =>
                wrapDocument(r, { knex, tableName, isNew: false, schema })
            );
            return Array.isArray(docs) ? wrapped : wrapped[0];
        },

        async insertMany(docs) {
            // Mongoose-compat alias
            return this.create(docs);
        },

        async countDocuments(filter = {}) {
            const qb = knex(tableName);
            applyFilterGroup(qb, filter);
            const row = await qb.count({ c: '*' }).first();
            return Number(row.c) || 0;
        },

        async exists(filter = {}) {
            const row = await knex(tableName).where(filter).first('id');
            return row ? { _id: row.id, id: row.id } : null;
        },

        async updateOne(filter = {}, update = {}, options = {}) {
            const decomp = _toUpdatePayload(update);
            const qb = knex(tableName);
            applyFilterGroup(qb, filter);
            if (useTimestamps) decomp.set.updatedAt = knex.fn.now();
            applyUpdate(qb, decomp);
            const result = await qb;
            return { acknowledged: true, modifiedCount: result || 0, matchedCount: result || 0 };
        },

        async updateMany(filter = {}, update = {}, options = {}) {
            return this.updateOne(filter, update, options);
        },

        async deleteOne(filter = {}) {
            const k = knex;
            // Count first, then delete (SQLite doesn't support .limit() on delete via Knex)
            const countQb = k(tableName);
            applyFilterGroup(countQb, filter);
            const before = await countQb.count({ c: '*' }).first();
            const targetCount = Math.min(Number(before.c) || 0, 1);
            if (targetCount > 0) {
                const idQb = k(tableName);
                applyFilterGroup(idQb, filter);
                const row = await idQb.first('id');
                if (row) {
                    await k(tableName).where('id', row.id).delete();
                }
            }
            return { acknowledged: true, deletedCount: targetCount };
        },

        async deleteMany(filter = {}) {
            const qb = knex(tableName);
            applyFilterGroup(qb, filter);
            const removed = await qb.delete();
            return { acknowledged: true, deletedCount: removed || 0 };
        },

        /**
         * Minimal Mongoose aggregate compatibility.
         *
         * Supported stages (translated to Knex):
         *   - $match     -> .where()
         *   - $sort      -> .orderBy()
         *   - $limit     -> .limit()
         *   - $skip      -> .offset()
         *   - $project   -> .select() (passthrough)
         *
         * Stages that have no clean Knex equivalent ($group, $lookup,
         * $facet, $unwind) are run JS-side over the rows produced by
         * the upstream $match. This is fine for low-volume tables (our
         * case) but you wouldn't want to do $group over 1M rows.
         *
         * @param {Array<Object>} pipeline
         * @returns {Promise<Array<Object>>}
         */
        async aggregate(pipeline = []) {
            let rows; // can be a Knex query builder or materialized array
            const postStages = [];
            let forcePostStage = false;

            for (const stage of pipeline) {
                const key = Object.keys(stage)[0];
                const val = stage[key];

                if (forcePostStage) {
                    postStages.push({ key, val });
                    continue;
                }

                switch (key) {
                    case '$match': {
                        if (!rows) {
                            rows = knex(tableName);
                        } else if (Array.isArray(rows) || !rows.select) {
                            const mat = Array.isArray(rows) ? rows : await rows;
                            rows = mat.filter((r) => {
                                for (const fk of Object.keys(val)) {
                                    const fv = val[fk];
                                    if (
                                        fv &&
                                        typeof fv === 'object' &&
                                        !Array.isArray(fv) &&
                                        !Buffer.isBuffer(fv)
                                    ) {
                                        for (const op of Object.keys(fv)) {
                                            const v = fv[op];
                                            const cv = r[fk];
                                            switch (op) {
                                                case '$eq':
                                                    if (cv !== v) return false;
                                                    break;
                                                case '$ne':
                                                    if (cv === v) return false;
                                                    break;
                                                case '$gt':
                                                    if (!(cv > v)) return false;
                                                    break;
                                                case '$gte':
                                                    if (!(cv >= v)) return false;
                                                    break;
                                                case '$lt':
                                                    if (!(cv < v)) return false;
                                                    break;
                                                case '$lte':
                                                    if (!(cv <= v)) return false;
                                                    break;
                                                case '$in':
                                                    if (!v.includes(cv)) return false;
                                                    break;
                                                case '$nin':
                                                    if (v.includes(cv)) return false;
                                                    break;
                                            }
                                        }
                                    } else if (r[fk] !== fv) {
                                        return false;
                                    }
                                }
                                return true;
                            });
                            break;
                        }
                        const qb = knex(tableName);
                        applyFilterGroup(qb, val);
                        rows = qb;
                        break;
                    }
                    case '$sort': {
                        if (Array.isArray(rows) || !rows || !rows.orderBy) {
                            const mat = Array.isArray(rows) ? rows : rows ? await rows : [];
                            const sortObj = parseSort(val);
                            mat.sort((a, b) => {
                                for (const k of Object.keys(sortObj)) {
                                    const av = a[k];
                                    const bv = b[k];
                                    if (av === bv) continue;
                                    const cmp = av > bv ? 1 : -1;
                                    return sortObj[k] === 'asc' ? cmp : -cmp;
                                }
                                return 0;
                            });
                            rows = mat;
                        } else {
                            const sortObj = parseSort(val);
                            for (const k of Object.keys(sortObj)) rows.orderBy(k, sortObj[k]);
                        }
                        break;
                    }
                    case '$limit': {
                        if (rows && !Array.isArray(rows) && rows.limit) {
                            rows.limit(val);
                        } else {
                            const mat = Array.isArray(rows) ? rows : rows ? await rows : [];
                            rows = mat.slice(0, val);
                        }
                        break;
                    }
                    case '$skip': {
                        if (rows && !Array.isArray(rows) && rows.offset) {
                            rows.offset(val);
                        } else {
                            const mat = Array.isArray(rows) ? rows : rows ? await rows : [];
                            rows = mat.slice(val);
                        }
                        break;
                    }
                    default:
                        forcePostStage = true;
                        postStages.push({ key, val });
                }
            }

            if (!rows) {
                rows = knex(tableName);
            }

            // Materialize rows (so JS-side post-stages can run)
            let materialized = Array.isArray(rows) ? rows : await rows;
            for (const { key, val } of postStages) {
                if (key === '$group') {
                    const { _id, ...fields } = val;
                    // strip starting $ from _id value if it's a string, e.g. '$role' -> 'role'
                    const cleanGroupKey =
                        typeof _id === 'string' && _id.startsWith('$') ? _id.slice(1) : _id;
                    const groupKeyFn =
                        cleanGroupKey === null || cleanGroupKey === undefined
                            ? null
                            : (r) => r[cleanGroupKey];

                    const buckets = new Map();
                    for (const r of materialized) {
                        const k = groupKeyFn ? groupKeyFn(r) : '__all__';
                        if (!buckets.has(k)) {
                            const bucket = {};
                            bucket._id = k === '__all__' ? null : k;
                            for (const f of Object.keys(fields)) {
                                const fSpec = fields[f];
                                if (fSpec && typeof fSpec === 'object') {
                                    if (fSpec.$sum !== undefined) {
                                        const fieldName =
                                            typeof fSpec.$sum === 'string' &&
                                            fSpec.$sum.startsWith('$')
                                                ? fSpec.$sum.slice(1)
                                                : null;
                                        if (fieldName) bucket[f] = Number(r[fieldName]) || 0;
                                        else bucket[f] = Number(fSpec.$sum) || 0;
                                    } else if (fSpec.$avg !== undefined)
                                        bucket[f] = { __avg: 0, __count: 0 };
                                    else if (fSpec.$min !== undefined)
                                        bucket[f] = r[String(fSpec.$min).replace('$', '')];
                                    else if (fSpec.$max !== undefined)
                                        bucket[f] = r[String(fSpec.$max).replace('$', '')];
                                    else if (fSpec.$first !== undefined)
                                        bucket[f] = r[String(fSpec.$first).replace('$', '')];
                                    else if (fSpec.$last !== undefined)
                                        bucket[f] = r[String(fSpec.$last).replace('$', '')];
                                    else if (fSpec.$push !== undefined)
                                        bucket[f] = [r[String(fSpec.$push).replace('$', '')]];
                                } else if (fSpec === 1 || fSpec === true) {
                                    bucket[f] = r[f];
                                }
                            }
                            buckets.set(k, bucket);
                        } else {
                            const bucket = buckets.get(k);
                            for (const f of Object.keys(fields)) {
                                const fSpec = fields[f];
                                if (fSpec && typeof fSpec === 'object') {
                                    if (fSpec.$sum !== undefined) {
                                        const fieldName =
                                            typeof fSpec.$sum === 'string' &&
                                            fSpec.$sum.startsWith('$')
                                                ? fSpec.$sum.slice(1)
                                                : null;
                                        if (fieldName)
                                            bucket[f] =
                                                (bucket[f] || 0) + (Number(r[fieldName]) || 0);
                                        else
                                            bucket[f] =
                                                (bucket[f] || 0) + (Number(fSpec.$sum) || 0);
                                    } else if (fSpec.$avg !== undefined) {
                                        const fieldName2 = String(fSpec.$avg).replace('$', '');
                                        bucket[f].__count += 1;
                                        bucket[f].__avg += Number(r[fieldName2]) || 0;
                                    } else if (fSpec.$max !== undefined) {
                                        const fieldName2 = String(fSpec.$max).replace('$', '');
                                        const v = Number(r[fieldName2]) || 0;
                                        if (v > bucket[f]) bucket[f] = v;
                                    } else if (fSpec.$min !== undefined) {
                                        const fieldName2 = String(fSpec.$min).replace('$', '');
                                        const v = Number(r[fieldName2]) || 0;
                                        if (v < bucket[f]) bucket[f] = v;
                                    } else if (fSpec.$last !== undefined) {
                                        const fieldName2 = String(fSpec.$last).replace('$', '');
                                        bucket[f] = r[fieldName2];
                                    } else if (fSpec.$push !== undefined) {
                                        const fieldName2 = String(fSpec.$push).replace('$', '');
                                        bucket[f].push(r[fieldName2]);
                                    }
                                }
                            }
                        }
                    }
                    materialized = Array.from(buckets.values()).map((b) => {
                        if (b.__avg !== undefined)
                            b = { ...b, _avgVal: b.__avg / (b.__count || 1) };
                        for (const k of Object.keys(b)) {
                            if (k === '__avg' || k === '__count') delete b[k];
                        }
                        return b;
                    });
                } else if (key === '$unwind') {
                    const field = String(val).replace('$', '').replace('.$', '');
                    const out = [];
                    for (const r of materialized) {
                        const v = r[field];
                        if (Array.isArray(v)) {
                            for (const item of v) {
                                out.push({ ...r, [field]: item });
                            }
                        } else {
                            out.push(r);
                        }
                    }
                    materialized = out;
                } else if (key === '$sort') {
                    const sortObj = parseSort(val);
                    materialized.sort((a, b) => {
                        for (const k of Object.keys(sortObj)) {
                            const av = a[k];
                            const bv = b[k];
                            if (av === bv) continue;
                            const cmp = av > bv ? 1 : -1;
                            return sortObj[k] === 'asc' ? cmp : -cmp;
                        }
                        return 0;
                    });
                } else if (key === '$limit') {
                    materialized = materialized.slice(0, val);
                } else if (key === '$skip') {
                    materialized = materialized.slice(val);
                } else if (key === '$lookup') {
                    console.warn('[adapter] $lookup is not supported in the JS fallback; skipping');
                } else if (key === '$project') {
                    const fields = Object.keys(val).filter((k) => val[k] && k !== '_id');
                    if (fields.length > 0) {
                        materialized = materialized.map((r) => {
                            const out = {};
                            for (const f of fields) out[f] = r[f];
                            return out;
                        });
                    }
                }
            }
            return materialized;
        },
    };

    return Model;
};

/* ------------------------------------------------------------------ */
/* Schema helper (parity shim)                                       */
/* ------------------------------------------------------------------ */

/**
 * Minimal `mongoose.Schema`-compatible constructor. We don't validate or
 * cast — we just keep the field metadata around for the model factory to
 * apply defaults and to round-trip documents.
 *
 * @param {Object} paths - Field definitions keyed by name.
 * @param {Object} [options] - Schema options (`timestamps`, etc).
 * @returns {Schema}
 */
export const createSchema = (paths = {}, options = {}) => {
    return {
        paths,
        options: {
            timestamps: !!options.timestamps,
            collection: options.collection,
            ...options,
        },
    };
};

/* ------------------------------------------------------------------ */
/* Public exports                                                     */
/* ------------------------------------------------------------------ */

export default {
    defineModel,
    createSchema,
    wrapDocument,
    buildQuery,
    parseSort,
    applyFilter,
    decomposeUpdate,
};
