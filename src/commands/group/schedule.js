import Group from '../../database/models/Group.js';

export default {
    name: 'schedule',
    aliases: ['jadwal', 'autoschedule'],
    description: 'Lihat jadwal auto open/close grup',
    category: 'Group',
    execute: async (sock, m) => {
        try {
            if (!m.isGroup) return m.reply('Perintah ini hanya untuk grup.');

            const settings =
                (await Group.findOne({ jid: m.chat })) || (await Group.create({ jid: m.chat }));
            const autoOpenStatus = settings.autoOpen ? '✅ Aktif' : '❌ Nonaktif';
            const autoCloseStatus = settings.autoClose ? '✅ Aktif' : '❌ Nonaktif';

            const message =
                `📅 *Jadwal Auto Open/Close Grup*\n\n` +
                `🔓 *Auto Open*\n` +
                `   Status: ${autoOpenStatus}\n` +
                `   Waktu: ${settings.autoOpenTime} WIB\n\n` +
                `🔒 *Auto Close*\n` +
                `   Status: ${autoCloseStatus}\n` +
                `   Waktu: ${settings.autoCloseTime} WIB\n\n` +
                `⏰ Timezone: Asia/Jakarta (WIB)\n\n` +
                `📝 *Pengaturan:*\n` +
                `• .setopen <jam> - Set waktu auto open\n` +
                `• .setclose <jam> - Set waktu auto close\n` +
                `• .setopen on/off - Enable/disable auto open\n` +
                `• .setclose on/off - Enable/disable auto close\n\n` +
                `Contoh: .setopen 05:00`;

            await m.reply(message);
        } catch (error) {
            await m.reply('❌ Terjadi kesalahan saat mengambil jadwal');
        }
    },
};
