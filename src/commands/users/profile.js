import { getPteroUserByJid, updatePteroProfile } from '../../services/pterodactyl.js';
import { settings } from '../../config/settings.js';
import User from '../../database/models/User.js';

export default {
    name: 'profile',
    aliases: ['me', 'akun'],
    description: 'View or edit your Pterodactyl profile',
    category: 'Utility',
    execute: async (sock, m, args, text) => {
        try {
            const pteroUser = await getPteroUserByJid(m.sender);
            const dbUser = await User.findOne({ jid: m.sender });
            const balance = dbUser ? dbUser.balance : 0;

            if (!pteroUser) {
                return m.reply(
                    `Akun WhatsApp Anda belum terhubung ke Pterodactyl.\n\nSaldo Bot: Rp ${balance.toLocaleString()}\n\nGunakan ${settings.prefix}bind <email> untuk menghubungkan akun.`
                );
            }

            const sub = args[0]?.toLowerCase();

            if (sub === 'edit') {
                const field = args[1]?.toLowerCase();
                const value = args.slice(2).join(' ');

                const allowedFields = ['username', 'email', 'first_name', 'last_name'];
                if (!field || !value || !allowedFields.includes(field)) {
                    return m.reply(
                        `Usage: ${settings.prefix}profile edit <field> <value>\nFields: ${allowedFields.join(', ')}`
                    );
                }

                await m.react('⏳');

                const updateData = {
                    email: pteroUser.email,
                    username: pteroUser.username,
                    first_name: pteroUser.first_name,
                    last_name: pteroUser.last_name,
                    [field]: value,
                };

                await updatePteroProfile(pteroUser.id, updateData);
                await m.react('✅');
                return m.reply(`Berhasil! Field *${field}* telah diubah menjadi: ${value}`);
            }

            // Show Profile Info
            let msg = `*USER PROFILE*\n\n`;
            msg += `+ Nama: ${pteroUser.first_name} ${pteroUser.last_name}\n`;
            msg += `+ Username: ${pteroUser.username}\n`;
            msg += `+ Email: ${pteroUser.email}\n`;
            msg += `+ Ptero ID: ${pteroUser.id}\n`;
            msg += `+ Saldo Bot: Rp ${balance.toLocaleString()}\n\n`;
            msg += `*Cara Edit:* \n${settings.prefix}profile edit <field> <value>\n`;
            msg += `Contoh: ${settings.prefix}profile edit first_name Budi`;

            await m.reply(msg);
        } catch (error) {
            console.error(error);
            const detail = error.response?.data?.errors?.[0]?.detail || error.message;
            await m.reply(`Gagal mengambil/mengedit profile: ${detail}`);
        }
    },
};
