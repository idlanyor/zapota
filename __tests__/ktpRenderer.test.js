import { createCanvas, loadImage } from 'canvas';
import { renderKtp } from '../src/lib/ktpRenderer.js';

const validData = {
    name: 'Warga Nusantara',
    job: 'Pedagang',
    level: 8,
    exp: 320,
    requiredExp: 800,
    balance: 125000,
    hp: 85,
    maxHp: 100,
    gizi: 72,
    kewarasan: 64,
    energi: 55,
    maxEnergi: 100,
    reputasiWarga: 70,
    reputasiPreman: 12,
    reputasiAparat: 30,
    bintangKorupsi: 1,
};

const expectPng = async (result) => {
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.subarray(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
    const image = await loadImage(result);
    expect(image.width).toBe(1200);
    expect(image.height).toBe(760);
};

describe('KTP RPG renderer', () => {
    it('renders a valid 1200x760 PNG', async () => {
        await expectPng(await renderKtp(validData));
    });

    it('renders with a valid avatar', async () => {
        const avatar = createCanvas(40, 60);
        const ctx = avatar.getContext('2d');
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(0, 0, 40, 60);

        await expectPng(
            await renderKtp({ ...validData, avatarBuffer: avatar.toBuffer('image/png') })
        );
    });

    it.each([null, Buffer.from('not-an-image')])(
        'falls back when avatar is %p',
        async (avatarBuffer) => {
            await expectPng(await renderKtp({ ...validData, avatarBuffer }));
        }
    );

    it('clamps invalid and extreme statistics', async () => {
        await expectPng(
            await renderKtp({
                name: '',
                job: null,
                level: Number.POSITIVE_INFINITY,
                exp: -500,
                requiredExp: 0,
                balance: Number.NaN,
                hp: -40,
                maxHp: 0,
                gizi: 9999,
                kewarasan: undefined,
                energi: 500,
                maxEnergi: -5,
                reputasiWarga: -5000,
                reputasiPreman: Number.NaN,
                reputasiAparat: 5000,
                bintangKorupsi: 99,
            })
        );
    });

    it('handles long Unicode identity text and large numbers', async () => {
        await expectPng(
            await renderKtp({
                ...validData,
                name: 'Nama Warga 超長い名前 '.repeat(20),
                job: 'Pengusaha Nusantara dengan gelar panjang sekali '.repeat(15),
                level: 987654321,
                balance: 999999999999999,
            })
        );
    });
});
