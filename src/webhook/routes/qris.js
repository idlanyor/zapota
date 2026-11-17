import * as qrisService from '../../services/qrisService.js';
import { reply, normalizeJid } from '../http.js';

const defaultCaption = (amount) =>
    `*TAGIHAN PEMBAYARAN QRIS*\n\n` +
    `💰 Nominal: *Rp ${amount.toLocaleString('id-ID')}*\n` +
    `🏪 Merchant: *IrengCloud by Antidonasi*\n\n` +
    `Silakan scan QRIS di atas melalui GoPay, BCA, Dana, OVO, ShopeePay, atau m-Banking Anda.`;

export default [
    {
        method: 'POST',
        path: '/api/webhook/qris/generate',
        handler: async ({ body, getSocket }) => {
            const { amount: rawAmount, sendTo, caption } = await body();
            const amount = Number(rawAmount);
            if (!rawAmount || isNaN(amount) || amount <= 0) {
                return reply(400, {
                    ok: false,
                    error: 'Invalid payload. Required: positive numeric amount',
                });
            }
            try {
                const qrisString = qrisService.generateDynamicQris(amount);
                const qrImageUrl = qrisService.getQrImageUrl(qrisString);

                let sendResult = null;
                const sock = sendTo ? getSocket() : null;
                if (sock) {
                    const image = await fetch(qrImageUrl, { signal: AbortSignal.timeout(10_000) });
                    if (image.ok) {
                        sendResult = await sock.sendMessage(normalizeJid(sendTo), {
                            image: Buffer.from(await image.arrayBuffer()),
                            caption: caption || defaultCaption(amount),
                            mimetype: 'image/png',
                        });
                    }
                }

                return reply(200, {
                    ok: true,
                    data: {
                        amount,
                        qris_string: qrisString,
                        qr_image_url: qrImageUrl,
                        sent: !!sendResult,
                        messageId: sendResult?.key?.id || null,
                    },
                });
            } catch (err) {
                return reply(500, { ok: false, error: err.message });
            }
        },
    },
];
