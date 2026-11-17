export const settings = {
    transport: process.env.WA_TRANSPORT || 'baileys',
    zapoDbPath: process.env.ZAPO_DB_PATH || 'data/zapo-auth.sqlite',
    /** Bot's own number; when set, an unpaired zapo session logs in by pairing code instead of QR. */
    pairingNumber: (process.env.BOT_PHONE_NUMBER || '').replace(/\D/g, ''),
    prefix: process.env.BOT_PREFIX || '.',
    botName: process.env.BOT_NAME || 'KANATA_BOT',
    ownerName: process.env.OWNER_NAME || 'Roy',
    ownerNumber: process.env.OWNER_NUMBER || '62895395590009@s.whatsapp.net',
    ownerLid: process.env.OWNER_LID || '79444496625700@lid',
    smmApiKey: process.env.SMM_API_KEY,
    smmBaseUrl: process.env.SMM_BASE_URL || 'https://indosmm.id/api/v2',
    mpApiKey: process.env.MP_APIKEY,
    pinterestCookies: process.env.PINTEREST_COOKIES || '',
};

/** Command prefixes the bot reacts to (primary prefix first). */
export const getPrefixes = () =>
    [settings.prefix, ...(settings.prefixAliases || [])].filter(Boolean);
