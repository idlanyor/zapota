/**
 * Service Repost Facebook ML Leaks ke Saluran WhatsApp
 */

import fs from 'node:fs';
import path from 'node:path';
import logger from '../utils/logger.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'repost_history.json');
const COOKIE_FILE = path.join(DATA_DIR, 'fb_cookies.txt');

export const DEFAULT_CHANNEL_JID = '120363410414831916@newsletter';
export const TARGET_FB_URL = 'https://www.facebook.com/christian.tandayu.tumaliuan/';

// Cache hasil scrape terakhir di memori
let cachedPosts = [];
let lastScrapedTime = 0;

/**
 * Load riwayat post yang sudah dikirim ke channel
 */
export function loadHistory() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        if (!fs.existsSync(HISTORY_FILE)) {
            const initial = {
                channel_jid: DEFAULT_CHANNEL_JID,
                posted: [],
            };
            fs.writeFileSync(HISTORY_FILE, JSON.stringify(initial, null, 2), 'utf-8');
            return initial;
        }
        const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
        if (!Array.isArray(data.posted)) data.posted = [];
        if (!data.channel_jid) data.channel_jid = DEFAULT_CHANNEL_JID;
        return data;
    } catch (err) {
        logger.error('[REPOST] Gagal membaca repost_history.json:', err);
        return { channel_jid: DEFAULT_CHANNEL_JID, posted: [] };
    }
}

/**
 * Simpan riwayat post yang berhasil dikirim
 */
export function saveHistory(post, channelJid) {
    const history = loadHistory();
    const exists = history.posted.some((p) => p.post_id === post.post_id);
    if (!exists) {
        history.posted.push({
            post_id: post.post_id,
            caption_preview: post.caption?.slice(0, 80) || '',
            url: post.url || '',
            posted_at: new Date().toISOString(),
            channel_jid: channelJid || history.channel_jid,
        });
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
    }
}

/**
 * Set target channel JID baru
 */
export function setTargetChannel(newJid) {
    const history = loadHistory();
    history.channel_jid = newJid;
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
    return history.channel_jid;
}

/**
 * Parse cookies.txt format Netscape
 */
function parseCookies(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(
            `File cookie tidak ditemukan di ${filePath}. Pastikan data/fb_cookies.txt tersedia.`
        );
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const pairs = [];
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 7) {
            pairs.push(`${parts[5]}=${parts[6]}`);
        }
    }
    return pairs.join('; ');
}

/**
 * Ekstraksi detail post dari GraphQL Relay node
 */
function extractPostNode(node) {
    if (!node || typeof node !== 'object') return null;
    const cs = node.comet_sections;
    if (!cs || typeof cs !== 'object') return null;

    const contentStory = cs.content?.story;
    const caption = contentStory?.message?.text || null;
    if (!caption) return null;

    const fbStory = cs.feedback?.story;
    const fbRenderer =
        fbStory?.story_ufi_container?.story?.feedback_context
            ?.feedback_target_with_context
            ?.comet_ufi_summary_and_actions_renderer;
    const fb = fbRenderer?.feedback || {};

    let likes = fb.reaction_count?.count || 0;
    let comments = 0;
    let shares = fb.share_count?.count || 0;

    if (Array.isArray(fb.adaptive_ufi_action_renderers)) {
        for (const item of fb.adaptive_ufi_action_renderers) {
            const fba = item?.feedback;
            if (!fba) continue;
            if (fba.reaction_count?.count !== undefined) likes = fba.reaction_count.count;
            if (fba.share_count?.count !== undefined) shares = fba.share_count.count;
            if (fba.comment_rendering_instance?.comments?.total_count !== undefined) {
                comments = fba.comment_rendering_instance.comments.total_count;
            }
        }
    }

    let postId = null;
    const feedbackId = fb.id;
    if (feedbackId) {
        try {
            const decoded = Buffer.from(feedbackId, 'base64').toString('utf-8');
            postId = decoded.replace('feedback:', '');
        } catch {
            postId = feedbackId;
        }
    }

    const postUrl =
        fb.url ||
        (postId ? `https://www.facebook.com/permalink.php?story_fbid=${postId}` : null);

    const images = [];
    if (Array.isArray(node.attachments)) {
        for (const att of node.attachments) {
            const media = att?.styles?.attachment?.media;
            const imgUrl = media?.image?.uri || media?.photo_image?.uri;
            if (imgUrl) images.push(imgUrl);
        }
    }

    const timestamp = node.creation_time || null;
    const dateIso = timestamp ? new Date(timestamp * 1000).toISOString() : null;

    return {
        post_id: postId,
        url: postUrl,
        date: dateIso,
        timestamp,
        caption: caption.trim(),
        likes,
        comments,
        shares,
        images,
    };
}

