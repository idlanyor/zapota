import { jidNormalizedUser } from '../../wa/helpers.js';

export default {
    name: 'kick',
    description: 'Kick a member from the group',
    category: 'Group',
    execute: async (sock, m, args, text) => {
        if (!m.isGroup) return m.reply('This command can only be used in groups.');

        const groupMetadata = await sock.groupMetadata(m.chat);
        const participants = groupMetadata.participants;

        const botJid = jidNormalizedUser(sock.user.id);
        const botLid = sock.user.lid ? jidNormalizedUser(sock.user.lid) : null;

        const userAdmin = participants.find(
            (p) => jidNormalizedUser(p.id) === jidNormalizedUser(m.sender)
        );
        const botAdmin = participants.find((p) => {
            const pid = jidNormalizedUser(p.id);
            return pid === botJid || pid === botLid;
        });

        const isAdmin =
            userAdmin && (userAdmin.admin === 'admin' || userAdmin.admin === 'superadmin');
        const botIsAdmin =
            botAdmin && (botAdmin.admin === 'admin' || botAdmin.admin === 'superadmin');

        if (!isAdmin) return m.reply('This command is only for group admins.');
        if (!botIsAdmin) return m.reply('I need to be an admin to kick members.');

        // Build unique list of targets
        const usersSet = new Set();
        if (m.msg.contextInfo?.mentionedJid) {
            m.msg.contextInfo.mentionedJid.forEach((j) => usersSet.add(j));
        }
        if (m.msg.contextInfo?.participant) {
            usersSet.add(m.msg.contextInfo.participant);
        }
        if (args[0] && !args[0].includes('@')) {
            const num = args[0].replace(/[^0-9]/g, '');
            if (num.length >= 10) usersSet.add(`${num}@s.whatsapp.net`);
        }

        const users = [...usersSet];
        if (users.length === 0)
            return m.reply('Please tag the user, reply to their message, or provide their number.');

        const groupOwner =
            groupMetadata.owner || participants.find((p) => p.admin === 'superadmin')?.id;
        const kicked = [];
        const skipped = [];

        for (let user of users) {
            const normalizedUser = jidNormalizedUser(user);

            // Security Checks
            if (normalizedUser === botJid || normalizedUser === botLid) {
                skipped.push(`@${user.split('@')[0]} (Me)`);
                continue;
            }
            if (normalizedUser === jidNormalizedUser(groupOwner)) {
                skipped.push(`@${user.split('@')[0]} (Owner)`);
                continue;
            }

            try {
                await sock.groupParticipantsUpdate(m.chat, [user], 'remove');
                kicked.push(`@${user.split('@')[0]}`);
            } catch (err) {
                skipped.push(`@${user.split('@')[0]} (Failed)`);
            }
        }

        let response = '';
        if (kicked.length > 0) response += `✅ Berhasil mengeluarkan: ${kicked.join(', ')}\n`;
        if (skipped.length > 0) response += `❌ Lewati: ${skipped.join(', ')}`;

        await m.reply(response.trim() || 'Tidak ada tindakan yang dilakukan.', { mentions: users });
    },
};
