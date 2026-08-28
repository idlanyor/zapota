import { jest } from '@jest/globals';
import {
    ACHIEVEMENTS,
    DAILY_MISSIONS,
    getMissionState,
    getRpgDateKey,
    syncAchievements,
} from '../src/services/rpgProgressService.js';
import {
    addExp,
    calculateMinigameReward,
    MINIGAME_REWARD_TIERS,
} from '../src/services/rpgService.js';

describe('RPG daily missions and achievements', () => {
    test('uses the Jakarta calendar date for daily resets', () => {
        expect(getRpgDateKey(new Date('2026-08-24T17:30:00.000Z'))).toBe('2026-08-25');
    });

    test('reports mission progress, completion, and claim state', () => {
        const progress = { dailyWork: 3, claimedMissions: ['kerja'] };

        expect(getMissionState(progress, DAILY_MISSIONS.kerja)).toEqual({
            current: 2,
            complete: true,
            claimed: true,
        });
    });

    test('unlocks every achievement whose requirement has been met only once', async () => {
        const progress = {
            totalWork: 25,
            totalShop: 10,
            totalWins: 25,
            unlockedAchievements: [],
            save: jest.fn().mockResolvedValue(undefined),
        };
        const player = { level: 5, reputasiWarga: 90, bintangKorupsi: 3 };
        const user = { balance: 1000000 };

        const firstUnlocks = await syncAchievements(progress, player, user);
        const secondUnlocks = await syncAchievements(progress, player, user);

        expect(firstUnlocks).toHaveLength(Object.keys(ACHIEVEMENTS).length);
        expect(secondUnlocks).toEqual([]);
        expect(progress.unlockedAchievements).toHaveLength(Object.keys(ACHIEVEMENTS).length);
        expect(progress.save).toHaveBeenCalledTimes(1);
    });

    test('recalculates the EXP requirement after every level gained', async () => {
        const player = {
            level: 1,
            exp: 90,
            hp: 100,
            maxHp: 100,
            energi: 100,
            maxEnergi: 100,
            kewarasan: 50,
            save: jest.fn().mockResolvedValue(undefined),
        };

        const result = await addExp(player, 220);

        expect(result).toEqual({ leveledUp: true, newLevel: 3 });
        expect(player.exp).toBe(10);
        expect(player.maxHp).toBe(120);
        expect(player.maxEnergi).toBe(120);
        expect(player.save).toHaveBeenCalledTimes(1);
    });

    test.each([
        [0, 'full', 2500, 5000, 8, 12],
        [3, 'reduced', 1000, 2500, 6, 10],
        [6, 'xp_only', 0, 0, 3, 3],
        [14, 'xp_only', 0, 0, 3, 3],
        [15, 'practice', 0, 0, 0, 0],
        [99, 'practice', 0, 0, 0, 0],
    ])(
        'balances the minigame reward after %i wins',
        (wins, tier, minRupiah, maxRupiah, minExp, maxExp) => {
            const reward = calculateMinigameReward(wins, null, null, () => 0.5);

            expect(reward.rewardTier).toBe(tier);
            expect(reward.earnedRupiah).toBeGreaterThanOrEqual(minRupiah);
            expect(reward.earnedRupiah).toBeLessThanOrEqual(maxRupiah);
            expect(reward.earnedExp).toBeGreaterThanOrEqual(minExp);
            expect(reward.earnedExp).toBeLessThanOrEqual(maxExp);
            expect(reward.cashLimitReached).toBe(['xp_only', 'practice'].includes(tier));
            expect(reward.rewardLimitReached).toBe(tier === 'practice');
        }
    );

    test('caps custom game rewards to the active daily tier', () => {
        const reward = calculateMinigameReward(3, 999999, 999, () => 0);

        expect(reward.earnedRupiah).toBe(2500);
        expect(reward.earnedExp).toBe(10);
        expect(MINIGAME_REWARD_TIERS).toHaveLength(4);
    });
});
