import { jidNormalizedUser } from '../../wa/helpers.js';
import logger from '../../utils/logger.js';

export default {
    name: 'hidetag',
    aliases: ['ht', 'tagall'],
    description: 'Tag all members in the group',
    category: 'Group',
    execute: async (sock, m, args, text) => {
        if (!m.isGroup) return m.reply('This command can only be used in groups.');

        const groupMetadata = await sock.groupMetadata(m.chat);
        const participants = groupMetadata.participants;

        const userAdmin = participants.find(
            (p) => jidNormalizedUser(p.id) === jidNormalizedUser(m.sender)
        );
        const isAdmin =
            userAdmin && (userAdmin.admin === 'admin' || userAdmin.admin === 'superadmin');

        // logger.info(`[DEBUG] Hidetag - Chat: ${m.chat}, Sender: ${m.sender}, isAdmin: ${userAdmin?.admin}`);

        if (!isAdmin) return m.reply('This command is only for group admins.');

        const mentions = participants.map((p) => p.id);

        await sock.sendMessage(m.chat, {
            text: text || 'Attention everyone!',
            mentions: mentions,
        });
    },
};
