import { query } from '../database/pool.js';

export const logAudit = async ({ actorType, actorId, action, resourceType = null, resourceId = null, metadata = {}, ipAddress = null }) => {
    try {
        await query(
            `INSERT INTO audit_logs (actor_type, actor_id, action, resource_type, resource_id, metadata, ip_address)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                actorType,
                actorId,
                action,
                resourceType,
                resourceId,
                JSON.stringify(metadata),
                ipAddress,
            ]
        );
    } catch (error) {
        console.error('[audit] failed:', error.message);
    }
};
