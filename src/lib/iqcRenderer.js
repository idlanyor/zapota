import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { generateIQC } = require('iqc-canvas');

/**
 * Render iPhone-style WhatsApp quoted chat using iqc-canvas
 * @param {Object} options
 * @param {string} options.text
 * @param {string} [options.time='21:23']
 * @param {Object} [options.reply]
 * @param {string[]} [options.reactionEmojis]
 * @param {boolean} [options.showPlusBtn]
 * @param {string} [options.sticker]
 * @returns {Promise<Buffer>}
 */
export const renderIqc = async ({
    text,
    time = '21:23',
    reply = null,
    reactionEmojis,
    showPlusBtn,
    sticker,
} = {}) => {
    const options = {};
    if (reply) options.reply = reply;
    if (reactionEmojis) options.reactionEmojis = reactionEmojis;
    if (typeof showPlusBtn === 'boolean') options.showPlusBtn = showPlusBtn;
    if (sticker) options.sticker = sticker;

    const result = await generateIQC(text, time, options);
    if (!result || !result.image) {
        throw new Error('Gagal menghasilkan gambar dari iqc-canvas.');
    }
    return result.image;
};

export { generateIQC };

