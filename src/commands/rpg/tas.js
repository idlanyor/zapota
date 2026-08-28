import RpgInventory from '../../database/models/RpgInventory.js';
import { KOPDES_ITEMS, getOrCreatePlayer } from '../../services/rpgService.js';
import { sendRpgReply } from '../../lib/rpgVisuals.js';
import { recordRpgActivity } from '../../services/rpgProgressService.js';

export default {
    name: 'tas',
    aliases: ['inventory', 'inv', 'pakai', 'use', 'equip'],
    description: 'Melihat isi tas dan menggunakan/memakai barang',
    category: 'RPG',
    execute: async (sock, m, args, text) => {
        const sender = m.sender;
        const cmd =
            m.command || (m.body ? m.body.slice(1).trim().split(/\s+/)[0].toLowerCase() : 'tas');

        try {
            const { player } = await getOrCreatePlayer(sender, m.pushName);
            const userItems = await RpgInventory.find({ userId: sender });

            // Helper: Cari item di inventory berdasarkan nomor urut atau ID/nama
            const findInvItemByInput = (input) => {
                if (!input) return null;
                const clean = String(input).trim().toLowerCase();
                const num = parseInt(clean, 10);
                if (!isNaN(num) && num >= 1 && num <= userItems.length) {
                    return userItems[num - 1];
                }
                return userItems.find(
                    (i) =>
                        i.itemId.toLowerCase() === clean || i.itemName.toLowerCase().includes(clean)
                );
            };

            // Helper: Eksekusi penggunaan barang
            const handlePakai = async (targetInput) => {
                if (!targetInput) {
                    return m.reply(
                        '⚠️ Harap masukkan Nomor atau ID barang yang ingin digunakan.\nContoh: */pakai 1* atau */tas 1*'
                    );
                }

                const invItem = findInvItemByInput(targetInput);
                if (!invItem || invItem.quantity <= 0) {
                    return m.reply(
                        `❌ Barang tidak ditemukan di dalam tas. Ketik */tas* untuk melihat nomor barang.`
                    );
                }

                const itemDef = KOPDES_ITEMS[invItem.itemId] || {
                    id: invItem.itemId,
                    name: invItem.itemName,
                    category: invItem.category,
                };

                // Handle item konsumsi
                if (invItem.category === 'konsumsi') {
                    invItem.quantity -= 1;
                    if (invItem.quantity <= 0) {
                        await RpgInventory.deleteOne({ _id: invItem._id });
                    } else {
                        await invItem.save();
                    }

                    // Terapkan efek
                    const eff = itemDef.effect || {};
                    player.hp = Math.min(player.maxHp, player.hp + (eff.hp || 0));
                    player.gizi = Math.min(100, player.gizi + (eff.gizi || 0));
                    player.kewarasan = Math.min(100, player.kewarasan + (eff.kewarasan || 0));
                    player.energi = Math.min(player.maxEnergi, player.energi + (eff.energi || 0));
                    await player.save();
                    await recordRpgActivity(sender, 'meal');

                    return sendRpgReply(
                        sock,
                        m,
                        `😋 *BERHASIL MENGGUNAKAN ITEM!*\n\n` +
                            `Kamu telah mengonsumsi *${itemDef.name}*.\n` +
                            `Efek didapatkan:\n` +
                            (eff.hp
                                ? `• ❤️ HP: +${eff.hp} (Sekarang: ${player.hp}/${player.maxHp})\n`
                                : '') +
                            (eff.gizi
                                ? `• 🍱 Gizi: +${eff.gizi} (Sekarang: ${player.gizi}/100)\n`
                                : '') +
                            (eff.kewarasan
                                ? `• 🧠 Kewarasan: +${eff.kewarasan} (Sekarang: ${player.kewarasan}/100)\n`
                                : '') +
                            (eff.energi
                                ? `• ⚡ Stamina: +${eff.energi} (Sekarang: ${player.energi}/${player.maxEnergi})\n`
                                : ''),
                        'inventoryUseEquip'
                    );
                }

                // Handle equipment (senjata/kendaraan)
                if (invItem.category === 'senjata' || invItem.category === 'kendaraan') {
                    invItem.isEquipped = !invItem.isEquipped;
                    await invItem.save();

                    return sendRpgReply(
                        sock,
                        m,
                        `🎒 *STATUS EQUIPMENT BERUBAH*\n\n` +
                            `Barang: *${itemDef.name}*\n` +
                            `Status saat ini: *${invItem.isEquipped ? '✅ DIPAKAI (EQUIPPED)' : '❌ DISIMPAN DI TAS'}*`,
                        'inventoryUseEquip'
                    );
                }

                return m.reply(`ℹ️ Barang *${itemDef.name}* tersimpan aman di tasmu.`);
            };

            // ROUTING:
            // 1. Jika command adalah .pakai / .use / .equip
            if (cmd === 'pakai' || cmd === 'use' || cmd === 'equip') {
                return handlePakai(args[0]);
            }

            // 2. Jika command adalah .tas / .inv dengan argumen nomor (contoh: ".tas 1" atau ".tas pakai 1")
            if (args[0]) {
                if (args[0].toLowerCase() === 'pakai' || args[0].toLowerCase() === 'use') {
                    return handlePakai(args[1]);
                }
                return handlePakai(args[0]);
            }

            // 3. Tampilkan isi tas (tanpa args)
            if (!userItems || userItems.length === 0) {
                return m.reply(
                    `🎒 *TAS KAMU MASIH KOSONG MLOMPONG!*\n\n` +
                        `Kamu belum punya barang apapun.\n` +
                        `Belanja dulu di minimarket desa dengan ketik */kopdes*.`
                );
            }

            let textTas = `🎒 *ISI TAS & INVENTORY KAMU* 🎒\n` + `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

            userItems.forEach((it, idx) => {
                const isEquipText = it.isEquipped ? ' *(Dipakai)*' : '';
                textTas += `*${idx + 1}. ${it.itemName}* (x${it.quantity})${isEquipText}\n   ID: \`${it.itemId}\`\n\n`;
            });

            textTas +=
                `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `💡 *Cara Pakai Barang:*\n` +
                `Ketik: */pakai [Nomor]* atau */tas [Nomor]*\n` +
                `Contoh: */pakai 1* atau */tas 1*`;

            await sendRpgReply(sock, m, textTas, 'inventoryBag');
        } catch (error) {
            console.error('Error in tas command:', error);
            await m.reply('❌ Terjadi kesalahan saat membuka tas.');
        }
    },
};
