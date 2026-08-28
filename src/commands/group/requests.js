import { jidNormalizedUser } from '../../wa/helpers.js';

export default [
    {
        name: 'listpending',
        aliases: ['pending', 'listreq'],
        description: 'Liat daftar calon member yang nunggu approval admin',
        category: 'Group',
        execute: async (sock, m, args, text) => {
            if (!m.isGroup) return m.reply('Hanya bisa di grup!');

            const groupMetadata = await sock.groupMetadata(m.chat);
            const isAdmin = groupMetadata.participants.find(
                (p) =>
                    jidNormalizedUser(p.id) === jidNormalizedUser(m.sender) &&
                    (p.admin || p.id === groupMetadata.owner)
            );
            if (!isAdmin) return m.reply('Hanya admin yang bisa liat daftar pending!');

            try {
                const pending = await sock.groupRequestParticipantsList(m.chat);
                if (!pending || pending.length === 0)
                    return m.reply('Gak ada permintaan join yang pending saat ini.');

                let resText = `*── 「 PENDING JOIN REQUESTS 」 ──*\n\n`;
                pending.forEach((user, i) => {
                    const number = user.jid.split('@')[0];
                    resText += `${i + 1}. Nomor: *${number}*\n   ID: \`${user.jid}\`\n\n`;
                });
                resText += `*Cara Approve:* .approve 628xxx\n*Cara Reject:* .reject 628xxx`;

                m.reply(resText);
            } catch (err) {
                console.error(err);
                m.reply(
                    'Gagal mengambil daftar pending. Pastikan fitur "Admin Approval" aktif di grup ini.'
                );
            }
        },
    },
    {
        name: 'approve',
        aliases: ['acc'],
        description: 'Terima permintaan join member baru via nomor/JID',
        category: 'Group',
        execute: async (sock, m, args, text) => {
            if (!m.isGroup) return m.reply('Hanya bisa di grup!');

            const groupMetadata = await sock.groupMetadata(m.chat);
            const isAdmin = groupMetadata.participants.find(
                (p) =>
                    jidNormalizedUser(p.id) === jidNormalizedUser(m.sender) &&
                    (p.admin || p.id === groupMetadata.owner)
            );
            if (!isAdmin) return m.reply('Hanya admin yang bisa approve!');

            let target = args[0]?.replace(/[^0-9]/g, '');
            if (!target)
                return m.reply(
                    'Ketik nomor HP orang yang mau di-approve!\nContoh: .approve 62812345678'
                );

            const jid = target.includes('@') ? target : `${target}@s.whatsapp.net`;

            try {
                await sock.groupRequestParticipantsUpdate(m.chat, [jid], 'approve');
                m.reply(` Berhasil menyetujui *${target}* untuk masuk grup.`);
            } catch (err) {
                console.error(err);
                m.reply(
                    'Gagal menyetujui permintaan. Pastikan nomor tersebut ada di daftar pending.'
                );
            }
        },
    },
    {
        name: 'reject',
        aliases: ['tolak'],
        description: 'Tolak permintaan join member baru via nomor/JID',
        category: 'Group',
        execute: async (sock, m, args, text) => {
            if (!m.isGroup) return m.reply('Hanya bisa di grup!');

            const groupMetadata = await sock.groupMetadata(m.chat);
            const isAdmin = groupMetadata.participants.find(
                (p) =>
                    jidNormalizedUser(p.id) === jidNormalizedUser(m.sender) &&
                    (p.admin || p.id === groupMetadata.owner)
            );
            if (!isAdmin) return m.reply('Hanya admin yang bisa reject!');

            let target = args[0]?.replace(/[^0-9]/g, '');
            if (!target)
                return m.reply(
                    'Ketik nomor HP orang yang mau di-tolak!\nContoh: .reject 62812345678'
                );

            const jid = target.includes('@') ? target : `${target}@s.whatsapp.net`;

            try {
                await sock.groupRequestParticipantsUpdate(m.chat, [jid], 'reject');
                m.reply(` Berhasil menolak permintaan join dari *${target}*.`);
            } catch (err) {
                console.error(err);
                m.reply('Gagal menolak permintaan. Pastikan nomor tersebut ada di daftar pending.');
            }
        },
    },
];
