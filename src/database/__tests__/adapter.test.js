/**
 * Adapter tests. Run with:
 *
 *   node --test src/database/__tests__/adapter.test.js
 *
 * Or, if jest gets installed later:
 *
 *   npx jest src/database/__tests__/adapter.test.js
 *
 * We use `node:test` (Node 18+ built-in) by default so the suite has no
 * external runner dependency.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

import knexFactory from 'knex';
import { setKnex } from '../knexInstance.js';
import { defineModel, createSchema } from '../adapter.js';

/**
 * Build a fresh in-memory Knex for each test so the tables are isolated.
 * `better-sqlite3` opens a new connection per `:memory:` handle, so we
 * must re-create the Knex wrapper (and drop any previous one) per test.
 */
const freshKnex = () => {
    const k = knexFactory({
        client: 'better-sqlite3',
        connection: { filename: ':memory:' },
        useNullAsDefault: true,
    });
    setKnex(k);
    return k;
};

const makeUserModel = async () => {
    const knex = freshKnex();
    const schema = createSchema(
        {
            name: { type: String, default: '' },
            age: { type: Number, default: 0 },
            role: { type: String, default: 'user' },
        },
        { timestamps: true }
    );
    const User = defineModel('test_users', schema, { knex });
    await knex.schema.createTable('test_users', (t) => {
        t.increments('id').primary();
        t.string('name').notNullable().defaultTo('');
        t.integer('age').notNullable().defaultTo(0);
        t.string('role').notNullable().defaultTo('user');
        t.timestamp('createdAt').defaultTo(knex.fn.now());
        t.timestamp('updatedAt').defaultTo(knex.fn.now());
    });
    return { knex, User };
};

test('create() inserts a single document and returns the row', async () => {
    const { User, knex } = await makeUserModel();
    const u = await User.create({ name: 'Alice', age: 30 });
    assert.equal(u.name, 'Alice');
    assert.equal(u.age, 30);
    assert.equal(typeof u.id, 'number');
    assert.equal(u._isNew, false);
    await knex.destroy();
});

test('create() accepts an array of docs and returns an array', async () => {
    const { User, knex } = await makeUserModel();
    const docs = await User.create([
        { name: 'Bob', age: 20 },
        { name: 'Carol', age: 25 },
    ]);
    assert.ok(Array.isArray(docs));
    assert.equal(docs.length, 2);
    await knex.destroy();
});

test('findOne() returns the matching document or null', async () => {
    const { User, knex } = await makeUserModel();
    await User.create({ name: 'A', age: 1 });
    await User.create({ name: 'B', age: 2 });
    const found = await User.findOne({ name: 'B' });
    assert.equal(found.age, 2);
    const missing = await User.findOne({ name: 'Z' });
    assert.equal(missing, null);
    await knex.destroy();
});

test('find() returns an array of documents', async () => {
    const { User, knex } = await makeUserModel();
    await User.create([{ name: 'X' }, { name: 'Y' }, { name: 'Z' }]);
    const all = await User.find({});
    assert.equal(all.length, 3);
    await knex.destroy();
});

test('updateOne() applies a $set and reports modifiedCount', async () => {
    const { User, knex } = await makeUserModel();
    await User.create({ name: 'Foo', age: 10 });
    const res = await User.updateOne({ name: 'Foo' }, { $set: { age: 99 } });
    assert.equal(res.acknowledged, true);
    assert.equal(res.modifiedCount, 1);
    const fresh = await User.findOne({ name: 'Foo' });
    assert.equal(fresh.age, 99);
    await knex.destroy();
});

test('deleteOne() removes a single row', async () => {
    const { User, knex } = await makeUserModel();
    await User.create([{ name: 'A' }, { name: 'B' }]);
    const res = await User.deleteOne({ name: 'A' });
    assert.equal(res.deletedCount, 1);
    const remaining = await User.find({});
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].name, 'B');
    await knex.destroy();
});

test('countDocuments() returns the count matching the filter', async () => {
    const { User, knex } = await makeUserModel();
    await User.create([
        { name: 'A', age: 1 },
        { name: 'B', age: 2 },
        { name: 'C', age: 1 },
    ]);
    const total = await User.countDocuments({});
    const ageOne = await User.countDocuments({ age: 1 });
    assert.equal(total, 3);
    assert.equal(ageOne, 2);
    await knex.destroy();
});

