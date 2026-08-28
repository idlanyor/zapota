import fs from 'fs/promises';
import path from 'path';
import { BufferJSON } from 'baileys';
import logger from '../utils/logger.js';

const fixFileName = (file) => file?.replace(/\//g, '__')?.replace(/:/g, '-');

const isNonEmptyBufferLike = (value) => {
    if (!value) return false;
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
        return value.byteLength > 0;
    }
    if (value.type === 'Buffer') {
        if (Array.isArray(value.data)) return value.data.length > 0;
        if (typeof value.data === 'string') return value.data.length > 0;
    }
    return false;
};

const decodeSenderKeyPayload = (value) => {
    if (!value) return null;

    let raw = value;
    if (value?.type === 'Buffer' && typeof value.data === 'string') {
        raw = Buffer.from(value.data, 'base64');
    }

    if (Buffer.isBuffer(raw) || raw instanceof Uint8Array) {
        const text = Buffer.from(raw).toString('utf8');
        return JSON.parse(text, BufferJSON.reviver);
    }

    return raw;
};

const encodeSenderKeyPayload = (records) => {
    const json = JSON.stringify(records, BufferJSON.replacer);
    return Buffer.from(json, 'utf8');
};

const sanitizeSenderKeyRecords = (records) => {
    if (!Array.isArray(records)) {
        return { valid: false, cleaned: [] };
    }

    const cleaned = records.filter((record) => {
        const privateKey = record?.senderSigningKey?.private;
        const publicKey = record?.senderSigningKey?.public;
        return isNonEmptyBufferLike(privateKey) && isNonEmptyBufferLike(publicKey);
    });

    return { valid: cleaned.length > 0, cleaned };
};

export const sanitizeAuthFolder = async (folder) => {
    let files = [];
    try {
        files = await fs.readdir(folder);
    } catch {
        return;
    }

    let removed = 0;

    for (const file of files) {
        if (!file.startsWith('sender-key-') || !file.endsWith('.json')) {
            continue;
        }

        const fullPath = path.join(folder, file);

        try {
            const rawText = await fs.readFile(fullPath, 'utf8');
            const parsed = JSON.parse(rawText, BufferJSON.reviver);
            const records = decodeSenderKeyPayload(parsed);
            const { valid, cleaned } = sanitizeSenderKeyRecords(records);

            if (!valid) {
                await fs.unlink(fullPath).catch(() => {});
                removed += 1;
                continue;
            }

            if (cleaned.length !== records.length) {
                const payload = encodeSenderKeyPayload(cleaned);
                await fs.writeFile(fullPath, JSON.stringify(payload, BufferJSON.replacer));
                removed += 1;
            }
        } catch (error) {
            logger.warn(`Failed to inspect sender-key file ${file}: ${error.message}`);
        }
    }

    if (removed > 0) {
        logger.warn(`Sanitized ${removed} sender-key auth file(s)`);
    }
};

export const wrapSignalKeyStoreWithSanitizer = (keys, folder) => {
    const buildFilePath = (type, id) => path.join(folder, fixFileName(`${type}-${id}.json`));

    return {
        async get(type, ids) {
            const data = await keys.get(type, ids);

            if (type !== 'sender-key') {
                return data;
            }

            for (const id of ids) {
                const value = data[id];
                if (!value) continue;

                try {
                    const records = decodeSenderKeyPayload(value);
                    const { valid, cleaned } = sanitizeSenderKeyRecords(records);

                    if (!valid) {
                        delete data[id];
                        await fs.unlink(buildFilePath(type, id)).catch(() => {});
                        logger.warn(`Removed corrupt sender-key entry: ${id}`);
                        continue;
                    }

                    if (cleaned.length !== records.length) {
                        const payload = encodeSenderKeyPayload(cleaned);
                        data[id] = payload;
                        await fs.writeFile(
                            buildFilePath(type, id),
                            JSON.stringify(payload, BufferJSON.replacer)
                        );
                        logger.warn(`Pruned corrupt sender-key subrecord(s): ${id}`);
                    }
                } catch (error) {
                    delete data[id];
                    await fs.unlink(buildFilePath(type, id)).catch(() => {});
                    logger.warn(`Dropped unreadable sender-key entry ${id}: ${error.message}`);
                }
            }

            return data;
        },
        async set(data) {
            if (data['sender-key']) {
                for (const id of Object.keys(data['sender-key'])) {
                    const value = data['sender-key'][id];
                    if (!value) continue;

                    try {
                        const records = decodeSenderKeyPayload(value);
                        const { valid, cleaned } = sanitizeSenderKeyRecords(records);

                        if (!valid) {
                            data['sender-key'][id] = null;
                            logger.warn(`Blocked corrupt sender-key write: ${id}`);
                            continue;
                        }

                        if (cleaned.length !== records.length) {
                            data['sender-key'][id] = encodeSenderKeyPayload(cleaned);
                            logger.warn(`Cleaned sender-key before write: ${id}`);
                        }
                    } catch (error) {
                        data['sender-key'][id] = null;
                        logger.warn(`Blocked unreadable sender-key write ${id}: ${error.message}`);
                    }
                }
            }

            return keys.set(data);
        },
    };
};
