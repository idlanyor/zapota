import axios from 'axios';
import FormData from 'form-data';
import { settings } from '../../config/settings.js';

export default {
    name: 'imgedit',
    aliases: ['editimg', 'nano-banana', 'aiimgedit'],
    description: 'Edit gambar via Nano Banana API dengan prompt',
    category: 'tools',
    execute: async (sock, m, args, text) => {
        try {
            const prompt = (text || args?.join(' ') || '').trim();
            if (!prompt) {
                return m.reply(`Reply gambar/sticker dengan prompt.\nContoh: *${settings.prefix}editimg add stylish glasses*`);
            }

            const quoted = m.quoted ? m.quoted : m;
            const msg = quoted.msg || quoted;
            const mime = msg.mimetype || '';

            if (!/^image\//i.test(mime) && !/sticker/i.test(mime)) {
                return m.reply(`Reply gambar/sticker dengan prompt.\nContoh: *${settings.prefix}editimg add stylish glasses*`);
            }

            await m.react('⏳');
            const mediaBuffer = await m.downloadMediaMessage(quoted);
            if (!mediaBuffer || !mediaBuffer.length) {
                return m.reply('Gagal membaca media.');
            }

            const form = new FormData();
            form.append('file', mediaBuffer, {
                filename: 'image.jpg',
                contentType: 'image/jpeg',
            });
            form.append('prompt', prompt);
            form.append('output_format', 'jpg');
            form.append('generator_slug', 'ai-image-editor');

            const res = await axios.post('https://ibbo.ai/api/nano-banana-lite-image-to-image', form, {
                headers: {
                    ...form.getHeaders(),
                    'Origin': 'https://banana-nano.ai',
                    'Referer': 'https://banana-nano.ai/ai-image-editor',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
                timeout: 90000,
            });

            const data = res.data;
            const resultUrl = data?.data?.image_url;

            if (!data?.success || !resultUrl) {
                throw new Error(data?.message || data?._raw || 'Gagal memproses gambar dari API.');
            }

            const caption = [
                `*NanoBanana Image Edit*`,
                `Prompt: _${prompt}_`,
                data.data.model ? `Model: ${data.data.model}` : '',
                data.data.free_usage?.remaining !== undefined ? `Free remaining: ${data.data.free_usage.remaining}` : '',
            ].filter(Boolean).join('\n');

            await m.react('✅');
            return sock.sendMessage(m.chat, {
                image: { url: resultUrl },
                caption: caption,
            }, { quoted: m });
        } catch (error) {
            console.error('[imgedit] error:', error);
            await m.react('❌');
            return m.reply(`Gagal image edit: ${error.message || 'Unknown error'}`);
        }
    },
};
