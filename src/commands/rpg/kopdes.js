import { KOPDES_ITEMS, getOrCreatePlayer } from '../../services/rpgService.js';
import RpgInventory from '../../database/models/RpgInventory.js';
import { getRpgHeaderImage, sendRpgReply } from '../../lib/rpgVisuals.js';
import { recordRpgActivity } from '../../services/rpgProgressService.js';

export default {
    name: 'kopdes',
    aliases: ['toko', 'minimarket', 'beli', 'belikopdes'],
    description: 'Belanja kebutuhan pokok di Minimarket Kopdes Merah Putih',
    category: 'RPG',
    execute: async (sock, m, args, text) => {
        const sender = m.sender;
        const cmd =
            m.command || (m.body ? m.body.slice(1).trim().split(/\s+/)[0].toLowerCase() : 'kopdes');
        const itemList = Object.values(KOPDES_ITEMS);

        try {
            const { user } = await getOrCreatePlayer(sender, m.pushName);

            // Helper: Cari item berdasarkan input (nomor urut 1..N atau ID barang)
            const findItemByInput = (input) => {
                if (!input) return null;
                const clean = String(input).trim().toLowerCase();
                const num = parseInt(clean, 10);
                if (!isNaN(num) && num >= 1 && num <= itemList.length) {
                    return itemList[num - 1];
                }
                return (
                    KOPDES_ITEMS[clean] ||
                    itemList.find(
                        (i) => i.id.toLowerCase() === clean || i.name.toLowerCase().includes(clean)
                    )
                );
            };

            // Helper: Eksekusi Pembelian
            const handleBeli = async (targetParam, qtyParam) => {
                const item = findItemByInput(targetParam);
                if (!item) {
                    return m.reply(
                        `⚠️ Barang tidak ditemukan!\nKetik */kopdes* untuk melihat nomor dan daftar barang.\nContoh: */beli 1* atau */beli 1 5*`
                    );
                }

                const qty = parseInt(qtyParam || '1', 10);
                if (isNaN(qty) || qty <= 0) {
                    return m.reply(
                        '⚠️ Jumlah pembelian harus angka positif minimal 1.\nContoh: */beli 1 2*'
                    );
                }

                const totalPrice = item.price * qty;

                if ((user.balance || 0) < totalPrice) {
                    return m.reply(
                        `💸 Uangmu tidak cukup!\nTotal belanja: *Rp ${totalPrice.toLocaleString()}*\nSaldo kamu saat ini: *Rp ${(user.balance || 0).toLocaleString()}*`
                    );
                }

                // Potong saldo
                user.balance -= totalPrice;
                await user.save();

                // Tambah atau update item di inventory
                let userItem = await RpgInventory.findOne({ userId: sender, itemId: item.id });
                if (userItem) {
                    userItem.quantity += qty;
                    await userItem.save();
                } else {
                    await RpgInventory.create({
                        userId: sender,
                        itemId: item.id,
                        itemName: item.name,
                        category: item.category,
                        quantity: qty,
                    });
                }
                await recordRpgActivity(sender, 'shop');

                return sendRpgReply(
                    sock,
                    m,
                    `✅ *STRUK BELANJA KOPDES MERAH PUTIH* 🛒\n` +
                        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                        `Barang: *${item.name}* (x${qty})\n` +
                        `Total: *Rp ${totalPrice.toLocaleString()}*\n` +
                        `Sisa Saldo: *Rp ${user.balance.toLocaleString()}*\n\n` +
                        `_Kasir: "Terima kasih sudah belanja di Kopdes Merah Putih! Kembaliannya didoakan berkah ya kak!"_\n\n` +
                        `💡 Ketik */tas* untuk melihat barang atau */pakai ${item.id}* untuk menggunakannya.\n` +
                        `📋 Progres misi belanja bertambah. Cek */misi*.`,
                    'kopdesPurchase'
                );
            };

            // ROUTING:
            // 1. Jika command adalah .beli / .belikopdes
            if (cmd === 'beli' || cmd === 'belikopdes') {
                if (!args[0]) {
                    return m.reply(
                        '⚠️ Masukkan nomor barang yang ingin dibeli.\nContoh: */beli 1* atau */beli 1 2*'
                    );
                }
                return handleBeli(args[0], args[1]);
            }

            // 2. Jika command adalah .kopdes / .toko / .minimarket
            if (args[0]) {
                if (args[0].toLowerCase() === 'beli') {
                    return handleBeli(args[1], args[2]);
                }
                // Jika user langsung ketik ".kopdes 1" atau ".kopdes 1 2"
                return handleBeli(args[0], args[1]);
            }

            // 3. Tampilkan Katalog Kopdes (tanpa args)
            const sections = Object.entries(
                Object.groupBy(itemList, (item) => item.category || 'lainnya')
            ).map(([category, items]) => ({
                title: category.charAt(0).toUpperCase() + category.slice(1),
                rows: items.map((item) => ({
                    header: category,
                    title: item.name,
                    description: `Rp ${item.price.toLocaleString()} · ${item.desc}`,
                    id: `/beli ${item.id}`,
                })),
            }));
            const catalogHeader = await getRpgHeaderImage(sock, 'kopdesCatalog');

            // ponytail: bentuk minimal sesuai docs zapo (tanpa viewOnce/biz node);
            // kalau server tetap nack 479, fallback ke katalog teks biasa.
            await sock.sendMessage(m.chat, {
                interactiveMessage: {
                    ...(catalogHeader
                        ? {
                              header: {
                                  hasMediaAttachment: true,
                                  imageMessage: catalogHeader,
                              },
                          }
                        : {}),
                    body: {
                        text: `🏪 *KOPDES MERAH PUTIH*\n\n💰 Saldo: Rp ${(user.balance || 0).toLocaleString()}`,
                    },
                    footer: { text: 'Pilih barang untuk membeli 1 pcs' },
                    nativeFlowMessage: {
                        messageVersion: 1,
                        buttons: [
                            {
                                name: 'single_select',
                                buttonParamsJson: JSON.stringify({
                                    title: '🛒 Buka katalog',
                                    sections,
                                }),
                            },
                        ],
                    },
                },
            });
        } catch (error) {
            console.error('Error in kopdes command:', error);
            await m.reply('❌ Terjadi kesalahan saat mengakses Kopdes.');
        }
    },
};
