export default {
    name: 'owner',
    aliases: ['developer', 'creator'],
    description: 'Menampilkan kontak owner bot',
    category: 'Info',
    execute: async (sock, m) => {
        const ownerName = 'Roy Antidonasi Creative';
        const cleanNumber = '62895395590009';

        const vcard =
            'BEGIN:VCARD\n' +
            'VERSION:3.0\n' +
            `FN:${ownerName}\n` +
            `ORG:Antidonasi Creative;\n` +
            `TEL;type=CELL;type=VOICE;waid=${cleanNumber}:+${cleanNumber}\n` +
            'END:VCARD';

        try {
            await sock.sendMessage(m.chat, {
                contacts: {
                    displayName: ownerName,
                    contacts: [{ vcard }],
                },
            }, { quoted: m });
        } catch {
            await sock.sendMessage(m.chat, {
                text: `*Owner Bot*\n\nNama: *${ownerName}*\nWhatsApp: https://wa.me/${cleanNumber} (+${cleanNumber})`,
            }, { quoted: m });
        }
    },
};
