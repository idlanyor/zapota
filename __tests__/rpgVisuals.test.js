import { access } from 'node:fs/promises';
import { jest } from '@jest/globals';
import {
    RPG_SCENES,
    getRpgHeaderImage,
    getRpgThumbnail,
    sendRpgReply,
} from '../src/lib/rpgVisuals.js';

describe('RPG visual responses', () => {
    const message = {
        chat: 'room@g.us',
        reply: jest.fn(),
    };

    beforeEach(() => {
        message.reply.mockReset();
    });

    test('every registered scene points to a readable image', async () => {
        await Promise.all(Object.values(RPG_SCENES).map(({ path }) => access(path)));
        expect(Object.keys(RPG_SCENES)).toHaveLength(24);
    });

    test('sends a compressed external ad reply for normal RPG responses', async () => {
        const sock = { sendMessage: jest.fn().mockResolvedValue({ key: { id: 'visual' } }) };

        await sendRpgReply(sock, message, 'hasil permainan', 'loanApp');

        expect(sock.sendMessage).toHaveBeenCalledWith(
            message.chat,
            expect.objectContaining({
                text: 'hasil permainan',
                contextInfo: {
                    externalAdReply: expect.objectContaining({
                        title: '📱 PINJAMAN CEPAT CAIR',
                        thumbnail: expect.any(Buffer),
                        renderLargerThumbnail: true,
                        sourceUrl: expect.stringMatching(
                            /^https:\/\/kanata\.irengcloud\.com\/\?rpg-scene=loanApp&v=[a-f0-9]{12}$/
                        ),
                    }),
                },
            }),
            { quoted: message }
        );
        expect(message.reply).not.toHaveBeenCalled();
    });

    test('falls back to a regular reply when the visual send fails', async () => {
        const sock = { sendMessage: jest.fn().mockRejectedValue(new Error('unsupported')) };

        await sendRpgReply(sock, message, 'fallback text', 'workComplete');

        expect(message.reply).toHaveBeenCalledWith('fallback text');
    });

    test('uses a different cache identity for every scene thumbnail', async () => {
        const sock = { sendMessage: jest.fn().mockResolvedValue({ key: { id: 'visual' } }) };

        await sendRpgReply(sock, message, 'kerja', 'workComplete');
        await sendRpgReply(sock, message, 'mbg', 'mbgNutritious');

        const firstAd = sock.sendMessage.mock.calls[0][1].contextInfo.externalAdReply;
        const secondAd = sock.sendMessage.mock.calls[1][1].contextInfo.externalAdReply;
        expect(firstAd.sourceUrl).not.toBe(secondAd.sourceUrl);
        expect(firstAd.mediaUrl).not.toBe(secondAd.mediaUrl);
        expect(firstAd.thumbnail.equals(secondAd.thumbnail)).toBe(false);
    });

    test('prepares and caches a Zapo-compatible list header', async () => {
        const upload = jest.fn().mockResolvedValue({
            url: 'https://cdn.test/kopdes',
            directPath: '/kopdes',
            mediaKey: Buffer.from('key'),
        });
        const sock = { __zapo: { message: { upload } } };

        const first = await getRpgHeaderImage(sock, 'kopdesCatalog');
        const second = await getRpgHeaderImage(sock, 'kopdesCatalog');

        expect(first).toMatchObject({
            url: 'https://cdn.test/kopdes',
            mimetype: 'image/jpeg',
            width: 600,
            height: 400,
            jpegThumbnail: expect.any(Buffer),
        });
        expect(second).toBe(first);
        expect(upload).toHaveBeenCalledTimes(1);
    });

    test('returns null for an unknown scene', async () => {
        await expect(getRpgThumbnail('missing')).resolves.toBeNull();
    });
});
