import Group from '../../database/models/Group.js';
import { clearSettingsCache } from '../../handlers/messageHandler.js';

const isTime = (v) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(v || '');

export default {
    name: 'setopen',
    description: 'Atur auto open grup',
    category: 'Group',
    guards: ['admin'],
    execute: async (sock, m, args) => {
        const input = (args[0] || '').toLowerCase();
        if (!input) return m.reply('Format: .setopen <HH:mm|on|off>');

        const group =
            (await Group.findOne({ jid: m.chat })) || (await Group.create({ jid: m.chat }));

        if (input === 'on' || input === 'off') {
            group.autoOpen = input === 'on';
            await group.save();
            clearSettingsCache();
            return m.reply(`✅ Auto open ${group.autoOpen ? 'diaktifkan' : 'dinonaktifkan'}.`);
        }

        if (!isTime(input)) return m.reply('Format jam tidak valid. Contoh: .setopen 05:00');

        group.autoOpenTime = input;
        group.autoOpen = true;
        await group.save();
        clearSettingsCache();
        return m.reply(`✅ Waktu auto open diset ke ${input} WIB dan fitur diaktifkan.`);
    },
};
