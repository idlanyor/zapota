import { downloadYouTubeAudio, isYouTubeUrl } from '../../lib/ytdlp.js';
import { searchYouTube } from '../../lib/youtubeSearch.js';
import logger from '../../utils/logger.js';

const safeFileName = (value) => value.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);

/** A YouTube link is used as is; anything else is searched (first result). */
const resolveVideo = async (query) => {
    if (isYouTubeUrl(query)) return { url: query };
    const [video] = await searchYouTube(query, 1);
    if (!video) throw new Error('Lagu tidak ditemukan.');
    return video;
};

export default {
    name: 'play',
    aliases: ['p'],
    description: 'Cari dan putar audio dari YouTube (yt-dlp)',
    category: 'Downloader',
    execute: async (sock, m, args, text) => {
        if (!text) return m.reply('Kirim judul lagu atau link YouTube.\nContoh: *.play sukish*');

        await m.react('⏳').catch(() => {});

        try {
            const video = await resolveVideo(text.trim());
            const audio = await downloadYouTubeAudio(video.url);
            const title = audio.title || video.title;

            const caption =
                `*YouTube Play*\n\n` +
                `*Judul:* ${title}\n` +
                (video.author?.name ? `*Channel:* ${video.author.name}\n` : '') +
                (video.timestamp ? `*Durasi:* ${video.timestamp}\n` : '');

            await sock.sendMessage(m.chat, { text: caption.trim() }, { quoted: m });
            await sock.sendMessage(
                m.chat,
                {
                    audio: audio.buffer,
                    mimetype: 'audio/mpeg',
                    fileName: `${safeFileName(title)}.mp3`,
                },
                { quoted: m }
            );
            await m.react('✅').catch(() => {});
        } catch (err) {
            logger.error(`[play] ${err.message}`, 'PLAY');
            await m.react('❌').catch(() => {});
            await m.reply(`❌ Gagal memutar audio: ${err.message || 'Unknown error'}`);
        }
    },
};
