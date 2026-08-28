export default {
    name: 'listdemo',
    aliases: ['demolist', 'testlist'],
    description: 'Demo list message klasik dan interactive single_select',
    category: 'Utility',
    execute: async (sock, m, args) => {
        const mode = (args[0] || 'both').toLowerCase();
        const targetChat = !m.isGroup && m.chatAlt && m.chatAlt !== m.chat ? m.chatAlt : m.chat;

        const classicPayload = {
            text: 'Demo list klasik ala Sanka-Baileys',
            footer: 'Kanata Bot',
            title: 'Pilih salah satu menu',
            buttonText: 'Buka daftar',
            sections: [
                {
                    title: 'Downloader',
                    rows: [
                        {
                            title: 'YouTube Search',
                            rowId: '.yts himawari',
                            description: 'Cari video YouTube',
                        },
                        {
                            title: 'TikTok',
                            rowId: '.tiktok https://vt.tiktok.com/',
                            description: 'Download TikTok',
                        },
                    ],
                },
                {
                    title: 'Tools',
                    rows: [
                        { title: 'Ping', rowId: '.ping', description: 'Tes kecepatan bot' },
                        { title: 'Menu', rowId: '.menu', description: 'Buka daftar command' },
                    ],
                },
            ],
        };

        const interactivePayload = {
            text: 'Demo interactive list modern `single_select`',
            footer: 'Kanata Bot',
            buttonTitle: 'Klik untuk pilih',
            buttons: [
                {
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({
                        display_text: 'Owner Bot',
                        id: '.owner',
                    }),
                },
            ],
            sections: [
                {
                    title: 'Kategori Utama',
                    highlight_label: 'Demo',
                    rows: [
                        {
                            header: 'System',
                            title: 'Ping',
                            description: 'Jalankan command ping',
                            id: '.ping',
                        },
                        {
                            header: 'Navigation',
                            title: 'Menu',
                            description: 'Buka menu command',
                            id: '.menu',
                        },
                    ],
                },
            ],
        };

        if (mode === 'classic' || mode === 'list') {
            await sock.sendListMessage(targetChat, classicPayload, { quoted: m });
            return;
        }

        if (mode === 'interactive' || mode === 'modern') {
            await sock.sendInteractiveList(targetChat, interactivePayload, { quoted: m });
            return;
        }

        if (!m.isGroup) {
            await sock.sendListMessage(targetChat, classicPayload, { quoted: m });
        }
        await sock.sendInteractiveList(targetChat, interactivePayload, { quoted: m });
    },
};
