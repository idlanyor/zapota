import Poll from '../../database/models/Poll.js';

export default {
    name: 'vote',
    aliases: ['poll'],
    description: 'Membuat pesan voting/poll',
    category: 'Utility',
    execute: async (sock, m, args, text) => {
        if (!text || !text.includes('|')) {
            return m.reply(`Format salah!\nContoh: .vote Pertanyaan | Opsi 1 | Opsi 2`);
        }

        const parts = text.split('|').map((v) => v.trim());
        const question = parts[0];
        const options = parts.slice(1);

        if (options.length < 2) return m.reply('Minimal harus ada 2 opsi.');
        if (options.length > 12) return m.reply('Maksimal 12 opsi.');

        const pollMsg = await sock.sendMessage(m.chat, {
            poll: {
                name: question,
                values: options,
                selectableCount: 1,
            },
        });

        // Simpan rahasia pesan ke database untuk keperluan dekripsi vote nanti
        const messageSecret =
            pollMsg.messageContextInfo?.messageSecret ||
            pollMsg.message?.pollCreationMessage?.messageContextInfo?.messageSecret ||
            pollMsg.message?.messageContextInfo?.messageSecret;

        if (messageSecret) {
            await Poll.create({
                pollId: pollMsg.key.id,
                chat: m.chat,
                question: question,
                options: options,
                messageSecret: messageSecret,
            });
        }
    },
};
