import { buttonHandlers } from '../lib/commands.js';

/**
 * Dynamic Universal Button Dispatcher
 * Menangani semua interaksi tombol berdasarkan pendaftaran otomatis dari plugin
 */
export const handleButtons = async (sock, m, isOwner) => {
    // Ambil buttonId dari berbagai kemungkinan tipe pesan
    const buttonId =
        m.message?.buttonsResponseMessage?.selectedButtonId ||
        m.message?.templateButtonReplyMessage?.selectedId ||
        m.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
        '';

    if (!buttonId) return false;

    // Ambil prefix (bagian sebelum underscore pertama)
    // Contoh: 'ttdl_video_xyz' -> prefix: 'ttdl'
    const prefix = buttonId.split('_')[0].toLowerCase();

    // Cari handler yang cocok di Map buttonHandlers
    const handler = buttonHandlers.get(prefix);

    if (handler) {
        try {
            return await handler(sock, m, isOwner);
        } catch (err) {
            console.error(`Error in Button Handler for prefix ${prefix}:`, err);
            await m.reply(`❌ Terjadi kesalahan saat memproses tombol: ${err.message}`);
            return true;
        }
    }

    return false;
};
