import { findUser } from '../../services/userService.js';

export default {
    name: 'balance',
    aliases: ['bal', 'salda', 'saldo'],
    description: 'Check your current balance',
    category: 'Utility',
    execute: async (sock, m, args, text) => {
        const user = await findUser(m.sender);
        const balance = user ? user.balance : 0;

        await m.reply(`Your current balance is: Rp ${balance.toLocaleString()}`);
    },
};
