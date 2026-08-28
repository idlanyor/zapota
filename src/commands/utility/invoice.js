import { generateInvoice } from '../../lib/invoiceGenerator.js';
import { settings } from '../../config/settings.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
    name: 'invoice',
    aliases: ['inv', 'bill', 'tagihan'],
    description:
        'Create a PDF invoice instantly. Usage: .invoice <item> | <price> | <customer_name> | <qty>',
    category: 'Utility',
    execute: async (sock, m, args, text) => {
        if (!text) {
            return m.reply(
                `*INVOICE GENERATOR*

` +
                    `Usage: ${settings.prefix}invoice <item> | <price> | <customer> | <qty>

` +
                    `Examples:
` +
                    `• ${settings.prefix}invoice Web Design | 500000
` +
                    `• ${settings.prefix}invoice Server Setup | 150000 | Budi Santoso
` +
                    `• ${settings.prefix}invoice Nasi Goreng | 15000 | Meja 5 | 2`
            );
        }

        const parts = text.split('|').map((p) => p.trim());
        const itemName = parts[0];
        const price = parseInt(parts[1]?.replace(/[^0-9]/g, '')); // Remove non-numeric
        const customerName = parts[2] || 'Customer';
        const quantity = parseInt(parts[3]) || 1;

        if (!itemName || isNaN(price)) {
            return m.reply('❌ Invalid format. Item name and valid price are required.');
        }

        const invoiceNumber = Math.floor(Math.random() * 90000) + 10000; // Random 5 digit

        // Read logo and convert to base64
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

        const invoiceData = {
            from: 'Antidonasi Creative - Kanata Cloud',
            to: customerName,
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
                    name: itemName,
                    quantity: quantity,
                    unit_cost: price,
                },
            ],
            notes: 'Thank you for your business! Payment due upon receipt.',
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
                    fileName: `Invoice-${invoiceNumber}.pdf`,
                    caption: `✅ *Invoice Created!*`,
                },
                { quoted: m }
            );
            await m.react('✅');
        } catch (error) {
            console.error('Invoice Error:', error);
            await m.react('❌');
            await m.reply(`❌ Failed to generate invoice: ${error.message}`);
        }
    },
};
