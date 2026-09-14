import axios from 'axios';
import { settings } from '../../config/settings.js';

export default {
    name: 'glm',
    aliases: ['glm5', 'glmai'],
    description: 'Tanya GLM 5.3 Flash AI (Teks & Vision)',
    category: 'AI',
    execute: async (sock, m, args, text) => {
        try {
            const baseUrl = process.env.GLM_BASE_URL || 'https://api.zrouter.dev/v1';
            const apiKey = process.env.GLM_API_KEY;
            const model = process.env.GLM_MODEL || 'glm-5.3-flash';

            if (!apiKey) {
                return m.reply('❌ API Key GLM belum disetel di environment (`GLM_API_KEY`).');
            }

            const isQuoted = Boolean(m.quoted);
            const msg = isQuoted ? m.quoted : m.msg;
            const mime = msg?.mimetype || '';
            const mtype = isQuoted ? m.quoted.mtype : m.mtype;
            const isImage = /image/.test(mime) || /imageMessage/.test(mtype);

            const prompt = (text || m.quoted?.text || '').trim();

            if (!prompt && !isImage) {
                return m.reply(
                    `*GLM 5.3 Flash AI*\n\n` +
                    `Penggunaan:\n` +
                    `• Teks: *${settings.prefix}glm <pertanyaan>*\n` +
                    `• Gambar: Kirim/reply gambar dengan caption *${settings.prefix}glm <pertanyaan>*\n\n` +
                    `_Contoh: ${settings.prefix}glm jelaskan apa itu quantum computing_`
                );
            }

            await m.react('⏳');

            let userContent;

            if (isImage) {
                let buffer;
                if (isQuoted && typeof m.quoted.download === 'function') {
                    buffer = await m.quoted.download();
                } else if (typeof m.download === 'function') {
                    buffer = await m.download();
                }

                if (!buffer || buffer.length === 0) {
                    await m.react('❌');
                    return m.reply('❌ Gagal mengunduh gambar.');
                }

                const cleanMime = mime ? mime.split(';')[0].trim() : 'image/jpeg';
                const base64Data = `data:${cleanMime};base64,${buffer.toString('base64')}`;

                userContent = [
                    { type: 'text', text: prompt || 'Jelaskan gambar ini secara detail dalam bahasa Indonesia.' },
                    {
                        type: 'image_url',
                        image_url: { url: base64Data },
                    },
                ];
            } else {
                userContent = prompt;
            }

            const progressMessage = await m.reply('💭 _Menghubungi GLM 5.3..._');
            const progressKey = progressMessage?.key || null;

            const response = await axios.post(
                `${baseUrl.replace(/\/+$/, '')}/chat/completions`,
                {
                    model,
                    messages: [
                        {
                            role: 'user',
                            content: userContent,
                        },
                    ],
                },
                {
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 120000,
                }
            );

            const answer = response.data?.choices?.[0]?.message?.content;
            if (!answer) {
                throw new Error('Tidak ada respon teks dari GLM.');
            }

            const finalText = `🤖 *GLM 5.3 Flash*\n\n${answer.trim()}`;

            if (progressKey) {
                await sock.sendMessage(m.chat, {
                    text: finalText,
                    edit: progressKey,
                });
            } else {
                await m.reply(finalText);
            }

            await m.react('✅');
        } catch (error) {
            console.error('GLM Command Error:', error?.response?.data || error.message);
            await m.react('❌');

            const errorMsg =
                error?.response?.data?.error?.message ||
                error?.response?.data?.message ||
                error.message ||
                'Gagal memproses permintaan.';

            await m.reply(`❌ *GLM Error*: ${errorMsg}`);
        }
    },
};
