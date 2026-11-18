/**
 * Single source of truth for environment variables.
 *
 * - Every variable the bot reads is declared in ENV_SPEC (group, purpose,
 *   format). Code reads them through `env.NAME`; reading an undeclared
 *   name throws, so typos fail loudly instead of returning `undefined`.
 * - `env` reads `process.env` live, so `.reloadenv` (dotenv override) keeps
 *   working without restarting.
 * - `validateEnv()` checks formats and required values; `assertEnv()` runs
 *   it at startup and refuses to boot on fatal problems.
 *
 * Values are returned exactly as set (strings or undefined); typed/derived
 * values live in `settings.js`.
 */

/**
 * @typedef {Object} EnvVar
 * @property {string} group    Feature/area, used for docs and startup report
 * @property {string} desc     What it does
 * @property {boolean} [required]  Missing/empty → fatal at startup
 * @property {boolean} [secret]    Never print the value
 * @property {'url'|'port'|'digits'|'jid'|'lid'|'bool'} [format]
 * @property {string[]} [oneOf]    Allowed values
 */

/** @type {Record<string, EnvVar>} */
export const ENV_SPEC = Object.freeze({
    // --- Core ---------------------------------------------------------------
    NODE_ENV: {
        group: 'core',
        desc: '`production` loads commands from manifest.json (lazy); otherwise hot-reload',
    },
    WA_TRANSPORT: {
        group: 'core',
        desc: 'WhatsApp transport (default: baileys)',
        oneOf: ['zapo', 'baileys'],
    },
    ZAPO_DB_PATH: { group: 'core', desc: 'zapo credential store (default: data/zapo-auth.sqlite)' },
    BOT_PHONE_NUMBER: {
        group: 'core',
        desc: "Bot's own number; zapo logs in by pairing code instead of QR",
        format: 'digits',
    },
    JADIBOT_MAX: {
        group: 'core',
        desc: 'Max free sub-bot (jadibot) sessions; premium ones are not counted (default: 15)',
    },
    YTDLP_BIN: {
        group: 'core',
        desc: 'yt-dlp binary for YouTube downloads (default: yt-dlp on PATH)',
    },
    YTDLP_ARGS: {
        group: 'core',
        desc: 'Extra yt-dlp args, space separated (default: --js-runtimes node), e.g. add --cookies <file>',
    },
    BOT_PREFIX: { group: 'core', desc: 'Command prefix (default: .)' },
    BOT_NAME: { group: 'core', desc: 'Display name (default: KANATA_BOT)' },
    OWNER_NUMBER: {
        group: 'core',
        desc: 'Owner phone JID or digits, e.g. 628xxx@s.whatsapp.net',
        required: true,
        format: 'jid',
    },
    OWNER_LID: { group: 'core', desc: 'Owner LID, e.g. 1234@lid', format: 'lid' },
    OWNER_NAME: { group: 'core', desc: 'Owner display name (default: Owner)' },
    SQLITE_PATH: { group: 'core', desc: 'SQLite database file (default: data/bot.db)' },
    SQLITE_MEMORY: {
        group: 'core',
        desc: '`1` uses an in-memory database (tests)',
        oneOf: ['0', '1'],
    },
    AUTO_AI_TYPING_DELAY_MS: { group: 'core', desc: 'Typing delay before private auto-AI replies' },
    WEREWOLF_READY_FILE: { group: 'core', desc: 'Werewolf readiness marker file (tests/ops)' },

    // --- Webhook / web client -------------------------------------------------
    BOT_WEBHOOK_HOST: { group: 'webhook', desc: 'Webhook bind host' },
    BOT_WEBHOOK_PORT: { group: 'webhook', desc: 'Webhook port', format: 'port' },
    BOT_WEBHOOK_TOKEN: {
        group: 'webhook',
        desc: 'Webhook bearer token; webhook disabled when empty',
        secret: true,
    },
    BOT_WEBHOOK_ALLOWLIST: { group: 'webhook', desc: 'Comma-separated allowed IPs' },
    ACCESS_KEY: { group: 'webhook', desc: 'Socket.IO client access key', secret: true },
    WEBAPP_URL: { group: 'webhook', desc: 'Web client URL for Socket.IO', format: 'url' },
    TOKEN_ENCRYPTION_KEY: {
        group: 'webhook',
        desc: 'Key for encrypting stored tokens',
        secret: true,
    },

    // --- Kanata Core ------------------------------------------------------------
    KANATA_CORE_URL: { group: 'kanataCore', desc: 'Kanata Core base URL', format: 'url' },
    KANATA_CORE_CLIENT_ID: { group: 'kanataCore', desc: 'HMAC client id' },
    KANATA_CORE_CLIENT_SECRET: { group: 'kanataCore', desc: 'HMAC client secret', secret: true },

    // --- AI ----------------------------------------------------------------------
    GEMINI_API_KEY: { group: 'gemini', desc: 'Gemini (finance extraction)', secret: true },
    AI_AGENT_API_KEY: { group: 'aiAgent', desc: 'Main AI agent key', secret: true },
    AI_AGENT_BASE_URL: { group: 'aiAgent', desc: 'Main AI agent base URL', format: 'url' },
    AI_AGENT_MODEL: { group: 'aiAgent', desc: 'Main AI agent model' },
    OWNER_AGENT_API_KEY: { group: 'ownerAgent', desc: 'Owner agent key', secret: true },
    OWNER_AGENT_BASE_URL: { group: 'ownerAgent', desc: 'Owner agent base URL', format: 'url' },
    OWNER_AGENT_MODEL: { group: 'ownerAgent', desc: 'Owner agent model' },
    DS_API_KEY: {
        group: 'deepseek',
        desc: 'DeepSeek-compatible chat key (ds, vision2, millionaire)',
        secret: true,
    },
    DS_BASE_URL: { group: 'deepseek', desc: 'DeepSeek-compatible base URL', format: 'url' },
    DS2_API_KEY: {
        group: 'ds2',
        desc: 'OpenAI-compatible router key for .ds2 (DeepSeek V4.1 Flash)',
        secret: true,
    },
    DS2_BASE_URL: {
        group: 'ds2',
        desc: 'OpenAI-compatible router base URL for .ds2, e.g. https://router.example.com/v1',
        format: 'url',
    },
    DS2_MODEL: {
        group: 'ds2',
        desc: 'Model for .ds2 (default: hv/deepseek-ai/deepseek-v4.1-flash-1017)',
    },
    GLM_API_KEY: { group: 'glm', desc: 'GLM key', secret: true },
    GLM_BASE_URL: { group: 'glm', desc: 'GLM base URL', format: 'url' },
    GLM_MODEL: { group: 'glm', desc: 'GLM model' },
    ANTHROPIC_AUTH_TOKEN: {
        group: 'web2pdf',
        desc: 'Anthropic-compatible token (web2pdf)',
        secret: true,
    },
    ANTHROPIC_BASE_URL: {
        group: 'web2pdf',
        desc: 'Anthropic-compatible base URL (web2pdf)',
        format: 'url',
    },
    ALICE_API_KEY: { group: 'alice', desc: 'Alice API key', secret: true },
    KANATA_API_KEY: { group: 'kanataApi', desc: 'Kanata API key (ocr, translate)', secret: true },
    KANATA_BASE_URL: { group: 'kanataApi', desc: 'Kanata API base URL', format: 'url' },

    // --- Integrations --------------------------------------------------------------
    PTERO_URL: { group: 'pterodactyl', desc: 'Pterodactyl panel URL', format: 'url' },
    PTERO_API_KEY: { group: 'pterodactyl', desc: 'Application API key', secret: true },
    PTERO_CLIENT_KEY: { group: 'pterodactyl', desc: 'Client API key', secret: true },
    PTERO_LOCATION_ID: { group: 'pterodactyl', desc: 'Default location id' },
    PTERO_NEST_ID: { group: 'pterodactyl', desc: 'Default nest id' },
    PTERO_EGG_ID: { group: 'pterodactyl', desc: 'Default egg id' },
    CLOUDFLARE_API_TOKEN: { group: 'cloudflare', desc: 'Cloudflare API token', secret: true },
    CLOUDFLARE_ACCOUNT_ID: { group: 'cloudflare', desc: 'Cloudflare account id' },
    ILOVEPDF_PUBLIC_KEY: { group: 'ilovepdf', desc: 'iLovePDF public key', secret: true },
    ILOVEPDF_SECRET_KEY: { group: 'ilovepdf', desc: 'iLovePDF secret key', secret: true },
    SMM_API_KEY: { group: 'smm', desc: 'SMM panel key', secret: true },
    SMM_BASE_URL: { group: 'smm', desc: 'SMM panel URL (default: indosmm)', format: 'url' },
    BLOG_API_URL: { group: 'blog', desc: 'Blog API URL', format: 'url' },
    BLOG_API_KEY: { group: 'blog', desc: 'Blog API key', secret: true },
    CLOUD_API_URL: { group: 'cloudApi', desc: 'Cloud API URL', format: 'url' },
    CLOUD_ADMIN_TOKEN: { group: 'cloudApi', desc: 'Cloud API admin token', secret: true },
    IRENG_API_URL: { group: 'ireng', desc: 'IrengCloud API URL', format: 'url' },
    IRENG_ADMIN_BASE_URL: { group: 'irengAdmin', desc: 'IrengCloud admin API URL', format: 'url' },
    IRENG_ADMIN_TOKEN: { group: 'irengAdmin', desc: 'IrengCloud admin token', secret: true },
    INVOICE_API_KEY: { group: 'invoice', desc: 'Invoice API key', secret: true },
    SAKURA_API_URL: {
        group: 'wireguard',
        desc: 'WireGuard (createwg/accwg) API URL',
        format: 'url',
    },
    GOBIZ_STATIC_QRIS: { group: 'qris', desc: 'Static QRIS payload for dynamic QRIS' },
    MP_APIKEY: { group: 'misc', desc: 'cekbank API key', secret: true },
    PINTEREST_COOKIES: { group: 'misc', desc: 'Pinterest scraper cookies', secret: true },
    FFSTALK_ACCOUNT: { group: 'misc', desc: 'ffstalk account', secret: true },
    FFSTALK_ID: { group: 'misc', desc: 'ffstalk id' },
    TELEGRAM_BOT_TOKEN: { group: 'misc', desc: 'telestick Telegram bot token', secret: true },
});

