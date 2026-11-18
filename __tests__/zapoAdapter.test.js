import { EventEmitter } from 'node:events';
import { jest } from '@jest/globals';
import { createZapoFacade, sanitizeCustomNodes } from '../src/wa/zapoAdapter.js';

const makeFacade = () => {
    const zapo = new EventEmitter();
    Object.assign(zapo, {
        getState: jest.fn(() => ({ registered: false })),
        getCredentials: jest.fn(() => null),
        connect: jest.fn(async () => {}),
        disconnect: jest.fn(async () => {}),
        logout: jest.fn(async () => {}),
        message: {
            send: jest.fn(async () => ({ id: 'sent-id' })),
            upload: jest.fn(async () => ({
                url: 'https://cdn.test/media',
                directPath: '/media',
                mediaKey: Buffer.from('key'),
                fileEncSha256: Buffer.from('enc'),
                fileSha256: Buffer.from('sha'),
                fileLength: 42,
                mediaKeyTimestamp: 123,
            })),
            download: jest.fn(),
            downloadToFile: jest.fn(),
            sendReceipt: jest.fn(),
        },
        presence: {
            send: jest.fn(),
            sendChatstate: jest.fn(),
            subscribe: jest.fn(async () => {}),
        },
        newsletter: {
            fetch: jest.fn(),
            fetchByInvite: jest.fn(),
        },
        group: {
            addParticipants: jest.fn(),
            removeParticipants: jest.fn(),
            promoteParticipants: jest.fn(),
            demoteParticipants: jest.fn(),
            queryGroupMetadata: jest.fn(),
            queryAllGroups: jest.fn(),
        },
        profile: { getProfilePicture: jest.fn() },
    });
    const store = { destroy: jest.fn(async () => {}) };
    return { zapo, store, facade: createZapoFacade({ zapo, store, reconnect: false }) };
};

const once = (emitter, event) => new Promise((resolve) => emitter.once(event, resolve));

