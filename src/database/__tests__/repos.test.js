import test from 'node:test';
import assert from 'node:assert/strict';
import knexFactory from 'knex';
import { setKnex } from '../knexInstance.js';
import { migrateIfSafe } from '../migrate.js';
import { toDate, createCodec } from '../codec.js';
import { afkRepo } from '../repos/afkRepo.js';
import { pollRepo } from '../repos/pollRepo.js';
import { voucherRepo } from '../repos/voucherRepo.js';
import { userRepo } from '../repos/userRepo.js';
import { settingsRepo } from '../repos/settingsRepo.js';
import { groupRepo } from '../repos/groupRepo.js';
import { serverRepo } from '../repos/serverRepo.js';
import { transactionRepo } from '../repos/transactionRepo.js';
import { rpgPlayerRepo, rpgBillRepo, rpgProgressRepo } from '../repos/rpgRepos.js';
import * as wallet from '../../services/walletService.js';

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

withDb('afkRepo reads rows in the legacy storage format (epoch ms)', async (knex) => {
    await knex('afk').insert({ userId: 'old', reason: 'Tanpa alasan', time: 123456 });
    const [rec] = await afkRepo.all();
    assert.equal(rec.userId, 'old');
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

withDb('createRepo: create/find/count/update/upsert/save/remove', async (knex) => {
    const u = await userRepo.create({ jid: 'a@s' });
    assert.equal(u.balance, 0);
    assert.equal(u.role, 'user');
    assert.ok(u.createdAt instanceof Date);
    assert.equal(typeof (await knex('users').first('createdAt')).createdAt, 'number');

    u.balance += 2500;
    u.notAColumn = 'ignored';
    await userRepo.save(u);
    assert.equal((await userRepo.findOne({ jid: 'a@s' })).balance, 2500);

    assert.equal((await userRepo.updateOne({ jid: 'a@s' }, { name: 'Ani' })).name, 'Ani');
    assert.equal(await userRepo.updateOne({ jid: 'none@s' }, { name: 'x' }), null);
    const up = await userRepo.upsert({ jid: 'b@s' }, { visionModel: 'm1' });
    assert.equal(up.visionModel, 'm1');
    assert.equal(await userRepo.count(), 2);
    assert.equal((await userRepo.findOrCreate({ jid: 'a@s' })).name, 'Ani');
    assert.equal(await userRepo.update({ role: 'user' }, { role: 'member' }), 2);
    assert.equal(await userRepo.remove({ jid: 'b@s' }), 1);
    assert.deepEqual(
        (await userRepo.find()).map((x) => x.jid),
        ['a@s']
    );
    await assert.rejects(userRepo.save({ jid: 'no-id' }), /has no id/);
});

withDb('settingsRepo: single row, JSON/bool round-trip', async () => {
    const s = await settingsRepo.get();
    assert.equal(s.settingsId, 'bot_settings');
    assert.deepEqual(s.owners, []);
    assert.equal(s.autoAiPrivate, false);

    s.owners.push('628111');
    s.autoAiPrivate = true;
    await settingsRepo.save(s);
    const again = await settingsRepo.get();
    assert.deepEqual(again.owners, ['628111']);
    assert.equal(again.autoAiPrivate, true);

    assert.equal((await settingsRepo.update({ mode: 'self' })).mode, 'self');
    assert.equal((await settingsRepo.all()).length, 1);
});

withDb('groupRepo: booleans, auto-schedule query, welcome reset', async () => {
    await groupRepo.create({ jid: 'g1', autoOpen: true });
    await groupRepo.create({ jid: 'g2', autoClose: true });
    await groupRepo.create({ jid: 'g3' });
    assert.deepEqual((await groupRepo.findWithAutoSchedule()).map((g) => g.jid).sort(), [
        'g1',
        'g2',
    ]);
    assert.deepEqual(
        (await groupRepo.find({ autoOpen: true })).map((g) => g.jid),
        ['g1']
    );

    const g = await groupRepo.upsert({ jid: 'g3' }, { welcomeBg: 'https://x/y.png' });
    assert.equal(g.welcomeBg, 'https://x/y.png');
    assert.match((await groupRepo.resetWelcomeBg('g3')).welcomeBg, /images-76\.jpg$/);
    assert.equal((await groupRepo.findOne({ jid: 'g1' })).autoOpen, true);
});

withDb('serverRepo: id-or-identifier lookup and expiry ranges', async () => {
    const day = 864e5;
    const now = Date.now();
    const base = { userId: 'u@s', planName: 'p', price: 1 };
    await serverRepo.create({
        ...base,
        pteroId: 11,
        identifier: 'abc',
        expiredAt: now - 10 * day,
        status: 'active',
    });
    await serverRepo.create({
        ...base,
        pteroId: 12,
        identifier: 'def',
        expiredAt: now + 5 * day,
        status: 'active',
    });
    await serverRepo.create({
        ...base,
        pteroId: 13,
        identifier: 'ghi',
        expiredAt: now - 10 * day,
        status: 'suspended',
    });

    assert.equal((await serverRepo.findByPteroIdOrIdentifier('def')).pteroId, 12);
    assert.equal((await serverRepo.findByPteroIdOrIdentifier(11)).identifier, 'abc');
    assert.deepEqual(
        (await serverRepo.findExpiredBefore(new Date(now - 7 * day), { status: 'active' })).map(
            (s) => s.pteroId
        ),
        [11]
    );
    assert.deepEqual(
        (
            await serverRepo.findExpiringBetween(new Date(now + 4 * day), new Date(now + 6 * day))
        ).map((s) => s.pteroId),
        [12]
    );
    const s = await serverRepo.findOne({ pteroId: 12 });
    assert.ok(s.expiredAt instanceof Date && s.createdAt instanceof Date);
    assert.equal(s.autoRenewEnabled, true);
});

withDb('transaction and RPG repos: defaults, timestamps, bool filters', async (knex) => {
    const tx = await transactionRepo.create({
        userId: 'u',
        userName: 'U',
        type: 'income',
        amount: 5,
    });
    assert.ok(tx.date instanceof Date);
    assert.ok(tx.createdAt instanceof Date && tx.updatedAt instanceof Date);

    const p = await rpgPlayerRepo.create({ userId: 'u' });
    assert.equal(p.hp, 100);
    assert.ok(p.lastEnergyReset instanceof Date);
    const before = (await knex('rpg_players').first('updatedAt')).updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    p.hp = 50;
    await rpgPlayerRepo.save(p);
    const row = await knex('rpg_players').first('hp', 'updatedAt');
    assert.equal(row.hp, 50);
    assert.ok(row.updatedAt > before);

    await rpgBillRepo.create({ userId: 'u', billType: 'pinjol', amount: 1, dueDate: Date.now() });
    assert.equal(await rpgBillRepo.count({ userId: 'u', isPaid: false }), 1);

    const prog = await rpgProgressRepo.create({ userId: 'u', dailyDate: '2026-11-17' });
    prog.claimedMissions.push('work');
    await rpgProgressRepo.save(prog);
    assert.deepEqual((await rpgProgressRepo.findOne({ userId: 'u' })).claimedMissions, ['work']);
});

withDb('users.balance: overlapping read-modify-save keeps both changes (delta save)', async () => {
    await userRepo.create({ jid: 'a@s', balance: 100 });
    // Two commands read the same user, then each changes the balance and saves.
    const rpg = await userRepo.findOne({ jid: 'a@s' });
    const store = await userRepo.findOne({ jid: 'a@s' });
    rpg.balance += 30; // e.g. salary
    store.balance -= 50; // e.g. purchase
    await userRepo.save(store);
    await userRepo.save(rpg);
    assert.equal((await userRepo.findOne({ jid: 'a@s' })).balance, 80);
    assert.equal(rpg.balance, 80, 'save() refreshes the record with the stored value');

    // Saving again without changes must not re-apply the delta.
    await userRepo.save(rpg);
    assert.equal((await userRepo.findOne({ jid: 'a@s' })).balance, 80);
});

withDb('walletService: credit/debit are atomic and never overdraw', async (knex) => {
    assert.equal(await wallet.credit('w@s', 100), 100); // creates the user
    assert.deepEqual(await wallet.debit('w@s', 30), { ok: true, balance: 70 });
    assert.deepEqual(await wallet.debit('w@s', 80), { ok: false, balance: 70 });

    // Ten concurrent 20-unit purchases against a balance of 70: exactly 3 succeed.
    const results = await Promise.all(Array.from({ length: 10 }, () => wallet.debit('w@s', 20)));
    assert.equal(results.filter((r) => r.ok).length, 3);
    assert.equal(await wallet.getBalance('w@s'), 10);

    await assert.rejects(wallet.credit('w@s', -5), RangeError);
    await assert.rejects(wallet.debit('w@s', 0), RangeError);
    assert.equal((await knex('users').where({ jid: 'w@s' })).length, 1);
});
