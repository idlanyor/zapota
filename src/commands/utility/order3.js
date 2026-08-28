import {
    ensureOrder3Storage,
    loadOrder3Prices,
    getMarkupByRole,
    formatCompactMyr,
    generateOrder3Invoice,
    loadOrder3Orders,
    saveOrder3Orders,
    getOrder3Input,
    findLatestUserWaitingConfirmOrder,
    getAdminJid,
    sendOrder3ToAdminText,
    parseAdminSuccessInvoice,
    findOrderIndexByInvoice,
    parseAdminFailedInvoice,
    parseFailReason,
    getFailReasonText,
} from '../../lib/order3.js';
import User from '../../database/models/User.js';

export default {
    name: 'order3',
    aliases: ['manualorder'],
    category: 'Utility',
    description: 'Order products manually via admin',
    buttonPrefix: 'order3',

    handleButton: async (sock, m, isOwner) => {
        const { buttonId, textValue } = getOrder3Input(m);
        const jid = m.sender;
        const nomor = jid.split('@')[0];

        /* ---------- USER PROCEED ---------- */
        if (buttonId === 'order3_yes' || textValue === '✅ Proceed') {
            const orders = loadOrder3Orders();
            const index = findLatestUserWaitingConfirmOrder(orders, nomor);
            if (index === -1) return false;

            const orderData = orders[index];
            let userProfile = (await User.findOne({ jid })) || (await User.create({ jid }));

            if (userProfile.balance < orderData.finalPriceMyr) {
                orders[index].status = 'CANCELLED';
                saveOrder3Orders(orders);
                await m.reply(
                    `❌ *Insufficient Balance*\n\n📦 *Product:* ${orderData.productCode}\n💳 *Price:* ${formatCompactMyr(orderData.finalPriceMyr)}\n💼 *Your Balance:* ${formatCompactMyr(userProfile.balance)}`
                );
                return true;
            }

            userProfile.balance -= orderData.finalPriceMyr;
            await userProfile.save();

            orders[index].status = 'PENDING';
            orders[index].paidAt = Date.now();
            saveOrder3Orders(orders);

            await m.reply(
                `✅ *ORDER SUBMITTED*\n\n🧾 *Invoice:* ${orderData.invoicePreview}\n📦 *Product:* ${orderData.productCode}\n🎯 *User ID:* ${orderData.uid}\n💳 *Paid:* ${formatCompactMyr(orderData.finalPriceMyr)}\n\nOrder Anda telah dikirim ke admin.`
            );

            try {
                await sock.sendMessage(getAdminJid(), {
                    text: sendOrder3ToAdminText(orderData, nomor),
                    footer: 'Kanata Admin Panel',
                    buttons: [
                        {
                            buttonId: `order3_success_${orderData.invoicePreview}`,
                            buttonText: { displayText: `Success ${orderData.invoicePreview}` },
                            type: 1,
                        },
                        {
                            buttonId: `order3_failed_${orderData.invoicePreview}`,
                            buttonText: { displayText: `Failed ${orderData.invoicePreview}` },
                            type: 1,
                        },
                    ],
                });
            } catch (err) {
                await m.reply(`Order submitted, tapi gagal kirim notif ke admin.`);
            }
            return true;
        }

        /* ---------- USER CANCEL ---------- */
        if (buttonId === 'order3_no' || textValue === '❌ Cancel') {
            const orders = loadOrder3Orders();
            const index = findLatestUserWaitingConfirmOrder(orders, nomor);
            if (index === -1) return false;
            orders[index].status = 'CANCELLED';
            saveOrder3Orders(orders);
            await m.reply(`Your Order3 has been cancelled.`);
            return true;
        }

        /* ---------- ADMIN SUCCESS ---------- */
        const parsedSuccessInvoice = parseAdminSuccessInvoice(buttonId, textValue);
        if (parsedSuccessInvoice) {
            if (!isOwner) return m.reply('Admin only.');
            const orders = loadOrder3Orders();
            const index = findOrderIndexByInvoice(orders, parsedSuccessInvoice);
            if (index === -1 || orders[index].status !== 'PENDING')
                return m.reply('Order tidak ditemukan.');

            const orderData = orders[index];
            orders[index].status = 'SUCCESS';
            orders[index].successAt = Date.now();
            saveOrder3Orders(orders);

            await sock.sendMessage(orderData.jid, {
                text: `✅ *ORDER COMPLETED*\n\n🧾 *Invoice:* ${orderData.invoicePreview}\n📦 *Product:* ${orderData.productCode}\n🎯 *ID:* ${orderData.uid}\n💳 *Paid:* ${formatCompactMyr(orderData.finalPriceMyr)}`,
            });
            await m.reply(`✅ *ORDER3 SUCCESS* untuk ${orderData.nomor}`);
            return true;
        }

        /* ---------- ADMIN FAILED ---------- */
        const parsedFailedInvoice = parseAdminFailedInvoice(buttonId, textValue);
        if (parsedFailedInvoice) {
            if (!isOwner) return m.reply('Admin only.');
            const orders = loadOrder3Orders();
            const index = findOrderIndexByInvoice(orders, parsedFailedInvoice);
            if (index === -1 || orders[index].status !== 'PENDING')
                return m.reply('Order tidak ditemukan.');

            orders[index].status = 'WAITING_FAIL_REASON';
            saveOrder3Orders(orders);

            await sock.sendMessage(
                m.chat,
                {
                    text: `❌ *SELECT FAILURE REASON* untuk ${parsedFailedInvoice}`,
                    buttons: [
                        {
                            buttonId: `order3_failreason_invalidid_${parsedFailedInvoice}`,
                            buttonText: { displayText: 'Invalid ID' },
                            type: 1,
                        },
                        {
                            buttonId: `order3_failreason_unavailable_${parsedFailedInvoice}`,
                            buttonText: { displayText: 'Unavailable' },
                            type: 1,
                        },
                    ],
                },
                { quoted: m }
            );
            return true;
        }

        /* ---------- ADMIN FAIL REASON ---------- */
        const parsedFailReason = parseFailReason(buttonId, textValue);
        if (parsedFailReason.reasonCode && parsedFailReason.invoice) {
            if (!isOwner) return m.reply('Admin only.');
            const orders = loadOrder3Orders();
            const index = findOrderIndexByInvoice(orders, parsedFailReason.invoice);
            if (index === -1 || orders[index].status !== 'WAITING_FAIL_REASON')
                return m.reply('Sesi alasan gagal tidak ditemukan.');

            const orderData = orders[index];
            const userProfile = await User.findOne({ jid: orderData.jid });
            const failReason = getFailReasonText(parsedFailReason.reasonCode);

            if (userProfile) {
                userProfile.balance += orderData.finalPriceMyr;
                await userProfile.save();
            }

            orders[index].status = 'FAILED';
            orders[index].failedAt = Date.now();
            orders[index].failReason = failReason;
            saveOrder3Orders(orders);

            await sock.sendMessage(orderData.jid, {
                text: `❌ *ORDER FAILED*\n\nInvoice: ${orderData.invoicePreview}\n💸 *Refunded:* ${formatCompactMyr(orderData.finalPriceMyr)}\n*Reason:* ${failReason}`,
            });
            await m.reply(`❌ *ORDER3 FAILED* dikembalikan ke ${orderData.nomor}`);
            return true;
        }

        return false;
    },

    execute: async (sock, m, args) => {
        ensureOrder3Storage();
        const jid = m.sender;
        const nomor = jid.split('@')[0];
        const priceList = loadOrder3Prices();

        let userProfile = (await User.findOne({ jid })) || (await User.create({ jid }));
        const markupPercentage = getMarkupByRole(userProfile.role);

        if (args.length === 0) {
            const entries = Object.entries(priceList)
                .map(([code, myrPrice]) => ({
                    code,
                    finalPrice:
                        Math.round(Number(myrPrice) * (1 + markupPercentage / 100) * 100) / 100,
                }))
                .sort((a, b) => a.finalPrice - b.finalPrice);

            const list = entries
                .slice(0, 20)
                .map((it, i) => `${i + 1}. *${it.code}* — ${formatCompactMyr(it.finalPrice)}`)
                .join('\n');
            return m.reply(
                `🛒 *ORDER3 PRICE LIST*\n\n${list}\n\n📌 Format: .order3 <code> <id> <server>`
            );
        }

        const productCode = args[0]?.toUpperCase();
        if (!priceList[productCode]) return m.reply(`Produk tidak ditemukan.`);

        const finalPriceMyr =
            Math.round(parseFloat(priceList[productCode]) * (1 + markupPercentage / 100) * 100) /
            100;
        if (userProfile.balance < finalPriceMyr) return m.reply(`Saldo tidak cukup.`);

        const invoicePreview = generateOrder3Invoice();
        const orders = loadOrder3Orders();

        orders.push({
            type: 'order3',
            status: 'WAITING_CONFIRM',
            jid,
            nomor,
            pushname: m.pushName,
            invoicePreview,
            productCode,
            finalPriceMyr,
            uid: args[1],
            sid: args[2],
            createdAt: Date.now(),
        });
        saveOrder3Orders(orders);

        await sock.sendMessage(
            m.chat,
            {
                text: `🛍️ *ORDER CONFIRMATION*\n\n🧾 Invoice: ${invoicePreview}\n📦 Produk: ${productCode}\n💳 Total: ${formatCompactMyr(finalPriceMyr)}\n\nLanjutkan?`,
                buttons: [
                    { buttonId: 'order3_yes', buttonText: { displayText: '✅ Proceed' }, type: 1 },
                    { buttonId: 'order3_no', buttonText: { displayText: '❌ Cancel' }, type: 1 },
                ],
            },
            { quoted: m }
        );
    },
};
