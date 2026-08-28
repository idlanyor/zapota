import { settings } from '../../config/settings.js';
import { downloadFromUtama, sendUtamaMedia } from '../../lib/utamaDownloader.js';

export default {
    name: 'tt', aliases: ['ttdl', 'tiktok', 'ttmp3', 'ttaudio'], category: 'Downloader', description: 'Download TikTok via API Utama',
    execute: async (sock, m, args, text) => {
        if (!text) return m.reply('Kirim URL TikTok.');
        const command = (m.body || '').split(' ')[0].toLowerCase().slice(settings.prefix.length);
        await m.react('⏳');
        try {
            const data = await downloadFromUtama('/tiktok', text.trim());
            if (command === 'ttmp3' || command === 'ttaudio') {
                const audio = data.media.find((item) => item.type === 'audio');
                if (!audio) throw new Error('Audio tidak tersedia');
                await sock.sendMessage(m.chat, { audio: { url: audio.url }, mimetype: 'audio/mpeg' }, { quoted: m });
            } else {
                await sendUtamaMedia(sock, m, { ...data, media: data.media.filter((item) => item.type !== 'audio') }, '🎬 *TIKTOK DOWNLOADER*');
            }
            await m.react('✅');
        } catch (error) { await m.react('❌'); await m.reply(`Gagal mengunduh TikTok: ${error.message}`); }
    },
};
