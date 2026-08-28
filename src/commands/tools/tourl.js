import { settings } from '../../config/settings.js';
import { uploadBufferToKanata } from '../../lib/mediaUpload.js';

export default {
    name: 'tourl',
    aliases: ['upload', 'toimageurl'],
    description: 'Upload media (image, video, audio, sticker, document) to get a public URL',
    category: 'Tools',
    execute: async (sock, m, args) => {
        try {
            const quoted = m.quoted ? m.quoted : m;
            const msg = quoted.msg || quoted;
            const mime = msg.mimetype || '';

            if (!mime) {
                return m.reply(
                    `Reply to an image, video, audio, sticker, or document with *${settings.prefix}tourl*`
                );
            }

            await m.react('⏳');

            const buffer = await m.downloadMediaMessage(quoted);

            const ext = mime.split('/')[1]?.split(';')[0] || 'bin';
            const filename = msg.fileName || msg.filename || `file_${Date.now()}.${ext}`;

            const { url, response } = await uploadBufferToKanata(buffer, {
                filename,
                mimeType: mime,
                timeout: 60000,
            });

            if (url) {
                const { filename: responseFilename, content_type, original_filename } = response;
                const caption =
                    ` *Upload Success*\n\n` +
                    ` *URL:* ${url}\n` +
                    ` *File Name:* ${original_filename || responseFilename || filename}\n` +
                    ` *Mime Type:* ${content_type}`;

                const payload = {
                    text: caption,
                    footer: 'Klik tombol untuk copy URL',
                    title: 'KANATA UPLOADER',
                    interactiveButtons: [
                        {
                            name: 'cta_copy',
                            buttonParamsJson: JSON.stringify({
                                display_text: 'Copy URL',
                                copy_code: url,
                            }),
                        },
                    ],
                };

                if (typeof sock.sendInteractiveButtons === 'function') {
                    try {
                        await sock.sendInteractiveButtons(m.chat, payload, { quoted: m });
                        await m.react('✅');
                        return;
                    } catch {}
                }

                await m.reply(caption);
                await m.react('✅');
            } else {
                throw new Error('Failed to get URL from response');
            }
        } catch (error) {
            console.error('Error in tourl command:', error);
            await m.react('❌');
            await m.reply(' Failed to upload media. Please try again later.');
        }
    },
};
