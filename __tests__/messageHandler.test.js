/**
 * Characterization tests for src/handlers/messageHandler.js.
 *
 * These pin the CURRENT routing/permission behavior so the handler can be
 * split into a middleware pipeline without silently changing what the bot
 * does. If one of these fails during a refactor, the behavior changed —
 * decide deliberately whether that is intended.
 *
 * Real modules kept: serialize, command registry, auth/group middlewares.
 * Mocked: messageFlow side-effects (DB, AI, AFK), AI chat, logger, msgStore.
 */
import { jest } from '@jest/globals';

const OWNER = '628111@s.whatsapp.net';
const BOT = '628999@s.whatsapp.net';
const BOT_LID = '999@lid';
const USER = '628222@s.whatsapp.net';
const ADMIN = '628333@s.whatsapp.net';

process.env.OWNER_NUMBER = OWNER;
process.env.OWNER_LID = '111@lid';
process.env.BOT_PREFIX = '.';

const flow = {
    getCachedSettings: jest.fn(),
    getGroupSettings: jest.fn(),
    handlePreProcessing: jest.fn(),
    handleAfk: jest.fn(),
    handleSpecialMessages: jest.fn(),
    handleAutoAiPrivate: jest.fn(),
    handleOwnerAgentTrigger: jest.fn(),
    clearSettingsCache: jest.fn(),
    getRequiredGroupParticipants: jest.fn(),
};
const handleDsChat = jest.fn();
const handleButtons = jest.fn();
const handleDeleteServerConfirmation = jest.fn();
const noop = () => {};
const logger = new Proxy({}, { get: () => noop });

jest.unstable_mockModule('../src/handlers/messageFlow.js', () => flow);
jest.unstable_mockModule('../src/commands/ai/ds.js', () => ({ handleDsChat }));
jest.unstable_mockModule('../src/handlers/buttonHandler.js', () => ({ handleButtons }));
jest.unstable_mockModule('../src/middlewares/deleteServer.js', () => ({
    handleDeleteServerConfirmation,
}));
jest.unstable_mockModule('../src/games/werewolf/service.js', () => ({
    recordWerewolfPrivateContact: jest.fn(),
}));
jest.unstable_mockModule('../src/lib/msgStore.js', () => ({
    saveMessage: jest.fn(),
    getMessage: jest.fn(),
}));
jest.unstable_mockModule('../src/utils/logger.js', () => ({ default: logger }));

const { messageHandler } = await import('../src/handlers/messageHandler.js');
const { commands } = await import('../src/lib/commands.js');
const { sessionManager } = await import('../src/utils/session.js');
const { pendingServerDeletes } = await import('../src/state/pendingServerDeletes.js');

let seq = 0;
const uid = () => `MSG${Date.now()}${++seq}`;
const groupJid = () => `120363${++seq}@g.us`;

const makeSock = ({ participants = [] } = {}) => ({
    user: { id: '628999:12@s.whatsapp.net', lid: BOT_LID },
    sendMessage: jest.fn().mockResolvedValue({ key: { id: 'sent' } }),
    sendPresenceUpdate: jest.fn().mockResolvedValue(),
    readMessages: jest.fn().mockResolvedValue(),
    groupMetadata: jest.fn().mockResolvedValue({ subject: 'Test Group', participants }),
});

/** Raw (pre-serialize) WhatsApp message. */
const raw = ({ text, chat = USER, sender, fromMe = false, message } = {}) => ({
    key: {
        id: uid(),
        remoteJid: chat,
        fromMe,
        ...(chat.endsWith('@g.us') || chat === 'status@broadcast'
            ? { participant: sender || USER }
            : {}),
    },
    pushName: 'Tester',
    message: message || { conversation: text },
});

const addCommand = (cmd) => {
    const full = { aliases: [], category: 'General', execute: jest.fn(), ...cmd };
    commands.set(full.name, full);
    for (const a of full.aliases) commands.set(a, full);
    return full;
};

