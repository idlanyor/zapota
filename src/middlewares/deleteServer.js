import { env } from '../config/env.js';
import { pendingServerDeletes } from '../state/pendingServerDeletes.js';

export const handleDeleteServerConfirmation = async (m) => {
    if (!pendingServerDeletes.has(m.sender)) return false;
    const body = m.body?.toLowerCase();

    if (body === 'y' || body === 'ya') {
        const { pteroId, force } = pendingServerDeletes.take(m.sender);

        await m.react('⏳');

        try {
            const PTERO_URL = env.PTERO_URL;
            const PTERO_API_KEY = env.PTERO_API_KEY;
            const axios = (await import('axios')).default;

            const ptero = axios.create({
                baseURL: `${PTERO_URL}/api/application`,
                headers: {
                    Authorization: `Bearer ${PTERO_API_KEY}`,
                    'Content-Type': 'application/json',
                    Accept: 'Application/vnd.pterodactyl.v1+json',
                },
            });

            try {
                await ptero.delete(force ? `/servers/${pteroId}/force` : `/servers/${pteroId}`);
            } catch (e) {
                if (e.response?.status !== 404) throw e;
            }

            const Server = (await import('../database/models/Server.js')).default;
            const deletedDb = await Server.deleteOne({ pteroId });

            await m.reply(
                `✅ *SERVER BERHASIL DIHAPUS*\n\nID: ${pteroId}\nDB: ${deletedDb.deletedCount > 0 ? 'Terhapus' : 'Tidak di DB'}`
            );
            await m.react('✅');
        } catch (err) {
            await m.react('❌');
            await m.reply(`❌ Gagal menghapus server: ${err.message}`);
        }
        return true;
    }

    if (body) {
        pendingServerDeletes.take(m.sender);
        await m.reply('❌ Penghapusan dibatalkan.');
        return true;
    }

    return false;
};
