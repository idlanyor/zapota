import { downloadFromUtama, sendUtamaMedia } from '../../lib/utamaDownloader.js';

export default {
    name: 'threads', aliases: ['threadsdl'], category: 'Downloader', description: 'Download media Threads via API Utama',
    execute: async (sock, m, args, text) => {
        if (!text) return m.reply('Kirim URL Threads.');
        await m.react('⏳');
        try { await sendUtamaMedia(sock, m, await downloadFromUtama('/threads', text.trim()), '🧵 *THREADS DOWNLOADER*'); await m.react('✅'); }
        catch (error) { await m.react('❌'); await m.reply(`Gagal mengunduh Threads: ${error.message}`); }
    },
};
