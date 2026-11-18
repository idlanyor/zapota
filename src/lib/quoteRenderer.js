import sharp from 'sharp';

export const MAX_QUOTE_LENGTH = 300;
const segmenter = new Intl.Segmenter('id', { granularity: 'grapheme' });
const graphemes = (text) => Array.from(segmenter.segment(text), ({ segment }) => segment);
export const quoteTextLength = (text) => graphemes(text).length;
let canvasPromise;
const getCanvas = () => (canvasPromise ??= import('canvas'));
const FONT = '"DejaVu Sans", sans-serif';

const wrapText = (ctx, text, maxWidth) => {
    const lines = [];
    for (const paragraph of text.split('\n')) {
        let line = '';
        for (const token of paragraph.split(/(\s+)/).filter(Boolean)) {
            if (ctx.measureText(line + token).width <= maxWidth) {
                line += token;
                continue;
            }
            if (line.trim()) lines.push(line.trimEnd());
            line = '';
            // Split a long word by grapheme so joined emoji stay together.
            for (const character of graphemes(token.trimStart())) {
                if (line && ctx.measureText(line + character).width > maxWidth) {
                    lines.push(line);
                    line = '';
                }
                line += character;
            }
        }
        lines.push(line.trimEnd());
    }
    return lines;
};

const roundedRect = (ctx, x, y, width, height, radius) => {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
};

const fitName = (ctx, name, maxWidth) => {
    const letters = graphemes(name);
    while (letters.length && ctx.measureText(letters.join('')).width > maxWidth) {
        letters.pop();
        if (ctx.measureText(`${letters.join('')}…`).width <= maxWidth) {
            return `${letters.join('')}…`;
        }
    }
    return letters.join('');
};

export const renderQuote = async ({ text, name = 'Pengguna', avatarBuffer = null }) => {
    const value = String(text || '').replace(/\r\n?/g, '\n').trim();
    if (!value) throw new Error('Teks kutipan kosong.');
    if (quoteTextLength(value) > MAX_QUOTE_LENGTH) {
        throw new Error(`Teks kutipan maksimal ${MAX_QUOTE_LENGTH} karakter.`);
    }
    const { createCanvas, loadImage } = await getCanvas();
    const canvas = createCanvas(512, 512);
    const ctx = canvas.getContext('2d');
    const displayName = String(name || 'Pengguna').replace(/\s+/g, ' ').trim().slice(0, 200);
    const bubbleX = 100;
    const maxBubbleWidth = 396;
    const maxTextWidth = maxBubbleWidth - 44;
    let fontSize = Math.max(30, 44 - Math.floor(quoteTextLength(value) / 6));
    let lines;
    let lineHeight;
    for (; fontSize >= 16; fontSize--) {
        ctx.font = `${fontSize}px ${FONT}`;
        lines = wrapText(ctx, value, maxTextWidth);
        lineHeight = Math.ceil(fontSize * 1.35);
        if (lines.length * lineHeight <= 380) break;
    }
    if (fontSize < 16) throw new Error('Terlalu banyak baris. Pendekkan teks kutipannya.');

    const widestLine = Math.max(...lines.map((line) => ctx.measureText(line).width));
    ctx.font = `bold 23px ${FONT}`;
    const fittedName = fitName(ctx, displayName, maxTextWidth);
    const contentWidth = Math.max(widestLine, ctx.measureText(fittedName).width);
    const bubbleWidth = Math.min(maxBubbleWidth, Math.max(120, Math.ceil(contentWidth) + 44));
    // Center the avatar and bubble together, including compact quotes.
    ctx.translate(Math.floor((maxBubbleWidth - bubbleWidth) / 2), 0);
    const bubbleHeight = Math.max(116, 78 + lines.length * lineHeight);
    const top = Math.floor((512 - bubbleHeight) / 2);
    ctx.fillStyle = '#173b3a';
    roundedRect(ctx, bubbleX, top, bubbleWidth, bubbleHeight, 26);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(bubbleX + 16, top + 24);
    ctx.lineTo(bubbleX - 12, top + 24);
    ctx.lineTo(bubbleX + 4, top + 45);
    ctx.fill();

    ctx.font = `bold 23px ${FONT}`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#87e1c2';
    ctx.fillText(fittedName, bubbleX + 22, top + 20);
    ctx.font = `${fontSize}px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    lines.forEach((line, index) => {
        ctx.fillText(line, bubbleX + 22, top + 59 + index * lineHeight);
    });

    let avatar;
    if (avatarBuffer?.length) {
        try {
            const png = await sharp(avatarBuffer)
                .rotate().resize(68, 68, { fit: 'cover' }).png().toBuffer();
            avatar = await loadImage(png);
        } catch {
            // Invalid or unsupported photos use initials instead.
        }
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(50, top + 34, 34, 0, Math.PI * 2);
    ctx.clip();
    if (avatar) {
        ctx.drawImage(avatar, 16, top, 68, 68);
    } else {
        ctx.fillStyle = '#c5efdf';
        ctx.fillRect(16, top, 68, 68);
        ctx.fillStyle = '#173b3a';
        ctx.font = `bold 26px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const initials = displayName.split(/\s+/).slice(0, 2)
            .map((word) => graphemes(word)[0] || '').join('').toUpperCase();
        ctx.fillText(initials, 50, top + 35, 56);
    }
    ctx.restore();
    return canvas.toBuffer('image/png');
};
