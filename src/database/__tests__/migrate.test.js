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

test('schema drift: every column a repository converts exists after migrations', async () => {
    const knex = makeKnex();
    const { setKnex } = await import('../knexInstance.js');
    setKnex(knex);
    try {
        await migrateIfSafe(knex, makeLog());
        const fs = await import('node:fs');
        const path = await import('node:path');
        const dir = path.resolve(import.meta.dirname, '../repos');
        const drift = [];
        let checked = 0;
        for (const file of fs.readdirSync(dir)) {
            const mod = await import(path.join(dir, file));
            for (const repo of Object.values(mod)) {
                if (!repo?.codec?.fields || !repo.table) continue;
                checked++;
                const cols = Object.keys(await knex(repo.table).columnInfo());
                for (const f of repo.codec.fields)
                    if (!cols.includes(f)) drift.push(`${repo.table}.${f}`);
            }
        }
        assert.ok(checked >= 9, `expected to check all table repos, checked ${checked}`);
        assert.deepEqual(drift, [], `repository fields without a column: ${drift.join(', ')}`);
    } finally {
        await knex.destroy();
    }
});
