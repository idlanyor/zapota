import axios from 'axios';
import FormData from 'form-data';

export const resolveUploadedUrl = (payload = {}) => {
    if (!payload || typeof payload !== 'object') return null;
    return (
        payload.url ||
        payload.data?.url ||
        payload.result?.url ||
        payload.file?.url ||
        payload.data?.image ||
        null
    );
};

export const uploadBufferToKanata = async (
    buffer,
    { filename, mimeType, timeout = 60000 } = {}
) => {
    if (!buffer || !buffer.length) {
        throw new Error('Media buffer kosong.');
    }

    const formData = new FormData();
    formData.append('file', buffer, {
        filename: filename || `file_${Date.now()}`,
        contentType: mimeType || 'application/octet-stream',
    });

    const response = await axios.post('https://kanata-api.irengcloud.com/upload', formData, {
        headers: {
            ...formData.getHeaders(),
            accept: 'application/json',
        },
        timeout,
    });

    const url = resolveUploadedUrl(response.data);
    if (!url) {
        throw new Error('Upload URL tidak ditemukan dari response uploader.');
    }

    return {
        url,
        response: response.data,
    };
};
