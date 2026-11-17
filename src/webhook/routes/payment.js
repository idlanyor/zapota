import * as qrisService from '../../services/qrisService.js';
import { settings } from '../../config/settings.js';
import { decodeJid } from '../../utils/serialize.js';
import logger from '../../utils/logger.js';
import { reply, normalizeJid } from '../http.js';

const MERCHANT = 'IrengCloud by Antidonasi';
const rupiah = (n) => `Rp ${n.toLocaleString('id-ID')}`;

/**
 * Normalize a payment notification from GoBiz (native event), Midtrans,
 * or a phone-notification forwarder (MacroDroid: title/text with "Rp 25.000").
 */
export const parsePaymentNotification = (body) => {
    const gobizTx = body.body?.transaction || {};
    const eventName = body.header?.event_name || '';
    const text = `${body.title || ''} ${
        body.text ||
        body.message ||
        body.notif_text ||
        body.notif_body ||
        (typeof body.body === 'string' ? body.body : '') ||
        ''
    }`;

    let amountFromText = 0;
    const rpMatch = text.match(/(?:Rp\.?|sebesar)\s*([0-9]{1,3}(?:[.,][0-9]{3})*|[0-9]+)/i);
    if (rpMatch) amountFromText = parseInt(rpMatch[1].replace(/[.,]/g, ''), 10) || 0;

    const amount = Math.round(
        Number(
            gobizTx.gross_amount ||
                body.gross_amount ||
                body.amount ||
                body.settlement_amount ||
                amountFromText ||
                0
        )
    );

    const status = (
        gobizTx.status ||
        body.transaction_status ||
        body.status ||
        (eventName === 'payment.transaction.settlement' ? 'settlement' : '')
    ).toLowerCase();

    const looksPaid = /(pembayaran|berhasil|diterima|sukses|settlement|gopay|qris|paid)/i.test(
        text
    );
    const isSuccess =
        eventName === 'payment.transaction.settlement' ||
        ['settlement', 'capture', 'success', 'paid'].includes(status) ||
        Boolean(looksPaid && amount > 0);

    return {
        explicitOrderId:
            gobizTx.order_id ||
            body.order_id ||
            body.transaction_id ||
            gobizTx.id ||
            body.id ||
            null,
        amount,
        status,
        isSuccess,
        paymentType: (
            gobizTx.payment_type ||
            body.payment_type ||
            (/gopay/i.test(text) ? 'GOPAY' : 'QRIS')
        ).toUpperCase(),
        settlementTime:
            gobizTx.settlement_at ||
            body.settlement_time ||
            body.transaction_time ||
            new Date().toLocaleString('id-ID'),
        customer: body.customer_phone || body.sendTo || null,
    };
};

const notifyPaid = async (
    sock,
    { orderId, amount, paymentType, settlementTime, customer },
    invoice
) => {
    const ownerJid = decodeJid(settings.ownerNumber);

    if (ownerJid) {
        await sock.sendMessage(ownerJid, {
            text:
                `*「 NOTIFIKASI PEMBAYARAN SUKSES 」* 🎉\n\n` +
                `🏪 *Merchant:* ${MERCHANT}\n` +
                `💰 *Nominal:* *${rupiah(amount)}*\n` +
                `🔖 *Order ID:* \`${orderId}\`\n` +
                `💳 *Metode:* ${paymentType}\n` +
                `📅 *Waktu:* ${settlementTime}\n\n` +
                `_Pembayaran telah berhasil diverifikasi sistem!_`,
        });
    }

    // Invoice created from a chat (.qris): confirm in that chat.
    if (invoice?.chatId && invoice.chatId !== ownerJid) {
        await sock.sendMessage(invoice.chatId, {
            text:
                `*「 PEMBAYARAN TERKONFIRMASI LUNAS 」* ✅\n\n` +
                `Invoice \`${orderId}\` telah berhasil dibayar!\n` +
                `💰 *Nominal:* ${rupiah(amount)}\n` +
                `💳 *Metode:* ${paymentType}\n` +
                `📅 *Waktu:* ${settlementTime}\n\n` +
                `_Terima kasih telah melakukan transaksi._`,
        });
    }

    // Receipt to the buyer, unless they already got one of the messages above.
    const customerJid = normalizeJid(customer);
    if (customerJid && customerJid !== ownerJid && customerJid !== invoice?.chatId) {
        await sock.sendMessage(customerJid, {
            text:
                `*「 STRUK PEMBAYARAN 」* ✅\n\n` +
                `Halo! Terima kasih, pembayaran Anda telah kami terima:\n\n` +
                `🏪 *Merchant:* ${MERCHANT}\n` +
                `💰 *Total Bayar:* *${rupiah(amount)}*\n` +
                `🔖 *Order ID:* \`${orderId}\`\n` +
                `💳 *Metode:* QRIS\n` +
                `📅 *Waktu:* ${settlementTime}\n\n` +
                `_Pesanan Anda sedang segera diproses._`,
        });
    }
};

export default [
    {
        // Public: called by the payment gateway / notification forwarder.
        method: 'POST',
        path: '/api/webhook/payment/callback',
        public: true,
        handler: async ({ body, getSocket }) => {
            const input = await body();
            logger.info(`Received Payment Callback: ${JSON.stringify(input)}`, 'WEBHOOK');
            const p = parsePaymentNotification(input);

            // Only a successful payment may settle an invoice (by id, else by amount).
            let invoice = null;
            if (p.isSuccess) {
                if (p.explicitOrderId) invoice = qrisService.markInvoiceSettled(p.explicitOrderId);
                if (!invoice && p.amount > 0)
                    invoice = qrisService.markInvoiceSettledByAmount(p.amount);
            }
            const orderId =
                p.explicitOrderId || invoice?.orderId || `MACRO-${Date.now().toString().slice(-6)}`;

            const sock = getSocket();
            if (sock && p.isSuccess) {
                await notifyPaid(sock, { ...p, orderId }, invoice);
            } else if (!p.isSuccess) {
                logger.info(`Payment status ${p.status} for ${orderId}`, 'WEBHOOK');
            }

            return reply(200, {
                ok: true,
                message: 'Payment notification processed successfully',
                data: { orderId, status: p.status, amount: p.amount },
            });
        },
    },
];
