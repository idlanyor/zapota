import * as cheerio from 'cheerio';
import fs from 'fs';
import axios from 'axios';
import ILovePDfSdk from 'ilovepdf-sdk';
import { createPage } from '../../lib/browserManager.js';
import { settings } from '../../config/settings.js';
import { makeResultPath } from '../../utils/resultPath.js';

function htmlToMarkdown(html, url) {
    const $ = cheerio.load(html);

    // Remove unwanted elements
    $('script, style, nav, footer, iframe, noscript, header, svg, form, button').remove();

    let markdown = '';

    // Get title
    const title = $('title').text().trim() || $('h1').first().text().trim();
    if (title) {
        markdown += `# ${title}\n\n`;
    }

    // Process body content
    $('body')
        .find('h1, h2, h3, h4, h5, h6, p, ul, ol, li, pre, code, blockquote')
        .each((_, el) => {
            const tag = el.name ? el.name.toLowerCase() : '';
            const text = $(el).text().trim();
            if (!text) return;

            if (tag === 'h1') markdown += `# ${text}\n\n`;
            else if (tag === 'h2') markdown += `## ${text}\n\n`;
            else if (tag === 'h3') markdown += `### ${text}\n\n`;
            else if (tag === 'h4') markdown += `#### ${text}\n\n`;
            else if (tag === 'h5') markdown += `##### ${text}\n\n`;
            else if (tag === 'h6') markdown += `###### ${text}\n\n`;
            else if (tag === 'p') markdown += `${text}\n\n`;
            else if (tag === 'blockquote') markdown += `> ${text}\n\n`;
            else if (tag === 'pre' || tag === 'code') {
                if (tag === 'pre' && $(el).find('code').length > 0) return;
                markdown += `\`\`\`\n${text}\n\`\`\`\n\n`;
            } else if (tag === 'li') {
                const parentTag = el.parent && el.parent.name ? el.parent.name.toLowerCase() : '';
                if (parentTag === 'ol') {
                    const index = $(el).index() + 1;
                    markdown += `${index}. ${text}\n`;
                } else {
                    markdown += `- ${text}\n`;
                }
            }
        });

    if (url) {
        markdown += `\n---\n*Source: [${url}](${url})*`;
    }

    return markdown;
}

async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 100;
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if (totalHeight >= scrollHeight - window.innerHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
        window.scrollTo(0, 0);
    });
}

async function htmlToMarkdownAI(html, url) {
    const $ = cheerio.load(html);

    // Remove unwanted elements to reduce tokens
    $(
        'script, style, nav, footer, iframe, noscript, header, svg, form, button, head, link, meta'
    ).remove();

    const cleanHtml = $('body').html()?.trim() || html;
    const truncatedHtml = cleanHtml.slice(0, 50000);

    const apiKey = process.env.ANTHROPIC_AUTH_TOKEN;
    const baseUrl = process.env.ANTHROPIC_BASE_URL;

    if (!apiKey || !baseUrl) {
        throw new Error('ANTHROPIC_AUTH_TOKEN or ANTHROPIC_BASE_URL is not configured in env');
    }

    const messagesUrl = `${baseUrl.replace(/\/$/, '')}/messages`;

    const systemPrompt =
        'You are a professional HTML-to-Markdown converter. ' +
        'Analyze the provided clean HTML fragment and rewrite it into a well-structured, clean, and complete Markdown document. ' +
        "Keep all core information, links, and code blocks intact. Do not add conversational explanations or prefix with 'Here is the markdown'; " +
        'output ONLY the clean Markdown content.';

    const userPrompt = `Source URL: ${url}\n\nHTML Content:\n\`\`\`html\n${truncatedHtml}\n\`\`\``;

    const response = await axios.post(
        messagesUrl,
        {
            model: 'cn/DeepSeek-V4-Flash',
            max_tokens: 4000,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
        },
        {
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
            },
            timeout: 60000,
        }
    );

    let markdown = '';
    if (response.data.content && response.data.content[0]) {
        markdown = response.data.content[0].text || '';
    }

    // Clean up code block wrappers if any
    if (markdown.startsWith('```markdown')) {
        markdown = markdown.replace(/^```markdown\n/, '').replace(/\n```$/, '');
    } else if (markdown.startsWith('```')) {
        markdown = markdown.replace(/^```\n/, '').replace(/\n```$/, '');
    }

    if (url) {
        markdown += `\n\n---\n*Source: [${url}](${url}) | Formatted by AI*`;
    }

    return markdown;
}