const sentTexts = (sock) => sock.sendMessage.mock.calls.map(([, c]) => c?.text).filter(Boolean);

beforeEach(() => {
    jest.clearAllMocks();
    commands.clear();
    flow.getCachedSettings.mockResolvedValue({ mode: 'public', owners: [] });
    flow.getGroupSettings.mockResolvedValue({});
    flow.handlePreProcessing.mockResolvedValue(false);
    flow.handleOwnerAgentTrigger.mockResolvedValue(false);
    handleButtons.mockResolvedValue(false);
});

afterEach(() => {
    commands.clear();
    sessionManager.sessions.clear();
});

describe('messageHandler: command routing', () => {
    test('runs a prefixed command with parsed args and text', async () => {
        const cmd = addCommand({ name: 'ping' });
        const sock = makeSock();
        await messageHandler(sock, raw({ text: '.ping a b' }));

        expect(cmd.execute).toHaveBeenCalledTimes(1);
        const [, m, args, text] = cmd.execute.mock.calls[0];
        expect(args).toEqual(['a', 'b']);
        expect(text).toBe('a b');
        expect(m.command).toBe('ping');
        expect(sock.sendPresenceUpdate).toHaveBeenCalledWith('composing', USER);
    });

    test('command name is case-insensitive and resolves aliases', async () => {
        const cmd = addCommand({ name: 'ping', aliases: ['p'] });
        await messageHandler(makeSock(), raw({ text: '.P' }));
        expect(cmd.execute).toHaveBeenCalledTimes(1);
    });

    test('unknown command does nothing and does not fall through to private AI', async () => {
        const sock = makeSock();
        await messageHandler(sock, raw({ text: '.nope' }));
        expect(sock.sendMessage).not.toHaveBeenCalled();
        expect(flow.handleAutoAiPrivate).not.toHaveBeenCalled();
    });

    test('non-prefixed text goes to auto AI private, not to commands', async () => {
        const cmd = addCommand({ name: 'ping' });
        await messageHandler(makeSock(), raw({ text: 'ping' }));
        expect(cmd.execute).not.toHaveBeenCalled();
        expect(flow.handleAutoAiPrivate).toHaveBeenCalledTimes(1);
    });

    test('command error: reports stack to owner and replies a generic error', async () => {
        addCommand({ name: 'boom', execute: jest.fn().mockRejectedValue(new Error('kaboom')) });
        const sock = makeSock();
        await messageHandler(sock, raw({ text: '.boom' }));

        const ownerReport = sock.sendMessage.mock.calls.find(([jid]) => jid === OWNER);
        expect(ownerReport?.[1].text).toContain('kaboom');
        expect(sentTexts(sock).some((t) => t.includes('Terjadi kesalahan'))).toBe(true);
    });

    test('same message id delivered concurrently is processed once', async () => {
        let release;
        const cmd = addCommand({
            name: 'slow',
            execute: jest.fn(() => new Promise((r) => (release = r))),
        });
        const msg = raw({ text: '.slow' });
        const copy = structuredClone(msg);
        const sock = makeSock();

        const first = messageHandler(sock, msg);
        await new Promise((r) => setImmediate(r));
        await messageHandler(sock, copy);
        release();
        await first;

        expect(cmd.execute).toHaveBeenCalledTimes(1);
    });
});

