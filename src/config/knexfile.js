import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.SQLITE_PATH || path.resolve(__dirname, '../../data/bot.db');

const config = {
    client: 'better-sqlite3',
    connection: {
        filename: dbPath,
    },
    useNullAsDefault: true,
    pool: null,
    migrations: {
        directory: path.resolve(__dirname, '../database/migrations'),
        tableName: 'knex_migrations',
    },
};

export default config;
