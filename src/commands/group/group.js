import logger from '../../utils/logger.js';

export default {
    name: 'group',
    description: 'Manage group settings (open/close)',
    category: 'Group',
    guards: ['admin', 'botAdmin'],
    execute: async (sock, m, args, text) => {
        if (!args[0]) return m.reply('Usage: !group open | close');

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
