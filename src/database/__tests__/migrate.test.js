import test from 'node:test';
import assert from 'node:assert/strict';
import knexFactory from 'knex';
import { migrateIfSafe } from '../migrate.js';

const makeKnex = () =>
    knexFactory({
        client: 'sqlite3',
        connection: { filename: ':memory:' },
        useNullAsDefault: true,
        pool: { min: 1, max: 1 },
    });

const makeLog = () => {
    const calls = { info: [], warn: [] };
    return { calls, info: (m) => calls.info.push(m), warn: (m) => calls.warn.push(m) };
};

test('fresh database: applies all migrations, then is up to date', async () => {
    const knex = makeKnex();
    const log = makeLog();

    const first = await migrateIfSafe(knex, log);
    assert.equal(first.status, 'migrated');
    assert.ok(first.applied.length >= 13);
    assert.ok(await knex.schema.hasTable('settings'));
    assert.ok(await knex.schema.hasTable('afk'));

    const second = await migrateIfSafe(knex, log);
    assert.equal(second.status, 'up-to-date');
    await knex.destroy();
});

test('legacy database (tables, no migration history): skips and warns', async () => {
    const knex = makeKnex();
    const log = makeLog();
    await knex.schema.createTable('users', (t) => t.increments('id'));

    const result = await migrateIfSafe(knex, log);
    assert.equal(result.status, 'skipped-legacy');
    assert.equal(await knex.schema.hasTable('knex_migrations'), false);
    assert.match(log.calls.warn[0], /no migration history; skipping auto-migrate/);
    await knex.destroy();
});

test('schema drift: every model field has a column after migrations', async () => {
    const knex = makeKnex();
    const { setKnex } = await import('../knexInstance.js');
    setKnex(knex);
    await migrateIfSafe(knex, makeLog());

    try {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const dir = path.resolve(import.meta.dirname, '../models');
        const drift = [];
        for (const file of fs.readdirSync(dir)) {
            const { default: Model } = await import(path.join(dir, file));
            const cols = Object.keys(await knex(Model.tableName).columnInfo());
            for (const field of Object.keys(Model.schema?.paths || {})) {
                // settings.id is an alias of settingsId (the integer id is the PK)
                if (Model.tableName === 'settings' && field === 'id') continue;
                if (!cols.includes(field)) drift.push(`${Model.tableName}.${field}`);
            }
        }
        assert.deepEqual(drift, [], `model fields without a migration: ${drift.join(', ')}`);
    } finally {
        await knex.destroy();
    }
});
