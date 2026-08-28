import { downloadYouTubeYtmp3 } from '../../lib/ytmp3Mobi.js';
import { downloadAudioForWa } from '../../lib/audioHelper.js';
import { searchYouTube } from '../../lib/youtubeSearch.js';
import logger from '../../utils/logger.js';

const safeFileName = (value) => value.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);

export default {
    name: 'play',
    aliases: ['p'],
    description: 'Search and play audio from YouTube via YTmp3',
    category: 'Downloader',
    execute: async (sock, m, args, text) => {
        if (!text) return m.reply('Kirim judul lagu atau link YouTube.');

        await m.react('⏳').catch(() => {});

        try {
            const [video] = await searchYouTube(text, 1);
            if (!video) throw new Error('Lagu tidak ditemukan.');

            const data = await downloadYouTubeYtmp3(video.url, 'mp3');
            const audioTitle = data.title || video.title;
            const audioBuffer = await downloadAudioForWa(data.url);

            const caption =
                `*YouTube Play*\n\n` +
                `*Title:* ${audioTitle}\n` +
                `*Channel:* ${video.author.name}\n` +
                `*Duration:* ${video.timestamp}\n` +
                `*Source:* YTmp3`;

            await sock.sendMessage(m.chat, { text: caption }, { quoted: m });
            await sock.sendMessage(
                m.chat,
                {
                    audio: audioBuffer,
                    mimetype: 'audio/mpeg',
                    fileName: `${safeFileName(audioTitle)}.mp3`,
                },
                { quoted: m }
            );
            await m.react('✅').catch(() => {});
        } catch (err) {
            logger.error(err, 'PLAY');
            await m.react('❌').catch(() => {});
            await m.reply(`Gagal memutar audio: ${err.message || 'Unknown error'}`);
        }
    },
};
