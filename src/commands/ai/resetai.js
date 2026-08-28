import { clearChatHistory } from '../../lib/ai.js';

export default {
    name: 'resetai',
    aliases: ['forget', 'clearai'],
    description: 'Clear AI conversation history',
    category: 'AI',
    execute: async (sock, m) => {
        const success = clearChatHistory(m.chat);
        if (success) {
            await m.reply(' Memori percakapan di chat ini telah dihapus.');
        } else {
            await m.reply(' Chat ini belum memiliki memori percakapan.');
        }
    },
};