describe('messageHandler: permissions and modes', () => {
    test('Owner category is denied for non-owner', async () => {
        const cmd = addCommand({ name: 'eval', category: 'Owner' });
        const sock = makeSock();
        await messageHandler(sock, raw({ text: '.eval' }));
        expect(cmd.execute).not.toHaveBeenCalled();
        expect(sentTexts(sock).some((t) => t.includes('Akses Ditolak'))).toBe(true);
    });

    test('Owner category runs for the configured owner', async () => {
        const cmd = addCommand({ name: 'eval', category: 'Owner' });
        await messageHandler(makeSock(), raw({ text: '.eval', chat: OWNER }));
        expect(cmd.execute).toHaveBeenCalledTimes(1);
    });

    test('Owner category runs for an owner listed in DB settings (JSON string)', async () => {
        flow.getCachedSettings.mockResolvedValue({ mode: 'public', owners: '["628222"]' });
        const cmd = addCommand({ name: 'eval', category: 'Owner' });
        await messageHandler(makeSock(), raw({ text: '.eval' }));
        expect(cmd.execute).toHaveBeenCalledTimes(1);
    });

    test('self mode: non-owner is silently ignored, owner allowed', async () => {
        flow.getCachedSettings.mockResolvedValue({ mode: 'self', owners: [] });
        const cmd = addCommand({ name: 'ping' });
        const sock = makeSock();
        await messageHandler(sock, raw({ text: '.ping' }));
        expect(cmd.execute).not.toHaveBeenCalled();
        expect(sock.sendMessage).not.toHaveBeenCalled();

        await messageHandler(sock, raw({ text: '.ping', chat: OWNER }));
        expect(cmd.execute).toHaveBeenCalledTimes(1);
    });

    test('group mode: private chat from non-owner is ignored, group allowed', async () => {
        flow.getCachedSettings.mockResolvedValue({ mode: 'group', owners: [] });
        const cmd = addCommand({ name: 'ping' });
        await messageHandler(makeSock(), raw({ text: '.ping' }));
        expect(cmd.execute).not.toHaveBeenCalled();

        await messageHandler(makeSock(), raw({ text: '.ping', chat: groupJid() }));
        expect(cmd.execute).toHaveBeenCalledTimes(1);
    });

    describe('self/group mode silences every non-command path for non-owners', () => {
        const mention = (chat) =>
            raw({
                chat,
                message: {
                    extendedTextMessage: {
                        text: '@628999 halo',
                        contextInfo: { mentionedJid: [BOT] },
                    },
                },
            });

        test('self: mention, auto-AI, AFK, buttons are skipped', async () => {
            flow.getCachedSettings.mockResolvedValue({
                mode: 'self',
                owners: [],
                autoAiPrivate: true,
            });
            const sock = makeSock();
            await messageHandler(sock, mention(groupJid()));
            await messageHandler(sock, raw({ text: 'halo bot' }));

            expect(handleDsChat).not.toHaveBeenCalled();
            expect(flow.handleAutoAiPrivate).not.toHaveBeenCalled();
            expect(flow.handleAfk).not.toHaveBeenCalled();
            expect(handleButtons).not.toHaveBeenCalled();
            expect(sock.sendMessage).not.toHaveBeenCalled();
        });

        test('self: an active game session ignores non-owner answers', async () => {
            flow.getCachedSettings.mockResolvedValue({ mode: 'self', owners: [] });
            const g = groupJid();
            const game = addCommand({ name: 'game', handleSession: jest.fn() });
            sessionManager.sessions.set(g, {
                data: { commandName: 'game' },
                lastActivity: Date.now(),
            });
            await messageHandler(makeSock(), raw({ chat: g, text: 'jawaban' }));
            expect(game.handleSession).not.toHaveBeenCalled();
        });

        test('self: group moderation still runs for non-owners', async () => {
            flow.getCachedSettings.mockResolvedValue({ mode: 'self', owners: [] });
            await messageHandler(makeSock(), raw({ chat: groupJid(), text: 'chat.whatsapp.com/x' }));
            expect(flow.handlePreProcessing).toHaveBeenCalledTimes(1);
        });

        test('self: the owner still gets mention chat paths', async () => {
            flow.getCachedSettings.mockResolvedValue({ mode: 'self', owners: [] });
            await messageHandler(makeSock(), raw({ text: 'halo', chat: OWNER }));
            expect(flow.handleAfk).toHaveBeenCalledTimes(1);
        });

        test('group: private mention reply is skipped, group mention answered', async () => {
            flow.getCachedSettings.mockResolvedValue({ mode: 'group', owners: [] });
            await messageHandler(
                makeSock(),
                raw({
                    message: {
                        extendedTextMessage: {
                            text: 'halo',
                            contextInfo: {
                                stanzaId: 'Q',
                                participant: BOT,
                                quotedMessage: { conversation: 'x' },
                            },
                        },
                    },
                })
            );
            expect(handleDsChat).not.toHaveBeenCalled();

            await messageHandler(makeSock(), mention(groupJid()));
            expect(handleDsChat).toHaveBeenCalledTimes(1);
        });
    });

    test('fromMe messages are ignored in public mode', async () => {
        const cmd = addCommand({ name: 'ping' });
        await messageHandler(makeSock(), raw({ text: '.ping', fromMe: true }));
        expect(cmd.execute).not.toHaveBeenCalled();
    });

    test('muted group: non-admin ignored, admin allowed', async () => {
        flow.getGroupSettings.mockResolvedValue({ mute: true });
        const cmd = addCommand({ name: 'ping' });
        const sock = makeSock({
            participants: [
                { id: USER, admin: null },
                { id: ADMIN, admin: 'admin' },
            ],
        });
        const g = groupJid();

        await messageHandler(sock, raw({ text: '.ping', chat: g, sender: USER }));
        expect(cmd.execute).not.toHaveBeenCalled();

        await messageHandler(sock, raw({ text: '.ping', chat: g, sender: ADMIN }));
        expect(cmd.execute).toHaveBeenCalledTimes(1);
    });

    test('RPG in a group where owner is not admin is blocked with a notice', async () => {
        const cmd = addCommand({ name: 'kerja', category: 'RPG' });
        const sock = makeSock({ participants: [{ id: USER, admin: null }] });
        await messageHandler(sock, raw({ text: '.kerja', chat: groupJid() }));
        expect(cmd.execute).not.toHaveBeenCalled();
        expect(sentTexts(sock).some((t) => t.includes('AKSES TERBATAS'))).toBe(true);
    });

    test('RPG in a group where owner is admin runs; RPG in private always runs', async () => {
        const cmd = addCommand({ name: 'kerja', category: 'RPG' });
        const sock = makeSock({ participants: [{ id: OWNER, admin: 'superadmin' }] });
        await messageHandler(sock, raw({ text: '.kerja', chat: groupJid() }));
        await messageHandler(makeSock(), raw({ text: '.kerja' }));
        expect(cmd.execute).toHaveBeenCalledTimes(2);
    });
});