describe('Zapo Baileys facade', () => {
    test('forwards image externalAdReply through raw Zapo context info', async () => {
        const { zapo, facade } = makeFacade();
        const image = Buffer.from('image');
        const thumbnail = Buffer.from('thumbnail');
        const quoted = {
            key: { remoteJid: 'chat@s.whatsapp.net', id: 'quoted-id', fromMe: false },
        };
        const externalAdReply = {
            title: 'Kartu Tanda Player',
            body: 'RPG Nusantara',
            mediaType: 1,
            thumbnail,
            renderLargerThumbnail: true,
            sourceUrl: '',
        };

        await facade.sendMessage(
            'chat@s.whatsapp.net',
            {
                image,
                mimetype: 'image/png',
                caption: 'Profil player',
                contextInfo: { externalAdReply },
            },
            { quoted }
        );

        expect(zapo.message.send).toHaveBeenCalledWith(
            'chat@s.whatsapp.net',
            {
                type: 'image',
                media: image,
                mimetype: 'image/png',
                caption: 'Profil player',
                fileName: undefined,
                ptt: undefined,
                gifPlayback: undefined,
                seconds: undefined,
            },
            {
                quote: quoted.key,
                mentions: undefined,
                contextInfo: { raw: { externalAdReply } },
            }
        );
    });

    test('creates fresh poll secret and exposes it in sent message', async () => {
        const { zapo, facade } = makeFacade();
        const result = await facade.sendMessage('chat@s.whatsapp.net', {
            poll: { name: 'Pick', values: ['A', 'B'], selectableCount: 1 },
        });

        const [jid, content, options] = zapo.message.send.mock.calls[0];
        expect(jid).toBe('chat@s.whatsapp.net');
        expect(content).toEqual({
            type: 'poll',
            name: 'Pick',
            options: ['A', 'B'],
            selectableCount: 1,
        });
        expect(options.messageSecret).toBeInstanceOf(Buffer);
        expect(options.messageSecret).toHaveLength(32);
        expect(result.message.messageContextInfo.messageSecret).toBe(options.messageSecret);
    });

    test('relays custom nodes, attributes, and raw proto content', async () => {
        const { zapo, facade } = makeFacade();
        const message = { conversation: 'raw proto' };
        const customNodes = [{ tag: 'biz', attrs: { v: '1' } }];
        const additionalAttributes = { category: 'peer' };

        await facade.relayMessage('chat@s.whatsapp.net', message, {
            messageId: 'provided-id',
            additionalNodes: customNodes,
            additionalAttributes,
        });

        expect(zapo.message.send).toHaveBeenCalledWith('chat@s.whatsapp.net', message, {
            id: 'provided-id',
            customNodes,
            additionalAttributes,
        });
    });

    test('forces AI Rich payloads onto a text stanza', async () => {
        const { zapo, facade } = makeFacade();
        const message = {
            botForwardedMessage: {
                message: {
                    richResponseMessage: {
                        messageType: 1,
                        submessages: [{ messageType: 2, messageText: 'AI Rich' }],
                    },
                },
            },
        };

        const result = await facade.relayMessage('group@g.us', message, {
            messageId: 'ai-rich-id',
        });

        expect(zapo.message.send).toHaveBeenCalledWith(
            'group@g.us',
            { conversation: 'AI Rich', ...message },
            {
                id: 'ai-rich-id',
                customNodes: undefined,
                additionalAttributes: undefined,
            }
        );
        expect(result.message.conversation).toBe('AI Rich');
    });

    test('uses protocol revoke target key', async () => {
        const { zapo, facade } = makeFacade();
        const target = { remoteJid: 'chat@s.whatsapp.net', id: 'target-id', fromMe: true };

        await facade.sendMessage('chat@s.whatsapp.net', { delete: target });

        expect(zapo.message.send.mock.calls[0][1]).toEqual({ type: 'revoke', target });
    });

    test('emits protocol revoke against protocol target key', async () => {
        const { zapo, facade } = makeFacade();
        const target = { remoteJid: 'chat@s.whatsapp.net', id: 'target-id', fromMe: true };
        const update = once(facade.ev, 'messages.update');

        zapo.emit('message_protocol', {
            key: { remoteJid: 'wrong@s.whatsapp.net', id: 'event-id' },
            protocolMessage: { type: 0, key: target },
        });

        expect(await update).toEqual([
            {
                key: target,
                update: {
                    status: 'deleted',
                    message: { protocolMessage: { type: 0, key: target } },
                },
            },
        ]);
    });

    test('maps addon poll vote and selected option names', async () => {
        const { zapo, facade } = makeFacade();
        const key = { remoteJid: 'group@g.us', participant: 'voter@s.whatsapp.net', id: 'vote-id' };
        const upsert = once(facade.ev, 'messages.upsert');

        zapo.emit('message_addon', {
            key,
            kind: 'poll_vote',
            targetMessageId: 'poll-id',
            decrypted: {
                pollVote: { selectedOptions: [Buffer.from('hash')] },
                selectedOptionNames: ['A'],
            },
            raw: { pollUpdateMessage: {} },
        });

        const event = await upsert;
        expect(event.messages[0].message.pollUpdateMessage).toEqual({
            pollCreationMessageKey: {
                remoteJid: 'group@g.us',
                id: 'poll-id',
                fromMe: false,
                participant: 'voter@s.whatsapp.net',
            },
            vote: { selectedOptions: [Buffer.from('hash')] },
            selectedOptionNames: ['A'],
        });
    });

    test('maps newsletter metadata and remembers sender name', async () => {
        const { zapo, facade } = makeFacade();
        zapo.newsletter.fetch.mockResolvedValue({
            jid: 'news@newsletter',
            invite: 'invite-code',
            state: 'active',
            name: 'Daily News',
            description: 'Updates',
            subscribersCount: 12,
            creationTime: 34,
            picture: { url: 'picture-url' },
        });

        zapo.emit('message', {
            key: { remoteJid: 'sender@s.whatsapp.net' },
            message: { conversation: 'hi' },
            timestampSeconds: 1,
            pushName: ' Sender Name ',
        });
        const metadata = await facade.newsletterMetadata('jid', 'news@newsletter');

        expect(facade.getName('sender@s.whatsapp.net')).toBe('Sender Name');
        expect(metadata).toMatchObject({
            id: 'news@newsletter',
            inviteCode: 'invite-code',
            state: { type: 'active' },
            name: 'Daily News',
            picture: 'picture-url',
            thread_metadata: {
                id: 'news@newsletter',
                name: { text: 'Daily News' },
                description: { text: 'Updates' },
                subscribers_count: '12',
                creation_time: '34',
                state: { type: 'active' },
            },
        });
        expect(facade.getName('fallback@s.whatsapp.net')).toBe('fallback');
    });

    test('replays presence subscriptions when connection opens', async () => {
        const { zapo, facade } = makeFacade();
        await facade.presenceSubscribe('chat@s.whatsapp.net');

        zapo.emit('connection', { status: 'open' });
        await Promise.resolve();

        expect(zapo.presence.subscribe).toHaveBeenCalledTimes(2);
        expect(zapo.presence.subscribe).toHaveBeenLastCalledWith('chat@s.whatsapp.net');
    });

    test('delegates connect and maps upload result', async () => {
        const { zapo, facade } = makeFacade();
        await facade.connect();
        const uploaded = await facade.waUploadToServer(Buffer.from('file'), {
            mediaType: 'image',
            mimetype: 'image/png',
        });

        expect(zapo.connect).toHaveBeenCalledTimes(1);
        expect(zapo.message.upload).toHaveBeenCalledWith(Buffer.from('file'), {
            type: 'image',
            mimetype: 'image/png',
        });
        expect(uploaded).toEqual({
            mediaUrl: 'https://cdn.test/media',
            directPath: '/media',
            mediaKey: Buffer.from('key'),
            fileEncSha256: Buffer.from('enc'),
            fileSha256: Buffer.from('sha'),
            fileLength: 42,
            mediaKeyTimestamp: 123,
        });
    });

    test('maps participant results to Baileys status strings', async () => {
        const { zapo, facade } = makeFacade();
        zapo.group.addParticipants.mockResolvedValue([
            { status: 'ok', jid: 'one@s.whatsapp.net', raw: { accepted: true } },
            { status: 'error', code: 403, jid: 'two@s.whatsapp.net', raw: { accepted: false } },
        ]);

        await expect(
            facade.groupParticipantsUpdate(
                'group@g.us',
                ['one@s.whatsapp.net', 'two@s.whatsapp.net'],
                'add'
            )
        ).resolves.toEqual([
            { status: '200', jid: 'one@s.whatsapp.net', content: { accepted: true } },
            { status: '403', jid: 'two@s.whatsapp.net', content: { accepted: false } },
        ]);
    });

    test('attaches required compatibility decorators and static facade surface', () => {
        const { facade } = makeFacade();
        const requiredKeys = [
            'connect',
            'sendMessage',
            'relayMessage',
            'waUploadToServer',
            'groupParticipantsUpdate',
            'newsletterMetadata',
            'presenceSubscribe',
            'sendGroupStatus',
            'sendListMessage',
            'sendInteractiveList',
            'sendInteractiveButtons',
            'groupMetadata',
        ];

        expect(requiredKeys.filter((key) => typeof facade[key] !== 'function')).toEqual([]);
        expect(facade).toMatchObject({
            transport: 'zapo',
            __groupStatusCompatAttached: true,
            __listMessageCompatAttached: true,
            __groupMetadataPatchAttached: true,
        });
    });
});

