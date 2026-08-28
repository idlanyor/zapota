import crypto from 'node:crypto';
import { config } from '../config.js';

export const encryptSecret = (plainText) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', config.masterKey, iv);
    const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.');
};

export const decryptSecret = (payload) => {
    const [ivValue, tagValue, encryptedValue] = String(payload).split('.');
    if (!ivValue || !tagValue || !encryptedValue) throw new Error('Invalid encrypted secret');
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        config.masterKey,
        Buffer.from(ivValue, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([
        decipher.update(Buffer.from(encryptedValue, 'base64url')),
        decipher.final(),
    ]).toString('utf8');
};
