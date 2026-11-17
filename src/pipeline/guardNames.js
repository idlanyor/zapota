/**
 * Declarative guard names a command may list in `guards: [...]`.
 * Kept dependency-free so the command loader and manifest builder can
 * validate without importing the runtime guard implementations.
 *
 *   owner    – only bot owners
 *   group    – only inside a group
 *   private  – only in a private chat
 *   admin    – sender must be a group admin (implies group)
 *   botAdmin – bot must be a group admin (implies group)
 */
export const GUARD_NAMES = Object.freeze(['owner', 'group', 'private', 'admin', 'botAdmin']);

/** Throws on unknown guard names so typos fail loudly at load time. */
export const validateGuards = (names = [], where = 'command') => {
    if (!Array.isArray(names)) throw new TypeError(`${where}: guards must be an array`);
    const unknown = names.filter((n) => !GUARD_NAMES.includes(n));
    if (unknown.length) throw new Error(`${where}: unknown guard(s) ${unknown.join(', ')}`);
    return names;
};
