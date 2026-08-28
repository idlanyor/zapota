/**
 * Pinterest Search Scraper v2 - Anti-detect
 * Usage: node unused/scrape_pinterest_v2.js "mirai kuriyama"
 *
 * Better cookie handling + stealth evasion.
 */

import puppeteer from 'puppeteer';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const COOKIE_STR = `g_state={"i_l":0,"i_ll":1784256840648,"i_b":"0lxJPEI0owKHR6ml7468ycofO5JxnjASOBrM4y/pF3s","i_e":{"enable_itp_optimization":24},"i_et":1784256840648};csrftoken=cb2840e30da20bf4c1b3130211884101;_pinterest_referrer=https://www.google.com/;_routing_id="a2f49ad0-6fc1-4439-9f44-5d369c2e99c2";_b="AZNDwjyOHs5CabXN1yP/y5MyvNkxKwyXEGW0lLZuCS+Q3XdJkIvP5s3inPAK53dXSZ4=";_pinterest_sess=TWc9PSZJTUc4d2NQVmt4cmFWN3pQaXNJOURvaVZvczI2bVZKSmhKK0xFQXVlLzJWQkdubWRiWWZKMjdLN0pUOGZQL3B2TW52OWVsM1hDZ0NTaS9laEhLMDFZUVpMemlLUWFUelJoZDM3N1VEZVFwTjM5Z21ad2txdGIzYjZybzdueEpUME1qU2o2Smc0QXpMNjlCMXZBSlM4QVBNQVo3cTVxSFRnZmJBbHRCaU9Sb0xiQ1h4QkFzcE5xRFFzbVd2UkR6OVk0MEJMdjMzVlZnZjMzUU9Zc0NZaTZXZGx6cW5FdjhWS0dYS2xCSGxlRC9RYWlzUy9uOG5YSmdBTkNXaUdJaTRlU00xYVZ1ck9UWTdvNWpXcU42U2d3b1RNeUhNSG9CSUNvdWVoVkV6Z2VleXFGVmc1b1FSQTIwaGZ6RGJaYjJwNEJFSWRBMXlhaytCQnRjeVcwSENmR3RnSFh3STJ3TE5zbmkzdEhBYXp5NXhaOUNYS0hlY21VR2NqWjgzRnpGbGtqeXRUZHBEMERNVk1RZmYwNlVreUdnPT0mRVNENWhMVExTNEFqRUtJUCt4Smxsdllsbmc0PQ==;usersync=%7B%22magnite%22%3A%7B%22id%22%3A%22MC3IL7OY-1M-30XT%22%2C%22ts%22%3A1784098076459%7D%7D;__Secure-s_a=djhOckxoeUNYQW1DT3owWXBNY3lmUHZ6SCtFQjBmKzZUUzRJcUsxeW5PN2xiS1FucVF3dDFPY1llczFrRHV1cmxyTmMwRGVPKytLLzRyeGpBaWpYTE00a3dLZlpYT1NXZUFWLzBaMGpkQ0w1ditwUWt3M3VGQy9iSzhseEJJRlF2RDRuL3E1NHhYVmpqcHk3WXBLb0NvZ1lVSHdWcCtCcThFUEhUMUhVRGJrNDRXT3pVN1V6VXJIdG1Tdm9pWVc0NkhZVnM1RU8vUTZDOU9hYmYvRzVWRUl4NmJhVC9vV0M1WmVzdExXUDFucmJ1VHR0ZmUyN2tQWEd6TGRIVXczTytzdkY3dUVBK3VSeEhiZW5rUjIvNmprVE96dkQrNFJMMGVaOWFGRjN4b289JlFhMytqeGFtL1RuN3pSd0pocThjaG5WNGV4az0=;_auth=1;ar_debug=1;ar_debug=1;sessionFunnelEventLogged=1`;

