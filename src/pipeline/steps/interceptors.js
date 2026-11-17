/**
 * Interceptors: steps that may consume a message before command routing.
 * Each either stops the pipeline (handled) or calls next().
 */
import { settings } from '../../config/settings.js';
import { decodeJid } from '../../utils/serialize.js';
import { sessionManager } from '../../utils/session.js';
import { commands } from '../../lib/commands.js';
import {
    handlePreProcessing,
    handleAfk,
    handleSpecialMessages,
    handleOwnerAgentTrigger,
} from '../../handlers/messageFlow.js';
import { handleButtons } from '../../handlers/buttonHandler.js';
import { checkJoinGroup } from '../../middlewares/auth.js';
import { handleDeleteServerConfirmation } from '../../middlewares/deleteServer.js';
import { pendingServerDeletes } from '../../state/pendingServerDeletes.js';

/** Non-prefixed replies go to the command that owns the active session. */
export const routeActiveSession = async (ctx, next) => {
    const { sock, m } = ctx;
    const session = sessionManager.get(m.chat) || sessionManager.get(m.sender);
    if (session && !m.body.startsWith(settings.prefix)) {
        const command = commands.get(session.data.commandName);
        if (typeof command?.handleSession === 'function') {
            await command.handleSession(sock, m, session);
            return;
        }
    }
    await next();
};

/** Owner's "y/ya" reply to a pending `delsrv` confirmation. */
export const pendingDeleteConfirmation = async (ctx, next) => {
    const { m, isOwner } = ctx;
    if (isOwner && pendingServerDeletes.has(m.sender)) {
        if (await handleDeleteServerConfirmation(m)) return;
    }
    await next();
};

/** Antilink / antitoxic / edited-message notice. */
export const groupModeration = async (ctx, next) => {
    const { sock, m, groupData, isOwner } = ctx;
    if (await handlePreProcessing(sock, m, groupData, isOwner)) return;
    await next();
};

/** Side effects that never stop the flow: AFK notices, poll votes. */
export const passiveHandlers = async (ctx, next) => {
    const { sock, m, usedPrefix } = ctx;
    await handleAfk(sock, m, usedPrefix);
    await handleSpecialMessages(sock, m);
    await next();
};

export const buttons = async (ctx, next) => {
    if (await handleButtons(ctx.sock, ctx.m, ctx.isOwner)) return;
    await next();
};

/** The bot's own outgoing messages only act as input in self mode. */
export const ignoreOwnMessages = async (ctx, next) => {
    if (ctx.m.key.fromMe && ctx.botSettings?.mode !== 'self') return;
    await next();
};

const buildJidCandidates = (...values) => {
    const candidates = new Set();
    for (const value of values) {
        if (!value || typeof value !== 'string') continue;
        candidates.add(value);
        const decoded = decodeJid(value);
        if (decoded) candidates.add(decoded);
        const userPart = value.split('@')[0];
        if (userPart) candidates.add(userPart);
        if (decoded?.includes('@')) {
            const decodedUserPart = decoded.split('@')[0];
            if (decodedUserPart) candidates.add(decodedUserPart);
        }
    }
    return [...candidates];
};

/** "Must join the official group" gate for private chats. */
export const joinGroupGate = async (ctx, next) => {
    const { sock, m, isOwner, botSettings } = ctx;
    if (!(await checkJoinGroup(sock, m, isOwner, botSettings, buildJidCandidates))) return;
    await next();
};

export const ownerAgent = async (ctx, next) => {
    const { sock, m, isOwner, usedPrefix } = ctx;
    if (await handleOwnerAgentTrigger(sock, m, isOwner, usedPrefix)) return;
    await next();
};
