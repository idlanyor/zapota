import * as cheerio from 'cheerio';
import { execSync } from 'child_process';

async function scrapeFDown(facebookUrl) {
    try {
        const curlCommand = `curl -s -X POST -d "URLz=${facebookUrl}" https://fdown.net/download.php \
            -H "Content-Type: application/x-www-form-urlencoded" \
            -H "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
            -H "Referer: https://fdown.net/"`;

        const html = execSync(curlCommand).toString();
        const $ = cheerio.load(html);

        const result = {
            title: $('.lib-row.lib-header').text().trim() || 'No title',
            description:
                $('.lib-row.lib-desc').first().text().replace('Description:', '').trim() ||
                'No description',
            duration:
                $('.lib-row.lib-desc').last().text().replace('Duration:', '').trim() || 'Unknown',
            thumbnail: $('.lib-img-show').attr('src'),
            sd: $('#sdlink').attr('href'),
            hd: $('#hdlink').attr('href'),
        };

        return result;
    } catch (error) {
        console.error('Error scraping:', error);
        return null;
    }
}

const exampleUrl = 'https://www.facebook.com/share/r/1NWN5TDgg3/';
scrapeFDown(exampleUrl).then((data) => {
    console.log(JSON.stringify(data, null, 2));
});