/**
 * Features that need several variables together. Partially configured
 * features are reported at startup (usually a forgotten key).
 */
export const FEATURE_REQUIREMENTS = Object.freeze({
    webhook: ['BOT_WEBHOOK_TOKEN'],
    kanataCore: ['KANATA_CORE_URL', 'KANATA_CORE_CLIENT_ID', 'KANATA_CORE_CLIENT_SECRET'],
    gemini: ['GEMINI_API_KEY'],
    aiAgent: ['AI_AGENT_API_KEY', 'AI_AGENT_BASE_URL'],
    ownerAgent: ['OWNER_AGENT_API_KEY', 'OWNER_AGENT_BASE_URL'],
    deepseek: ['DS_API_KEY', 'DS_BASE_URL'],
    ds2: ['DS2_API_KEY', 'DS2_BASE_URL'],
    glm: ['GLM_API_KEY', 'GLM_BASE_URL'],
    pterodactyl: ['PTERO_URL', 'PTERO_API_KEY'],
    cloudflare: ['CLOUDFLARE_API_TOKEN'],
    ilovepdf: ['ILOVEPDF_PUBLIC_KEY', 'ILOVEPDF_SECRET_KEY'],
    blog: ['BLOG_API_URL', 'BLOG_API_KEY'],
    cloudApi: ['CLOUD_API_URL', 'CLOUD_ADMIN_TOKEN'],
    irengAdmin: ['IRENG_ADMIN_BASE_URL', 'IRENG_ADMIN_TOKEN'],
});

