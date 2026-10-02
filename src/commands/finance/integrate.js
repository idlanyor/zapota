import logger from '../../utils/logger.js';
import { ensureUser, resolveUser, attachIdentity, coreRequest } from '../../services/kanataCore.js';
import { resolveSenderInfo } from '../../utils/phoneLookup.js';

export default {
    name: 'integrate',
    aliases: ['webauth', 'weblogin'],
    description: 'Generate atau atur password untuk login ke Dashboard Web',
    category: 'Finance',
    execute: async (sock, m, args) => {
        try {
            const userId = m.sender;
            const { canonicalJid, phoneNumber } = await resolveSenderInfo(m);
            const password = args[0];

            if (!password) {
                return m.reply(
                    `*INTEGRASI DASHBOARD WEB*\n\nGunakan perintah ini untuk mengatur password login ke dashboard web finansial kamu.\n\n*Cara Pakai:*\n.integrate <password_pilihan_kamu>\n\n*Detail Login Web:*\nUsername: \`${phoneNumber}\`\nPassword: (Sesuai yang kamu atur)\n\n_Catatan: Jangan berikan password ini kepada siapapun._`
                );
            }

            if (password.length < 12) {
                return m.reply('Password minimal harus 12 karakter.');
            }

            // Cari user yang sudah ada berdasarkan phone number, canonical JID, atau userId
            let user = null;
            if (phoneNumber && /^\d{8,15}$/.test(phoneNumber)) {
                user = await resolveUser(phoneNumber);
            }
            if (!user && canonicalJid && canonicalJid.endsWith('@s.whatsapp.net')) {
                user = await resolveUser(canonicalJid);
            }
            if (!user && userId) {
                user = await resolveUser(userId);
            }

            // Jika belum ada user, buat baru di Kanata Core
            if (!user) {
                const primaryValue =
                    phoneNumber && /^\d{8,15}$/.test(phoneNumber)
                        ? phoneNumber
                        : canonicalJid || userId;
                user = await ensureUser({
                    value: primaryValue,
                    displayName: m.pushName || 'User',
                    role: m.isOwner ? 'owner' : 'user',
                });
            }
            if (!user) throw new Error('Gagal mendaftarkan user ke Core');

            // Sinkronkan role owner bila user adalah owner bot
            if (m.isOwner && user.role !== 'owner') {
                await coreRequest('PATCH', `/v1/users/${user.id}`, { role: 'owner' });
            }

            // Hubungkan semua identitas ke user ID yang sama di Kanata Core
            const identitiesToAttach = new Set();
            if (phoneNumber && /^\d{8,15}$/.test(phoneNumber)) {
                identitiesToAttach.add(phoneNumber);
            }
            if (canonicalJid && canonicalJid.endsWith('@s.whatsapp.net')) {
                identitiesToAttach.add(canonicalJid);
            }
            if (userId) {
                identitiesToAttach.add(userId);
            }
            for (const alt of [m.key?.participantAlt, m.key?.remoteJidAlt, m.chatAlt].filter(Boolean)) {
                if (typeof alt === 'string') identitiesToAttach.add(alt);
            }

            for (const ident of identitiesToAttach) {
                try {
                    await attachIdentity({
                        userId: user.id,
                        value: ident,
                        isPrimary: ident === phoneNumber,
                        claim: true,
                    });
                } catch (e) {
                    logger.warn(`Gagal attach identity ${ident} ke user ${user.id}: ${e.message}`);
                }
            }

            // Set password user di Kanata Core
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
