import axios from 'axios';
import { jest } from '@jest/globals';
import { chatCompletion } from '../src/services/deepseek.js';

afterEach(() => jest.restoreAllMocks());

test('deepseek: posts to <DS_BASE_URL>/v1/chat/completions with the bearer key', async () => {
    process.env.DS_BASE_URL = 'http://127.0.0.1:5050/';
    process.env.DS_API_KEY = 'dseeker';
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: {} });
    await chatCompletion({ model: 'm', messages: [] }, { timeout: 1234 });
    expect(post).toHaveBeenCalledWith(
        'http://127.0.0.1:5050/v1/chat/completions',
        { model: 'm', messages: [] },
        {
            headers: { Authorization: 'Bearer dseeker', 'Content-Type': 'application/json' },
            timeout: 1234,
        }
    );
});
