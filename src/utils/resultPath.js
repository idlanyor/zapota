import fs from 'fs';
import path from 'path';

const RESULT_DIR = path.resolve('results');

export const ensureResultDir = () => {
    if (!fs.existsSync(RESULT_DIR)) {
        fs.mkdirSync(RESULT_DIR, { recursive: true });
    }
    return RESULT_DIR;
};

export const makeResultPath = (fileName) => {
    ensureResultDir();
    return path.join(RESULT_DIR, fileName);
};
