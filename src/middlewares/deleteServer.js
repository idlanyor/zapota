export const handleDeleteServerConfirmation = async (m) => {
    const confirm = global.confirmDelete.get(m.sender);
    const body = m.body?.toLowerCase();

    if (body === 'y' || body === 'ya') {
        const { pteroId, force, timeout } = confirm;
        clearTimeout(timeout);
        global.confirmDelete.delete(m.sender);

        await m.react('⏳');

        try {
            const PTERO_URL = process.env.PTERO_URL;
            const PTERO_API_KEY = process.env.PTERO_API_KEY;
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
        const { timeout } = confirm;
        clearTimeout(timeout);
        global.confirmDelete.delete(m.sender);
        await m.reply('❌ Penghapusan dibatalkan.');
        return true;
    }

    return false;
};