describe('requestPairingCodeWhenNeeded', () => {
    const makeZapo = ({ registered = false, request } = {}) => {
        const zapo = new EventEmitter();
        zapo.getState = () => ({ registered });
        zapo.auth = { requestPairingCode: request || jest.fn(async () => 'ABCD1234') };
        return zapo;
    };
    const flush = () => new Promise((r) => setImmediate(r));

    test('requests a code once when pairing is required, even if QR events follow', async () => {
        const { requestPairingCodeWhenNeeded } = await import('../src/wa/zapoAdapter.js');
        const zapo = makeZapo();
        requestPairingCodeWhenNeeded(zapo, '628000000001');
        zapo.emit('auth_pairing_required');
        zapo.emit('auth_qr', { qr: 'x' });
        zapo.emit('auth_qr', { qr: 'y' });
        await flush();
        expect(zapo.auth.requestPairingCode).toHaveBeenCalledTimes(1);
        expect(zapo.auth.requestPairingCode).toHaveBeenCalledWith('628000000001');
    });

    test('does nothing for an already registered session', async () => {
        const { requestPairingCodeWhenNeeded } = await import('../src/wa/zapoAdapter.js');
        const zapo = makeZapo({ registered: true });
        requestPairingCodeWhenNeeded(zapo, '628000000001');
        zapo.emit('auth_pairing_required');
        await flush();
        expect(zapo.auth.requestPairingCode).not.toHaveBeenCalled();
    });

    test('retries on the next event after a failed request', async () => {
        const { requestPairingCodeWhenNeeded } = await import('../src/wa/zapoAdapter.js');
        const request = jest
            .fn()
            .mockRejectedValueOnce(new Error('not ready'))
            .mockResolvedValue('ABCD1234');
        const zapo = makeZapo({ request });
        const errors = [];
        zapo.on('auth_pairing_error', (e) => errors.push(e.message));
        requestPairingCodeWhenNeeded(zapo, '628000000001');
        zapo.emit('auth_qr', { qr: 'x' });
        await flush();
        zapo.emit('auth_qr', { qr: 'y' });
        await flush();
        expect(request).toHaveBeenCalledTimes(2);
        expect(errors).toEqual(['not ready']);
    });
});

