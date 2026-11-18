import assert from 'node:assert/strict';
import test, { before, after, afterEach, mock } from 'node:test';
import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { Readable } from 'node:stream';
import axios from 'axios';
import sharp from 'sharp';
import { probeMedia, prepareMediaForWa, looksLikeMedia } from '../getMedia.js';
import get from '../../commands/tools/get.js';
import logger from '../../utils/logger.js';

const exec = promisify(execFile);
let fixtures;
const fixture = (name) => path.join(fixtures, name);
const ffmpeg = (args) => exec('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
const videoSource = ['-f', 'lavfi', '-i', 'testsrc2=size=96x64:rate=10'];
const audioSource = ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100'];

before(async () => {
    fixtures = await mkdtemp(path.join(os.tmpdir(), 'get-media-test-'));
    await ffmpeg([...videoSource, ...audioSource, '-t', '0.5', '-c:v', 'libvpx-vp9',
        '-c:a', 'libopus', fixture('incompatible.webm')]);
    await ffmpeg([...videoSource, ...audioSource, '-t', '0.5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', fixture('compatible.mp4')]);
    await ffmpeg(['-f', 'lavfi', '-i', 'testsrc=size=96x64:rate=10', '-t', '0.5',
        '-c:v', 'libx264rgb', fixture('h264-444.mp4')]);
    await ffmpeg([...audioSource, '-t', '0.5', '-c:a', 'flac', fixture('song.flac')]);
    await sharp({ create: { width: 32, height: 32, channels: 3, background: '#ff0000' } })
        .jpeg().toFile(fixture('cover.jpg'));
    await ffmpeg([...audioSource, '-i', fixture('cover.jpg'), '-t', '0.5', '-map', '0:a', '-map', '1:v',
        '-c:a', 'libmp3lame', '-c:v', 'copy', '-id3v2_version', '3',
        '-disposition:v', 'attached_pic', fixture('covered.mp3')]);
});
after(async () => { if (fixtures) await rm(fixtures, { recursive: true, force: true }); });
afterEach(() => mock.restoreAll());

test('converts VP9/Opus to H.264/AAC MP4 with faststart', async () => {
    const input = fixture('incompatible.webm');
    const result = await prepareMediaForWa(input, fixtures, await probeMedia(input));
    const probe = await probeMedia(result.path);
    assert.equal(probe.video.codec_name, 'h264');
    assert.equal(probe.video.pix_fmt, 'yuv420p');
    assert.equal(probe.audio.codec_name, 'aac');
    assert.equal(result.mime, 'video/mp4');
    const bytes = await readFile(result.path);
    assert.ok(bytes.indexOf('moov') < bytes.indexOf('mdat'));
    // Decode the entire prepared file, not just its headers.
    await exec('ffmpeg', ['-v', 'error', '-i', result.path, '-f', 'null', '-']);
});

test('remuxes compatible MP4 without changing encoded video packets', async () => {
    const input = fixture('compatible.mp4');
    const result = await prepareMediaForWa(input, fixtures, await probeMedia(input));
    const hashes = async (file) => (await exec('ffmpeg', ['-v', 'error', '-i', file,
        '-map', '0:v:0', '-c:v', 'copy', '-f', 'hash', '-hash', 'sha256', '-'])).stdout;
    assert.equal(await hashes(result.path), await hashes(input));
});

test('also converts H.264 with unsupported chroma format', async () => {
    const input = fixture('h264-444.mp4');
    assert.equal((await probeMedia(input)).video.pix_fmt, 'gbrp');
    const result = await prepareMediaForWa(input, fixtures, await probeMedia(input));
    assert.equal((await probeMedia(result.path)).video.pix_fmt, 'yuv420p');
});

test('converts FLAC to playable MP3 and keeps album-cover MP3 as audio', async () => {
    const input = fixture('song.flac');
    const result = await prepareMediaForWa(input, fixtures, await probeMedia(input));
    assert.equal(result.mime, 'audio/mpeg');
    assert.equal((await probeMedia(result.path)).audio.codec_name, 'mp3');
    const covered = fixture('covered.mp3');
    const probe = await probeMedia(covered);
    assert.equal(probe.video, undefined);
    assert.equal((await prepareMediaForWa(covered, fixtures, probe)).path, covered);
});

const message = () => ({ chat: 'test@g.us', reply: mock.fn(async () => {}), react: mock.fn(async () => {}) });
const mockDownload = (bytes, mime) => mock.method(axios, 'get', async () => ({
    status: 200, statusText: 'OK', headers: { 'content-type': mime }, data: Readable.from([bytes]),
}));

test('GET detects real video despite a wrong header and URL without an extension', async () => {
    mockDownload(await readFile(fixture('incompatible.webm')), 'application/octet-stream');
    const m = message();
    let sentPath;
    const sock = { sendMessage: async (chat, payload, options) => {
        assert.equal(chat, m.chat);
        assert.equal(options.quoted, m);
        assert.equal(payload.mimetype, 'video/mp4');
        assert.equal(payload.fileName, 'download.mp4');
        sentPath = payload.video.url;
        assert.equal((await probeMedia(sentPath)).video.codec_name, 'h264');
    } };
    await get.execute(sock, m, [], 'https://example.com/download');
    assert.ok(sentPath);
    await assert.rejects(access(sentPath), { code: 'ENOENT' });
    assert.equal(m.reply.mock.calls.length, 0);
});

test('GET sends audio with the correct MIME and filename despite a video header', async () => {
    mockDownload(await readFile(fixture('song.flac')), 'video/mp4');
    const m = message();
    let sent = false;
    await get.execute({ sendMessage: async (chat, payload) => {
        assert.equal(payload.mimetype, 'audio/mpeg');
        assert.equal(payload.fileName, 'song.mp3');
        assert.equal(payload.ptt, false);
        assert.equal((await probeMedia(payload.audio.url)).audio.codec_name, 'mp3');
        sent = true;
    } }, m, [], 'https://example.com/song.flac');
    assert.equal(sent, true);
});

test('GET falls back to the original document if inline sending fails', async () => {
    mock.method(logger, 'warn', () => {});
    const original = await readFile(fixture('compatible.mp4'));
    mockDownload(original, 'video/mp4');
    let documents = 0;
    await get.execute({ sendMessage: async (chat, payload) => {
        if (payload.video) throw new Error('Media upload rejected');
        assert.deepEqual(await readFile(payload.document.url), original);
        assert.match(payload.caption, /File asli/);
        documents++;
    } }, message(), [], 'https://example.com/video.mp4');
    assert.equal(documents, 1);
});

test('GET reports interrupted downloads without hanging or sending truncated media', async () => {
    mock.method(logger, 'error', () => {});
    mock.method(axios, 'get', async () => ({ headers: {}, data: Readable.from((async function* () {
        yield Buffer.from('partial');
        throw new Error('Download interrupted');
    })()) }));
    const m = message();
    const sock = { sendMessage: mock.fn(async () => {}) };
    await get.execute(sock, m, [], 'https://example.com/video');
    assert.equal(sock.sendMessage.mock.calls.length, 0);
    assert.match(m.reply.mock.calls[0].arguments[0], /Download interrupted/);
});

test('non-media JSON and images retain their original behavior', async () => {
    const m = message();
    const jsonMock = mockDownload(Buffer.from('{"ok":true}'), 'application/json');
    await get.execute({}, m, [], 'https://example.com/status');
    assert.match(m.reply.mock.calls[0].arguments[0], /"ok": true/);
    jsonMock.mock.restore();
    mockDownload(await readFile(fixture('cover.jpg')), 'image/jpeg');
    let sent = false;
    await get.execute({ sendMessage: async (chat, payload) => {
        assert.ok(payload.image.url);
        assert.equal((await sharp(payload.image.url).metadata()).format, 'jpeg');
        sent = true;
    } }, message(), [], 'https://example.com/image');
    assert.equal(sent, true);
    assert.equal(await looksLikeMedia(fixture('cover.jpg')), false);
});
