import { deleteRule } from '../../services/cloudflare.js';
import { settings } from '../../config/settings.js';

export default {
    name: 'cfunban',
    description: 'Unban IP in Cloudflare',
    category: 'Cloudflare',
    execute: async (sock, m, args) => {
        const sender = m.sender;
        const isOwner =
            sender === settings.ownerNumber ||
            sender === settings.ownerLid ||
            sender.split(':')[0] === settings.ownerNumber.split('@')[0];
        if (!isOwner) return m.reply('Access Denied. Owner only.');

        const ip = args[0];
        if (!ip) return m.reply(`Usage: ${settings.prefix}cfunban <ip>`);

        await m.reply('Deleting rule...');
        try {
            const result = await deleteRule(ip);
            if (result) {
                await m.reply(`Successfully removed rule for IP: *${result.ip}*`);
            } else {
                await m.reply(`IP not found in firewall rules.`);
            }
        } catch (error) {
            await m.reply(`Error: ${error.message}`);
        }
    },
};
