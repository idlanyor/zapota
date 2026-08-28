import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './src/database/models/User.js';

dotenv.config();

async function debug() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        const targetJid = '79444496625700@lid';
        console.log(`Searching for user: ${targetJid}`);

        const user = await User.findOne({ jid: targetJid });

        if (user) {
            console.log('--- USER DATA FOUND ---');
            console.log(JSON.stringify(user, null, 2));
        } else {
            console.log('User not found. Printing last 5 users instead:');
            const users = await User.find().sort({ createdAt: -1 }).limit(5);
            console.log(JSON.stringify(users, null, 2));
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error('Debug Error:', err);
    }
}

debug();
