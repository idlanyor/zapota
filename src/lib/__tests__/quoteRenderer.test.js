import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import sharp from 'sharp';
import { renderQuote, quoteTextLength } from '../quoteRenderer.js';
import { saveMessage } from '../msgStore.js';
import qc from '../../commands/sticker/qc.js';

test('renders a transparent 512px quote with a circular profile photo', async () => {
    const avatarBuffer = await sharp({
        create: { width: 80, height: 120, channels: 3, background: '#ff0000' },
    }).png().toBuffer();
    const image = await renderQuote({ text: 'Gas bikin fitur baru!', name: 'Roy', avatarBuffer });
    const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 512);
    assert.equal(info.height, 512);
    assert.equal(data[3], 0);
    let redPixels = 0;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i] === 255 && data[i + 1] === 0 && data[i + 2] === 0 && data[i + 3] === 255) redPixels++;
    }
    assert.ok(redPixels > 3000);
});

test('fits multiline text, long unbroken words and long sender names', async () => {
    const image = await renderQuote({
        text: 'Baris pertama\n' + 'W'.repeat(200),
        name: 'Nama pengirim '.repeat(40),
    });
    assert.equal((await sharp(image).metadata()).format, 'png');
});

const visibleBounds = async (image) => {
    const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let left = info.width, right = 0, top = info.height, bottom = 0;
    for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
            if (data[(y * info.width + x) * 4 + 3] < 128) continue;
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
        }
    }
    return { left, right, width: right - left + 1, height: bottom - top + 1 };
};

test('adapts width to text and sender name while keeping the quote centered', async () => {
    const short = await visibleBounds(await renderQuote({ text: 'Hai', name: 'Roy' }));
    const long = await visibleBounds(await renderQuote({ text: 'Gas bikin fitur baru!', name: 'Roy' }));
    const longName = await visibleBounds(await renderQuote({ text: 'Hai', name: 'Nama Pengirim Panjang' }));
    assert.ok(short.width + 100 < long.width);
    assert.ok(short.width + 100 < longName.width);
    for (const bounds of [short, long, longName]) {
        assert.ok(Math.abs(bounds.left + bounds.right - 511) <= 2);
    }
});

test('adds height for wrapped text without exceeding the sticker area', async () => {
    const short = await visibleBounds(await renderQuote({ text: 'Hai', name: 'Roy' }));
    const multiline = await visibleBounds(await renderQuote({ text: 'Baris satu\nBaris dua\nBaris tiga', name: 'Roy' }));
    const full = await visibleBounds(await renderQuote({ text: 'W'.repeat(300), name: 'Roy' }));
    assert.ok(multiline.height > short.height);
    assert.ok(full.height > multiline.height);
    assert.ok(full.width <= 480);
    assert.ok(full.height <= 480);
});

test('uses larger text for short quotes and smaller text for long quotes', async () => {
    const glyphHeight = async (text) => {
        const { data, info } = await sharp(await renderQuote({ text, name: 'Roy' }))
            .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        let run = 0, longest = 0;
        for (let y = 0; y < info.height; y++) {
            let hasText = false;
            for (let x = 0; x < info.width; x++) {
                const offset = (y * info.width + x) * 4;
                if (data[offset] > 240 && data[offset + 1] > 240 &&
                    data[offset + 2] > 240 && data[offset + 3] > 240) {
                    hasText = true;
                    break;
                }
            }
            run = hasText ? run + 1 : 0;
            longest = Math.max(longest, run);
        }
        return longest;
    };
    assert.ok(await glyphHeight('W') > await glyphHeight('W'.repeat(200)));
});

test('counts joined emoji as one character and rejects oversized or empty quotes', async () => {
    assert.equal(quoteTextLength('👨‍👩‍👧‍👦👍🏽'), 2);
    await assert.rejects(renderQuote({ text: ' ' }), /kosong/);
    await assert.rejects(renderQuote({ text: 'a'.repeat(301) }), /maksimal 300/);
    await assert.rejects(renderQuote({ text: 'x\n'.repeat(140) }), /banyak baris/);
});

