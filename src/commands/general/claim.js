import { voucherRepo } from '../../database/repos/voucherRepo.js';
import { userRepo } from '../../database/repos/userRepo.js';
import { transactionRepo } from '../../database/repos/transactionRepo.js';

export default {
    name: 'claim',
    aliases: ['redeem'],
    description: 'Claim a voucher code',
    category: 'Finance',
    execute: async (sock, m, args, text) => {
        const code = args[0]?.toUpperCase();
        if (!code) return m.reply('Please provide a voucher code.');

        const REJECTED = {
            invalid: 'Voucher code is invalid.',
            exhausted: 'This voucher has reached its usage limit.',
            'already-claimed': 'You have already claimed this voucher.',
        };

        if (!(await voucherRepo.findByCode(code))) return m.reply(REJECTED.invalid);

        try {
            if (!(await userRepo.findOne({ jid: m.sender }))) await userRepo.create({ jid: m.sender });

            // Quota check, usage record and balance credit happen atomically.
            const result = await voucherRepo.redeem(code, m.sender);
            if (!result.ok) {
                if (REJECTED[result.reason]) return m.reply(REJECTED[result.reason]);
                throw new Error(`voucher redeem failed: ${result.reason}`);
            }
            const voucher = { value: result.value };
            const user = { balance: result.balance };

            // Record Transaction
            await transactionRepo.create({
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