describe('messageHandler: early exits and special routes', () => {
    test('status broadcast is marked read when autoStatusRead, never routed', async () => {
        flow.getCachedSettings.mockResolvedValue({ mode: 'public', autoStatusRead: true });
        const cmd = addCommand({ name: 'ping' });
        const sock = makeSock();
        await messageHandler(sock, raw({ text: '.ping', chat: 'status@broadcast', sender: USER }));
        expect(sock.readMessages).toHaveBeenCalledTimes(1);
        expect(cmd.execute).not.toHaveBeenCalled();
    });

    test('newsletter messages are ignored', async () => {
        const cmd = addCommand({ name: 'ping' });
        await messageHandler(makeSock(), raw({ text: '.ping', chat: '123@newsletter' }));
        expect(cmd.execute).not.toHaveBeenCalled();
    });

    test('active session receives non-prefixed text instead of AI/commands', async () => {
        const handleSession = jest.fn();
        addCommand({ name: 'game', handleSession });
        sessionManager.create(USER, { commandName: 'game' });

        await messageHandler(makeSock(), raw({ text: 'jawaban' }));
        expect(handleSession).toHaveBeenCalledTimes(1);
        expect(flow.handleAutoAiPrivate).not.toHaveBeenCalled();
    });

    test('prefixed text bypasses an active session', async () => {
        const handleSession = jest.fn();
        addCommand({ name: 'game', handleSession });
        const ping = addCommand({ name: 'ping' });
        sessionManager.create(USER, { commandName: 'game' });

        await messageHandler(makeSock(), raw({ text: '.ping' }));
        expect(handleSession).not.toHaveBeenCalled();
        expect(ping.execute).toHaveBeenCalledTimes(1);
    });

    test('preprocessing (antilink/antitoxic) can stop the flow', async () => {
        flow.handlePreProcessing.mockResolvedValue(true);
        const cmd = addCommand({ name: 'ping' });
        await messageHandler(makeSock(), raw({ text: '.ping', chat: groupJid() }));
        expect(cmd.execute).not.toHaveBeenCalled();
        expect(flow.handleAfk).not.toHaveBeenCalled();
    });

    test('a handled button response stops the flow', async () => {
        handleButtons.mockResolvedValue(true);
        const cmd = addCommand({ name: 'ping' });
        await messageHandler(makeSock(), raw({ text: '.ping' }));
        expect(cmd.execute).not.toHaveBeenCalled();
    });

    test('owner agent trigger can consume an owner message', async () => {
        flow.handleOwnerAgentTrigger.mockResolvedValue(true);
        await messageHandler(makeSock(), raw({ text: 'halo bot', chat: OWNER }));
        expect(flow.handleAutoAiPrivate).not.toHaveBeenCalled();
    });

    test('mentioning the bot (non-owner) routes to DS chat with mention stripped', async () => {
        const g = groupJid();
        const msg = raw({
            chat: g,
            message: {
                extendedTextMessage: {
                    text: '@628999 apa kabar',
                    contextInfo: { mentionedJid: [BOT] },
                },
            },
        });
        await messageHandler(makeSock(), msg);
        expect(handleDsChat).toHaveBeenCalledTimes(1);
        expect(handleDsChat.mock.calls[0][2]).toBe('apa kabar');
    });

    test('replying to a bot message (non-owner) routes to DS chat', async () => {
        const msg = raw({
            chat: groupJid(),
            message: {
                extendedTextMessage: {
                    text: 'lanjut dong',
                    contextInfo: {
                        stanzaId: 'Q1',
                        participant: BOT,
                        quotedMessage: { conversation: 'jawaban bot' },
                    },
                },
            },
        });
        await messageHandler(makeSock(), msg);
        expect(handleDsChat).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            'lanjut dong'
        );
    });

    test('pending server-delete confirmation is checked for owner', async () => {
        pendingServerDeletes.add(OWNER, { pteroId: 1, force: false });
        handleDeleteServerConfirmation.mockResolvedValue(true);
        const cmd = addCommand({ name: 'ping' });
        await messageHandler(makeSock(), raw({ text: '.ping', chat: OWNER }));
        expect(handleDeleteServerConfirmation).toHaveBeenCalledTimes(1);
        expect(cmd.execute).not.toHaveBeenCalled();
        pendingServerDeletes.clearAll();
    });
});

