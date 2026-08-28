/**
 * Pinterest Scraper Module
 *
 * Hits Pinterest's internal BaseSearchResource API directly via axios.
 * Anonymous session (no login cookies needed): visit homepage to obtain
 * csrftoken + _pinterest_sess, then call the search resource endpoint.
 *
 * Returns: Array of { id, title, thumbnail, hq, hq_736, link, description, pinner }
 */

import axios from 'axios';
import logger from '../utils/logger.js';

const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Extract pin objects from the Pinterest API response structure.
 * Recursively finds all pin-like objects in the response tree.
 */
function extractPinsFromResponse(response) {
    const results = [];
    const seen = new Set();

    function walk(obj, depth = 0) {
        if (depth > 10 || !obj || typeof obj !== 'object') return;

        if (obj.id && (obj.images || obj.image) && (obj.pinner || obj.title != null)) {
            const images = obj.images || obj.image || {};
            const getUrl = (size) =>
                images[size]?.url ||
                images[size]?.[0]?.url ||
                (images[size] && typeof images[size] === 'object' ? images[size].url : null);

            const url =
                getUrl('originals') ||
                getUrl('orig') ||
                getUrl('1200x') ||
                getUrl('736x') ||
                getUrl('564x') ||
                getUrl('236x') ||
                '';

            const thumbnail = getUrl('236x') || getUrl('170x') || getUrl('60x60') || url;

            if (url) {
                const key = obj.id || url;
                if (!seen.has(key)) {
                    seen.add(key);
                    results.push({
                        id: String(obj.id),
                        title: obj.title || obj.grid_title || obj.description || '',
                        thumbnail,
                        hq: getUrl('originals') || getUrl('orig') || url,
                        hq_736: getUrl('736x') || url,
                        link: `https://www.pinterest.com/pin/${obj.id}/`,
                        description: obj.description || obj.title || '',
                        pinner: obj.pinner?.full_name || obj.pinner?.username || '',
                        dominant_color: obj.dominant_color || null,
                    });
                }
            }
        }

        if (Array.isArray(obj)) {
            for (const item of obj) walk(item, depth + 1);
        } else {
            for (const key of Object.keys(obj)) {
                const val = obj[key];
                if (val && typeof val === 'object') {
                    walk(val, depth + 1);
                }
            }
        }
    }

    walk(response);
    return results;
}

/**
 * Visit Pinterest homepage to obtain an anonymous session cookie
 * (csrftoken + _pinterest_sess). Returns a Cookie header string.
 */
async function getSessionCookie() {
    const res = await axios.get('https://www.pinterest.com/', {
        headers: {
            'User-Agent': USER_AGENT,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 15000,
    });

    const setCookies = res.headers['set-cookie'] || [];
    const pairs = setCookies.map((c) => c.split(';')[0]);
    const cookie = pairs.join('; ');

    if (!pairs.some((c) => c.startsWith('_pinterest_sess=')) || !pairs.some((c) => c.startsWith('csrftoken='))) {
        throw new Error('Pinterest did not return session cookies');
    }
    return cookie;
}

/**
 * Search Pinterest via the internal BaseSearchResource API.
 *
 * @param {string} query - Search term
 * @param {number} [maxResults=20] - Maximum results to return
 * @returns {Promise<Object[]>}
 */
export async function searchPinterest(query, maxResults = 20) {
    logger.info(`Pinterest search via API: "${query}"`, 'PINTEREST');

    try {
        const cookie = await getSessionCookie();

        const enc = encodeURIComponent(query);
        const sourceUrl = `/search/pins/?q=${enc}&rs=typed`;
        const options = {
            query,
            scope: 'pins',
            rs: 'typed',
            appliedProductFilters: '---',
            domains: null,
            user: null,
            seoDrawerEnabled: false,
            auto_correction_disabled: false,
            source_url: sourceUrl,
            static_feed: false,
        };
        const data = JSON.stringify({ options, context: {} });
        const apiUrl =
            'https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=' +
            encodeURIComponent(sourceUrl) +
            '&data=' +
            encodeURIComponent(data) +
            '&_=' +
            Date.now();

        const res = await axios.get(apiUrl, {
            headers: {
                'User-Agent': USER_AGENT,
                Cookie: cookie,
                Accept: 'application/json, text/javascript, */*; q=0.01',
                'Accept-Language': 'en-US,en;q=0.9',
                'X-Requested-With': 'XMLHttpRequest',
                'X-Pinterest-Source-Url': sourceUrl,
                'X-Pinterest-PWS-Handler': 'www/search/[scope].js',
                'X-Pinterest-AppState': 'active',
                Referer: 'https://www.pinterest.com/',
            },
            timeout: 15000,
        });

        const apiStatus = res.data?.resource_response?.status;
        if (apiStatus !== 'success') {
            logger.error(`API returned status: ${apiStatus}`, 'PINTEREST');
            return [];
        }

        const resultsArray = res.data?.resource_response?.data?.results || res.data;
        const allPins = extractPinsFromResponse(resultsArray);
        const sorted = allPins.filter((p) => p.hq).slice(0, maxResults);

        logger.info(`Found ${sorted.length} pins for "${query}" (${allPins.length} raw)`, 'PINTEREST');
        return sorted;
    } catch (err) {
        logger.error(`Pinterest scrape error: ${err.message}`, 'PINTEREST');
        return [];
    }
}
