import axios from 'axios';

class Jmail {
    constructor() {
        this.baseUrl = 'https://jmail.world/api/chat';
        this.headers = {
            'Content-Type': 'application/json',
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            Referer: 'https://jmail.world/jemini',
            Origin: 'https://jmail.world',
        };
    }

    /**
     * Ask Jemini (Jmail AI)
     * @param {string} query
     * @param {Object} options - { onChunk: (text) => void } for streaming
     * @returns {Promise<string>} Full response text
     */
    async ask(query, options = {}) {
        try {
            const response = await axios.post(
                this.baseUrl,
                {
                    model: 'gemini',
                    messages: [
                        {
                            parts: [{ type: 'text', text: query }],
                            role: 'user',
                        },
                    ],
                    trigger: 'submit-message',
                },
                {
                    headers: this.headers,
                    responseType: 'stream',
                }
            );

            let fullText = '';
            let buffer = '';

            return new Promise((resolve, reject) => {
                response.data.on('data', (chunk) => {
                    buffer += chunk.toString();
                    const lines = buffer.split('\n');

                    // Keep the last partial line in the buffer
                    buffer = lines.pop();

                    for (let line of lines) {
                        if (line.startsWith('data: ')) {
                            const content = line.replace('data: ', '').trim();
                            if (content === '[DONE]') break;

                            try {
                                const json = JSON.parse(content);
                                if (json.type === 'text-delta' && json.delta) {
                                    fullText += json.delta;
                                    if (options.onChunk) {
                                        options.onChunk(fullText);
                                    }
                                }
                            } catch (e) {
                                // Ignore non-JSON
                            }
                        }
                    }
                });

                response.data.on('end', () => {
                    let finalOutput = fullText.trim().replace(/\*\*(.*?)\*\*/g, '*$1*');
                    resolve(finalOutput);
                });

                response.data.on('error', (err) => reject(err));
            });
        } catch (error) {
            if (error.response) {
                throw new Error(`Jmail API Error: ${error.response.statusText}`);
            }
            throw error;
        }
    }
}

export default new Jmail();
