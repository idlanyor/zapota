/**
 * Pinterest Search Scraper v3 - Direct API approach
 * Usage: node unused/scrape_pinterest_api.js "mirai kuriyama"
 *
 * Hits Pinterest's internal resource API directly with cookies.
 * No browser needed.
 */

import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const COOKIE_STR = `g_state={"i_l":0,"i_ll":1784256840648,"i_b":"0lxJPEI0owKHR6ml7468ycofO5JxnjASOBrM4y/pF3s","i_e":{"enable_itp_optimization":24},"i_et":1784256840648};csrftoken=cb2840e30da20bf4c1b3130211884101;_pinterest_referrer=https://www.google.com/;_routing_id="a2f49ad0-6fc1-4439-9f44-5d369c2e99c2";_b="AZNDwjyOHs5CabXN1yP/y5MyvNkxKwyXEGW0lLZuCS+Q3XdJkIvP5s3inPAK53dXSZ4=";_pinterest_sess=TWc9PSZJTUc4d2NQVmt4cmFWN3pQaXNJOURvaVZvczI2bVZKSmhKK0xFQXVlLzJWQkdubWRiWWZKMjdLN0pUOGZQL3B2TW52OWVsM1hDZ0NTaS9laEhLMDFZUVpMemlLUWFUelJoZDM3N1VEZVFwTjM5Z21ad2txdGIzYjZybzdueEpUME1qU2o2Smc0QXpMNjlCMXZBSlM4QVBNQVo3cTVxSFRnZmJBbHRCaU9Sb0xiQ1h4QkFzcE5xRFFzbVd2UkR6OVk0MEJMdjMzVlZnZjMzUU9Zc0NZaTZXZGx6cW5FdjhWS0dYS2xCSGxlRC9RYWlzUy9uOG5YSmdBTkNXaUdJaTRlU00xYVZ1ck9UWTdvNWpXcU42U2d3b1RNeUhNSG9CSUNvdWVoVkV6Z2VleXFGVmc1b1FSQTIwaGZ6RGJaYjJwNEJFSWRBMXlhaytCQnRjeVcwSENmR3RnSFh3STJ3TE5zbmkzdEhBYXp5NXhaOUNYS0hlY21VR2NqWjgzRnpGbGtqeXRUZHBEMERNVk1RZmYwNlVreUdnPT0mRVNENWhMVExTNEFqRUtJUCt4Smxsdllsbmc0PQ==;usersync=%7B%22magnite%22%3A%7B%22id%22%3A%22MC3IL7OY-1M-30XT%22%2C%22ts%22%3A1784098076459%7D%7D;__Secure-s_a=djhOckxoeUNYQW1DT3owWXBNY3lmUHZ6SCtFQjBmKzZUUzRJcUsxeW5PN2xiS1FucVF3dDFPY1llczFrRHV1cmxyTmMwRGVPKytLLzRyeGpBaWpYTE00a3dLZlpYT1NXZUFWLzBaMGpkQ0w1ditwUWt3M3VGQy9iSzhseEJJRlF2RDRuL3E1NHhYVmpqcHk3WXBLb0NvZ1lVSHdWcCtCcThFUEhUMUhVRGJrNDRXT3pVN1V6VXJIdG1Tdm9pWVc0NkhZVnM1RU8vUTZDOU9hYmYvRzVWRUl4NmJhVC9vV0M1WmVzdExXUDFucmJ1VHR0ZmUyN2tQWEd6TGRIVXczTytzdkY3dUVBK3VSeEhiZW5rUjIvNmprVE96dkQrNFJMMGVaOWFGRjN4b289JlFhMytqeGFtL1RuN3pSd0pocThjaG5WNGV4az0=;_auth=1;ar_debug=1;ar_debug=1;sessionFunnelEventLogged=1`;

const COMMON_HEADERS = {
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    Referer: 'https://id.pinterest.com/',
    Cookie: COOKIE_STR,
};

// Extract CSRF token from cookie
const csrfMatch = COOKIE_STR.match(/csrftoken=([^;]+)/);
const CSRFToken = csrfMatch ? csrfMatch[1] : '';
console.log(`🔑 CSRF Token: ${CSRFToken ? CSRFToken.slice(0, 20) + '...' : 'NOT FOUND'}`);

/**
 * Pinterest uses a resource API with JSON-encoded options.
 * The SearchResource expects:
 *   - query: search term
 *   - scope: "pins"
 *   - rs: "typed"
 */
function buildSearchOptions(query) {
    return {
        query: query,
        scope: 'pins',
        rs: 'typed',
        page_size: 25,
        bookmarks: null,
    };
}

