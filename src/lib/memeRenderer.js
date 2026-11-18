import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Impact (Microsoft Core Fonts) may not be redistributed as a loose TTF, so it
// is not in the repository: put it on the server (see assets/fonts/impact/README.md).
// Without it, captions fall back to a bold system font.
const impactPath = fileURLToPath(new URL('../../assets/fonts/impact/Impact.TTF', import.meta.url));
let canvasPromise;
const getCanvas = () => {
    canvasPromise ??= import('canvas').then((canvas) => {
        if (existsSync(impactPath)) canvas.registerFont(impactPath, { family: 'Smeme Impact' });
        return canvas;
    });
    return canvasPromise;
};

export const parseMemeText = (text = '') => {
    const value = text.trim();
    const separator = value.indexOf('.');
    return separator < 0
        ? { top: '', bottom: value }
        : { top: value.slice(0, separator).trim(), bottom: value.slice(separator + 1).trim() };
};

const wrapText = (ctx, text, maxWidth) => {
    const lines = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(candidate).width > maxWidth) {
            lines.push(line);
            line = word;
        } else {
            line = candidate;
        }
    }
    if (line) lines.push(line);
    return lines;
};

export const renderMeme = async (buffer, { top = '', bottom = '' } = {}) => {
    const { createCanvas, loadImage } = await getCanvas();
    // Canvas cannot decode WhatsApp WebP stickers directly.
    const imageBuffer = await sharp(buffer)
        .rotate()
        .resize(512, 512, { fit: 'inside' })
        .png()
        .toBuffer();
    const image = await loadImage(imageBuffer);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.lineJoin = 'round';

    const padding = Math.max(4, Math.round(image.width * 0.025));
    const maxWidth = image.width - padding * 2;
    for (const [position, text] of [
        ['top', top.toUpperCase()],
        ['bottom', bottom.toUpperCase()],
    ]) {
        if (!text) continue;
        // Start large for short captions, then shrink to fit the available text area.
        let fontSize = Math.max(1, Math.floor(Math.min(image.width * 0.24, image.height * 0.3)));
        let lines;
        while (true) {
            ctx.font = `bold ${fontSize}px "Smeme Impact", Impact, "DejaVu Sans", sans-serif`;
            lines = wrapText(ctx, text, maxWidth);
            if (
                fontSize <= 1 ||
                (lines.length * fontSize * 1.2 <= image.height * 0.4 &&
                    lines.every((line) => ctx.measureText(line).width <= maxWidth))
            )
                break;
            fontSize--;
        }
        const lineHeight = fontSize * 1.2;
        const startY =
            position === 'top' ? padding : image.height - padding - lines.length * lineHeight;
        ctx.lineWidth = Math.max(1, fontSize * 0.09);
        lines.forEach((line, index) => {
            const y = startY + index * lineHeight;
            ctx.strokeText(line, image.width / 2, y);
            ctx.fillText(line, image.width / 2, y);
        });
    }
    return canvas.toBuffer('image/png');
};
