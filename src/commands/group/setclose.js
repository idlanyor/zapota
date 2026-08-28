import { jidNormalizedUser } from '../../wa/helpers.js';
import Group from '../../database/models/Group.js';
import { clearSettingsCache } from '../../handlers/messageHandler.js';

const isTime = (v) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(v || '');

async function isGroupAdmin(sock, m) {
    const meta = await sock.groupMetadata(m.chat);
    const sender = jidNormalizedUser(m.sender);
    const me = meta.participants.find((p) => jidNormalizedUser(p.id) === sender);
    return me?.admin === 'admin' || me?.admin === 'superadmin';
}

export default {
    name: 'setclose',
    description: 'Atur auto close grup',
    category: 'Group',
    execute: async (sock, m, args) => {
        if (!m.isGroup) return m.reply('Perintah ini hanya untuk grup.');
        if (!(await isGroupAdmin(sock, m)))
            return m.reply('Hanya admin grup yang bisa pakai command ini.');

        const input = (args[0] || '').toLowerCase();
        if (!input) return m.reply('Format: .setclose <HH:mm|on|off>');

        const group =
            (await Group.findOne({ jid: m.chat })) || (await Group.create({ jid: m.chat }));

        if (input === 'on' || input === 'off') {
            group.autoClose = input === 'on';
            await group.save();
            clearSettingsCache();
            return m.reply(`✅ Auto close ${group.autoClose ? 'diaktifkan' : 'dinonaktifkan'}.`);
        }

        if (!isTime(input)) return m.reply('Format jam tidak valid. Contoh: .setclose 22:00');

        group.autoCloseTime = input;
        group.autoClose = true;
        await group.save();
        clearSettingsCache();
        return m.reply(`✅ Waktu auto close diset ke ${input} WIB dan fitur diaktifkan.`);
    },
};