/**
 * Method 1: Direct Search Resource API
 * Pinterest Web uses something like:
 * POST /resource/SearchResource/get/
 * With options JSON encoded
 */
async function methodSearchAPI(query) {
    const options = buildSearchOptions(query);
    const data = JSON.stringify({ options });
    const sourceUrl = `/search/pins/?q=${encodeURIComponent(query)}&rs=typed`;

    const url = `https://id.pinterest.com/resource/SearchResource/get/?source_url=${encodeURIComponent(sourceUrl)}&data=${encodeURIComponent(data)}`;

    console.log(`\n📡 Method 1: SearchResource API`);
    console.log(`   URL: ${url.slice(0, 150)}...`);

    try {
        const response = await axios.get(url, {
            headers: {
                ...COMMON_HEADERS,
                'X-CSRFToken': CSRFToken,
                Accept: 'application/json, text/javascript, */*; q=0.01',
            },
            timeout: 30000,
            maxRedirects: 0,
            validateStatus: (status) => status < 400,
        });

        console.log(`   Status: ${response.status}`);

        if (response.data) {
            return extractPinsFromResourceResponse(response.data, query);
        }
    } catch (err) {
        if (err.response) {
            console.log(`   Status: ${err.response.status} - Redirected`);
            console.log(`   Location: ${err.response.headers?.location || 'none'}`);
        } else {
            console.log(`   Error: ${err.message}`);
        }
    }
    return [];
}

/**
 * Method 2: Use the HTML page + extract embedded JSON
 */
