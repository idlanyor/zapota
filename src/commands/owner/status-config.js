import { getBotSettings, saveBotSettings } from '../../services/settingsService.js';

export default [
    {
        name: 'autoread',
        aliases: ['readstatus'],
        description: 'On/Off auto view status orang lain',
        category: 'Owner',
        execute: async (sock, m, args, text) => {
            let botSettings = await getBotSettings();
            botSettings.autoStatusRead = !botSettings.autoStatusRead;
            await saveBotSettings(botSettings);
            m.reply(
                ` Auto View Status berhasil ${botSettings.autoStatusRead ? '*DIAKTIFKAN*' : '*DIMATIKAN*'}`
            );
        },
    },
];
