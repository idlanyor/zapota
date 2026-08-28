import { downloadFromUtama, sendUtamaMedia } from '../../lib/utamaDownloader.js';

export default {
    name: 'ig', aliases: ['igdl', 'instagram'], category: 'Downloader', description: 'Download media Instagram via API Utama',
    execute: async (sock, m, args, text) => {
        if (!text) return m.reply('Kirim URL postingan/reel Instagram.');
        await m.react('⏳');
        try { await sendUtamaMedia(sock, m, await downloadFromUtama('/instagram', text.trim()), '📸 *INSTAGRAM DOWNLOADER*'); await m.react('✅'); }
        catch (error) { await m.react('❌'); await m.reply(`Gagal mengunduh Instagram: ${error.message}`); }
    },
};