const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;

/**
 * Live, typo-safe view of declared environment variables.
 * `env.FOO` → `process.env.FOO`; undeclared UPPER_CASE names throw.
 */
export const env = new Proxy(Object.create(null), {
    get(_, key) {
        if (typeof key !== 'string' || !ENV_NAME.test(key)) return undefined;
        if (!Object.hasOwn(ENV_SPEC, key)) {
            throw new Error(`env.${key} is not declared in src/config/env.js (ENV_SPEC)`);
        }
        return process.env[key];
    },
    set() {
        throw new TypeError('env is read-only; edit .env (and use .reloadenv) instead');
    },
    has: (_, key) => Object.hasOwn(ENV_SPEC, key),
    ownKeys: () => Object.keys(ENV_SPEC),
    getOwnPropertyDescriptor: (_, key) =>
        Object.hasOwn(ENV_SPEC, key)
            ? { enumerable: true, configurable: true, value: process.env[key] }
            : undefined,
});

const FORMAT_CHECKS = {
    url: (v) => {
        try {
            return ['http:', 'https:'].includes(new URL(v).protocol);
        } catch {
            return false;
        }
    },
    port: (v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 65535,
    digits: (v) => /^\+?[\d\s-]{8,}$/.test(v),
    jid: (v) => /^\d{8,}(@s\.whatsapp\.net)?$/.test(v),
    lid: (v) => /^\d+(@lid)?$/.test(v),
};

const FORMAT_HINTS = {
    url: 'an http(s) URL',
    port: 'a port number (1-65535)',
    digits: 'a phone number in international format (digits)',
    jid: 'digits or <digits>@s.whatsapp.net',
    lid: 'digits or <digits>@lid',
};

/** Variables whose bad value would break the bot itself (not one feature). */
const FATAL_FORMAT = new Set([
    'WA_TRANSPORT',
    'BOT_WEBHOOK_PORT',
    'BOT_PHONE_NUMBER',
    'OWNER_NUMBER',
    'OWNER_LID',
]);

const isSet = (v) => v !== undefined && String(v).trim() !== '';

/**
 * @param {Record<string, string | undefined>} [source]
 * @returns {{ errors: string[], warnings: string[], features: Record<string, 'on'|'off'|'partial'> }}
 */
export const validateEnv = (source = process.env) => {
    const errors = [];
    const warnings = [];

    for (const [name, spec] of Object.entries(ENV_SPEC)) {
        const value = source[name];
        if (!isSet(value)) {
            if (spec.required) errors.push(`${name} is required — ${spec.desc}`);
            continue;
        }
        const trimmed = String(value).trim();
        let problem = null;
        if (spec.oneOf && !spec.oneOf.includes(trimmed)) {
            problem = `must be one of ${spec.oneOf.join(', ')}`;
        } else if (
            spec.format &&
            FORMAT_CHECKS[spec.format] &&
            !FORMAT_CHECKS[spec.format](trimmed)
        ) {
            problem = `must be ${FORMAT_HINTS[spec.format]}`;
        }
        if (problem) {
            const shown = spec.secret ? '' : ` (got "${trimmed}")`;
            (FATAL_FORMAT.has(name) ? errors : warnings).push(`${name} ${problem}${shown}`);
        }
    }

    const features = {};
    for (const [feature, names] of Object.entries(FEATURE_REQUIREMENTS)) {
        const missing = names.filter((n) => !isSet(source[n]));
        features[feature] =
            missing.length === 0 ? 'on' : missing.length === names.length ? 'off' : 'partial';
        if (features[feature] === 'partial') {
            warnings.push(`${feature} is partially configured; missing ${missing.join(', ')}`);
        }
    }

    return { errors, warnings, features };
};

/**
 * Validate at startup: log warnings and a feature summary, throw on fatal
 * problems so the process exits before connecting to WhatsApp.
 * @param {{ info: Function, warn: Function }} log
 */
export const assertEnv = (log, source = process.env) => {
    const { errors, warnings, features } = validateEnv(source);
    for (const w of warnings) log.warn(`[env] ${w}`);

    const on = Object.keys(features).filter((f) => features[f] === 'on');
    const off = Object.keys(features).filter((f) => features[f] !== 'on');
    log.info(
        `[env] features on: ${on.join(', ') || '-'}${off.length ? ` | off: ${off.join(', ')}` : ''}`
    );

    if (errors.length) {
        const error = new Error(`Invalid environment:\n  - ${errors.join('\n  - ')}`);
        error.code = 'INVALID_ENV';
        throw error;
    }
};
