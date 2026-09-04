import axios from 'axios';

const BASE_URL = 'https://kanata-api.irengcloud.com';

/**
 * Performs a GET request.
 * @param {string} url - The endpoint or full URL.
 * @param {object} options - Request options (params, headers, responseType, etc.).
 * @returns {Promise<any>} - The response data.
 */
export const get = async (url, options = {}) => {
    const isFullUrl = url.startsWith('http');
    const requestUrl = isFullUrl ? url : `${BASE_URL}${url}`;

    const axiosOptions = {
        params: options.params || {},
        headers: options.headers || {},
        responseType: options.responseType || 'json', // 'arraybuffer', 'stream', 'document', 'text'
        timeout: options.timeout || 60000, // 1 minute timeout default
    };

    try {
        const response = await axios.get(requestUrl, axiosOptions);
        return response.data;
    } catch (error) {
        if (error.response) {
            throw new Error(
                `API request failed with status ${error.response.status}: ${error.response.statusText}`
            );
        } else if (error.request) {
            throw new Error('No response received from API');
        } else {
            throw new Error(`Error setting up request: ${error.message}`);
        }
    }
};

/**
 * Performs a POST request.
 * @param {string} url - The endpoint or full URL.
 * @param {object} data - The payload to send (JSON, FormData, etc.).
 * @param {object} options - Request options (headers, responseType, etc.).
 * @returns {Promise<any>} - The response data.
 */
export const post = async (url, data = {}, options = {}) => {
    const isFullUrl = url.startsWith('http');
    const requestUrl = isFullUrl ? url : `${BASE_URL}${url}`;

    const axiosOptions = {
        headers: options.headers || {},
        responseType: options.responseType || 'json',
        timeout: options.timeout || 60000,
    };

    try {
        const response = await axios.post(requestUrl, data, axiosOptions);
        return response.data;
    } catch (error) {
        if (error.response) {
            throw new Error(
                `API request failed with status ${error.response.status}: ${error.response.statusText}`
            );
        } else if (error.request) {
            throw new Error('No response received from API');
        } else {
            throw new Error(`Error setting up request: ${error.message}`);
        }
    }
};

/**
 * Legacy fetchAPI wrapper for backward compatibility.
 * @param {string} endpoint - The API endpoint.
 * @param {object} params - Query parameters.
 * @returns {Promise<any>} - The JSON response.
 */
export const fetchAPI = async (endpoint, params = {}) => {
    return await get(endpoint, { params });
};
