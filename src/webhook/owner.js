import { settings } from '../config/settings.js';
import { getCachedSettings } from '../handlers/messageFlow.js';
import { decodeJid } from '../utils/serialize.js';
import { coreRequest } from '../services/kanataCore.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normalizeOwners = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string' || !value.trim()) return [];
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
    } catch {
        // legacy comma-separated value
    }
    return value
        .split(',')
        .map((owner) => owner.trim())
        .filter(Boolean);
};

/**
 * Whether `id` (a WhatsApp JID, or a Kanata Core user UUID sent by the web
 * client) belongs to a bot owner.
 */
export const isOwner = async (id) => {
    if (!id) return false;

    if (UUID.test(String(id))) {
        try {
            const me = await coreRequest('GET', `/v1/users/${id}`);
            if (me.ok && me.data) return me.data.role === 'owner';
        } catch {
            // fall back to JID comparison
        }
    }

    const botSettings = await getCachedSettings();
    const owners = [
        decodeJid(settings.ownerNumber),
        settings.ownerLid ? decodeJid(settings.ownerLid) : null,
        ...normalizeOwners(botSettings.owners).map((o) => decodeJid(o)),
    ].filter(Boolean);
    return owners.includes(decodeJid(id));
};
