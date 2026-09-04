import { randomUUID } from 'node:crypto';
import { getOrCreatePlayer } from '../../services/rpgService.js';
import RpgInventory from '../../database/models/RpgInventory.js';
import { recordRpgActivity } from '../../services/rpgProgressService.js';
import { icon } from '../../lib/icons.js';
import logger from '../../utils/logger.js';

const GACHA_POOL = [
    // COMMON (60%)
    { id: 'kopi_saset', name: 'Kopi Saset Kapal Api', category: 'konsumsi', desc: 'Energi +20, Waras +10', rarity: 'C', rate: 12, iconName: 'mug' },
    { id: 'mie_instan', name: 'Indomie Goreng Spesial', category: 'konsumsi', desc: 'Gizi +30, Waras +10', rarity: 'C', rate: 12, iconName: 'utensils' },
    { id: 'tolak_angin', name: 'Jamu Tolak Angin', category: 'konsumsi', desc: 'HP +35, Waras +10', rarity: 'C', rate: 12, iconName: 'pills' },
    { id: 'obat_maag', name: 'Promag Sakit Perut', category: 'konsumsi', desc: 'HP +40, Waras +15', rarity: 'C', rate: 12, iconName: 'pills' },
    { id: 'token_listrik', name: 'Token Listrik PLN 20k', category: 'konsumsi', desc: 'Kewarasan +25', rarity: 'C', rate: 12, iconName: 'bolt' },

    // RARE (25%)
    { id: 'kuota_internet', name: 'Paket Kuota 10GB', category: 'konsumsi', desc: 'Kewarasan +30', rarity: 'R', rate: 8, iconName: 'bolt' },
    { id: 'helm_sni', name: 'Helm Bogo SNI', category: 'senjata', desc: 'Defense +25 anti begal', rarity: 'R', rate: 6, iconName: 'shield' },
    { id: 'kunci_inggris', name: 'Kunci Inggris Baja', category: 'senjata', desc: 'Attack +30 bela diri', rarity: 'R', rate: 6, iconName: 'wrench' },
    { id: 'jas_hujan', name: 'Jas Hujan Ponco Elmondo', category: 'aksesoris', desc: 'Tahan badai hujan', rarity: 'R', rate: 5, iconName: 'shield' },

    // SUPER RARE (12%)
    { id: 'sepeda_butut', name: 'Sepeda Onthel Butut', category: 'kendaraan', desc: 'Hemat stamina kerja 10%', rarity: 'SR', rate: 4, iconName: 'bicycle' },
    { id: 'jaket_ojol', name: 'Jaket Hijau Ojol Ori', category: 'aksesoris', desc: 'Reputasi Ojol +20', rarity: 'SR', rate: 4, iconName: 'motorcycle' },
    { id: 'knalpot_brong', name: 'Knalpot Racing Brong', category: 'aksesoris', desc: 'Preman segan, Aparat waspada', rarity: 'SR', rate: 4, iconName: 'motorcycle' },

    // SSR (3%)
    { id: 'motor_matic', name: 'Motor Matic Beat Karbu', category: 'kendaraan', desc: 'Syarat wajib jadi Driver Ojol!', rarity: 'SSR', rate: 1.5, iconName: 'motorcycle' },
    { id: 'sertifikat_tanah', name: 'Sertifikat Tanah Kavling', category: 'spesial', desc: 'Aset idaman calon mertua', rarity: 'SSR', rate: 1, iconName: 'scroll' },
    { id: 'kartu_bansos_vip', name: 'Kartu Sakti Bansos VIP', category: 'spesial', desc: 'Diskon sembako seumur hidup', rarity: 'SSR', rate: 0.5, iconName: 'creditCard' },
];

const rollSingleItem = () => {
    const totalWeight = GACHA_POOL.reduce((sum, item) => sum + item.rate, 0);
    let rand = Math.random() * totalWeight;

    for (const item of GACHA_POOL) {
        if (rand < item.rate) {
            return item;
        }
        rand -= item.rate;
    }
    return GACHA_POOL[0];
};

