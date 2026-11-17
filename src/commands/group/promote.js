import logger from '../../utils/logger.js';

export default {
    name: 'promote',
    aliases: ['pm'],
    category: 'Group',
    guards: ['admin', 'botAdmin'],
    description: 'Promote a member to admin',
    async execute(sock, m, args, text) {
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
