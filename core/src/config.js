import 'dotenv/config';

const required = (name) => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`[config] ${name} is required`);
    return value;
};

const integer = (name, fallback) => {
    const value = Number(process.env[name] || fallback);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`[config] ${name} must be a positive integer`);
    }
    return value;
};

const masterKey = required('CORE_MASTER_KEY');
if (!/^[a-f0-9]{64}$/i.test(masterKey)) {
    throw new Error('[config] CORE_MASTER_KEY must contain exactly 64 hexadecimal characters');
}

const databaseUrl = required('DATABASE_URL');
if (!databaseUrl.startsWith('mysql://') && !databaseUrl.startsWith('mariadb://')) {
    throw new Error('[config] DATABASE_URL must be a mysql:// or mariadb:// URL');
}

export const config = Object.freeze({
    nodeEnv: process.env.NODE_ENV || 'development',
    host: process.env.CORE_HOST || '127.0.0.1',
    port: integer('CORE_PORT', 8790),
    databaseUrl,
    masterKey: Buffer.from(masterKey, 'hex'),
    hmacMaxSkewSeconds: integer('HMAC_MAX_SKEW_SECONDS', 300),
    cookieName: process.env.CORE_COOKIE_NAME || 'kanata_session',
    cookieMaxAgeSeconds: integer('CORE_COOKIE_MAX_AGE_SECONDS', 7 * 24 * 3600),
});