export default {
    name: 'gacharpg',
    aliases: ['gacha', 'pull', 'kotakberkah'],
    description: 'Buka Kotak Rezeki Nomplok RPG dengan animasi gacha interaktif',
    category: 'RPG',
    execute: async (sock, m, args) => {
        const sender = m.sender;
        const pushName = m.pushName || sender.split('@')[0];

        const pullCount = args[0] && args[0].trim() === '5' ? 5 : 1;
        const costPerPull = 20000;
        const totalCost = pullCount === 5 ? 90000 : costPerPull; // Diskon 10k kalau 5x

        try {
            const { user } = await getOrCreatePlayer(sender, pushName);

            if ((user.balance || 0) < totalCost) {
                return m.reply(
                    `💸 *SALDO KURANG!*\n\n` +
                        `Biaya Gacha: *Rp ${totalCost.toLocaleString('id-ID')}* (${pullCount}x Pull)\n` +
                        `Saldo kamu saat ini: *Rp ${Number(user.balance || 0).toLocaleString('id-ID')}*\n\n` +
                        `💡 _Yuk kerja dulu ketik *.kerja* atau menangkan minigame!_`
                );
            }

            // Potong saldo
            user.balance -= totalCost;
            await user.save();

            // Lakukan gacha
            const wonItems = [];
            const rarityOrder = { C: 1, R: 2, SR: 3, SSR: 4 };
            let highestRarity = 'C';

            for (let i = 0; i < pullCount; i++) {
                const item = rollSingleItem();
                wonItems.push(item);

                if (rarityOrder[item.rarity] > rarityOrder[highestRarity]) {
                    highestRarity = item.rarity;
                }

                // Masukkan ke database RpgInventory
                let inv = await RpgInventory.findOne({ userId: sender, itemId: item.id });
                if (inv) {
                    inv.quantity += 1;
                    await inv.save();
                } else {
                    await RpgInventory.create({
                        userId: sender,
                        itemId: item.id,
                        itemName: item.name,
                        category: item.category,
                        quantity: 1,
                    });
                }
            }

            await recordRpgActivity(sender, 'shop');

            const wonItemsWithSvg = wonItems.map((item) => ({
                ...item,
                svg: icon(item.iconName || 'gift', {
                    size: 14,
                    color:
                        item.rarity === 'SSR'
                            ? '#ec4899'
                            : item.rarity === 'SR'
                              ? '#fbbf24'
                              : item.rarity === 'R'
                                ? '#38bdf8'
                                : '#94a3b8',
                }),
            }));

            const payloadData = JSON.stringify({
                pullCount,
                highestRarity,
                wonItems: wonItemsWithSvg,
                remainingBalance: Number(user.balance).toLocaleString('id-ID'),
            });

            const html = String.raw`
<style>
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;user-select:none;margin:0;padding:0}
html,body{width:100%;background:transparent;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#fff;overflow:hidden;touch-action:none}
.fa-ic{vertical-align:-2px;margin-right:4px;display:inline-block;fill:currentColor}
.gacha-wrap{width:100%;padding:14px;border-radius:18px;background:linear-gradient(145deg,#0c1017 0%,#192337 100%);border:1px solid rgba(255,255,255,.12);text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.6)}
.gacha-title{font-size:15px;font-weight:bold;color:#f8fafc;letter-spacing:1px;display:flex;align-items:center;justify-content:center}
.gacha-sub{font-size:10px;color:#94a3b8;margin-top:2px;margin-bottom:12px;display:flex;align-items:center;justify-content:center}
.chest-stage{min-height:120px;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative}
.chest-icon{display:inline-block;animation:float 2s ease-in-out infinite;transition:transform .3s;filter:drop-shadow(0 0 15px rgba(251,191,36,.5))}
@keyframes float{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-8px) scale(1.05)}}
@keyframes shake{0%{transform:rotate(0)}25%{transform:rotate(-10deg) scale(1.1)}50%{transform:rotate(10deg) scale(1.1)}75%{transform:rotate(-6deg) scale(1.15)}100%{transform:rotate(0) scale(1.2)}}
.btn-open{margin-top:14px;padding:9px 24px;border:none;border-radius:10px;font-size:12px;font-weight:bold;cursor:pointer;background:linear-gradient(90deg,#06b6d4,#3b82f6);color:#fff;box-shadow:0 4px 14px rgba(6,182,212,.4);transition:transform .1s}
.btn-open:active{transform:scale(.95)}
.results-grid{display:none;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-top:10px;max-height:220px;overflow-y:auto;padding:4px}
.item-card{background:#0f172a;border-radius:12px;padding:10px;border:1px solid rgba(255,255,255,.08);text-align:left;position:relative;animation:popIn .4s cubic-bezier(.175,.885,.32,1.275)}
@keyframes popIn{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}
.badge-rarity{display:inline-block;font-size:9px;font-weight:bold;padding:2px 6px;border-radius:4px;margin-bottom:6px}
.rarity-C{background:#334155;color:#cbd5e1}
.rarity-R{background:#1d4ed8;color:#93c5fd;box-shadow:0 0 8px rgba(29,78,216,.5)}
.rarity-SR{background:#b45309;color:#fde047;box-shadow:0 0 10px rgba(245,158,11,.6)}
.rarity-SSR{background:linear-gradient(90deg,#ec4899,#8b5cf6);color:#fff;box-shadow:0 0 14px rgba(236,72,153,.8)}
.item-card.is-SSR{border-color:#ec4899}
.item-card.is-SR{border-color:#fbbf24}
.card-name{font-size:11px;font-weight:bold;color:#f8fafc;margin-bottom:2px;line-height:1.2;display:flex;align-items:center}
.card-desc{font-size:9px;color:#94a3b8}
.footer-info{font-size:9px;color:#64748b;margin-top:10px;display:flex;align-items:center;justify-content:center}
</style>

<div class="gacha-wrap">
    <div class="gacha-title">${icon('gem', { size: 14, color: '#38bdf8' })} KOTAK REZEKI NUSANTARA 2026</div>
    <div class="gacha-sub" id="subTitle">Tarik <span id="countTxt">1</span> Hadiah Berkah!</div>

    <div class="chest-stage" id="stageChest">
        <div class="chest-icon" id="chestEl">${icon('gift', { size: 56, color: '#fbbf24' })}</div>
        <button class="btn-open" id="btnOpen">BUKA KOTAK HOKI</button>
    </div>

    <div class="results-grid" id="gridResults"></div>

    <div class="footer-info" id="footerNote">${icon('coins', { size: 11, color: '#eab308' })} Sisa Saldo: Rp <span id="remBal">0</span></div>
</div>

<script>
(function(){
    const D = ${payloadData};
    const chestEl = document.getElementById("chestEl");
    const btnOpen = document.getElementById("btnOpen");
    const stageChest = document.getElementById("stageChest");
    const gridResults = document.getElementById("gridResults");
    const subTitle = document.getElementById("subTitle");
    const countTxt = document.getElementById("countTxt");
    const remBal = document.getElementById("remBal");

    countTxt.textContent = D.pullCount;
    remBal.textContent = D.remainingBalance;

    btnOpen.addEventListener("pointerdown", function(e){
        e.preventDefault();
        btnOpen.style.display = "none";
        chestEl.style.animation = "shake 0.7s infinite";

        setTimeout(function(){
            stageChest.style.display = "none";
            gridResults.style.display = "grid";
            subTitle.innerHTML = '${icon('sparkles', { size: 12, color: '#fde047' })} Selamat! Kamu mendapatkan ' + D.pullCount + ' item:';

            gridResults.innerHTML = D.wonItems.map((it, idx) => {
                return '<div class="item-card is-' + it.rarity + '" style="animation-delay:' + (idx * 0.1) + 's">' +
                    '<span class="badge-rarity rarity-' + it.rarity + '">[' + it.rarity + ']</span>' +
                    '<div class="card-name">' + it.svg + ' ' + it.name + '</div>' +
                    '<div class="card-desc">' + it.desc + '</div>' +
                '</div>';
            }).join('');
        }, 800);
    });
})();
</script>
`;

            const responseId = randomUUID();

            await sock.relayMessage(
                m.chat,
                {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2,
                        botMetadata: {
                            messageDisclaimerText: '',
                            botResponseId: responseId,
                        },
                    },
                    botForwardedMessage: {
                        message: {
                            richResponseMessage: {
                                messageType: 1,
                                submessages: [
                                    {
                                        messageType: 2,
                                        messageText: `🎁 Gacha RPG: ${pushName} menarik ${pullCount}x Kotak Rezeki!`,
                                    },
                                ],
                                unifiedResponse: {
                                    data: Buffer.from(
                                        JSON.stringify({
                                            response_id: responseId,
                                            sections: [
                                                {
                                                    view_model: {
                                                        primitive: {
                                                            __typename:
                                                                'GenAIaeacdsnwHtmlPrimitive',
                                                            payload: html,
                                                            trusted_sources: [],
                                                        },
                                                        __typename:
                                                            'GenAISingleLayoutViewModel',
                                                    },
                                                },
                                            ],
                                        })
                                    ).toString('base64'),
                                },
                                contextInfo: {
                                    forwardingScore: 1,
                                    isForwarded: true,
                                    forwardedAiBotMessageInfo: {
                                        botJid: '867051314767696@bot',
                                    },
                                    forwardOrigin: 4,
                                },
                            },
                        },
                    },
                },
                {
                    messageId: responseId,
                    raw: true,
                }
            );
        } catch (error) {
            logger.error(error, 'Error in gacharpg command');
            await m.reply('❌ Terjadi kesalahan saat melakukan Gacha RPG.');
        }
    },
};
