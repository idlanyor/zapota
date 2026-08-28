import { jidNormalizedUser } from '../../wa/helpers.js';
import logger from '../../utils/logger.js';

export default {
    name: 'promote',
    aliases: ['pm'],
    category: 'Group',
    description: 'Promote a member to admin',
    async execute(sock, m, args, text) {
        if (!m.isGroup) return m.reply(' This command can only be used in groups.');

        // Check if the user is admin
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

        const isUserAdmin =
            userAdmin && (userAdmin.admin === 'admin' || userAdmin.admin === 'superadmin');
        const isBotAdmin =
            botAdmin && (botAdmin.admin === 'admin' || botAdmin.admin === 'superadmin');

        if (!isUserAdmin) return m.reply(' This command is for group admins only.');
        if (!isBotAdmin) return m.reply(' I need to be an admin to promote someone.');

        // Get target JID
        let target;
        if (m.quoted) {
            target = m.quoted.sender;
        } else if (m.mentionedJid?.[0]) {
            target = m.mentionedJid[0];
        } else if (args[0]) {
            target = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        }

        if (!target) return m.reply(' Please tag a user or reply to their message to promote.');

        try {
            await sock.groupParticipantsUpdate(m.chat, [target], 'promote');
            await m.reply(` Successfully promoted @${target.split('@')[0]} to admin.`, {
                mentions: [target],
            });
        } catch (err) {
            logger.error(err, 'Error in promote command');
            await m.reply(' Failed to promote user. Make sure the user is still in the group.');
        }
    },
};
