import { readdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    buildAudioArgs,
    buildVideoArgs,
    downloadYouTubeAudio,
    downloadYouTubeVideo,
    isYouTubeUrl,
    MAX_ATTEMPTS_ON_403,
    pickHeight,
    videoFormat,
} from '../src/lib/ytdlp.js';

const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fake-ytdlp.mjs');
const URL = 'https://youtu.be/jNQXAC9IVRw';

/** Run the real downloader against the fake yt-dlp in `scenario`. */
const fakeDownload = (scenario, opts = {}) =>
    downloadYouTubeVideo(URL, { bin: process.execPath, extraArgs: [FAKE, scenario], ...opts });

const leftoverTempDirs = () =>
    readdirSync(os.tmpdir()).filter((d) => d.startsWith('kanata-ytdlp-'));

describe('isYouTubeUrl', () => {
    test.each([
        'https://youtu.be/jNQXAC9IVRw',
        'https://www.youtube.com/watch?v=jNQXAC9IVRw',
        'https://m.youtube.com/watch?feature=share&v=jNQXAC9IVRw',
        'https://youtube.com/shorts/jNQXAC9IVRw?si=abc',
        'https://music.youtube.com/watch?v=jNQXAC9IVRw',
    ])('accepts %s', (url) => expect(isYouTubeUrl(url)).toBe(true));

    test.each([
        '--exec=id',
        'https://youtu.be.evil.com/jNQXAC9IVRw',
        'https://vimeo.com/123456',
        'file:///etc/passwd',
        'https://youtube.com/@channel',
        '',
    ])('rejects %s', (url) => expect(isYouTubeUrl(url)).toBe(false));
});

test('pickHeight snaps to a supported height, default 360', () => {
    expect(pickHeight(undefined)).toBe(360);
    expect(pickHeight('720')).toBe(720);
    expect(pickHeight('700')).toBe(480);
    expect(pickHeight('4000')).toBe(1080);
    expect(pickHeight('10')).toBe(144);
});

test('arguments: H.264 first, URL after "--", limits applied', () => {
    const args = buildVideoArgs({ url: URL, height: 720, outDir: '/tmp/x' });
    expect(args.slice(-2)).toEqual(['--', URL]);
    expect(args[args.indexOf('-f') + 1]).toBe(videoFormat(720));
    expect(videoFormat(720).split('/')[0]).toBe('bv*[vcodec^=avc1][height<=720]+ba[ext=m4a]');
    expect(args).toEqual(expect.arrayContaining(['--no-playlist', '--max-filesize', '100M']));
    expect(args[args.indexOf('--match-filter') + 1]).toBe('duration<=3600');
    expect(args[args.indexOf('-o') + 1]).toBe('/tmp/x/%(id)s.%(ext)s');
});

test('audio arguments: extract to MP3, URL after "--", same limits', () => {
    const args = buildAudioArgs({ url: URL, outDir: '/tmp/x' });
    expect(args.slice(-2)).toEqual(['--', URL]);
    expect(args).toEqual(expect.arrayContaining(['-x', '--audio-format', 'mp3', '--no-playlist']));
    expect(args[args.indexOf('--match-filter') + 1]).toBe('duration<=3600');
});

describe('downloadYouTubeAudio', () => {
    test('returns the file and its title', async () => {
        const audio = await downloadYouTubeAudio(URL, {
            bin: process.execPath,
            extraArgs: [FAKE, 'ok'],
        });
        expect(audio.buffer.toString()).toBe('VIDEO');
        expect(audio.title).toBe('Me at the zoo');
    });

    test('refuses non-YouTube input', async () => {
        await expect(
            downloadYouTubeAudio('-o/etc/x', { bin: '/nonexistent/should-not-run' })
        ).rejects.toThrow('Link YouTube tidak valid');
    });
});

describe('downloadYouTubeVideo', () => {
    test('returns the file and its info, and cleans up', async () => {
        const before = leftoverTempDirs().length;
        const video = await fakeDownload('ok');
        expect(video.buffer.toString()).toBe('VIDEO');
        expect(video).toMatchObject({ title: 'Me at the zoo', height: 360, duration: 19 });
        expect(leftoverTempDirs()).toHaveLength(before);
    });

    test('refuses non-YouTube input before running anything', async () => {
        await expect(
            downloadYouTubeVideo('--exec=id', { bin: '/nonexistent/should-not-run' })
        ).rejects.toThrow('Link YouTube tidak valid');
    });

    describe('HTTP 403 from YouTube', () => {
        let runsFile;
        beforeEach(() => {
            runsFile = path.join(os.tmpdir(), `fake-ytdlp-runs-${process.pid}-${Date.now()}`);
        });
        afterEach(() => rmSync(runsFile, { force: true }));
        const runs = () => readFileSync(runsFile, 'utf8').length;

        test('a one-off 403 is retried and the download succeeds', async () => {
            const video = await fakeDownload(`403-once=${runsFile}`);
            expect(video.title).toBe('retried');
            expect(runs()).toBe(2);
        });

        test('a lasting 403 gives up after 3 runs with the error', async () => {
            await expect(fakeDownload(`403-always=${runsFile}`)).rejects.toThrow(/HTTP Error 403/);
            expect(runs()).toBe(MAX_ATTEMPTS_ON_403);
        });

        test('other errors are not retried', async () => {
            await expect(fakeDownload('error')).rejects.toThrow('Video unavailable');
        });
    });

    test("surfaces yt-dlp's own error message", async () => {
        await expect(fakeDownload('error')).rejects.toThrow(/^Video unavailable$/);
    });

    test('explains a video skipped for length or size', async () => {
        await expect(fakeDownload('filtered')).rejects.toThrow(/terlalu panjang.*terlalu besar/);
    });

    test('never reads a file outside its temp folder', async () => {
        await expect(fakeDownload('escape')).rejects.toThrow(/di luar folder/);
    });

    test('kills a hung yt-dlp', async () => {
        const before = leftoverTempDirs().length;
        await expect(
            fakeDownload('hang', {
                limits: { maxFilesize: '100M', maxDurationSec: 3600, timeoutMs: 200 },
            })
        ).rejects.toThrow(/timeout/);
        expect(leftoverTempDirs()).toHaveLength(before);
    });

    test('reports a missing binary clearly', async () => {
        await expect(
            downloadYouTubeVideo(URL, { bin: '/nonexistent/yt-dlp', extraArgs: [] })
        ).rejects.toThrow(/tidak bisa dijalankan/);
    });
});
