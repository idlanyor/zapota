import jmail from '../../lib/jmail.js';

export default {
    name: 'jmail',
    aliases: ['jemini'],
    description: 'Ask Jemini AI (Jmail World Archive AI)',
    category: 'AI',
    execute: async (sock, m, args, text) => {
        if (!text) return m.reply('Usage: .jmail <question>');

        // Initial message to be edited
        const { key } = await m.reply('Thinking...');

        try {
            let lastUpdate = Date.now();
            let currentText = '';

            const response = await jmail.ask(text, {
                onChunk: async (fullText) => {
                    currentText = fullText;
                    const now = Date.now();

                    // Throttle updates to avoid being banned for spamming edits (every 1.5 seconds)
                    if (now - lastUpdate > 1500 && currentText.trim().length > 0) {
                        try {
                            await sock.sendMessage(m.chat, {
                                text: currentText + ' ▒',
                                edit: key,
                            });
                            lastUpdate = now;
                        } catch (e) {
                            // Silently fail for transient edit errors (common in Baileys during rapid updates)
                        }
                    }
                },
            });

            // Final update with clean text
            await sock.sendMessage(m.chat, {
                text: response,
                edit: key,
            });
        } catch (error) {
            console.error('Jmail Error:', error);
            await sock.sendMessage(m.chat, {
                text: `Error: ${error.message}`,
                edit: key,
            });
        }
    },
};
