import { jidNormalizedUser } from '../../wa/helpers.js';

export default {
    name: 'del',
    aliases: ['delete'],
    description: 'Delete a message',
    category: 'Group',
    execute: async (sock, m, args, text) => {
        if (!m.quoted) return m.reply('Please reply to the message you want to delete.');

        const key = {
            remoteJid: m.chat,
            fromMe: m.quoted.fromMe,
            id: m.quoted.id,
            ...(m.isGroup ? { participant: m.quoted.sender } : {}),
        };

        if (m.quoted.fromMe) {
            // Bot can always delete its own messages
            return await sock.sendMessage(m.chat, { delete: key });
        }

        if (!m.isGroup) return m.reply("I can only delete other people's messages in groups.");

        // Check if sender is admin and bot is admin
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
        if (!botIsAdmin) return m.reply("I need to be an admin to delete other people's messages.");

        await sock.sendMessage(m.chat, { delete: key });
    },
};
