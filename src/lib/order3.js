import fs from 'fs';
import path from 'path';

const defaultMarkupPercentage = 10;
const marginGold = 5;
const marginSilver = 7;
const marginBronze = 9;
const marginOwner = 0;

export function order3ManualDir() {
    return './manual';
}

export function order3PriceFile() {
    return './manual/prices.json';
}

export function order3OrderFile() {
    return './manual/orders.json';
}

export function ensureOrder3Storage() {
    const manualDir = order3ManualDir();
    const orderFile = order3OrderFile();

    if (!fs.existsSync(manualDir)) {
        fs.mkdirSync(manualDir, { recursive: true });
    }

    if (!fs.existsSync(orderFile)) {
        fs.writeFileSync(orderFile, '[]');
    }
}

export function getAdminJid() {
    return '601135045162@s.whatsapp.net';
}

export function getMarkupByRole(userRole) {
    let markupPercentage = defaultMarkupPercentage;

    if (userRole === 'GOLD') markupPercentage = marginGold;
    else if (userRole === 'SILVER') markupPercentage = marginSilver;
    else if (userRole === 'BRONZE') markupPercentage = marginBronze;
    else if (userRole === 'OWNER' || userRole === 'admin') markupPercentage = marginOwner;

    return markupPercentage;
}

export function loadOrder3Prices() {
    ensureOrder3Storage();
    const file = order3PriceFile();

    if (!fs.existsSync(file)) return {};

    try {
        const raw = fs.readFileSync(file, 'utf8');
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (e) {
        console.error('ORDER3 price file read error:', e);
        return {};
    }
}

export function loadOrder3Orders() {
    ensureOrder3Storage();
    const file = order3OrderFile();

    if (!fs.existsSync(file)) return [];

    try {
        const raw = fs.readFileSync(file, 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.error('ORDER3 order file read error:', e);
        return [];
    }
}

export function saveOrder3Orders(data) {
    ensureOrder3Storage();
    fs.writeFileSync(order3OrderFile(), JSON.stringify(data, null, 2));
}

export function formatmoneyMY(num) {
    return new Intl.NumberFormat('en-MY', {
        style: 'currency',
        currency: 'MYR',
    }).format(num);
}

export function formatCompactMyr(num) {
    return formatmoneyMY(Math.round(Number(num) * 100) / 100);
}

export function generateOrder3Invoice() {
    const now = new Date();
    return (
        `INV-${now.getFullYear().toString().slice(-2)}` +
        `${String(now.getMonth() + 1).padStart(2, '0')}` +
        `${String(now.getDate()).padStart(2, '0')}-` +
        `${String(now.getHours()).padStart(2, '0')}` +
        `${String(now.getMinutes()).padStart(2, '0')}-` +
        `${Math.floor(1000 + Math.random() * 9000)}`
    );
}

export function getButtonId(m) {
    return (
        m.message?.buttonsResponseMessage?.selectedButtonId ||
        m.message?.templateButtonReplyMessage?.selectedId ||
        m.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
        ''
    );
}

export function getMessageText(m) {
    return (m.body || '').trim();
}

export function getOrder3Input(m) {
    const buttonId = getButtonId(m);
    const textValue = getMessageText(m);
    return {
        buttonId,
        textValue,
        combined: buttonId || textValue || '',
    };
}

export function findOrderIndexByInvoice(orders, invoice) {
    return orders.findIndex((v) => v.invoicePreview === invoice);
}

export function findLatestUserWaitingConfirmOrder(orders, nomor) {
    for (let i = orders.length - 1; i >= 0; i--) {
        if (orders[i].nomor === nomor && orders[i].status === 'WAITING_CONFIRM') {
            return i;
        }
    }
    return -1;
}

export function getFailReasonText(code) {
    if (code === 'invalidid') return 'Invalid ID / Server.';
    if (code === 'wrongdetails') return 'Wrong account details were submitted.';
    if (code === 'unavailable') return 'The product is currently unavailable.';
    if (code === 'providererror') return 'A provider or processing error occurred.';
    return 'Order could not be completed.';
}

export function parseAdminSuccessInvoice(buttonId, textValue) {
    if (buttonId && buttonId.startsWith('order3_success_')) {
        return buttonId.replace('order3_success_', '').trim();
    }

    if (textValue.startsWith('Success ')) {
        return textValue.replace('Success ', '').trim();
    }

    if (textValue.startsWith('✅ Success ')) {
        return textValue.replace('✅ Success ', '').trim();
    }

    return '';
}

export function parseAdminFailedInvoice(buttonId, textValue) {
    if (buttonId && buttonId.startsWith('order3_failed_')) {
        return buttonId.replace('order3_failed_', '').trim();
    }

    if (textValue.startsWith('Failed ')) {
        return textValue.replace('Failed ', '').trim();
    }

    if (textValue.startsWith('❌ Failed ')) {
        return textValue.replace('❌ Failed ', '').trim();
    }

    return '';
}

export function parseFailReason(buttonId, textValue) {
    if (buttonId && buttonId.startsWith('order3_failreason_')) {
        const raw = buttonId.replace('order3_failreason_', '');
        const lastUnderscore = raw.lastIndexOf('_');
        if (lastUnderscore === -1) return { reasonCode: '', invoice: '' };

        return {
            reasonCode: raw.substring(0, lastUnderscore),
            invoice: raw.substring(lastUnderscore + 1),
        };
    }

    if (textValue.startsWith('Reason ')) {
        // format: Reason invalidid INV-...
        const parts = textValue.split(' ');
        if (parts.length >= 3) {
            return {
                reasonCode: parts[1].trim(),
                invoice: parts.slice(2).join(' ').trim(),
            };
        }
    }

    return { reasonCode: '', invoice: '' };
}

export function sendOrder3ToAdminText(orderData, nomor) {
    return `📥 *NEW ORDER3 RECEIVED*

👤 *Name:* ${orderData.pushname || '-'}
📱 *Number:* ${nomor}
🧾 *Invoice:* ${orderData.invoicePreview}
📦 *Code:* ${orderData.productCode}

💰 *Base Price (MYR):* ${formatCompactMyr(orderData.basePriceMyr)}
📈 *Markup:* ${orderData.markupPercentage}%
💳 *Final Selling Price:* ${formatCompactMyr(orderData.finalPriceMyr)}

🎯 *User ID:* ${orderData.uid}
🖥 *Server:* ${orderData.sid}`;
}
