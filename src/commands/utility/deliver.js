import { generateInvoice } from '../../lib/invoiceGenerator.js';
import { settings } from '../../config/settings.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
    name: 'deliver',
    aliases: ['kirimvps', 'sendvps', 'orderdone'],
    description:
        'Send VPS details via PDF (No Emojis). Usage: .deliver <product> | <price> | <ip> | <user> | <pass> | <region> | <due_date>',
    category: 'Utility',
    execute: async (sock, m, args, text) => {
        if (!text) {
            return m.reply(
                `*VPS DELIVERY SYSTEM*

` +
                    `Format:
${settings.prefix}deliver Product Name | Price | IP Address | Username | Password | Region | Next Due Date

` +
                    `Example:
${settings.prefix}deliver VPS Debian 13 KVM | 100000 | 158.69.207.97 | root | mypassword123 | USA - North Canada | 12 Feb 2026`
            );
        }

        const parts = text.split('|').map((p) => p.trim());
        const [product, priceStr, ip, user, pass, region, dueDate] = parts;

        const price = parseInt(priceStr?.replace(/[^0-9]/g, '')) || 0;

        if (!product || !ip || !pass) {
            return m.reply('Error: Missing required fields. Please check the format.');
        }

        const orderId = `ORD-${Math.random().toString(36).substring(2, 11).toUpperCase()}`;

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
            `DETAIL AKSES VPS
` +
            `------------------------------------------------
` +
            `IP Address : ${ip}
` +
            `Username   : ${user || 'root'}
` +
            `Password   : ${pass}
` +
            `Region     : ${region || 'Global'}
` +
            `Next Due   : ${dueDate || '-'}

` +
            `PANDUAN LOGIN
` +
            `1. Buka terminal/CMD/Termius
` +
            `2. Ketik: ssh ${user || 'root'}@${ip}
` +
            `3. Masukkan password di atas

` +
            `Butuh bantuan? Hubungi: ${settings.ownerNumber.split('@')[0]}`;

        const invoiceData = {
            from: settings.ownerName || 'Kanata Store',
            to: 'Customer',
            logo: logoBase64,
            number: orderId,
            date: new Date().toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
            }),
            currency: 'IDR',
            items: [
                {
                    name: `${product} (${region || 'Global'})`,
                    quantity: 1,
                    unit_cost: price,
                    description: `IP: ${ip}`,
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
                    fileName: `${orderId}.pdf`,
                    caption: `Order completed. Check the attached document for access details.`,
                },
                { quoted: m }
            );
            await m.react('✅');
        } catch (error) {
            console.error('Delivery Error:', error);
            await m.react('❌');
            await m.reply(`Failed to create document: ${error.message}`);
        }
    },
};
