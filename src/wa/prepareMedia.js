import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

const loadImage = async (image) => {
    if (Buffer.isBuffer(image) || image instanceof Uint8Array) return Buffer.from(image);
    const source = image?.url ?? image;
    if (typeof source !== 'string') throw new TypeError('image must be a Buffer, path or { url }');
    if (!/^https?:\/\//i.test(source)) return readFile(source);
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Image download failed: HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
};

/**
 * Builds `{ imageMessage }` ready to embed in a header/link preview, like
 * Baileys' `prepareWAMessageMedia({ image }, { upload })`.
 *
 * On zapo it must NOT go through Baileys: Baileys encrypts the file itself and
 * hands the ciphertext to `waUploadToServer`, which zapo encrypts a second time
 * while Baileys keeps its own mediaKey - phones then fail to download it.
 */
export const prepareImageMedia = async (sock, image, { mediaType = 'image' } = {}) => {
    const zapo = sock?.__zapo;
    if (!zapo) {
        const { prepareWAMessageMedia } = await import('baileys');
        return prepareWAMessageMedia(
            { image },
            {
                upload: sock.waUploadToServer,
                ...(mediaType !== 'image' && { mediaTypeOverride: mediaType }),
            }
        );
    }

    const input = await loadImage(image);
    const jpeg = await sharp(input).rotate().jpeg({ quality: 90 }).toBuffer();
    const [meta, jpegThumbnail, uploaded] = await Promise.all([
        sharp(jpeg).metadata(),
        sharp(jpeg).resize(32).jpeg({ quality: 50 }).toBuffer(),
        zapo.message.upload(jpeg, { type: mediaType, mimetype: 'image/jpeg' }),
    ]);

    return {
        imageMessage: {
            url: uploaded.url,
            directPath: uploaded.directPath,
            mediaKey: uploaded.mediaKey,
            fileSha256: uploaded.fileSha256,
            fileEncSha256: uploaded.fileEncSha256,
            fileLength: uploaded.fileLength,
            mediaKeyTimestamp: uploaded.mediaKeyTimestamp,
            mimetype: 'image/jpeg',
            width: meta.width,
            height: meta.height,
            jpegThumbnail,
        },
    };
};
