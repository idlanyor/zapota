import axios from 'axios';

const api = axios.create({
    baseURL: 'https://api.ammaricano.my.id/api',
    timeout: 30000,
    headers: {
        accept: 'application/json',
    },
});

export default {
    name: 'fb2',
    aliases: ['facebook2', 'fbdl2'],
    description: 'Download Facebook video via Ammaricano API',
    category: 'Downloader',
    execute: async (sock, m, args, text) => {
        const url = text || (m.quoted ? m.quoted.text || m.quoted.message?.conversation : '');
        if (!url) {
            return m.reply(
                'Masukkan URL Facebook.\nContoh: .fb2 https://www.facebook.com/share/v/xxxx/'
            );
        }

        await sock.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

        try {
            const { data } = await api.get('/download/facebook', {
                params: { url },
            });

            if (!data?.success || !data?.result) {
                await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
                return m.reply('Gagal mengambil data video Facebook dari API.');
            }

            const hdUrl = data.result.hd || '';
            const sdUrl = data.result.sd || '';
            const videoUrl = hdUrl || sdUrl;

            if (!videoUrl) {
                await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
                return m.reply('Video ditemukan, tapi link download tidak tersedia.');
            }

            const quality = hdUrl ? 'HD' : 'SD';
            const caption =
                '*FACEBOOK DOWNLOADER V2*\n\n' +
                `• Quality: ${quality}\n` +
                `• Source: Ammaricano API\n` +
                `• Creator: ${data.creator || '-'}\n` +
                `• Fallback SD: ${sdUrl ? 'Tersedia' : 'Tidak'}\n`;

            await sock.sendMessage(
                m.chat,
                {
                    video: { url: videoUrl },
                    mimetype: 'video/mp4',
                    fileName: 'facebook.mp4',
                    caption,
                },
                { quoted: m }
            );

            await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        } catch (error) {
            console.error('FB2 Error:', error.response?.data || error.message);
            await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });

            const message =
                error.response?.data?.message || 'Terjadi kesalahan saat mengambil video Facebook.';
            await m.reply(message);
        }
    },
};
