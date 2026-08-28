import { downloadContentFromMessage } from '../../wa/helpers.js';
import { settings } from '../../config/settings.js';
import User from '../../database/models/User.js';
import axios from 'axios';

export default {
    name: 'vision',
    aliases: ['vis', 'kanatavision'],
    description: 'Analisis gambar menggunakan Elysia Vision API Gateway. Bisa set model kustom.',
    category: 'AI',
    execute: async (sock, m, args, text) => {
        try {
            // Handle setmodel command
            if (args[0] === 'setmodel') {
                let availableModels = [];
                try {
                    const modelsRes = await axios.get('https://vision.kanata.web.id/models');
                    if (modelsRes.data && Array.isArray(modelsRes.data.data)) {
                        availableModels = modelsRes.data.data.map(m => m.id);
                    }
                } catch (err) {
                    console.error('Failed to fetch models list', err);
                    return m.reply('❌ Gagal mengambil daftar model dari server.');
                }

                if (availableModels.length === 0) {
                    return m.reply('❌ Tidak ada model yang tersedia saat ini.');
                }

                let newModel = args[1];

                if (!newModel) {
                    let modelList = 'Daftar model yang tersedia:\n';
                    availableModels.forEach((mod, idx) => {
                        modelList += `${idx + 1}. ${mod}\n`;
                    });
                    modelList += `\nGunakan angka untuk memilih model, contoh: *${settings.prefix}vision setmodel 1* atau ketik nama model secara langsung.`;
                    return m.reply(modelList);
                }

                if (!isNaN(newModel)) {
                    const idx = parseInt(newModel) - 1;
                    if (idx >= 0 && idx < availableModels.length) {
                        newModel = availableModels[idx];
                    } else {
                        return m.reply('❌ Pilihan angka tidak valid.');
                    }
                }

                await User.findOneAndUpdate(
                    { jid: m.sender },
                    { visionModel: newModel },
                    { upsert: true, new: true }
                );

                return m.reply(`✅ Vision model berhasil diubah menjadi: *${newModel}*`);
            }

            const isQuoted = !!m.quoted;
            const msg = isQuoted ? m.quoted : m.msg;
            const mime = msg.mimetype || '';
            const mtype = isQuoted ? m.quoted.mtype : m.mtype;

            const isImage = /image/.test(mime) || /imageMessage/.test(mtype);

            let prompt = text || 'Describe this image.';

            if (!isImage) {
                return m.reply(
                    `Usage: ${settings.prefix}vision <prompt> (reply to an image)\nUntuk mengganti model: ${settings.prefix}vision setmodel <nama_model>`
                );
            }

            await m.react('⏳');

            // Fetch selected model from DB
            const user = await User.findOne({ jid: m.sender });
            const selectedModel = user?.visionModel || 'or/openai/gpt-4o-mini';

            const stream = await downloadContentFromMessage(msg, 'image', sock);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            const base64Image = `data:${mime || 'image/jpeg'};base64,${buffer.toString('base64')}`;

            const response = await axios.post(
                'https://vision.kanata.web.id/vision',
                {
                    image: base64Image,
                    prompt: prompt,
                    model: selectedModel
                },
                {
                    headers: {
                        'x-api-key': 'hinatazaka46',
                        'Content-Type': 'application/json',
                    },
                }
            );

            const resultData = response.data;
            const resultText =
                resultData?.choices?.[0]?.message?.content || 'Tidak ada respon dari AI.';

            await m.reply(`*[ Model: ${selectedModel} ]*\n\n${resultText}`);
            await m.react('✅');
        } catch (error) {
            console.error('Vision API Error:', error?.response?.data || error);
            await m.react('❌');
            await m.reply(
                `Error: ${error?.response?.data?.message || error.message || 'Gagal memproses gambar.'}`
            );
        }
    },
};
