import * as financeService from '../../services/financeService.js';
import { reply, decodeBase64Data } from '../http.js';

const requireUser = (userId) =>
    userId ? null : reply(400, { ok: false, error: 'userId is required' });
/** Web client sends 1-based months; the finance service uses 0-based. */
const monthIndex = (month) => (month ? parseInt(month) - 1 : undefined);
const yearNumber = (year) => (year ? parseInt(year) : undefined);

/** Personal finance, stored in Kanata Core. */
export default [
    {
        method: 'GET',
        path: '/api/webhook/finance/report',
        handler: async ({ query }) => {
            const { userId, month, year, type, category, startDate, endDate } = query;
            const bad = requireUser(userId);
            if (bad) return bad;
            const data = await financeService.getMonthlyReport(
                userId,
                monthIndex(month),
                yearNumber(year),
                {
                    type,
                    category,
                    startDate,
                    endDate,
                }
            );
            return reply(200, { ok: true, data });
        },
    },
    {
        method: 'POST',
        path: '/api/webhook/finance/catat',
        handler: async ({ body }) => {
            const input = await body();
            const { userId, userName, text, fileBase64, mimeType } = input;
            const bad = requireUser(userId);
            if (bad) return bad;

            if (text || fileBase64) {
                const fileData = fileBase64
                    ? { buffer: decodeBase64Data(fileBase64), mimeType: mimeType || 'image/jpeg' }
                    : null;
                const data = await financeService.processAiTransaction(
                    userId,
                    userName || 'Web User',
                    text,
                    fileData
                );
                return reply(200, { ok: true, data });
            }

            const { type, amount, category, description, date, kakeiboCategory } = input;
            if (!type || !amount)
                return reply(400, { ok: false, error: 'type and amount are required' });
            const tx = await financeService.addTransaction({
                userId,
                userName: userName || 'Web User',
                type,
                amount,
                category,
                description,
                date,
                kakeiboCategory,
            });
            return reply(200, { ok: true, data: { success: true, transactions: [tx] } });
        },
    },
    {
        method: 'DELETE',
        path: '/api/webhook/finance/delete',
        handler: async ({ body }) => {
            const { userId, transactionId } = await body();
            const bad = requireUser(userId);
            if (bad) return bad;
            const deleted = await financeService.deleteTransaction(userId, transactionId);
            return reply(200, { ok: true, deleted: !!deleted, data: deleted });
        },
    },
    {
        method: 'POST',
        path: '/api/webhook/finance/update',
        handler: async ({ body }) => {
            const {
                userId,
                transactionId,
                type,
                amount,
                category,
                description,
                date,
                kakeiboCategory,
            } = await body();
            if (!userId || !transactionId) {
                return reply(400, { ok: false, error: 'userId and transactionId are required' });
            }
            const patch = {};
            if (type) patch.type = type;
            if (amount) patch.amount = amount;
            if (category) patch.category = category;
            if (description) patch.description = description;
            if (kakeiboCategory !== undefined) patch.kakeiboCategory = kakeiboCategory;
            if (date) patch.date = new Date(date);
            const updated = await financeService.updateTransaction(userId, transactionId, patch);
            return reply(200, { ok: !!updated, data: updated });
        },
    },
    {
        method: 'GET',
        path: '/api/webhook/finance/detail',
        handler: async ({ query }) => {
            const { userId, transactionId } = query;
            if (!userId || !transactionId) {
                return reply(400, { ok: false, error: 'userId and transactionId are required' });
            }
            const data = await financeService.getTransaction(userId, transactionId);
            return reply(200, { ok: !!data, data });
        },
    },
    {
        method: 'GET',
        path: '/api/webhook/finance/kakeibo',
        handler: async ({ query }) => {
            const bad = requireUser(query.userId);
            if (bad) return bad;
            const data = await financeService.getKakeiboReport(
                query.userId,
                monthIndex(query.month),
                yearNumber(query.year)
            );
            return reply(200, { ok: true, data });
        },
    },
    {
        method: 'POST',
        path: '/api/webhook/finance/budget',
        handler: async ({ body }) => {
            const { userId, month, year, incomeTarget, savingsTarget } = await body();
            if (!userId || !month || !year) {
                return reply(400, { ok: false, error: 'userId, month, and year are required' });
            }
            const data = await financeService.setBudget(userId, month, year, {
                incomeTarget,
                savingsTarget,
            });
            return reply(200, { ok: true, data });
        },
    },
];
