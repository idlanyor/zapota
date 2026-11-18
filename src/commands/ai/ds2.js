import axios from 'axios';
import { env } from '../../config/env.js';
import { settings } from '../../config/settings.js';

const DEFAULT_MODEL = 'hv/deepseek-ai/deepseek-v4.1-flash-1017';

/** Edit the progress message at most every 60 new characters or 1.5 s. */
const EDIT_EVERY_CHARS = 60;
const EDIT_EVERY_MS = 1500;

export default {
    name: 'ds2',
    description: 'Tanya DeepSeek V4.1 Flash (streaming)',
    category: 'AI',
    execute: async (sock, m, args, text) => {
        const query = (text || m.quoted?.text || '').trim();
        if (!query) {
            return m.reply(
                `Ketik pertanyaan untuk DeepSeek. Contoh: ${settings.prefix}ds2 Siapa penemu lampu bohlam?`
            );
        }
        if (!env.DS2_BASE_URL || !env.DS2_API_KEY) {
            return m.reply('❌ .ds2 belum dikonfigurasi (DS2_BASE_URL / DS2_API_KEY).');
        }

        let progressKey = null;
        try {
            progressKey = (await m.reply('_Menghubungkan ke DeepSeek V4.1 Flash..._'))?.key || null;
        } catch {
            // No progress message: answer with a normal reply at the end.
        }

        // Edits are chained so they reach WhatsApp in order.
        let edits = Promise.resolve();
        const edit = (content) => {
            edits = edits.then(() =>
                sock.sendMessage(m.chat, { text: content, edit: progressKey }).catch(() => {})
            );
            return edits;
        };

        try {
            const response = await axios({
                method: 'post',
                url: `${env.DS2_BASE_URL.replace(/\/+$/, '')}/chat/completions`,
                headers: {
                    Authorization: `Bearer ${env.DS2_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                data: {
                    model: env.DS2_MODEL || DEFAULT_MODEL,
                    messages: [{ role: 'user', content: query }],
                    stream: true,
                },
                responseType: 'stream',
                timeout: 60000,
            });

            let fullText = '';
            let pending = '';
            let lastLength = 0;
            let lastTime = Date.now();

            await new Promise((resolve, reject) => {
                response.data.on('data', (chunk) => {
                    pending += chunk.toString();
                    const lines = pending.split('\n');
                    pending = lines.pop(); // keep an incomplete line for the next chunk

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') continue;
                        try {
                            const content = JSON.parse(trimmed.slice(6)).choices?.[0]?.delta
                                ?.content;
                            if (content) fullText += content;
                        } catch {
                            // Skip a malformed event.
                        }
                    }

                    const now = Date.now();
                    if (
                        progressKey &&
                        (fullText.length - lastLength > EDIT_EVERY_CHARS ||
                            now - lastTime > EDIT_EVERY_MS)
                    ) {
                        lastLength = fullText.length;
                        lastTime = now;
                        edit(`${fullText} ▒`);
                    }
                });
                response.data.on('end', resolve);
                response.data.on('error', reject);
            });

            const finalText = fullText.trim() || 'Tidak ada respons dari model.';
            if (progressKey) await edit(finalText);
            else await m.reply(finalText);
        } catch (err) {
            const errorMsg = `Gagal terhubung ke DeepSeek: ${err.message || 'Unknown error'}`;
            if (progressKey) await edit(errorMsg);
            else await m.reply(errorMsg);
        }
    },
};
