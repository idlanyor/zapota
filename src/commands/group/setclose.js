import { getGroup, saveGroup } from '../../services/settingsService.js';

const isTime = (v) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(v || '');

export default {
    name: 'setclose',
    description: 'Atur auto close grup',
    category: 'Group',
    guards: ['admin'],
    execute: async (sock, m, args) => {
        const input = (args[0] || '').toLowerCase();
        if (!input) return m.reply('Format: .setclose <HH:mm|on|off>');

        const group = await getGroup(m.chat);

        if (input === 'on' || input === 'off') {
            group.autoClose = input === 'on';
            await saveGroup(group);
            return m.reply(`✅ Auto close ${group.autoClose ? 'diaktifkan' : 'dinonaktifkan'}.`);
        }

        if (!isTime(input)) return m.reply('Format jam tidak valid. Contoh: .setclose 22:00');

        group.autoCloseTime = input;
        group.autoClose = true;
        await saveGroup(group);
        return m.reply(`✅ Waktu auto close diset ke ${input} WIB dan fitur diaktifkan.`);
    },
};
