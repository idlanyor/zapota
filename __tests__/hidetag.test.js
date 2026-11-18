import { jest } from '@jest/globals';
import hidetag from '../src/commands/group/hidetag.js';

const GROUP = '120363000000000001@g.us';
const ADMIN = '628000000002@s.whatsapp.net';
const MEMBER = '628000000003@s.whatsapp.net';
const ADMIN_LID = '222@lid';

const participants = [
    { id: ADMIN, lid: ADMIN_LID, admin: 'admin' },
    { id: MEMBER, admin: null },
];

const setup = (m = {}) => {
    const sock = {
        groupMetadata: jest.fn().mockResolvedValue({ participants }),
        sendMessage: jest.fn().mockResolvedValue({}),
    };
    const msg = { chat: GROUP, isGroup: true, reply: jest.fn(), ...m };
    return { sock, msg };
};

test('an admin tags everyone', async () => {
    const { sock, msg } = setup({ sender: ADMIN });
    await hidetag.execute(sock, msg, ['halo'], 'halo');
    expect(sock.sendMessage).toHaveBeenCalledWith(GROUP, {
        text: 'halo',
        mentions: [ADMIN, MEMBER],
    });
});

test('an admin addressed by LID is recognised', async () => {
    const { sock, msg } = setup({ sender: ADMIN_LID });
    await hidetag.execute(sock, msg, [], '');
    expect(sock.sendMessage).toHaveBeenCalledTimes(1);
});

test('a non-admin is refused', async () => {
    const { sock, msg } = setup({ sender: MEMBER });
    await hidetag.execute(sock, msg, ['halo'], 'halo');
    expect(sock.sendMessage).not.toHaveBeenCalled();
    expect(msg.reply).toHaveBeenCalledWith('Perintah ini khusus admin grup.');
});

test('the bot owner may use it without being an admin', async () => {
    const { sock, msg } = setup({ sender: '628000000001@s.whatsapp.net', isOwner: true });
    await hidetag.execute(sock, msg, ['halo'], 'halo');
    expect(sock.sendMessage).toHaveBeenCalledTimes(1);
});

test('a replied image is re-sent with everyone mentioned', async () => {
    const quoted = {
        isImage: true,
        text: 'lihat ini',
        download: jest.fn().mockResolvedValue(Buffer.from('IMG')),
    };
    const { sock, msg } = setup({ sender: ADMIN, quoted });
    await hidetag.execute(sock, msg, [], '');
    expect(sock.sendMessage).toHaveBeenCalledWith(GROUP, {
        image: Buffer.from('IMG'),
        caption: 'lihat ini',
        mentions: [ADMIN, MEMBER],
    });
});
