import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { Sticker, StickerTypes } from '../../lib/stickerFormatter.js';

// rembg runs in its own virtualenv outside the repo (python3 -m venv
// /root/rembg/venv && /root/rembg/venv/bin/pip install "rembg[cpu]"); the model
// (~170MB) downloads to ~/.rembg on first use.
const PYTHON = '/root/rembg/venv/bin/python';
const MODEL = 'u2net';
const THREADS = '4'; // leaves CPU for the bot's other work
const SCRIPT = fileURLToPath(new URL('../../../scripts/rembg_remove.py', import.meta.url));
const TIMEOUT_MS = 60_000;
const MAX_SIDE = 1536;
const MAX_WAITING = 5;

/**
 * One job at a time (a run takes ~1s of CPU and ~1GB RAM); callers beyond
 * `maxWaiting` are turned away instead of piling up.
 */
export const createQueue = (maxWaiting = MAX_WAITING) => {
    let tail = Promise.resolve();
    let pending = 0;
    return {
        get pending() {
            return pending;
        },
        run(job) {
            if (pending > maxWaiting) return Promise.reject(new Error('QUEUE_FULL'));
            pending += 1;
            const result = tail.then(job);
            tail = result
                .catch(() => {})
                .finally(() => {
                    pending -= 1;
                });
            return result;
        },
    };
};

const queue = createQueue();

export const runRembg = (input, { python = PYTHON, script = SCRIPT } = {}) =>
    new Promise((resolve, reject) => {
        const child = spawn(python, [script, MODEL, THREADS], { stdio: ['pipe', 'pipe', 'pipe'] });
        const out = [];
        const err = [];
        const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT_MS);
        child.stdout.on('data', (c) => out.push(c));
        child.stderr.on('data', (c) => err.push(c));
        child.on('error', (e) => {
            clearTimeout(timer);
            reject(e.code === 'ENOENT' ? new Error('REMBG_MISSING') : e);
        });
        child.on('close', (code, signal) => {
            clearTimeout(timer);
            if (code === 0) return resolve(Buffer.concat(out));
            const detail = Buffer.concat(err).toString().trim().split('\n').pop();
            reject(
                new Error(signal ? `rembg timed out (${signal})` : `rembg exit ${code}: ${detail}`)
            );
        });
        child.stdin.on('error', () => {}); // child died early; 'close' reports why
        child.stdin.end(input);
    });

/**
 * Removes the background; by default also trims the transparent border (keep
 * the frame with `trim: false`, e.g. for pas-foto colours). Null when (almost)
 * nothing was kept. Note u2net always keeps *something* on featureless images.
 */
export const removeBackground = async (
    image,
    { trim = true, runner = runRembg, jobs = queue } = {}
) => {
    const input = await sharp(image)
        .rotate()
        .resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
    const png = await jobs.run(() => runner(input));
    const { channels, data } = await sharp(png)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
        .then(({ data: d, info }) => ({ channels: info.channels, data: d }));
    let kept = 0;
    for (let i = channels - 1; i < data.length; i += channels) if (data[i] > 128) kept += 1;
    if (kept < (data.length / channels) * 0.005) return null;
    return trim ? sharp(png).trim().png().toBuffer() : png;
};

// Pas-foto style backdrops; any #rrggbb works too.
export const COLORS = {
    merah: '#d50000',
    red: '#d50000',
    biru: '#1565c0',
    blue: '#1565c0',
    kuning: '#ffd600',
    yellow: '#ffd600',
    hijau: '#2e7d32',
    green: '#2e7d32',
    putih: '#ffffff',
    white: '#ffffff',
    hitam: '#000000',
    black: '#000000',
    abu: '#9e9e9e',
    gray: '#9e9e9e',
};

/**
 * Default: transparent PNG file. A colour (name or #hex) -> photo on that
 * colour. `s` -> sticker.
 */
export const parseOptions = (args = []) => {
    for (const arg of args) {
        const word = arg.toLowerCase();
        if (COLORS[word]) return { output: 'color', color: COLORS[word] };
        if (/^#?[0-9a-f]{6}$/.test(word))
            return { output: 'color', color: `#${word.replace('#', '')}` };
    }
    if (args.some((a) => /^(s|stiker|sticker)$/i.test(a))) return { output: 'sticker' };
    return { output: 'png' };
};

export default {
    name: 'removebg',
    aliases: ['nobg', 'rembg', 'hapusbg'],
    description: 'Hapus background foto/stiker (AI lokal). Opsi: warna (merah/biru/..), s (stiker)',
    category: 'Sticker',
    execute: async (sock, m, args = []) => {
        const target = m.quoted?.isImage || m.quoted?.isSticker ? m.quoted : m;
        if (!target.isImage && !target.isSticker) {
            return m.reply(
                'Kirim/balas *foto* atau *stiker* dengan caption .rembg\n' +
                    '• *.rembg* → file PNG transparan\n' +
                    '• *.rembg merah* / *biru* / *kuning* / *hijau* / *putih* / *hitam* / *#ff8800* → foto dengan latar warna (cocok buat pas foto)\n' +
                    '• *.rembg s* → jadikan stiker'
            );
        }
        if (target.isSticker && (target.msg || target).isAnimated) {
            return m.reply('Stiker animasi belum didukung, pakai stiker biasa atau foto.');
        }

        const { output, color } = parseOptions(args);
        try {
            await m.react('⏳');
            const result = await removeBackground(await target.download(), {
                trim: output !== 'color',
            });
            if (!result) {
                await m.react('❌');
                return m.reply('Nggak ada objek yang terdeteksi di gambar itu.');
            }
            if (output === 'png') {
                await sock.sendMessage(
                    m.chat,
                    { document: result, mimetype: 'image/png', fileName: 'removebg.png' },
                    { quoted: m }
                );
            } else if (output === 'color') {
                const photo = await sharp(result)
                    .flatten({ background: color })
                    .jpeg({ quality: 92 })
                    .toBuffer();
                await sock.sendMessage(
                    m.chat,
                    { image: photo, mimetype: 'image/jpeg' },
                    { quoted: m }
                );
            } else {
                const sticker = await new Sticker(result, {
                    pack: 'MyBot Pack',
                    author: m.pushName || 'MyBot',
                    type: StickerTypes.FULL,
                    quality: 80,
                }).toBuffer();
                await sock.sendMessage(m.chat, { sticker }, { quoted: m });
            }
            await m.react('✅');
        } catch (err) {
            console.error('[removebg] failed:', err);
            await m.react('❌');
            const messages = {
                QUEUE_FULL: 'Lagi banyak yang antre, coba lagi sebentar ya.',
                REMBG_MISSING: 'Fitur hapus background belum terpasang di server.',
            };
            await m.reply(
                messages[err.message] || `Gagal menghapus background.\n${err.message || ''}`
            );
        }
    },
};
