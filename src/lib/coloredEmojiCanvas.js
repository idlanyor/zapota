import axios from 'axios';
import { loadImage } from 'canvas';
import emojiRegex from 'emoji-regex';
import fs from 'fs/promises';
import path from 'path';

const emojiImages = new Map();
const pendingEmojiImages = new Map();
const MAX_EMOJI_PER_MESSAGE = 20;
const TWEMOJI_CDN = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72';
const EMOJI_CACHE_DIR = path.resolve('.cache/twemoji');

const emojiCode = (emoji) =>
    [...emoji]
        .map((character) => character.codePointAt(0).toString(16))
        .filter((code) => code !== 'fe0f')
        .join('-');

const loadColoredEmoji = async (emoji) => {
    const code = emojiCode(emoji);
    if (emojiImages.has(code)) return emojiImages.get(code);
    if (pendingEmojiImages.has(code)) return pendingEmojiImages.get(code);

    const request = (async () => {
        try {
            const cachePath = path.join(EMOJI_CACHE_DIR, `${code}.png`);
            let buffer;
            try {
                buffer = await fs.readFile(cachePath);
            } catch {
                const response = await axios.get(`${TWEMOJI_CDN}/${code}.png`, {
                    responseType: 'arraybuffer',
                    timeout: 3500,
                });
                buffer = Buffer.from(response.data);
                await fs.mkdir(EMOJI_CACHE_DIR, { recursive: true });
                await fs.writeFile(cachePath, buffer);
            }
            const image = await loadImage(buffer);
            emojiImages.set(code, image);
            return image;
        } catch {
            emojiImages.set(code, null);
            return null;
        } finally {
            pendingEmojiImages.delete(code);
        }
    })();

    pendingEmojiImages.set(code, request);
    return request;
};

export const preloadColoredEmojis = async (text) => {
    const matches = String(text || '').match(emojiRegex()) || [];
    const unique = [...new Set(matches)].slice(0, MAX_EMOJI_PER_MESSAGE);
    await Promise.all(unique.map(loadColoredEmoji));
};

const splitRuns = (text) => {
    const regex = emojiRegex();
    const runs = [];
    let cursor = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
        if (match.index > cursor) runs.push({ type: 'text', value: text.slice(cursor, match.index) });
        runs.push({ type: 'emoji', value: match[0] });
        cursor = match.index + match[0].length;
    }
    if (cursor < text.length) runs.push({ type: 'text', value: text.slice(cursor) });
    return runs;
};

export const measureRichText = (ctx, text, fontSize) =>
    splitRuns(String(text || '')).reduce(
        (width, run) =>
            width +
            (run.type === 'emoji' ? fontSize * 1.08 : ctx.measureText(run.value).width),
        0
    );

export const wrapRichText = (ctx, text, maxWidth, fontSize) => {
    const words = String(text || '').split(' ');
    const lines = [];
    let currentLine = words.shift() || '';

    for (const word of words) {
        const candidate = currentLine ? `${currentLine} ${word}` : word;
        if (measureRichText(ctx, candidate, fontSize) < maxWidth) currentLine = candidate;
        else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);
    return lines;
};

export const drawRichText = (ctx, text, x, centerY, fontSize) => {
    let cursorX = x;
    const emojiSize = fontSize * 1.08;

    for (const run of splitRuns(String(text || ''))) {
        if (run.type === 'text') {
            ctx.fillText(run.value, cursorX, centerY);
            cursorX += ctx.measureText(run.value).width;
            continue;
        }

        const image = emojiImages.get(emojiCode(run.value));
        if (image) {
            ctx.drawImage(image, cursorX, centerY - emojiSize / 2, emojiSize, emojiSize);
        } else {
            ctx.fillText(run.value, cursorX, centerY);
        }
        cursorX += emojiSize;
    }
};
