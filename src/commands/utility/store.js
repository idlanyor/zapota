import User from '../../database/models/User.js';
import Transaction from '../../database/models/Transaction.js';
import Server from '../../database/models/Server.js';
import { createPteroServer } from '../../services/pterodactyl.js';
import { settings } from '../../config/settings.js';

const plans = [
    {
        id: 1,
        name: '100%',
        ram: 3072,
        disk: 3072,
        cpu: 100,
        price: 15000,
        desc: '3 GB RAM · 3 GB Storage',
    },
    {
        id: 2,
        name: '200%',
        ram: 5120,
        disk: 5120,
        cpu: 200,
        price: 20000,
        desc: '5 GB RAM · 5 GB Storage',
    },
    {
        id: 3,
        name: '300%',
        ram: 7168,
        disk: 7168,
        cpu: 300,
        price: 25000,
        desc: '7 GB RAM · 7 GB Storage',
    },
    {
        id: 4,
        name: '400%',
        ram: 9216,
        disk: 10240,
        cpu: 400,
        price: 30000,
        desc: '9 GB RAM · 10 GB Storage',
    },
    {
        id: 5,
        name: '500%',
        ram: 12288,
        disk: 12288,
        cpu: 500,
        price: 35000,
        desc: '12 GB RAM · 12 GB Storage',
    },
    {
        id: 6,
        name: '600%',
        ram: 15360,
        disk: 20480,
        cpu: 600,
        price: 40000,
        desc: '15 GB RAM · 20 GB Storage',
    },
    {
        id: 7,
        name: '700%',
        ram: 20480,
        disk: 25600,
        cpu: 700,
        price: 50000,
        desc: '20 GB RAM · 25 GB Storage',
    },
];

export default {
    name: 'store',
    aliases: ['buy', 'ptero'],
    description: 'Pterodactyl VPS Store',
    category: 'Utility',
    execute: async (sock, m, args, text) => {
        const cmdUsed = m.body.slice(settings.prefix.length).trim().split(' ')[0].toLowerCase();
        let planId = null;

        // Logic: .buy 1 OR .store buy 1 OR .store 1
        if (cmdUsed === 'buy') {
            planId = parseInt(args[0]);
        } else if (args[0]?.toLowerCase() === 'buy') {
            planId = parseInt(args[1]);
        } else if (!isNaN(parseInt(args[0]))) {
            planId = parseInt(args[0]);
        }

        if (planId) {
            const plan = plans.find((p) => p.id === planId);
            if (!plan) {
                return m.reply(
                    `Invalid Plan ID. Use ${settings.prefix}store to see available plans.`
                );
            }

            // Get user from DB
            let user = await User.findOne({ jid: m.sender });
            if (!user) {
                user = await User.create({ jid: m.sender });
            }

            if (user.balance < plan.price) {
                return m.reply(
                    `Insufficient balance.\nYour Balance: Rp ${user.balance.toLocaleString()}\nPrice: Rp ${plan.price.toLocaleString()}\n\nPlease contact owner to topup.`
                );
            }

            await m.react('⏳');

            try {
                // 1. Create Server on Pterodactyl
                const server = await createPteroServer(m.sender, plan);

                // 2. Simpan ke database Server bot (Masa Aktif 30 Hari)
                const expiredDate = new Date();
                expiredDate.setDate(expiredDate.getDate() + 30);

                await Server.create({
                    userId: m.sender,
                    pteroId: server.id,
                    identifier: server.identifier,
                    planName: plan.name,
                    price: plan.price,
                    expiredAt: expiredDate,
                });

                // 3. Deduct Balance
                user.balance -= plan.price;
                await user.save();

                // 3. Record Transaction
                await Transaction.create({
                    userId: m.sender,
                    userName: m.pushName || 'User',
                    type: 'expense',
                    amount: plan.price,
                    category: 'Store',
                    source: 'store',
                    description: `Purchased Ptero VPS Plan ${plan.name} (ID: ${server.id})`,
                });

                const successMsg =
                    `Success Purchased VPS!\n\n` +
                    `Plan: ${plan.name}\n` +
                    `Price: Rp ${plan.price.toLocaleString()}\n` +
                    `Remaining Balance: Rp ${user.balance.toLocaleString()}\n\n` +
                    `Server Details:\n` +
                    `ID: ${server.id}\n` +
                    `Identifier: ${server.identifier}\n` +
                    `Name: ${server.name}\n\n` +
                    `Please check your email/panel for access details.`;

                await m.reply(successMsg);
                await m.react('✅');
            } catch (error) {
                console.error(error);
                await m.react('❌');
                await m.reply(`Failed to process order: ${error.message}`);
            }
            return;
        }

        // Show Pricelist
        let storeMsg = `*PTERODACTYL VPS STORE*\n\n`;
        plans.forEach((p) => {
            storeMsg += `*${p.id}. Plan ${p.name}*\n`;
            storeMsg += `Price: Rp ${p.price.toLocaleString()}\n`;
            storeMsg += `Specs: ${p.desc}\n`;
            storeMsg += `--------------------------\n`;
        });

        storeMsg += `\nTo buy, use: ${settings.prefix}buy <id>\nExample: ${settings.prefix}buy 1`;

        // Add user balance info
        const user = await User.findOne({ jid: m.sender });
        const balance = user ? user.balance : 0;
        storeMsg += `\n\nYour Balance: Rp ${balance.toLocaleString()}`;

        await m.reply(storeMsg);
    },
};
