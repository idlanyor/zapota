import { downloadFromUtama } from '../../lib/utamaDownloader.js';

export default {
    name: 'mediafire', aliases: ['mf'], category: 'Downloader', description: 'Download file MediaFire via API Utama',
    execute: async (sock, m, args, text) => {
        if (!text) return m.reply('Kirim URL MediaFire.');
        await m.react('⏳');
        try {
            const data = await downloadFromUtama('/mediafire', text.trim());
            const direct = data.media[0]?.url;
            const fileName = data.fileName || 'mediafire-file';
            await sock.sendMessage(m.chat, {
                document: { url: direct }, fileName, mimetype: 'application/octet-stream',
                caption: `📦 *MEDIAFIRE DOWNLOADER*\n*File:* ${fileName}${data.size ? `\n*Ukuran:* ${data.size}` : ''}`,
            }, { quoted: m });
            await m.react('✅');
        } catch (error) { await m.react('❌'); await m.reply(`Gagal mengunduh MediaFire: ${error.message}`); }
    },
};
