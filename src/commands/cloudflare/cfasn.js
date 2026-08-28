import { createAsnRule, deleteAsnRule, listAsnRules } from '../../services/cloudflare.js';
import { settings } from '../../config/settings.js';

export default {
    name: 'cfasn',
    aliases: ['cfasnban', 'cfasnunban', 'cfasnlist'],
    description: 'Manage Cloudflare AS number rules (ban/unban/list)',
    category: 'Cloudflare',
    execute: async (sock, m, args) => {
        const sender = m.sender;
        const isOwner =
            sender === settings.ownerNumber ||
            sender === settings.ownerLid ||
            sender.split(':')[0] === settings.ownerNumber.split('@')[0];
        if (!isOwner) return m.reply('Access Denied. Owner only.');

        const usedPrefix = m.body.slice(0, 1);
        const command = m.body.slice(usedPrefix.length).trim().split(' ')[0].toLowerCase();

        try {
            if (command === 'cfasnlist') {
                await m.react('⏳');
                const mode = args[0] ? args[0].toLowerCase() : null;
                const rules = await listAsnRules(mode);

                if (!rules || rules.length === 0) {
                    await m.react('❌');
                    return m.reply('No AS number rules found.');
                }

                let msg = `*Cloudflare ASN Access Rules*\n\n`;
                rules.forEach((r, i) => {
                    msg += `${i + 1}. *${r.configuration.value}* - [${r.mode.toUpperCase()}]\n`;
                    msg += `   Notes: ${r.notes || '-'}\n`;
                    msg += `   Date: ${new Date(r.created_on).toLocaleDateString()}\n\n`;
                });
                await m.reply(msg);
                await m.react('✅');
            } else if (command === 'cfasnban') {
                const asn = args[0];
                const notes = args.slice(1).join(' ') || 'ASN banned via WhatsApp Bot';
                if (!asn)
                    return m.reply(
                        `Usage: ${usedPrefix}cfasnban <asn> [notes]\nExample: ${usedPrefix}cfasnban AS13335 Spam source`
                    );

                await m.react('⏳');
                const result = await createAsnRule(asn, 'block', notes);
                await m.reply(
                    `Successfully BANNED ASN: *${result.configuration.value}*\nID: ${result.id}`
                );
                await m.react('✅');
            } else if (command === 'cfasnunban') {
                const asn = args[0];
                if (!asn)
                    return m.reply(
                        `Usage: ${usedPrefix}cfasnunban <asn>\nExample: ${usedPrefix}cfasnunban AS13335`
                    );

                await m.react('⏳');
                const result = await deleteAsnRule(asn);

                if (result) {
                    await m.reply(`Successfully removed rule for ASN: *${result.asn}*`);
                    await m.react('✅');
                } else {
                    await m.react('❌');
                    await m.reply(`ASN not found in firewall rules.`);
                }
            } else {
                // Default menu for `cfasn`
                let menu = `*── 「 CLOUDFLARE ASN MANAGER 」 ──*\n\n`;
                menu += `*COMMANDS:*\n`;
                menu += `• *${usedPrefix}cfasnban <asn> [notes]* - Block an AS number\n`;
                menu += `• *${usedPrefix}cfasnunban <asn>* - Remove an AS number rule\n`;
                menu += `• *${usedPrefix}cfasnlist [mode]* - List AS number rules (block/whitelist)\n\n`;
                menu += `*EXAMPLE:*\n`;
                menu += `• ${usedPrefix}cfasnban AS13335 Cloudflare spam\n`;
                menu += `• ${usedPrefix}cfasnunban AS13335\n\n`;
                menu += `*NOTE:*\n`;
                menu += `• AS prefix optional, e.g. *AS13335* or *13335*\n`;
                menu += `• *© Kanata Bot*`;
                return m.reply(menu);
            }
        } catch (error) {
            console.error(error);
            const errMsg = error.response?.data?.errors?.[0]?.message || error.message;
            await m.react('❌');
            await m.reply(`❌ Error: ${errMsg}`);
        }
    },
};
