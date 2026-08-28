import mongoose from 'mongoose';
import knexFactory from 'knex';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load dotenv manually
import dotenv from 'dotenv';
dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mywhatsappbot';
const dbPath = process.env.SQLITE_PATH || path.resolve(__dirname, '../data/bot.db');

console.log('Connecting to MongoDB:', mongoUri);
console.log('Connecting to SQLite:', dbPath);

if (!fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const knex = knexFactory({
    client: 'better-sqlite3',
    connection: {
        filename: dbPath,
    },
    useNullAsDefault: true,
});

async function main() {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB.');

    // 1. Migrate Users
    console.log('\n--- Migrating Users ---');
    const MongoUser = mongoose.connection.db.collection('users');
    const users = await MongoUser.find({}).toArray();
    console.log(`Found ${users.length} users in MongoDB.`);

    // Clear existing SQLite users to avoid duplicate key errors on rerun
    await knex('users').del();

    let userCount = 0;
    for (const u of users) {
        try {
            await knex('users').insert({
                jid: u.jid,
                phoneNumber: u.phoneNumber || '',
                name: u.name || '',
                role: u.role || 'user',
                balance: u.balance || 0,
                emailCloud: u.emailCloud || '',
                webPassword: u.webPassword || null,
                createdAt: u.createdAt
                    ? new Date(u.createdAt).toISOString()
                    : new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
            userCount++;
        } catch (err) {
            console.error(`Failed to insert user ${u.jid}:`, err.message);
        }
    }
    console.log(`Migrated ${userCount} users.`);

    // 2. Migrate Transactions
    console.log('\n--- Migrating Transactions ---');
    const MongoTx = mongoose.connection.db.collection('transactions');
    const txs = await MongoTx.find({}).toArray();
    console.log(`Found ${txs.length} transactions in MongoDB.`);

    await knex('transactions').del();

    let txCount = 0;
    for (const tx of txs) {
        try {
            await knex('transactions').insert({
                userId: tx.userId,
                userName: tx.userName || '',
                type: tx.type,
                amount: tx.amount,
                category: tx.category || 'General',
                source: tx.source || 'other',
                description: tx.description || '',
                kakeiboCategory: tx.kakeiboCategory || null,
                date: tx.date ? new Date(tx.date).toISOString() : new Date().toISOString(),
                createdAt: tx.createdAt
                    ? new Date(tx.createdAt).toISOString()
                    : new Date().toISOString(),
                updatedAt: tx.updatedAt
                    ? new Date(tx.updatedAt).toISOString()
                    : new Date().toISOString(),
            });
            txCount++;
        } catch (err) {
            console.error(`Failed to insert transaction for user ${tx.userId}:`, err.message);
        }
    }
    console.log(`Migrated ${txCount} transactions.`);

    // 3. Migrate Servers
    console.log('\n--- Migrating Servers ---');
    const MongoServer = mongoose.connection.db.collection('servers');
    const servers = await MongoServer.find({}).toArray();
    console.log(`Found ${servers.length} servers in MongoDB.`);

    await knex('servers').del();

    let serverCount = 0;
    for (const s of servers) {
        try {
            await knex('servers').insert({
                userId: s.userId,
                pteroId: s.pteroId,
                identifier: s.identifier,
                planName: s.planName,
                price: s.price,
                status: s.status || 'active',
                expiredAt: s.expiredAt ? new Date(s.expiredAt).toISOString() : null,
                autoRenewEnabled: s.autoRenewEnabled === false ? 0 : 1,
                autoRenewCycleDays: s.autoRenewCycleDays || 30,
                lastAutoRenewFor: s.lastAutoRenewFor || '',
                lastAutoRenewAt: s.lastAutoRenewAt
                    ? new Date(s.lastAutoRenewAt).toISOString()
                    : null,
                lastRenewalNotifyFor: s.lastRenewalNotifyFor || '',
                suspendedAt: s.suspendedAt ? new Date(s.suspendedAt).toISOString() : null,
                createdAt: s.createdAt
                    ? new Date(s.createdAt).toISOString()
                    : new Date().toISOString(),
                updatedAt: s.updatedAt
                    ? new Date(s.updatedAt).toISOString()
                    : new Date().toISOString(),
            });
            serverCount++;
        } catch (err) {
            console.error(`Failed to insert server ${s.identifier}:`, err.message);
        }
    }
    console.log(`Migrated ${serverCount} servers.`);

    // 4. Migrate Budgets
    console.log('\n--- Migrating Budgets ---');
    const MongoBudget = mongoose.connection.db.collection('budgets');
    const budgets = await MongoBudget.find({}).toArray();
    console.log(`Found ${budgets.length} budgets in MongoDB.`);

    await knex('budgets').del();

    let budgetCount = 0;
    for (const b of budgets) {
        try {
            await knex('budgets').insert({
                userId: b.userId,
                month: b.month,
                year: b.year,
                incomeTarget: b.incomeTarget || 0,
                savingsTarget: b.savingsTarget || 0,
                note: b.note || '',
                createdAt: b.createdAt
                    ? new Date(b.createdAt).toISOString()
                    : new Date().toISOString(),
                updatedAt: b.updatedAt
                    ? new Date(b.updatedAt).toISOString()
                    : new Date().toISOString(),
            });
            budgetCount++;
        } catch (err) {
            console.error(`Failed to insert budget for ${b.userId} month ${b.month}:`, err.message);
        }
    }
    console.log(`Migrated ${budgetCount} budgets.`);

    // 5. Migrate Polls
    console.log('\n--- Migrating Polls ---');
    const MongoPoll = mongoose.connection.db.collection('polls');
    const polls = await MongoPoll.find({}).toArray();
    console.log(`Found ${polls.length} polls in MongoDB.`);

    await knex('polls').del();

    let pollCount = 0;
    for (const p of polls) {
        try {
            let secretBuffer = null;
            if (p.messageSecret) {
                if (p.messageSecret.buffer) {
                    secretBuffer = Buffer.from(p.messageSecret.buffer);
                } else if (Buffer.isBuffer(p.messageSecret)) {
                    secretBuffer = p.messageSecret;
                } else if (p.messageSecret.value) {
                    secretBuffer = Buffer.from(p.messageSecret.value, 'base64');
                }
            }
            await knex('polls').insert({
                pollId: p.pollId,
                chat: p.chat,
                question: p.question,
                options: Array.isArray(p.options) ? JSON.stringify(p.options) : '[]',
                messageSecret: secretBuffer,
                createdAt: p.createdAt
                    ? new Date(p.createdAt).toISOString()
                    : new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
            pollCount++;
        } catch (err) {
            console.error(`Failed to insert poll ${p.pollId}:`, err.message);
        }
    }
    console.log(`Migrated ${pollCount} polls.`);

    // 6. Migrate Settings
    console.log('\n--- Migrating Settings ---');
    const MongoSettings = mongoose.connection.db.collection('settings');
    const settingsList = await MongoSettings.find({}).toArray();
    console.log(`Found ${settingsList.length} settings in MongoDB.`);

    await knex('settings').del();

    let settingsCount = 0;
    for (const s of settingsList) {
        try {
            await knex('settings').insert({
                settingsId: s.id || 'bot_settings',
                disabledCommands: Array.isArray(s.disabledCommands)
                    ? JSON.stringify(s.disabledCommands)
                    : '[]',
                mode: s.mode || 'public',
                autoStatusRead: s.autoStatusRead ? 1 : 0,
                autoAiPrivate: s.autoAiPrivate ? 1 : 0,
                privateAiPersona:
                    s.privateAiPersona || 'Kamu adalah KanataBot, asisten pribadi AI yang cerdas.',
                mustJoinGroup: s.mustJoinGroup ? 1 : 0,
                smartMode: s.smartMode ? 1 : 0,
                groupInviteLink:
                    s.groupInviteLink || 'https://chat.whatsapp.com/I5JCuQnIo4f79JsZAGCvDD',
                cfToken: s.cfToken || '',
                cfAccountId: s.cfAccountId || '',
                cfZones: Array.isArray(s.cfZones) ? JSON.stringify(s.cfZones) : '[]',
                owners: Array.isArray(s.owners) ? JSON.stringify(s.owners) : '[]',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
            settingsCount++;
        } catch (err) {
            console.error(`Failed to insert settings ${s.id}:`, err.message);
        }
    }
    console.log(`Migrated ${settingsCount} settings.`);

    // 7. Migrate Vouchers
    console.log('\n--- Migrating Vouchers ---');
    const MongoVoucher = mongoose.connection.db.collection('vouchers');
    const vouchers = await MongoVoucher.find({}).toArray();
    console.log(`Found ${vouchers.length} vouchers in MongoDB.`);

    await knex('vouchers').del();

    let voucherCount = 0;
    for (const v of vouchers) {
        try {
            await knex('vouchers').insert({
                code: v.code,
                value: v.value,
                quota: v.quota || 1,
                usedBy: Array.isArray(v.usedBy) ? JSON.stringify(v.usedBy) : '[]',
                isPublic: v.isPublic ? 1 : 0,
                expiredAt: v.expiredAt ? new Date(v.expiredAt).toISOString() : null,
                createdAt: v.createdAt
                    ? new Date(v.createdAt).toISOString()
                    : new Date().toISOString(),
                updatedAt: v.updatedAt
                    ? new Date(v.updatedAt).toISOString()
                    : new Date().toISOString(),
            });
            voucherCount++;
        } catch (err) {
            console.error(`Failed to insert voucher ${v.code}:`, err.message);
        }
    }
    console.log(`Migrated ${voucherCount} vouchers.`);
}

main()
    .catch((err) => {
        console.error('Fatal migration error:', err);
    })
    .finally(async () => {
        await mongoose.disconnect();
        await knex.destroy();
        console.log('\nDone.');
    });
