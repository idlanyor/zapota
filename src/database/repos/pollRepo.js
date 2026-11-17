import { getKnex } from '../knexInstance.js';
import { createCodec } from '../codec.js';

const TABLE = 'polls';
const codec = createCodec({ json: ['options'], date: ['createdAt'] });

/**
 * Polls created by the bot, kept so votes can be decrypted later.
 * @typedef {{ pollId: string, chat: string, question: string, options: string[],
 *             messageSecret: Buffer, createdAt: Date }} PollRecord
 */
export const pollRepo = {
    table: TABLE,
    codec,

    async create({ pollId, chat, question, options = [], messageSecret }) {
        const row = codec.toRow({ pollId, chat, question, options, createdAt: Date.now() });
        await getKnex()(TABLE).insert({ ...row, messageSecret: Buffer.from(messageSecret) });
    },

    /** @returns {Promise<PollRecord | null>} */
    async findByPollId(pollId) {
        return codec.fromRow(await getKnex()(TABLE).where({ pollId }).first());
    },

    async remove(pollId) {
        return (await getKnex()(TABLE).where({ pollId }).delete()) > 0;
    },

    /** Delete polls older than `cutoff`; returns how many were removed. */
    async removeOlderThan(cutoff) {
        return getKnex()(TABLE)
            .where('createdAt', '<', codec.toRow({ createdAt: cutoff }).createdAt)
            .delete();
    },
};
