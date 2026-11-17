/**
 * Bot-wide and per-group settings for commands. Every write clears the
 * settings caches used by the message pipeline, so changes apply to the
 * very next message (no 5-minute stale window).
 */
import { settingsRepo } from '../database/repos/settingsRepo.js';
import { groupRepo } from '../database/repos/groupRepo.js';
import NodeCache from 'node-cache';

/* --------------------------------- caches --------------------------------- */

const SETTINGS_TTL_MS = 5 * 60 * 1000;
let settingsCache = null;
let settingsCachedAt = 0;
const groupCache = new NodeCache({ stdTTL: 300, checkperiod: 300 });
const clearListeners = new Set();

/** Run `fn` whenever settings caches are cleared (for dependent caches). */
export const onSettingsCleared = (fn) => {
    clearListeners.add(fn);
};

export const clearSettingsCache = () => {
    settingsCache = null;
    groupCache.flushAll();
    for (const fn of clearListeners) fn();
};

/** Bot settings for the hot path (cached for 5 minutes or until a write). */
export const getCachedSettings = async () => {
    if (!settingsCache || Date.now() - settingsCachedAt > SETTINGS_TTL_MS) {
        settingsCache = await settingsRepo.get();
        settingsCachedAt = Date.now();
    }
    return settingsCache;
};

/** Group settings for the hot path; records the subject on first sight. */
export const getGroupSettings = async (jid, subject = '') => {
    const cached = groupCache.get(jid);
    if (cached) return cached;

    let data = await groupRepo.findOne({ jid });
    if (!data) {
        data = await groupRepo.create({ jid, name: subject || '' });
    } else if (subject && !data.name) {
        data = await groupRepo.updateOne({ jid }, { name: subject });
    }
    groupCache.set(jid, data);
    return data;
};

/* ------------------------------ bot settings ------------------------------ */

/** Fresh (uncached) bot settings, for reading before an edit. */
export const getBotSettings = () => settingsRepo.get();

/** Persist a settings record from getBotSettings(). */
export const saveBotSettings = async (record) => {
    await settingsRepo.save(record);
    clearSettingsCache();
    return record;
};

export const updateBotSettings = async (patch) => {
    const updated = await settingsRepo.update(patch);
    clearSettingsCache();
    return updated;
};

/* ----------------------------- group settings ----------------------------- */

/** Group settings, created with defaults on first use. */
export const getGroup = (jid) => groupRepo.findOrCreate({ jid });

export const findGroup = (jid) => groupRepo.findOne({ jid });

export const saveGroup = async (record) => {
    await groupRepo.save(record);
    clearSettingsCache();
    return record;
};

/** Patch a group's settings (creating the row if needed). */
export const updateGroup = async (jid, patch) => {
    const updated = await groupRepo.upsert({ jid }, patch);
    clearSettingsCache();
    return updated;
};

export const resetGroupWelcomeBg = async (jid) => {
    const updated = await groupRepo.resetWelcomeBg(jid);
    clearSettingsCache();
    return updated;
};
