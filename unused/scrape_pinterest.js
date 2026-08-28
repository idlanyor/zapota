/**
 * Pinterest Search Scraper
 * Usage: node unused/scrape_pinterest.js "mirai kuriyama"
 *
 * Scrapes Pinterest search results using Puppeteer + cookies.
 */

import puppeteer from 'puppeteer';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Cookie string dari user
const COOKIE_STR = `g_state={"i_l":0,"i_ll":1784256840648,"i_b":"0lxJPEI0owKHR6ml7468ycofO5JxnjASOBrM4y/pF3s","i_e":{"enable_itp_optimization":24},"i_et":1784256840648};csrftoken=cb2840e30da20bf4c1b3130211884101;_pinterest_referrer=https://www.google.com/;_routing_id="a2f49ad0-6fc1-4439-9f44-5d369c2e99c2";_b="AZNDwjyOHs5CabXN1yP/y5MyvNkxKwyXEGW0lLZuCS+Q3XdJkIvP5s3inPAK53dXSZ4=";_pinterest_sess=TWc9PSZJTUc4d2NQVmt4cmFWN3pQaXNJOURvaVZvczI2bVZKSmhKK0xFQXVlLzJWQkdubWRiWWZKMjdLN0pUOGZQL3B2TW52OWVsM1hDZ0NTaS9laEhLMDFZUVpMemlLUWFUelJoZDM3N1VEZVFwTjM5Z21ad2txdGIzYjZybzdueEpUME1qU2o2Smc0QXpMNjlCMXZBSlM4QVBNQVo3cTVxSFRnZmJBbHRCaU9Sb0xiQ1h4QkFzcE5xRFFzbVd2UkR6OVk0MEJMdjMzVlZnZjMzUU9Zc0NZaTZXZGx6cW5FdjhWS0dYS2xCSGxlRC9RYWlzUy9uOG5YSmdBTkNXaUdJaTRlU00xYVZ1ck9UWTdvNWpXcU42U2d3b1RNeUhNSG9CSUNvdWVoVkV6Z2VleXFGVmc1b1FSQTIwaGZ6RGJaYjJwNEJFSWRBMXlhaytCQnRjeVcwSENmR3RnSFh3STJ3TE5zbmkzdEhBYXp5NXhaOUNYS0hlY21VR2NqWjgzRnpGbGtqeXRUZHBEMERNVk1RZmYwNlVreUdnPT0mRVNENWhMVExTNEFqRUtJUCt4Smxsdllsbmc0PQ==;usersync=%7B%22magnite%22%3A%7B%22id%22%3A%22MC3IL7OY-1M-30XT%22%2C%22ts%22%3A1784098076459%7D%7D;__Secure-s_a=djhOckxoeUNYQW1DT3owWXBNY3lmUHZ6SCtFQjBmKzZUUzRJcUsxeW5PN2xiS1FucVF3dDFPY1llczFrRHV1cmxyTmMwRGVPKytLLzRyeGpBaWpYTE00a3dLZlpYT1NXZUFWLzBaMGpkQ0w1ditwUWt3M3VGQy9iSzhseEJJRlF2RDRuL3E1NHhYVmpqcHk3WXBLb0NvZ1lVSHdWcCtCcThFUEhUMUhVRGJrNDRXT3pVN1V6VXJIdG1Tdm9pWVc0NkhZVnM1RU8vUTZDOU9hYmYvRzVWRUl4NmJhVC9vV0M1WmVzdExXUDFucmJ1VHR0ZmUyN2tQWEd6TGRIVXczTytzdkY3dUVBK3VSeEhiZW5rUjIvNmprVE96dkQrNFJMMGVaOWFGRjN4b289JlFhMytqeGFtL1RuN3pSd0pocThjaG5WNGV4az0=;_auth=1;ar_debug=1;ar_debug=1;sessionFunnelEventLogged=1`;

/**
 * Parse cookie string into array of {name, value} objects for Puppeteer
 */
function parseCookies(cookieStr) {
    return cookieStr.split(';').map((pair) => {
        const eqIdx = pair.indexOf('=');
        const name = pair.slice(0, eqIdx).trim();
        const value = pair.slice(eqIdx + 1).trim();
        return { name, value, domain: '.pinterest.com' };
    });
}

/**
 * Extract pins from Pinterest page HTML.
 * Pinterest stores initial data in a JSON blob inside <script id="__PWS_INITIAL_DATA__">
 * or inside a script tag with id "__NEXT_DATA__" or similar.
 * Also tries to extract from the resource response.
 */
