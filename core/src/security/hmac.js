import crypto from 'node:crypto';

export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export const canonicalRequest = ({ timestamp, nonce, method, path, body }) =>
    [timestamp, nonce, method.toUpperCase(), path, sha256(body || Buffer.alloc(0))].join('.');

export const signRequest = (secret, request) =>
    crypto.createHmac('sha256', secret).update(canonicalRequest(request)).digest('hex');

export const safeSignatureEqual = (left, right) => {
    if (!/^[a-f0-9]{64}$/i.test(left || '') || !/^[a-f0-9]{64}$/i.test(right || '')) return false;
    return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
};
