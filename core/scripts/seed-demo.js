// Seed owner user + identity. Usage: npm run seed -- --owner=62895395590009
import 'dotenv/config';
import { pool } from '../src/database/pool.js';
import { getOrCreateByIdentity, attachIdentity, resolveIdentity } from '../src/identity/service.js';
import { classifyIdentity } from '../src/identity/normalize.js';
import { setUserPassword } from '../src/auth/service.js';
import { updateUser } from '../src/users/service.js';

const OWNER = process.env.CORE_OWNER || '62895395590009';
const PASSWORD = process.env.CORE_OWNER_PASSWORD || '';

const run = async () => {
    const owner = await getOrCreateByIdentity({ value: OWNER, displayName: 'Owner', role: 'owner' });
    await updateUser(owner.id, { role: 'owner', display_name: 'Owner' });

    // Tambah JID + LID ke user yang sama bila diberikan via env
    const extras = [process.env.CORE_OWNER_JID, process.env.CORE_OWNER_LID].filter(Boolean);
    for (const value of extras) {
        const existing = await resolveIdentity(value);
        // Bila identity sudah terpasang ke user lain (mis. LID di-enum sendiri),
        // hapus dulu agar bisa dipindah ke owner.
        if (existing && existing.id !== owner.id) {
            await pool.query('DELETE FROM user_identities WHERE user_id = ? AND normalized_value = ?', [
                existing.id,
                classifyIdentity(value).normalizedValue,
            ]);
        }
        await attachIdentity({ userId: owner.id, value, verified: true });
    }

    if (PASSWORD) {
        await setUserPassword({ userId: owner.id, password: PASSWORD });
    }

    const fresh = await resolveIdentity(OWNER);
    console.log('[seed] owner ready:', fresh.id, fresh.identities);
};

run()
    .catch((error) => {
        console.error('[seed] failed:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
