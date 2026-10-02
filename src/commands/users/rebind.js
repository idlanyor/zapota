import User from '../../database/models/User.js';
import { resolveSenderInfo } from '../../utils/phoneLookup.js';
import { resolveUser, ensureUser, attachIdentity, coreRequest } from '../../services/kanataCore.js';
import logger from '../../utils/logger.js';

export default {
    name: 'rebind',
    aliases: ['bindpn', 'updateno'],
    description: 'Sinkronisasi nomor WhatsApp ke database dan web dashboard',
    category: 'Users',
    execute: async (sock, m, args, text) => {
        try {
            const { canonicalJid, phoneNumber } = await resolveSenderInfo(m);

            if (!phoneNumber || !canonicalJid || !canonicalJid.includes('@s.whatsapp.net')) {
                return m.reply(
                    '❌ Gagal mendeteksi nomor WhatsApp asli kamu. Pastikan kamu tidak mengirim pesan dari nomor yang sama dengan bot.'
                );
            }

            // 1. Update legacy User model
            try {
                let user = await User.findOne({ jid: m.sender });
                if (!user) {
                    user = await User.create({
                        jid: m.sender,
                        name: m.pushName || '',
                    });
                }
                user.phoneNumber = phoneNumber;
                await user.save();
            } catch (err) {
                logger.warn(`Legacy User model rebind error: ${err.message}`);
            }

            // 2. Sync ke Kanata Core
            try {
                let coreUser = await resolveUser(phoneNumber);
                if (!coreUser && canonicalJid) coreUser = await resolveUser(canonicalJid);
                if (!coreUser && m.sender) coreUser = await resolveUser(m.sender);

                if (!coreUser) {
                    coreUser = await ensureUser({
                        value: phoneNumber,
                        displayName: m.pushName || 'User',
                        role: m.isOwner ? 'owner' : 'user',
                    });
                }

                if (coreUser) {
                    if (m.isOwner && coreUser.role !== 'owner') {
                        await coreRequest('PATCH', `/v1/users/${coreUser.id}`, { role: 'owner' });
                    }

                    const identities = new Set([phoneNumber, canonicalJid, m.sender].filter(Boolean));
                    for (const alt of [m.key?.participantAlt, m.key?.remoteJidAlt, m.chatAlt].filter(Boolean)) {
                        if (typeof alt === 'string') identities.add(alt);
                    }

                    for (const ident of identities) {
                        try {
                            await attachIdentity({
                                userId: coreUser.id,
                                value: ident,
                                isPrimary: ident === phoneNumber,
                                claim: true,
                            });
                        } catch (e) {
                            logger.warn(`Core attach identity ${ident} error: ${e.message}`);
                        }
                    }
                }
            } catch (err) {
                logger.warn(`Core rebind error: ${err.message}`);
            }

            await m.reply(
                `✅ *REBIND BERHASIL*\n\n` +
                    `*ID (LID / JID):* ${m.sender}\n` +
                    `*Nomor WA:* ${phoneNumber}\n\n` +
                    `Data identitas kamu sekarang sudah tersinkronisasi di dashboard web.`
            );
        } catch (err) {
            console.error('Rebind Error:', err);
            await m.reply('❌ Terjadi kesalahan saat melakukan rebind.');
        }
    },
};
