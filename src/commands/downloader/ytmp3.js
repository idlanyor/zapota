import { fetchAPI } from '../../lib/api.js';
import logger from '../../utils/logger.js';

export default {
    name: 'ytmp3',
    aliases: ['ytaudio', 'yta'],
    description: 'Download YouTube audio',
    category: 'Downloader',
    execute: async (sock, m, args, text) => {
        if (!text) return m.reply('Please provide a YouTube URL.');

        // logger.info(`[DEBUG] ytmp3 triggered for URL: ${text}`);
        await m.react('⏳');

        try {
            // logger.info(`[DEBUG] Fetching audio API for: ${text}`);
            const data = await fetchAPI('https://api.kanata.web.id/youtube2/download-audio', {
                url: text,
            });

            if (!data || typeof data.url !== 'string' || !data.url.startsWith('http')) {
                // logger.info(`[DEBUG] ytmp3 API Failure:`, data);
                await m.react('❌');
                return m.reply('Failed to fetch YouTube audio. Make sure the URL is valid.');
            }

            // logger.info(`[DEBUG] ytmp3 success, sending audio from: ${data.url.substring(0, 50)}...`);
            await sock.sendMessage(
                m.chat,
                {
                    audio: { url: data.url },
                    mimetype: 'audio/mpeg',
                    fileName: `${data.title || 'audio'}.mp3`,
                },
                { quoted: m }
            );
            await m.react('✅');

            // logger.info(`[DEBUG] ytmp3 sent successfully`);
        } catch (err) {
            logger.error(`[DEBUG] ytmp3 error:`, err);
            await m.react('❌');
            await m.reply(' An error occurred while fetching the audio.');
        }
    },
};
