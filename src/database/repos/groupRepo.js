import { createCodec } from '../codec.js';
import { createRepo } from './createRepo.js';

const DEFAULT_WELCOME_BG = 'https://i.ibb.co/4YBNyvP/images-76.jpg';

const base = createRepo({
    table: 'groups',
    codec: createCodec({
        date: ['createdAt'],
        bool: [
            'announce',
            'restrict',
            'antilink',
            'antitoxic',
            'welcome',
            'left',
            'antidelete',
            'nsfw',
            'mute',
            'prayerReminder',
            'autoOpen',
            'autoClose',
        ],
    }),
    createDefaults: () => ({ createdAt: Date.now() }),
});

export const groupRepo = {
    ...base,

    /** Groups with auto open or auto close enabled. */
    async findWithAutoSchedule() {
        const rows = await base.query().where({ autoOpen: 1 }).orWhere({ autoClose: 1 });
        return rows.map((r) => base.codec.fromRow(r));
    },

    /** Reset the welcome background to the default image. */
    async resetWelcomeBg(jid) {
        return base.upsert({ jid }, { welcomeBg: DEFAULT_WELCOME_BG });
    },
};
