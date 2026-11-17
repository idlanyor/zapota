import { jest } from '@jest/globals';

const serverRepo = { remove: jest.fn(async () => 1) };
jest.unstable_mockModule('../src/database/repos/serverRepo.js', () => ({ serverRepo }));
const { pteroApp, pteroClient, deleteServer } = await import('../src/services/pterodactyl.js');

/** Capture outgoing requests instead of hitting the network. */
const capture = (api, respond = () => ({ status: 204, data: '' })) => {
    const seen = [];
    api.defaults.adapter = async (config) => {
        seen.push(config);
        const r = respond(config);
        if (r.status >= 400) {
            const err = new Error(`HTTP ${r.status}`);
            err.response = { status: r.status };
            throw err;
        }
        return { ...r, headers: {}, config, statusText: 'OK' };
    };
    return seen;
};

beforeEach(() => {
    process.env.PTERO_URL = 'https://panel.test';
    process.env.PTERO_API_KEY = 'app-key';
    process.env.PTERO_CLIENT_KEY = 'client-key';
    serverRepo.remove.mockClear();
});

test('application and client APIs read URL and key per request (reloadenv-safe)', async () => {
    const app = capture(pteroApp);
    const client = capture(pteroClient);
    await pteroApp.get('/users');
    process.env.PTERO_API_KEY = 'rotated';
    await pteroApp.get('/users');
    await pteroClient.get('/account');

    expect(app.map((c) => `${c.baseURL}|${c.headers.Authorization}`)).toEqual([
        'https://panel.test/api/application|Bearer app-key',
        'https://panel.test/api/application|Bearer rotated',
    ]);
    expect(client[0].baseURL).toBe('https://panel.test/api/client');
    expect(client[0].headers.Authorization).toBe('Bearer client-key');
    expect(app[0].headers.Accept).toBe('Application/vnd.pterodactyl.v1+json');
});

test('deleteServer: panel delete (force path) then local record removal', async () => {
    const seen = capture(pteroApp);
    expect(await deleteServer(42, { force: true })).toEqual({ removedFromDb: true });
    expect(seen[0].method).toBe('delete');
    expect(seen[0].url).toBe('/servers/42/force');
    expect(serverRepo.remove).toHaveBeenCalledWith({ pteroId: 42 });
});

test('deleteServer: a 404 on the panel still removes the local record', async () => {
    capture(pteroApp, () => ({ status: 404 }));
    serverRepo.remove.mockResolvedValueOnce(0);
    expect(await deleteServer(7)).toEqual({ removedFromDb: false });
    expect(serverRepo.remove).toHaveBeenCalledWith({ pteroId: 7 });
});

test('deleteServer: other panel errors propagate and keep the record', async () => {
    capture(pteroApp, () => ({ status: 500 }));
    await expect(deleteServer(7)).rejects.toThrow('HTTP 500');
    expect(serverRepo.remove).not.toHaveBeenCalled();
});
