import { createRule } from '../../services/cloudflare.js';
import { settings } from '../../config/settings.js';

export default {
    name: 'cfwhitelist',
    description: 'Whitelist IP in Cloudflare',
    category: 'Cloudflare',
    execute: async (sock, m, args) => {
        const sender = m.sender;
        const isOwner =
            sender === settings.ownerNumber ||
            sender === settings.ownerLid ||
            sender.split(':')[0] === settings.ownerNumber.split('@')[0];
        if (!isOwner) return m.reply('Access Denied. Owner only.');

        const ip = args[0];
        const notes = args.slice(1).join(' ');
        if (!ip) return m.reply(`Usage: ${settings.prefix}cfwhitelist <ip> <notes>`);

        await m.reply('Whitelisting IP...');
        try {
            const result = await createRule(ip, 'whitelist', notes);
            await m.reply(
                `Successfully WHITELISTED IP: *${result.configuration.value}*\nID: ${result.id}`
            );
        } catch (error) {
            await m.reply(`Error: ${error.message}`);
        }
    },
};
