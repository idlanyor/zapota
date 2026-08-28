import User from '../../database/models/User.js';
import { settings } from '../../config/settings.js';
import axios from 'axios';

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
    name: 'addbalance',
    aliases: ['addbal', 'topup'],
    description: 'Add balance to a user via Ptero Email (Owner only)',
    category: 'Owner',
    execute: async (sock, m, args, text) => {
        // Cari mention atau JID (@s.whatsapp.net atau @lid) dari args
        let targetJid =
            m.mentionedJid?.[0] ||
            args.find((arg) => arg.includes('@s.whatsapp.net') || arg.includes('@lid'));

        // Jika tidak ada JID/Mention, anggap argumen pertama yang bukan angka sebagai Email
        let emailInput = !targetJid
            ? args.find((arg) => arg.includes('@') && !arg.startsWith('@'))
            : null;

        // Cari jumlah (angka)
        const amount = parseInt(args.find((arg) => !isNaN(arg) && !arg.includes('@')));

        if ((!targetJid && !emailInput) || isNaN(amount)) {
            return m.reply(
                `*Format Salah!*

` +
                    `Gunakan:
` +
                    `• ${settings.prefix}addbalance <@tag/email/JID> <jumlah>

` +
                    `Contoh:
` +
                    `• ${settings.prefix}addbalance @user 50000
` +
                    `• ${settings.prefix}addbalance user@gmail.com 50000
` +
                    `• ${settings.prefix}addbalance 628xxx@s.whatsapp.net 50000`
            );
        }

        try {
            let pteroUser = null;

            await m.reply('Memvalidasi akun di panel Pterodactyl...');

            // 1. Validasi berdasarkan JID (Target JID sudah ketemu)
            if (targetJid) {
                const usersResp = await ptero.get(`/users?filter[external_id]=${targetJid}`);

                if (usersResp.data.data.length > 0) {
                    pteroUser = usersResp.data.data[0].attributes;
                } else {
                    return m.reply(`*TOPUP GAGAL*

User dengan ID *${targetJid.split('@')[0]}* belum terhubung (bind) dengan akun Pterodactyl manapun.
Silakan minta user untuk melakukan .bind <email> terlebih dahulu.`);
                }
            } else if (emailInput) {
                // 2. Validasi berdasarkan Email
                const usersResp = await ptero.get(`/users?filter[email]=${emailInput}`);

                if (usersResp.data.data.length > 0) {
                    pteroUser = usersResp.data.data[0].attributes;
                    targetJid = pteroUser.external_id;

                    if (!targetJid || !targetJid.includes('@')) {
                        return m.reply(`*TOPUP GAGAL*

Akun Ptero dengan email *${emailInput}* ditemukan, tetapi belum terhubung (bind) dengan WhatsApp.
Silakan minta user untuk melakukan .bind ${emailInput} terlebih dahulu.`);
                    }
                } else {
                    return m.reply(`*TOPUP GAGAL*

Email *${emailInput}* tidak ditemukan di panel Pterodactyl.`);
                }
            }

            // 3. Update saldo di database bot
            let user = await User.findOne({ jid: targetJid });
            if (!user) {
                user = await User.create({ jid: targetJid });
            }

            user.balance += amount;
            await user.save();

            const userNotice =
                `*PEMBERITAHUAN TOPUP*\n\n` +
                `Halo @${targetJid.split('@')[0]},\n` +
                `Saldo Anda telah berhasil ditambahkan sebesar *Rp ${amount.toLocaleString()}* oleh Owner.\n\n` +
                `*Saldo Sekarang:* Rp ${user.balance.toLocaleString()}\n\n` +
                `Terima kasih telah menggunakan layanan kami!`;

            await sock.sendMessage(targetJid, {
                text: userNotice,
                mentions: [targetJid],
            });

            const successMsg = `*TOPUP BERHASIL*

Email: ${pteroUser.email}
WhatsApp: @${targetJid.split('@')[0]}
Jumlah: + Rp ${amount.toLocaleString()}
Saldo Sekarang: Rp ${user.balance.toLocaleString()}`;

            await sock.sendMessage(
                m.chat,
                {
                    text: successMsg,
                    mentions: [targetJid],
                },
                { quoted: m }
            );
        } catch (e) {
            console.error(e);
            await m.reply(`Error: ${e.message}`);
        }
    },
};
