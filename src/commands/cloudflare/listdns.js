import { getZoneId, listDnsRecords } from '../../services/cloudflare.js';
import { settings } from '../../config/settings.js';

export default {
    name: 'listdns',
    description: 'List DNS Records for a domain',
    category: 'Cloudflare',
    execute: async (sock, m, args) => {
        const sender = m.sender;
        const isOwner =
            sender === settings.ownerNumber ||
            sender === settings.ownerLid ||
            sender.split(':')[0] === settings.ownerNumber.split('@')[0];
        if (!isOwner) return m.reply('Access Denied. Owner only.');

        const domain = args[0];
        if (!domain)
            return m.reply(
                `Usage: ${settings.prefix}listdns <domain>\nExample: ${settings.prefix}listdns kanata.web.id`
            );

        await m.react('⏳');

        try {
            const zoneId = await getZoneId(domain);
            if (!zoneId) {
                await m.react('❌');
                return m.reply(`Error: Domain ${domain} not found in your Cloudflare account.`);
            }

            const records = await listDnsRecords(zoneId);
            if (records.length === 0) {
                await m.react('❌');
                return m.reply(`No DNS records found for ${domain}.`);
            }

            const tableRows = records.map((r) => {
                return {
                    items: [
                        r.type,
                        r.name.substring(0, 15),
                        r.content.substring(0, 15),
                        r.proxied ? '☁️' : '☁️✖️',
                    ],
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
                                    messageText: `🌐 *DNS RECORDS: ${domain.toUpperCase()}*`,
                                },
                                {
                                    messageType: 4,
                                    tableMetadata: {
                                        title: 'DNS Configuration',
                                        rows: [
                                            {
                                                items: ['Type', 'Name', 'Content', 'Prx'],
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
                        messageDisclaimerText: 'Cloudflare DNS Manager AI',
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
