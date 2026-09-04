import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createMediaProcessor } from '@zapo-js/media-utils';
import { createSqliteStore } from '@zapo-js/store-sqlite';
import { createNoopLogger, createStore, WaClient } from 'zapo-js';
import { attachGroupMetadataPatch } from '../lib/groupMetadataPatch.js';
import { attachGroupStatusCompat } from '../lib/groupStatusCompat.js';
import { attachListMessageCompat } from '../lib/listMessageCompat.js';

const PROVIDERS = {
    auth: 'sqlite',
    signal: 'sqlite',
    preKey: 'sqlite',
    session: 'sqlite',
    identity: 'sqlite',
    senderKey: 'sqlite',
    appState: 'sqlite',
    privacyToken: 'sqlite',
    messages: 'sqlite',
    threads: 'sqlite',
    contacts: 'sqlite',
};

const CACHE_PROVIDERS = {
    retry: 'sqlite',
    groupMetadata: 'sqlite',
    chatMetadata: 'sqlite',
    deviceList: 'sqlite',
    messageSecret: 'sqlite',
};

const STATUS_CODES = {
    stream_error_replaced: 440,
    stream_error_device_removed: 401,
    stream_error_force_logout: 401,
    failure_not_authorized: 401,
    failure_locked: 403,
    failure_banned: 403,
    failure_client_too_old: 405,
    failure_service_unavailable: 503,
    stream_error_force_login: 515,
};

const asKey = (value) => value?.key || value;

