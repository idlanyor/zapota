import { renderIqc, generateIQC } from '../src/lib/iqcRenderer.js';

describe('IQC renderer', () => {
    it('renders a valid PNG buffer', async () => {
        const result = await renderIqc({
            text: 'Jangan menggunakan seseorang untuk melupakan seseorang',
            time: '11.43',
        });

        expect(Buffer.isBuffer(result)).toBe(true);
        expect(result.subarray(0, 8)).toEqual(
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        );
        expect(result.length).toBeGreaterThan(10_000);
    });

    it('handles long and multiline text', async () => {
        await expect(
            renderIqc({
                text: 'Baris pertama\n' + 'pesan-yang-sangat-panjang-tanpa-spasi'.repeat(20),
                time: '12:00',
            })
        ).resolves.toBeInstanceOf(Buffer);
    });

    it('renders with reply option', async () => {
        const result = await renderIqc({
            text: 'ngga ah',
            time: '21.22',
            reply: {
                sender: 'Anda',
                text: 'single era dulu gasii',
            },
        });

        expect(Buffer.isBuffer(result)).toBe(true);
        expect(result.length).toBeGreaterThan(10_000);
    });

    it('exports generateIQC from package', () => {
        expect(typeof generateIQC).toBe('function');
    });
});

