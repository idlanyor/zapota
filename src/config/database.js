import mongoose from '../database/index.js';
import logger from '../utils/logger.js';

const connectDB = async (uri) => {
    try {
        await mongoose.connect();
        logger.info(' Connected to SQLite (Knex)');
    } catch (error) {
        logger.error(' Could not connect to SQLite:', error);
        process.exit(1);
    }
};

export default connectDB;
