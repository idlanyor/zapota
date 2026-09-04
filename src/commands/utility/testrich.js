import { randomUUID } from 'node:crypto';

export default {
    name: 'testrich',
    description: 'Explore AI Rich Responses (Table & Code)',
    category: 'Utility',
    execute: async (sock, m, args) => {
        const type = args[0]?.toLowerCase();
        const responseId = randomUUID();

        const buildMsg = (submessages) => ({
            messageContextInfo: {
                deviceListMetadata: {},
                deviceListMetadataVersion: 2,
                botMetadata: {
                    messageDisclaimerText: '',
                    botResponseId: responseId,
                },
            },
            botForwardedMessage: {
                message: {
                    richResponseMessage: {
                        messageType: 1,
                        submessages,
                        contextInfo: {
                            forwardingScore: 1,
                            isForwarded: true,
                            forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' },
                            forwardOrigin: 4,
                        },
                    },
                },
            },
        });

        const tests = {
            table: [
                { messageType: 2, messageText: '📊 *NATIVE TABLE TEST*' },
                {
                    messageType: 4,
                    tableMetadata: {
                        title: 'System Status',
                        rows: [
                            { items: ['Service', 'Status', 'Ping'], isHeading: true },
                            { items: ['Database', 'Connected', '12ms'], isHeading: false },
                            { items: ['Storage', 'Available', '85%'], isHeading: false },
                        ],
                    },
                },
            ],
            code: [
                { messageType: 2, messageText: '💻 *CODE BLOCK TEST*' },
                {
                    messageType: 5,
                    codeMetadata: {
                        codeLanguage: 'javascript',
                        codeBlocks: [
                            { highlightType: 1, codeContent: 'const ' },
                            { highlightType: 0, codeContent: 'bot = ' },
                            { highlightType: 3, codeContent: "'Kanata'" },
                            { highlightType: 0, codeContent: ';\n' },
                        ],
                    },
                },
            ],
            carousel: [
                { messageType: 2, messageText: '🎬 *NATIVE CAROUSEL REELS TEST*' },
                {
                    messageType: 9,
                    contentItemsMetadata: {
                        contentType: 1,
                        itemsMetadata: [
                            {
                                reelItem: {
                                    title: 'Lofi Chill Beats - Coding Session',
                                    thumbnailUrl:
                                        'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600',
                                    videoUrl: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
                                    profileIconUrl:
                                        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100',
                                },
                            },
                            {
                                reelItem: {
                                    title: 'Cyberpunk 2077 Night City Vibes',
                                    thumbnailUrl:
                                        'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600',
                                    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                                    profileIconUrl:
                                        'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100',
                                },
                            },
                            {
                                reelItem: {
                                    title: 'Street Food Tour Jakarta Malam',
                                    thumbnailUrl:
                                        'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600',
                                    videoUrl: 'https://www.youtube.com/watch?v=kXYiU_JCYtU',
                                    profileIconUrl:
                                        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100',
                                },
                            },
                        ],
                    },
                },
            ],
            map: [
                { messageType: 2, messageText: '📍 *NATIVE MAP LOCATION TEST*' },
                {
                    messageType: 7,
                    mapMetadata: {
                        annotations: [
                            {
                                annotationNumber: 1,
                                latitude: -6.175392,
                                longitude: 106.827153,
                                title: 'Monumen Nasional (Monas)',
                                body: 'Gambir, Kecamatan Gambir, Kota Jakarta Pusat, DKI Jakarta',
                            },
                            {
                                annotationNumber: 2,
                                latitude: -6.208763,
                                longitude: 106.845599,
                                title: 'Bundaran HI',
                                body: 'Menteng, Kota Jakarta Pusat, DKI Jakarta',
                            },
                        ],
                    },
                },
            ],
            latex: [
                { messageType: 2, messageText: '🧮 *NATIVE LATEX MATH FORMULA TEST*' },
                {
                    messageType: 8,
                    latexMetadata: {
                        expressions: [
                            {
                                latexExpression:
                                    '\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}',
                            },
                            {
                                latexExpression:
                                    'E = mc^2 \\quad \\Longleftrightarrow \\quad m = \\frac{E}{c^2}',
                            },
                        ],
                    },
                },
            ],
        };

        if (!type || !tests[type]) {
            let help = `*── 「 RICH TEST HELP 」 ──*\n\n`;
            help += `Gunakan format: \`.testrich <type>\`\n\n`;
            help += `*Available Types:*\n`;
            Object.keys(tests).forEach((t) => {
                help += `➛ ${t}\n`;
            });
            return m.reply(help);
        }

        const msg = buildMsg(tests[type]);
        await sock.relayMessage(m.chat, msg, { messageId: responseId, raw: true });
    },
};