test('sort/limit/skip chaining produces the expected slice', async () => {
    const { User, knex } = await makeUserModel();
    await User.create([
        { name: 'A', age: 1 },
        { name: 'B', age: 2 },
        { name: 'C', age: 3 },
        { name: 'D', age: 4 },
    ]);
    const sortedDesc = await User.find({}).sort('-age');
    assert.equal(sortedDesc[0].name, 'D');
    assert.equal(sortedDesc[3].name, 'A');
    const skipped = await User.find({}).sort('age').skip(1).limit(2);
    assert.equal(skipped.length, 2);
    assert.equal(skipped[0].name, 'B');
    assert.equal(skipped[1].name, 'C');
    await knex.destroy();
});

test('lean() returns a plain object (no document methods)', async () => {
    const { User, knex } = await makeUserModel();
    await User.create({ name: 'lean', age: 5 });
    const plain = await User.findOne({ name: 'lean' }).lean();
    assert.equal(typeof plain.save, 'undefined');
    assert.equal(typeof plain.toObject, 'undefined');
    assert.equal(plain.name, 'lean');
    await knex.destroy();
});

test('$inc operator increases a numeric field', async () => {
    const { User, knex } = await makeUserModel();
    const u = await User.create({ name: 'counter', age: 10 });
    await User.updateOne({ id: u.id }, { $inc: { age: 5 } });
    const fresh = await User.findOne({ id: u.id });
    assert.equal(fresh.age, 15);
    await knex.destroy();
});

test('$or filter is translated to a SQL OR', async () => {
    const { User, knex } = await makeUserModel();
    await User.create([
        { name: 'a', age: 1 },
        { name: 'b', age: 2 },
        { name: 'c', age: 3 },
    ]);
    const matches = await User.find({ $or: [{ name: 'a' }, { age: 3 }] });
    const names = matches.map((m) => m.name).sort();
    assert.deepEqual(names, ['a', 'c']);
    await knex.destroy();
});

test('findById() resolves to the document with that id', async () => {
    const { User, knex } = await makeUserModel();
    const u = await User.create({ name: 'id-test' });
    const found = await User.findById(u.id);
    assert.equal(found.name, 'id-test');
    await knex.destroy();
});

test('findOneAndUpdate with upsert: true creates the row if missing', async () => {
    const { User, knex } = await makeUserModel();
    const doc = await User.findOneAndUpdate(
        { name: 'new-user' },
        { $set: { name: 'new-user', age: 42 } },
        { upsert: true, new: true }
    );
    assert.equal(doc.age, 42);
    const again = await User.findOne({ name: 'new-user' });
    assert.equal(again.age, 42);
    await knex.destroy();
});

test('document.save() updates the row in place', async () => {
    const { User, knex } = await makeUserModel();
    const u = await User.create({ name: 'mutable', age: 1 });
    u.age = 7;
    u.name = 'changed';
    await u.save();
    const fresh = await User.findOne({ id: u.id });
    assert.equal(fresh.age, 7);
    assert.equal(fresh.name, 'changed');
    await knex.destroy();
});

test('aggregate() handles $match, $group, $sort, $limit', async () => {
    const { User, knex } = await makeUserModel();
    await User.create([
        { name: 'A', age: 1, role: 'admin' },
        { name: 'B', age: 2, role: 'user' },
        { name: 'C', age: 3, role: 'admin' },
        { name: 'D', age: 4, role: 'admin' },
    ]);
    const grouped = await User.aggregate([
        { $match: {} },
        { $group: { _id: '$role', count: { $sum: 1 }, totalAge: { $sum: '$age' } } },
        { $sort: { _id: 1 } },
    ]);
    assert.equal(grouped.length, 2);
    const admin = grouped.find((g) => g._id === 'admin');
    assert.equal(admin.count, 3);
    assert.equal(admin.totalAge, 8);
    await knex.destroy();
});

test('exists() returns a stub for matching rows, null otherwise', async () => {
    const { User, knex } = await makeUserModel();
    await User.create({ name: 'here' });
    const present = await User.exists({ name: 'here' });
    assert.ok(present);
    assert.equal(present.id, 1);
    const absent = await User.exists({ name: 'gone' });
    assert.equal(absent, null);
    await knex.destroy();
});

