import { settingsRepo } from '../../database/repos/settingsRepo.js';
import { clearSettingsCache } from '../../handlers/messageHandler.js';

export default [
    {
        name: 'autoread',
        aliases: ['readstatus'],
        description: 'On/Off auto view status orang lain',
        category: 'Owner',
        execute: async (sock, m, args, text) => {
            let botSettings =
                (await settingsRepo.get());
            botSettings.autoStatusRead = !botSettings.autoStatusRead;
            await settingsRepo.save(botSettings);
            clearSettingsCache();
            m.reply(
                ` Auto View Status berhasil ${botSettings.autoStatusRead ? '*DIAKTIFKAN*' : '*DIMATIKAN*'}`
            );
        },
    },
];
