/**
 * Intake steps: turn a raw transport message into a routed context.
 * dedupe → loadMessage → buildContext
 */
import NodeCache from 'node-cache';
import { serialize } from '../../utils/serialize.js';
import logger from '../../utils/logger.js';
import { getPrefixes } from '../../config/settings.js';
import { saveMessage } from '../../lib/msgStore.js';
import { CACHE_TTL, CACHE_CHECK_PERIOD } from '../../constants/config.js';
import { getCachedSettings, getGroupSettings } from '../../handlers/messageFlow.js';
import { checkOwner } from '../../middlewares/auth.js';
import { getCachedGroupMetadata, refreshGroupMetadata } from '../../middlewares/group.js';
import { getBotProfile } from '../../lib/botProfile.js';
import { recordWerewolfPrivateContact } from '../../games/werewolf/service.js';

const inFlight = new NodeCache({
    stdTTL: CACHE_TTL.MESSAGES,
    checkperiod: CACHE_CHECK_PERIOD.MESSAGES,
});

/**
 * Drop a message id that is already being processed by the same socket, and
 * act as the pipeline's error boundary. The key includes the socket's bot id:
 * the main bot and a sub-bot in the same chat receive the same message id.
 */
export const dedupe = async (ctx, next) => {
    const msgId = ctx.raw?.key?.id;
    if (!msgId) return;
    const id = `${getBotProfile(ctx.sock).id}:${msgId}`;
    if (inFlight.has(id)) return;
    inFlight.set(id, true);
    try {
        await next();
    } catch (err) {
        logger.error(err, 'Error in messageHandler');
    } finally {
        inFlight.del(id);
    }
};

/** Load bot settings, handle status broadcasts, serialize, drop empty/newsletter. */
export const loadMessage = async (ctx, next) => {
    const { sock, raw } = ctx;
    const isStatus = raw.key.remoteJid === 'status@broadcast';

    const [botSettings, m] = await Promise.all([
        getCachedSettings(),
        isStatus ? null : serialize(raw, sock),
    ]);
    ctx.botSettings = botSettings;

    if (isStatus) {
        const participant = raw.key.participant;
        if (botSettings?.autoStatusRead && participant) {
            await sock.readMessages([raw.key]);
            logger.debug(`Read status from: ${participant.split('@')[0]}`, 'STORY');
        }
        return;
    }

    if (!m || (!m.body && !m.mtype)) return;
    if (m.chat?.endsWith('@newsletter')) return;

    ctx.m = m;
    await next();
};

/** Resolve prefix, group metadata, owner flag, group settings; log the message. */
export const buildContext = async (ctx, next) => {
    const { sock, m, botSettings } = ctx;

    const trimmedBody = (m.body || '').trim();
    ctx.usedPrefix = trimmedBody ? getPrefixes().find((p) => trimmedBody.startsWith(p)) : undefined;

    const cachedMetadata = m.isGroup ? getCachedGroupMetadata(m.chat) : null;
    m.metadata = cachedMetadata?.data || {};
    if (m.isGroup && !cachedMetadata?.isFresh) {
        refreshGroupMetadata(sock, m.chat).catch(() => {});
    }

    ctx.isOwner = m.isOwner = checkOwner(m, sock, botSettings);

    const groupDataPromise =
        m.isGroup && !ctx.isOwner && !m.key.fromMe
            ? getGroupSettings(m.chat, m.metadata?.subject || '')
            : Promise.resolve(null);

    if (m.body) {
        saveMessage(m);
        logger.chat({
            chatType: m.isGroup ? 'GROUP' : 'PRIVATE',
            chatName: m.isGroup ? m.metadata?.subject || 'Group' : 'Private Chat',
            sender: m.pushName || (m.sender ? m.sender.split('@')[0] : 'Unknown'),
            body: m.body,
        });
    }

    ctx.groupData = await groupDataPromise;

    if (!m.sender) return;
    if (!m.isGroup) recordWerewolfPrivateContact(m);

    await next();
};
