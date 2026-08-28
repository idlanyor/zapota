import { createPteroUser, getPteroUserByJid } from '../../services/pterodactyl.js';
import { settings } from '../../config/settings.js';
import crypto from 'crypto';

export default {
    name: 'register',
    aliases: ['daftar'],
    description: 'Register a new Pterodactyl account',
    category: 'Utility',
    execute: async (sock, m, args, text) => {
        const email = args[0];
        const senderSeed = m.sender.split('@')[0].slice(-4);
        const rawName = String(m.pushName || '').toLowerCase();
        const cleaned = rawName
            .replace(/[^a-z0-9._-]+/g, '')
            .replace(/^[^a-z0-9]+/, '')
            .replace(/[^a-z0-9]+$/, '');
        const usernameBase = cleaned || `user${senderSeed}`;

        if (!email || !email.includes('@')) {
            return m.reply(
                `Usage: ${settings.prefix}register <email>\nExample: ${settings.prefix}register buyer@gmail.com`
            );
        }

        try {
            // 1. Check if WhatsApp already bound
            const existing = await getPteroUserByJid(m.sender);
            if (existing) {
                return m.reply(
                    `Nomor WhatsApp Anda sudah terdaftar dengan akun: *${existing.username}* (${existing.email}).\nTidak perlu mendaftar lagi.`
                );
            }

            await m.react('⏳');

            // 2. Generate Random Password
            const password = crypto.randomBytes(4).toString('hex') + 'Aa1!';

            // 3. Create User in Pterodactyl
            const newUser = await createPteroUser({
                username: `${usernameBase.slice(0, 12)}${crypto.randomBytes(2).toString('hex')}`, // Unique + valid username
                email: email,
                firstName: m.pushName || 'WhatsApp',
                lastName: 'User',
                externalId: m.sender, // Bind to WhatsApp JID
            });

            // Note: Application API does NOT set password on create directly in some versions,
            // but we can try to update it immediately or let user use "Forgot Password".
            // However, most panels allow setting it during creation or via update.
            // Let's use the update library function we made to set the password.

            await import('../../services/pterodactyl.js').then(async (lib) => {
                await lib.updatePteroUser(newUser.id, {
                    email: newUser.email,
                    username: newUser.username,
                    first_name: newUser.first_name,
                    last_name: newUser.last_name,
                    password: password,
                });
            });

            const successMsg =
                `*REGISTRASI BERHASIL!*\n\n` +
                `Berikut detail akun panel Anda:\n` +
                `+ URL: ${process.env.PTERO_URL}\n` +
                `+ Username: ${newUser.username}\n` +
                `+ Email: ${newUser.email}\n` +
                `+ Password: ${password}\n\n` +
                `_Silakan simpan data ini dan segera ganti password Anda di panel atau gunakan .profile edit password_`;

            await m.reply(successMsg);
            await m.react('✅');
        } catch (error) {
            console.error('Register Error:', error.response?.data || error.message);
            const detail = error.response?.data?.errors?.[0]?.detail || error.message;

            if (detail.includes('already exists')) {
                await m.react('❌');
                return m.reply(
                    'Email atau Username tersebut sudah terdaftar di panel. Jika itu milik Anda, gunakan .bind <email> untuk menghubungkan.'
                );
            }

            await m.react('❌');
            await m.reply(`Gagal registrasi: ${detail}`);
        }
    },
};
