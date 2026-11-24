import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import fs from 'fs';
import { StickerTypes, fitSticker } from '../../lib/stickerFormatter.js';
import { settings } from '../../config/settings.js';
import { makeResultPath } from '../../utils/resultPath.js';

const execFilePromise = promisify(execFile);

/**
 * Guesses the backdrop colour from the edges of the first frame (median of the
 * border pixels), since real green screens are rarely exactly 00ff00.
 */
export const detectKeyColor = async (videoPath) => {
    const size = 128;
    const { stdout } = await execFilePromise(
        'ffmpeg',
        [
            '-v',
            'error',
            '-i',
            videoPath,
            '-frames:v',
            '1',
            '-vf',
            `scale=${size}:${size}`,
            '-f',
            'rawvideo',
            '-pix_fmt',
            'rgb24',
            'pipe:1',
        ],
        { encoding: 'buffer', maxBuffer: size * size * 3 + 1024 }
    );
    const channels = [[], [], []];
    for (let i = 0; i < size; i++) {
        for (const [x, y] of [
            [i, 0],
            [i, 1],
            [i, size - 1],
            [i, size - 2],
            [0, i],
            [1, i],
            [size - 1, i],
            [size - 2, i],
        ]) {
            const o = (y * size + x) * 3;
            for (let c = 0; c < 3; c++) channels[c].push(stdout[o + c]);
        }
    }
    return channels
        .map((values) => values.sort((a, b) => a - b)[values.length >> 1])
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('');
};

export default {
    name: 'svt',
    aliases: ['stickervideotransparan', 'sgreen'],
    description: 'Buat stiker video transparan (Hapus background warna)',
    category: 'Sticker',
    execute: async (sock, m, args, text) => {
        const target = m.quoted ? m.quoted : m;

        if (!target.isVideo) {
            return m.reply(
                ' Balas video yang latarnya polos (misal Green Screen) untuk dijadikan stiker transparan.\n' +
                    'Warna latar dideteksi otomatis. Opsional: *.svt 0.3* (kemiripan, makin besar makin banyak yang dihapus) ' +
                    'atau *.svt 00ff00 0.3* (warna manual).'
            );
        }

        // Color is optional: `.svt`, `.svt 0.3`, `.svt 00ff00` or `.svt 00ff00 0.3`.
        const [first, second] = args;
        const manualColor = /^[0-9a-f]{6}$/i.test(first || '') ? first : null;
        if (first && !manualColor && !Number.isFinite(Number(first))) {
            return m.reply(' Warna harus berupa 6 digit hex, contoh: 00ff00.');
        }
        const similarity = Number((manualColor ? second : first) || '0.2');
        if (!Number.isFinite(similarity) || similarity < 0.01 || similarity > 1) {
            return m.reply(' Similarity harus berupa angka antara 0.01 dan 1.');
        }

        await m.react('⏳');

        const id = crypto.randomUUID();
        const inputPath = makeResultPath(`${id}.mp4`);

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

            // Lossy WebP with alpha at 15 fps, stepped down until it fits; the old
            // lossless full-fps export produced ~60MB files that took a minute and
            // could never be uploaded.
            const color = manualColor || (await detectKeyColor(inputPath));
            console.log(
                `[svt] key 0x${color}${manualColor ? '' : ' (auto)'} similarity ${similarity}`
            );
            const result = await fitSticker(buffer, {
                pack: settings.botName,
                author: m.pushName || 'KanataBot',
                type: StickerTypes.CROPPED,
                animated: true,
                maxSeconds: maxDuration,
                preFilter: `colorkey=0x${color}:${similarity}:0.1`,
            });
            await sock.sendMessage(m.chat, { sticker: result }, { quoted: m });
            await m.react('✅');
        } catch (err) {
            console.error('SVT Error:', err);
            await m.react('❌');
            const message =
                err.code === 'ENOENT'
                    ? ' FFmpeg atau ffprobe belum terinstall di server.'
                    : err.message === 'STICKER_TOO_BIG'
                      ? ' Hasilnya terlalu besar buat stiker. Coba video yang lebih pendek.'
                      : ` Terjadi kesalahan: ${err.message}`;
            await m.reply(message);
        } finally {
            await fs.promises.unlink(inputPath).catch(() => {});
        }
    },
};
