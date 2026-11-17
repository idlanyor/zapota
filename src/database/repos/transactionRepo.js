import { createCodec } from '../codec.js';
import { createRepo } from './createRepo.js';

export const transactionRepo = createRepo({
    table: 'transactions',
    codec: createCodec({ date: ['date', 'createdAt', 'updatedAt'] }),
    timestamps: true,
    createDefaults: () => ({ date: Date.now() }),
});
