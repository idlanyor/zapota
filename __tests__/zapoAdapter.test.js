import { EventEmitter } from 'node:events';
import { jest } from '@jest/globals';
import { createZapoFacade } from '../src/wa/zapoAdapter.js';

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
        expect(content).toEqual({ type: 'poll', name: 'Pick', options: ['A', 'B'], selectableCount: 1 });
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
