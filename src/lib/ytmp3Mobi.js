import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const REFERER = 'https://id.ytmp3.mobi/';
const MAX_POLL_ATTEMPTS = 10;
const POLL_INTERVAL_MS = 800;

const extractVideoId = (url) => {
    try {
        const parsed = new URL(url);
        const hostname = parsed.hostname.replace(/^www\./, '');

        if (hostname === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] || '';
        if (hostname.endsWith('youtube.com')) {
            if (parsed.pathname === '/watch') return parsed.searchParams.get('v') || '';
            const [type, id] = parsed.pathname.split('/').filter(Boolean);
            if (['shorts', 'embed', 'live'].includes(type)) return id || '';
        }
    } catch {
        // Invalid URL; return an empty ID so the caller receives a clear validation error.
    }

    return '';
};

const requestJson = async (url) => {
    const { stdout } = await execFileAsync(
        'curl',
        ['-fsSL', '-L', '--max-time', '15', '-A', USER_AGENT, '-H', `Referer: ${REFERER}`, url],
        { maxBuffer: 1024 * 1024 }
    );

    try {
        return JSON.parse(stdout);
    } catch {
        throw new Error('Respons YTmp3 bukan JSON yang valid.');
    }
};

/**
 * Convert a YouTube URL through id.ytmp3.mobi/a.ymcdn.org.
 * @param {string} url YouTube video URL.
 * @param {'mp3'|'mp4'} format Output format.
 */
export const downloadYouTubeYtmp3 = async (url, format = 'mp4') => {
    if (!['mp3', 'mp4'].includes(format)) throw new Error(`Format tidak didukung: ${format}`);

    const videoId = extractVideoId(url);
    if (!videoId) throw new Error('ID Video YouTube tidak valid.');

    const initJson = await requestJson(
        `https://a.ymcdn.org/api/v1/init?p=y&23=1llum1n471&_=${Math.random()}`
    );
    if (!initJson.convertURL) throw new Error('Init YTmp3 gagal.');

    const convertJson = await requestJson(
        `${initJson.convertURL}&v=${videoId}&f=${format}&_=${Math.random()}`
    );
    if (Number(convertJson.error) > 0 || !convertJson.downloadURL) {
        throw new Error(`Konversi YTmp3 gagal (error: ${convertJson.error ?? 'unknown'}).`);
    }
    if (!convertJson.progressURL) throw new Error('YTmp3 tidak memberikan progress URL.');

    for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
        const progressJson = await requestJson(convertJson.progressURL);
        if (Number(progressJson.progress) > 2) {
            const title = progressJson.title || convertJson.title || 'YouTube Video';
            return {
                success: true,
                title,
                url: convertJson.downloadURL,
                download_url: convertJson.downloadURL,
                type: format === 'mp3' ? 'audio' : 'video',
            };
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    throw new Error('Timeout konversi YTmp3.');
};

export default downloadYouTubeYtmp3;
