import { smm } from '../../services/smm.js';
import User from '../../database/models/User.js';
import Transaction from '../../database/models/Transaction.js';
import { settings } from '../../config/settings.js';

export default {
    name: 'smm',
    description: 'SMM Panel (IG & TikTok Services) - Owner Only',
    category: 'Tools',
    execute: async (sock, m, args, text) => {
        // Owner Check
        const isOwner = m.sender === settings.ownerNumber || m.sender === settings.ownerLid;
        if (!isOwner)
            return m.reply(
                'Akses Ditolak. Fitur ini masih dalam tahap pengembangan dan hanya bisa diakses oleh Owner.'
            );

        const subCommand = args[0]?.toLowerCase();

        if (subCommand === 'list' || !subCommand) {
            await m.react('⏳');
            const services = await smm.getServices();

            if (services.error) {
                await m.react('❌');
                return m.reply(`❌ Error: ${services.error}`);
            }
            if (services.length === 0) {
                await m.react('❌');
                return m.reply('⚠️ Tidak ada layanan Instagram/TikTok yang ditemukan.');
            }

            let response = `*── 「 SMM STORE MENU 」 ──*\n\n`;
            response += `_Harga sudah termasuk markup Rp 2.000_\n\n`;

            // Group by category
            const categories = [...new Set(services.map((s) => s.category))];

            categories.forEach((cat) => {
                // Shorten category name
                const displayCat = cat.replace(/Layanan |Instagram |TikTok |\[.*?\]/gi, '').trim();
                response += `*🔹 ${displayCat.toUpperCase()}*\n`;

                const catServices = services.filter((s) => s.category === cat);
                // Increased limit and better labeling
                catServices.slice(0, 20).forEach((s) => {
                    const isStable = s.name.includes('360');
                    let cleanName = s.name
                        .replace(/Instagram|TikTok|Followers|Likes|Views|\[.*?\]|\|.*$/gi, '')
                        .replace(/[^\x00-\x7F]/g, '')
                        .trim();

                    if (cleanName.length > 40) cleanName = cleanName.substring(0, 37) + '...';

                    response += `  ID: \`${s.id}\` - Rp ${s.price.toLocaleString('id-ID')}${isStable ? ' ⭐' : ''}\n`;
                    response += `  └ ${cleanName || 'Reguler Service'}${isStable ? ' [360 Hari]' : ''}\n`;
                });
                response += `\n`;
            });

            response += `*Format Order:*\n.smm order <ID> <Link> <Jumlah>\n\n_Contoh: .smm order 6035 https://ig.com/p/xxx 1000_`;
            await m.react('✅');
            return m.reply(response);
        }

        if (subCommand === 'order') {
            const serviceId = args[1];
            const target = args[2];
            const quantity = parseInt(args[3]);

            if (!serviceId || !target || isNaN(quantity)) {
                return m.reply(
                    `Usage: .smm order <id> <link> <jumlah>\nExample: .smm order 123 https://ig.com/p/xxx 1000`
                );
            }

            // Find service to check price and min/max
            const services = await smm.getServices();
            const service = services.find((s) => s.id == serviceId);

            if (!service) return m.reply('Service ID not found or not available.');

            if (quantity < service.min || quantity > service.max) {
                return m.reply(`Quantity must be between ${service.min} and ${service.max}.`);
            }

            const totalPrice = Math.ceil((service.price / 1000) * quantity);

            await m.react('⏳');

            const order = await smm.placeOrder(serviceId, target, quantity);

            if (order.error) {
                await m.react('❌');
                return m.reply(`❌ Gagal Order: ${order.error}`);
            }

            if (order.order) {
                // Log Transaction (Opsional, buat catatan owner aja)
                try {
                    await Transaction.create({
                        userId: m.sender,
                        userName: m.pushName,
                        type: 'expense',
                        amount: totalPrice,
                        category: 'SMM',
                        source: 'smm',
                        description: `SMM Order ID: ${order.order} (${service.name})`,
                    });
                } catch (e) {
                    console.error('Failed to log transaction:', e);
                }

                let resMsg = `*── 「 ORDER SUCCESS 」 ──*\n\n`;
                resMsg += `➛ *Order ID:* ${order.order}\n`;
                resMsg += `➛ *Service:* ${service.name}\n`;
                resMsg += `➛ *Target:* ${target}\n`;
                resMsg += `➛ *Quantity:* ${quantity}\n\n`;
                resMsg += `Gunakan \`.smm status ${order.order}\` untuk cek status.`;

                await m.react('✅');
                return m.reply(resMsg);
            } else {
                await m.react('❌');
                return m.reply(`Failed to place order: ${JSON.stringify(order)}`);
            }
        }

        if (subCommand === 'status') {
            const orderId = args[1];
            if (!orderId) return m.reply('Provide Order ID. Example: .smm status 23501');

            const status = await smm.getStatus(orderId);
            if (status.error) return m.reply(`Error: ${status.error}`);

            let resMsg = `*── 「 ORDER STATUS 」 ──*\n\n`;
            resMsg += `➛ *Order ID:* ${orderId}\n`;
            resMsg += `➛ *Status:* ${status.status}\n`;
            resMsg += `➛ *Charge:* ${status.charge} ${status.currency}\n`;
            resMsg += `➛ *Start Count:* ${status.start_count}\n`;
            resMsg += `➛ *Remains:* ${status.remains}`;

            return m.reply(resMsg);
        }

        if (subCommand === 'balance' || subCommand === 'saldo') {
            const res = await smm.getBalance();
            if (res.error) return m.reply(`❌ Gagal cek saldo: ${res.error}`);

            const balanceNum = parseFloat(res.balance || 0);
            const formattedBalance = new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: 'IDR',
                minimumFractionDigits: 0,
            }).format(balanceNum);

            return m.reply(
                `*── 「 SMM PANEL BALANCE 」 ──*\n\n` +
                    `➛ *Saldo:* ${formattedBalance}\n` +
                    `➛ *User:* ${settings.ownerName}`
            );
        }

        m.reply('Invalid command. Use .smm list, .smm order, .smm status, or .smm balance.');
    },
};
