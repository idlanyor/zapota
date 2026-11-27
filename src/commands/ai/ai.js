import { downloadMediaBuffer } from '../../wa/helpers.js';
import { settings } from '../../config/settings.js';
import { generateAIResponse } from '../../lib/ai.js';
import { sendAiRichReply, withTyping } from '../../wa/aiRich.js';

export default {
    name: 'ai',
    aliases: ['gemini', 'gmn', 'ask', 'claude', 'kanata'],
    description: 'AI Assistant (Claude-compatible) dengan tool command dan shell khusus Owner',
    category: 'AI',
    execute: async (sock, m, args, text) => {
        try {
            const isQuoted = !!m.quoted;
            const msg = isQuoted ? m.quoted : m.msg;
            const mime = msg.mimetype || '';
            const mtype = isQuoted ? m.quoted.mtype : m.mtype;

            const isImage = /image/.test(mime) || /imageMessage/.test(mtype);
            const isVideo = /video/.test(mime) || /videoMessage/.test(mtype);
            const isAudio = /audio/.test(mime) || /audioMessage/.test(mtype);

            let prompt = text;
            let imageBuffer = null;
            let imageMime = null;

            if (isVideo || isAudio) {
                return m.reply(
                    'Backend Claude-compatible saat ini hanya mendukung teks dan gambar.'
                );
            }

            if (isImage) {
                await m.react('⏳');

                const buffer = await downloadMediaBuffer(msg, 'image', sock);

                imageBuffer = buffer;
                imageMime = mime || 'image/jpeg';
                if (!prompt) prompt = 'Analisis gambar ini secara detail.';
            } else if (isQuoted && m.quoted.text) {
                prompt = prompt
                    ? `Context: "${m.quoted.text}"

Question: ${prompt}`
                    : m.quoted.text;
            }

            if (!prompt && !imageBuffer) {
                return m.reply(
                    `Usage: ${settings.prefix}ai <question> (reply to media for multimodal)`
                );
            }

            if (!imageBuffer) await m.react('⏳');

            const response = await withTyping(sock, m.chat, () =>
                generateAIResponse({
                    sock,
                    m,
                    prompt,
                    imageBuffer,
                    imageMime,
                    chatId: m.chat,
                    isOwner: Boolean(m.isOwner),
                    richOutput: true,
                })
            );

            await sendAiRichReply(sock, m, response);
            await m.react('✅');
        } catch (error) {
            console.error('AI API Error:', error);
            await m.react('❌');
            await m.reply(`Error: ${error.message || 'Failed to process request'}`);
        }
    },
};
