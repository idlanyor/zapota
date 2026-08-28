import crypto from 'node:crypto';

const config = () => ({
    baseUrl: (process.env.KANATA_CORE_URL || 'http://127.0.0.1:8790').replace(/\/$/, ''),
    clientId: process.env.KANATA_CORE_CLIENT_ID || '',
    secret: process.env.KANATA_CORE_CLIENT_SECRET || '',
});

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const canonicalRequest = ({ timestamp, nonce, method, path, body }) =>
    [timestamp, nonce, method.toUpperCase(), path, sha256(body || Buffer.alloc(0))].join('.');

const signRequest = (secret, request) =>
    crypto.createHmac('sha256', secret).update(canonicalRequest(request)).digest('hex');

/**
 * Call Kanata Core API dengan service signature (HMAC).
 * @returns {Promise<{ok: boolean, status: number, data?: any, error?: string}>}
 */
export const coreRequest = async (method, path, payload) => {
    const { baseUrl, clientId, secret } = config();
    if (!clientId || !secret) {
        throw new Error('KANATA_CORE_CLIENT_ID / KANATA_CORE_CLIENT_SECRET belum diatur');
    }

    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = crypto.randomBytes(16).toString('base64url');
    const hasBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase()) && payload !== undefined;
    const body = hasBody ? Buffer.from(JSON.stringify(payload)) : Buffer.alloc(0);
    const signature = signRequest(secret, { timestamp, nonce, method, path, body });

    const headers = {
        'x-kanata-client': clientId,
        'x-kanata-timestamp': timestamp,
        'x-kanata-nonce': nonce,
        'x-kanata-signature': signature,
    };
    if (hasBody) headers['content-type'] = 'application/json';

    const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        ...(hasBody ? { body } : {}),
    });
    const text = await response.text();
    let json = {};
    try {
        json = JSON.parse(text);
    } catch {
        json = { error: text };
    }
    return { ok: response.ok, status: response.status, ...json };
};

// Helper identity: resolve phone/JID/LID ke user, buat bila belum ada.
export const ensureUser = async ({ value, displayName = '', role = 'user' }) => {
    const res = await coreRequest('POST', '/v1/identities/ensure', { value, displayName, role });
    return res.ok ? res.data : null;
};

export const resolveUser = async (value) => {
    const res = await coreRequest('GET', `/v1/identities/resolve?value=${encodeURIComponent(value)}`);
    return res.ok ? res.data : null;
};
