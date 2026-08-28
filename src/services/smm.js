import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class SmmService {
    constructor() {
        this.markup = 2000;
    }

    get apiKey() {
        return process.env.SMM_API_KEY;
    }

    get baseUrl() {
        // Pastikan tidak mereturn string "undefined" tapi default URL
        return process.env.SMM_BASE_URL && process.env.SMM_BASE_URL !== 'undefined'
            ? process.env.SMM_BASE_URL
            : 'https://indosmm.id/api/v2';
    }

    async #callApi(params) {
        const key = this.apiKey;
        const url = this.baseUrl;

        if (!key || key === 'undefined') {
            return {
                error: 'SMM_API_KEY is not set in .env file. Please add it and run .reloadenv',
            };
        }

        const body = Object.entries({ key, ...params })
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&');

        const curlCmd = `curl -s -X POST "${url}" -d "${body}"`;

        try {
            const { stdout } = await execAsync(curlCmd);
            if (!stdout) return { error: 'Empty response from SMM API' };
            return JSON.parse(stdout);
        } catch (error) {
            console.error('SMM API Error:', error);
            // Provide cleaner error for the user
            if (error.message.includes('Unexpected token')) {
                return {
                    error: 'API returned invalid JSON. Possible wrong API URL or Maintenance.',
                };
            }
            return { error: `Connection failed: ${error.message}` };
        }
    }

    async getServices() {
        const results = await this.#callApi({ action: 'services' });
        if (results.error) return results;
        if (!Array.isArray(results)) return { error: 'Invalid services format from API' };

        // IDs requested: 8746, 8505
        const targetIds = [8746, 8505];

        return results
            .filter((s) => {
                const id = parseInt(s.id || s.service);
                return targetIds.includes(id);
            })
            .map((s) => ({
                id: s.id || s.service,
                category: s.category,
                name: s.name || s.service,
                originalPrice: parseFloat(s.price || s.rate || 0),
                price: parseFloat(s.price || s.rate || 0) + this.markup,
                min: parseInt(s.min || 0),
                max: parseInt(s.max || 0),
            }));
    }

    async placeOrder(serviceId, link, quantity) {
        return await this.#callApi({
            action: 'add',
            service: serviceId,
            link: link,
            quantity: quantity,
        });
    }

    async getStatus(orderId) {
        return await this.#callApi({
            action: 'status',
            order: orderId,
        });
    }

    async getBalance() {
        return await this.#callApi({
            action: 'balance',
        });
    }
}

export const smm = new SmmService();
