import { createRule } from '../../services/cloudflare.js';
import { settings } from '../../config/settings.js';

export default {
    name: 'cfban',
    description: 'Block IP in Cloudflare',
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
        if (!ip) return m.reply(`Usage: ${settings.prefix}cfban <ip> <notes>`);

        await m.reply('Blocking IP...');
        try {
            const result = await createRule(ip, 'block', notes);
            await m.reply(
                `Successfully BANNED IP: *${result.configuration.value}*\nID: ${result.id}`
            );
        } catch (error) {
            await m.reply(`Error: ${error.message}`);
        }
    },
};
