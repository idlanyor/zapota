import { downloadContentFromMessage } from '../../wa/helpers.js';
import path from 'path';

export default {
    name: 'rename',
    description: 'Rename dokumen. Reply dokumen: .rename <nama_baru>',
    category: 'Tools',
    execute: async (sock, m, args, text) => {
        if (!m.quoted) return m.reply('Reply pesan dokumen yang mau direname.');
        const msg = m.quoted;
        const mime = msg.mimetype || '';
        const mtype = msg.mtype || '';
        const isDoc = /document/.test(mime) || /documentMessage/.test(mtype);
        if (!isDoc) return m.reply('Itu bukan dokumen. Reply pesan dokumen.');

        const newName = (text || '').trim();
        if (!newName)
            return m.reply('Nama baru apa? Contoh: .rename laporan.pdf');

        const origExt = path.extname(msg.fileName || '');
        const finalName = path.extname(newName) ? newName : origExt ? newName + origExt : newName;

        try {
            await m.react('⏳');
            const stream = await downloadContentFromMessage(msg, 'document', sock);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            await sock.sendMessage(
                m.chat,
                {
                    document: buffer,
                    mimetype: mime || 'application/octet-stream',
                    fileName: finalName,
                },
                { quoted: m }
            );
            await m.react('✅');
        } catch (err) {
            console.error('rename error:', err);
            await m.react('❌');
            m.reply(`Gagal rename: ${err.message || err}`);
        }
    },
};
