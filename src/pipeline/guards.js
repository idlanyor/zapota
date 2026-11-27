/**
 * Command guards: the single place that decides whether a resolved command
 * may run for the current message.
 *
 * A guard is `async (ctx, command) => Denial | null`:
 *   - `null`             → allowed, check the next guard
 *   - `{ reply: '...' }` → denied, tell the user why
 *   - `{}`               → denied silently
 *
 * DEFAULT_GUARDS apply to every command and encode bot-wide policy (sub-bot
 * tier, mute, bot mode, Owner/RPG categories). Commands opt into extra checks with
 * `guards: ['group', 'admin', 'botAdmin', ...]` in their export.
 */
import { isOwnerAdminInGroup } from '../middlewares/auth.js';
import { isBotAdmin, isParticipantAdmin } from '../lib/groupRoles.js';
import { GUARD_NAMES, validateGuards } from './guardNames.js';

export { validateGuards };

const SILENT = Object.freeze({});
const deny = (reply) => ({ reply });

export const MESSAGES = Object.freeze({
    owner: ' Akses Ditolak. Perintah ini hanya untuk Owner.',
    disabled: 'Perintah ini sedang dinonaktifkan oleh owner.',
    rpg: '🔒 *AKSES TERBATAS*\n\nFitur RPG saat ini sedang dalam masa uji coba tertutup dan hanya dapat digunakan di grup yang memiliki Owner bot sebagai Admin.',
    group: 'Perintah ini hanya bisa digunakan di dalam grup.',
    private: 'Perintah ini hanya bisa digunakan di chat pribadi.',
    admin: 'Perintah ini khusus admin grup.',
    botAdmin: 'Jadikan bot sebagai admin grup terlebih dahulu.',
    mainOnly: '🔒 Fitur ini hanya tersedia di bot utama.',
    premiumOnly:
        '🔒 Fitur manajemen grup hanya untuk *Jadibot Premium*.\nUpgrade lewat bot utama: *.jadibot premium*',
});

/** Command categories that only run on the main bot, never on a sub-bot. */
export const MAIN_ONLY_CATEGORIES = new Set([
    'Owner',
    'Cloudflare',
    'Panel',
    'Blog',
    'Hidden',
    'Jadibot',
]);

/** Single commands that only run on the main bot (payments, server access). */
export const MAIN_ONLY_COMMANDS = new Set([
    'store',
    'order3',
    'renew',
    'invoice',
    'deliver',
    'smm',
    'qris',
    'lxc',
]);

/** Categories a free sub-bot may not run (premium only). */
export const PREMIUM_CATEGORIES = new Set(['Group']);

/**
 * Group participants, fetched at most once per message.
 * `fresh` bypasses the cached metadata attached to the message (admin
 * checks should not act on a 5-minute-old role list).
 */
export const getParticipants = async (ctx, { fresh = false } = {}) => {
    const { sock, m } = ctx;
    if (!fresh && m.metadata?.participants?.length) return m.metadata.participants;
    if (ctx.freshParticipants) return ctx.freshParticipants;
    try {
        ctx.freshParticipants = (await sock.groupMetadata(m.chat)).participants || [];
    } catch {
        ctx.freshParticipants = [];
    }
    return ctx.freshParticipants;
};

/* ----------------------------- defaults ----------------------------- */

const mutedGroup = async (ctx) => {
    if (!ctx.groupData?.mute || ctx.isOwner) return null;
    const participants = await getParticipants(ctx);
    return isParticipantAdmin(participants, ctx.m.sender) ? null : SILENT;
};

/**
 * Whether the main bot's public/self/group mode tells it to ignore this
 * sender. Owners always pass; sub-bots follow their tier instead.
 */
export const isSilencedByMode = ({ botSettings, isOwner, m, subBot }) => {
    if (isOwner || subBot) return false;
    if (botSettings?.mode === 'self') return true;
    return botSettings?.mode === 'group' && !m.isGroup;
};

const botMode = async (ctx) => (isSilencedByMode(ctx) ? SILENT : null);

/** Commands switched off with `.toggle disable <cmd>` (owners can still use them). */
const disabledCommand = async ({ botSettings, isOwner }, command) => {
    if (isOwner) return null;
    const disabled = Array.isArray(botSettings?.disabledCommands)
        ? botSettings.disabledCommands
        : [];
    return disabled.includes(command.name) ? deny(MESSAGES.disabled) : null;
};

const ownerCategory = async (ctx, command) =>
    command.category === 'Owner' && !ctx.isOwner ? deny(MESSAGES.owner) : null;

const rpgInGroup = async (ctx, command) => {
    if (command.category !== 'RPG' || !ctx.m.isGroup) return null;
    return (await isOwnerAdminInGroup(ctx.sock, ctx.m, ctx.botSettings))
        ? null
        : deny(MESSAGES.rpg);
};

/** What a sub-bot may run: never main-only commands; free tier has no group management. */
const subBotPolicy = async ({ subBot }, command) => {
    if (!subBot) return null;
    if (MAIN_ONLY_CATEGORIES.has(command.category) || MAIN_ONLY_COMMANDS.has(command.name)) {
        return deny(MESSAGES.mainOnly);
    }
    if (subBot.tier !== 'premium' && PREMIUM_CATEGORIES.has(command.category)) {
        return deny(MESSAGES.premiumOnly);
    }
    return null;
};

export const DEFAULT_GUARDS = [
    subBotPolicy,
    mutedGroup,
    botMode,
    disabledCommand,
    ownerCategory,
    rpgInGroup,
];

/* ---------------------------- declarative --------------------------- */

const requireGroup = ({ m }) => (m.isGroup ? null : deny(MESSAGES.group));

export const GUARDS = Object.freeze({
    owner: async (ctx) => (ctx.isOwner ? null : deny(MESSAGES.owner)),
    group: async (ctx) => requireGroup(ctx),
    private: async ({ m }) => (m.isGroup ? deny(MESSAGES.private) : null),
    admin: async (ctx) => {
        const notGroup = requireGroup(ctx);
        if (notGroup) return notGroup;
        const participants = await getParticipants(ctx, { fresh: true });
        return isParticipantAdmin(participants, ctx.m.sender) ? null : deny(MESSAGES.admin);
    },
    botAdmin: async (ctx) => {
        const notGroup = requireGroup(ctx);
        if (notGroup) return notGroup;
        const participants = await getParticipants(ctx, { fresh: true });
        return isBotAdmin(ctx.sock, participants) ? null : deny(MESSAGES.botAdmin);
    },
});

if (GUARD_NAMES.some((n) => !GUARDS[n]) || Object.keys(GUARDS).length !== GUARD_NAMES.length) {
    throw new Error('GUARDS and GUARD_NAMES are out of sync');
}

/**
 * Run default + declared guards in order.
 * @returns {Promise<{ reply?: string } | null>} first denial, or null if allowed
 */
export const checkGuards = async (ctx, command) => {
    const declared = validateGuards(command.guards || [], `command "${command.name}"`);
    for (const guard of [...DEFAULT_GUARDS, ...declared.map((n) => GUARDS[n])]) {
        const denial = await guard(ctx, command);
        if (denial) return denial;
    }
    return null;
};
