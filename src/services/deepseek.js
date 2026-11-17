import axios from 'axios';
import { env } from '../config/env.js';

/**
 * DeepSeek chat via the local deepsegs proxy (OpenAI-compatible).
 * Returns the axios response; read `response.data.choices[0].message`.
 *
 * @param {{ model?: string, messages: object[], tools?: object[], temperature?: number }} body
 * @param {{ timeout?: number }} [opts]
 */
export const chatCompletion = (body, { timeout = 60_000 } = {}) => {
    const base = (env.DS_BASE_URL || 'http://localhost:5050').replace(/\/+$/, '');
    return axios.post(`${base}/v1/chat/completions`, body, {
        headers: {
            Authorization: `Bearer ${env.DS_API_KEY || 'dseeker'}`,
            'Content-Type': 'application/json',
        },
        timeout,
    });
};
