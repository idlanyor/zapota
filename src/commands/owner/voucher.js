import Voucher from '../../database/models/Voucher.js';
import crypto from 'crypto';

export default {
    name: 'voucher',
    aliases: ['genvoucher'],
    description: 'Generate voucher code (Owner only)',
    category: 'Owner',
    execute: async (sock, m, args, text) => {
        const amount = parseInt(args[0]);
        const quota = parseInt(args[1]) || 1;

        if (isNaN(amount)) return m.reply('Usage: .voucher <amount> [quota]');

        const code = 'VCR-' + crypto.randomBytes(4).toString('hex').toUpperCase();

        await Voucher.create({
            code,
            value: amount,
            quota,
            isPublic: quota > 1,
        });

        await m.reply(
            `*VOUCHER GENERATED*

` +
                `Code: ${code}
` +
                `Value: Rp ${amount.toLocaleString()}
` +
                `Quota: ${quota} user(s)

` +
                `Share this code to your users!`
        );
    },
};
