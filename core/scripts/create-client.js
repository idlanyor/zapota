// Buat service client baru. Usage: npm run client:create -- --name "Kanata Bot" --client-id kanata_bot
import 'dotenv/config';
import crypto from 'node:crypto';
import { pool } from '../src/database/pool.js';
import { encryptSecret } from '../src/security/secretVault.js';

const raw = process.argv.slice(2);
const read = (flag) => {
    const idx = raw.indexOf(flag);
    return idx !== -1 && raw[idx + 1] ? raw[idx + 1] : null;
};
const name = read('--name') || 'Service Client';
const clientId = read('--client-id') || `client_${crypto.randomBytes(4).toString('hex')}`;
const scopes = (read('--scopes') || '*').split(',');

const run = async () => {
    const secret = crypto.randomBytes(32).toString('hex');
    await pool.query(
        'INSERT INTO service_clients (id, client_id, name, secret_encrypted, scopes, active) VALUES (?, ?, ?, ?, ?, 1)',
        [crypto.randomUUID(), clientId, name, encryptSecret(secret), JSON.stringify(scopes)]
    );
    console.log(`CLIENT_ID=${clientId}`);
    console.log(`CLIENT_SECRET=${secret}`);
    console.log(`[client] created '${name}' with scopes: ${scopes.join(', ')}`);
};

run()
    .catch((error) => {
        console.error('[client] failed:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
