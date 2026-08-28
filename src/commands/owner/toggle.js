import Settings from '../../database/models/Settings.js';
import { commands } from '../../lib/commands.js';
import { settings } from '../../config/settings.js';

export default {
    name: 'toggle',
    aliases: ['disable', 'enable', 'listdisable'],
    description: 'Disable or Enable a command',
    category: 'Owner',
    execute: async (sock, m, args, text) => {
        const sender = m.sender;
        const isOwner =
            sender === settings.ownerNumber ||
            sender === settings.ownerLid ||
            sender.split(':')[0] === settings.ownerNumber.split('@')[0];
        if (!isOwner) return;

        const commandStr = m.body.slice(settings.prefix.length).trim().split(' ')[0].toLowerCase();

        let botSettings = await Settings.findOne({ id: 'bot_settings' });
        if (!botSettings) botSettings = await Settings.create({ id: 'bot_settings' });

        if (commandStr === 'listdisable') {
            if (botSettings.disabledCommands.length === 0)
                return m.reply('No commands are currently disabled.');
            let msg = `*Disabled Commands List*\n\n`;
            botSettings.disabledCommands.forEach((cmd, i) => {
                msg += `${i + 1}. ${cmd}\n`;
            });
            return m.reply(msg);
        }

        const targetCmd = args[0]?.toLowerCase();
        if (!targetCmd) return m.reply(`Usage: ${settings.prefix}${commandStr} <command_name>`);

        // Check if command exists
        const cmd = commands.get(targetCmd);
        if (!cmd) return m.reply(`Command *${targetCmd}* not found.`);
        if (cmd.name === 'toggle') return m.reply('You cannot disable the toggle command itself.');

        if (commandStr === 'disable') {
            if (botSettings.disabledCommands.includes(cmd.name)) {
                return m.reply(`Command *${cmd.name}* is already disabled.`);
            }
            botSettings.disabledCommands.push(cmd.name);
            await botSettings.save();
            await m.reply(`Successfully disabled command: *${cmd.name}*`);
        } else if (commandStr === 'enable') {
            if (!botSettings.disabledCommands.includes(cmd.name)) {
                return m.reply(`Command *${cmd.name}* is not disabled.`);
            }
            botSettings.disabledCommands = botSettings.disabledCommands.filter(
                (c) => c !== cmd.name
            );
            await botSettings.save();
            await m.reply(`Successfully enabled command: *${cmd.name}*`);
        }
    },
};
