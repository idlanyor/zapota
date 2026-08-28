import { listRules } from '../../services/cloudflare.js';
import { settings } from '../../config/settings.js';

export default {
    name: 'cflist',
    description: 'List Cloudflare Access Rules',
    category: 'Cloudflare',
    execute: async (sock, m, args) => {
        const sender = m.sender;
        const isOwner =
            sender === settings.ownerNumber ||
            sender === settings.ownerLid ||
            sender.split(':')[0] === settings.ownerNumber.split('@')[0];
        if (!isOwner) return m.reply('Access Denied. Owner only.');

        await m.react('⏳');
        try {
            const mode = args[0] ? args[0].toLowerCase() : null;
            const rules = await listRules(mode);

            if (rules.length === 0) {
                await m.react('❌');
                return m.reply('No rules found.');
            }

            const tableRows = rules.map((r) => {
                const dateStr = new Date(r.created_on).toLocaleDateString('id-ID', {
                    day: '2-digit',
                    month: '2-digit',
                });
                return {
                    items: [r.configuration.value.substring(0, 20), r.mode.toUpperCase(), dateStr],
                    isHeading: false,
                };
            });

            const msg = {
                botForwardedMessage: {
                    message: {
                        richResponseMessage: {
                            messageType: 1,
                            submessages: [
                                {
                                    messageType: 2,
                                    messageText: `🛡️ *CLOUDFLARE ACCESS RULES*\nMode: ${mode || 'ALL'}`,
                                },
                                {
                                    messageType: 4,
                                    tableMetadata: {
                                        title: 'Security Rules',
                                        rows: [
                                            {
                                                items: ['Value/IP', 'Mode', 'Created'],
                                                isHeading: true,
                                            },
                                            ...tableRows,
                                        ],
                                    },
                                },
                            ],
                            contextInfo: {
                                forwardingScore: 1,
                                isForwarded: true,
                                forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' },
                                forwardOrigin: 4,
                                stanzaId: m.key.id,
                                participant: m.sender,
                                quotedMessage: m.message,
                            },
                        },
                    },
                },
                messageContextInfo: {
                    botMetadata: {
                        messageDisclaimerText: 'Cloudflare Monitoring via AI',
                    },
                },
            };

            await sock.relayMessage(m.chat, msg, { messageId: sock.generateMessageTag() });
            await m.react('✅');
        } catch (error) {
            await m.react('❌');
            await m.reply(`Error: ${error.message}`);
        }
    },
};
