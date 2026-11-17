/**
 * Row <-> object conversion for SQLite (compatible with rows written by the
 * previous adapter):
 *   - Date fields  → epoch milliseconds (INTEGER); SQLite CURRENT_TIMESTAMP
 *                    strings ('YYYY-MM-DD HH:MM:SS', UTC) are also read
 *   - JSON fields  → JSON text (arrays/objects)
 *   - Bool fields  → 0/1
 */

/** @param {unknown} value @returns {Date | null} */
export const toDate = (value) => {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === 'number') return new Date(value);
    const s = String(value);
    if (/^\d+$/.test(s)) return new Date(Number(s));
    // SQLite CURRENT_TIMESTAMP is UTC without a zone marker.
    const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? `${s.replace(' ', 'T')}Z` : s;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
};

const parseJson = (value, fallback) => {
    if (value === null || value === undefined) return fallback;
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

/**
 * @param {{ json?: string[], date?: string[], bool?: string[] }} fields
 */
export const createCodec = ({ json = [], date = [], bool = [] } = {}) => ({
    /** Columns this codec converts (used by the schema-drift test). */
    fields: [...json, ...date, ...bool],
    /** DB row → plain object */
    fromRow(row) {
        if (!row) return null;
        const out = { ...row };
        for (const f of json) if (f in out) out[f] = parseJson(out[f], []);
        for (const f of date) if (f in out) out[f] = toDate(out[f]);
        for (const f of bool) if (f in out) out[f] = Boolean(out[f]);
        return out;
    },
    /** plain object (partial) → DB values; undefined keys are dropped */
    toRow(obj) {
        const out = {};
        for (const [k, v] of Object.entries(obj)) {
            if (v === undefined) continue;
            if (json.includes(k)) out[k] = typeof v === 'string' ? v : JSON.stringify(v ?? []);
            else if (date.includes(k)) out[k] = v === null ? null : (toDate(v)?.getTime() ?? null);
            else if (bool.includes(k)) out[k] = v ? 1 : 0;
            else out[k] = v;
        }
        return out;
    },
});
