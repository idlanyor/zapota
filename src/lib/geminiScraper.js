/**
 * Gemini Chat Scraper Module
 *
 * Scrapes chat responses from https://gemini.google.com/app
 * Uses Puppeteer to interact with the chat interface
 */

import puppeteer from 'puppeteer';
import logger from '../utils/logger.js';

const GEMINI_CHAT_URL = 'https://gemini.google.com/app';

/**
 * Scrape Gemini Chat response using Puppeteer
 * @param {string} message - The message to send
 * @param {Object} options - Options
 * @param {number} options.timeout - Timeout in ms (default: 90000)
 * @returns {Promise<string>} - The chat response
 */
export const scrapeGeminiChat = async (message, options = {}) => {
    const { timeout = 90000 } = options;

    let browser;
    try {
        logger.info(`Starting Gemini Chat scraper for: ${message.substring(0, 50)}...`, 'GEMINI');

        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        // Navigate to Gemini Chat
        logger.info('Navigating to Gemini Chat...', 'GEMINI');
        await page.goto(GEMINI_CHAT_URL, {
            waitUntil: 'networkidle2',
            timeout: 30000,
        });

        // Wait for page to fully load
        logger.info('Waiting for page to load...', 'GEMINI');
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // Find the textarea input
        logger.info('Finding input field...', 'GEMINI');
        const inputSelector = 'textarea, [contenteditable="true"]';
        const inputEl = await page.$(inputSelector);

        if (!inputEl) {
            throw new Error('Input field not found');
        }

        // Type the message
        logger.info('Typing message...', 'GEMINI');
        await inputEl.type(message, { delay: 50 });

        // Send message by pressing Enter
        logger.info('Sending message...', 'GEMINI');
        await page.keyboard.press('Enter');

        // Wait for response - look for new message elements
        logger.info('Waiting for response...', 'GEMINI');
        const startTime = Date.now();
        let responseText = '';
        let lastLength = 0;
        let stableCount = 0;

        while (Date.now() - startTime < timeout) {
            // Check if response has appeared
            const response = await page.evaluate(() => {
                // Look for the response container
                const responseElements = document.querySelectorAll(
                    '[class*="response"], [class*="message"], [class*="markdown"], .model-response-text'
                );
                
                // Find the last assistant response
                for (let i = responseElements.length - 1; i >= 0; i--) {
                    const el = responseElements[i];
                    const text = el.innerText?.trim() || '';
                    
                    // Skip user messages and empty responses
                    if (text && text.length > 10 && !el.closest('[class*="user"]')) {
                        return text;
                    }
                }
                
                // Fallback: try to get from the response area
                const responseArea = document.querySelector('.response-container, .chat-response, [role="presentation"]');
                if (responseArea) {
                    return responseArea.innerText?.trim() || '';
                }
                
                return '';
            });

            if (response && response.length > 0) {
                if (response.length === lastLength) {
                    stableCount++;
                    if (stableCount >= 3) {
                        responseText = response;
                        break;
                    }
                } else {
                    stableCount = 0;
                    lastLength = response.length;
                    responseText = response;
                }
            }

            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        if (!responseText) {
            throw new Error('Timeout waiting for response');
        }

        logger.success(`Got response: ${responseText.substring(0, 100)}...`, 'GEMINI');
        return responseText;

    } catch (error) {
        logger.error(`Gemini Chat scraper error: ${error.message}`, 'GEMINI');
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
};
