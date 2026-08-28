/**
 * Lazy singleton holding the Knex instance for the database adapter.
 *
 * Why lazy? Mongoose callers may import `src/database/index.js` and never
 * actually hit a collection during tests or CLI runs. We avoid paying the
 * driver setup cost (and a hard crash on missing config) until the first
 * `defineModel()` call needs a real Knex client.
 *
 * The actual Knex instance is created the first time `getKnex()` runs, and
 * cached in a module-level variable. Subsequent calls return the same
 * instance, which Knex requires for connection pooling to work properly.
 */

import knexFactory from 'knex';

let cachedKnex = null;
let cachedConfig = null;

/**
 * Build (or return cached) Knex configuration object.
 *
 * Resolution order for connection settings:
 *   1. Caller-supplied `connection` (used by the test suite for `:memory:`)
 *   2. Environment variables (SQLITE_PATH, DATABASE_URL, etc.)
 *   3. Sensible local default (`./data/bot.sqlite`)
 *
 * @param {Object} [overrides] - Optional overrides merged into the config.
 * @returns {Object} Knex configuration object.
 */
export const buildKnexConfig = (overrides = {}) => {
    if (cachedConfig) return { ...cachedConfig, ...overrides };

    const sqlitePath = process.env.SQLITE_PATH || './data/bot.db';
    const useMemory = process.env.SQLITE_MEMORY === '1' || sqlitePath === ':memory:';

    cachedConfig = {
        client: 'better-sqlite3',
        connection: useMemory ? ':memory:' : { filename: sqlitePath },
        useNullAsDefault: true,
        // Foreign-key enforcement is on by default in better-sqlite3,
        // but we keep migrations consolidated.
        pool: { min: 1, max: 1 },
    };
    return { ...cachedConfig, ...overrides };
};

/**
 * Get the singleton Knex instance, creating it on first call.
 *
 * @param {Object} [config] - Optional Knex config override for tests.
 * @returns {import('knex').Knex} The shared Knex instance.
 */
export const getKnex = (config) => {
    if (cachedKnex) return cachedKnex;
    const cfg = config || buildKnexConfig();
    cachedKnex = knexFactory(cfg);
    return cachedKnex;
};

/**
 * Reset the cached instance. Used by tests to swap in a fresh in-memory DB.
 *
 * @param {import('knex').Knex} [newInstance] - Optional replacement instance.
 * @returns {void}
 */
export const setKnex = (newInstance) => {
    cachedKnex = newInstance;
};
