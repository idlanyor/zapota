import axios from 'axios';

class Gopay {
    constructor(token) {
        this.token = token;
        this.baseUrl = 'https://api.gojekapi.com';
        this.headers = {
            Authorization: `Bearer ${this.token}`,
            'content-type': 'application/json',
            'X-Appversion': '4.80.1',
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
        };
    }

    async getHistory(limit = 10) {
        try {
            const { data } = await axios.get(
                `${this.baseUrl}/wallet/history?page=1&limit=${limit}`,
                {
                    headers: this.headers,
                }
            );

            if (!data.success)
                throw new Error(data.errors?.[0]?.message || 'Failed to fetch history');

            return data.data.success.map((item) => ({
                id: item.transaction_id,
                type: item.type, // TOPUP, PAYMENT, etc
                amount: item.amount.value,
                description: item.description,
                timestamp: item.created_at,
                status: item.status,
            }));
        } catch (error) {
            console.error('Gopay History Error:', error.response?.data || error.message);
            throw error;
        }
    }
}

export default Gopay;
