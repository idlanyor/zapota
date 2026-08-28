import axios from 'axios';
import * as cheerio from 'cheerio';
import logger from '../utils/logger.js';

/**
 * Scrapes the anime schedule from Otakudesu.
 * @returns {Promise<Object>} Schedule grouped by day.
 */
export async function getOtakudesuSchedule() {
    try {
        const url = 'https://otakudesu.blog/jadwal-rilis/';
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

        $('.kglist321').each((_, el) => {
            const day = $(el).find('h2').text().trim();
            if (!day) return;

            schedule[day] = [];
            $(el).find('ul li a').each((__, a) => {
                const title = $(a).text().trim();
                const link = ($(a).attr('href') || '').replace('otakudesu.blog/anime', 'kanatanime.net/anime');
                if (!title) return;
                schedule[day].push({ title, link });
            });
        });

        return schedule;
    } catch (error) {
        logger.error(`Error scraping Otakudesu schedule: ${error.message}`, 'OTAKUDESU');
        throw error;
    }
}
