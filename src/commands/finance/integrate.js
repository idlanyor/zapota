import logger from '../../utils/logger.js';
import { ensureUser, coreRequest } from '../../services/kanataCore.js';

export default {
    name: 'integrate',
    aliases: ['webauth', 'weblogin'],
    description: 'Generate atau atur password untuk login ke Dashboard Web',
    category: 'Finance',
    execute: async (sock, m, args) => {
        try {
            const userId = m.sender;
            const alternateJids = [m.key?.participantAlt, m.key?.remoteJidAlt, m.chatAlt].filter(
                Boolean
            );
            const canonicalJid =
                alternateJids.find((jid) => jid.endsWith('@s.whatsapp.net')) || userId;
            const phoneNumber = canonicalJid.split('@')[0].split(':')[0];
            const password = args[0];

            if (!password) {
                return m.reply(
                    `*INTEGRASI DASHBOARD WEB*\n\nGunakan perintah ini untuk mengatur password login ke dashboard web finansial kamu.\n\n*Cara Pakai:*\n.integrate <password_pilihan_kamu>\n\n*Detail Login Web:*\nUsername: \`${phoneNumber}\`\nPassword: (Sesuai yang kamu atur)\n\n_Catatan: Jangan berikan password ini kepada siapapun._`
                );
            }

            if (password.length < 12) {
                return m.reply('Password minimal harus 12 karakter.');
            }

            // Pastikan user terdaftar di Kanata Core, lalu set password.
            const user = await ensureUser({ value: userId, displayName: m.pushName || 'User' });
            if (!user) throw new Error('Gagal mendaftarkan user ke Core');

            const res = await coreRequest('POST', `/v1/users/${user.id}/password`, { password });
            if (!res.ok) throw new Error(res.error || 'Gagal set password');

            await m.reply(
                `*BERHASIL!*\n\nPassword dashboard web kamu telah diatur.\n\n*Link Web:* https://kanata.irengcloud.com\n*Username:* \`${phoneNumber}\`\n\nPassword tidak ditampilkan ulang demi keamanan.`
            );
        } catch (error) {
            logger.error(`Integrate Error: ${error.message}`);
            await m.reply('Terjadi kesalahan saat mengatur password integrasi.');
        }
    },
};
