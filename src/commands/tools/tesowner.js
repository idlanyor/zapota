import { checkOwner } from '../../middlewares/auth.js';
import { getCachedSettings } from '../../handlers/messageFlow.js';

export default {
    name: 'tesowner',
    aliases: ['whoami', 'debugsender'],
    description: 'Debug sender JID/LID and owner status',
    category: 'Tools',
    execute: async (sock, m, args) => {
        const botSettings = await getCachedSettings();
        const isOwner = checkOwner(m, sock, botSettings);

        let dbOwners = botSettings?.owners || [];
        if (typeof dbOwners === 'string') {
            try { dbOwners = JSON.parse(dbOwners); } catch {}
        }

        const info = [
            `*── 「 DEBUG SENDER & OWNER 」 ──*`,
            ``,
            `*Sender (m.sender):* ${m.sender || '-'}`,
            `*Participant:* ${m.key?.participant || '-'}`,
            `*RemoteJid:* ${m.key?.remoteJid || '-'}`,
            `*Is Group:* ${m.isGroup ? 'Ya' : 'Tidak'}`,
            ``,
            `*Is Owner Result:* ${isOwner ? '✅ YES (OWNER)' : '❌ NO (NOT OWNER)'}`,
            ``,
            `*DB Owners:* ${JSON.stringify(dbOwners)}`,
        ].join('\n');

        await m.reply(info);
    },
};
