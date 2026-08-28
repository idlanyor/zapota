import stickerly from '../../lib/stickerly.js';
import axios from 'axios';
import { generateWAMessageFromContent, prepareWAMessageMedia } from 'baileys';
import { settings } from '../../config/settings.js';
import sharp from 'sharp';
import { zipSync } from 'fflate';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest();

export default {
    name: 'stget',
    aliases: ['stickerget', 'slyget'],
    description: 'Import Stickers from Sticker.ly Pack (Ultimate Attempt)',
    category: 'Utility',
    execute: async (sock, m, args, text) => {
        if (!text) return m.reply(`Usage: ${settings.prefix}stget <stickerly_url>`);

        try {
            await m.reply('Building native sticker pack... (final attempt)');

            const data = await stickerly.detail(text);
            const rawStickers = data.stickers.slice(0, 10);

            // 1. Use UUID-like ID
            const packId = crypto.randomUUID();

            const stickerData = {};
            const stickerMetadata = [];

            for (const s of rawStickers) {
                const response = await axios.get(s.imageUrl, { responseType: 'arraybuffer' });
                const webpBuffer = await sharp(response.data)
                    .resize(512, 512, {
                        fit: 'contain',
                        background: { r: 0, g: 0, b: 0, alpha: 0 },
                    })
                    .webp()
                    .toBuffer();

                const hashB64 = crypto.createHash('sha256').update(webpBuffer).digest('base64');
                const fileName = `${hashB64}.webp`;

                stickerData[fileName] = new Uint8Array(webpBuffer);
                stickerMetadata.push({
                    fileName,
                    mimetype: 'image/webp',
                    isAnimated: s.isAnimated || false,
                    isLottie: false,
                });
            }

            // 2. Process Cover as PNG (252x252)
            const thumbRes = await axios.get(data.thumbnailUrl, { responseType: 'arraybuffer' });
            const thumbPng = await sharp(thumbRes.data).resize(252, 252).png().toBuffer();
            const trayIconFileName = `${packId}.png`;
            stickerData[trayIconFileName] = new Uint8Array(thumbPng);

            // Calculate imageDataHash: SHA256 HEX -> Base64
            const sha256Hex = crypto.createHash('sha256').update(thumbPng).digest('hex');
            const imageDataHash = Buffer.from(sha256Hex).toString('base64');

            const { imageMessage: thumbUpload } = await prepareWAMessageMedia(
                { image: thumbPng },
                { upload: sock.waUploadToServer }
            );

            // 3. Create and Upload ZIP Pack
            const zipBuffer = Buffer.from(zipSync(stickerData));
            const { documentMessage: packUpload } = await prepareWAMessageMedia(
                {
                    document: zipBuffer,
                    mimetype: 'application/octet-stream',
                    fileName: `${packId}.stickerpack`,
                },
                { upload: sock.waUploadToServer }
            );

            // 4. Final Construction
            const msg = generateWAMessageFromContent(
                m.chat,
                {
                    stickerPackMessage: {
                        stickerPackId: packId,
                        name: data.name,
                        publisher: data.author || 'KanataBot',
                        stickers: stickerMetadata,
                        fileLength: zipBuffer.length,
                        fileSha256: packUpload.fileSha256,
                        fileEncSha256: packUpload.fileEncSha256,
                        mediaKey: packUpload.mediaKey,
                        directPath: packUpload.directPath,
                        trayIconFileName: trayIconFileName,
                        thumbnailDirectPath: thumbUpload.directPath,
                        thumbnailSha256: thumbUpload.fileSha256,
                        thumbnailEncSha256: thumbUpload.fileEncSha256,
                        thumbnailHeight: 252,
                        thumbnailWidth: 252,
                        imageDataHash: imageDataHash,
                        stickerPackSize: zipBuffer.length,
                        stickerPackOrigin: 0,
                        mediaKeyTimestamp: Math.floor(Date.now() / 1000),
                    },
                },
                { quoted: m }
            );

            await sock.relayMessage(m.chat, msg.message, { messageId: msg.key.id });
            await m.reply(
                'Ultimate Native Pack sent! If this fails, WA might be blocking custom packs.'
            );
        } catch (error) {
            console.error('STGet Ultimate Error:', error);
            await m.reply(`Error: ${error.message}`);
        }
    },
};
