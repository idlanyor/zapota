import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import sharp from 'sharp';
import { parseMemeText, renderMeme } from '../src/lib/memeRenderer.js';

let sourceBuffer;

beforeEach(async () => {
    sourceBuffer = await sharp({
        create: { width: 512, height: 512, channels: 3, background: '#808080' },
    }).png().toBuffer();
});

test('places caption text without a separator only at the bottom', async () => {
    assert.deepEqual(parseMemeText('ngeteh'), { top: '', bottom: 'ngeteh' });
    const output = await renderMeme(sourceBuffer, parseMemeText('ngeteh'));
    const region = async (buffer, top) =>
        sharp(buffer).extract({ left: 0, top, width: 512, height: 100 }).removeAlpha().raw().toBuffer();
    assert.ok((await region(output, 0)).equals(await region(sourceBuffer, 0)));
    assert.ok(!(await region(output, 412)).equals(await region(sourceBuffer, 412)));
});

test('keeps subsequent dots and supports either empty side', () => {
    assert.deepEqual(parseMemeText('atas.bawah.lanjutan'), { top: 'atas', bottom: 'bawah.lanjutan' });
    assert.deepEqual(parseMemeText('.ngeteh'), { top: '', bottom: 'ngeteh' });
    assert.deepEqual(parseMemeText('ngeteh.'), { top: 'ngeteh', bottom: '' });
});

test('renders lowercase input as uppercase', async () => {
    const lowercase = await renderMeme(sourceBuffer, { top: 'santai', bottom: 'ngeteh' });
    const uppercase = await renderMeme(sourceBuffer, { top: 'SANTAI', bottom: 'NGETEH' });
    assert.ok(lowercase.equals(uppercase));
});

test('uses larger letters for short text than for a long word', async () => {
    const inkHeight = async (text) => {
        const output = await renderMeme(sourceBuffer, { bottom: text });
        const { data, info } = await sharp(output).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        let rows = 0;
        for (let y = 0; y < info.height; y++) {
            const row = data.subarray(y * info.width * info.channels, (y + 1) * info.width * info.channels);
            if (row.some((value) => value !== 128)) rows++;
        }
        return rows;
    };
    assert.ok((await inkHeight('HA')) > (await inkHeight('ABCDEFGHIJKLMNOPQRSTUVWXYZ')));
});
