import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIGRATIONS_DIR = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    'migrations'
);

const listUserTables = async (knex) => {
    const rows = await knex('sqlite_master')
        .select('name')
        .where('type', 'table')
        .andWhereNot('name', 'like', 'sqlite_%');
    return rows.map((r) => r.name);
};

/**
 * Apply pending migrations at startup — but only when it is safe:
 *   - fresh database (no tables)            → migrate
 *   - database with knex migration history  → migrate (pending only)
 *   - tables but no migration history       → skip + warn (legacy DB whose
 *     schema didn't come from these migrations; migrating blindly would
 *     fail on existing tables or diverge from it)
 *
 * @param {import('knex').Knex} knex
 * @param {{ info: Function, warn: Function }} log
 * @returns {Promise<{ status: 'migrated' | 'up-to-date' | 'skipped-legacy', applied: string[] }>}
 */
export const migrateIfSafe = async (knex, log, { directory = MIGRATIONS_DIR } = {}) => {
    const hasHistory = await knex.schema.hasTable('knex_migrations');
    if (!hasHistory) {
        const tables = await listUserTables(knex);
        if (tables.length > 0) {
            log.warn(
                `[db] Database has tables (${tables.length}) but no migration history; ` +
                    'skipping auto-migrate. Back it up, then run `npm run db:migrate` deliberately.'
            );
            return { status: 'skipped-legacy', applied: [] };
        }
    }

    const [, applied] = await knex.migrate.latest({ directory, tableName: 'knex_migrations' });
    if (applied.length) {
        log.info(
            `[db] Applied ${applied.length} migration(s): ${applied.map((f) => path.basename(f)).join(', ')}`
        );
        return { status: 'migrated', applied };
    }
    return { status: 'up-to-date', applied: [] };
};
