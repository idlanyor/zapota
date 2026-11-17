import dotenv from 'dotenv';
import logger from '../../utils/logger.js';
import { validateEnv } from '../../config/env.js';

export default {
    name: 'reloadenv',
    description: 'Reload environment variables from .env file (Owner Only)',
    category: 'Owner',
    execute: async (sock, m) => {
        try {
            dotenv.config({ override: true, quiet: true });
            // settings/env read process.env live, so nothing else needs syncing.
            const { errors, warnings, features } = validateEnv();
            const on = Object.keys(features).filter((f) => features[f] === 'on');
            logger.info(`--- ENV RELOADED --- features on: ${on.join(', ')}`);

            const problems = [...errors, ...warnings];
            await m.reply(
                `✅ File \`.env\` berhasil dimuat ulang.\n\n*Fitur aktif:* ${on.join(', ') || '-'}` +
                    (problems.length ? `\n\n⚠️ *Perlu dicek:*\n- ${problems.join('\n- ')}` : '')
            );
        } catch (err) {
            await m.reply(`❌ Gagal reload .env: ${err.message}`);
        }
    },
};
