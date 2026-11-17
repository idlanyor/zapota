import { createCodec } from '../codec.js';
import { createRepo } from './createRepo.js';

export const userRepo = createRepo({
    table: 'users',
    codec: createCodec({ date: ['createdAt'] }),
    createDefaults: () => ({ createdAt: Date.now() }),
});