test('uses initials when an avatar cannot be decoded', async () => {
    const fallback = await renderQuote({ text: 'Halo', name: 'Andi Budi' });
    const invalid = await renderQuote({ text: 'Halo', name: 'Andi Budi', avatarBuffer: Buffer.from('invalid') });
    assert.deepEqual(invalid, fallback);
});

const makeMessage = (overrides = {}) => ({
    sender: 'roy@s.whatsapp.net',
    pushName: 'Roy',
    chat: 'group@g.us',
    reply: mock.fn(async () => {}),
    react: mock.fn(async () => {}),
    ...overrides,
});
const makeSock = () => ({
    getName: mock.fn(async () => 'Andi'),
    profilePictureUrl: mock.fn(async () => { throw new Error('No profile photo'); }),
    sendMessage: mock.fn(async () => {}),
});

test('quotes the replied sender, with a valid WebP sticker and pack metadata', async () => {
    const m = makeMessage({ quoted: { sender: 'andi@s.whatsapp.net', text: 'Ngeteh dulu' } });
    const sock = makeSock();
    await qc.execute(sock, m, [], '');
    assert.equal(sock.profilePictureUrl.mock.calls[0].arguments[0], m.quoted.sender);
    const [chat, { sticker }, options] = sock.sendMessage.mock.calls[0].arguments;
    assert.equal(chat, m.chat);
    assert.equal(options.quoted, m);
    const info = await sharp(sticker).metadata();
    assert.equal(info.format, 'webp');
    assert.equal(info.width, 512);
    assert.equal(info.height, 512);
    assert.ok(info.exif.toString().includes('Andi'));
    assert.ok(sticker.length < 100 * 1024);
});

test('inline text uses the command sender even when replying to someone else', async () => {
    const m = makeMessage({ quoted: { sender: 'andi@s.whatsapp.net', text: 'Pesan Andi' } });
    const sock = makeSock();
    await qc.execute(sock, m, ['Pesan', 'Roy'], 'Pesan Roy');
    assert.equal(sock.profilePictureUrl.mock.calls[0].arguments[0], m.sender);
    const info = await sharp(sock.sendMessage.mock.calls[0].arguments[1].sticker).metadata();
    assert.ok(info.exif.toString().includes('Roy'));
    assert.equal(sock.getName.mock.calls.length, 0);
});

test('uses the original cached display name for a replied message', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
        saveMessage({ id: 'original-qc', sender: 'andi@lid', pushName: 'Nama Asli', body: 'Halo' });
    } finally { mock.timers.reset(); }
    const m = makeMessage({ quoted: { id: 'original-qc', sender: 'andi@lid', text: 'Halo' } });
    const sock = makeSock();
    await qc.execute(sock, m, [], '');
    const info = await sharp(sock.sendMessage.mock.calls[0].arguments[1].sticker).metadata();
    assert.ok(info.exif.toString().includes('Nama Asli'));
});

test('rejects missing text and oversized text without fetching a photo', async () => {
    for (const quoted of [undefined, { text: '' }, { text: 'a'.repeat(301) }]) {
        const m = makeMessage({ quoted });
        const sock = makeSock();
        await qc.execute(sock, m, [], '');
        assert.equal(m.reply.mock.calls.length, 1);
        assert.equal(sock.profilePictureUrl.mock.calls.length, 0);
        assert.equal(sock.sendMessage.mock.calls.length, 0);
    }
});

test('failed reactions do not prevent sticker delivery', async () => {
    const m = makeMessage({ react: async () => { throw new Error('Reaction failed'); } });
    const sock = makeSock();
    await qc.execute(sock, m, ['halo'], 'halo');
    assert.equal(sock.sendMessage.mock.calls.length, 1);
});
