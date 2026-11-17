import test from 'node:test';
import assert from 'node:assert/strict';
import knexFactory from 'knex';
import { setKnex } from '../knexInstance.js';
import { migrateIfSafe } from '../migrate.js';
import { defineModel, createSchema } from '../adapter.js';
import { toDate, createCodec } from '../codec.js';
import { afkRepo } from '../repos/afkRepo.js';
import { pollRepo } from '../repos/pollRepo.js';
import { voucherRepo } from '../repos/voucherRepo.js';

const quiet = { info() {}, warn() {} };

/** Fresh migrated in-memory DB per test. */
const withDb = (name, fn) =>
    test(name, async () => {
        const knex = knexFactory({
            client: 'sqlite3',
            connection: { filename: ':memory:' },
            useNullAsDefault: true,
            pool: { min: 1, max: 1 },
        });
        setKnex(knex);
        try {
            await migrateIfSafe(knex, quiet);
            await fn(knex);
        } finally {
            await knex.destroy();
        }
    });

test('codec: dates from epoch ms, numeric strings and SQLite UTC timestamps', () => {
    assert.equal(toDate(1700000000000).getTime(), 1700000000000);
    assert.equal(toDate('1700000000000').getTime(), 1700000000000);
    assert.equal(toDate('2026-11-17 08:00:00').toISOString(), '2026-11-17T08:00:00.000Z');
    assert.equal(toDate(null), null);
    assert.equal(toDate('garbage'), null);

    const c = createCodec({ json: ['tags'], bool: ['on'], date: ['at'] });
    const row = c.toRow({ tags: ['a'], on: true, at: new Date(5), skip: undefined });
    assert.deepEqual(row, { tags: '["a"]', on: 1, at: 5 });
    assert.deepEqual(c.fromRow(row), { tags: ['a'], on: true, at: new Date(5) });
    assert.deepEqual(c.fromRow({ tags: 'not json' }).tags, []);
});

withDb('afkRepo: upsert replaces, all lists, remove deletes', async (knex) => {
    await afkRepo.upsert({ userId: 'u1', reason: 'makan', time: new Date(1000) });
    await afkRepo.upsert({ userId: 'u1', userName: 'Budi', reason: 'tidur', time: new Date(2000) });
    const all = await afkRepo.all();
    assert.equal(all.length, 1);
    assert.equal(all[0].reason, 'tidur');
    assert.equal(all[0].userName, 'Budi');
    assert.equal(all[0].time.getTime(), 2000);
    assert.equal(await afkRepo.remove('u1'), true);
    assert.equal(await afkRepo.remove('u1'), false);
    assert.equal((await knex('afk').count({ n: '*' }))[0].n, 0);
});

withDb('afkRepo reads rows written by the legacy adapter', async (knex) => {
    const LegacyAfk = defineModel(
        'afk',
        createSchema({
            userId: { type: String },
            userName: { type: String, default: '' },
            reason: { type: String, default: 'Tanpa alasan' },
            time: { type: Date, default: Date.now },
        }),
        { knex }
    );
    await LegacyAfk.create({ userId: 'old', time: new Date(123456) });
    const [rec] = await afkRepo.all();
    assert.equal(rec.userId, 'old');
    assert.equal(rec.reason, 'Tanpa alasan');
    assert.equal(rec.time.getTime(), 123456);
});

withDb('pollRepo: create/find keeps options and secret; prunes old polls', async (knex) => {
    const secret = Buffer.from([1, 2, 3, 250]);
    await pollRepo.create({
        pollId: 'p1',
        chat: 'g@g.us',
        question: 'Q?',
        options: ['A', 'B'],
        messageSecret: secret,
    });
    const poll = await pollRepo.findByPollId('p1');
    assert.deepEqual(poll.options, ['A', 'B']);
    assert.ok(Buffer.from(poll.messageSecret).equals(secret));
    assert.ok(poll.createdAt instanceof Date);

    await knex('polls')
        .where({ pollId: 'p1' })
        .update({ createdAt: Date.now() - 8 * 864e5 });
    await pollRepo.create({
        pollId: 'p2',
        chat: 'g',
        question: 'Q',
        options: [],
        messageSecret: secret,
    });
    assert.equal(await pollRepo.removeOlderThan(new Date(Date.now() - 7 * 864e5)), 1);
    assert.equal(await pollRepo.findByPollId('p1'), null);
    assert.ok(await pollRepo.findByPollId('p2'));
});

withDb('voucherRepo.redeem: credits once, enforces quota and single use', async (knex) => {
    await knex('users').insert([{ jid: 'a@s' }, { jid: 'b@s' }]);
    await voucherRepo.create({ code: 'V1', value: 5000, quota: 1 });

    assert.deepEqual(await voucherRepo.redeem('NOPE', 'a@s'), { ok: false, reason: 'invalid' });
    assert.deepEqual(await voucherRepo.redeem('V1', 'ghost@s'), { ok: false, reason: 'no-user' });
    assert.deepEqual(await voucherRepo.redeem('V1', 'a@s'), {
        ok: true,
        value: 5000,
        balance: 5000,
    });
    assert.deepEqual(await voucherRepo.redeem('V1', 'a@s'), { ok: false, reason: 'exhausted' });

    const v = await voucherRepo.findByCode('V1');
    assert.equal(v.quota, 0);
    assert.deepEqual(v.usedBy, ['a@s']);

    await voucherRepo.create({ code: 'V2', value: 100, quota: 5, isPublic: true });
    await voucherRepo.redeem('V2', 'b@s');
    assert.deepEqual(await voucherRepo.redeem('V2', 'b@s'), {
        ok: false,
        reason: 'already-claimed',
    });
    assert.equal((await voucherRepo.findByCode('V2')).isPublic, true);
});

withDb('voucherRepo.redeem: concurrent claims cannot exceed quota', async (knex) => {
    const users = Array.from({ length: 6 }, (_, i) => ({ jid: `u${i}@s` }));
    await knex('users').insert(users);
    await voucherRepo.create({ code: 'RACE', value: 10, quota: 2 });

    const results = await Promise.all(users.map((u) => voucherRepo.redeem('RACE', u.jid)));
    assert.equal(results.filter((r) => r.ok).length, 2);
    const total = await knex('users').sum({ s: 'balance' });
    assert.equal(total[0].s, 20);
});
