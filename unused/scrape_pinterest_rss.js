/**
 * Pinterest Search Scraper v4 - RSS Feed & Public Endpoints
 * Usage: node unused/scrape_pinterest_rss.js "mirai kuriyama"
 *
 * Uses Pinterest's public RSS/search feeds and other methods.
 */

import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseString } from 'xml2js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function parseXML(xml) {
    return new Promise((resolve, reject) => {
        parseString(xml, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
}

const COOKIE_STR = `g_state={"i_l":0,"i_ll":1784256840648,"i_b":"0lxJPEI0owKHR6ml7468ycofO5JxnjASOBrM4y/pF3s","i_e":{"enable_itp_optimization":24},"i_et":1784256840648};csrftoken=cb2840e30da20bf4c1b3130211884101;_pinterest_referrer=https://www.google.com/;_routing_id="a2f49ad0-6fc1-4439-9f44-5d369c2e99c2";_b="AZNDwjyOHs5CabXN1yP/y5MyvNkxKwyXEGW0lLZuCS+Q3XdJkIvP5s3inPAK53dXSZ4=";_pinterest_sess=TWc9PSZJTUc4d2NQVmt4cmFWN3pQaXNJOURvaVZvczI2bVZKSmhKK0xFQXVlLzJWQkdubWRiWWZKMjdLN0pUOGZQL3B2TW52OWVsM1hDZ0NTaS9laEhLMDFZUVpMemlLUWFUelJoZDM3N1VEZVFwTjM5Z21ad2txdGIzYjZybzdueEpUME1qU2o2Smc0QXpMNjlCMXZBSlM4QVBNQVo3cTVxSFRnZmJBbHRCaU9Sb0xiQ1h4QkFzcE5xRFFzbVd2UkR6OVk0MEJMdjMzVlZnZjMzUU9Zc0NZaTZXZGx6cW5FdjhWS0dYS2xCSGxlRC9RYWlzUy9uOG5YSmdBTkNXaUdJaTRlU00xYVZ1ck9UWTdvNWpXcU42U2d3b1RNeUhNSG9CSUNvdWVoVkV6Z2VleXFGVmc1b1FSQTIwaGZ6RGJaYjJwNEJFSWRBMXlhaytCQnRjeVcwSENmR3RnSFh3STJ3TE5zbmkzdEhBYXp5NXhaOUNYS0hlY21VR2NqWjgzRnpGbGtqeXRUZHBEMERNVk1RZmYwNlVreUdnPT0mRVNENWhMVExTNEFqRUtJUCt4Smxsdllsbmc0PQ==;usersync=%7B%22magnite%22%3A%7B%22id%22%3A%22MC3IL7OY-1M-30XT%22%2C%22ts%22%3A1784098076459%7D%7D;__Secure-s_a=djhOckxoeUNYQW1DT3owWXBNY3lmUHZ6SCtFQjBmKzZUUzRJcUsxeW5PN2xiS1FucVF3dDFPY1llczFrRHV1cmxyTmMwRGVPKytLLzRyeGpBaWpYTE00a3dLZlpYT1NXZUFWLzBaMGpkQ0w1ditwUWt3M3VGQy9iSzhseEJJRlF2RDRuL3E1NHhYVmpqcHk3WXBLb0NvZ1lVSHdWcCtCcThFUEhUMUhVRGJrNDRXT3pVN1V6VXJIdG1Tdm9pWVc0NkhZVnM1RU8vUTZDOU9hYmYvRzVWRUl4NmJhVC9vV0M1WmVzdExXUDFucmJ1VHR0ZmUyN2tQWEd6TGRIVXczTytzdkY3dUVBK3VSeEhiZW5rUjIvNmprVE96dkQrNFJMMGVaOWFGRjN4b289JlFhMytqeGFtL1RuN3pSd0pocThjaG5WNGV4az0=;_auth=1;ar_debug=1;ar_debug=1;sessionFunnelEventLogged=1`;

const USER_AGENT =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const headers = {
    'User-Agent': USER_AGENT,
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    Cookie: COOKIE_STR,
};

/**
 * Method 1: Pinterest RSS Feed (public, no auth needed sometimes)
 */
async function methodRSS(query) {
    console.log(`\n📡 Method RSS: Pinterest RSS Feed`);

    // Pinterest has RSS feeds for search
    const rssUrls = [
        `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}&rs=typed&format=rss`,
        `https://id.pinterest.com/search/pins/?q=${encodeURIComponent(query)}&rs=typed&format=rss`,
    ];

    for (const url of rssUrls) {
        try {
            console.log(`   Trying: ${url}`);
            const response = await axios.get(url, {
                headers: {
                    ...headers,
                    Accept: 'application/rss+xml, application/xml, text/xml, */*',
                },
                timeout: 15000,
            });

            const contentType = response.headers['content-type'] || '';
            console.log(`   Status: ${response.status}, Content-Type: ${contentType}`);

            if (
                contentType.includes('xml') ||
                response.data.includes('<?xml') ||
                response.data.includes('<rss')
            ) {
                // Parse RSS XML
                try {
                    const parsed = await parseXML(response.data);
                    const items = parsed?.rss?.channel?.[0]?.item || parsed?.feed?.entry || [];

                    if (items.length > 0) {
                        console.log(`   Found ${items.length} items in RSS`);
                        return items.map((item) => ({
                            id: item.guid?.[0]?._ || item.id?.[0] || '',
                            title: item.title?.[0] || '',
                            image:
                                item['media:content']?.[0]?.$.url ||
                                item.enclosure?.[0]?.$.url ||
                                item['media:thumbnail']?.[0]?.$.url ||
                                '',
                            link:
                                item.link?.[0]?.$.href || item.link?.[0] || item.guid?.[0]?._ || '',
                            description:
                                item.description?.[0] || item['media:description']?.[0] || '',
                        }));
                    }
                } catch (parseErr) {
                    console.log(`   XML parse error: ${parseErr.message}`);
                }
            }
        } catch (err) {
            console.log(`   Failed: ${err.message}`);
        }
    }
    return [];
}

/**
 * Method 2: Pinterest oembed (public endpoint)
 */
async function methodOembed(query) {
    console.log(`\n📡 Method oEmbed: Pinterest oEmbed API`);

    // First get some pin URLs from somewhere, then use oembed
    // Or use the search feed

    // Try getting pins from related searches or feed
    const feedUrl = `https://id.pinterest.com/search/pins/?q=${encodeURIComponent(query)}&rs=typed`;

    try {
        const response = await axios.get(feedUrl, {
            headers: {
                ...headers,
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            timeout: 15000,
            maxRedirects: 5,
        });

        const html = response.data;

        // Extract pin URLs from HTML
        const pinUrlRegex = /https:\/\/[a-z]+\.pinterest\.com\/pin\/[^"'\s]+/g;
        const pinUrls = [...new Set(html.match(pinUrlRegex) || [])];

        console.log(`   Found ${pinUrls.length} pin URLs in HTML`);

        // Use oembed for each pin
        const results = [];
        for (const pinUrl of pinUrls.slice(0, 25)) {
            try {
                const oembedUrl = `https://www.pinterest.com/oembed?url=${encodeURIComponent(pinUrl)}&format=json`;
                const oembedRes = await axios.get(oembedUrl, {
                    headers: { 'User-Agent': USER_AGENT },
                    timeout: 5000,
                });
                if (oembedRes.data) {
                    results.push({
                        id: oembedRes.data.pin_id || '',
                        title: oembedRes.data.title || oembedRes.data.description || '',
                        image: oembedRes.data.thumbnail_url || oembedRes.data.url || '',
                        link: pinUrl,
                        description: oembedRes.data.description || '',
                        author: oembedRes.data.author_name || '',
                    });
                }
            } catch (e) {
                // Skip failed pins
            }
        }

        return results;
    } catch (err) {
        console.log(`   Failed: ${err.message}`);
    }
    return [];
}

/**
 * Method 3: Try fetching via Google cache / textise dot iitty
 */
async function methodTextise(query) {
    console.log(`\n📡 Method Textise: Textise dot iitty`);

    const textiseUrl = `https://r.jina.ai/http://id.pinterest.com/search/pins/?q=${encodeURIComponent(query)}&rs=typed`;

    try {
        const response = await axios.get(textiseUrl, {
            headers: {
                'User-Agent': USER_AGENT,
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            timeout: 30000,
        });

        const text = response.data;
        console.log(`   Response length: ${text.length} chars`);

        // Extract image URLs
        const imgRegex = /https:\/\/i\.pinimg\.com\/[^\s"'<>]+/g;
        const images = [...new Set(text.match(imgRegex) || [])];

        // Extract URLs
        const urlRegex = /https:\/\/[a-z]+\.pinterest\.com\/pin\/[^"'<>\s]+/g;
        const links = [...new Set(text.match(urlRegex) || [])];

        console.log(`   Found ${images.length} images, ${links.length} links`);

        const results = [];
        const maxLen = Math.max(images.length, links.length);
        for (let i = 0; i < Math.min(maxLen, 30); i++) {
            results.push({
                id: '',
                title: '',
                image: images[i] || '',
                link: links[i] || '',
                description: '',
            });
        }
        return results;
    } catch (err) {
        console.log(`   Failed: ${err.message}`);
    }
    return [];
}

async function main() {
    const query = process.argv[2] || 'mirai kuriyama';
    const outputDir = path.join(__dirname, '..', 'results');
    await fs.ensureDir(outputDir);

    console.log('='.repeat(60));
    console.log('  Pinterest Search Scraper v4 - RSS & Public');
    console.log(`  Query: "${query}"`);
    console.log('='.repeat(60));

    let allPins = [];

    // Try all methods
    const results = await Promise.allSettled([
        methodRSS(query),
        methodOembed(query),
        methodTextise(query),
    ]);

    for (const result of results) {
        if (result.status === 'fulfilled') {
            allPins.push(...result.value);
        }
    }

    // Deduplicate
    const seen = new Set();
    allPins = allPins.filter((p) => {
        const key = p.link || p.image || p.id;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ Total unique pins: ${allPins.length}`);

    // Save
    const timestamp = Date.now();
    const outputPath = path.join(outputDir, `pinterest_rss_${timestamp}.json`);
    await fs.writeJson(outputPath, allPins, { spaces: 2 });
    console.log(`💾 Saved to: ${outputPath}`);

    // Display
    if (allPins.length > 0) {
        console.log('\n📌 Top Results:');
        allPins.slice(0, 15).forEach((pin, i) => {
            console.log(`  [${i + 1}] ${pin.title || '(no title)'}`);
            if (pin.author) console.log(`       Author: ${pin.author}`);
            if (pin.image) console.log(`       Image: ${pin.image.slice(0, 90)}...`);
            if (pin.link) console.log(`       Link: ${pin.link.slice(0, 100)}`);
        });
    } else {
        console.log('\n⚠️  No pins found via any method.');
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
