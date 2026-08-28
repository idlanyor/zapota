import { jidNormalizedUser } from '../../wa/helpers.js';
import logger from '../../utils/logger.js';

export default {
    name: 'group',
    description: 'Manage group settings (open/close)',
    category: 'Group',
    execute: async (sock, m, args, text) => {
        if (!m.isGroup) return m.reply('This command can only be used in groups.');
        if (!args[0]) return m.reply('Usage: !group open | close');

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

        // logger.info(`[DEBUG] Group Management - Chat: ${m.chat}`);
        // logger.info(`[DEBUG] Sender: ${m.sender}, isAdmin: ${userAdmin?.admin}`);
        // logger.info(`[DEBUG] Bot JID: ${botJid}, Bot LID: ${botLid}`);
        // logger.info(`[DEBUG] Bot Found: ${botAdmin ? 'Yes' : 'No'}, Admin: ${botAdmin?.admin}`);

        const isAdmin =
            userAdmin && (userAdmin.admin === 'admin' || userAdmin.admin === 'superadmin');
        const botIsAdmin =
            botAdmin && (botAdmin.admin === 'admin' || botAdmin.admin === 'superadmin');

        if (!isAdmin) return m.reply('This command is only for group admins.');
        if (!botIsAdmin) return m.reply('I need to be an admin to manage group settings.');

        if (args[0] === 'open') {
            await sock.groupSettingUpdate(m.chat, 'not_announcement');
            m.reply(' Group has been opened. Everyone can send messages.');
        } else if (args[0] === 'close') {
            await sock.groupSettingUpdate(m.chat, 'announcement');
            m.reply(' Group has been closed. Only admins can send messages.');
        } else {
            m.reply('Invalid argument. Use open or close.');
        }
    },
};