/**
 * Interactive-message stanza nodes, as verified on phones on 2026-11-18
 * (.btntest): duplicate <biz> → dropped; <bot biz_bot> → dropped in private
 * chats; a carousel without <biz> → dropped.
 */
describe('interactive message nodes on zapo', () => {
    const biz = { tag: 'biz', attrs: {}, content: [] };
    const bot = { tag: 'bot', attrs: { biz_bot: '1' } };
    const nativeFlow = (button) => ({
        viewOnceMessage: {
            message: {
                interactiveMessage: {
                    body: { text: 'x' },
                    nativeFlowMessage: { buttons: [{ name: button, buttonParamsJson: '{}' }] },
                },
            },
        },
    });
    const carousel = {
        viewOnceMessage: {
            message: { interactiveMessage: { carouselMessage: { cards: [] } } },
        },
    };

    test.each(['single_select', 'quick_reply'])(
        '%s: drops the caller <biz> (zapo adds its own) and the <bot> node',
        (button) => {
            expect(sanitizeCustomNodes(nativeFlow(button), [biz, bot])).toBeUndefined();
        }
    );

    test('list and buttons messages: zapo adds <biz>, so the caller one goes', () => {
        expect(sanitizeCustomNodes({ listMessage: {} }, [biz])).toBeUndefined();
        expect(sanitizeCustomNodes({ buttonsMessage: {} }, [biz])).toBeUndefined();
    });

    test('carousel: keeps the caller <biz> (zapo adds none), drops <bot>', () => {
        expect(sanitizeCustomNodes(carousel, [biz, bot])).toEqual([biz]);
    });

    test('other nodes on interactive messages are kept', () => {
        const meta = { tag: 'meta', attrs: { x: '1' } };
        expect(sanitizeCustomNodes(nativeFlow('quick_reply'), [biz, meta])).toEqual([meta]);
    });

    test('non-interactive messages keep every node unchanged', () => {
        const nodes = [biz, bot];
        expect(sanitizeCustomNodes({ conversation: 'hi' }, nodes)).toBe(nodes);
        expect(sanitizeCustomNodes({ conversation: 'hi' }, undefined)).toBeUndefined();
    });

    test('relayMessage sends the sanitized nodes (the .yts shape)', async () => {
        const { zapo, facade } = makeFacade();
        await facade.relayMessage('chat@s.whatsapp.net', carousel, {
            messageId: 'yts-id',
            additionalNodes: [biz, bot],
        });
        expect(zapo.message.send.mock.calls[0][2].customNodes).toEqual([biz]);
    });
});
