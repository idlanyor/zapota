export const settings = {
    transport: process.env.WA_TRANSPORT || 'baileys',
    zapoDbPath: process.env.ZAPO_DB_PATH || 'data/zapo-auth.sqlite',
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