/**
 * Fetch dan scrape postingan terbaru dari ML Leaks
 */
export async function fetchMlLeaksPosts(forceRefresh = false) {
    // Cache valid selama 2 menit jika tidak force
    const now = Date.now();
    if (!forceRefresh && cachedPosts.length > 0 && now - lastScrapedTime < 2 * 60 * 1000) {
        return decorateWithHistory(cachedPosts);
    }

    const cookieHeader = parseCookies(COOKIE_FILE);

    const response = await fetch(TARGET_FB_URL, {
        headers: {
            Cookie: cookieHeader,
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept:
                'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
        },
    });

    if (!response.ok) {
        throw new Error(`HTTP Error ${response.status} saat menghubungi Facebook`);
    }

    const html = await response.text();
    const scriptRegex = /<script type="application\/json"[^>]*>(.*?)<\/script>/gi;
    const relayDataList = [];
    let match;

    while ((match = scriptRegex.exec(html)) !== null) {
        const raw = match[1];
        if (!raw.includes('RelayPrefetchedStreamCache')) continue;
        try {
            const parsed = JSON.parse(raw);
            const reqs = parsed.require || [];
            for (const r of reqs) {
                if (!Array.isArray(r[3])) continue;
                for (const a of r[3]) {
                    const subReqs = a?.__bbox?.require || [];
                    for (const sub of subReqs) {
                        if (sub[0] === 'RelayPrefetchedStreamCache' && Array.isArray(sub[3])) {
                            for (const item of sub[3]) {
                                const data = item?.__bbox?.result?.data;
                                if (data) relayDataList.push(data);
                            }
                        }
                    }
                }
            }
        } catch {
            // ignore
        }
    }

    const rawPosts = [];
    const seen = new Set();

    function walk(obj) {
        if (!obj || typeof obj !== 'object') return;
        if (obj.comet_sections) {
            const p = extractPostNode(obj);
            if (p && p.caption) {
                const key = p.post_id || p.caption;
                if (!seen.has(key)) {
                    seen.add(key);
                    rawPosts.push(p);
                }
            }
        }
        for (const k of Object.keys(obj)) {
            walk(obj[k]);
        }
    }

    for (const d of relayDataList) {
        walk(d);
    }

    // Urutkan postingan dari yang terbaru
    rawPosts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    cachedPosts = rawPosts;
    lastScrapedTime = now;

    return decorateWithHistory(rawPosts);
}

/**
 * Tandai postingan apakah sudah ada di database
 */
function decorateWithHistory(posts) {
    const history = loadHistory();
    const postedSet = new Set(history.posted.map((p) => p.post_id));

    return posts.map((post, idx) => ({
        index: idx + 1,
        ...post,
        isPosted: postedSet.has(post.post_id),
    }));
}

/**
 * Ambil post berdasarkan identifier (angka index 1,2,3 atau post_id)
 */
export async function getPostByIdentifier(identifier) {
    let posts = cachedPosts;
    if (posts.length === 0) {
        posts = await fetchMlLeaksPosts(false);
    }

    const num = parseInt(identifier, 10);
    if (!isNaN(num) && num > 0 && num <= posts.length) {
        return decorateWithHistory(posts)[num - 1];
    }

    // Jika user memasukkan post_id
    const byId = posts.find((p) => p.post_id === String(identifier));
    if (byId) {
        return decorateWithHistory([byId])[0];
    }

    return null;
}
