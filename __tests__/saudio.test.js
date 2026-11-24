import assert from 'node:assert/strict';
import test from 'node:test';
import { proto } from 'zapo-js';
import { waveformFromPcm, webpDurationMs } from '../src/commands/sticker/saudio.js';
import { buildAudioStickerMessage, lengthDelimited } from '../src/lib/audioSticker.js';

const M = proto.Message;

// Walk one length-delimited field off a protobuf buffer.
const readField = (buf) => {
    const r = {};
    let pos = 0;
    const varint = () => {
        let shift = 0;
        let n = 0;
        let b;
        do {
            b = buf[pos++];
            n |= (b & 127) << shift;
            shift += 7;
        } while (b & 128);
        return n >>> 0;
    };
    r.tag = varint();
    const len = varint();
    r.bytes = buf.subarray(pos, pos + len);
    return r;
};

test('lengthDelimited encodes multi-byte tags and lengths', () => {
    const out = lengthDelimited(1074, Buffer.alloc(200, 1));
    assert.deepEqual([...out.subarray(0, 4)], [0xb2, 0x08, 0xc8, 0x01]);
    assert.equal(out.length, 204);
});

test('audio sticker survives a zapo Message encode/decode round trip', () => {
    const msg = buildAudioStickerMessage(
        { url: 's', mimetype: 'image/webp', width: 512, height: 512, isAnimated: false },
        { url: 'a', mimetype: 'audio/ogg; codecs=opus', ptt: true, seconds: 3 }
    );
    const decoded = M.decode(M.encode(msg).finish());
    assert.equal(decoded.messageContextInfo.messageSecret.length, 32);
    assert.equal(decoded.$unknowns.length, 1);

    const outer = readField(decoded.$unknowns[0]);
    assert.equal(outer.tag, 1074);
    const sticker = M.FutureProofMessage.decode(outer.bytes).message.stickerMessage;
    assert.equal(sticker.url, 's');
    assert.equal(sticker.width, 512);

    const inner = readField(sticker.$unknowns[0]);
    assert.equal(inner.tag, 210);
    const audio = M.AudioMessage.decode(inner.bytes);
    assert.equal(audio.ptt, true);
    assert.equal(audio.seconds, 3);
});

test('waveformFromPcm normalises to 0-100 and falls back on short input', () => {
    const pcm = Buffer.alloc(64 * 4 * 2);
    for (let i = 0; i < 64 * 4; i++) pcm.writeInt16LE(i < 128 ? 1000 : 4000, i * 2);
    const wave = waveformFromPcm(pcm);
    assert.equal(wave.length, 64);
    assert.equal(Math.max(...wave), 100);
    assert.equal(wave[0], 25);
    assert.deepEqual([...waveformFromPcm(Buffer.alloc(4))], Array(64).fill(10));
});

test('fitSticker steps quality down until the sticker fits, then gives up', async () => {
    const { default: sharp } = await import('sharp');
    const { fitSticker, StickerTypes } = await import('../src/lib/stickerFormatter.js');
    const noise = await sharp(
        Buffer.from(Array.from({ length: 512 * 512 * 3 }, () => Math.random() * 255)),
        {
            raw: { width: 512, height: 512, channels: 3 },
        }
    )
        .png()
        .toBuffer();
    const out = await fitSticker(noise, { type: StickerTypes.CROPPED }, [{ quality: 5 }]);
    assert.ok(out.length <= 1024 * 1024);
    // no attempt small enough -> friendly error instead of a 413 at upload time
    await assert.rejects(fitSticker(noise, {}, []), /STICKER_TOO_BIG/);
});

test('webpDurationMs sums ANMF frame durations', () => {
    const frame = (ms) => {
        const b = Buffer.alloc(8 + 16);
        b.write('ANMF', 0, 'ascii');
        b.writeUInt32LE(16, 4);
        b.writeUIntLE(ms, 8 + 12, 3);
        return b;
    };
    const webp = Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBP', 'latin1'), frame(66), frame(67)]);
    assert.equal(webpDurationMs(webp), 133);
    assert.equal(webpDurationMs(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1')), 0);
});
