import * as cheerio from 'cheerio';
import { execSync } from 'child_process';
import vm from 'vm';

async function igDl(url) {
    try {
        // Step 1: Get token
        const html = execSync('curl -s https://clipdown.app/id').toString();
        const tokenMatch = html.match(/k_token="([^"]+)"/);
        if (!tokenMatch) throw new Error('Could not find token');
        const token = tokenMatch[1];

        // Step 2: Search
        const postData = `q=${encodeURIComponent(url)}&t=media&lang=id&v=v2&k_token=${token}`;
        const response = execSync(`curl -s -X POST https://clipdown.app/api/ajaxSearch \
            -H "Content-Type: application/x-www-form-urlencoded" \
            -H "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
            -H "Referer: https://clipdown.app/id" \
            -d "${postData}"`).toString();

        const resJson = JSON.parse(response);
        console.log('Response JSON:', JSON.stringify(resJson).substring(0, 200));
        if (resJson.status !== 'ok') throw new Error('Search failed: ' + response);

        // Step 3: Decode JS
        const decodedHtml = decodeClipDown(resJson.data);
        console.log('Decoded HTML snippet:', decodedHtml.substring(0, 500));
        const $ = cheerio.load(decodedHtml);

        const result = [];
        $('.download-items').each((i, el) => {
            const thumbnail = $(el).find('.download-items__thumb img').attr('src');
            const videoUrl = $(el)
                .find('.download-items__btn a[title="Download Video"]')
                .attr('href');
            const imageUrl = $(el)
                .find('.download-items__btn a[title="Download Thumbnail"]')
                .attr('href');

            result.push({
                thumbnail,
                videoUrl,
                imageUrl,
            });
        });

        if (result.length === 0) {
            // Fallback for single item
            const thumbnail = $('.download-items__thumb img').attr('src');
            const videoUrl = $('a[title="Download Video"]').attr('href');
            const imageUrl = $('a[title="Download Thumbnail"]').attr('href');
            if (videoUrl || imageUrl) {
                result.push({ thumbnail, videoUrl, imageUrl });
            }
        }

        return {
            status: true,
            message: 'Success scraping Instagram content',
            data: result,
            error: null,
        };
    } catch (error) {
        return {
            status: false,
            message: 'Failed to scrape Instagram content',
            data: null,
            error: error.message,
        };
    }
}

function decodeClipDown(data) {
    const arrayMatch = data.match(/var (_0x[a-f0-9]+)=\[([^\]]+)\]/);
    if (!arrayMatch) throw new Error('Could not find lookup array');
    const arrayName = arrayMatch[1];
    const arrayValues = JSON.parse('[' + arrayMatch[2] + ']');

    const funcMatch = data.match(/function (_0x[a-f0-9]+)\(d,e,f\){([\s\S]+?)}eval/);
    if (!funcMatch) throw new Error('Could not find conversion function');
    const funcName = funcMatch[1];
    const funcBody = funcMatch[2];

    const packerMatch = data.match(/eval\(function\(h,u,n,t,e,r\){[\s\S]+?}\(([^)]+)\)\)/);
    if (!packerMatch) throw new Error('Could not find packer call');
    const packerArgsStr = packerMatch[1];

    const script = `
        var ${arrayName} = ${JSON.stringify(arrayValues)};
        function ${funcName}(d,e,f){${funcBody}}
        (function(h,u,n,t,e,r){
            r="";
            for(var i=0,len=h.length;i<len;i++){
                var s="";
                while(h[i]!==n[e]){s+=h[i];i++}
                for(var j=0;j<n.length;j++)s=s.replace(new RegExp(n[j],"g"),j);
                r+=String.fromCharCode(${funcName}(s,e,10)-t)
            }
            return decodeURIComponent(r)
        })(${packerArgsStr});
    `;

    return vm.runInNewContext(script, {
        Math,
        String,
        decodeURIComponent,
        RegExp,
    });
}

const exampleUrl = 'https://www.instagram.com/reel/DXNSa8Ckoj-/';
igDl(exampleUrl).then((data) => {
    console.log(JSON.stringify(data, null, 2));
});
