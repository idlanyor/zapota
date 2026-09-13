import { randomUUID } from 'node:crypto';
import { searchYouTube } from '../../lib/youtubeSearch.js';
import { downloadYouTubeYtmp3 } from '../../lib/ytmp3Mobi.js';
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
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return String(n);
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
            const [video] = await searchYouTube(text.trim(), 1);
            if (!video) throw new Error('Video tidak ditemukan.');

            let streamUrl = '';
            try {
                const dl = await downloadYouTubeYtmp3(video.url, 'mp4');
                streamUrl = dl?.url || '';
            } catch (err) {
                logger.warn(`Gagal fetch direct stream ytmp3: ${err.message}`, 'YTPLAYER');
            }

            const title = escapeHtml(video.title);
            const author = escapeHtml(video.author?.name || 'YouTube Creator');
            const thumbnail = escapeHtml(video.thumbnail);
            const timestamp = escapeHtml(video.timestamp || '00:00');
            const ago = escapeHtml(video.ago || 'Baru saja');
            const views = formatViews(video.views);
            const description = escapeHtml(video.description || 'Tidak ada deskripsi video.');
            const safeStream = escapeHtml(streamUrl);

            const html = `
<style>
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;user-select:none;margin:0;padding:0}
html,body{width:100%;background:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#fff;overflow-x:hidden}
.yt-app{max-width:480px;margin:0 auto;background:#0f0f0f;border-radius:16px;border:1px solid rgba(255,255,255,.08);overflow:hidden;box-shadow:0 12px 36px rgba(0,0,0,.7)}
.yt-header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#0f0f0f;border-bottom:1px solid rgba(255,255,255,.06)}
.yt-logo-box{display:flex;align-items:center;gap:6px}
.yt-play-badge{width:24px;height:17px;background:#ff0000;border-radius:5px;display:flex;align-items:center;justify-content:center;position:relative}
.yt-play-badge::after{content:'';border-style:solid;border-width:4px 0 4px 7px;border-color:transparent transparent transparent #fff}
.yt-logo-text{font-size:16px;font-weight:700;letter-spacing:-0.5px}
.yt-tag-pill{font-size:10px;padding:2px 7px;border-radius:10px;background:#272727;color:#aaa;font-weight:600}

.player-wrap{position:relative;width:100%;aspect-ratio:16/9;background:#000;display:flex;align-items:center;justify-content:center;overflow:hidden}
.video-media{width:100%;height:100%;object-fit:cover;display:block}
.poster-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:opacity .3s}
.poster-img.hidden{opacity:0;pointer-events:none}

.overlay-ctrl{position:absolute;inset:0;background:rgba(0,0,0,.35);display:flex;flex-direction:column;justify-content:space-between;padding:10px;transition:opacity .25s}
.overlay-ctrl.faded{opacity:0;pointer-events:none}
.top-ctrl{display:flex;justify-content:space-between;align-items:center}
.badge-hd{font-size:9px;background:#ff0000;color:#fff;font-weight:bold;padding:2px 5px;border-radius:3px}
.mid-ctrl{display:flex;align-items:center;justify-content:center;gap:24px}
.icon-btn{background:none;border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:8px}
.icon-btn:active{transform:scale(.9)}
.btn-bigplay{width:46px;height:46px;background:rgba(255,255,255,.2);border-radius:50%;backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,.3)}
.bot-ctrl{display:flex;flex-direction:column;gap:6px}
.progress-bar{position:relative;width:100%;height:4px;background:rgba(255,255,255,.3);border-radius:2px;cursor:pointer}
.progress-fill{width:0%;height:100%;background:#ff0000;border-radius:2px;position:relative}
.progress-thumb{width:10px;height:10px;background:#ff0000;border-radius:50%;position:absolute;right:-5px;top:-3px;box-shadow:0 0 4px rgba(0,0,0,.8)}
.time-row{display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#eee;font-weight:500}

.content-info{padding:12px 14px}
.v-title{font-size:14px;font-weight:600;line-height:1.4;margin-bottom:6px;color:#f1f1f1}
.v-meta{font-size:11px;color:#aaa;margin-bottom:12px}

.channel-bar{display:flex;align-items:center;justify-content:space-between;padding:8px 0;margin-bottom:12px;border-top:1px solid rgba(255,255,255,.06);border-bottom:1px solid rgba(255,255,255,.06)}
.channel-left{display:flex;align-items:center;gap:10px}
.channel-avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#ff0000,#ff6b6b);display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:15px;color:#fff}
.channel-name{font-size:13px;font-weight:600;color:#fff}
.channel-subs{font-size:10px;color:#aaa}
.sub-btn{padding:7px 14px;background:#fff;color:#0f0f0f;font-weight:700;font-size:11px;border-radius:18px;border:none;cursor:pointer;transition:all .2s}
.sub-btn.subscribed{background:#272727;color:#f1f1f1}

.actions-bar{display:flex;gap:8px;overflow-x:auto;padding-bottom:10px;margin-bottom:10px}
.act-pill{display:inline-flex;align-items:center;gap:6px;background:#272727;color:#f1f1f1;padding:6px 12px;border-radius:18px;font-size:11px;font-weight:600;border:none;cursor:pointer;white-space:nowrap}
.act-pill:active{background:#3f3f3f}
.act-pill.active{background:#ff0000;color:#fff}

.desc-box{background:#212121;border-radius:10px;padding:10px;font-size:11px;color:#ccc;line-height:1.4;cursor:pointer}
.desc-preview{overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.desc-preview.open{display:block}
.more-toggle{color:#aaa;font-weight:bold;margin-top:4px}
</style>

<div class="yt-app">
    <div class="yt-header">
        <div class="yt-logo-box">
            <div class="yt-play-badge"></div>
            <span class="yt-logo-text">YouTube</span>
        </div>
        <span class="yt-tag-pill">Meta AI Canvas</span>
    </div>

    <div class="player-wrap" id="playerWrap">
        <video id="videoElem" class="video-media" playsinline preload="metadata" src="${safeStream}"></video>
        <img id="posterImg" class="poster-img" src="${thumbnail}" alt="Thumbnail" />

        <div class="overlay-ctrl" id="overlayCtrl">
            <div class="top-ctrl">
                <span class="badge-hd">HD</span>
                <span style="font-size:10px;color:#ddd">Kanata Player</span>
            </div>

            <div class="mid-ctrl">
                <button class="icon-btn" id="btnRw" title="Mundur 10s">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg>
                </button>
                <button class="icon-btn btn-bigplay" id="btnPlay" title="Play/Pause">
                    <svg id="playIcon" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </button>
                <button class="icon-btn" id="btnFw" title="Maju 10s">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>
                </button>
            </div>

            <div class="bot-ctrl">
                <div class="progress-bar" id="progressBar">
                    <div class="progress-fill" id="progressFill">
                        <div class="progress-thumb"></div>
                    </div>
                </div>
                <div class="time-row">
                    <span id="txtCurrent">00:00</span>
                    <span id="txtTotal">${timestamp}</span>
                </div>
            </div>
        </div>
    </div>

    <div class="content-info">
        <div class="v-title">${title}</div>
        <div class="v-meta">${views} tayangan • ${ago}</div>

        <div class="channel-bar">
            <div class="channel-left">
                <div class="channel-avatar">${author.charAt(0).toUpperCase()}</div>
                <div>
                    <div class="channel-name">${author}</div>
                    <div class="channel-subs">YouTube Channel</div>
                </div>
            </div>
            <button class="sub-btn" id="subBtn">SUBSCRIBE</button>
        </div>

        <div class="actions-bar">
            <button class="act-pill" id="likeBtn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>
                <span id="likeTxt">1.2K</span>
            </button>
            <button class="act-pill" id="dislikeBtn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z"/></svg>
                <span>Dislike</span>
            </button>
            <button class="act-pill" id="shareBtn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
                <span>Bagikan</span>
            </button>
        </div>

        <div class="desc-box" id="descBox">
            <div class="desc-preview" id="descTxt">${description}</div>
            <div class="more-toggle" id="descToggle">...selengkapnya</div>
        </div>
    </div>
</div>

<script>
(function(){
    const v = document.getElementById('videoElem');
    const poster = document.getElementById('posterImg');
    const overlay = document.getElementById('overlayCtrl');
    const btnPlay = document.getElementById('btnPlay');
    const playIcon = document.getElementById('playIcon');
    const progressFill = document.getElementById('progressFill');
    const progressBar = document.getElementById('progressBar');
    const txtCur = document.getElementById('txtCurrent');
    const txtTot = document.getElementById('txtTotal');
    const btnRw = document.getElementById('btnRw');
    const btnFw = document.getElementById('btnFw');

    let isPlaying = false;
    let simTimer = null;
    let simSeconds = 0;
    const durParts = "${timestamp}".split(':').map(Number);
    let totalDur = 180;
    if(durParts.length === 2) totalDur = durParts[0] * 60 + durParts[1];
    else if(durParts.length === 3) totalDur = durParts[0] * 3600 + durParts[1] * 60 + durParts[2];
    if(!totalDur || isNaN(totalDur)) totalDur = 180;

    function formatTime(s){
        const sec = Math.floor(s % 60);
        const min = Math.floor((s / 60) % 60);
        const hr = Math.floor(s / 3600);
        const pad = (n) => String(n).padStart(2, '0');
        if(hr > 0) return pad(hr) + ':' + pad(min) + ':' + pad(sec);
        return pad(min) + ':' + pad(sec);
    }

    function setPlayState(play){
        isPlaying = play;
        if(isPlaying){
            poster.classList.add('hidden');
            playIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
            if(v && v.src && v.src.startsWith('http')){
                v.play().catch(()=>{});
            }
            if(!simTimer){
                simTimer = setInterval(()=>{
                    if(v && !v.paused && v.duration){
                        simSeconds = v.currentTime;
                        totalDur = v.duration;
                    } else {
                        simSeconds = Math.min(totalDur, simSeconds + 1);
                    }
                    updateProgress();
                    if(simSeconds >= totalDur){
                        setPlayState(false);
                    }
                }, 1000);
            }
        } else {
            playIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
            if(v) v.pause();
            if(simTimer){ clearInterval(simTimer); simTimer = null; }
        }
    }

    function updateProgress(){
        const pct = (simSeconds / totalDur) * 100;
        progressFill.style.width = pct + '%';
        txtCur.textContent = formatTime(simSeconds);
        txtTot.textContent = formatTime(totalDur);
    }

    btnPlay.addEventListener('click', (e)=>{
        e.stopPropagation();
        setPlayState(!isPlaying);
    });

    btnRw.addEventListener('click', (e)=>{
        e.stopPropagation();
        simSeconds = Math.max(0, simSeconds - 10);
        if(v) v.currentTime = simSeconds;
        updateProgress();
    });

    btnFw.addEventListener('click', (e)=>{
        e.stopPropagation();
        simSeconds = Math.min(totalDur, simSeconds + 10);
        if(v) v.currentTime = simSeconds;
        updateProgress();
    });

    progressBar.addEventListener('click', (e)=>{
        const rect = progressBar.getBoundingClientRect();
        const clickPos = (e.clientX - rect.left) / rect.width;
        simSeconds = Math.floor(clickPos * totalDur);
        if(v) v.currentTime = simSeconds;
        updateProgress();
    });

    let hideTimeout;
    document.getElementById('playerWrap').addEventListener('click', ()=>{
        overlay.classList.remove('faded');
        clearTimeout(hideTimeout);
        if(isPlaying){
            hideTimeout = setTimeout(()=> overlay.classList.add('faded'), 3500);
        }
    });

    // Subscribe toggle
    const subBtn = document.getElementById('subBtn');
    let isSubscribed = false;
    subBtn.addEventListener('click', ()=>{
        isSubscribed = !isSubscribed;
        if(isSubscribed){
            subBtn.textContent = 'SUBSCRIBED 🔔';
            subBtn.classList.add('subscribed');
        } else {
            subBtn.textContent = 'SUBSCRIBE';
            subBtn.classList.remove('subscribed');
        }
    });

    // Like toggle
    const likeBtn = document.getElementById('likeBtn');
    let liked = false;
    likeBtn.addEventListener('click', ()=>{
        liked = !liked;
        likeBtn.classList.toggle('active', liked);
    });

    // Dislike toggle
    const dislikeBtn = document.getElementById('dislikeBtn');
    let disliked = false;
    dislikeBtn.addEventListener('click', ()=>{
        disliked = !disliked;
        dislikeBtn.classList.toggle('active', disliked);
        if(disliked && liked){ liked = false; likeBtn.classList.remove('active'); }
    });

    // Share button
    document.getElementById('shareBtn').addEventListener('click', ()=>{
        alert('Tautan disalin ke clipboard!');
    });

    // Description accordion
    const descBox = document.getElementById('descBox');
    const descTxt = document.getElementById('descTxt');
    const descToggle = document.getElementById('descToggle');
    descBox.addEventListener('click', ()=>{
        const isOpen = descTxt.classList.toggle('open');
        descToggle.textContent = isOpen ? 'sembunyikan' : '...selengkapnya';
    });
})();
<\/script>
`;

            const responseId = randomUUID();
            await sock.sendMessage(
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
