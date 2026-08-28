import { downloadContentFromMessage } from '../../wa/helpers.js';
import { settings } from '../../config/settings.js';
import { generateAIResponse } from '../../lib/ai.js';

export default {
    name: 'ai',
    aliases: ['gemini', 'gmn', 'ask', 'claude', 'kanata'],
    description: 'AI Assistant (Claude-compatible) dengan tool command dan shell khusus Owner',
    category: 'AI',
    execute: async (sock, m, args, text) => {
        let progressKey = null;
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

                const stream = await downloadContentFromMessage(msg, 'image', sock);
                let buffer = Buffer.from([]);
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }

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

            const progressMessage = await m.reply('Sedang berpikir...');
            progressKey = progressMessage?.key || null;
            let lastEditAt = Date.now();

            const response = await generateAIResponse({
                sock,
                m,
                prompt,
                imageBuffer,
                imageMime,
                chatId: m.chat,
                isOwner: Boolean(m.isOwner),
                onTextDelta: async (partialText) => {
                    const now = Date.now();
                    if (!progressKey || now - lastEditAt < 1200 || !partialText.trim()) return;
                    try {
                        await sock.sendMessage(m.chat, {
                            text: `${partialText.replace(/\*\*(.*?)\*\*/g, '*$1*')} ▒`,
                            edit: progressKey,
                        });
                        lastEditAt = now;
                    } catch {}
                },
            });

            if (progressKey) {
                await sock.sendMessage(m.chat, { text: response, edit: progressKey });
            } else {
                await m.reply(response);
            }
            await m.react('✅');
        } catch (error) {
            console.error('AI API Error:', error);
            await m.react('❌');
            const errorText = `Error: ${error.message || 'Failed to process request'}`;
            if (progressKey) {
                await sock
                    .sendMessage(m.chat, { text: errorText, edit: progressKey })
                    .catch(() => m.reply(errorText));
            } else {
                await m.reply(errorText);
            }
        }
    },
};
