import { post } from './api.js';

/**
 * Generate an invoice PDF using invoice-generator.com
 * @param {object} invoiceData - The invoice data (from, to, items, etc.)
 * @param {string} apiKey - Optional API Key for authentication
 * @returns {Promise<Buffer>} - The PDF file buffer
 */
export const generateInvoice = async (invoiceData, apiKey = null) => {
    const payload = { ...invoiceData };

    const headers = {
        'Content-Type': 'application/json',
    };

    if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }

    try {
        const pdfBuffer = await post('https://invoice-generator.com', payload, {
            responseType: 'arraybuffer',
            headers: headers,
        });

        return pdfBuffer;
    } catch (error) {
        throw new Error(`Failed to generate invoice: ${error.message}`);
    }
};
