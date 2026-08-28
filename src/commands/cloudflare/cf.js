import { listRules, createRule, deleteRule } from '../../services/cloudflare.js';
import Settings from '../../database/models/Settings.js';
import { getCachedSettings } from '../../handlers/messageFlow.js';

export default {
    name: 'cf',
    aliases: [
        'cfban',
        'cfunban',
        'cfwhitelist',
        'cflist',
        'cfasn',
        'cfasnban',
        'cfasnunban',
        'cfasnlist',
    ],
    description: 'Cloudflare Account Firewall Management',
    category: 'Cloudflare',
    execute: async (sock, m, args, text) => {
        // --- NEW SECURITY CHECK ---
        const botSettings = await getCachedSettings();
        const { settings } = await import('../../config/settings.js');
        const dbOwners = botSettings.owners || [];
        const staticOwners = [settings.ownerNumber, settings.ownerLid];

        const isOwner = [...staticOwners, ...dbOwners].includes(m.sender);
        if (!isOwner) return m.reply('Access Denied. Owner only.');
        // --------------------------

        const usedPrefix = m.body.slice(0, 1);
        const command = m.body.slice(usedPrefix.length).trim().split(' ')[0].toLowerCase();

        try {
            if (command === 'cf') {
                let menu = `*── 「 CLOUDFLARE MANAGER 」 ──*\n\n`;
                menu += `*FIREWALL:*\n`;
                menu += `• *${usedPrefix}cflist [mode]* - List IP rules (block/whitelist)\n`;
                menu += `• *${usedPrefix}cfban <ip> [notes]* - Block an IP address\n`;
                menu += `• *${usedPrefix}cfwhitelist <ip> [notes]* - Allow an IP address\n`;
                menu += `• *${usedPrefix}cfunban <ip>* - Remove an IP rule\n`;
                menu += `• *${usedPrefix}cfasn [sub]* - AS number ban/unban manager\n`;
                menu += `• *${usedPrefix}cfasnban <asn> [notes]* - Block an AS number\n`;
                menu += `• *${usedPrefix}cfasnunban <asn>* - Remove an AS number rule\n`;
                menu += `• *${usedPrefix}cfasnlist [mode]* - List AS number rules\n\n`;

                menu += `*CONFIG & ZONES:*\n`;
                menu += `• *${usedPrefix}cfset* - Cloudflare API configuration\n`;
                menu += `• *${usedPrefix}cfzones* - Manage & sync domains\n`;
                menu += `• *${usedPrefix}cftest* - Test API connectivity\n\n`;

                menu += `*DNS RECORDS:*\n`;
                menu += `• *${usedPrefix}listdns <domain>* - List DNS records\n`;
                menu += `• *${usedPrefix}adddns <domain> <type> <name> <content>* - Add DNS record\n\n`;

                menu += `*© Kanata Bot*`;
                return m.reply(menu);
            }

            if (command === 'cflist') {
                await m.react('⏳');
                const mode = args[0] ? args[0].toLowerCase() : null;
                const rules = await listRules(mode);

                if (!rules || rules.length === 0) {
                    await m.react('❌');
                    return m.reply('No rules found.');
                }

                let msg = `*Cloudflare Access Rules*\n\n`;
                rules.forEach((r, i) => {
                    msg += `${i + 1}. *${r.configuration.value}* - [${r.mode.toUpperCase()}]\n`;
                    msg += `   Notes: ${r.notes || '-'}\n`;
                    msg += `   Date: ${new Date(r.created_on).toLocaleDateString()}\n\n`;
                });
                await m.reply(msg);
                await m.react('✅');
            } else if (command === 'cfban') {
                const ip = args[0];
                const notes = args.slice(1).join(' ') || 'Banned via WhatsApp Bot';
                if (!ip) return m.reply(`Usage: ${usedPrefix}cfban <ip> <notes>`);

                await m.react('⏳');
                const result = await createRule(ip, 'block', notes);
                await m.reply(
                    `Successfully BANNED IP: *${result.configuration.value}*\nID: ${result.id}`
                );
                await m.react('✅');
            } else if (command === 'cfwhitelist') {
                const ip = args[0];
                const notes = args.slice(1).join(' ') || 'Whitelisted via WhatsApp Bot';
                if (!ip) return m.reply(`Usage: ${usedPrefix}cfwhitelist <ip> <notes>`);

                await m.react('⏳');
                const result = await createRule(ip, 'whitelist', notes);
                await m.reply(
                    `Successfully WHITELISTED IP: *${result.configuration.value}*\nID: ${result.id}`
                );
                await m.react('✅');
            } else if (command === 'cfunban') {
                const ip = args[0];
                if (!ip) return m.reply(`Usage: ${usedPrefix}cfunban <ip>`);

                await m.react('⏳');
                const result = await deleteRule(ip);

                if (result) {
                    await m.reply(`Successfully removed rule for IP: *${result.ip}*`);
                    await m.react('✅');
                } else {
                    await m.react('❌');
                    await m.reply(`IP not found in firewall rules.`);
                }
            }
        } catch (error) {
            console.error(error);
            const errMsg = error.response?.data?.errors?.[0]?.message || error.message;
            await m.react('❌');
            await m.reply(`❌ Error: ${errMsg}`);
        }
    },
};
