import { jest } from '@jest/globals';
import menu from '../src/commands/info/menu.js';
import { commands } from '../src/lib/commands.js';
import Settings from '../src/database/models/Settings.js';

const addCommand = (command) => {
    commands.set(command.name, command);
    for (const alias of command.aliases || []) commands.set(alias, command);
};

const message = {
    sender: '628123@s.whatsapp.net',
    chat: 'room@g.us',
    reply: jest.fn(),
};

describe('menu command', () => {
    beforeEach(() => {
        commands.clear();
        addCommand({ name: 'menu', aliases: ['help'], category: 'Info', execute: jest.fn() });
        addCommand({
            name: 'profil',
            aliases: ['ktp', 'status'],
            category: 'RPG',
            execute: jest.fn(),
        });
        jest.spyOn(Settings, 'findOne').mockResolvedValue({ disabledCommands: [] });
        message.reply.mockClear();
    });

    afterEach(() => {
        jest.restoreAllMocks();
        commands.clear();
    });

    test('uses the raw single_select structure for the main menu', async () => {
        const uploadedImage = {
            url: 'https://cdn.test/menu',
            directPath: '/menu',
            mediaKey: Buffer.from('key'),
            fileSha256: Buffer.from('sha'),
            fileEncSha256: Buffer.from('enc'),
            fileLength: 123,
            mediaKeyTimestamp: 456,
        };
        const sock = {
            sendMessage: jest.fn().mockResolvedValue({ key: { id: 'list-id' } }),
            __zapo: {
                message: { upload: jest.fn().mockResolvedValue(uploadedImage) },
            },
        };

        await menu.execute(sock, message, []);

        expect(sock.sendMessage).toHaveBeenCalledTimes(1);
        const interactive = sock.sendMessage.mock.calls[0][1].interactiveMessage;
        expect(interactive.contextInfo.mentionedJid).toEqual([message.sender]);
        expect(interactive.contextInfo.externalAdReply).toBeUndefined();
        expect(interactive.header).toMatchObject({
            hasMediaAttachment: true,
            imageMessage: {
                url: uploadedImage.url,
                directPath: uploadedImage.directPath,
                mimetype: 'image/jpeg',
                width: 600,
                height: 400,
            },
        });
        expect(sock.__zapo.message.upload).toHaveBeenCalledWith(expect.any(Buffer), {
            type: 'image',
            mimetype: 'image/jpeg',
        });
        expect(interactive.body.text).toContain('@628123');
        const button = interactive.nativeFlowMessage.buttons[0];
        expect(button.name).toBe('single_select');
        const params = JSON.parse(button.buttonParamsJson);
        const rpgRow = params.sections
            .flatMap((section) => section.rows)
            .find((row) => row.title.includes('RPG'));
        expect(rpgRow).toMatchObject({ id: '.menu rpg', description: '1 perintah tersedia' });
    });

    test('falls back to text when the interactive list fails', async () => {
        const sock = {
            sendMessage: jest
                .fn()
                .mockRejectedValueOnce(new Error('unsupported'))
                .mockResolvedValueOnce({ key: { id: 'text-id' } }),
        };

        await menu.execute(sock, message, []);

        expect(sock.sendMessage).toHaveBeenCalledTimes(2);
        expect(sock.sendMessage.mock.calls[1][1].text).toContain('*DIREKTORI MENU*');
    });

    test('shows only primary command names in category details', async () => {
        const sock = { sendMessage: jest.fn().mockResolvedValue({ key: { id: 'text-id' } }) };

        await menu.execute(sock, message, ['rpg']);

        const content = sock.sendMessage.mock.calls[0][1];
        const text = content.text;
        expect(text).toContain('`.profil`');
        expect(text).not.toContain('ktp');
        expect(text).not.toContain('status');
        expect(content.contextInfo.externalAdReply).toMatchObject({
            title: '⚔ MENU RPG',
            body: expect.stringContaining('1 perintah'),
            mediaType: 1,
            renderLargerThumbnail: true,
            thumbnail: expect.any(Buffer),
            sourceUrl: 'https://kanata.irengcloud.com',
            mediaUrl: 'https://kanata.irengcloud.com',
        });
    });
});
