import mysql from 'mysql2/promise';
import { config } from '../config.js';

export const pool = mysql.createPool({
    uri: config.databaseUrl,
    waitForConnections: true,
    connectionLimit: 10,
    idleTimeout: 30_000,
    connectTimeout: 5_000,
    charset: 'utf8mb4',
    timezone: 'Z',
    dateStrings: false,
});

export const query = async (sql, params) => {
    const [rows] = await pool.execute(sql, params);
    return rows;
};

export const withTransaction = async (fn) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const result = await fn(async (sql, params) => {
            const [rows] = await conn.execute(sql, params);
            return rows;
        });
        await conn.commit();
        return result;
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
};
