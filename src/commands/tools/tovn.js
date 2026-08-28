import { promisify } from 'util';
import { exec } from 'child_process';
import fs from 'fs';
import { makeResultPath } from '../../utils/resultPath.js';

const execPromise = promisify(exec);

export default {
    name: 'tovn',
    aliases: ['tovoicenote', 'mp3tovn'],
    description: 'Convert Audio/Video to Voice Note (VN)',
    category: 'Tools',
    execute: async (sock, m, args) => {
        const quoted = m.quoted ? m.quoted : m;
        const mime = quoted.msg?.mimetype || '';
        const isAudio = quoted.mtype === 'audioMessage' || mime.includes('audio');
        const isVideo = quoted.mtype === 'videoMessage' || mime.includes('video');

        if (!isAudio && !isVideo) {
            return m.reply(' Reply audio atau video yang ingin dijadikan Voice Note (VN).');
        }

        await m.react('⏳');

        try {
            const buffer = await quoted.download();
            if (!buffer) {
                await m.react('❌');
                return m.reply('❌ Gagal mengunduh media.');
            }

            const inputFileName = `input_${Date.now()}` + (isAudio ? '.mp3' : '.mp4');
            const outputFileName = `output_${Date.now()}.opus`;
            const inputFilePath = makeResultPath(inputFileName);
            const outputFilePath = makeResultPath(outputFileName);

            await fs.promises.writeFile(inputFilePath, buffer);

            // Convert to OPUS for WhatsApp Voice Note
            await execPromise(
                `ffmpeg -i "${inputFilePath}" -vn -c:a libopus -b:a 128k -vbr on -compression_level 10 "${outputFilePath}"`
            );

            if (fs.existsSync(outputFilePath)) {
                const audioBuffer = await fs.promises.readFile(outputFilePath);

                // Generate Rhythmic Waveform
                const waveLength = 70;
                const waveform = new Uint8Array(waveLength);
                for (let i = 0; i < waveLength; i++) {
                    const pulse = Math.sin(i / 2) * 60 + 120;
                    const noise = Math.random() * 40;
                    waveform[i] = Math.min(255, pulse + noise);
                }

                await sock.sendMessage(
                    m.chat,
                    {
                        audio: audioBuffer,
                        ptt: true,
                        waveform: Buffer.from(waveform),
                        mimetype: 'audio/ogg; codecs=opus',
                    },
                    { quoted: m }
                );

                // Cleanup
                await fs.promises.unlink(inputFilePath).catch(() => {});
                await fs.promises.unlink(outputFilePath).catch(() => {});
                await m.react('✅');
            } else {
                throw new Error('Output file not generated');
            }
        } catch (error) {
            console.error('ToVN Error:', error);
            await m.react('❌');
            await m.reply(`❌ Gagal mengonversi ke VN: ${error.message}`);
        }
    },
};
