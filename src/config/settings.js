import { env } from './env.js';

/** Normalize `628xxx` → `628xxx@s.whatsapp.net` (or `@lid`); keep full JIDs as-is. */
const toJid = (value, server) => {
    if (!value) return undefined;
    const v = String(value).trim();
    if (v.includes('@')) return v;
    const digits = v.replace(/\D/g, '');
    return digits ? `${digits}@${server}` : undefined;
};

/**
 * Typed, derived bot settings. Getters read `env` live, so `.reloadenv`
 * takes effect without a restart.
 */
export const settings = {
    /** @returns {'zapo' | 'baileys'} */
    get transport() {
        return env.WA_TRANSPORT === 'zapo' ? 'zapo' : 'baileys';
    },
    get zapoDbPath() {
        return env.ZAPO_DB_PATH || 'data/zapo-auth.sqlite';
    },
    /** Bot's own number; when set, an unpaired zapo session logs in by pairing code instead of QR. */
    get pairingNumber() {
        return (env.BOT_PHONE_NUMBER || '').replace(/\D/g, '');
    },
    /** Max free sub-bot (jadibot) sessions; premium sub-bots are not counted. */
    get jadibotMax() {
        const n = Number.parseInt(env.JADIBOT_MAX ?? '', 10);
        return Number.isInteger(n) && n >= 0 ? n : 15;
    },
    get prefix() {
        return env.BOT_PREFIX || '.';
    },
    get botName() {
        return env.BOT_NAME || 'KANATA_BOT';
    },
    get ownerName() {
        return env.OWNER_NAME || 'Owner';
    },
    /** Required at startup (see env.js). */
    get ownerNumber() {
        return toJid(env.OWNER_NUMBER, 's.whatsapp.net');
    },
    get ownerLid() {
        return toJid(env.OWNER_LID, 'lid');
    },
    get smmApiKey() {
        return env.SMM_API_KEY;
    },
    get smmBaseUrl() {
        return env.SMM_BASE_URL || 'https://indosmm.id/api/v2';
    },
    get mpApiKey() {
        return env.MP_APIKEY;
    },
    get pinterestCookies() {
        return env.PINTEREST_COOKIES || '';
    },
    get geminiApiKey() {
        return env.GEMINI_API_KEY;
    },
};

/** Command prefixes the bot reacts to (primary prefix first). */
export const getPrefixes = () =>
    [settings.prefix, ...(settings.prefixAliases || [])].filter(Boolean);
