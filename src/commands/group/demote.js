import { jidNormalizedUser } from '../../wa/helpers.js';
import logger from '../../utils/logger.js';

export default {
    name: 'demote',
    aliases: ['dm'],
    category: 'Group',
    guards: ['admin', 'botAdmin'],
    description: 'Demote an admin to member',
    async execute(sock, m, args, text) {
        const groupMetadata = await sock.groupMetadata(m.chat);
        const participants = groupMetadata.participants;

        const botJid = jidNormalizedUser(sock.user.id);
        const botLid = sock.user.lid ? jidNormalizedUser(sock.user.lid) : null;

        // Get target JID
        let target;
        if (m.quoted) {
            target = m.quoted.sender;
        } else if (m.mentionedJid?.[0]) {
            target = m.mentionedJid[0];
        } else if (args[0]) {
            target = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        }

        if (!target) return m.reply(' Please tag a user or reply to their message to demote.');

        const normalizedTarget = jidNormalizedUser(target);
        const groupOwner =
            groupMetadata.owner || participants.find((p) => p.admin === 'superadmin')?.id;

        if (normalizedTarget === botJid || normalizedTarget === botLid) {
            return m.reply(' I cannot demote myself!');
        }

        if (normalizedTarget === jidNormalizedUser(groupOwner)) {
            return m.reply(' I cannot demote the group owner!');
        }

        try {
            await sock.groupParticipantsUpdate(m.chat, [target], 'demote');
            await m.reply(` Successfully demoted @${target.split('@')[0]} to member.`, {
                mentions: [target],
            });
        } catch (err) {
            logger.error(err, 'Error in demote command');
            await m.reply(' Failed to demote user.');
        }
    },
};
