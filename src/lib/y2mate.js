import axios from 'axios';
import logger from '../utils/logger.js';

/**
 * y2mate.best backend scraper (cnv.cx converter API).
 * No puppeteer: GET sanity/key -> POST /v2/converter.
 */

const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const BASE_OPTS = {
    headers: {
        'User-Agent': USER_AGENT,
        Origin: 'https://iframe.y2meta-uk.com',
        Referer: 'https://iframe.y2meta-uk.com/',
    },
};

/**
 * Extract 11-char YouTube video id from URL or raw input.
 * @param {string} input
 * @returns {string|null}
 */
export function extractVideoId(input) {
    const s = String(input);
    const m = s.match(/(?:v=|youtu\.be\/|\/embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    return /^[A-Za-z0-9_-]{11}$/.test(s.trim()) ? s.trim() : null;
}

async function getKey() {
    const { data } = await axios.get('https://cnv.cx/v2/sanity/key', BASE_OPTS);
    if (!data?.key) throw new Error('Gagal mengambil key dari cnv.cx');
    return data.key;
}

/**
 * Convert a YouTube video to MP4 via cnv.cx.
 *
 * @param {string} input - YouTube URL or video id.
 * @param {string} [quality='360'] - Video quality (360/480/720/1080).
 * @returns {Promise<{url:string,filename:string,quality:string,videoId:string}>}
 */
export async function convertVideo(input, quality = '360') {
    const videoId = extractVideoId(input);
    if (!videoId) throw new Error('URL/id YouTube tidak valid');

    const key = await getKey();
    const body = new URLSearchParams({
        link: `https://youtu.be/${videoId}`,
        format: 'mp4',
        videoQuality: String(quality).replace(/p$/i, ''),
        filenameStyle: 'pretty',
        vCodec: 'h264',
    });

    logger.info(`y2mate convert ${videoId} @ ${quality}p`, 'Y2MATE');

    const { data } = await axios.post('https://cnv.cx/v2/converter', body.toString(), {
        headers: {
            ...BASE_OPTS.headers,
            'Content-Type': 'application/x-www-form-urlencoded',
            accept: '*/*',
            key,
        },
        timeout: 120000,
    });

    if (data?.status !== 'tunnel' || !data?.url) {
        throw new Error(`Convert gagal: ${data?.status || 'respons tidak dikenal'}`);
    }

    return {
        url: data.url,
        filename: data.filename || `yt_${videoId}_${quality}p.mp4`,
        quality,
        videoId,
    };
}
