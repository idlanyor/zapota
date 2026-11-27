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
        jest.spyOn(settingsRepo, 'get').mockResolvedValue({ disabledCommands: [] });
        message.reply.mockClear();
    });

    afterEach(() => {
        jest.restoreAllMocks();
        commands.clear();
    });

    test('sends the main menu as plain text with a banner', async () => {
        const sock = { sendMessage: jest.fn().mockResolvedValue({ key: { id: 'text-id' } }) };

        await menu.execute(sock, message, []);

        expect(sock.sendMessage).toHaveBeenCalledTimes(1);
        const content = sock.sendMessage.mock.calls[0][1];
        expect(content.interactiveMessage).toBeUndefined();
        expect(content.text).toContain('*DIREKTORI MENU*');
        expect(content.text).toContain('@628123');
        expect(content.text).toContain('`.menu rpg`');
        expect(content.mentions).toEqual([message.sender]);
        expect(content.contextInfo.mentionedJid).toEqual([message.sender]);
        expect(content.contextInfo.externalAdReply).toMatchObject({
            mediaType: 1,
            renderLargerThumbnail: true,
            thumbnail: expect.any(Buffer),
            sourceUrl: 'https://kanata.irengcloud.com',
        });
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
