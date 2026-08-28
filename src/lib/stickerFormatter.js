import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import axios from 'axios';
import ffmpeg from 'fluent-ffmpeg';
import webpMux from 'node-webpmux';
import sharp from 'sharp';

const { Image } = webpMux;

export const StickerTypes = Object.freeze({
    DEFAULT: 'default',
    CROPPED: 'crop',
    FULL: 'full',
    CIRCLE: 'circle',
    ROUNDED: 'rounded',
});

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

const isVideo = (buffer) => {
    const header = buffer.subarray(0, 16);
    return (
        header.subarray(4, 8).toString() === 'ftyp' ||
        header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) ||
        (header.subarray(0, 4).toString() === 'RIFF' && header.subarray(8, 12).toString() === 'AVI ')
    );
};

const isAnimatedImage = (buffer) => {
    const signature = buffer.subarray(0, 12).toString('ascii');
    return signature.startsWith('GIF8') || (signature.startsWith('RIFF') && signature.endsWith('WEBP'));
};

const videoToWebp = async (buffer, quality) => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'mybot-sticker-'));
    const input = path.join(tempDir, 'input');
    const output = path.join(tempDir, 'output.webp');

    try {
        await writeFile(input, buffer);
        await new Promise((resolve, reject) => {
            ffmpeg(input)
                .noAudio()
                .outputOptions([
                    '-vcodec libwebp',
                    '-loop 0',
                    '-vsync 0',
                    `-q:v ${quality}`,
                    '-vf scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,fps=15',
                ])
                .on('error', reject)
                .on('end', resolve)
                .save(output);
        });
        return await readFile(output);
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
};

const addMetadata = async (buffer, metadata) => {
    const data = JSON.stringify({
        'sticker-pack-id': metadata.id || randomBytes(32).toString('hex'),
        'sticker-pack-name': metadata.pack || '',
        'sticker-pack-publisher': metadata.author || '',
        emojis: metadata.categories || [],
    });
    const exif = Buffer.concat([
        Buffer.from([
            0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
            0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
        ]),
        Buffer.from(data),
    ]);
    exif.writeUInt32LE(Buffer.byteLength(data), 14);

    const image = new Image();
    await image.load(buffer);
    image.exif = exif;
    return image.save(null);
};

export class Sticker {
    constructor(data, metadata = {}) {
        this.data = data;
        this.metadata = metadata;
    }

    async parse() {
        if (Buffer.isBuffer(this.data)) return this.data;
        if (typeof this.data !== 'string') throw new TypeError('Sticker source must be a Buffer or string');
        if (this.data.trimStart().startsWith('<svg')) return Buffer.from(this.data);
        if (/^https?:\/\//i.test(this.data)) {
            const response = await axios.get(this.data, { responseType: 'arraybuffer', timeout: 30000 });
            return Buffer.from(response.data);
        }
        return readFile(this.data);
    }

    async toBuffer() {
        const input = await this.parse();
        const quality = Math.max(1, Math.min(100, Number(this.metadata.quality) || 100));
        let webp;

        if (isVideo(input)) {
            webp = await videoToWebp(input, quality);
        } else {
            const animated = Boolean(this.metadata.animated) || isAnimatedImage(input);
            const type = this.metadata.type || StickerTypes.DEFAULT;
            const pipeline = sharp(input, { animated }).webp({ quality, lossless: false });

            if (type === StickerTypes.FULL) {
                pipeline.resize(512, 512, {
                    fit: 'contain',
                    background: this.metadata.background || transparent,
                });
            } else {
                pipeline.resize(512, 512, { fit: 'cover' });
            }
            webp = await pipeline.toBuffer();
        }

        return addMetadata(webp, this.metadata);
    }
}

export const createSticker = async (...args) => new Sticker(...args).toBuffer();
