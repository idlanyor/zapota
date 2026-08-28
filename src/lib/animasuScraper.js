import axios from 'axios';
import * as cheerio from 'cheerio';
import logger from '../utils/logger.js';

/**
 * Scrapes the anime schedule from Animasu.
 * @returns {Promise<Object>} An object containing anime schedule grouped by day.
 */
export async function getAnimasuSchedule() {
    try {
        const url = 'https://v2.animasu.work/jadwal/';
        const { data: html } = await axios.get(url, {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            },
            timeout: 15000,
        });

        const $ = cheerio.load(html);
        const schedule = {};

        $('.bixbox').each((_, el) => {
            const day = $(el).find('.releases h3 span').text().trim();
            if (!day) return;

            schedule[day] = [];
            $(el).find('.listupd .bs').each((_, bsEl) => {
                const link = ($(bsEl).find('a').attr('href') || '').replace('v2.animasu.work/anime/', 'kanatanime.net/anime2/');
                const title = $(bsEl).find('.tt').text().trim() || $(bsEl).find('a').attr('title') || '';
                const status = $(bsEl).find('.limit .bt .epx').text().trim() || '';
                const episode = $(bsEl).find('.limit .bt .sb').text().trim() || '';
                const image = $(bsEl).find('img').attr('src') || $(bsEl).find('img').attr('data-src') || '';

                schedule[day].push({
                    title,
                    link,
                    status,
                    episode,
                    image,
                });
            });
        });

        return schedule;
    } catch (error) {
        logger.error(`Error scraping Animasu schedule: ${error.message}`, 'ANIMASU');
        throw error;
    }
}
