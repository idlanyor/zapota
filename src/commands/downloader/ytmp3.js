import { downloadYouTubeAudio, isYouTubeUrl } from '../../lib/ytdlp.js';
import logger from '../../utils/logger.js';

const safeFileName = (value) => value.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);

const USAGE =
    'Kirim link YouTube.\nContoh: *.ytmp3 https://youtu.be/xxxx*\nCari lagu pakai judul: *.play <judul>*';

export default {
    name: 'ytmp3',
    aliases: ['ytaudio', 'yta'],
    description: 'Download audio YouTube sebagai MP3 (yt-dlp)',
    category: 'Downloader',
    execute: async (sock, m, args) => {
        const url = args[0];
        if (!url) return m.reply(USAGE);
        if (!isYouTubeUrl(url)) return m.reply(`❌ Itu bukan link YouTube.\n\n${USAGE}`);

        await m.react('⏳').catch(() => {});
        try {
            const audio = await downloadYouTubeAudio(url);
            await sock.sendMessage(
                m.chat,
                {
                    audio: audio.buffer,
                    mimetype: 'audio/mpeg',
                    fileName: `${safeFileName(audio.title)}.mp3`,
                },
                { quoted: m }
            );
            await m.react('✅').catch(() => {});
        } catch (err) {
            logger.error(`[ytmp3] ${err.message}`, 'YTMP3');
            await m.react('❌').catch(() => {});
            await m.reply(`❌ Gagal mengunduh audio: ${err.message || 'Unknown error'}`);
        }
    },
};