async function extractPinsFromPage(page) {
    // Try 1: __PWS_INITIAL_DATA__ (legacy Pinterest SPA)
    try {
        const initialData = await page.evaluate(() => {
            const el = document.getElementById('__PWS_INITIAL_DATA__');
            return el ? el.textContent : null;
        });
        if (initialData) {
            const parsed = JSON.parse(initialData);
            // Navigate to find pins - structure varies
            const pins = findPinsInTree(parsed);
            if (pins.length > 0) return pins;
        }
    } catch (e) {
        console.log('__PWS_INITIAL_DATA__ not found or parse error:', e.message);
    }

    // Try 2: __NEXT_DATA__ (Next.js version)
    try {
        const nextData = await page.evaluate(() => {
            const el = document.getElementById('__NEXT_DATA__');
            return el ? el.textContent : null;
        });
        if (nextData) {
            const parsed = JSON.parse(nextData);
            const pins = findPinsInNextData(parsed);
            if (pins.length > 0) return pins;
        }
    } catch (e) {
        console.log('__NEXT_DATA__ not found or parse error:', e.message);
    }

    // Try 3: Extract from the Redux store (window.__INITIAL_STATE__)
    try {
        const reduxState = await page.evaluate(() => {
            return window.__INITIAL_STATE__ || null;
        });
        if (reduxState) {
            const pins = findPinsInReduxState(reduxState);
            if (pins.length > 0) return pins;
        }
    } catch (e) {
        console.log('Redux state extraction failed:', e.message);
    }

    // Try 4: Parse DOM directly for pin cards
    try {
        const domPins = await page.evaluate(() => {
            const pinCards = document.querySelectorAll(
                '[data-test-id="pin"] , [data-test-id="pinrep"] , div[role="listitem"] , article , .pinCard , [class*="PinCard"] , [class*="pin"]'
            );
            const results = [];
            pinCards.forEach((card) => {
                const img = card.querySelector('img');
                const link = card.querySelector('a');
                const title = card.querySelector(
                    '[data-test-id="pinTitle"] , h3 , [class*="title"]'
                );
                results.push({
                    id: card.getAttribute('data-test-pin-id') || card.id || '',
                    title: title ? title.textContent.trim() : '',
                    image: img ? img.src : '',
                    link: link ? link.href : '',
                    description: img ? img.alt : '',
                });
            });
            return results;
        });
        if (domPins.length > 0) return domPins;
    } catch (e) {
        console.log('DOM extraction failed:', e.message);
    }

    return [];
}

/**
 * Recursively search for pin-like objects in the tree
 */
function findPinsInTree(obj, depth = 0) {
    if (depth > 10) return [];
    const pins = [];

    if (obj && typeof obj === 'object') {
        // Check if this looks like a pin
        if (
            obj.id &&
            (obj.images || obj.image || obj.media) &&
            (obj.pinner || obj.title != null || obj.description != null)
        ) {
            const imageUrl =
                obj.images?.orig?.url ||
                (obj.images && obj.images['270x']?.url) ||
                (obj.images && obj.images['736x']?.url) ||
                obj.image?.url ||
                obj.media?.images?.orig?.url ||
                '';
            pins.push({
                id: obj.id,
                title: obj.title || obj.grid_title || obj.description || '',
                image: imageUrl,
                link: `https://id.pinterest.com/pin/${obj.id}/`,
                description: obj.description || obj.title || '',
                pinner: obj.pinner?.username || obj.pinner?.full_name || '',
            });
        }

        // Recurse
        if (Array.isArray(obj)) {
            for (const item of obj) {
                pins.push(...findPinsInTree(item, depth + 1));
            }
        } else {
            for (const key of Object.keys(obj)) {
                if (typeof obj[key] === 'object' && obj[key] !== null && !key.startsWith('__')) {
                    pins.push(...findPinsInTree(obj[key], depth + 1));
                }
            }
        }
    }

    return pins;
}

function findPinsInNextData(data) {
    // Next.js props structure
    const props = data?.props?.pageProps || data?.props || {};
    return findPinsInTree(props);
}

function findPinsInReduxState(state) {
    // Pinterest redux state
    const allPins = state?.pins?.byId || state?.resources || state || {};
    return findPinsInTree(allPins);
}

/**
 * Get the actual Pin detail URL from an image/div
 */
