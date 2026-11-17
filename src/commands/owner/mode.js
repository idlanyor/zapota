import { getBotSettings, updateBotSettings } from '../../services/settingsService.js';

export default {
    name: 'mode',
    aliases: ['botmode'],
    description: 'Ubah mode respon bot (Public/Self/Group)',
    category: 'Owner',
    execute: async (sock, m, args, text) => {
        if (!args[0]) {
            const current = await getBotSettings();
            return m.reply(
                `Format: .mode <public/self/group>\n\n*Status Saat Ini:* ${current?.mode?.toUpperCase() || 'PUBLIC'}`
            );
        }

        const newMode = args[0].toLowerCase();
        const validModes = ['public', 'self', 'group'];

        if (!validModes.includes(newMode)) {
            return m.reply(`Mode tidak valid! Pilih: ${validModes.join(', ')}`);
        }

        try {
            await updateBotSettings({ mode: newMode });

            m.reply(` Berhasil mengubah mode bot menjadi: *${newMode.toUpperCase()}*`);
        } catch (err) {
            console.error(err);
            m.reply('Gagal mengubah mode bot.');
        }
    },
};
