import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

const splitStatements = (sql) =>
    sql
        .replace(/--[^\n]*\n/g, '\n')
        .split(/;\s*\n(?=CREATE|ALTER|DROP|INSERT|UPDATE)/)
        .flatMap((stmt) =>
            stmt.includes(';')
                ? [stmt]
                : stmt.split(/\n(?=CREATE|ALTER|DROP|INSERT|UPDATE)/)
        )
        .map((stmt) => stmt.replace(/;\s*$/, '').trim())
        .filter(Boolean);

const run = async () => {
    const connection = await pool.getConnection();
    try {
        await connection.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version VARCHAR(255) PRIMARY KEY,
                applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        const [appliedRows] = await connection.query('SELECT version FROM schema_migrations');
        const applied = new Set(appliedRows.map((row) => row.version));
        const files = (await fs.readdir(directory)).filter((file) => file.endsWith('.sql')).sort();

        for (const file of files) {
            if (applied.has(file)) continue;
            const sql = await fs.readFile(path.join(directory, file), 'utf8');
            for (const statement of splitStatements(sql)) {
                await connection.query(statement);
            }
            await connection.query('INSERT INTO schema_migrations (version) VALUES (?)', [file]);
            console.log(`[migration] applied ${file}`);
        }
    } catch (error) {
        throw error;
    } finally {
        connection.release();
        await pool.end();
    }
};

run().catch((error) => {
    console.error('[migration] failed:', error.message);
    process.exitCode = 1;
});
