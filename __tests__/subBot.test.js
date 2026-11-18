/**
 * Sub-bot (jadibot) behavior through the real message pipeline:
 * tier rules, owner isolation, main-bot-only commands, group silence.
 */
import { jest } from '@jest/globals';

const OWNER = '628000000001@s.whatsapp.net';
const MAIN_BOT = '628000000009@s.whatsapp.net';
const SUB_BOT = '628000000004@s.whatsapp.net';
const USER = '628000000002@s.whatsapp.net';

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
const noop = () => {};
const logger = new Proxy({}, { get: () => noop });

jest.unstable_mockModule('../src/handlers/messageFlow.js', () => flow);
jest.unstable_mockModule('../src/commands/ai/ds.js', () => ({ handleDsChat: jest.fn() }));
jest.unstable_mockModule('../src/handlers/buttonHandler.js', () => ({
    handleButtons: jest.fn().mockResolvedValue(false),
}));
jest.unstable_mockModule('../src/middlewares/deleteServer.js', () => ({
    handleDeleteServerConfirmation: jest.fn(),
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
const { registerSubBot, setMainSocketGetter, getBotProfile } =
    await import('../src/lib/botProfile.js');
const { checkOwner } = await import('../src/middlewares/auth.js');

let seq = 0;
const uid = () => `SUB${Date.now()}${++seq}`;
const groupJid = () => `120363${++seq}@g.us`;

const makeSock = (jid, { participants = [] } = {}) => ({
    user: { id: jid.replace('@', ':7@') },
    sendMessage: jest.fn().mockImplementation(async () => ({ key: { id: uid() } })),
    sendPresenceUpdate: jest.fn().mockResolvedValue(),
    readMessages: jest.fn().mockResolvedValue(),
    groupMetadata: jest.fn().mockResolvedValue({ subject: 'G', participants }),
});

const subBot = (tier, opts) => {
    const sock = makeSock(SUB_BOT, opts);
    const sendMock = sock.sendMessage;
    registerSubBot(sock, { number: '628000000004', tier });
    return { sock, sendMock };
};

const raw = ({ text, chat = USER, sender, fromMe = false, id = uid() } = {}) => ({
    key: {
        id,
        remoteJid: chat,
        fromMe,
        ...(chat.endsWith('@g.us') ? { participant: fromMe ? SUB_BOT : sender || USER } : {}),
    },
    pushName: 'Tester',
    message: { conversation: text },
});

const addCommand = (cmd) => {
    const full = { aliases: [], category: 'General', execute: jest.fn(), ...cmd };
    commands.set(full.name, full);
    return full;
};

const replies = (mock) => mock.mock.calls.map(([, c]) => c?.text).filter(Boolean);

const mainSock = makeSock(MAIN_BOT);

beforeEach(() => {
    jest.clearAllMocks();
    commands.clear();
    flow.getCachedSettings.mockResolvedValue({ mode: 'public', owners: [] });
    flow.getGroupSettings.mockResolvedValue({});
    flow.handleOwnerAgentTrigger.mockResolvedValue(false);
    setMainSocketGetter(() => mainSock);
});

describe('free sub-bot', () => {
    test('answers its owner (typed on the linked phone) in a private chat', async () => {
        const cmd = addCommand({ name: 'ping' });
        const { sock } = subBot('free');
        await messageHandler(sock, raw({ text: '.ping', chat: USER, fromMe: true }));
        expect(cmd.execute).toHaveBeenCalledTimes(1);
    });

    test("stays out of its owner's chat with the main bot (phone and LID address)", async () => {
        const cmd = addCommand({ name: 'ping' });
        const { sock } = subBot('premium');
        await messageHandler(sock, raw({ text: '.ping', chat: MAIN_BOT, fromMe: true }));

        const viaLid = raw({ text: '.ping', chat: '999000@lid', fromMe: true });
        viaLid.key.remoteJidAlt = MAIN_BOT;
        await messageHandler(sock, viaLid);

        mainSock.user.lid = '999001@lid';
        await messageHandler(sock, raw({ text: '.ping', chat: '999001@lid', fromMe: true }));
        delete mainSock.user.lid;

        expect(cmd.execute).not.toHaveBeenCalled();
    });

    test('ignores other people, even in private chats', async () => {
        const cmd = addCommand({ name: 'ping' });
        const { sock } = subBot('free');
        await messageHandler(sock, raw({ text: '.ping', chat: USER }));
        expect(cmd.execute).not.toHaveBeenCalled();
    });

    test('ignores groups, even its owner', async () => {
        const cmd = addCommand({ name: 'ping' });
        const { sock } = subBot('free');
        await messageHandler(sock, raw({ text: '.ping', chat: groupJid(), fromMe: true }));
        expect(cmd.execute).not.toHaveBeenCalled();
    });

    test('never treats its own replies as input', async () => {
        const cmd = addCommand({ name: 'ping' });
        const { sock } = subBot('free');
        const sent = await sock.sendMessage(USER, { text: '.ping' });
        await messageHandler(sock, raw({ text: '.ping', fromMe: true, id: sent.key.id }));
        expect(cmd.execute).not.toHaveBeenCalled();
    });

    test('group management is premium only', async () => {
        const cmd = addCommand({ name: 'hidetag', category: 'Group' });
        const { sock, sendMock } = subBot('free');
        await messageHandler(sock, raw({ text: '.hidetag', fromMe: true }));
        expect(cmd.execute).not.toHaveBeenCalled();
        expect(replies(sendMock).join()).toMatch(/Premium/);
    });

    test('does not auto-answer with AI', async () => {
        const { sock } = subBot('premium');
        await messageHandler(sock, raw({ text: 'halo' }));
        expect(flow.handleAutoAiPrivate).not.toHaveBeenCalled();
    });
});

describe('sub-bot owner is not a server owner', () => {
    test("the sub-bot's own number is not an owner; the main bot's is", () => {
        const { sock } = subBot('premium');
        const m = { sender: SUB_BOT, key: { remoteJid: USER }, isGroup: false };
        expect(checkOwner(m, sock, {})).toBe(false);
        expect(checkOwner({ ...m, sender: MAIN_BOT }, mainSock, {})).toBe(true);
    });

    test('owner-guarded commands are refused even in self mode', async () => {
        flow.getCachedSettings.mockResolvedValue({ mode: 'self', owners: [] });
        const cmd = addCommand({ name: 'secret', category: 'Tools', guards: ['owner'] });
        const { sock } = subBot('premium');
        await messageHandler(sock, raw({ text: '.secret', fromMe: true }));
        expect(cmd.execute).not.toHaveBeenCalled();
    });

    test.each([
        ['Owner category', { name: 'eval', category: 'Owner' }],
        ['Jadibot category', { name: 'jadibot', category: 'Jadibot' }],
        ['payment command', { name: 'store', category: 'Utility' }],
    ])('%s only runs on the main bot', async (_, def) => {
        const cmd = addCommand(def);
        const { sock, sendMock } = subBot('premium');
        await messageHandler(sock, raw({ text: `.${def.name}`, fromMe: true }));
        expect(cmd.execute).not.toHaveBeenCalled();
        expect(replies(sendMock).join()).toMatch(/bot utama/);
    });

    test('main-bot errors are reported through the main bot, not the user number', async () => {
        addCommand({
            name: 'boom',
            execute: jest.fn().mockRejectedValue(new Error('kaboom')),
        });
        const { sock, sendMock } = subBot('premium');
        await messageHandler(sock, raw({ text: '.boom', fromMe: true }));
        expect(mainSock.sendMessage).toHaveBeenCalledWith(
            OWNER,
            expect.objectContaining({ text: expect.stringContaining('kaboom') })
        );
        expect(sendMock.mock.calls.some(([jid]) => jid === OWNER)).toBe(false);
    });
});

describe('premium sub-bot', () => {
    test('answers everyone in private chats', async () => {
        const cmd = addCommand({ name: 'ping' });
        const { sock } = subBot('premium');
        await messageHandler(sock, raw({ text: '.ping' }));
        expect(cmd.execute).toHaveBeenCalledTimes(1);
    });

    test('works in groups without the main bot, including group management', async () => {
        const cmd = addCommand({ name: 'hidetag', category: 'Group' });
        const { sock } = subBot('premium', { participants: [{ id: USER }, { id: SUB_BOT }] });
        await messageHandler(sock, raw({ text: '.hidetag', chat: groupJid() }));
        expect(cmd.execute).toHaveBeenCalledTimes(1);
    });

    test('stays silent in groups the main bot is in', async () => {
        const cmd = addCommand({ name: 'ping' });
        const { sock, sendMock } = subBot('premium', {
            participants: [{ id: USER }, { id: SUB_BOT }, { id: MAIN_BOT }],
        });
        await messageHandler(sock, raw({ text: '.ping', chat: groupJid() }));
        expect(cmd.execute).not.toHaveBeenCalled();
        expect(sendMock).not.toHaveBeenCalled();
    });

    test('a tier change applies to the live socket immediately', async () => {
        const cmd = addCommand({ name: 'ping' });
        const { sock } = subBot('premium');
        getBotProfile(sock).tier = 'free';
        await messageHandler(sock, raw({ text: '.ping' }));
        expect(cmd.execute).not.toHaveBeenCalled();
    });
});

describe('main bot and sub-bot share a chat', () => {
    test('the same message id is handled by each socket', async () => {
        let release;
        const gate = new Promise((r) => (release = r));
        const cmd = addCommand({ name: 'slow', execute: jest.fn(() => gate) });
        const chat = groupJid();
        const { sock } = subBot('premium', { participants: [{ id: USER }, { id: SUB_BOT }] });
        const message = raw({ text: '.slow', chat });
        const copy = structuredClone(message);

        const first = messageHandler(mainSock, message);
        const second = messageHandler(sock, copy);
        await new Promise((r) => setTimeout(r, 20));
        release();
        await Promise.all([first, second]);
        expect(cmd.execute).toHaveBeenCalledTimes(2);
    });
});