test('Buffer payloads round-trip through create/find', async () => {
    const { knex } = await makeUserModel();
    // Drop and replace with a binary-friendly table
    await knex.schema.dropTableIfExists('test_poll');
    await knex.schema.createTable('test_poll', (t) => {
        t.increments('id').primary();
        t.string('pollId').notNullable();
        t.string('chat').notNullable();
        t.text('question');
        t.binary('messageSecret');
    });
    const schema = createSchema({
        pollId: { type: String },
        chat: { type: String },
        question: { type: String },
        messageSecret: { type: Buffer },
    });
    const Poll = defineModel('test_poll', schema, { knex });
    const secret = Buffer.from([0x01, 0x02, 0x03, 0xab, 0xcd]);
    const created = await Poll.create({
        pollId: 'p1',
        chat: 'c1',
        question: 'Q',
        messageSecret: secret,
    });
    const found = await Poll.findOne({ pollId: 'p1' });
    assert.ok(Buffer.isBuffer(found.messageSecret));
    assert.deepEqual(Array.from(found.messageSecret), [0x01, 0x02, 0x03, 0xab, 0xcd]);
    await knex.destroy();
});

test('array fields round-trip through create, update, save, and lean', async () => {
    const knex = freshKnex();
    await knex.schema.createTable('test_settings', (t) => {
        t.increments('id').primary();
        t.text('owners');
    });
    const Settings = defineModel(
        'test_settings',
        createSchema({ owners: { type: [String], default: [] } }),
        { knex }
    );

    const settings = await Settings.create({ owners: ['a'] });
    assert.deepEqual(settings.owners, ['a']);
    await Settings.updateOne({ id: settings.id }, { $set: { owners: ['b', 'c'] } });
    const updated = await Settings.findOne({ id: settings.id });
    assert.deepEqual(updated.owners, ['b', 'c']);
    updated.owners = ['d'];
    await updated.save();
    assert.deepEqual((await Settings.findOne({ id: settings.id }).lean()).owners, ['d']);
    await knex.destroy();
});

test('Date fields use epoch-ms storage and support range filters', async () => {
    const knex = freshKnex();
    await knex.schema.createTable('test_dates', (t) => {
        t.increments('id').primary();
        t.bigInteger('createdAt');
    });
    const Event = defineModel(
        'test_dates',
        createSchema({ createdAt: { type: Date } }),
        { knex }
    );
    const oldDate = new Date('2025-01-01T00:00:00.000Z');
    const newDate = new Date('2026-01-01T00:00:00.000Z');
    await Event.create([{ createdAt: oldDate }, { createdAt: newDate }]);

    const raw = await knex('test_dates').orderBy('id');
    assert.equal(Number(raw[0].createdAt), oldDate.getTime());
    const oldEvents = await Event.find({ createdAt: { $lt: newDate } });
    assert.equal(oldEvents.length, 1);
    assert.ok(oldEvents[0].createdAt instanceof Date);
    assert.equal(oldEvents[0].createdAt.getTime(), oldDate.getTime());
    await knex.destroy();
});

test('timestamps option writes camelCase columns', async () => {
    const { User, knex } = await makeUserModel();
    const user = await User.create({ name: 'timestamped' });
    assert.ok(user.createdAt);
    await User.updateOne({ id: user.id }, { $set: { age: 2 } });
    const row = await knex('test_users').where('id', user.id).first();
    assert.ok(row.updatedAt);
    await knex.destroy();
});

test('on-disk SQLite file works via tmpdir', async () => {
    const tmp = path.join(
        os.tmpdir(),
        `adapter-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`
    );
    const knex = knexFactory({
        client: 'better-sqlite3',
        connection: { filename: tmp },
        useNullAsDefault: true,
    });
    setKnex(knex);
    await knex.schema.createTable('file_test', (t) => {
        t.increments('id').primary();
        t.string('name');
    });
    const M = defineModel('file_test', createSchema({ name: { type: String } }), { knex });
    await M.create({ name: 'persisted' });
    const found = await M.findOne({ name: 'persisted' });
    assert.equal(found.name, 'persisted');
    await knex.destroy();
    fs.unlinkSync(tmp);
});
