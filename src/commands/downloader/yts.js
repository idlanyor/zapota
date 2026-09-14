import { proto, prepareWAMessageMedia, generateWAMessageFromContent } from 'baileys';
import { searchYouTube } from '../../lib/youtubeSearch.js';

export default {
    name: 'yts',
    aliases: ['ytsearch'],
    description: 'Cari Video dari YouTube',
    category: 'Downloader',
    execute: async (sock, m, args, text) => {
        if (!text) {
            return m.reply(`Mau cari apa?
Ketik *.yts <query>*
Contoh: *.yts bagai cinta pertama*`);
        }

        await m.react('⏳');

        try {
            const targetChat = !m.isGroup && m.chatAlt && m.chatAlt !== m.chat ? m.chatAlt : m.chat;
            const results = await searchYouTube(text, 6);

            if (!results.length) {
                await m.react('❌');
                return m.reply('Tidak ada hasil ditemukan.');
            }

            // Coba kirim format Carousel Meta AI
            try {
                const cards = await Promise.all(
                    results.map(async (video) => {
                        const media = await prepareWAMessageMedia(
                            { image: { url: video.thumbnail } },
                            { upload: sock.waUploadToServer }
                        );

                        return {
                            body: proto.Message.InteractiveMessage.Body.fromObject({
                                text: `*Durasi:* ${video.timestamp}\n*Views:* ${video.views}\n*Upload:* ${video.ago}`,
                            }),
                            footer: proto.Message.InteractiveMessage.Footer.fromObject({
                                text: `© ${video.author.name}`,
                            }),
                            header: proto.Message.InteractiveMessage.Header.fromObject({
                                title: `*${video.title}*`,
                                hasMediaAttachment: true,
                                ...media,
                            }),
                            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                                buttons: [
                                    {
                                        name: 'quick_reply',
                                        buttonParamsJson: JSON.stringify({
                                            display_text: 'Audio',
                                            id: `.ytmp3 ${video.url}`,
                                        }),
                                    },
                                    {
                                        name: 'quick_reply',
                                        buttonParamsJson: JSON.stringify({
                                            display_text: 'Video HD',
                                            id: `.ytmp4 ${video.url}`,
                                        }),
                                    },
                                    {
                                        name: 'cta_url',
                                        buttonParamsJson: JSON.stringify({
                                            display_text: 'Buka YT',
                                            url: video.url,
                                            merchant_url: video.url,
                                        }),
                                    },
                                ],
                            }),
                        };
                    })
                );

                const message = generateWAMessageFromContent(
                    targetChat,
                    {
                        viewOnceMessage: {
                            message: {
                                messageContextInfo: {
                                    deviceListMetadata: {},
                                    deviceListMetadataVersion: 2,
                                },
                                interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                                    body: proto.Message.InteractiveMessage.Body.fromObject({
                                        text: `*YouTube Search*\nQuery: _${text}_`,
                                    }),
                                    footer: proto.Message.InteractiveMessage.Footer.fromObject({
                                        text: 'Geser kartu untuk melihat hasil lainnya',
                                    }),
                                    header: proto.Message.InteractiveMessage.Header.fromObject({
                                        hasMediaAttachment: false,
                                    }),
                                    carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({
                                        cards,
                                        messageVersion: 1,
                                        carouselCardType:
                                            proto.Message.InteractiveMessage.CarouselMessage.CarouselCardType.HSCROLL_CARDS,
                                    }),
                                }),
                            },
                        },
                    },
                    { quoted: m, userJid: sock.user?.id }
                );

                const additionalNodes = [
                    {
                        tag: 'biz',
                        attrs: {},
                        content: [
                            {
                                tag: 'interactive',
                                attrs: { type: 'native_flow', v: '1' },
                                content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
                            },
                        ],
                    },
                ];

                if (!targetChat.endsWith('@g.us')) {
                    additionalNodes.push({ tag: 'bot', attrs: { biz_bot: '1' } });
                }

                await sock.relayMessage(targetChat, message.message, {
                    messageId: message.key.id,
                    additionalNodes,
                });
                await m.react('✅');
                return;
            } catch (carouselErr) {
                console.warn('[WARN] yts carousel upload failed, fallback to text list:', carouselErr?.message || carouselErr);
            }

            // Fallback: Teks list dengan thumbnail video pertama
            let listText = `*Hasil Pencarian YouTube*\nQuery: _${text}_\n\n`;
            results.forEach((v, i) => {
                listText += `*${i + 1}. ${v.title}*\n`;
                listText += `• Durasi: ${v.timestamp} | Views: ${v.views}\n`;
                listText += `• Download Audio: \`.ytmp3 ${v.url}\`\n`;
                listText += `• Download Video: \`.ytmp4 ${v.url}\`\n\n`;
            });

            await sock.sendMessage(
                m.chat,
                {
                    image: { url: results[0].thumbnail },
                    caption: listText.trim(),
                },
                { quoted: m }
            );
            await m.react('✅');
        } catch (err) {
            console.error('[ERROR] yts failed:', err);
            await m.react('❌');
            await m.reply(`Terjadi kesalahan: ${err.message}`);
        }
    },
};
