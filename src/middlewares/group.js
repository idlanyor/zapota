import NodeCache from 'node-cache';
import { CACHE_TTL, CACHE_CHECK_PERIOD } from '../constants/config.js';

const metadataCache = new NodeCache({
    stdTTL: CACHE_TTL.METADATA,
    checkperiod: CACHE_CHECK_PERIOD.METADATA,
});
const metadataPromiseCache = new Map();

export const getCachedGroupMetadata = (jid) => {
    const data = metadataCache.get(jid);
    if (!data) return null;
    return { data, isFresh: true };
};

export const refreshGroupMetadata = async (sock, jid) => {
    const existingPromise = metadataPromiseCache.get(jid);
    if (existingPromise) {
        return existingPromise;
    }

    const promise = (async () => {
        try {
            const data = await sock.groupMetadata(jid);
            metadataCache.set(jid, data);
            return data;
        } finally {
            metadataPromiseCache.delete(jid);
        }
    })();

    metadataPromiseCache.set(jid, promise);
    return promise;
};
