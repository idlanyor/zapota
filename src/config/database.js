import { getKnex } from '../database/knexInstance.js';
import { migrateIfSafe } from '../database/migrate.js';
import logger from '../utils/logger.js';

/** Open the SQLite database and apply pending migrations (when safe). */
const connectDB = async () => {
    try {
        const knex = getKnex();
        await knex.raw('select 1');
        await migrateIfSafe(knex, logger);
        logger.info(' Connected to SQLite (Knex)');
    } catch (error) {
        logger.error(' Could not connect to SQLite:', error);
        process.exit(1);
    }
};

export default connectDB;
