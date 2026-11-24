import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { StickerTypes, fitSticker } from '../../lib/stickerFormatter.js';
import { buildAudioStickerMessage } from '../../lib/audioSticker.js';

const execFileAsync = promisify(execFile);
const MAX_SECONDS = 30;
// Try the animation as long as the sound first, degrading quality/fps; if it
// still won't fit, shorten it (WhatsApp loops it while the sound plays).
const FIT_ATTEMPTS = [
    { quality: 50, fps: 15 },
    { quality: 30, fps: 10 },
    { quality: 20, fps: 8 },
    { quality: 10, fps: 6 },
    { quality: 20, fps: 10, maxSeconds: 10 },
    { quality: 10, fps: 8, maxSeconds: 6 },
];

export const isAnimatedWebp = (buffer) => {
    if (buffer.length < 12 || buffer.toString('ascii', 8, 12) !== 'WEBP') return false;
    let offset = 12;
    while (offset < buffer.length - 8) {
        const chunk = buffer.toString('ascii', offset, offset + 4);
        const size = buffer.readUInt32LE(offset + 4);
        if (chunk === 'VP8X' && buffer[offset + 8] & 0x02) return true;
        if (chunk === 'ANIM' || chunk === 'ANMF') return true;
        offset += 8 + size + (size % 2);
    }
    return false;
};

/** Total animation length of an animated WebP in ms (0 for a still image). */
export const webpDurationMs = (buffer) => {
    let offset = 12;
    let total = 0;
    while (offset < buffer.length - 8) {
        const chunk = buffer.toString('ascii', offset, offset + 4);
        const size = buffer.readUInt32LE(offset + 4);
        if (chunk === 'ANMF' && size >= 16) total += buffer.readUIntLE(offset + 8 + 12, 3);
        offset += 8 + size + (size % 2);
    }
    return total;
};

const ffmpeg = (args, opts) => execFileAsync('ffmpeg', ['-v', 'error', ...args], opts);

export const waveformFromPcm = (pcm, bars = 64) => {
    const samples = Math.floor(pcm.length / 2);
    if (samples < bars) return Buffer.alloc(bars, 10);
    const block = Math.floor(samples / bars);
    const raw = [];
    for (let i = 0; i < bars; i++) {
        let sum = 0;
        for (let j = 0; j < block; j++) sum += Math.abs(pcm.readInt16LE((i * block + j) * 2));
        raw.push(sum / block);
    }
    const max = Math.max(...raw);
    const scale = max > 0 ? 100 / max : 1;
    return Buffer.from(raw.map((v) => Math.min(100, Math.floor(v * scale))));
};

const toOggOpus = async (buffer, maxSeconds = MAX_SECONDS) => {
    const base = path.join(os.tmpdir(), `saudio-${randomUUID()}`);
    const input = `${base}.bin`;
    const output = `${base}.ogg`;
    try {
        await writeFile(input, buffer);
        try {
            // Keep these flags: without -vbr/-frame_duration/-avoid_negative_ts phones
            // showed the audio sticker but refused to play its sound.
            await ffmpeg([
                '-y',
                '-i',
                input,
                '-vn',
                '-t',
                String(maxSeconds),
                '-ar',
                '16000',
                '-ac',
                '1',
                '-c:a',
                'libopus',
                '-b:a',
                '32k',
                '-vbr',
                'on',
                '-compression_level',
                '10',
                '-frame_duration',
                '20',
                '-application',
                'voip',
                '-avoid_negative_ts',
                'make_zero',
                '-map_metadata',
                '-1',
                '-f',
                'ogg',
                output,
            ]);
        } catch (err) {
            if (/does not contain any stream|matches no streams/i.test(err.stderr || err.message)) {
                throw new Error('NO_AUDIO_STREAM');
            }
            throw err;
        }
        const [ogg, probe, pcm] = await Promise.all([
            readFile(output),
            execFileAsync('ffprobe', [
                '-v',
                'error',
                '-show_entries',
                'format=duration',
                '-of',
                'default=noprint_wrappers=1:nokey=1',
                output,
            ]).catch(() => ({ stdout: '' })),
            ffmpeg(['-i', output, '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1'], {
                encoding: 'buffer',
                maxBuffer: 5 * 1024 * 1024,
            })
                .then((r) => r.stdout)
                .catch(() => Buffer.alloc(0)),
        ]);
        const duration = Math.ceil(parseFloat(String(probe.stdout).trim()));
        return {
            buffer: ogg,
            seconds: duration > 0 ? Math.min(duration, Math.ceil(maxSeconds)) : 5,
            waveform: waveformFromPcm(pcm),
        };
    } finally {
        await rm(input, { force: true });
        await rm(output, { force: true });
    }
};

const mimeOf = (msg) => (msg?.msg || msg)?.mimetype || '';
const isVisual = (mime) => /image|video|webp/.test(mime);
const isAudio = (mime) => /audio/.test(mime);

