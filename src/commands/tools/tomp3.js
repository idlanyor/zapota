import { promisify } from 'util';
import { exec } from 'child_process';
import fs from 'fs';
import { makeResultPath } from '../../utils/resultPath.js';

const execPromise = promisify(exec);

export default {
    name: 'tomp3',
    aliases: ['tomp3audio', 'extractaudio'],
    description: 'Convert Video/Audio to MP3',
    category: 'Tools',
    execute: async (sock, m, args) => {
        const quoted = m.quoted ? m.quoted : m;
        const mime = quoted.msg?.mimetype || '';
        const isVideo = quoted.mtype === 'videoMessage' || mime.includes('video');
        const isAudio = quoted.mtype === 'audioMessage' || mime.includes('audio');

        if (!isVideo && !isAudio) {
            return m.reply(' Reply video atau audio yang ingin dijadikan MP3.');
        }

        await m.react('⏳');

        try {
            const buffer = await quoted.download();
            if (!buffer) {
                await m.react('❌');
                return m.reply('❌ Gagal mengunduh media.');
            }

            const inputFileName =
                `input_${Date.now()}_${Math.floor(Math.random() * 1000)}` +
                (isVideo ? '.mp4' : '.ogg');
            const outputFileName = `output_${Date.now()}_${Math.floor(Math.random() * 1000)}.mp3`;
            const inputFilePath = makeResultPath(inputFileName);
            const outputFilePath = makeResultPath(outputFileName);

            await fs.promises.writeFile(inputFilePath, buffer);

            // Convert using FFmpeg
            // -vn: no video
            // -acodec libmp3lame: mp3 codec
            // -q:a 2: high quality VBR
            await execPromise(
                `ffmpeg -i "${inputFilePath}" -vn -acodec libmp3lame -q:a 2 "${outputFilePath}"`
            );

            if (fs.existsSync(outputFilePath)) {
                const audioBuffer = await fs.promises.readFile(outputFilePath);

                await sock.sendMessage(
                    m.chat,
                    {
                        audio: audioBuffer,
                        mimetype: 'audio/mpeg',
                        fileName: `${Date.now()}.mp3`,
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
            console.error('ToMP3 Error:', error);
            await m.react('❌');
            await m.reply(`❌ Gagal mengekstrak audio: ${error.message}`);
        }
    },
};
