/**
 * `.plugin reload` must make new/edited commands usable without a restart:
 * in production the registry comes from manifest.json, read at startup.
 */
import { jest } from '@jest/globals';

const rebuildManifest = jest.fn();
jest.unstable_mockModule('../src/services/selfManagementService.js', () => ({
    listPlugins: jest.fn(),
    readPlugin: jest.fn(),
    deletePlugin: jest.fn(),
    togglePlugin: jest.fn(),
    savePlugin: jest.fn(),
    rebuildManifest,
}));

const { commands, reloadFromManifest } = await import('../src/lib/commands.js');
const { default: plugin } = await import('../src/commands/owner/plugin.js');

const originalEnv = process.env.NODE_ENV;
afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    commands.clear();
});

describe('reloadFromManifest', () => {
    test('production: rebuilds the registry from manifest.json', async () => {
        process.env.NODE_ENV = 'production';
        commands.set('ghost', { name: 'ghost' });

        const size = await reloadFromManifest();

        expect(commands.has('ghost')).toBe(false);
        expect(commands.get('ytmp4')?.name).toBe('ytmp4');
        expect(commands.get('ytv')).toBe(commands.get('ytmp4'));
        expect(size).toBe(commands.size);
    });

    test('development: leaves the hot-reloaded registry alone', async () => {
        process.env.NODE_ENV = 'development';
        commands.set('ghost', { name: 'ghost' });

        expect(await reloadFromManifest()).toBeNull();
        expect(commands.has('ghost')).toBe(true);
    });
});

describe('.plugin reload', () => {
    const run = async () => {
        const m = { reply: jest.fn(), react: jest.fn().mockResolvedValue({}) };
        await plugin.execute({}, m, ['reload'], 'reload');
        return m;
    };

    test('reports success with the number of loaded names', async () => {
        rebuildManifest.mockResolvedValue(true);
        commands.set('a', {});
        commands.set('b', {});
        const m = await run();
        expect(m.reply).toHaveBeenCalledWith(
            '✅ Manifest dibangun ulang dan 2 perintah/alias dimuat ulang.'
        );
    });

    test('no longer claims success when the rebuild failed', async () => {
        rebuildManifest.mockResolvedValue(false);
        const m = await run();
        expect(m.reply).toHaveBeenCalledWith('❌ Gagal membangun ulang manifest. Cek log server.');
        expect(m.react).toHaveBeenCalledWith('❌');
    });
});
