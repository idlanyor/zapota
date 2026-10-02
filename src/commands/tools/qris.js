import * as qrisService from '../../services/qrisService.js';
import { settings } from '../../config/settings.js';

export default {
    name: 'qris',
    aliases: ['qrisdinamis', 'tagihan', 'invoice'],
    description: 'Generate Dynamic QRIS GoBiz / GoPay toko IrengCloud dengan nominal tertentu',
    category: 'Tools',
    usage: `${settings.prefix}qris <nominal>\nContoh: ${settings.prefix}qris 15000`,
    execute: async (sock, m, args) => {
        if (!args[0]) {
            return m.reply(
                `*「 QRIS DINAMIS GOBIZ 」*\n\n` +
                `Gunakan perintah:\n` +
                `*${settings.prefix}qris <nominal>*\n\n` +
                `Contoh:\n` +
                `*${settings.prefix}qris 15000*\n` +
                `*${settings.prefix}qris 50000*`
            );
        }

        // Parse amount (support formats like "15.000", "15000", "15k")
        let rawAmount = args[0].toLowerCase().trim().replace(/rp|\./g, '');
        if (rawAmount.endsWith('k')) {
            rawAmount = parseFloat(rawAmount.slice(0, -1)) * 1000;
        }

        const amount = Math.round(Number(rawAmount));
        if (isNaN(amount) || amount <= 0) {
            return m.reply('❌ Nominal harus berupa angka positif!');
        }

        if (amount < 1000) {
            return m.reply('❌ Minimal transaksi QRIS adalah Rp 1.000');
        }

        await m.react('⏳');

        try {
            const invoice = qrisService.createInvoice({
                amount,
                customerPhone: m.sender ? m.sender.split('@')[0] : null,
                chatId: m.chat,
            });

            const caption =
                `*「 TAGIHAN PEMBAYARAN QRIS 」*\n\n` +
                `🔖 *Order ID:* \`${invoice.orderId}\`\n` +
                `🏪 *Merchant:* IrengCloud by Antidonasi\n` +
                `📍 *Lokasi:* Purbalingga\n` +
                `💰 *Nominal:* *Rp ${amount.toLocaleString('id-ID')}*\n` +
                `🆔 *NMID:* ID1025412510758\n\n` +
                `📌 *Cara Pembayaran:*\n` +
                `1. Scan QR Code di atas menggunakan GoPay, BCA, OVO, Dana, ShopeePay, atau m-Banking.\n` +
                `2. Pastikan nama merchant *IrengCloud by Antidonasi* & nominal *Rp ${amount.toLocaleString('id-ID')}*.\n` +
                `3. Masukkan PIN Anda.\n\n` +
                `_⚡ Simulasi Webhook GoBiz: Begitu event settlement masuk untuk Order ID ini, bot akan langsung mengirimkan notifikasi lunas ke chat ini!_`;

            // Unduh gambar QR buffer untuk dikirimkan langsung
            const imageResponse = await fetch(invoice.qrImageUrl, {
                signal: AbortSignal.timeout(10_000),
            });

            if (!imageResponse.ok) {
                throw new Error(`Failed to fetch QR image: HTTP ${imageResponse.status}`);
            }

            const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

            // Kirim gambar QRIS ke chat WhatsApp
            await sock.sendMessage(
                m.chat,
                {
                    image: imageBuffer,
                    caption: caption,
                    mimetype: 'image/png',
                },
                { quoted: m }
            );

            await m.react('✅');
        } catch (err) {
            await m.react('❌');
            return m.reply(`❌ Gagal generate QRIS: ${err.message}`);
        }
    },
};
