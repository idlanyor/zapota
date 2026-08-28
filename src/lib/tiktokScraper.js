import axios from 'axios';
import * as cheerio from 'cheerio';
import logger from '../utils/logger.js';

/**
 * Fetch tokdl.com homepage and extract the CSRF token from hidden input.
 * @returns {Promise<string>} token
 */
const fetchTokdlToken = async () => {
    const { data } = await axios.get('https://tokdl.com/', {
        headers: {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        },
        timeout: 15000,
    });

    const $ = cheerio.load(data);
    const token = $('input#token[name="token"]').val();
    if (!token) throw new Error('Failed to extract token from tokdl.com');
    return token;
};

/**
 * Calculate the hash required by tokdl.com API.
 * Formula: btoa(url) + (url.length + 1000) + btoa('aio-dl')
 * @param {string} url - The video URL
 * @returns {string}
 */
const calculateHash = (url) => {
    const btoaUrl = Buffer.from(url).toString('base64');
    const salt = Buffer.from('aio-dl').toString('base64');
    return `${btoaUrl}${url.length + 1000}${salt}`;
};

/**
 * Scrape TikTok video download links via tokdl.com API.
 * Pure HTTP approach — no Puppeteer required.
 * @param {string} tiktokUrl - TikTok video URL (short or full)
 * @returns {Promise<{videoUrl: string, audioUrl: string, title: string, description: string, thumbnail: string, duration: string, hdUrl: string, watermarkUrl: string}|null>}
 */
export const scrapeTikTokVideo = async (tiktokUrl) => {
    try {
        logger.info(`Fetching tokdl.com token...`, 'SCRAPER');
        const token = await fetchTokdlToken();
        const hash = calculateHash(tiktokUrl);

        logger.info(`Requesting video data from tokdl.com for: ${tiktokUrl}`, 'SCRAPER');

        const params = new URLSearchParams();
        params.append('url', tiktokUrl);
        params.append('token', token);
        params.append('hash', hash);

        const { data } = await axios.post(
            'https://tokdl.com/wp-json/aio-dl/video-data/',
            params.toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                    Referer: 'https://tokdl.com/',
                    Origin: 'https://tokdl.com',
                },
                timeout: 30000,
            }
        );

        if (data.error) {
            logger.warn(`tokdl.com returned error: ${data.error}`, 'SCRAPER');
            return null;
        }

        if (!data.medias || data.medias.length === 0) {
            logger.warn('tokdl.com returned no media data', 'SCRAPER');
            return null;
        }

        // Find best quality video (HD without watermark)
        const hdMedia = data.medias.find(
            (m) => m.quality === 'hd' && m.extension === 'mp4' && m.videoAvailable
        );
        // Watermark video as fallback
        const watermarkMedia = data.medias.find(
            (m) => m.quality === 'watermark' && m.extension === 'mp4'
        );
        // Audio
        const audioMedia = data.medias.find(
            (m) => m.extension === 'mp3' && m.audioAvailable
        );

        const videoUrl = hdMedia?.url || watermarkMedia?.url || null;

        if (!videoUrl) {
            logger.warn('No downloadable video URL found in tokdl.com response', 'SCRAPER');
            return null;
        }

        logger.info('tokdl.com scrape succeeded!', 'SCRAPER');
        return {
            videoUrl,
            audioUrl: audioMedia?.url || null,
            hdUrl: hdMedia?.url || null,
            watermarkUrl: watermarkMedia?.url || null,
            title: data.title || 'No title',
            description: data.title || 'No description',
            thumbnail: data.thumbnail || null,
            duration: data.duration || null,
        };
    } catch (error) {
        logger.error(`tokdl.com scrape failed: ${error.message}`, 'SCRAPER');
        return null;
    }
};
