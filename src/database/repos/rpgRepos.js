import { createCodec } from '../codec.js';
import { createRepo } from './createRepo.js';

export const rpgPlayerRepo = createRepo({
    table: 'rpg_players',
    codec: createCodec({
        date: [
            'lastMbgClaim',
            'lastWork',
            'lastHealing',
            'lastEnergyReset',
            'createdAt',
            'updatedAt',
        ],
    }),
    timestamps: true,
    createDefaults: () => ({ lastEnergyReset: Date.now() }),
});

export const rpgInventoryRepo = createRepo({
    table: 'rpg_inventories',
    codec: createCodec({ bool: ['isEquipped'], date: ['createdAt', 'updatedAt'] }),
    timestamps: true,
});

export const rpgBillRepo = createRepo({
    table: 'rpg_bills',
    codec: createCodec({ bool: ['isPaid'], date: ['dueDate', 'createdAt', 'updatedAt'] }),
    timestamps: true,
});

export const rpgProgressRepo = createRepo({
    table: 'rpg_progress',
    codec: createCodec({
        json: ['claimedMissions', 'unlockedAchievements'],
        date: ['createdAt', 'updatedAt'],
    }),
    timestamps: true,
});
