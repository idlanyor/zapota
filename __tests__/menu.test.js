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

    test('sends the main menu as a banner image with a text caption', async () => {
        const sock = { sendMessage: jest.fn().mockResolvedValue({ key: { id: 'img-id' } }) };

        await menu.execute(sock, message, []);

        expect(sock.sendMessage).toHaveBeenCalledTimes(1);
        const content = sock.sendMessage.mock.calls[0][1];
        expect(content.interactiveMessage).toBeUndefined();
        expect(content.contextInfo).toBeUndefined();
        expect(content.image).toEqual(expect.any(Buffer));
        expect(content.caption).toContain('*DIREKTORI MENU*');
        expect(content.caption).toContain('@628123');
        expect(content.caption).toContain('`.menu rpg`');
        expect(content.mentions).toEqual([message.sender]);
    });

    test('shows only primary command names in category details', async () => {
        const sock = { sendMessage: jest.fn().mockResolvedValue({ key: { id: 'text-id' } }) };

        await menu.execute(sock, message, ['rpg']);

        const content = sock.sendMessage.mock.calls[0][1];
        const text = content.caption;
        expect(content.image).toEqual(expect.any(Buffer));
        expect(content.contextInfo).toBeUndefined();
        expect(text).toContain('`.profil`');
        expect(text).toContain('*RPG*');
        expect(text).not.toContain('ktp');
        expect(text).not.toContain('status');
    });
});
