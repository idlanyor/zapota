import testrich from './testrich.js';

export default {
    name: 'carousel',
    aliases: ['testcarousel', 'cr'],
    description: 'Tes fitur Meta AI Native Carousel (kartu video/reels swipe)',
    category: 'Utility',
    execute: async (sock, m) => {
        return testrich.execute(sock, m, ['carousel']);
    },
};
