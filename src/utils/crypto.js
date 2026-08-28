import crypto from 'crypto';

const ALGO = 'aes-256-gcm';

const getKey = () => {
    const secret = process.env.TOKEN_ENCRYPTION_KEY || process.env.ACCESS_KEY;
    if (!secret) {
        throw new Error('TOKEN_ENCRYPTION_KEY (or ACCESS_KEY) is not set in env');
    }
    return crypto.createHash('sha256').update(secret).digest();
};

export const encrypt = (plainText) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
};

export const decrypt = (payload) => {
    const raw = Buffer.from(payload, 'base64');
    const iv = raw.subarray(0, 12);
    const authTag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
};