async function scrapePinterestSearch(query) {
    const searchUrl = `https://id.pinterest.com/search/pins/?q=${encodeURIComponent(query)}&rs=typed`;
    const outputDir = path.join(__dirname, '..', 'results');
    await fs.ensureDir(outputDir);

    console.log('🚀 Launching browser...');
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--hide-scrollbars',
        ],
    });

    try {
        const page = await browser.newPage();

        // Set viewport
        await page.setViewport({ width: 1280, height: 800 });

        // Set cookies from the string
        const cookies = parseCookies(COOKIE_STR);
        // First navigate to domain to set cookies
        await page.goto('https://id.pinterest.com/', {
            waitUntil: 'networkidle2',
            timeout: 30000,
        });

        await page.setCookie(...cookies);
        console.log('🍪 Cookies set!');

        // Clear all service workers / SW caches
        await page.evaluate(() => {
            if ('caches' in window) {
                caches.keys().then((names) => names.forEach((n) => caches.delete(n)));
            }
        });

        console.log(`🔍 Navigating to search: ${searchUrl}`);
        await page.goto(searchUrl, {
            waitUntil: 'networkidle2',
            timeout: 45000,
        });

        // Wait a bit for dynamic content to load
        await page.evaluate(() => new Promise((r) => setTimeout(r, 3000)));

        // Scroll a bit to trigger lazy loading
        for (let i = 0; i < 5; i++) {
            await page.evaluate(() => {
                window.scrollBy(0, window.innerHeight);
            });
            await page.evaluate(() => new Promise((r) => setTimeout(r, 1500)));
        }

        console.log('📸 Extracting pins...');

        // Take a screenshot for debugging
        await page.screenshot({
            path: path.join(outputDir, 'pinterest_debug.png'),
            fullPage: false,
        });

        // Get page title and URL
        const pageTitle = await page.title();
        console.log(`📄 Page title: ${pageTitle}`);
        console.log(`📍 Final URL: ${page.url()}`);

        // Save full HTML for debugging
        const html = await page.content();
        await fs.writeFile(path.join(outputDir, 'pinterest_page.html'), html);
        console.log('💾 HTML saved to results/pinterest_page.html');

        // Extract pins
        let pins = await extractPinsFromPage(page);

        // If still no pins, try the intercepted API approach
        if (pins.length === 0) {
            console.log('🔎 Trying API interception approach...');
            pins = await tryApiExtraction(browser, searchUrl, cookies);
        }

        // Deduplicate by id
        const seen = new Set();
        pins = pins.filter((p) => {
            if (!p.id && !p.image) return false;
            const key = p.id || p.image;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        console.log(`\n✅ Found ${pins.length} pins!`);

        // Save results
        const outputPath = path.join(outputDir, `pinterest_${Date.now()}.json`);
        await fs.writeJson(outputPath, pins, { spaces: 2 });
        console.log(`💾 Results saved to: ${outputPath}`);

        // Display top results
        console.log('\n📌 Top Results:');
        pins.slice(0, 10).forEach((pin, i) => {
            console.log(`\n  [${i + 1}] ${pin.title || pin.description || 'No title'}`);
            if (pin.pinner) console.log(`      Pinner: ${pin.pinner}`);
            if (pin.image) console.log(`      Image: ${pin.image.slice(0, 100)}...`);
            if (pin.link) console.log(`      Link: ${pin.link}`);
        });

        return pins;
    } catch (err) {
        console.error('❌ Error:', err.message);
        throw err;
    } finally {
        await browser.close();
        console.log('🛑 Browser closed.');
    }
}

/**
 * Alternative approach: intercept the API resource call that Pinterest SPA makes
 */
async function tryApiExtraction(browser, searchUrl, cookies) {
    return await new Promise(async (resolve, reject) => {
        const page = await browser.newPage();
        const pins = [];

        // Listen for XHR responses containing pin data
        await page.setRequestInterception(true);

        const resourceUrls = [];

        page.on('request', (request) => {
            const url = request.url();
            // Intercept Pinterest API resource calls
            if (
                url.includes('/resource/') ||
                url.includes('/v3/') ||
                url.includes('/search/') ||
                url.includes('api.pinterest')
            ) {
                resourceUrls.push(url);
            }
            request.continue();
        });

        page.on('response', async (response) => {
            const url = response.url();
            if (
                (url.includes('/resource/') || url.includes('/v3/') || url.includes('/search/')) &&
                response.status() === 200
            ) {
                try {
                    const json = await response.json();
                    const extracted = findPinsInTree(json);
                    pins.push(...extracted);
                } catch (e) {
                    // Not JSON or parse error, skip
                }
            }
        });

        // Set cookies
        await page.goto('https://id.pinterest.com/', {
            waitUntil: 'networkidle2',
            timeout: 30000,
        });
        await page.setCookie(...cookies);

        await page.goto(searchUrl, {
            waitUntil: 'networkidle2',
            timeout: 45000,
        });

        // Wait for content
        await page.evaluate(() => new Promise((r) => setTimeout(r, 5000)));

        // Scroll to trigger more API calls
        for (let i = 0; i < 8; i++) {
            await page.evaluate(() => {
                window.scrollBy(0, window.innerHeight * 1.5);
            });
            await page.evaluate(() => new Promise((r) => setTimeout(r, 2000)));
        }

        await page.close();
        resolve(pins);
    });
}

// Run
const query = process.argv[2] || 'mirai kuriyama';
console.log('='.repeat(60));
console.log(`  Pinterest Search Scraper`);
console.log(`  Query: "${query}"`);
console.log('='.repeat(60));

scrapePinterestSearch(query)
    .then((pins) => {
        console.log('\n✅ Done!');
        process.exit(0);
    })
    .catch((err) => {
        console.error('\n❌ Fatal error:', err);
        process.exit(1);
    });
