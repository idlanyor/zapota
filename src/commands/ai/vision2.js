import axios from 'axios';
import { settings } from '../../config/settings.js';

const DS_BASE_URL = process.env.DS_BASE_URL || 'http://localhost:5050';
const DS_API_KEY = process.env.DS_API_KEY || 'dseeker';
const VISION_MODEL = 'vision';

/**
 * Format markdown standar ke tipografi WhatsApp
 */
const formatToWhatsApp = (text = '') => {
    if (!text) return '';
    let res = text.trim();
    // Hilangkan citation tags misal [citation:1]
    res = res.replace(/\[citation:\s*\d+\]/gi, '');
    return res;
};

export default {
    name: 'vision2',
    aliases: ['vis2', 'dsvision', 'deepseekvision'],
    description: 'Analisis gambar menggunakan DeepSeek Vision AI (.vision2 <prompt>)',
    category: 'AI',
    execute: async (sock, m, args, text) => {
        try {
            const isQuoted = Boolean(m.quoted);
            const msg = isQuoted ? m.quoted : m.msg;
            const mime = msg?.mimetype || '';
            const mtype = isQuoted ? m.quoted.mtype : m.mtype;

            const isImage = /image/.test(mime) || /imageMessage/.test(mtype);

            if (!isImage) {
                return m.reply(
                    `*DeepSeek Vision AI*\n\n` +
                    `Format:\n` +
                    `• Kirim gambar dengan caption *${settings.prefix}vision2 <pertanyaan>*\n` +
                    `• Atau reply gambar dengan *${settings.prefix}vision2 <pertanyaan>*\n\n` +
                    `_Contoh: ${settings.prefix}vision2 tolong jelaskan gambar ini secara detail_`
                );
            }

            const prompt = (text || m.quoted?.text || '').trim() || 'Jelaskan gambar ini secara detail dalam bahasa Indonesia.';

            await m.react('⏳');

            let buffer;
            if (isQuoted && typeof m.quoted.download === 'function') {
                buffer = await m.quoted.download();
            } else if (typeof m.download === 'function') {
                buffer = await m.download();
            }

            if (!buffer || buffer.length === 0) {
                await m.react('❌');
                return m.reply('❌ Gagal mengunduh gambar dari pesan.');
            }

            const cleanMime = mime ? mime.split(';')[0].trim() : 'image/jpeg';
            const base64Data = `data:${cleanMime};base64,${buffer.toString('base64')}`;

            // Kirim status "sedang mengetik..."
            const progressMessage = await m.reply('🔍 _Sedang menganalisis gambar..._');
            const progressKey = progressMessage?.key || null;

            const payload = {
                model: VISION_MODEL,
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: base64Data,
                                },
                            },
                        ],
                    },
                ],
            };

            const response = await axios.post(
                `${DS_BASE_URL.replace(/\/+$/, '')}/v1/chat/completions`,
                payload,
                {
                    headers: {
                        Authorization: `Bearer ${DS_API_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 120000,
                }
            );

            const answer = response.data?.choices?.[0]?.message?.content;
            if (!answer) {
                throw new Error('Tidak ada respon teks dari model Vision.');
            }

            const formattedAnswer = formatToWhatsApp(answer);
            const finalText = `👁️ *DeepSeek Vision*\n\n${formattedAnswer}`;

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
            console.error('Vision2 Command Error:', error?.response?.data || error.message);
            await m.react('❌');

            const errorMsg =
                error?.response?.data?.error?.message ||
                error?.response?.data?.message ||
                error.message ||
                'Gagal memproses gambar.';

            await m.reply(`❌ *Vision Error*: ${errorMsg}`);
        }
    },
};