export default {
    name: 'web2pdf',
    aliases: ['web2pdf', 'web2md', 'webpdf', 'webmd'],
    description: 'Convert web page to PDF or Markdown document',
    category: 'Tools',
    execute: async (sock, m, args, text) => {
        if (!text) {
            return sock.sendMessage(
                m.chat,
                {
                    text:
                        `Usage:\n` +
                        `${settings.prefix}web2pdf <url> [--wait <seconds>] [--mobile|--tablet] - Convert to PDF\n` +
                        `${settings.prefix}web2md <url> [--wait <seconds>] [--mobile|--tablet] - Convert to Markdown\n\n` +
                        `Example: ${settings.prefix}web2pdf https://example.com --mobile --wait 5`,
                },
                { quoted: m }
            );
        }

        let query = text.trim();

        // Detect and parse --wait or --delay parameter
        let waitTime = 0;
        const waitMatch = query.match(/--(wait|delay)\s+(\d+)/i);
        if (waitMatch) {
            const val = parseInt(waitMatch[2], 10);
            waitTime = val < 100 ? val * 1000 : val;
            query = query.replace(/--(wait|delay)\s+\d+/i, '').trim();
        }

        // Detect viewport mode (desktop is default)
        let viewportMode = 'desktop';
        if (query.includes('--mobile')) {
            viewportMode = 'mobile';
            query = query.replace(/--mobile/g, '').trim();
        } else if (query.includes('--tablet')) {
            viewportMode = 'tablet';
            query = query.replace(/--tablet/g, '').trim();
        }

        let url = query;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        // Determine output type from used command
        const body = m.body || '';
        const isMarkdown =
            body.toLowerCase().includes('web2md') || body.toLowerCase().includes('webmd');

        await m.react('⏳');

        let page;
        try {
            page = await createPage();

            // Configure viewport and User Agent based on viewportMode
            let width = 1920;
            let height = 1080;
            let isMobile = false;
            let hasTouch = false;
            let isLandscape = true;
            let userAgent =
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';

            if (viewportMode === 'mobile') {
                width = 375;
                height = 812;
                isMobile = true;
                hasTouch = true;
                isLandscape = false;
                userAgent =
                    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
            } else if (viewportMode === 'tablet') {
                width = 768;
                height = 1024;
                isMobile = true;
                hasTouch = true;
                isLandscape = false;
                userAgent =
                    'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
            }

            // Set viewport
            await page.setViewport({ width, height, isMobile, hasTouch, isLandscape });

            // Set user agent
            await page.setUserAgent(userAgent);

            // Navigate to URL
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

            // Trigger auto-scroll to force load lazy-loaded elements/images
            await autoScroll(page);

            // Wait for custom delay if specified
            if (waitTime > 0) {
                await new Promise((resolve) => setTimeout(resolve, waitTime));
            }

            const pageTitle = await page.title();
            const cleanTitle =
                (pageTitle || 'document').replace(/[^a-z0-9\s\-_\.]/gi, ' ').trim() ||
                'web_document';

            if (isMarkdown) {
                const htmlContent = await page.content();

                let markdownText;
                try {
                    markdownText = await htmlToMarkdownAI(htmlContent, url);
                } catch (aiError) {
                    console.error(
                        'Failed to convert via AI, falling back to local converter:',
                        aiError
                    );
                    markdownText = htmlToMarkdown(htmlContent, url);
                }

                if (!markdownText || markdownText.trim().length < 50) {
                    throw new Error('Could not extract meaningful content from this website.');
                }

                // If content is short, send as text, otherwise send as .md attachment
                if (markdownText.length < 4000) {
                    await sock.sendMessage(m.chat, { text: markdownText }, { quoted: m });
                } else {
                    const mdBuffer = Buffer.from(markdownText, 'utf-8');
                    await sock.sendMessage(
                        m.chat,
                        {
                            document: mdBuffer,
                            mimetype: 'text/markdown',
                            fileName: `${cleanTitle}.md`,
                            caption: `Markdown format for: ${url}`,
                        },
                        { quoted: m }
                    );
                }
            } else {
                // Emulate screen media type to avoid page cutting/blanking in print stylesheets
                await page.emulateMediaType('screen');

                // Override body/html print styles that restrict height/overflow
                await page.addStyleTag({
                    content: `
                        html, body, #__next, #root {
                            height: auto !important;
                            overflow: visible !important;
                        }
                    `,
                });

                // Generate PDF
                const rawPdfBuffer = await page.pdf({
                    format: 'A4',
                    printBackground: true,
                    margin: {
                        top: '40px',
                        bottom: '40px',
                        left: '40px',
                        right: '40px',
                    },
                });

                if (!rawPdfBuffer || rawPdfBuffer.length === 0) {
                    throw new Error('Generated PDF is empty.');
                }

                let pdfBuffer = Buffer.from(rawPdfBuffer);

                // Auto compress if PDF is larger than 3MB (to make it light for WhatsApp) and iLovePDF keys are set
                if (
                    pdfBuffer.length > 3 * 1024 * 1024 &&
                    process.env.ILOVEPDF_PUBLIC_KEY &&
                    process.env.ILOVEPDF_SECRET_KEY
                ) {
                    try {
                        const tempInName = `in_${Date.now()}_${Math.floor(Math.random() * 1000)}.pdf`;
                        const tempOutName = `out_${Date.now()}_${Math.floor(Math.random() * 1000)}.pdf`;
                        const tempInPath = makeResultPath(tempInName);
                        const tempOutPath = makeResultPath(tempOutName);

                        fs.writeFileSync(tempInPath, pdfBuffer);

                        const ilovepdf = new ILovePDfSdk(
                            process.env.ILOVEPDF_PUBLIC_KEY,
                            process.env.ILOVEPDF_SECRET_KEY
                        );

                        const task = await ilovepdf.createTask('compress');
                        await task.addFile(tempInPath);
                        await task.process({ compression_level: 'recommended' });
                        await task.download(tempOutPath);

                        if (fs.existsSync(tempOutPath) && fs.statSync(tempOutPath).size > 0) {
                            pdfBuffer = fs.readFileSync(tempOutPath);
                        }

                        // Cleanup
                        if (fs.existsSync(tempInPath)) fs.unlinkSync(tempInPath);
                        if (fs.existsSync(tempOutPath)) fs.unlinkSync(tempOutPath);
                    } catch (compressError) {
                        console.error('iLovePDF Compression Error:', compressError);
                        // Fall back to original uncompressed pdfBuffer
                    }
                }

                await sock.sendMessage(
                    m.chat,
                    {
                        document: pdfBuffer,
                        mimetype: 'application/pdf',
                        fileName: `${cleanTitle}.pdf`,
                        caption: `PDF format for: ${url}`,
                    },
                    { quoted: m }
                );
            }

            await m.react('✅');
        } catch (error) {
            console.error('Error in web2pdf command:', error);
            await m.react('❌');
            await sock.sendMessage(
                m.chat,
                { text: `Failed to convert website.\nError: ${error.message}` },
                { quoted: m }
            );
        } finally {
            if (page) {
                try {
                    await page.close();
                } catch (e) {
                    console.error('Error closing page:', e);
                }
            }
        }
    },
};
