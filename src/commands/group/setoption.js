import { jidNormalizedUser } from '../../wa/helpers.js';
import Group from '../../database/models/Group.js';
import { clearSettingsCache } from '../../handlers/messageHandler.js';

export default {
    name: 'settings',
    aliases: ['setopt', 'option'],
    description: 'Atur opsi fitur grup (Antilink, Antitoxic, dll)',
    category: 'Group',
    execute: async (sock, m, args, text) => {
        if (!m.isGroup) return m.reply('Perintah ini hanya bisa digunakan di dalam grup!');

        // Cek Admin
        const groupMetadata = await sock.groupMetadata(m.chat);
        const participants = groupMetadata.participants;
        const isAdmin = participants.find(
            (p) =>
                jidNormalizedUser(p.id) === jidNormalizedUser(m.sender) &&
                (p.admin === 'admin' || p.admin === 'superadmin')
        );

        if (!isAdmin) return m.reply('Hanya admin grup yang bisa menggunakan perintah ini!');

        const options = [
            'antilink',
            'antitoxic',
            'welcome',
            'left',
            'mute',
            'antidelete',
            'prayerReminder',
        ];
        const input = args[0]?.toLowerCase();
        const value = args[1]?.toLowerCase();

        let groupData = await Group.findOne({ jid: m.chat });
        if (!groupData) groupData = await Group.create({ jid: m.chat });

        // Tanpa argumen / "status" → tampilkan semua opsi
        if (!input || input === 'status') {
            let status = `*── 「 GROUP OPTIONS 」 ──*\n\n`;
            options.forEach((opt) => {
                status += `➛ *${opt.toUpperCase()}*: ${groupData[opt] ? 'ON' : 'OFF'}\n`;
            });
            status += `\n*Cara pakai:* .setoption <opsi> <on|off>\nContoh: .setoption welcome on`;

            return sock.sendMessage(m.chat, { text: status }, { quoted: m });
        }

        if (!options.includes(input)) {
            return m.reply(`Opsi tidak valid! Pilih: ${options.join(', ')}`);
        }

        // Opsi valid tanpa nilai → tampilkan status opsi itu saja
        if (!value) {
            return m.reply(
                `*${input.toUpperCase()}* saat ini: ${groupData[input] ? 'ON' : 'OFF'}\n\n` +
                    `Ubah dengan: .setoption ${input} <on|off>`
            );
        }

        if (value !== 'on' && value !== 'off') {
            return m.reply(
                'Nilai tidak valid! Pakai `on` atau `off`.\nContoh: .setoption welcome on'
            );
        }

        try {
            const newStatus = value === 'on';
            groupData[input] = newStatus;
            await groupData.save();

            clearSettingsCache();

            await sock.sendMessage(
                m.chat,
                {
                    text: ` Berhasil ${newStatus ? 'MENGAKTIFKAN' : 'MENONAKTIFKAN'} fitur *${input.toUpperCase()}* di grup ini.`,
                },
                { quoted: m }
            );
        } catch (err) {
            console.error(err);
            m.reply('Gagal merubah opsi grup.');
        }
    },
};
