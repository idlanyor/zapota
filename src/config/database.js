import mongoose from '../database/index.js';
import { getKnex } from '../database/knexInstance.js';
import { migrateIfSafe } from '../database/migrate.js';
import logger from '../utils/logger.js';

const connectDB = async () => {
    try {
        await mongoose.connect();
        await migrateIfSafe(getKnex(), logger);
        logger.info(' Connected to SQLite (Knex)');
    } catch (error) {
        logger.error(' Could not connect to SQLite:', error);
        process.exit(1);
    }
};

export default connectDB;
