/**
 * GoBiz / GoPay QRIS Service
 * Provides Dynamic QRIS generator according to ASPI EMVCo specification,
 * and in-memory invoice store for real-case payment gateway simulation.
 */

// In-memory invoice store: Map<orderId, invoiceObject>
export const invoiceStore = new Map();

// Static QRIS payload from GoBiz Merchant profile (IrengCloud by Antidonasi)
export const DEFAULT_STATIC_QRIS =
    process.env.GOBIZ_STATIC_QRIS ||
    '00020101021126610014COM.GO-JEK.WWW01189360091430467026090210G0467026090303UMI51440014ID.CO.QRIS.WWW0215ID10254125107580303UMI5204899953033605802ID5925IrengCloud by Antidonasi,6011PURBALINGGA61055331162070703A01630452EC';

/**
 * Calculates CRC16-CCITT checksum for EMVCo QRIS string
 * Polynomial: 0x1021, Initial: 0xFFFF
 * @param {string} str
 * @returns {string} 4-character hex uppercase
 */
export function calculateCRC16(str) {
    let crc = 0xffff;
    const bytes = Buffer.from(str, 'ascii');
    for (let i = 0; i < bytes.length; i++) {
        crc ^= bytes[i] << 8;
        for (let j = 0; j < 8; j++) {
            if (crc & 0x8000) {
                crc = ((crc << 1) ^ 0x1021) & 0xffff;
            } else {
                crc = (crc << 1) & 0xffff;
            }
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Generates dynamic QRIS payload with specified amount
 * @param {number} amount - Nominal in Rupiah
 * @param {string} [baseStaticQris] - Base static QRIS payload
 * @returns {string} Dynamic QRIS string
 */
export function generateDynamicQris(amount, baseStaticQris = DEFAULT_STATIC_QRIS) {
    const amt = Math.round(Number(amount));
    if (!amt || amt <= 0) {
        throw new Error('Amount must be a positive number');
    }

    // 1. Ubah Point of Initiation Method dari 11 (Static) ke 12 (Dynamic)
    let qr = baseStaticQris.replace('010211', '010212');

    // 2. Buang Tag 63 (CRC lama) di 8 karakter terakhir jika ada
    if (/6304[A-Fa-f0-9]{4}$/.test(qr)) {
        qr = qr.slice(0, -8);
    }

    // 3. Bentuk Tag 54 (Transaction Amount)
    const amtStr = amt.toString();
    const tag54 = `54${String(amtStr.length).padStart(2, '0')}${amtStr}`;

    // 4. Sisipkan Tag 54 sebelum Tag 58 (Country Code 5802ID)
    const idx58 = qr.indexOf('5802ID');
    if (idx58 !== -1) {
        qr = qr.slice(0, idx58) + tag54 + qr.slice(idx58);
    } else {
        qr = qr + tag54;
    }

    // 5. Tambahkan header Tag 63 dan hitung CRC16
    const payloadWithoutCrc = qr + '6304';
    const crcHex = calculateCRC16(payloadWithoutCrc);

    return payloadWithoutCrc + crcHex;
}

/**
 * Returns a public image URL rendering the QR code
 * @param {string} qrisString
 * @param {number} [size=350]
 * @returns {string}
 */
export function getQrImageUrl(qrisString, size = 350) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(qrisString)}`;
}

/**
 * Creates and registers a new invoice
 * @param {Object} params
 * @param {number} params.amount
 * @param {string} [params.customerPhone]
 * @param {string} [params.chatId]
 * @returns {Object} invoice details
 */
export function createInvoice({ amount, customerPhone, chatId }) {
    const orderId = `INV-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    const qrisString = generateDynamicQris(amount);
    const qrImageUrl = getQrImageUrl(qrisString, 400);

    const invoice = {
        orderId,
        amount: Math.round(Number(amount)),
        customerPhone: customerPhone || null,
        chatId: chatId || null,
        status: 'pending',
        qrisString,
        qrImageUrl,
        createdAt: new Date(),
        settledAt: null,
    };

    invoiceStore.set(orderId, invoice);
    return invoice;
}

/**
 * Finds invoice by orderId
 * @param {string} orderId
 * @returns {Object|null}
 */
export function getInvoice(orderId) {
    return invoiceStore.get(orderId) || null;
}

/**
 * Marks invoice as paid / settled
 * @param {string} orderId
 * @returns {Object|null}
 */
export function markInvoiceSettled(orderId) {
    const inv = invoiceStore.get(orderId);
    if (!inv) return null;

    inv.status = 'settlement';
    inv.settledAt = new Date();
    return inv;
}

/**
 * Finds and marks the oldest/most recent pending invoice matching a specific amount as settled
 * @param {number} amount
 * @returns {Object|null}
 */
export function markInvoiceSettledByAmount(amount) {
    const amt = Math.round(Number(amount));
    if (!amt || amt <= 0) return null;

    // Find first pending invoice matching amount
    for (const [id, inv] of invoiceStore.entries()) {
        if (inv.status === 'pending' && inv.amount === amt) {
            inv.status = 'settlement';
            inv.settledAt = new Date();
            return inv;
        }
    }
    return null;
}