const mediaSource = async (value) => {
    const source = value?.url ?? value;
    if (typeof source !== 'string' || !/^https?:\/\//i.test(source)) return source;
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Media download failed: HTTP ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
};

const zapoOptions = (content, options) => {
    const quoted = options?.quoted || content?.quoted;
    const rawContextInfo = {
        ...(content?.contextInfo || {}),
        ...(options?.contextInfo || {}),
    };
    const result = {
        quote: quoted ? asKey(quoted) : undefined,
        mentions: options?.mentions || content?.mentions,
        contextInfo:
            Object.keys(rawContextInfo).length > 0 ? { raw: rawContextInfo } : undefined,
    };
    if (content?.edit) result.editKey = asKey(content.edit);
    return result;
};

const zapoContent = async (content) => {
    if (typeof content === 'string') return content;
    if (!content || typeof content !== 'object')
        throw new TypeError('Message content must be an object or string');

    if (typeof content.text === 'string') return { type: 'text', text: content.text };
    if (content.react) {
        return {
            type: 'reaction',
            emoji: content.react.text || '',
            target: asKey(content.react.key),
        };
    }
    if (content.delete) return { type: 'revoke', target: asKey(content.delete) };
    if (content.poll) {
        return {
            type: 'poll',
            name: content.poll.name,
            options: content.poll.values || content.poll.options || [],
            selectableCount: content.poll.selectableCount,
        };
    }

    for (const type of ['image', 'video', 'audio', 'document', 'sticker']) {
        if (content[type] == null) continue;
        return {
            type,
            media: await mediaSource(content[type]),
            mimetype: content.mimetype,
            caption: content.caption,
            fileName: content.fileName,
            ptt: content.ptt,
            gifPlayback: content.gifPlayback,
            seconds: content.seconds,
        };
    }

    if (content.groupInvite) {
        return {
            groupInviteMessage: {
                groupJid: content.groupInvite.jid,
                inviteCode: content.groupInvite.inviteCode,
                inviteExpiration: content.groupInvite.inviteExpiration,
                groupName: content.groupInvite.subject,
                caption: content.groupInvite.text,
            },
        };
    }

    return content;
};

const ensureAiRichTextEnvelope = (message, options = {}) => {
    if (options?.raw || options?.rawMessage) return message;
    const richResponse =
        message?.richResponseMessage ||
        message?.botForwardedMessage?.message?.richResponseMessage;

    if (!richResponse || message?.conversation != null || richResponse?.unifiedResponse)
        return message;

    const fallbackText = (richResponse.submessages || [])
        .flatMap((submessage) => {
            if (submessage?.messageText) return [submessage.messageText];
            const code = submessage?.codeMetadata?.codeBlocks
                ?.map((block) => block.codeContent || '')
                .join('');
            return code ? [`\`\`\`${submessage.codeMetadata.codeLanguage || ''}\n${code}\n\`\`\``] : [];
        })
        .join('\n\n');

    // zapo-js currently does not classify AI Rich / bot-forwarded payloads as
    // text stanzas. The conversation fallback forces the correct stanza type;
    // clients that support AI Rich render the richer field, while older clients
    // still receive readable content instead of a blank message.
    return { conversation: fallbackText || 'AI Rich response', ...message };
};

const baileysMessage = (event) => ({
    key: { ...event.key },
    message: event.message,
    messageTimestamp: event.timestampSeconds,
    pushName: event.pushName,
    broadcast: event.key.isBroadcast,
    participant: event.key.participant,
    rawNode: event.rawNode,
    __zapoEvent: event,
});

const baileysGroup = (metadata) => ({
    ...metadata,
    id: metadata.jid,
    participants: metadata.participants.map((participant) => ({
        ...participant,
        id: participant.jid,
        admin: participant.isSuperAdmin ? 'superadmin' : participant.isAdmin ? 'admin' : null,
    })),
});

const baileysParticipantResults = (results) =>
    results.map((result) => ({
        status: result.status === 'ok' ? '200' : String(result.code),
        jid: result.jid,
        content: result.raw,
    }));

const baileysNewsletterMetadata = (metadata) => ({
    id: metadata.jid,
    jid: metadata.jid,
    inviteCode: metadata.invite,
    state: { type: metadata.state },
    name: metadata.name,
    nameUpdateTime: metadata.nameUpdateTime,
    description: metadata.description,
    subscribersCount: metadata.subscribersCount,
    verification: metadata.verification,
    picture: metadata.picture?.url,
    preview: metadata.preview?.url,
    creation_time: metadata.creationTime,
    thread_metadata: {
        id: metadata.jid,
        name: { text: metadata.name },
        description: { text: metadata.description },
        subscribers_count: String(metadata.subscribersCount ?? ''),
        creation_time: String(metadata.creationTime ?? ''),
        state: { type: metadata.state },
    },
    viewer_metadata: metadata.viewerRole
        ? {
              role: metadata.viewerRole,
              mute_admin: metadata.mutedAdmin,
              mute_follower: metadata.mutedFollower,
          }
        : undefined,
});

const disconnectError = (event) => {
    const statusCode = event.code ?? STATUS_CODES[event.reason] ?? (event.isLogout ? 401 : 500);
    const error = new Error(event.reason || 'Zapo connection closed');
    error.output = { statusCode, payload: { statusCode, error: event.reason } };
    return error;
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const generateMessageTag = () => `${Date.now()}.--${randomBytes(8).toString('base64url')}`;

export const createZapoFacade = ({
    zapo,
    store,
    sessionId = 'default',
    reconnect = true,
    reconnectBaseMs = 1_000,
    reconnectMaxMs = 30_000,
}) => {
    if (!zapo || !store) throw new TypeError('zapo and store are required');
    if (!sessionId || typeof sessionId !== 'string')
        throw new TypeError('sessionId must be a stable non-empty string');

    const ev = new EventEmitter();
    const names = new Map();
    const presenceSubscriptions = new Set();
    let stopped = false;
    let destroyed = false;
    let reconnectAttempt = 0;
    let reconnectTask;

    const facade = {
        ev,
        transport: 'zapo',
        authState: { creds: { registered: zapo.getState().registered } },
        user: {},
        message: {
            download: (source, options) => zapo.message.download(source, options),
            downloadToFile: (source, filePath, options) =>
                zapo.message.downloadToFile(source, filePath, options),
        },
        connect: () => zapo.connect(),
        sendMessage: async (jid, content, options = {}) => {
            const converted = await zapoContent(content);
            const sendOptions = zapoOptions(content, options);
            const messageSecret = content?.poll ? randomBytes(32) : undefined;
            if (messageSecret) sendOptions.messageSecret = messageSecret;
            const result = await zapo.message.send(jid, converted, sendOptions);
            const message = messageSecret
                ? { ...converted, messageContextInfo: { messageSecret } }
                : converted;
            return {
                key: { remoteJid: jid, fromMe: true, id: result.id },
                message,
                messageTimestamp: Math.floor(Date.now() / 1000),
            };
        },
        relayMessage: async (jid, message, options = {}) => {
            const messageToSend = ensureAiRichTextEnvelope(message, options);
            const result = await zapo.message.send(jid, messageToSend, {
                id: options.messageId,
                customNodes: options.additionalNodes ?? options.customNodes,
                additionalAttributes: options.additionalAttributes,
            });
            return {
                key: { remoteJid: jid, fromMe: true, id: result.id },
                message: messageToSend,
            };
        },
        generateMessageTag,
        waUploadToServer: async (source, options = {}) => {
            const media = await zapo.message.upload(source, {
                type: options.mediaType || options.type || 'document',
                mimetype: options.mimetype,
            });
            return {
                mediaUrl: media.url,
                directPath: media.directPath,
                mediaKey: media.mediaKey,
                fileEncSha256: media.fileEncSha256,
                fileSha256: media.fileSha256,
                fileLength: media.fileLength,
                mediaKeyTimestamp: media.mediaKeyTimestamp,
            };
        },
        readMessages: async (keys) => {
            for (const key of keys || []) {
                await zapo.message.sendReceipt(key.remoteJid, key.id, {
                    type: 'read',
                    participant: key.participant,
                });
            }
        },
        sendPresenceUpdate: async (presence, jid) => {
            if (presence === 'available' || presence === 'unavailable')
                return zapo.presence.send(presence);
            if (!jid) throw new TypeError(`jid is required for ${presence} presence`);
            if (presence === 'recording')
                return zapo.presence.sendChatstate(jid, { state: 'composing', media: 'audio' });
            return zapo.presence.sendChatstate(jid, {
                state: presence === 'composing' ? 'composing' : 'paused',
            });
        },
        presenceSubscribe: async (jid) => {
            await zapo.presence.subscribe(jid);
            presenceSubscriptions.add(jid);
        },
        getName: (jid) => names.get(jid) || jid?.split('@')[0] || '',
        newsletterMetadata: async (type, key) => {
            if (type !== 'invite' && type !== 'jid')
                throw new TypeError(`Unsupported newsletter metadata type: ${type}`);
            return baileysNewsletterMetadata(
                type === 'invite'
                    ? await zapo.newsletter.fetchByInvite(key)
                    : await zapo.newsletter.fetch(key)
            );
        },
        groupMetadata: async (jid) => baileysGroup(await zapo.group.queryGroupMetadata(jid)),
        groupFetchAllParticipating: async () =>
            Object.fromEntries(
                (await zapo.group.queryAllGroups()).map((group) => [group.jid, baileysGroup(group)])
            ),
        groupLeave: (jid) => zapo.group.leaveGroup([jid]),
        groupInviteCode: (jid) => zapo.group.queryInviteCode(jid),
        groupInviteInfo: async (code) => {
            const info = await zapo.group.queryGroupInviteInfo(code);
            return { ...info, id: info.jid };
        },
        groupAcceptInvite: async (code) => (await zapo.group.joinGroupViaInvite(code)).jid,
        groupRevokeInvite: async (jid) => (await zapo.group.revokeInvite(jid)).code,
        groupParticipantsUpdate: async (jid, participants, action) => {
            const methods = {
                add: 'addParticipants',
                remove: 'removeParticipants',
                promote: 'promoteParticipants',
                demote: 'demoteParticipants',
            };
            const method = methods[action];
            if (!method) throw new TypeError(`Unsupported participant action: ${action}`);
            return baileysParticipantResults(await zapo.group[method](jid, participants));
        },
        groupRequestParticipantsList: (jid) => zapo.group.queryMembershipApprovalRequests(jid),
        groupRequestParticipantsUpdate: async (jid, participants, action) => {
            const method =
                action === 'approve'
                    ? 'approveMembershipRequests'
                    : action === 'reject'
                      ? 'rejectMembershipRequests'
                      : null;
            if (!method) throw new TypeError(`Unsupported request action: ${action}`);
            await zapo.group[method](jid, participants);
            return participants.map((participant) => ({ status: '200', jid: participant }));
        },
        groupSettingUpdate: (jid, setting) => {
            if (setting === 'announcement' || setting === 'not_announcement') {
                return zapo.group.setSetting(jid, 'announcement', setting === 'announcement');
            }
            if (setting === 'locked' || setting === 'unlocked') {
                return zapo.group.setSetting(jid, 'restrict', setting === 'locked');
            }
            throw new TypeError(`Unsupported group setting: ${setting}`);
        },
        groupGetInviteInfo: async (code) => {
            const info = await zapo.group.queryGroupInviteInfo(code);
            return { ...info, id: info.jid };
        },
        profilePictureUrl: async (jid, type = 'preview') =>
            (await zapo.profile.getProfilePicture(jid, type)).url,
        logout: async () => {
            stopped = true;
            await zapo.logout();
        },
        end: async () => {
            stopped = true;
            await zapo.disconnect();
            if (!destroyed) {
                destroyed = true;
                await store.destroy();
            }
        },
        ws: { close: () => facade.end() },
        __zapo: zapo,
    };

    const refreshUser = () => {
        const credentials = zapo.getCredentials();
        facade.authState.creds.registered = Boolean(credentials);
        if (!credentials) return;
        facade.user = {
            id: credentials.meJid,
            lid: credentials.meLid,
            name: credentials.pushName,
        };
    };

    const scheduleReconnect = () => {
        if (!reconnect || stopped || reconnectTask) return;
        reconnectTask = (async () => {
            while (!stopped) {
                const delayMs = Math.min(reconnectMaxMs, reconnectBaseMs * 2 ** reconnectAttempt++);
                await wait(delayMs + Math.floor(Math.random() * Math.min(1_000, delayMs / 4)));
                if (stopped) return;
                try {
                    await zapo.connect();
                    return;
                } catch (error) {
                    ev.emit('connection.update', {
                        connection: 'close',
                        lastDisconnect: { error },
                    });
                }
            }
        })().finally(() => {
            reconnectTask = undefined;
        });
    };

    zapo.on('auth_qr', ({ qr }) => ev.emit('connection.update', { qr }));
    zapo.on('auth_pairing_code', ({ code }) => ev.emit('connection.update', { pairingCode: code }));
    zapo.on('auth_paired', refreshUser);
    zapo.on('message', (event) => {
        const sender = event.key.participant || event.key.remoteJid;
        if (sender && event.pushName?.trim()) names.set(sender, event.pushName.trim());
        ev.emit('messages.upsert', { messages: [baileysMessage(event)], type: 'notify' });
    });
    zapo.on('message_protocol', (event) => {
        if (event.protocolMessage?.type !== 0) return;
        ev.emit('messages.update', [
            {
                key: event.protocolMessage.key || event.key,
                update: {
                    status: 'deleted',
                    message: { protocolMessage: event.protocolMessage },
                },
            },
        ]);
    });
    zapo.on('message_addon', (event) => {
        const key = event.key;
        const sender = key.participant || key.remoteJid;
        const updateKey = { ...key, id: event.targetMessageId };
        if (event.kind === 'poll_vote') {
            // Synthetic upsert so serialize -> handleSpecialMessages sees pollUpdateMessage.
            const vote = {
                pollCreationMessageKey: {
                    remoteJid: key.remoteJid,
                    id: event.targetMessageId,
                    fromMe: false,
                    participant: sender,
                },
                vote: event.decrypted.pollVote || {},
                selectedOptionNames: [...(event.decrypted.selectedOptionNames || [])],
            };
            ev.emit('messages.update', [{ key: updateKey, update: { message: { ...event.raw } } }]);
            ev.emit('messages.upsert', {
                messages: [
                    {
                        key,
                        messageTimestamp: Math.floor(Date.now() / 1000),
                        pushName: names.get(sender),
                        broadcast: key.isBroadcast,
                        participant: key.participant,
                        message: { pollUpdateMessage: vote },
                    },
                ],
                type: 'notify',
            });
            return;
        }
        if (event.kind === 'reaction') {
            const reaction = event.decrypted.reaction;
            ev.emit('messages.upsert', {
                messages: [
                    {
                        key,
                        messageTimestamp: Math.floor(Date.now() / 1000),
                        pushName: names.get(sender),
                        broadcast: key.isBroadcast,
                        participant: key.participant,
                        message: {
                            reactionMessage: {
                                ...reaction,
                                key: { remoteJid: key.remoteJid, id: event.targetMessageId },
                            },
                        },
                    },
                ],
                type: 'notify',
            });
            return;
        }
        if (
            ['message_edit', 'event_edit', 'poll_edit', 'poll_add_option'].includes(event.kind) &&
            event.decrypted.message
        ) {
            ev.emit('messages.update', [{ key, update: { message: event.decrypted.message } }]);
            return;
        }
        ev.emit('messages.update', [{ key: updateKey, update: { message: event.raw } }]);
    });
    zapo.on('group', (event) => {
        if (['add', 'remove', 'promote', 'demote'].includes(event.action)) {
            ev.emit('group-participants.update', {
                id: event.groupJid,
                author: event.authorJid,
                participants: (event.participants || [])
                    .map((participant) => participant.jid)
                    .filter(Boolean),
                action: event.action,
            });
        } else if (event.groupJid) {
            ev.emit('groups.update', [
                {
                    id: event.groupJid,
                    subject: event.subject,
                    announce: event.action === 'announce' ? event.enabled : undefined,
                    restrict: event.action === 'restrict' ? event.enabled : undefined,
                },
            ]);
        }
    });
    zapo.on('connection', (event) => {
        if (event.status === 'open') {
            reconnectAttempt = 0;
            refreshUser();
            for (const jid of presenceSubscriptions) void zapo.presence.subscribe(jid);
            ev.emit('connection.update', { connection: 'open', isNewLogin: event.isNewLogin });
            return;
        }
        const error = disconnectError(event);
        ev.emit('connection.update', { connection: 'close', lastDisconnect: { error } });
        if (!event.isLogout && event.reason !== 'client_disconnected') scheduleReconnect();
    });

    attachGroupStatusCompat(facade);
    attachListMessageCompat(facade);
    attachGroupMetadataPatch(facade);
    return facade;
};

export const createZapoAdapter = async ({
    storePath = 'data/zapo-auth.sqlite',
    sessionId = 'default',
    reconnect = true,
    reconnectBaseMs = 1_000,
    reconnectMaxMs = 30_000,
} = {}) => {
    if (!sessionId || typeof sessionId !== 'string')
        throw new TypeError('sessionId must be a stable non-empty string');
    if (storePath !== ':memory:')
        await mkdir(path.dirname(path.resolve(storePath)), { recursive: true });

    const sqlite = createSqliteStore({
        path: storePath,
        pragmas: { journal_mode: 'WAL', synchronous: 'NORMAL' },
    });
    const store = createStore({
        backends: { sqlite },
        providers: PROVIDERS,
        cacheProviders: CACHE_PROVIDERS,
    });
    const zapo = new WaClient(
        {
            store,
            sessionId,
            markOnlineOnConnect: true,
            recoverFromClientTooOld: true,
            history: { enabled: false },
            addons: { autoDecrypt: true, persistAllSecrets: true },
            media: { processor: createMediaProcessor() },
        },
        createNoopLogger()
    );
    const client = createZapoFacade({
        zapo,
        store,
        sessionId,
        reconnect,
        reconnectBaseMs,
        reconnectMaxMs,
    });

    return {
        client,
        connect: client.connect,
        saveCreds: async () => {},
        storePath,
        sessionId,
        transport: 'zapo',
        close: client.end,
        zapo,
    };
};

export default createZapoAdapter;
