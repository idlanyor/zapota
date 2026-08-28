import axios from 'axios';
import { settings } from '../../config/settings.js';
import logger from '../../utils/logger.js';

export default {
    name: 'cekbank',
    aliases: ['validatebank', 'cekewallet'],
    description: 'Validate bank account or e-wallet number',
    category: 'Tools',
    usage: '.cekbank <type> <code> <number>\nExample: .cekbank ewallet dana 08123456789',
    execute: async (sock, m, args, text) => {
        if (args.length < 3) {
            return m.reply(
                `Format salah. Gunakan: .cekbank <type> <code> <number>\n\nContoh:\n.cekbank ewallet dana 08123456789\n.cekbank bank bca 1234567890`
            );
        }

        const [type, code, number] = args;
        const apiKey = settings.mpApiKey;

        if (!apiKey) {
            return m.reply('API Key (MP_APIKEY) belum dikonfigurasi di server.');
        }

        await m.react('⏳');

        try {
            const response = await axios.get('https://mustikapayment.com/api/validate-bank', {
                params: {
                    type: type.toLowerCase(),
                    code: code.toLowerCase(),
                    number: number,
                },
                headers: {
                    accept: 'application/json',
                    'x-api-key': apiKey,
                },
            });

            const result = response.data;
            logger.info('CekBank Debug:', JSON.stringify(result, null, 2));

            const isSuccess = result.status === true || result.status === 'success';
            const data = result.data || result; // Use result.data if it exists, otherwise use root result

            // Check if we have a valid name in either location
            const name = data.account_name || data.name;
            const resNumber = data.customer_number || data.number || number;
            const resCode = data.product_code || data.code || code;

            if (isSuccess && name) {
                let message = `*「 VALIDASI BANK/E-WALLET 」*\n\n`;
                message += `• *Nama:* ${name}\n`;
                message += `• *Nomor:* ${resNumber}\n`;
                message += `• *Kode:* ${resCode.toUpperCase()}\n`;
                message += `• *Tipe:* ${type.toUpperCase()}\n`;

                if (data.bank_name) message += `• *Bank:* ${data.bank_name}\n`;

                await m.reply(message);
                await m.react('✅');
            } else {
                const failMsg =
                    result.message || result.error || 'Data tidak ditemukan atau nomor salah.';
                await m.react('❌');
                await m.reply(`Gagal memvalidasi: ${failMsg}`);
            }
        } catch (error) {
            logger.error('CekBank Error:', error.response ? error.response.data : error.message);
            const errorMsg =
                error.response && error.response.data && error.response.data.message
                    ? error.response.data.message
                    : 'Terjadi kesalahan saat menghubungi server validasi.';
            await m.react('❌');
            await m.reply(`Error: ${errorMsg}`);
        }
    },
};
