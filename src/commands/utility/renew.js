import { generateInvoice } from '../../lib/invoiceGenerator.js';
import { settings } from '../../config/settings.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
    name: 'renew',
    aliases: ['perpanjang', 'extend', 'tagih'],
    description:
        'Send Renewal Invoice (No Credentials). Usage: .renew <product/IP> | <price> | <customer> | <next_due_date>',
    category: 'Utility',
    execute: async (sock, m, args, text) => {
        if (!text) {
            return m.reply(
                `*RENEWAL INVOICE SYSTEM*

` +
                    `Format:
${settings.prefix}renew Product/IP | Price | Customer Name | Next Due Date

` +
                    `Example:
${settings.prefix}renew VPS 158.69.207.97 | 100000 | Roy | 12 March 2026`
            );
        }

        const parts = text.split('|').map((p) => p.trim());
        const [product, priceStr, customer, nextDueDate] = parts;

        const price = parseInt(priceStr?.replace(/[^0-9]/g, '')) || 0;

        if (!product || isNaN(price)) {
            return m.reply('Error: Product name/IP and valid price are required.');
        }

        const invoiceNumber = `INV-REN-${Math.floor(Math.random() * 90000) + 10000}`;

        // Read logo
        let logoBase64 = '';
        try {
            const logoPath = path.join(__dirname, '../../assets/antidonasi.png');
            if (fs.existsSync(logoPath)) {
                const logoBuffer = fs.readFileSync(logoPath);
                logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
            }
        } catch (e) {
            console.error('Logo read error:', e);
        }

        const notes =
            `RENEWAL INFORMATION
` +
            `------------------------------------------------
` +
            `Service    : ${product}
` +
            `Action     : Service Extension
` +
            `New Period : Until ${nextDueDate || '1 Month'}

` +
            `PAYMENT INSTRUCTION
` +
            `Please complete payment to avoid service suspension.
` +
            `Confirmation: ${settings.ownerNumber.split('@')[0]}`;

        const invoiceData = {
            from: settings.ownerName || 'Kanata Store',
            to: customer || 'Valued Customer',
            logo: logoBase64,
            number: invoiceNumber,
            date: new Date().toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
            }),
            currency: 'IDR',
            items: [
                {
                    name: `Renewal: ${product}`,
                    quantity: 1,
                    unit_cost: price,
                    description: `Extension until ${nextDueDate}`,
                },
            ],
            notes: notes,
            fields: {
                tax: '%',
                discounts: false,
                shipping: false,
            },
        };

        try {
            await m.react('⏳');

            const apiKey = process.env.INVOICE_API_KEY;
            const pdfBuffer = await generateInvoice(invoiceData, apiKey);

            await sock.sendMessage(
                m.chat,
                {
                    document: pdfBuffer,
                    mimetype: 'application/pdf',
                    fileName: `${invoiceNumber}.pdf`,
                    caption: `Billing for ${product} is ready.`,
                },
                { quoted: m }
            );
            await m.react('✅');
        } catch (error) {
            console.error('Renew Error:', error);
            await m.react('❌');
            await m.reply(`Failed to create invoice: ${error.message}`);
        }
    },
};
