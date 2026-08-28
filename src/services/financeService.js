import { GoogleGenAI, createUserContent, createPartFromUri } from '@google/genai';
import fs from 'fs';
import { makeResultPath } from '../utils/resultPath.js';
import { coreRequest } from './kanataCore.js';

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
});

const getRandom = (ext) => `${Math.floor(Math.random() * 10000)}${ext}`;

// Semua storage dipindah ke Kanata Core. Gemini (OCR) tetap lokal di bot.

// --- BUDGET FUNCTIONS ---
export const setBudget = async (userId, month, year, data) => {
    const res = await coreRequest('PUT', '/v1/finance/budget', {
        userId,
        month,
        year,
        incomeTarget: data?.incomeTarget,
        savingsTarget: data?.savingsTarget,
        note: data?.note,
    });
    if (!res.ok) throw new Error(res.error || 'Failed to set budget');
    return res.data;
};

export const getBudget = async (userId, month, year) => {
    const res = await coreRequest('GET', `/v1/finance/budget?userId=${encodeURIComponent(userId)}&month=${month}&year=${year}`);
    return res.ok ? res.data : null;
};

export const getKakeiboReport = async (userId, month, year) => {
    const query = new URLSearchParams({ userId });
    if (month !== undefined) query.set('month', String(month + 1));
    if (year !== undefined) query.set('year', String(year));
    const res = await coreRequest('GET', `/v1/finance/kakeibo?${query}`);
    if (!res.ok) throw new Error(res.error || 'Failed to fetch kakeibo');
    return res.data;
};

export const addTransaction = async ({
    userId,
    userName,
    type,
    amount,
    category,
    description,
    date,
    kakeiboCategory,
    source = 'finance',
}) => {
    const res = await coreRequest('POST', '/v1/finance/transactions', {
        userId,
        userName,
        type,
        amount,
        category,
        description,
        date,
        kakeiboCategory,
        source,
    });
    if (!res.ok) throw new Error(res.error || 'Failed to add transaction');
    return res.data;
};

export const deleteTransaction = async (userId, transactionId) => {
    // Ambil data tx dulu agar bisa ditampilkan setelah hapus.
    let target;
    if (transactionId) {
        const detail = await coreRequest('GET', `/v1/finance/transactions/${transactionId}?userId=${encodeURIComponent(userId)}`);
        target = detail.ok ? detail.data : null;
        if (!target) return null;
        const res = await coreRequest('DELETE', `/v1/finance/transactions/${transactionId}`, { userId });
        return res.ok ? target : null;
    }
    const report = await getMonthlyReport(userId);
    const last = report.transactions?.[0];
    if (!last) return null;
    const res = await coreRequest('DELETE', `/v1/finance/transactions/${last.id}`, { userId });
    return res.ok ? last : null;
};

export const updateTransaction = async (userId, transactionId, updateData) => {
    const res = await coreRequest('PATCH', `/v1/finance/transactions/${transactionId}`, {
        userId,
        ...updateData,
    });
    if (!res.ok) throw new Error(res.error || 'Failed to update transaction');
    return res.data;
};

export const getMonthlyReport = async (userId, month, year, filters = {}) => {
    const query = new URLSearchParams({ userId });
    if (month !== undefined) query.set('month', String(month + 1));
    if (year !== undefined) query.set('year', String(year));
    if (filters.type) query.set('type', filters.type);
    if (filters.category) query.set('category', filters.category);
    if (filters.startDate) query.set('startDate', filters.startDate);
    if (filters.endDate) query.set('endDate', filters.endDate);
    const res = await coreRequest('GET', `/v1/finance/report?${query}`);
    if (!res.ok) throw new Error(res.error || 'Failed to fetch report');
    return res.data;
};

// Gemini OCR tetap di bot; hasil transaksi dikirim ke Core.
export const processAiTransaction = async (userId, userName, prompt, fileData = null) => {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY belum diatur.');

    let tempPath = null;
    let fileUri = null;
    let fileMime = null;

    try {
        if (fileData && fileData.buffer) {
            const ext = fileData.mimeType.includes('audio') ? '.mp3' : '.jpg';
            tempPath = makeResultPath(getRandom(ext));
            fs.writeFileSync(tempPath, fileData.buffer);

            const myfile = await ai.files.upload({
                file: tempPath,
                config: { mimeType: fileData.mimeType },
            });

            fileUri = myfile.uri;
            fileMime = myfile.mimeType;

            if (!prompt) {
                prompt = fileData.mimeType.includes('audio')
                    ? 'Ekstrak transaksi dari rekaman suara ini.'
                    : 'Ekstrak data transaksi dari screenshot/struk ini. Cari nominal total, kategori, dan deskripsinya.';
            }
        }

        const systemInstruction = `Kamu adalah asisten pencatat keuangan cerdas.
Tugasmu adalah mengekstrak data transaksi dari teks, audio, atau gambar.
WAKTU SEKARANG: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'full', timeStyle: 'long' })}.

Jika user menyebutkan waktu seperti "kemarin", "tadi pagi", "2 hari lalu", atau tanggal spesifik, kamu HARUS menghitung tanggalnya dengan tepat berdasarkan WAKTU SEKARANG.

Data yang harus diekstrak untuk SETIAP transaksi:
1. type: "income" atau "expense".
2. amount: angka saja.
3. category: kategori singkat.
4. description: penjelasan singkat.
5. date: format ISO 8601 (YYYY-MM-DDTHH:mm:ssZ). Jika tidak disebutkan waktu spesifik, gunakan waktu sekarang.

Output HARUS dalam format JSON ARRAY murni:
[
  {"type": "expense", "amount": 15000, "category": "Makanan", "description": "bakso", "date": "2026-02-01T12:00:00Z"}
]

Jika tidak jelas, balas: {"error": "data tidak jelas"}`;

        const parts = [];
        if (fileUri) parts.push(createPartFromUri(fileUri, fileMime));
        parts.push(prompt || 'Catat transaksi');

        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            config: { systemInstruction },
            contents: createUserContent(parts),
        });

        let jsonText = result.text.trim();
        if (jsonText.includes('```')) {
            jsonText = jsonText.replace(/```json|```/g, '').trim();
        }

        const data = JSON.parse(jsonText);

        if (data.error || (Array.isArray(data) && data.length === 0)) {
            return { error: 'Maaf, saya tidak bisa menangkap detail transaksinya.' };
        }

        const transactionsData = Array.isArray(data) ? data : [data];
        const savedTransactions = [];

        for (const txData of transactionsData) {
            const newTx = await addTransaction({
                userId,
                userName,
                type: txData.type,
                amount: txData.amount,
                category: txData.category,
                description: txData.description,
                date: txData.date,
                source: 'finance',
            });
            savedTransactions.push(newTx);
        }

        return { success: true, transactions: savedTransactions };
    } finally {
        if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
};
