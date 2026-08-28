import * as cheerio from 'cheerio';
import { execSync } from 'child_process';
import fs from 'fs';

async function scrapeInDown(instagramUrl) {
    const cookieFile = 'indown_cookies.txt';
    try {
        // Step 1: Get the page to extract token and cookies
        const initialCurl = `curl -s -L -c ${cookieFile} https://indown.io/en1`;
        const htmlInitial = execSync(initialCurl).toString();
        const $initial = cheerio.load(htmlInitial);
        const token = $initial('input[name="_token"]').val();

        if (!token) {
            throw new Error('Could not find CSRF token');
        }

        // Step 2: POST the URL with the token and cookies
        const postCurl = `curl -s -L -b ${cookieFile} -X POST https://indown.io/download \
            -H "Content-Type: application/x-www-form-urlencoded" \
            -H "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
            -H "Referer: https://indown.io/en1" \
            -d "referer=https://indown.io/en1" \
            -d "locale=en" \
            -d "_token=${token}" \
            -d "link=${instagramUrl}"`;

        const htmlResult = execSync(postCurl).toString();
        const $ = cheerio.load(htmlResult);

        // Parse the results
        // On indown.io, results are usually in a div with id 'result'
        const downloads = [];
        $('.col-md-4').each((i, el) => {
            const link = $(el).find('a.btn-primary').attr('href');
            if (link) {
                downloads.push({
                    quality: 'Original',
                    url: link,
                });
            }
        });

        // Some alternative selectors if the above fails
        if (downloads.length === 0) {
            $('a[download]').each((i, el) => {
                const link = $(el).attr('href');
                if (link && !link.startsWith('javascript')) {
                    downloads.push({
                        quality: 'Download',
                        url: link,
                    });
                }
            });
        }

        return {
            status: true,
            data: {
                downloads,
            },
        };
    } catch (error) {
        return {
            status: false,
            error: error.message,
        };
    } finally {
        if (fs.existsSync(cookieFile)) {
            fs.unlinkSync(cookieFile);
        }
    }
}

const exampleUrl = 'https://www.instagram.com/reel/C3R1_O_S8v3/';
scrapeInDown(exampleUrl).then((data) => {
    console.log(JSON.stringify(data, null, 2));
});