function parseCookies(cookieStr) {
    return cookieStr.split(';').map((pair) => {
        const eqIdx = pair.indexOf('=');
        const name = pair.slice(0, eqIdx).trim();
        let value = pair.slice(eqIdx + 1).trim();
        // Remove surrounding quotes if present
        if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
        }
        return { name, value, domain: '.pinterest.com' };
    });
}

async function scrapePinterestSearch(query) {
    const searchUrl = `https://id.pinterest.com/search/pins/?q=${encodeURIComponent(query)}&rs=typed`;
    const outputDir = path.join(__dirname, '..', 'results');
    await fs.ensureDir(outputDir);

    console.log('🚀 Launching browser with stealth settings...');

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
            '--disable-blink-features=AutomationControlled',
            '--window-size=1920,1080',
        ],
    });

    try {
        const page = await browser.newPage();

        // === EVASIONS ===
        // 1. Set a real-looking user agent
        await page.setUserAgent(
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        );

        // 2. Set viewport to realistic size
        await page.setViewport({ width: 1920, height: 1080 });

        // 3. Override navigator.webdriver
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5],
            });
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en', 'id'],
            });

            // Override chrome runtime
            window.chrome = {
                runtime: {},
                loadTimes: function () {},
                csi: function () {},
                app: {},
            };

            // Override permissions
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) =>
                parameters.name === 'notifications'
                    ? Promise.resolve({ state: Notification.permission })
                    : originalQuery(parameters);
        });

        // 4. Extra headers
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
        });

        // 5. First go to pinterest.com to establish session, THEN set cookies
        console.log('🌐 Opening Pinterest...');
        await page.goto('https://id.pinterest.com/', {
            waitUntil: 'networkidle0',
            timeout: 30000,
        });

        console.log('🍪 Setting cookies...');
        const cookies = parseCookies(COOKIE_STR);
        await page.setCookie(...cookies);

        // 6. Quick navigation to home to verify session works
        await page.goto('https://id.pinterest.com/', {
            waitUntil: 'networkidle0',
            timeout: 30000,
        });

        // Check if we're logged in
        const pageContent = await page.content();
        const isLoggedIn = !pageContent.includes('/login/') && !pageContent.includes('Log in');
        console.log(`🔐 Login status: ${isLoggedIn ? 'LOGGED IN ✅' : 'NOT LOGGED IN ❌'}`);

        const currentUrl = page.url();
        console.log(`📍 After home: ${currentUrl}`);

        if (currentUrl.includes('/login/')) {
            console.log('⚠️  Redirected to login! Cookies might be expired.');
            console.log('   Will try direct API scraping anyway...');
        }

        // 7. Navigate to search
        console.log(`\n🔍 Searching: "${query}"`);
        await page.goto(searchUrl, {
            waitUntil: 'networkidle0',
            timeout: 60000,
        });

        const finalUrl = page.url();
        console.log(`📍 Search URL: ${finalUrl}`);

        // Take screenshot
        await page.screenshot({
            path: path.join(outputDir, 'pinterest_v2_debug.png'),
            fullPage: true,
        });

        // Save HTML source
        const html = await page.content();
        await fs.writeFile(path.join(outputDir, 'pinterest_v2_page.html'), html);
        console.log('💾 HTML saved');

        const searchTitle = await page.title();
        console.log(`📄 Title: ${searchTitle}`);

        // Scroll slowly to trigger lazy-loading
        console.log('🖱️  Scrolling...');
        for (let i = 0; i < 10; i++) {
            await page.evaluate(() => {
                window.scrollBy(0, window.innerHeight);
            });
            await new Promise((r) => setTimeout(r, 2000));
        }

        // === EXTRACTION METHOD 1: Try Pinterest's Redux store ===
        console.log('\n🔎 Attempting extraction methods...');

        let pins = [];

        // Method A: extract from window.__INITIAL_STATE__ or similar globals
        pins = await page.evaluate(() => {
            const results = [];
            try {
                // Pinterest often stores resources in the window scope
                // Try to find any data blobs
                const scripts = document.querySelectorAll('script[type="application/json"]');
                scripts.forEach((script) => {
                    try {
                        const data = JSON.parse(script.textContent);
                        if (data && typeof data === 'object') {
                            // Look for pin-like structures
                            results.push({ source: 'json-script', data: data });
                        }
                    } catch (e) {}
                });
            } catch (e) {}

            // Method: Extract visible pin cards from DOM
            const pinElements = document.querySelectorAll(
                '[data-test-id="pin"], [data-test-id="pinrep"], div[role="listitem"], ' +
                    'a[href*="/pin/"], [class*="PinCard"], [class*="pinCard"], ' +
                    'div[data-test-id="pinWrapper"], div[class*="pin"]'
            );

            const seen = new Set();
            pinElements.forEach((el) => {
                const img = el.querySelector('img');
                const link = el.tagName === 'A' ? el : el.querySelector('a');
                const titleEl = el.querySelector(
                    '[data-test-id="pinTitle"], [class*="title"], h3, [class*="richPin"]'
                );

                const imageUrl = img ? img.src || img.getAttribute('src') || '' : '';
                const pinUrl = link ? link.href || link.getAttribute('href') || '' : '';
                const title = titleEl ? titleEl.textContent.trim() : img ? img.alt || '' : '';

                // Clean up Pinterest URLs
                let fullUrl = pinUrl;
                if (fullUrl && fullUrl.startsWith('/')) {
                    fullUrl = 'https://id.pinterest.com' + fullUrl;
                }

                // Extract pin ID from URL
                let pinId = '';
                const idMatch = fullUrl.match(/\/pin\/([^/]+)/);
                if (idMatch) pinId = idMatch[1];

                // Use image URL as unique key
                const key = imageUrl || pinId;
                if (key && !seen.has(key)) {
                    seen.add(key);
                    results.push({
                        id: pinId,
                        title: title,
                        image: imageUrl,
                        link: fullUrl,
                        description: img ? img.alt : '',
                    });
                }
            });

            return results;
        });

        console.log(`Method A (DOM): ${pins.length} pins found`);

        // Method B: Extract from JSON-LD / structured data
        if (pins.length === 0) {
            pins = await page.evaluate(() => {
                const results = [];
                // Try to extract from script[type="application/ld+json"]
                const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
                ldScripts.forEach((script) => {
                    try {
                        const data = JSON.parse(script.textContent);
                        const items = Array.isArray(data) ? data : [data];
                        items.forEach((item) => {
                            if (item && item['@type'] === 'Product' && item.image) {
                                const images = Array.isArray(item.image)
                                    ? item.image
                                    : [item.image];
                                images.forEach((img) => {
                                    results.push({
                                        id: item.sku || '',
                                        title: item.name || '',
                                        image: typeof img === 'string' ? img : img.url || '',
                                        link: item.url || '',
                                        description: item.description || '',
                                    });
                                });
                            }
                        });
                    } catch (e) {}
                });
                return results;
            });
            console.log(`Method B (JSON-LD): ${pins.length} pins found`);
        }

        // Method C: Extract from inline JSON in window.__PWS_INITIAL_DATA__
        if (pins.length === 0) {
            pins = await page.evaluate(() => {
                const results = [];
                const el = document.getElementById('__PWS_INITIAL_DATA__');
                if (el) {
                    try {
                        const data = JSON.parse(el.textContent);
                        const extractPins = (obj, depth = 0) => {
                            if (depth > 8 || !obj || typeof obj !== 'object') return;
                            if (obj.id && (obj.images || obj.image) && !obj.error) {
                                const imgUrl =
                                    obj.images?.orig?.url ||
                                    (obj.images && obj.images['736x']?.url) ||
                                    (obj.images && obj.images['270x']?.url) ||
                                    obj.image?.url ||
                                    '';
                                if (imgUrl) {
                                    results.push({
                                        id: String(obj.id),
                                        title: obj.title || obj.grid_title || obj.description || '',
                                        image: imgUrl,
                                        link: `https://www.pinterest.com/pin/${obj.id}/`,
                                        description: obj.description || obj.title || '',
                                        pinner: obj.pinner?.full_name || obj.pinner?.username || '',
                                    });
                                }
                            }
                            if (Array.isArray(obj)) {
                                obj.forEach((item) => extractPins(item, depth + 1));
                            } else {
                                Object.values(obj).forEach((val) => {
                                    if (val && typeof val === 'object') {
                                        extractPins(val, depth + 1);
                                    }
                                });
                            }
                        };
                        extractPins(data);
                    } catch (e) {}
                }
                return results;
            });
            console.log(`Method C (__PWS_INITIAL_DATA__): ${pins.length} pins found`);
        }

        // Method D: Extract all images that look like Pinterest pin images
        if (pins.length === 0) {
            pins = await page.evaluate(() => {
                const results = [];
                const seen = new Set();
                const imgs = document.querySelectorAll('img[src*="pinimg"]');
                imgs.forEach((img) => {
                    const src = img.src || img.getAttribute('src') || '';
                    const parent = img.closest('a');
                    const link = parent ? parent.href || '' : '';
                    const alt = img.alt || '';

                    // Skip profiles, icons, etc
                    if (
                        src.includes('/avatars/') ||
                        src.includes('/favicon') ||
                        src.includes('logo')
                    )
                        return;

                    // Convert 236x to originals
                    const hqSrc = src.replace(/\/\d+x\//, '/originals/');

                    const key = src;
                    if (!seen.has(key)) {
                        seen.add(key);
                        let fullUrl = link;
                        if (fullUrl && fullUrl.startsWith('/')) {
                            fullUrl = 'https://id.pinterest.com' + fullUrl;
                        }
                        let pinId = '';
                        const idMatch = fullUrl.match(/\/pin\/([^/]+)/);
                        if (idMatch) pinId = idMatch[1];

                        results.push({
                            id: pinId,
                            title: alt,
                            image: src,
                            link: fullUrl,
                            description: alt,
                        });
                    }
                });
                return results;
            });
            console.log(`Method D (pinimg images): ${pins.length} pins found`);
        }

        // Deduplicate
        const seen = new Set();
        pins = pins.filter((p) => {
            const key = p.id || p.image || p.link;
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        console.log(`\n✅ Total unique pins: ${pins.length}`);

        // Save results
        const timestamp = Date.now();
        const outputPath = path.join(outputDir, `pinterest_v2_${timestamp}.json`);
        await fs.writeJson(outputPath, pins, { spaces: 2 });
        console.log(`💾 Saved to: ${outputPath}`);

        // Display results
        console.log('\n📌 Results:');
        pins.slice(0, 15).forEach((pin, i) => {
            console.log(`  [${i + 1}] ${pin.title || '(no title)'}`);
            if (pin.pinner) console.log(`       Pinner: ${pin.pinner}`);
            if (pin.image) console.log(`       Image: ${pin.image.slice(0, 90)}...`);
            if (pin.link) console.log(`       Link: ${pin.link}`);
        });

        return pins;
    } catch (err) {
        console.error('❌ Error:', err.message);
        console.error(err.stack);
        throw err;
    } finally {
        await browser.close();
        console.log('\n🛑 Browser closed.');
    }
}

// Get query from command line or default
const query = process.argv[2] || 'mirai kuriyama';
console.log('='.repeat(60));
console.log('  Pinterest Search Scraper v2');
console.log(`  Query: "${query}"`);
console.log('='.repeat(60));

scrapePinterestSearch(query)
    .then((pins) => {
        console.log('\n✅ Scraping complete!');
        process.exit(0);
    })
    .catch((err) => {
        console.error('\n❌ Fatal:', err.message);
        process.exit(1);
    });
