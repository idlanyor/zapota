import axios from 'axios';
import { settings } from '../../config/settings.js';

const PTERO_URL = process.env.PTERO_URL;
const PTERO_API_KEY = process.env.PTERO_API_KEY;

const ptero = axios.create({
    baseURL: `${PTERO_URL}/api/application`,
    headers: {
        Authorization: `Bearer ${PTERO_API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'Application/vnd.pterodactyl.v1+json',
    },
});

export default {
    name: 'bind',
    description: 'Bind your existing Pterodactyl account to your WhatsApp number',
    category: 'Panel',
    execute: async (sock, m, args, text) => {
        const email = args[0];
        if (!email || !email.includes('@')) {
            return m.reply(
                `Usage: ${settings.prefix}bind <your_ptero_email>\nExample: ${settings.prefix}bind user@gmail.com`
            );
        }

        try {
            await m.react('⏳');

            // 1. Check if this WhatsApp number is already bound to ANY account
            const checkJidResp = await ptero.get(`/users?filter[external_id]=${m.sender}`);
            if (checkJidResp.data.data.length > 0) {
                const existing = checkJidResp.data.data[0].attributes;
                await m.react('❌');
                return m.reply(
                    `Nomor WhatsApp Anda sudah terhubung dengan akun: *${existing.username}* (${existing.email}).\nSatu nomor hanya boleh memiliki satu akun.`
                );
            }

            // 2. Find user by email
            const usersResp = await ptero.get(`/users?filter[email]=${email}`);

            if (usersResp.data.data.length === 0) {
                await m.react('❌');
                return m.reply('Akun dengan email tersebut tidak ditemukan di panel.');
            }

            const pteroUser = usersResp.data.data[0].attributes;

            // 3. Check if the Pterodactyl account is already bound to another WhatsApp number
            if (pteroUser.external_id && pteroUser.external_id !== '') {
                await m.react('❌');
                return m.reply(
                    'Akun Pterodactyl tersebut sudah terhubung dengan nomor WhatsApp lain.'
                );
            }

            // 4. Update external_id with WhatsApp JID
            await ptero.patch(`/users/${pteroUser.id}`, {
                email: pteroUser.email,
                username: pteroUser.username,
                first_name: pteroUser.first_name,
                last_name: pteroUser.last_name,
                external_id: m.sender,
            });

            await m.reply(
                `Berhasil! Akun *${pteroUser.username}* (${pteroUser.email}) sekarang telah terhubung dengan nomor WhatsApp Anda.`
            );
            await m.react('✅');
        } catch (error) {
            console.error('Bind Error:', error.response?.data || error.message);
            const detail = error.response?.data?.errors?.[0]?.detail || error.message;
            await m.react('❌');
            await m.reply(`Gagal menghubungkan akun: ${detail}`);
        }
    },
};
