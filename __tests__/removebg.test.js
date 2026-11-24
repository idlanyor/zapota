import sharp from 'sharp';
import {
    createQueue,
    removeBackground,
    resolveOutput,
    runRembg,
} from '../src/commands/sticker/removebg.js';

const rgba = (width, height, paint) => {
    const data = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
            if (paint(x, y)) data.fill(255, (y * width + x) * 4, (y * width + x) * 4 + 4);
    return sharp(data, { raw: { width, height, channels: 4 } })
        .png()
        .toBuffer();
};

describe('.removebg', () => {
    test('queue runs one job at a time and turns away overflow', async () => {
        const queue = createQueue(1);
        let running = 0;
        let maxRunning = 0;
        const job = () =>
            new Promise((resolve) => {
                running += 1;
                maxRunning = Math.max(maxRunning, running);
                setTimeout(() => {
                    running -= 1;
                    resolve('ok');
                }, 20);
            });
        const accepted = [queue.run(job), queue.run(job)];
        await expect(queue.run(job)).rejects.toThrow('QUEUE_FULL');
        await expect(Promise.all(accepted)).resolves.toEqual(['ok', 'ok']);
        expect(maxRunning).toBe(1);
        expect(queue.pending).toBe(0);
        await expect(queue.run(job)).resolves.toBe('ok'); // usable again after draining
    });

    test('a failing job does not block the queue', async () => {
        const queue = createQueue(3);
        await expect(queue.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
        await expect(queue.run(async () => 'next')).resolves.toBe('next');
    });

    test('trims the transparent border around the kept object', async () => {
        const photo = await sharp({
            create: { width: 200, height: 100, channels: 3, background: '#888' },
        })
            .jpeg()
            .toBuffer();
        const cutout = await rgba(200, 100, (x, y) => x >= 50 && x < 90 && y >= 20 && y < 80);
        const out = await removeBackground(photo, async () => cutout, createQueue());
        const meta = await sharp(out).metadata();
        expect([meta.width, meta.height]).toEqual([40, 60]);
        expect(meta.hasAlpha).toBe(true);
    });

    test('returns null when nothing was kept', async () => {
        const photo = await sharp({
            create: { width: 50, height: 50, channels: 3, background: '#888' },
        })
            .png()
            .toBuffer();
        const empty = await rgba(50, 50, () => false);
        await expect(removeBackground(photo, async () => empty, createQueue())).resolves.toBeNull();
    });

    test('reports a missing rembg install clearly', async () => {
        await expect(runRembg(Buffer.from('x'), { python: '/nonexistent/python' })).rejects.toThrow(
            'REMBG_MISSING'
        );
    });

    test('output follows the input unless asked', () => {
        expect(resolveOutput({ isImage: true })).toBe('image');
        expect(resolveOutput({ isSticker: true })).toBe('sticker');
        expect(resolveOutput({ isImage: true }, ['s'])).toBe('sticker');
        expect(resolveOutput({ isSticker: true }, ['PNG'])).toBe('png');
        expect(resolveOutput({ isImage: true }, ['doc'])).toBe('png');
    });
});
