import { jest } from '@jest/globals';
import menu from '../src/commands/info/menu.js';
import { commands } from '../src/lib/commands.js';
import { settingsRepo } from '../src/database/repos/settingsRepo.js';

const addCommand = (command) => {
    commands.set(command.name, command);
    for (const alias of command.aliases || []) commands.set(alias, command);
};

const message = {
    sender: '628123@s.whatsapp.net',
    chat: 'room@g.us',
    key: { id: 'MENU1' },
    message: { conversation: '.menu' },
    reply: jest.fn(),
};

/** zapo-like socket whose thumbnail upload succeeds. */
const zapoSock = () => ({
    sendMessage: jest.fn().mockResolvedValue({ key: { id: 'img-id' } }),
    relayMessage: jest.fn().mockResolvedValue({ key: { id: 'relay-id' } }),
    __zapo: {
        message: {
            upload: jest.fn().mockResolvedValue({
                url: 'https://cdn.test/t',
                directPath: '/t',
                mediaKey: Buffer.from('key'),
                fileSha256: Buffer.from('sha'),
                fileEncSha256: Buffer.from('enc'),
                fileLength: 1,
                mediaKeyTimestamp: 1,
            }),
        },
    },
});

/** Socket whose thumbnail upload fails, forcing the image fallback. */
const failingSock = () => ({
    ...zapoSock(),
    __zapo: { message: { upload: jest.fn().mockRejectedValue(new Error('upload down')) } },
});

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
        jest.spyOn(settingsRepo, 'get').mockResolvedValue({ disabledCommands: [] });
        jest.spyOn(console, 'error').mockImplementation(() => {});
        message.reply.mockClear();
    });

    afterEach(() => {
        jest.restoreAllMocks();
        commands.clear();
    });

    test('sends the main menu as a link-preview text like .is', async () => {
        const sock = zapoSock();

        await menu.execute(sock, message, []);

        expect(sock.sendMessage).not.toHaveBeenCalled();
        expect(sock.__zapo.message.upload).toHaveBeenCalledWith(expect.any(Buffer), {
            type: 'thumbnail-link',
            mimetype: 'image/jpeg',
        });
        const [chat, content] = sock.relayMessage.mock.calls[0];
        expect(chat).toBe(message.chat);
        const ext = content.extendedTextMessage;
        expect(ext.text).toContain('*DIREKTORI MENU*');
        expect(ext.text).toContain('@628123');
        expect(ext.text).toContain('https://kanata.irengcloud.com');
        expect(ext.matchedText).toBe('https://kanata.irengcloud.com');
        expect(ext.thumbnailDirectPath).toBe('/t');
        expect(ext.contextInfo).toMatchObject({
            mentionedJid: [message.sender],
            isForwarded: true,
            stanzaId: 'MENU1',
            participant: message.sender,
        });
        expect(ext.contextInfo.externalAdReply).toBeUndefined();
    });

    test('falls back to banner image + caption when the preview upload fails', async () => {
        const sock = failingSock();

        await menu.execute(sock, message, []);

        expect(sock.relayMessage).not.toHaveBeenCalled();
        const content = sock.sendMessage.mock.calls[0][1];
        expect(content.image).toEqual(expect.any(Buffer));
        expect(content.caption).toContain('`.menu rpg`');
        expect(content.mentions).toEqual([message.sender]);
    });

    test('shows only primary command names in category details', async () => {
        const sock = zapoSock();

        await menu.execute(sock, message, ['rpg']);

        const ext = sock.relayMessage.mock.calls[0][1].extendedTextMessage;
        expect(ext.title).toBe('⚔ MENU RPG');
        expect(ext.text).toContain('`.profil`');
        expect(ext.text).not.toContain('ktp');
        expect(ext.text).not.toContain('status');
        expect(ext.contextInfo.mentionedJid).toBeUndefined();
    });
});
