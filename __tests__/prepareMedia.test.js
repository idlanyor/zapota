import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { prepareImageMedia } from '../src/wa/prepareMedia.js';

test('on zapo, uploads the plain image and keeps zapo’s mediaKey', async () => {
    const png = await sharp({
        create: { width: 320, height: 180, channels: 3, background: '#c00' },
    }).png().toBuffer();
    const mediaKey = new Uint8Array(32).fill(7);
    const calls = [];
    const sock = {
        __zapo: {
            message: {
                upload: async (bytes, opts) => {
                    calls.push({ bytes, opts });
                    return {
                        url: 'https://mmg/x', directPath: '/x', mediaKey,
                        fileSha256: new Uint8Array(32), fileEncSha256: new Uint8Array(32),
                        fileLength: bytes.length, mediaKeyTimestamp: 1,
                    };
                },
            },
        },
    };

    const { imageMessage } = await prepareImageMedia(sock, png, { mediaType: 'thumbnail-link' });

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].opts, { type: 'thumbnail-link', mimetype: 'image/jpeg' });
    assert.equal((await sharp(calls[0].bytes).metadata()).format, 'jpeg'); // plaintext, not ciphertext
    assert.equal(imageMessage.mediaKey, mediaKey);
    assert.equal(imageMessage.directPath, '/x');
    assert.equal(imageMessage.width, 320);
    assert.equal(imageMessage.height, 180);
    assert.equal((await sharp(imageMessage.jpegThumbnail).metadata()).width, 32);
});
