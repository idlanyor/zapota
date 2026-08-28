import Voucher from '../../database/models/Voucher.js';
import User from '../../database/models/User.js';
import Transaction from '../../database/models/Transaction.js';

export default {
    name: 'claim',
    aliases: ['redeem'],
    description: 'Claim a voucher code',
    category: 'Finance',
    execute: async (sock, m, args, text) => {
        const code = args[0]?.toUpperCase();
        if (!code) return m.reply('Please provide a voucher code.');

        const voucher = await Voucher.findOne({ code });
        if (!voucher) return m.reply('Voucher code is invalid.');

        if (voucher.quota <= 0) return m.reply('This voucher has reached its usage limit.');
        if (voucher.usedBy.includes(m.sender))
            return m.reply('You have already claimed this voucher.');

        try {
            // Update User Balance
            let user = await User.findOne({ jid: m.sender });
            if (!user) user = await User.create({ jid: m.sender });

            user.balance += voucher.value;
            await user.save();

            // Update Voucher
            voucher.usedBy.push(m.sender);
            voucher.quota -= 1;
            await voucher.save();

            // Record Transaction
            await Transaction.create({
                userId: m.sender,
                userName: m.pushName || 'User',
                type: 'income',
                amount: voucher.value,
                category: 'Voucher',
                source: 'general',
                description: `Claimed voucher: ${code}`,
            });

            await m.reply(
                `*VOUCHER CLAIMED*

` +
                    `Berhasil mengklaim voucher: ${code}
` +
                    `Saldo ditambahkan: + Rp ${voucher.value.toLocaleString()}
` +
                    `Saldo Anda sekarang: Rp ${user.balance.toLocaleString()}`
            );
        } catch (error) {
            console.error(error);
            await m.reply('Gagal mengklaim voucher. Silakan hubungi admin.');
        }
    },
};