async function methodHtmlPage(query) {
    const url = `https://id.pinterest.com/search/pins/?q=${encodeURIComponent(query)}&rs=typed`;

    console.log(`\n📡 Method 2: HTML Page`);
    console.log(`   URL: ${url}`);

    try {
        const response = await axios.get(url, {
            headers: {
                ...COMMON_HEADERS,
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            timeout: 30000,
            maxRedirects: 5,
        });

        console.log(`   Status: ${response.status}`);
        console.log(`   Final URL: ${response.request?.res?.responseUrl || url}`);

        const html = response.data;

        // Check if redirected to login
        if (
            html.includes('/login/') ||
            html.includes('login') ||
            response.request?.res?.responseUrl?.includes('/login/')
        ) {
            console.log('   ⚠️  Redirected to login page');
        }

        // Save HTML for analysis
        const outputDir = path.join(__dirname, '..', 'results');
        await fs.writeFile(path.join(outputDir, 'pinterest_api_page.html'), html);

        // Try to extract JSON from script tags
        const pins = extractPinsFromHTML(html, query);
        return pins;
    } catch (err) {
        console.log(`   Error: ${err.message}`);
    }
    return [];
}

/**
 * Method 3: Try Google's Pinterest cache or search suggestions API
 */
async function methodGuestAPI(query) {
    console.log(`\n📡 Method 3: Pinterest Guest API`);

    // Pinterest sometimes has a guest API endpoint
    const urls = [
        `https://api.pinterest.com/v3/search/pins/?query=${encodeURIComponent(query)}&rs=typed`,
        `https://api.pinterest.com/v1/search/pins/?query=${encodeURIComponent(query)}`,
    ];

    for (const url of urls) {
        try {
            console.log(`   Trying: ${url}`);
            const response = await axios.get(url, {
                headers: {
                    ...COMMON_HEADERS,
                    Accept: 'application/json',
                },
                timeout: 15000,
            });
            console.log(`   Status: ${response.status}`);
            if (response.data?.data || response.data?.results) {
                const items = response.data.data || response.data.results || [];
                return items.map((pin) => ({
                    id: String(pin.id || ''),
                    title: pin.title || pin.note || '',
                    image:
                        pin.image?.original?.url ||
                        pin.images?.orig?.url ||
                        pin.media?.images?.orig?.url ||
                        '',
                    link: pin.url || pin.link || `https://www.pinterest.com/pin/${pin.id}/`,
                    description: pin.description || pin.note || '',
                    pinner: pin.pinner?.full_name || pin.pinner?.username || '',
                }));
            }
        } catch (err) {
            console.log(`   Failed: ${err.message}`);
        }
    }
    return [];
}

/**
 * Extract pins from SearchResource response
 */
function extractPinsFromResourceResponse(data, query) {
    const results = [];

    try {
        // Explore the response structure
        const explore = (obj, depth = 0) => {
            if (depth > 8 || !obj || typeof obj !== 'object') return;

            if (obj.id && (obj.images || obj.image) && obj.type === 'pin') {
                const imgUrl =
                    obj.images?.orig?.url ||
                    (obj.images && obj.images['736x']?.url) ||
                    (obj.images && obj.images['564x']?.url) ||
                    obj.image?.url ||
                    '';
                if (imgUrl) {
                    results.push({
                        id: String(obj.id),
                        title:
                            obj.title ||
                            obj.grid_title ||
                            obj.description ||
                            obj.pinner?.full_name ||
                            '',
                        image: imgUrl,
                        link: `https://www.pinterest.com/pin/${obj.id}/`,
                        description: obj.description || obj.title || '',
                        pinner: obj.pinner?.full_name || obj.pinner?.username || '',
                    });
                }
            }

            if (Array.isArray(obj)) {
                obj.forEach((item) => explore(item, depth + 1));
            } else {
                for (const key of Object.keys(obj)) {
                    const val = obj[key];
                    if (val && typeof val === 'object') {
                        explore(val, depth + 1);
                    }
                }
            }
        };

        explore(data);
    } catch (e) {
        console.log(`   Parse error: ${e.message}`);
    }

    console.log(`   Found ${results.length} pins`);
    return results;
}

/**
 * Extract pins from HTML by finding JSON in script tags
 */
function extractPinsFromHTML(html, query) {
    const results = [];

    // Try to find JSON data in script tags
    const scriptRegex = /<script[^>]*id="__PWS_INITIAL_DATA__"[^>]*>([\s\S]*?)<\/script>/i;
    const match = html.match(scriptRegex);

    if (match) {
        try {
            const data = JSON.parse(match[1]);
            const pins = extractPinsFromResourceResponse(data, query);
            pins.forEach((p) => results.push(p));
        } catch (e) {
            console.log(`   __PWS_INITIAL_DATA__ parse error: ${e.message}`);
        }
    }

    // Also try to find JSON-LD
    const ldRegex = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    let ldMatch;
    while ((ldMatch = ldRegex.exec(html)) !== null) {
        try {
            const data = JSON.parse(ldMatch[1]);
            const items = Array.isArray(data) ? data : [data];
            items.forEach((item) => {
                if (item && item['@type'] === 'Product' && item.image) {
                    const images = Array.isArray(item.image) ? item.image : [item.image];
                    images.forEach((img) => {
                        results.push({
                            id: item.sku || '',
                            title: item.name || '',
                            image: typeof img === 'string' ? img : img.url || '',
                            link: item.url || '',
                            description: item.description || '',
                            pinner: '',
                        });
                    });
                }
            });
        } catch (e) {}
    }

    // Also try to extract inline redux data
    const reduxRegex = /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/;
    const reduxMatch = html.match(reduxRegex);
    if (reduxMatch) {
        try {
            const data = JSON.parse(reduxMatch[1]);
            const pins = extractPinsFromResourceResponse(data, query);
            pins.forEach((p) => results.push(p));
        } catch (e) {
            console.log(`   Redux state parse error: ${e.message}`);
        }
    }

    return results;
}

async function main() {
    const query = process.argv[2] || 'mirai kuriyama';
    const outputDir = path.join(__dirname, '..', 'results');
    await fs.ensureDir(outputDir);

    console.log('='.repeat(60));
    console.log('  Pinterest Search Scraper v3 - API');
    console.log(`  Query: "${query}"`);
    console.log('='.repeat(60));

    let allPins = [];

    // Try methods in order of likelihood
    const results = await Promise.allSettled([
        methodSearchAPI(query),
        methodGuestAPI(query),
        methodHtmlPage(query),
    ]);

    for (const result of results) {
        if (result.status === 'fulfilled') {
            allPins.push(...result.value);
        }
    }

    // Deduplicate
    const seen = new Set();
    allPins = allPins.filter((p) => {
        const key = p.id || p.image;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ Total unique pins: ${allPins.length}`);

    // Save results
    const timestamp = Date.now();
    const outputPath = path.join(outputDir, `pinterest_api_${timestamp}.json`);
    await fs.writeJson(outputPath, allPins, { spaces: 2 });
    console.log(`💾 Saved to: ${outputPath}`);

    // Display
    if (allPins.length > 0) {
        console.log('\n📌 Results:');
        allPins.slice(0, 15).forEach((pin, i) => {
            console.log(`  [${i + 1}] ${pin.title || '(no title)'}`);
            if (pin.pinner) console.log(`       Pinner: ${pin.pinner}`);
            if (pin.image) console.log(`       Image: ${pin.image.slice(0, 90)}...`);
            if (pin.link) console.log(`       Link: ${pin.link}`);
        });
    }

    return allPins;
}

main()
    .then((pins) => {
        console.log('\n✅ Done!');
        process.exit(0);
    })
    .catch((err) => {
        console.error('\n❌ Fatal:', err.message);
        process.exit(1);
    });
