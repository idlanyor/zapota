/**
 * Compatibility shim that exposes a Mongoose-shaped object to the rest of
 * the codebase. The idea is that callers that still `import mongoose from
 * '../database/index.js'` keep working while their query code is being
 * refactored to use the Knex-backed adapter under the hood.
 *
 * This file is intentionally thin: the actual query translation lives in
 * `./adapter.js`. The shim's job is to:
 *
 *   1. Provide `mongoose.Schema`, `mongoose.model`, `mongoose.connect`,
 *      `mongoose.connection` so the surface stays familiar.
 *   2. Lazily initialize the Knex connection on first model access.
 *   3. Track `connection.readyState` so callers that gate startup on it
 *      keep working (used in `src/config/database.js`).
 *
 * Models are registered by name so `mongoose.model('User', ...)` returns
 * the same `User` model on repeat calls, matching Mongoose behavior.
 */

import { getKnex, buildKnexConfig, setKnex } from './knexInstance.js';
import { defineModel, createSchema } from './adapter.js';

/**
 * @typedef {Object} ReadyState
 * @property {0} disconnected - No live Knex client.
 * @property {1} connected - Knex is initialized and ready.
 */

/** @type {ReadyState} */
export const readyState = { disconnected: 0, connected: 1 };

let _ready = readyState.disconnected;
let _connectionListeners = [];

/**
 * Connection shim with a Mongoose-shaped surface.
 */
const connection = {
    /** @returns {number} */
    get readyState() {
        return _ready;
    },
    /** @param {Function} cb */
    on(event, cb) {
        if (event === 'connected' && _ready === readyState.connected) {
            // Fire immediately for listeners attached after connect.
            setImmediate(cb);
        } else {
            _connectionListeners.push({ event, cb });
        }
        return this;
    },
    once(event, cb) {
        if (event === 'connected' && _ready === readyState.connected) {
            setImmediate(cb);
            return this;
        }
        const wrap = (...args) => {
            this.off(event, wrap);
            cb(...args);
        };
        return this.on(event, wrap);
    },
    off(event, cb) {
        _connectionListeners = _connectionListeners.filter(
            (l) => !(l.event === event && l.cb === cb)
        );
        return this;
    },
};

/**
 * Fire a connection event. Used internally by `connect()`.
 * @param {string} event
 * @param {...*} args
 */
const _emit = (event, ...args) => {
    for (const l of _connectionListeners.filter((l) => l.event === event)) {
        try {
            l.cb(...args);
        } catch (e) {
            console.error('[db] connection listener error:', e);
        }
    }
};

/**
 * Connect Knex to the configured database. Mirrors Mongoose's
 * `mongoose.connect(uri, options)` signature but accepts a wider set of
 * options since we're on Knex under the hood.
 *
 * @param {string|Object} [_uri] - Unused for SQLite, kept for Mongoose signature parity.
 * @param {Object} [options] - Connection options.
 * @returns {Promise<typeof connection>}
 */
export const connect = async (_uri, options = {}) => {
    if (_ready === readyState.connected) return connection;
    // Build config from environment unless caller provided one.
    if (options.connection) {
        const cfg = buildKnexConfig({ connection: options.connection });
        setKnex(getKnex(cfg));
    } else {
        getKnex(); // initialize singleton
    }
    _ready = readyState.connected;
    _emit('connected');
    _emit('open');
    return connection;
};

/**
 * Disconnect and reset state. Mirrors `mongoose.disconnect()`.
 *
 * @returns {Promise<void>}
 */
export const disconnect = async () => {
    if (_ready === readyState.disconnected) return;
    const k = getKnex();
    await k.destroy();
    setKnex(null);
    _ready = readyState.disconnected;
    _emit('disconnected');
    _emit('close');
};

/**
 * Registry of models by name. Both `model()` and `defineModel()` write
 * here; `model()` reads here.
 */
const modelRegistry = new Map();

/**
 * Register a model. Mirrors `mongoose.model(name, schema)` so existing
 * `mongoose.model('User', userSchema)` call sites keep working.
 *
 * @param {string} name
 * @param {Object} schemaLike
 * @param {string} [collectionName]
 * @returns {Object} The model.
 */
export const model = (name, schemaLike, collectionName) => {
    if (modelRegistry.has(name)) return modelRegistry.get(name);

    // Accept a real `mongoose.Schema` instance, a plain object, or the
    // shim's `createSchema()` output. We normalize to `{ paths, options }`.
    const schema = {
        paths: (schemaLike && (schemaLike.paths || schemaLike)) || {},
        options: (schemaLike && schemaLike.options) || {},
    };
    if (collectionName) schema.options.collection = collectionName;
    // Apply second-arg-collection-name convention (Mongoose compat)
    if (!schema.options.collection) {
        const base = name.toLowerCase();
        schema.options.collection = base.endsWith('s') ? base : base + 's';
    }

    // Default table name -> pluralized Mongoose style
    const tableName = collectionName || schema.options.collection;

    // Pre-build the model so the first `find()` is responsive.
    const M = defineModel(tableName, schema);
    modelRegistry.set(name, M);
    return M;
};

/**
 * Schema constructor. Pass through to the adapter's `createSchema`.
 *
 * @param {Object} paths
 * @param {Object} [options]
 * @returns {Object}
 */
export const Schema = function (paths, options) {
    const s = createSchema(paths, options);
    s.index = () => s; // chainable no-op
    return s;
};

/**
 * Mongoose-style Types. We only carry the constants the codebase uses.
 */
export const SchemaTypes = {
    String: String,
    Number: Number,
    Boolean: Boolean,
    Date: Date,
    Buffer: Buffer,
    Object: Object,
    Array: Array,
    Mixed: Object,
};

/* ------------------------------------------------------------------ */
/* Default export — a Mongoose-shaped object                          */
/* ------------------------------------------------------------------ */

const mongoose = {
    Schema,
    SchemaTypes,
    model,
    connect,
    disconnect,
    connection,
    Types: SchemaTypes,
    // Allow `mongoose.Schema.Types.String` style access
    get models() {
        return modelRegistry;
    },
    // Compatibility: `new mongoose.Schema(...)` is supported because we
    // made Schema a constructor (above). `mongoose.model(name, schema)`
    // is the function form.
    readyState,
    set: setKnex,
    getKnex,
};

export default mongoose;
