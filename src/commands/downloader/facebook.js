import { downloadFromUtama, sendUtamaMedia } from '../../lib/utamaDownloader.js';

export default {
    name: 'fb', aliases: ['fbdl', 'facebook'], category: 'Downloader',
    description: 'Download video Facebook via API Utama',
    execute: async (sock, m, args, text) => {
        if (!text) return m.reply('Kirim URL video Facebook.');
        await m.react('⏳');
        try {
            await sendUtamaMedia(sock, m, await downloadFromUtama('/fbdl', text.trim()), '🎬 *FACEBOOK DOWNLOADER*');
            await m.react('✅');
        } catch (error) { await m.react('❌'); await m.reply(`Gagal mengunduh Facebook: ${error.message}`); }
    },
};
