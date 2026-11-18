/**
 * YouTube downloads through the local yt-dlp binary (+ ffmpeg for merging).
 *
 * yt-dlp runs without a shell, with `--` before the URL, and only for
 * YouTube URLs: user input can never become a yt-dlp option or a shell
 * command.
 */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { settings } from '../config/settings.js';

const YOUTUBE_URL =
    /^https?:\/\/(?:(?:www|m|music)\.)?(?:youtube\.com\/(?:watch\?\S*v=|shorts\/|live\/|embed\/)|youtu\.be\/)[\w-]{6,}\S*$/i;

export const isYouTubeUrl = (url) => YOUTUBE_URL.test(String(url ?? '').trim());

/** Heights users may ask for; anything else snaps to the nearest one below. */
export const VIDEO_HEIGHTS = Object.freeze([144, 240, 360, 480, 720, 1080]);
export const DEFAULT_HEIGHT = 360;

export const pickHeight = (requested) => {
    const n = Number.parseInt(requested, 10);
    if (!Number.isFinite(n)) return DEFAULT_HEIGHT;
    return [...VIDEO_HEIGHTS].reverse().find((h) => h <= n) ?? VIDEO_HEIGHTS[0];
};

/**
 * Prefer H.264 + AAC (plays on every WhatsApp client without re-encoding),
 * then any MP4, then whatever exists at or below the height.
 */
export const videoFormat = (height) =>
    [
        `bv*[vcodec^=avc1][height<=${height}]+ba[ext=m4a]`,
        `b[ext=mp4][height<=${height}]`,
        `bv*[height<=${height}]+ba`,
        `b[height<=${height}]`,
    ].join('/');

/** Runs of yt-dlp for one request when YouTube answers 403 (same as clipper-server). */
export const MAX_ATTEMPTS_ON_403 = 3;

export const LIMITS = Object.freeze({
    maxFilesize: '100M',
    maxDurationSec: 60 * 60,
    timeoutMs: 5 * 60_000,
});

/** Arguments shared by every download: limits, output, result line, URL last. */
const commonArgs = ({ url, outDir, limits }) => [
    '--max-filesize',
    limits.maxFilesize,
    '--match-filter',
    `duration<=${limits.maxDurationSec}`,
    '-o',
    path.join(outDir, '%(id)s.%(ext)s'),
    '--print',
    'after_move:%(.{title,height,duration,filepath})j',
    '--',
    url,
];

const BASE_ARGS = ['--no-playlist', '--no-warnings', '--no-progress', '--no-part', '--no-mtime'];

/** yt-dlp arguments for one video download into `outDir`. */
export const buildVideoArgs = ({ url, height, outDir, limits = LIMITS }) => [
    ...BASE_ARGS,
    '-f',
    videoFormat(height),
    '--merge-output-format',
    'mp4',
    ...commonArgs({ url, outDir, limits }),
];

/** yt-dlp arguments for one audio download, converted to MP3 by ffmpeg. */
export const buildAudioArgs = ({ url, outDir, limits = LIMITS }) => [
    ...BASE_ARGS,
    '-f',
    'ba[ext=m4a]/ba/b',
    '-x',
    '--audio-format',
    'mp3',
    '--audio-quality',
    '128K',
    ...commonArgs({ url, outDir, limits }),
];

/** Last `ERROR:` line yt-dlp printed, without the prefix. */
const ytdlpError = (stderr) => {
    const line = stderr
        .split('\n')
        .reverse()
        .find((l) => l.startsWith('ERROR:'));
    // "ERROR: [youtube] <videoId>: Video unavailable" → "Video unavailable"
    return line ? line.replace(/^ERROR:\s*(?:\[[^\]]+\]\s*)?(?:[\w-]{6,}:\s+)?/, '') : null;
};

const run = (bin, args, timeoutMs) =>
    new Promise((resolve, reject) => {
        const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        const cap = (s, chunk) => (s.length > 64_000 ? s : s + chunk);
        child.stdout.on('data', (c) => (stdout = cap(stdout, c)));
        child.stderr.on('data', (c) => (stderr = cap(stderr, c)));
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error('Download terlalu lama (timeout).'));
        }, timeoutMs);
        child.on('error', (err) => {
            clearTimeout(timer);
            reject(new Error(`yt-dlp tidak bisa dijalankan: ${err.message}`));
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            resolve({ code, stdout, stderr });
        });
    });

/**
 * Run yt-dlp with `buildArgs(outDir)` in a fresh temp folder and return the
 * one file it produced. The folder is always removed afterwards.
 */
const download = async (url, opts, buildArgs, tooLargeHint) => {
    const cleanUrl = String(url ?? '').trim();
    if (!isYouTubeUrl(cleanUrl)) throw new Error('Link YouTube tidak valid.');

    const { bin = settings.ytdlpBin, extraArgs = settings.ytdlpArgs, limits = LIMITS } = opts;
    const outDir = await mkdtemp(path.join(os.tmpdir(), 'kanata-ytdlp-'));
    try {
        const args = [...extraArgs, ...buildArgs({ url: cleanUrl, outDir, limits })];
        let result;
        for (let attempt = 1; ; attempt++) {
            result = await run(bin, args, limits.timeoutMs);
            if (result.code === 0) break;
            const message = ytdlpError(result.stderr) || `yt-dlp gagal (kode ${result.code}).`;
            // YouTube now and then answers one download with 403 that a fresh run does not get.
            if (attempt >= MAX_ATTEMPTS_ON_403 || !/HTTP Error 403/i.test(message)) {
                throw new Error(message);
            }
            await rm(outDir, { recursive: true, force: true });
            await mkdir(outDir, { recursive: true });
        }
        const { stdout } = result;

        const line = stdout.trim().split('\n').filter(Boolean).at(-1);
        if (!line) {
            // yt-dlp exits 0 but skips videos rejected by --match-filter / --max-filesize.
            throw new Error(
                `Video terlalu panjang (maks ${limits.maxDurationSec / 60} menit) ` +
                    `atau terlalu besar (maks ${limits.maxFilesize}B).${tooLargeHint}`
            );
        }
        const info = JSON.parse(line);
        const filePath = path.resolve(info.filepath);
        if (path.dirname(filePath) !== path.resolve(outDir)) {
            throw new Error('yt-dlp menulis file di luar folder sementara.');
        }
        await stat(filePath);
        return {
            buffer: await readFile(filePath),
            title: info.title || 'YouTube',
            height: info.height ?? null,
            duration: info.duration ?? null,
        };
    } finally {
        await rm(outDir, { recursive: true, force: true });
    }
};

/**
 * Download one YouTube video as an MP4 buffer.
 *
 * @param {string} url
 * @param {{ height?: number, bin?: string, extraArgs?: string[], limits?: typeof LIMITS }} [opts]
 * @returns {Promise<{ buffer: Buffer, title: string, height: number | null, duration: number | null }>}
 */
export const downloadYouTubeVideo = (url, opts = {}) =>
    download(
        url,
        opts,
        (base) => buildVideoArgs({ ...base, height: opts.height ?? DEFAULT_HEIGHT }),
        ' Coba resolusi lebih kecil.'
    );

/**
 * Download one YouTube video's audio as an MP3 buffer.
 *
 * @param {string} url
 * @param {{ bin?: string, extraArgs?: string[], limits?: typeof LIMITS }} [opts]
 * @returns {Promise<{ buffer: Buffer, title: string, duration: number | null }>}
 */
export const downloadYouTubeAudio = (url, opts = {}) => download(url, opts, buildAudioArgs, '');
