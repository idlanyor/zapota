import { downloadContentFromMessage } from '../../wa/helpers.js';
import { processAiTransaction } from '../../services/financeService.js';

export default {
    name: 'catat',
    aliases: ['transaksi', 'bill'],
    description: 'Catat transaksi otomatis via suara/teks (Gemini 2.5 Flash)',
    category: 'Finance',
    execute: async (sock, m, args, text) => {
        try {
            const isQuoted = !!m.quoted;
            const msg = isQuoted ? m.quoted : m.msg;
            const mime = msg.mimetype || '';
            const mtype = isQuoted ? m.quoted.mtype : m.mtype;

            const isAudio = /audio/.test(mime) || /audioMessage/.test(mtype);
            const isImage = /image/.test(mime) || /imageMessage/.test(mtype);
            let prompt = text;
            let fileData = null;

            if (isAudio || isImage) {
                const mediaType = isAudio ? 'audio' : 'image';
                await m.react('⏳');
                const stream = await downloadContentFromMessage(msg, mediaType, sock);
                let buffer = Buffer.from([]);
                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                fileData = {
                    buffer,
                    mimeType: isAudio ? 'audio/mpeg' : 'image/jpeg',
                };
            }

            if (!prompt && !fileData) {
                return m.reply(
                    'Kirim/balas VN atau ketik teks untuk mencatat transaksi.\nContoh: ".catat beli bakso 15rb"'
                );
            }

            const result = await processAiTransaction(
                m.sender,
                m.pushName || 'User',
                prompt,
                fileData
            );

            if (result.error) {
                await m.react('❌');
                return m.reply(result.error);
            }

            const transactions = result.transactions;
            let responseMsg = `*${transactions.length} TRANSAKSI BERHASIL DICATAT* \n\n`;

            for (const tx of transactions) {
                const statusEmoji = tx.type === 'income' ? '📈' : '📉';
                const formattedAmount = new Intl.NumberFormat('id-ID', {
                    style: 'currency',
                    currency: 'IDR',
                    maximumFractionDigits: 0,
                }).format(tx.amount);
                const txDate = new Date(tx.date).toLocaleString('id-ID', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                });

                responseMsg += `${statusEmoji} *${formattedAmount}*\n`;
                responseMsg += `└ _${tx.description} (${txDate})_\n\n`;
            }

            await m.reply(responseMsg.trim());
            await m.react('✅');
        } catch (error) {
            console.error('Catat Error:', error);
            await m.react('❌');
            await m.reply(`Gagal mencatat transaksi: ${error.message}`);
        }
    },
};
