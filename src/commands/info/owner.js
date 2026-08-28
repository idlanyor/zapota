import { settings } from '../../config/settings.js';

export default {
    name: 'owner',
    aliases: ['developer', 'creator'],
    description: 'Menampilkan kontak owner bot',
    category: 'Info',
    execute: async (sock, m, args, text) => {
        const ownerJid = settings.ownerNumber;
        const ownerName = settings.ownerName;
        const cleanNumber = ownerJid.split('@')[0];

        // Format vCard standar WhatsApp dengan escape \n yang benar
        const vcard =
            'BEGIN:VCARD\n' +
            'VERSION:3.0\n' +
            `FN:${ownerName}\n` +
            `ORG:${settings.botName} Developer;\n` +
            `TEL;type=CELL;type=VOICE;waid=${cleanNumber}:+${cleanNumber}\n` +
            'END:VCARD';

        await sock.sendMessage(m.chat, {
            contacts: {
                displayName: ownerName,
                contacts: [{ vcard }],
            },
        });
    },
};
