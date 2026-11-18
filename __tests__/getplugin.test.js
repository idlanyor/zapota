import { jest } from '@jest/globals';
import getPlugin from '../src/commands/owner/getplugin.js';

describe('getplugin', () => {
    const message = () => ({
        chat: '120363000000000000@g.us',
        sender: '628000000002@s.whatsapp.net',
        reply: jest.fn().mockResolvedValue({}),
    });

    test('sends an existing plugin source as plain text', async () => {
        const m = message();
        await getPlugin.execute({}, m, ['getplugin'], 'getplugin');

        expect(m.reply).toHaveBeenCalledTimes(1);
        expect(m.reply.mock.calls[0][0]).toContain("name: 'getplugin'");
    });

    test('accepts the name with a .js suffix', async () => {
        const m = message();
        await getPlugin.execute({}, m, ['getplugin.js'], 'getplugin.js');
        expect(m.reply.mock.calls[0][0]).toContain("name: 'getplugin'");
    });

    test('reports an unknown plugin', async () => {
        const m = message();
        await getPlugin.execute({}, m, ['nope-not-here'], 'nope-not-here');
        expect(m.reply).toHaveBeenCalledWith("Plugin 'nope-not-here' tidak ditemukan.");
    });

    test('shows usage when plugin name is omitted', async () => {
        const m = message();
        await getPlugin.execute({}, m, [], '');
        expect(m.reply).toHaveBeenCalledWith('Masukkan nama plugin. Contoh: `.gp testbutton`');
    });
});
