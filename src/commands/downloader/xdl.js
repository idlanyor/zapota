import { downloadFromUtama, sendUtamaMedia } from '../../lib/utamaDownloader.js';

export default {
    name: 'xdl', aliases: ['twdl', 'twitterdl'], category: 'Downloader', description: 'Download media Twitter/X via API Utama',
    execute: async (sock, m, args, text) => {
        if (!text) return m.reply('Kirim URL Twitter/X.');
        await m.react('⏳');
        try { await sendUtamaMedia(sock, m, await downloadFromUtama('/twitter', text.trim()), '𝕏 *TWITTER/X DOWNLOADER*'); await m.react('✅'); }
        catch (error) { await m.react('❌'); await m.reply(`Gagal mengunduh Twitter/X: ${error.message}`); }
    },
};
