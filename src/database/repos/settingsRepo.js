import { createCodec } from '../codec.js';
import { createRepo } from './createRepo.js';

const SETTINGS_ID = 'bot_settings';

const base = createRepo({
    table: 'settings',
    codec: createCodec({
        json: ['disabledCommands', 'cfZones', 'owners'],
        bool: ['autoStatusRead', 'autoAiPrivate', 'mustJoinGroup', 'smartMode'],
        date: ['createdAt', 'updatedAt'],
    }),
    key: 'settingsId',
});

/** The bot keeps a single settings row (`settingsId = 'bot_settings'`). */
export const settingsRepo = {
    table: base.table,
    codec: base.codec,

    /** Get the bot settings, creating the row with defaults on first use. */
    async get() {
        return base.findOrCreate({ settingsId: SETTINGS_ID });
    },
    /** Apply a partial update and return the new settings. */
    async update(patch) {
        return base.upsert({ settingsId: SETTINGS_ID }, patch);
    },
    /** Persist a settings record previously returned by get(). */
    async save(record) {
        return base.save({ ...record, settingsId: SETTINGS_ID });
    },
    /** All rows (backups). */
    async all() {
        return base.find();
    },
};
