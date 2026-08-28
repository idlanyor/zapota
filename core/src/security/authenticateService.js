import { config } from '../config.js';
import { query } from '../database/pool.js';
import { decryptSecret } from './secretVault.js';
import { safeSignatureEqual, signRequest } from './hmac.js';

export const authenticateService = async ({ headers, method, path, body }) => {
    const clientId = headers['x-kanata-client'];
    const timestamp = headers['x-kanata-timestamp'];
    const nonce = headers['x-kanata-nonce'];
    const signature = headers['x-kanata-signature'];
    if (!clientId || !timestamp || !nonce || !signature) throw Object.assign(new Error('Missing service signature'), { status: 401 });

    const requestTime = Number(timestamp);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(requestTime) || Math.abs(now - requestTime) > config.hmacMaxSkewSeconds) {
        throw Object.assign(new Error('Expired service signature'), { status: 401 });
    }
    if (!/^[a-zA-Z0-9_-]{16,128}$/.test(nonce)) throw Object.assign(new Error('Invalid nonce'), { status: 401 });

    const clients = await query('SELECT * FROM service_clients WHERE client_id = ? AND active = 1', [clientId]);
    const record = clients[0];
    if (!record) throw Object.assign(new Error('Unknown service client'), { status: 401 });

    const expected = signRequest(decryptSecret(record.secret_encrypted), { timestamp, nonce, method, path, body });
    if (!safeSignatureEqual(signature, expected)) throw Object.assign(new Error('Invalid service signature'), { status: 401 });

    try {
        await query(
            `INSERT INTO request_nonces (client_id, nonce, expires_at)
             VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND))`,
            [clientId, nonce, config.hmacMaxSkewSeconds]
        );
    } catch (error) {
        // ER_DUP_ENTRY = duplicate primary key (client_id, nonce) -> replay
        if (error.code === 'ER_DUP_ENTRY') throw Object.assign(new Error('Replayed service request'), { status: 409 });
        throw error;
    }
    await query('UPDATE service_clients SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?', [record.id]);
    let scopes = Array.isArray(record.scopes) ? record.scopes : [];
    if (typeof record.scopes === 'string') {
        try {
            scopes = JSON.parse(record.scopes);
        } catch {
            scopes = [];
        }
    }
    return { id: record.id, clientId: record.client_id, name: record.name, scopes };
};
