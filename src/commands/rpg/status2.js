import { randomUUID } from 'node:crypto';
import { getOrCreatePlayer } from '../../services/rpgService.js';
import { getOrCreateRpgProgress } from '../../services/rpgProgressService.js';
import RpgInventory from '../../database/models/RpgInventory.js';
import { icon } from '../../lib/icons.js';
import logger from '../../utils/logger.js';

export default {
    name: 'status2',
    aliases: ['rpgstats', 'stat2', 'profil2'],
    description: 'Tampilkan kartu status RPG interaktif (Meta AI Canvas)',
    category: 'RPG',
    execute: async (sock, m) => {
        const sender = m.sender;
        const pushName = m.pushName || sender.split('@')[0];

        try {
            const { user, player } = await getOrCreatePlayer(sender, pushName);
            const progress = await getOrCreateRpgProgress(sender);
            const inventory = await RpgInventory.find({ userId: sender }).lean();

            const title = progress.equippedTitle
                ? `${progress.equippedTitle} · ${player.job}`
                : player.job;
            const requiredExp = player.level * 100;
            const expPercent = Math.min(100, Math.round((player.exp / requiredExp) * 100));
            const hpPercent = Math.min(100, Math.round((player.hp / player.maxHp) * 100));
            const energyPercent = Math.min(
                100,
                Math.round((player.energi / player.maxEnergi) * 100)
            );
            const giziPercent = Math.min(100, Math.round(player.gizi));
            const warasPercent = Math.min(100, Math.round(player.kewarasan));

            const sanitizedItems = inventory.map((item) => ({
                name: item.itemName,
                category: item.category,
                qty: item.quantity,
            }));

            const dataJson = JSON.stringify({
                name: user.name || pushName,
                title,
                level: player.level,
                exp: player.exp,
                requiredExp,
                expPercent,
                balance: Number(user.balance || 0).toLocaleString('id-ID'),
                hp: player.hp,
                maxHp: player.maxHp,
                hpPercent,
                energi: player.energi,
                maxEnergi: player.maxEnergi,
                energyPercent,
                gizi: player.gizi,
                giziPercent,
                kewarasan: player.kewarasan,
                warasPercent,
                reputasiWarga: player.reputasiWarga,
                reputasiPreman: player.reputasiPreman,
                reputasiAparat: player.reputasiAparat,
                bintangKorupsi: player.bintangKorupsi,
                items: sanitizedItems,
            });

            const starSvg = icon('star', { size: 12, color: '#eab308' });

            const html = String.raw`
<style>
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;user-select:none;margin:0;padding:0}
html,body{width:100%;background:transparent;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#fff;overflow:hidden;touch-action:none}
.fa-ic{vertical-align:-2px;margin-right:4px;display:inline-block;fill:currentColor}
.card{width:100%;padding:14px;border-radius:18px;background:linear-gradient(135deg,#0c1017 0%,#161f2e 100%);border:1px solid rgba(255,255,255,.12);box-shadow:0 8px 32px rgba(0,0,0,.5)}
.hdr{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:10px;margin-bottom:10px}
.user-info{display:flex;align-items:center;gap:10px}
.avatar-badge{width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,#06b6d4,#3b82f6);display:flex;align-items:center;justify-content:center;box-shadow:0 0 12px rgba(6,182,212,.4)}
.u-name{font-size:15px;font-weight:bold;color:#f1f5f9}
.u-title{font-size:10px;color:#94a3b8}
.u-level{text-align:right}
.lvl-badge{background:#22d3ee;color:#04222a;font-size:11px;font-weight:bold;padding:2px 8px;border-radius:6px}
.u-money{font-size:11px;color:#38ef7d;font-weight:bold;margin-top:3px;display:flex;align-items:center;justify-content:flex-end}
.exp-bar-wrap{width:100%;background:#1e293b;border-radius:6px;height:6px;margin:8px 0 12px;overflow:hidden}
.exp-bar{height:100%;background:linear-gradient(90deg,#06b6d4,#3b82f6);transition:width .4s}
.tabs{display:flex;gap:6px;margin-bottom:12px}
.tab-btn{flex:1;padding:7px 0;background:#1e293b;border:1px solid rgba(255,255,255,.06);color:#94a3b8;font-size:10px;font-weight:bold;border-radius:8px;text-align:center;cursor:pointer;display:flex;align-items:center;justify-content:center}
.tab-btn.active{background:#22d3ee;color:#04222a;border-color:#22d3ee}
.tab-btn.active .fa-ic{fill:#04222a}
.tab-content{display:none}
.tab-content.active{display:block}
.stat-row{margin-bottom:8px}
.stat-lbl{display:flex;justify-content:space-between;font-size:10px;font-weight:bold;margin-bottom:3px;align-items:center}
.bar-track{width:100%;height:8px;background:#0f172a;border-radius:4px;overflow:hidden;border:1px solid rgba(255,255,255,.05)}
.bar-fill{height:100%;border-radius:4px;transition:width .4s}
.bar-hp{background:linear-gradient(90deg,#ef4444,#f87171)}
.bar-en{background:linear-gradient(90deg,#f59e0b,#fbbf24)}
.bar-gz{background:linear-gradient(90deg,#10b981,#34d399)}
.bar-wr{background:linear-gradient(90deg,#8b5cf6,#a78bfa)}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px}
.rep-box{background:#111827;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06)}
.rep-name{font-size:9px;color:#94a3b8;display:flex;align-items:center}
.rep-val{font-size:13px;font-weight:bold;color:#f8fafc;margin-top:2px}
.inv-list{max-height:160px;overflow-y:auto;display:flex;flex-direction:column;gap:6px}
.inv-item{display:flex;align-items:center;justify-content:space-between;background:#111827;padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.06)}
.inv-name{font-size:11px;font-weight:bold;color:#f1f5f9;display:flex;align-items:center}
.inv-qty{font-size:10px;color:#22d3ee;background:rgba(34,211,238,.1);padding:2px 6px;border-radius:4px}
.empty-inv{text-align:center;font-size:10px;color:#64748b;padding:20px 0}
.stars{display:flex;align-items:center;gap:2px}
</style>

<div class="card">
    <div class="hdr">
        <div class="user-info">
            <div class="avatar-badge">${icon('userShield', { size: 20, color: '#ffffff' })}</div>
            <div>
                <div class="u-name" id="pName">-</div>
                <div class="u-title" id="pTitle">-</div>
            </div>
        </div>
        <div class="u-level">
            <span class="lvl-badge" id="pLevel">LV. 1</span>
            <div class="u-money">${icon('coins', { size: 12, color: '#eab308' })} <span id="pMoney">Rp 0</span></div>
        </div>
    </div>

    <div class="exp-bar-wrap">
        <div class="exp-bar" id="pExpBar" style="width:0%"></div>
    </div>

    <div class="tabs">
        <div class="tab-btn active" data-tab="vitals">${icon('heart', { size: 11 })} VITALS</div>
        <div class="tab-btn" data-tab="career">${icon('briefcase', { size: 11 })} KARIR</div>
        <div class="tab-btn" data-tab="tas">${icon('backpack', { size: 11 })} TAS (<span id="pItemCount">0</span>)</div>
    </div>

    <div class="tab-content active" id="tab-vitals">
        <div class="stat-row">
            <div class="stat-lbl"><span style="color:#f87171">${icon('heart', { size: 11, color: '#f87171' })} DARAH (HP)</span><span id="txtHp">0/0</span></div>
            <div class="bar-track"><div class="bar-fill bar-hp" id="barHp" style="width:0%"></div></div>
        </div>
        <div class="stat-row">
            <div class="stat-lbl"><span style="color:#fbbf24">${icon('bolt', { size: 11, color: '#fbbf24' })} ENERGI</span><span id="txtEn">0/0</span></div>
            <div class="bar-track"><div class="bar-fill bar-en" id="barEn" style="width:0%"></div></div>
        </div>
        <div class="stat-row">
            <div class="stat-lbl"><span style="color:#34d399">${icon('utensils', { size: 11, color: '#34d399' })} GIZI MAKANAN</span><span id="txtGz">0%</span></div>
            <div class="bar-track"><div class="bar-fill bar-gz" id="barGz" style="width:0%"></div></div>
        </div>
        <div class="stat-row">
            <div class="stat-lbl"><span style="color:#a78bfa">${icon('brain', { size: 11, color: '#a78bfa' })} KEWARASAN JIWA</span><span id="txtWr">0%</span></div>
            <div class="bar-track"><div class="bar-fill bar-wr" id="barWr" style="width:0%"></div></div>
        </div>
    </div>

    <div class="tab-content" id="tab-career">
        <div class="grid-2">
            <div class="rep-box">
                <div class="rep-name">${icon('users', { size: 11, color: '#38bdf8' })} Warga Desa</div>
                <div class="rep-val" id="pRepWarga">50/100</div>
            </div>
            <div class="rep-box">
                <div class="rep-name">${icon('skull', { size: 11, color: '#ef4444' })} Preman Jalanan</div>
                <div class="rep-val" id="pRepPreman">20/100</div>
            </div>
            <div class="rep-box">
                <div class="rep-name">${icon('shield', { size: 11, color: '#3b82f6' })} Aparat Kepolisian</div>
                <div class="rep-val" id="pRepAparat">50/100</div>
            </div>
            <div class="rep-box">
                <div class="rep-name">${icon('handcuffs', { size: 11, color: '#f59e0b' })} Status Buron</div>
                <div class="rep-val stars" id="pBintang">-</div>
            </div>
        </div>
    </div>

    <div class="tab-content" id="tab-tas">
        <div class="inv-list" id="pInvList"></div>
    </div>
</div>

<script>
(function(){
    const D = ${dataJson};

    document.getElementById("pName").textContent = D.name;
    document.getElementById("pTitle").textContent = D.title;
    document.getElementById("pLevel").textContent = "LV. " + D.level;
    document.getElementById("pMoney").textContent = D.balance;
    document.getElementById("pExpBar").style.width = D.expPercent + "%";

    document.getElementById("txtHp").textContent = D.hp + "/" + D.maxHp;
    document.getElementById("barHp").style.width = D.hpPercent + "%";

    document.getElementById("txtEn").textContent = D.energi + "/" + D.maxEnergi;
    document.getElementById("barEn").style.width = D.energyPercent + "%";

    document.getElementById("txtGz").textContent = D.gizi + "%";
    document.getElementById("barGz").style.width = D.giziPercent + "%";

    document.getElementById("txtWr").textContent = D.kewarasan + "%";
    document.getElementById("barWr").style.width = D.warasPercent + "%";

    document.getElementById("pRepWarga").textContent = D.reputasiWarga + " / 100";
    document.getElementById("pRepPreman").textContent = D.reputasiPreman + " / 100";
    document.getElementById("pRepAparat").textContent = D.reputasiAparat + " / 100";

    const b = D.bintangKorupsi || 0;
    const starHtml = '${starSvg}';
    document.getElementById("pBintang").innerHTML = b > 0 ? starHtml.repeat(Math.min(5, b)) : "Warga Bersih";

    document.getElementById("pItemCount").textContent = D.items.length;
    const invEl = document.getElementById("pInvList");
    if(D.items.length === 0){
        invEl.innerHTML = '<div class="empty-inv">Tas masih kosong.<br>Ketik .beli di Kopdes untuk belanja!</div>';
    } else {
        invEl.innerHTML = D.items.map(it => 
            '<div class="inv-item"><span class="inv-name">' + it.name.replace(/[^\w\s\(\)\-\.]/g, "") + '</span><span class="inv-qty">x' + it.qty + '</span></div>'
        ).join('');
    }

    const tabs = document.querySelectorAll(".tab-btn");
    const contents = document.querySelectorAll(".tab-content");
    tabs.forEach(t => {
        t.addEventListener("pointerdown", function(e){
            e.preventDefault();
            tabs.forEach(b => b.classList.remove("active"));
            contents.forEach(c => c.classList.remove("active"));
            this.classList.add("active");
            const target = document.getElementById("tab-" + this.dataset.tab);
            if(target) target.classList.add("active");
        });
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
                                        messageText: `Status RPG: ${user.name || pushName} (LV. ${player.level})`,
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
            logger.error(error, 'Error in status2 command');
            await m.reply('❌ Gagal memuat status RPG interaktif.');
        }
    },
};
