import puppeteer from 'puppeteer';
import logger from '../utils/logger.js';

let browserInstance = null;
let pageCounter = 0;
const MAX_PAGES_BEFORE_RELAUNCH = 50;

const launchOptions = {
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
        '--mute-audio',
    ],
};

/**
 * Get or initialize the global Puppeteer browser instance.
 * @returns {Promise<import('puppeteer').Browser>}
 */
export const getBrowser = async () => {
    if (browserInstance) {
        try {
            // Test if connection is active
            await browserInstance.version();

            // Auto restart browser after processing too many pages to avoid memory leaks
            if (pageCounter >= MAX_PAGES_BEFORE_RELAUNCH) {
                logger.info(
                    `Browser processed ${pageCounter} pages. Relaunching to prevent memory leaks...`,
                    'BROWSER'
                );
                await closeBrowser();
            } else {
                return browserInstance;
            }
        } catch (e) {
            logger.warn('Browser instance disconnected or dead. Relaunching...', 'BROWSER');
            await closeBrowser();
        }
    }

    logger.info('Launching a new global Puppeteer browser instance...', 'BROWSER');
    browserInstance = await puppeteer.launch(launchOptions);
    pageCounter = 0;
    return browserInstance;
};

/**
 * Gracefully close the global browser instance.
 */
export const closeBrowser = async () => {
    if (browserInstance) {
        try {
            await browserInstance.close();
        } catch (e) {
            logger.error(`Error closing browser: ${e.message}`, 'BROWSER');
        }
        browserInstance = null;
    }
};

/**
 * Open a new page/tab in the global browser instance.
 * @returns {Promise<import('puppeteer').Page>}
 */
export const createPage = async () => {
    const browser = await getBrowser();
    const page = await browser.newPage();
    pageCounter++;
    return page;
};

// Gracefully close on exit
process.on('exit', () => {
    if (browserInstance) {
        browserInstance.close().catch(() => {});
    }
});
