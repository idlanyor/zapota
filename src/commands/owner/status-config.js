import Settings from '../../database/models/Settings.js';
import { clearSettingsCache } from '../../handlers/messageHandler.js';

export default [
    {
        name: 'autoread',
        aliases: ['readstatus'],
        description: 'On/Off auto view status orang lain',
        category: 'Owner',
        execute: async (sock, m, args, text) => {
            let botSettings =
                (await Settings.findOne({ id: 'bot_settings' })) ||
                (await Settings.create({ id: 'bot_settings' }));
            botSettings.autoStatusRead = !botSettings.autoStatusRead;
            await botSettings.save();
            clearSettingsCache();
            m.reply(
                ` Auto View Status berhasil ${botSettings.autoStatusRead ? '*DIAKTIFKAN*' : '*DIMATIKAN*'}`
            );
        },
    },
];
