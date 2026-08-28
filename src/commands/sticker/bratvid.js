import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { settings } from '../../config/settings.js';
import { createCanvas } from 'canvas';
import {
    drawRichText,
    preloadColoredEmojis,
    wrapRichText,
} from '../../lib/coloredEmojiCanvas.js';

const getRandom = (ext) => {
    return `${crypto.randomUUID()}${ext}`;
};

export default {
    name: 'bratvid',
    aliases: ['bratvideo'],
    description: 'Create a brat typing sticker (Local)',
    category: 'Sticker',
    execute: async (sock, m, args, text) => {
        if (!text) {
            return m.reply(`Example: ${settings.prefix}bratvid alamak puki lorem`);
        }

        try {
            await m.react('⏳');
            await preloadColoredEmojis(text);

            const words = text.split(/\s+/);
            const tempDir = path.resolve(`./temp_brat_${Date.now()}`);
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

            const size = 512;
            const padding = 60;
            const maxWidth = size - padding * 2;

            // 1. Generate Frames
            for (let i = 0; i < words.length; i++) {
                const currentText = words.slice(0, i + 1).join(' ');
                const canvas = createCanvas(size, size);
                const ctx = canvas.getContext('2d');

                // Background
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, size, size);

                // Text Config
                ctx.fillStyle = 'black';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';

                // Size consistency based on FULL text
                let fontSize = 100;
                let testLines = [];
                do {
                    ctx.font = `${fontSize}px sans-serif`;
                    testLines = wrapRichText(ctx, text, maxWidth, fontSize);
                    const lineHeight = fontSize * 1.1;
                    if (testLines.length * lineHeight < size - padding) break;
                    fontSize -= 5;
                } while (fontSize > 10);

                ctx.font = `${fontSize}px sans-serif`;
                const lines = wrapRichText(ctx, currentText, maxWidth, fontSize);
                const lineHeight = fontSize * 1.1;
                const totalHeight = lines.length * lineHeight;
                let startY = (size - totalHeight) / 2 + lineHeight / 2;

                lines.forEach((line, index) => {
                    drawRichText(
                        ctx,
                        line,
                        padding,
                        startY + index * lineHeight,
                        fontSize
                    );
                });

                const framePath = path.join(tempDir, `frame_${String(i).padStart(3, '0')}.png`);
                fs.writeFileSync(framePath, canvas.toBuffer('image/png'));
            }

            // 2. Convert Frames directly to Animated WebP
            const stikerFile = getRandom('.webp');
            const stikerPath = path.resolve(stikerFile);

            // Fix: remove -preset ultrafast (not supported by libwebp)
            // Use -q:v for quality and -loop 0 for infinite loop
            const ffmpegCmd = `ffmpeg -y -framerate 2 -i ${path.join(tempDir, 'frame_%03d.png')} -vf "scale=512:512:flags=lanczos,format=rgba" -loop 0 -vcodec libwebp -lossless 0 -q:v 70 ${stikerPath}`;

            exec(ffmpegCmd, async (err) => {
                if (err) {
                    console.error('FFmpeg error:', err);
                    await m.react('❌');
                    await m.reply('Failed to generate typing sticker.');
                } else {
                    const stikerBuffer = fs.readFileSync(stikerPath);
                    await sock.sendMessage(m.chat, { sticker: stikerBuffer }, { quoted: m });
                    await m.react('✅');
                }

                // Cleanup
                fs.rmSync(tempDir, { recursive: true, force: true });
                if (fs.existsSync(stikerPath)) fs.unlinkSync(stikerPath);
            });
        } catch (error) {
            console.error('Error creating brat typing sticker:', error);
            await m.react('❌');
            await m.reply('Failed to create brat typing sticker.');
        }
    },
};
