import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import fs from 'fs';
import { Sticker, StickerTypes } from '../../lib/stickerFormatter.js';
import { settings } from '../../config/settings.js';
import { makeResultPath } from '../../utils/resultPath.js';

const execFilePromise = promisify(execFile);

export default {
    name: 'svt',
    aliases: ['stickervideotransparan', 'sgreen'],
    description: 'Buat stiker video transparan (Hapus background warna)',
    category: 'Sticker',
    execute: async (sock, m, args, text) => {
        const target = m.quoted ? m.quoted : m;

        if (!target.isVideo) {
            return m.reply(
                ' Balas video yang latarnya polos (misal Green Screen) untuk dijadikan stiker transparan.'
            );
        }

        const color = args[0] || '00ff00';
        const similarity = Number(args[1] || '0.1');
        if (!/^[0-9a-f]{6}$/i.test(color)) {
            return m.reply(' Warna harus berupa 6 digit hex, contoh: 00ff00.');
        }
        if (!Number.isFinite(similarity) || similarity < 0.01 || similarity > 1) {
            return m.reply(' Similarity harus berupa angka antara 0.01 dan 1.');
        }

        await m.react('⏳');

        const id = crypto.randomUUID();
        const inputPath = makeResultPath(`${id}.mp4`);
        const outputPath = makeResultPath(`${id}.webp`);

        try {
            const buffer = await target.download();
            await fs.promises.writeFile(inputPath, buffer);

            const { stdout } = await execFilePromise('ffprobe', [
                '-v',
                'error',
                '-show_entries',
                'format=duration',
                '-of',
                'default=noprint_wrappers=1:nokey=1',
                inputPath,
            ]);

            const duration = Number.parseFloat(stdout.trim());
            const maxDuration = 10;
            if (!Number.isFinite(duration)) throw new Error('Durasi video tidak valid.');
            if (duration > maxDuration) {
                await m.react('❌');
                return m.reply(
                    ` Durasi video terlalu panjang! Maksimal *${maxDuration} detik*. (Video kamu: ${duration.toFixed(1)} detik)`
                );
            }

            await execFilePromise('ffmpeg', [
                '-i',
                inputPath,
                '-vf',
                `colorkey=0x${color}:${similarity}:0.1,scale=512:512:force_original_aspect_ratio=increase,crop=512:512`,
                '-c:v',
                'libwebp',
                '-lossless',
                '1',
                '-loop',
                '0',
                '-an',
                '-vsync',
                '0',
                '-y',
                outputPath,
            ]);

            const webpBuffer = await fs.promises.readFile(outputPath);
            const sticker = new Sticker(webpBuffer, {
                pack: settings.botName,
                author: m.pushName || 'KanataBot',
                type: StickerTypes.FULL,
                quality: 50,
            });

            const result = await sticker.toBuffer();
            await sock.sendMessage(m.chat, { sticker: result }, { quoted: m });
            await m.react('✅');
        } catch (err) {
            console.error('SVT Error:', err);
            await m.react('❌');
            const message =
                err.code === 'ENOENT'
                    ? ' FFmpeg atau ffprobe belum terinstall di server.'
                    : ` Terjadi kesalahan: ${err.message}`;
            await m.reply(message);
        } finally {
            await Promise.allSettled([
                fs.promises.unlink(inputPath),
                fs.promises.unlink(outputPath),
            ]);
        }
    },
};
