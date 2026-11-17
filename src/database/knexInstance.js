/**
 * Lazy singleton holding the Knex (SQLite) instance used by the repositories
 * in ./repos. Lazy so importing a repo never opens the database by itself;
 * the connection is created on the first query.
 *
 * The actual Knex instance is created the first time `getKnex()` runs, and
 * cached in a module-level variable. Subsequent calls return the same
 * instance, which Knex requires for connection pooling to work properly.
 */

import knexFactory from 'knex';

import { env } from '../config/env.js';
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

    const sqlitePath = env.SQLITE_PATH || './data/bot.db';
    const useMemory = env.SQLITE_MEMORY === '1' || sqlitePath === ':memory:';

    cachedConfig = {
        client: 'sqlite3',
        connection: useMemory ? ':memory:' : { filename: sqlitePath },
        useNullAsDefault: true,
        // Foreign-key enforcement: sqlite3 driver needs it via pragma,
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
