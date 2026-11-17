import { deleteServer } from '../services/pterodactyl.js';
import { pendingServerDeletes } from '../state/pendingServerDeletes.js';

export const handleDeleteServerConfirmation = async (m) => {
    if (!pendingServerDeletes.has(m.sender)) return false;
    const body = m.body?.toLowerCase();

    if (body === 'y' || body === 'ya') {
        const { pteroId, force } = pendingServerDeletes.take(m.sender);

        await m.react('⏳');

        try {
            const { removedFromDb } = await deleteServer(pteroId, { force });

            await m.reply(
                `✅ *SERVER BERHASIL DIHAPUS*\n\nID: ${pteroId}\nDB: ${removedFromDb ? 'Terhapus' : 'Tidak di DB'}`
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
