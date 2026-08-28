import { downloadContentFromMessage } from '../../wa/helpers.js';
import { settings } from '../../config/settings.js';

const BASE = (process.env.KANATA_BASE_URL || 'https://ai.kanata.web.id').replace(/\/+$/, '');
const KEY = process.env.KANATA_API_KEY;
const MODEL = 'ag/gemini-3-flash';

const SYSTEM_PROMPT =
    'You are a strict OCR engine. Transcribe ONLY the exact visible text in the image, verbatim, preserving line breaks and punctuation. Do not add greetings, commentary, explanation, markdown fences, or any extra characters. If there is no text, return an empty response.';

export default {
    name: 'read',
    aliases: ['ocr'],
    description: 'Extract text from image (OCR)',
    category: 'Tools',
    execute: async (sock, m, args) => {
        const isQuoted = !!m.quoted;
        const msg = isQuoted ? m.quoted : m.msg;
        const mime = msg.mimetype || '';
        const mtype = isQuoted ? m.quoted.mtype : m.mtype;
        const isImage = /image/.test(mime) || /imageMessage/.test(mtype);

        if (!isImage) {
            return m.reply(
                `Please reply to an image or send an image with caption ${settings.prefix}read to extract text.`
            );
        }

        if (!KEY) {
            return m.reply('KANATA_API_KEY belum diset di .env');
        }

        await m.react('⏳');

        try {
            const stream = await downloadContentFromMessage(msg, 'image', sock);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            const mimeType = mime || 'image/jpeg';
            const imageBase64 = buffer.toString('base64');

            const res = await fetch(`${BASE}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: MODEL,
                    temperature: 0,
                    max_tokens: 4096,
                    stream: false,
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'image_url',
                                    image_url: {
                                        url: `data:${mimeType};base64,${imageBase64}`,
                                    },
                                },
                                {
                                    type: 'text',
                                    text: 'Salin seluruh teks yang terlihat pada gambar ini persis apa adanya.',
                                },
                            ],
                        },
                    ],
                }),
            });

            if (!res.ok) {
                const errBody = await res.text();
                throw new Error(`API ${res.status}: ${errBody.slice(0, 300)}`);
            }

            const json = await res.json();
            const out = (json?.choices?.[0]?.message?.content || '').trim();

            await m.reply(out || 'Tidak ada teks terdeteksi.');
            await m.react('✅');
        } catch (error) {
            console.error('OCR Error:', error);
            await m.react('❌');
            await m.reply(`Error: ${error.message || 'Failed to read text'}`);
        }
    },
};