describe('messageHandler: declarative command guards', () => {
    const groupSock = (adminIds = []) =>
        makeSock({
            participants: [USER, ADMIN, BOT].map((id) => ({
                id,
                admin: adminIds.includes(id) ? 'admin' : null,
            })),
        });

    test("'group' denies private chats with a notice", async () => {
        const cmd = addCommand({ name: 'g', guards: ['group'] });
        const sock = makeSock();
        await messageHandler(sock, raw({ text: '.g' }));
        expect(cmd.execute).not.toHaveBeenCalled();
        expect(sentTexts(sock)).toContain('Perintah ini hanya bisa digunakan di dalam grup.');
    });

    test("'private' denies group chats", async () => {
        const cmd = addCommand({ name: 'p', guards: ['private'] });
        await messageHandler(makeSock(), raw({ text: '.p', chat: groupJid() }));
        expect(cmd.execute).not.toHaveBeenCalled();
    });

    test("'admin' implies group and requires the sender to be admin", async () => {
        const cmd = addCommand({ name: 'k', guards: ['admin'] });

        const priv = makeSock();
        await messageHandler(priv, raw({ text: '.k' }));
        expect(sentTexts(priv)).toContain('Perintah ini hanya bisa digunakan di dalam grup.');

        const sock = groupSock([ADMIN]);
        const g = groupJid();
        await messageHandler(sock, raw({ text: '.k', chat: g, sender: USER }));
        expect(cmd.execute).not.toHaveBeenCalled();
        expect(sentTexts(sock)).toContain('Perintah ini khusus admin grup.');

        await messageHandler(sock, raw({ text: '.k', chat: g, sender: ADMIN }));
        expect(cmd.execute).toHaveBeenCalledTimes(1);
    });

    test("'botAdmin' requires the bot to be admin", async () => {
        const cmd = addCommand({ name: 'k', guards: ['admin', 'botAdmin'] });
        const g = groupJid();

        const noBot = groupSock([ADMIN]);
        await messageHandler(noBot, raw({ text: '.k', chat: g, sender: ADMIN }));
        expect(cmd.execute).not.toHaveBeenCalled();
        expect(sentTexts(noBot)).toContain('Jadikan bot sebagai admin grup terlebih dahulu.');

        await messageHandler(groupSock([ADMIN, BOT]), raw({ text: '.k', chat: g, sender: ADMIN }));
        expect(cmd.execute).toHaveBeenCalledTimes(1);
    });

    test("'owner' guard works outside the Owner category", async () => {
        const cmd = addCommand({ name: 'o', category: 'Tools', guards: ['owner'] });
        await messageHandler(makeSock(), raw({ text: '.o' }));
        expect(cmd.execute).not.toHaveBeenCalled();
        await messageHandler(makeSock(), raw({ text: '.o', chat: OWNER }));
        expect(cmd.execute).toHaveBeenCalledTimes(1);
    });

    test('an unknown guard name blocks the command instead of silently passing', async () => {
        const cmd = addCommand({ name: 'typo', guards: ['admn'] });
        await messageHandler(makeSock(), raw({ text: '.typo' }));
        expect(cmd.execute).not.toHaveBeenCalled();
    });
});

