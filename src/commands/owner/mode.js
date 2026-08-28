import Settings from '../../database/models/Settings.js';
import { clearSettingsCache } from '../../handlers/messageHandler.js';

export default {
    name: 'mode',
    aliases: ['botmode'],
    description: 'Ubah mode respon bot (Public/Self/Group)',
    category: 'Owner',
    execute: async (sock, m, args, text) => {
        if (!args[0]) {
            const current = await Settings.findOne({ id: 'bot_settings' });
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
            await Settings.findOneAndUpdate(
                { id: 'bot_settings' },
                { mode: newMode },
                { upsert: true }
            );

            clearSettingsCache();

            m.reply(` Berhasil mengubah mode bot menjadi: *${newMode.toUpperCase()}*`);
        } catch (err) {
            console.error(err);
            m.reply('Gagal mengubah mode bot.');
        }
    },
};
