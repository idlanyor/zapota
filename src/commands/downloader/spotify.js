import { downloadSpotify } from '../../lib/spotifyScraper.js';
import { downloadAudioForWa } from '../../lib/audioHelper.js';
import logger from '../../utils/logger.js';

const safeFileName = (value) => value.replace(/[\\/:*?"<>|]/g, '_').slice(0, 100);

export default {
    name: 'spotify',
    aliases: ['spotdl', 'spotifydl', 'spdl'],
    description: 'Download audio MP3 dari tautan Spotify',
    category: 'Downloader',
    execute: async (sock, m, args, text) => {
        const url = (text || '').trim();
        if (!url || !url.includes('spotify')) {
            return m.reply(
                '🎵 *SPOTIFY DOWNLOADER*\n\n' +
                'Gunakan: `.spotify <link track spotify>`\n' +
                'Contoh: `.spotify https://open.spotify.com/track/4R9G7azXaZe93KTX65P9fU`'
            );
        }

        await m.react('⏳').catch(() => {});

        try {
            // 1. Fetch metadata & download URL dari scraper MusicFab
            const track = await downloadSpotify(url);

            const caption =
                `🎵 *SPOTIFY DOWNLOADER*\n\n` +
                `• *Judul:* ${track.title}\n` +
                `• *Artis:* ${track.artist}\n` +
                `• *Durasi:* ${track.duration}\n` +
                (track.album ? `• *Album:* ${track.album}\n` : '') +
                `\n_Sedang mengunduh dan memproses audio..._`;

            if (track.coverUrl) {
                await sock.sendMessage(
                    m.chat,
                    {
                        image: { url: track.coverUrl },
                        caption,
                    },
                    { quoted: m }
                );
            } else {
                await m.reply(caption);
            }

            // 2. Download dan encode audio untuk WhatsApp
            const audioBuffer = await downloadAudioForWa(track.downloadUrl);

            // 3. Kirim audio sebagai dokumen & audio message
            await sock.sendMessage(
                m.chat,
                {
                    audio: audioBuffer,
                    mimetype: 'audio/mpeg',
                    fileName: `${safeFileName(`${track.artist} - ${track.title}`)}.mp3`,
                },
                { quoted: m }
            );

            await m.react('✅').catch(() => {});
        } catch (err) {
            logger.error(err, 'SPOTIFY_DL');
            await m.react('❌').catch(() => {});
            await m.reply(`❌ Gagal mengunduh audio Spotify: ${err.message || 'Unknown error'}`);
        }
    },
};