describe('group commands declare their guards', () => {
    test.each([
        ['kick', ['admin', 'botAdmin']],
        ['add', ['admin', 'botAdmin']],
        ['promote', ['admin', 'botAdmin']],
        ['demote', ['admin', 'botAdmin']],
        ['group', ['admin', 'botAdmin']],
        // hidetag checks admin itself: the owner may use it without being an admin.
        ['hidetag', ['group']],
        ['setoption', ['admin']],
        ['setopen', ['admin']],
        ['setclose', ['admin']],
    ])('%s', async (file, guards) => {
        const { default: cmd } = await import(`../src/commands/group/${file}.js`);
        expect(cmd.guards).toEqual(guards);
    });
});

describe('messageHandler: disabled commands', () => {
    test('a disabled command is refused for non-owners (also via alias) but runs for the owner', async () => {
        flow.getCachedSettings.mockResolvedValue({
            mode: 'public',
            owners: [],
            disabledCommands: ['ping'],
        });
        const cmd = addCommand({ name: 'ping', aliases: ['p'] });

        const sock = makeSock();
        await messageHandler(sock, raw({ text: '.ping' }));
        await messageHandler(sock, raw({ text: '.p' }));
        expect(cmd.execute).not.toHaveBeenCalled();
        expect(sentTexts(sock).filter((t) => t.includes('dinonaktifkan'))).toHaveLength(2);

        await messageHandler(makeSock(), raw({ text: '.ping', chat: OWNER }));
        expect(cmd.execute).toHaveBeenCalledTimes(1);
    });
});
