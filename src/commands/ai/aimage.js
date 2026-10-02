import axios from 'axios';
import { settings } from '../../config/settings.js';

export default {
    name: 'aimage',
    aliases: ['aiimage', 'text2img', 'txt2img', 'dalle'],
    description: 'Generate gambar AI dari prompt teks',
    category: 'ai',
    execute: async (sock, m, args, text) => {
        try {
            const prompt = (text || args?.join(' ') || '').trim();
            if (!prompt) {
                return m.reply(`Masukkan prompt teks.\nContoh: *${settings.prefix}aimage cybernetic cat neon city*`);
            }

            await m.react('⏳');
            // ponytail: direct pollinations endpoint; switch to dynamic provider config if rate limits bite
            const encoded = encodeURIComponent(prompt);
            const seed = Math.floor(Math.random() * 1000000);
            const imageUrl = `https://image.pollinations.ai/prompt/${encoded}?seed=${seed}&width=1024&height=1024&nologo=true`;

            const res = await axios.get(imageUrl, {
                responseType: 'arraybuffer',
                timeout: 60000,
            });

            if (!res.data || !res.data.length) {
                throw new Error('Gambar kosong dari server');
            }

            await m.react('✅');
            return sock.sendMessage(m.chat, {
                image: Buffer.from(res.data),
                caption: `*AI Image Generator*\nPrompt: _${prompt}_`,
            }, { quoted: m });
        } catch (error) {
            console.error('[aimage] error:', error);
            await m.react('❌');
            return m.reply(`Gagal generate gambar: ${error.message || 'Unknown error'}`);
        }
    },
};