const pickSources = (m) => {
    const q = m.quoted;
    const mm = mimeOf(m);
    const qm = mimeOf(q);
    if (isVisual(mm) && isAudio(qm)) return { visual: m, audio: q };
    if (isAudio(mm) && isVisual(qm)) return { visual: q, audio: m };
    if (/video/.test(qm)) return { visual: q, audio: q };
    if (/video/.test(mm)) return { visual: m, audio: m };
    return null;
};

const upload = async (zapo, buffer, type, mimetype) => {
    const r = await zapo.message.upload(buffer, { type, mimetype });
    return {
        url: r.url,
        directPath: r.directPath,
        mediaKey: r.mediaKey,
        fileSha256: r.fileSha256,
        fileEncSha256: r.fileEncSha256,
        fileLength: r.fileLength,
        mediaKeyTimestamp: r.mediaKeyTimestamp,
        mimetype,
    };
};

export default {
    name: 'saudio',
    aliases: ['stickeraudio', 'stikeraudio'],
    description: 'Gabungkan stiker + suara jadi audio sticker',
    category: 'Sticker',
    execute: async (sock, m, args = []) => {
        const zapo = sock.__zapo;
        if (!zapo) return m.reply('Audio sticker hanya didukung di transport zapo.');

        const sources = pickSources(m);
        if (!sources) {
            return m.reply(
                `Cara pakai *${m.prefix || '.'}saudio*:\n` +
                    '1. Kirim/balas *video* bersuara\n' +
                    `   Durasi bisa diatur: *.saudio 5* (maks ${MAX_SECONDS} detik)\n` +
                    '2. Balas *audio/VN* sambil kirim *foto/video* dengan caption .saudio\n' +
                    '3. Balas *foto/stiker/video* sambil kirim *audio/VN* dengan caption .saudio'
            );
        }

        try {
            await m.react('⏳');
            const download = (msg) => (msg === m ? m.download() : msg.download());
            const visualBuffer = await download(sources.visual);
            const audioBuffer =
                sources.audio === sources.visual ? visualBuffer : await download(sources.audio);

            const isSourceAnimated =
                /video/.test(mimeOf(sources.visual)) || isAnimatedWebp(visualBuffer);
            const requested = Number.parseFloat(args[0]);
            const audioSeconds = requested > 0 ? Math.min(requested, MAX_SECONDS) : MAX_SECONDS;

            const stickerBuffer = await fitSticker(
                visualBuffer,
                {
                    pack: 'MyBot Pack',
                    author: m.pushName || 'MyBot',
                    type: StickerTypes.CROPPED, // square, centre crop
                    animated: isSourceAnimated,
                    maxSeconds: audioSeconds,
                },
                FIT_ATTEMPTS
            );
            const animSeconds = webpDurationMs(stickerBuffer) / 1000;
            const ogg = await toOggOpus(audioBuffer, audioSeconds);
            console.log(
                `[saudio] sticker ${(stickerBuffer.length / 1024).toFixed(0)}KB anim ${animSeconds}s, ` +
                    `audio ${(ogg.buffer.length / 1024).toFixed(0)}KB ${ogg.seconds}s (cap ${audioSeconds}s)`
            );

            const meta = await sharp(stickerBuffer)
                .metadata()
                .catch(() => ({}));
            const [stickerMedia, audioMedia] = await Promise.all([
                upload(zapo, stickerBuffer, 'sticker', 'image/webp'),
                // Same media type as Baileys' prepareWAMessageMedia({ audio, ptt: true }).
                upload(zapo, ogg.buffer, 'audio', 'audio/ogg; codecs=opus'),
            ]);

            const expiration = Number(m.msg?.contextInfo?.expiration) || 0;
            const stickerMessage = {
                ...stickerMedia,
                width: meta.width || 512,
                height: meta.pageHeight || meta.height || 512,
                isAnimated: isAnimatedWebp(stickerBuffer),
                isLottie: false,
                contextInfo: {
                    stanzaId: m.key.id,
                    participant: m.sender,
                    quotedMessage: m.message,
                    // Disappearing chats: zapo can't inject this into the raw audio
                    // sticker body, so copy the timer from the triggering message.
                    ...(expiration > 0 && { expiration }),
                },
            };
            const audioMessage = {
                ...audioMedia,
                ptt: true,
                seconds: ogg.seconds,
                waveform: ogg.waveform,
            };

            // zapo can't see inside $unknowns and defaults the stanza to type="media";
            // Baileys (where this format is known to render) sends it as "text".
            await sock.relayMessage(
                m.chat,
                buildAudioStickerMessage(stickerMessage, audioMessage),
                {
                    additionalAttributes: { type: 'text' },
                    disableEphemeralAutoInject: true,
                }
            );
            await m.react('✅');
        } catch (err) {
            console.error('[saudio] failed:', err);
            await m.react('❌');
            if (err.message === 'NO_AUDIO_STREAM') {
                return m.reply(
                    'Video itu nggak ada suaranya. Pakai video bersuara atau gabung dengan audio/VN.'
                );
            }
            if (err.message === 'STICKER_TOO_BIG') {
                return m.reply(
                    'Videonya terlalu ramai/besar buat jadi stiker. Coba potong jadi lebih pendek dulu.'
                );
            }
            await m.reply(`Gagal membuat audio sticker.\n${err.message || ''}`);
        }
    },
};
