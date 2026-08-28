import axios from 'axios';
import { settings } from '../../config/settings.js';
import { uploadBufferToKanata } from '../../lib/mediaUpload.js';

export default {
    name: 'imgedit',
    aliases: ['nano-banana', 'editimg', 'aiimgedit'],
    description: 'Edit gambar via Nano Banana API dengan prompt',
    category: 'Tools',
    execute: async (sock, m, args, text) => {
        try {
            const prompt = (text || args?.join(' ') || '').trim();
            if (!prompt) {
                return m.reply(
                    `Reply gambar/sticker dengan prompt.\nContoh: *${settings.prefix}imgedit ubah jadi gaya anime*`
                );
            }

            const quoted = m.quoted ? m.quoted : m;
            const msg = quoted.msg || quoted;
            const mime = msg.mimetype || '';

            if (!/^image\//i.test(mime) && !/sticker/i.test(mime)) {
                return m.reply(
                    `Reply gambar/sticker dengan prompt.\nContoh: *${settings.prefix}imgedit ubah jadi gaya anime*`
                );
            }

            await m.react('⏳');
            const mediaBuffer = await m.downloadMediaMessage(quoted);
            if (!mediaBuffer || !mediaBuffer.length) {
                return m.reply('Gagal membaca media. Coba kirim ulang gambarnya.');
            }

            const ext = mime.split('/')[1]?.split(';')[0] || 'jpg';
            const filename = msg.fileName || msg.filename || `imgedit_${Date.now()}.${ext}`;

            const { url: imageUrl } = await uploadBufferToKanata(mediaBuffer, {
                filename,
                mimeType: mime || 'image/jpeg',
                timeout: 60000,
            });

            await m.react('⚙️');
            const editRes = await axios.get('https://chocomilk.amira.us.kg/v1/i2i/nano-banana', {
                params: {
                    prompt,
                    image: imageUrl,
                },
                timeout: 120000,
            });

            const taskId = editRes.data?.data?.taskId;
            if (!taskId) {
                throw new Error(editRes.data?.error || 'Response imgedit tidak valid.');
            }

            const caption = [
                '*Image Edit Requested*',
                '',
                `Prompt: ${prompt}`,
                `Task ID: ${taskId}`,
            ].join('\n');

            await m.react('✅');
            return m.reply(caption);
        } catch (error) {
            console.error('[imgedit] error:', error);
            await m.react('❌');
            return m.reply(`Gagal image edit: ${error.message || 'Unknown error'}`);
        }
    },
};
