import crypto from 'node:crypto';
import { query, withTransaction } from '../database/pool.js';

const pad = (n) => String(n).padStart(2, '0');

export const addTransaction = async ({
    userId,
    userName = null,
    type,
    amount,
    category = 'General',
    description = null,
    kakeiboCategory = null,
    source = 'other',
    date = null,
}) => {
    const id = crypto.randomUUID();
    const validSources = ['finance', 'store', 'smm', 'general', 'other'];
    if (!validSources.includes(source)) source = 'other';

    await query(
        `INSERT INTO transactions
            (id, user_id, user_name, type, amount, category, source, description, kakeibo_category, date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            id,
            userId,
            userName,
            type,
            amount,
            category,
            source,
            description,
            kakeiboCategory,
            toDbDate(date) || toDbDate(new Date()),
        ]
    );
    return { id, userId, userName, type, amount, category, source, description, kakeiboCategory, date };
};

export const getTransaction = async (id, userId) => {
    const rows = await query(
        'SELECT * FROM transactions WHERE id = ? AND user_id = ?',
        [id, userId]
    );
    return rows[0] || null;
};

// Konversi date/ISO ke format DATETIME MySQL: YYYY-MM-DD HH:MM:SS
const toDbDate = (value) => {
    if (!value) return value;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toISOString().slice(0, 19).replace('T', ' ');
};

export const updateTransaction = async (id, userId, fields) => {
    const allowed = ['user_name', 'type', 'amount', 'category', 'source', 'description', 'kakeibo_category', 'date'];
    const entries = Object.entries(fields)
        .filter(([key]) => allowed.includes(key))
        .map(([key, value]) => (key === 'date' ? [key, toDbDate(value)] : [key, value]));
    if (entries.length === 0) return null;

    const setClause = entries.map(([key]) => `${key} = ?`).join(', ');
    const values = entries.map(([, value]) => value);
    await query(`UPDATE transactions SET ${setClause} WHERE id = ? AND user_id = ?`, [...values, id, userId]);
    return getTransaction(id, userId);
};

export const deleteTransaction = async (id, userId) => {
    const result = await query(
        'DELETE FROM transactions WHERE id = ? AND user_id = ?',
        [id, userId]
    );
    return result.affectedRows > 0;
};

export const deleteLastTransaction = async (userId) =>
    withTransaction(async (tx) => {
        const rows = await tx(
            `SELECT id FROM transactions
             WHERE user_id = ?
             ORDER BY date DESC, created_at DESC, id DESC
             LIMIT 1
             FOR UPDATE`,
            [userId]
        );
        if (!rows[0]) return null;
        const result = await tx('DELETE FROM transactions WHERE id = ? AND user_id = ?', [
            rows[0].id,
            userId,
        ]);
        return result.affectedRows > 0 ? rows[0].id : null;
    });

export const getMonthlyReport = async ({ userId, month, year, type, category, startDate, endDate }) => {
    const now = new Date();
    const targetMonth = month !== undefined && month !== null ? Number(month) : now.getMonth();
    const targetYear = year !== undefined && year !== null ? Number(year) : now.getFullYear();

    let conditions = ['user_id = ?'];
    const params = [userId];
    let rangeStart = `${targetYear}-${pad(targetMonth + 1)}-01 00:00:00`;
    let rangeEnd = `${targetYear}-${pad(targetMonth + 1)}-${pad(new Date(targetYear, targetMonth + 1, 0).getDate())} 23:59:59`;

    if (startDate) {
        rangeStart = new Date(startDate).toISOString().slice(0, 19).replace('T', ' ');
    }
    if (endDate) {
        rangeEnd = `${new Date(endDate).toISOString().slice(0, 10)} 23:59:59`;
    }
    conditions.push('date >= ?');
    conditions.push('date <= ?');
    params.push(rangeStart, rangeEnd);

    if (type) {
        conditions.push('type = ?');
        params.push(type);
    }
    if (category) {
        conditions.push('category LIKE ?');
        params.push(`%${category}%`);
    }

    const where = conditions.join(' AND ');
    const rows = await query(
        `SELECT * FROM transactions WHERE ${where} ORDER BY date DESC`,
        params
    );

    let totalIncome = 0;
    let totalExpense = 0;
    for (const tx of rows) {
        const amount = Number(tx.amount);
        if (tx.type === 'income') totalIncome += amount;
        else totalExpense += amount;
    }

    return {
        transactions: rows,
        totalIncome,
        totalExpense,
        balance: totalIncome - totalExpense,
        period: { month: targetMonth + 1, year: targetYear, startDate: rangeStart, endDate: rangeEnd },
    };
};

const KAKEIBO_NEEDS = /makan|pangan|grocery|listrik|air|kos|transport|sewa|obat|sehat/i;
const KAKEIBO_CULTURE = /buku|belajar|kursus|seni|film|wisata|hiburan/i;
const KAKEIBO_EXTRAS = /darurat|kado|sumbang|service|rusak/i;

// Kategori kakeibo untuk satu transaksi expense: pakai kakeibo_category eksplisit,
// fallback ke keyword di category.
export const kakeiboBucket = (tx) => {
    if (tx.kakeibo_category && ['needs', 'wants', 'culture', 'extras'].includes(tx.kakeibo_category)) {
        return tx.kakeibo_category;
    }
    const cat = String(tx.category || '').toLowerCase();
    if (KAKEIBO_NEEDS.test(cat)) return 'needs';
    if (KAKEIBO_CULTURE.test(cat)) return 'culture';
    if (KAKEIBO_EXTRAS.test(cat)) return 'extras';
    return 'wants';
};

export const getKakeiboReport = async ({ userId, month, year }) => {
    const report = await getMonthlyReport({ userId, month, year });
    const budget = await getBudget(userId, month !== undefined ? Number(month) + 1 : new Date().getMonth() + 1, year !== undefined ? Number(year) : new Date().getFullYear());

    const kakeibo = { needs: 0, wants: 0, culture: 0, extras: 0 };
    for (const tx of report.transactions) {
        if (tx.type !== 'expense') continue;
        const amount = Number(tx.amount);
        kakeibo[kakeiboBucket(tx)] += amount;
    }

    return {
        ...report,
        budget: budget || { incomeTarget: 0, savingsTarget: 0 },
        kakeibo,
    };
};

export const getBudget = async (userId, month, year) => {
    const rows = await query(
        'SELECT * FROM budgets WHERE user_id = ? AND month = ? AND year = ?',
        [userId, month, year]
    );
    const row = rows[0];
    if (!row) return null;
    return {
        ...row,
        incomeTarget: Number(row.income_target),
        savingsTarget: Number(row.savings_target),
    };
};

export const setBudget = async ({ userId, month, year, incomeTarget = 0, savingsTarget = 0, note = null }) => {
    const existing = await getBudget(userId, month, year);
    if (existing) {
        await query(
            'UPDATE budgets SET income_target = ?, savings_target = ?, note = ? WHERE id = ?',
            [incomeTarget, savingsTarget, note, existing.id]
        );
        return getBudget(userId, month, year);
    }
    const id = crypto.randomUUID();
    await query(
        `INSERT INTO budgets (id, user_id, month, year, income_target, savings_target, note)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, userId, month, year, incomeTarget, savingsTarget, note]
    );
    return getBudget(userId, month, year);
};
