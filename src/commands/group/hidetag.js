import logger from '../../utils/logger.js';

export default {
    name: 'hidetag',
    aliases: ['ht', 'tagall'],
    description: 'Tag all members in the group',
    category: 'Group',
    guards: ['admin'],
    execute: async (sock, m, args, text) => {
        const groupMetadata = await sock.groupMetadata(m.chat);
        const participants = groupMetadata.participants;

        const mentions = participants.map((p) => p.id);

        await sock.sendMessage(m.chat, {
            text: text || 'Attention everyone!',
            mentions: mentions,
        });
    },
};
