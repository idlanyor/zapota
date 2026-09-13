import { randomUUID } from 'node:crypto';
import { searchYouTube } from '../../lib/youtubeSearch.js';
import logger from '../../utils/logger.js';

const escapeHtml = (str = '') =>
    String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

const formatViews = (num) => {
    const n = Number(num) || 0;
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' jt';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + ' rb';
    return String(n);
};

const parseSeconds = (timestamp = '0:00') => {
    const parts = timestamp.split(':').map((n) => Number(n) || 0);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 180;
};

export default {
    name: 'ytplayer',
    aliases: ['ytc', 'playcanvas', 'canvasyt', 'ytp'],
    description: 'Buka pemutar YouTube interaktif Meta AI Canvas',
    category: 'Downloader',
    execute: async (sock, m, args, text) => {
        if (!text) {
            return m.reply('Kirim judul video atau tautan YouTube.\nContoh: *.ytplayer JKT48 Bagai Cinta Pertama*');
        }

        await m.react('⏳').catch(() => {});

        try {
            const results = await searchYouTube(text.trim(), 4);
            const video = results[0];
            if (!video) throw new Error('Video tidak ditemukan.');

            const related = results.slice(1).map((v) => ({
                title: v.title,
                author: v.author?.name || 'YouTube',
                timestamp: v.timestamp || '03:00',
                views: formatViews(v.views),
            }));

            const videoData = {
                title: video.title,
                author: video.author?.name || 'YouTube Creator',
                timestamp: video.timestamp || '03:45',
                totalSec: parseSeconds(video.timestamp || '03:45'),
                ago: video.ago || 'Baru saja',
                views: formatViews(video.views),
                url: video.url,
                description: video.description || 'Tidak ada deskripsi video.',
                related,
            };

            const dataJson = JSON.stringify(videoData);

            const html = String.raw`
<style>
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;user-select:none;margin:0;padding:0}
html,body{width:100%;background:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#f1f1f1;overflow:hidden;touch-action:none}
.yt-box{width:100%;max-width:440px;margin:0 auto;background:#0f0f0f;border-radius:18px;border:1px solid rgba(255,255,255,.12);overflow:hidden;box-shadow:0 12px 36px rgba(0,0,0,.8)}
.yt-nav{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#181818;border-bottom:1px solid rgba(255,255,255,.08)}
.yt-brand{display:flex;align-items:center;gap:7px}
.yt-logo{width:22px;height:16px;background:#ff0000;border-radius:4px;display:flex;align-items:center;justify-content:center;position:relative}
.yt-logo::after{content:'';border-style:solid;border-width:3.5px 0 3.5px 6px;border-color:transparent transparent transparent #fff}
.yt-name{font-size:15px;font-weight:700;letter-spacing:-0.5px;color:#fff}
.yt-badge{font-size:9px;padding:2px 7px;border-radius:8px;background:#272727;color:#22d3ee;font-weight:700}

.screen{position:relative;width:100%;aspect-ratio:16/9;background:linear-gradient(135deg,#121212 0%,#202020 100%);display:flex;flex-direction:column;justify-content:space-between;padding:10px;overflow:hidden}
.screen-bg-wave{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:4px;opacity:.25;pointer-events:none}
.wave-bar{width:5px;height:24px;background:#ff0000;border-radius:3px;transition:height .15s ease}
.playing .wave-bar{animation:bounce 1s infinite alternate ease-in-out}
.wave-bar:nth-child(2){animation-delay:.15s}
.wave-bar:nth-child(3){animation-delay:.3s}
.wave-bar:nth-child(4){animation-delay:.45s}
.wave-bar:nth-child(5){animation-delay:.6s}
.wave-bar:nth-child(6){animation-delay:.2s}
.wave-bar:nth-child(7){animation-delay:.35s}
@keyframes bounce{0%{height:12px;opacity:.3}100%{height:64px;opacity:1;background:#22d3ee}}

.screen-top{display:flex;justify-content:space-between;align-items:center;z-index:2}
.live-pill{font-size:9px;background:#ff0000;color:#fff;font-weight:800;padding:2px 6px;border-radius:3px;letter-spacing:.5px}
.spd-pill{font-size:10px;background:rgba(255,255,255,.15);color:#fff;padding:2px 8px;border-radius:10px;cursor:pointer;font-weight:600}

.screen-mid{display:flex;align-items:center;justify-content:center;gap:26px;z-index:2}
.btn-ctrl{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);color:#fff;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;outline:none}
.btn-ctrl:active{transform:scale(.9);background:rgba(255,255,255,.25)}
.btn-play{width:52px;height:52px;background:#ff0000;border:none;box-shadow:0 0 16px rgba(255,0,0,.5)}
.btn-play:active{transform:scale(.92);background:#cc0000}

.screen-bot{z-index:2;display:flex;flex-direction:column;gap:5px}
.bar-wrap{width:100%;height:14px;display:flex;align-items:center;cursor:pointer;position:relative}
.bar-track{width:100%;height:4px;background:rgba(255,255,255,.25);border-radius:2px;position:relative}
.bar-fill{width:0%;height:100%;background:#ff0000;border-radius:2px;position:relative}
.bar-scrub{position:absolute;right:-5px;top:-4px;width:12px;height:12px;border-radius:50%;background:#ff0000;box-shadow:0 0 6px #000}
.time-box{display:flex;justify-content:space-between;font-size:10px;color:#bbb;font-weight:600}

.body-box{padding:12px 14px}
.v-title{font-size:13px;font-weight:700;line-height:1.35;margin-bottom:4px;color:#f8fafc;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.v-sub{font-size:10px;color:#aaa;margin-bottom:10px}

.ch-row{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-top:1px solid rgba(255,255,255,.06);border-bottom:1px solid rgba(255,255,255,.06);margin-bottom:10px}
.ch-info{display:flex;align-items:center;gap:8px}
.ch-av{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#06b6d4,#3b82f6);display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:13px;color:#fff}
.ch-n{font-size:12px;font-weight:700;color:#fff}
.ch-s{font-size:9px;color:#94a3b8}
.btn-sub{padding:6px 12px;border-radius:14px;background:#f1f1f1;color:#0f0f0f;font-size:10px;font-weight:800;border:none;cursor:pointer}
.btn-sub.active{background:#272727;color:#aaa}

.action-tabs{display:flex;gap:6px;margin-bottom:10px;overflow-x:auto}
.act-btn{flex:1;min-width:70px;padding:6px 8px;border-radius:14px;background:#272727;border:1px solid rgba(255,255,255,.05);color:#eee;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:4px;cursor:pointer}
.act-btn.active{background:#ff0000;color:#fff}

.tab-pane{background:#1a1a1a;border-radius:10px;padding:10px;font-size:11px;color:#ccc;line-height:1.4}
.queue-item{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05)}
.queue-item:last-child{border-bottom:none}
.queue-t{font-size:11px;font-weight:600;color:#f1f1f1;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.queue-d{font-size:9px;color:#888}
</style>

<div class="yt-box">
    <div class="yt-nav">
        <div class="yt-brand">
            <div class="yt-logo"></div>
            <span class="yt-name">YouTube</span>
        </div>
        <span class="yt-badge">CANVAS PLAYER</span>
    </div>

    <div class="screen" id="screenEl">
        <div class="screen-bg-wave" id="waveBox">
            <div class="wave-bar"></div>
            <div class="wave-bar"></div>
            <div class="wave-bar"></div>
            <div class="wave-bar"></div>
            <div class="wave-bar"></div>
            <div class="wave-bar"></div>
            <div class="wave-bar"></div>
        </div>

        <div class="screen-top">
            <span class="live-pill">AUDIO HD</span>
            <span class="spd-pill" id="spdBtn">1.0x</span>
        </div>

        <div class="screen-mid">
            <button class="btn-ctrl" id="btnRw" title="Mundur 10s">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg>
            </button>
            <button class="btn-ctrl btn-play" id="btnPlay" title="Play/Pause">
                <svg id="playIco" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>
            <button class="btn-ctrl" id="btnFw" title="Maju 10s">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>
            </button>
        </div>

        <div class="screen-bot">
            <div class="bar-wrap" id="barWrap">
                <div class="bar-track">
                    <div class="bar-fill" id="barFill">
                        <div class="bar-scrub"></div>
                    </div>
                </div>
            </div>
            <div class="time-box">
                <span id="curTime">00:00</span>
                <span id="totTime">00:00</span>
            </div>
        </div>
    </div>

    <div class="body-box">
        <div class="v-title" id="vTitle">-</div>
        <div class="v-sub" id="vSub">-</div>

        <div class="ch-row">
            <div class="ch-info">
                <div class="ch-av" id="chAv">Y</div>
                <div>
                    <div class="ch-n" id="chName">-</div>
                    <div class="ch-s">Verified Channel</div>
                </div>
            </div>
            <button class="btn-sub" id="subBtn">SUBSCRIBE</button>
        </div>

        <div class="action-tabs">
            <button class="act-btn" id="likeBtn">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>
                <span id="likeTxt">Like</span>
            </button>
            <button class="act-btn" id="tabDescBtn">Deskripsi</button>
            <button class="act-btn" id="tabQueueBtn">Next Up</button>
        </div>

        <div class="tab-pane" id="tabDesc"></div>
        <div class="tab-pane" id="tabQueue" style="display:none"></div>
    </div>
</div>

<script>
(function(){
    const data = ${dataJson};

    const screenEl = document.getElementById('screenEl');
    const playIco = document.getElementById('playIco');
    const btnPlay = document.getElementById('btnPlay');
    const btnRw = document.getElementById('btnRw');
    const btnFw = document.getElementById('btnFw');
    const spdBtn = document.getElementById('spdBtn');
    const barWrap = document.getElementById('barWrap');
    const barFill = document.getElementById('barFill');
    const curTime = document.getElementById('curTime');
    const totTime = document.getElementById('totTime');

    const vTitle = document.getElementById('vTitle');
    const vSub = document.getElementById('vSub');
    const chAv = document.getElementById('chAv');
    const chName = document.getElementById('chName');
    const subBtn = document.getElementById('subBtn');
    const likeBtn = document.getElementById('likeBtn');
    const likeTxt = document.getElementById('likeTxt');
    const tabDescBtn = document.getElementById('tabDescBtn');
    const tabQueueBtn = document.getElementById('tabQueueBtn');
    const tabDesc = document.getElementById('tabDesc');
    const tabQueue = document.getElementById('tabQueue');

    vTitle.textContent = data.title;
    vSub.textContent = data.views + ' tayangan • ' + data.ago;
    chName.textContent = data.author;
    chAv.textContent = (data.author || 'Y').charAt(0).toUpperCase();
    totTime.textContent = data.timestamp;
    tabDesc.textContent = data.description;

    if (data.related && data.related.length > 0) {
        tabQueue.innerHTML = data.related.map(function(r){
            return '<div class="queue-item">' +
                '<div><div class="queue-t">' + r.title + '</div><div class="queue-d">' + r.author + ' • ' + r.views + '</div></div>' +
                '<span style="font-size:10px;color:#aaa">' + r.timestamp + '</span>' +
            '</div>';
        }).join('');
    } else {
        tabQueue.textContent = 'Tidak ada video berikutnya.';
    }

    let isPlaying = false;
    let currentSec = 0;
    const totalSec = data.totalSec || 180;
    const speeds = [1.0, 1.25, 1.5, 2.0];
    let speedIdx = 0;
    let timer = null;

    function fmt(s){
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return (m < 10 ? '0' + m : m) + ':' + (sec < 10 ? '0' + sec : sec);
    }

    function updateUi(){
        const pct = Math.min(100, (currentSec / totalSec) * 100);
        barFill.style.width = pct + '%';
        curTime.textContent = fmt(currentSec);
    }

    function togglePlay(){
        isPlaying = !isPlaying;
        if(isPlaying){
            screenEl.classList.add('playing');
            playIco.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
            timer = setInterval(function(){
                currentSec += (1 * speeds[speedIdx]);
                if(currentSec >= totalSec){
                    currentSec = totalSec;
                    togglePlay();
                }
                updateUi();
            }, 1000);
        } else {
            screenEl.classList.remove('playing');
            playIco.innerHTML = '<path d="M8 5v14l11-7z"/>';
            clearInterval(timer);
        }
    }

    btnPlay.addEventListener('click', togglePlay);

    btnRw.addEventListener('click', function(){
        currentSec = Math.max(0, currentSec - 10);
        updateUi();
    });

    btnFw.addEventListener('click', function(){
        currentSec = Math.min(totalSec, currentSec + 10);
        updateUi();
    });

    spdBtn.addEventListener('click', function(){
        speedIdx = (speedIdx + 1) % speeds.length;
        spdBtn.textContent = speeds[speedIdx].toFixed(1) + 'x';
    });

    barWrap.addEventListener('click', function(e){
        const rect = barWrap.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const ratio = Math.max(0, Math.min(1, clickX / rect.width));
        currentSec = ratio * totalSec;
        updateUi();
    });

    let isSub = false;
    subBtn.addEventListener('click', function(){
        isSub = !isSub;
        subBtn.textContent = isSub ? 'SUBSCRIBED' : 'SUBSCRIBE';
        subBtn.classList.toggle('active', isSub);
    });

    let isLiked = false;
    likeBtn.addEventListener('click', function(){
        isLiked = !isLiked;
        likeBtn.classList.toggle('active', isLiked);
        likeTxt.textContent = isLiked ? 'Disukai' : 'Like';
    });

    tabDescBtn.addEventListener('click', function(){
        tabDesc.style.display = 'block';
        tabQueue.style.display = 'none';
        tabDescBtn.classList.add('active');
        tabQueueBtn.classList.remove('active');
    });

    tabQueueBtn.addEventListener('click', function(){
        tabDesc.style.display = 'none';
        tabQueue.style.display = 'block';
        tabQueueBtn.classList.add('active');
        tabDescBtn.classList.remove('active');
    });

    updateUi();
})();
</script>
`;

            const responseId = randomUUID();
            await sock.relayMessage(
                m.chat,
                {
                    messageContextInfo: {
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
                                        messageText: `▶️ YouTube Player: ${video.title}`,
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
                                                            __typename: 'GenAIaeacdsnwHtmlPrimitive',
                                                            payload: html,
                                                            trusted_sources: [],
                                                        },
                                                        __typename: 'GenAISingleLayoutViewModel',
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
            await m.react('✅').catch(() => {});
        } catch (err) {
            logger.error(err, 'YTPLAYER');
            await m.react('❌').catch(() => {});
            await m.reply(`Gagal memuat YouTube player: ${err.message || 'Unknown error'}`);
        }
    },
};
