import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import bcrypt from 'bcrypt';
import sqlite3 from 'sqlite3';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

const db = new sqlite3.Database(':memory:');
db.serialize(() => {
    db.run('CREATE TABLE checks (value TEXT NOT NULL)');
    db.run('INSERT INTO checks VALUES (?)', ['ok']);
});
const checkVal = await new Promise((resolve, reject) =>
    db.get('SELECT value FROM checks', (err, row) => (err ? reject(err) : resolve(row?.value)))
);
assert.equal(checkVal, 'ok');
await new Promise((resolve) => db.close(resolve));

const hash = await bcrypt.hash('bun-runtime-check', 4);
assert(await bcrypt.compare('bun-runtime-check', hash));

const image = await sharp({
    create: { width: 2, height: 2, channels: 3, background: '#000000' },
})
    .png()
    .toBuffer();
assert(image.length > 0);

const { stdout } = await execFileAsync('ffmpeg', ['-version']);
assert.match(stdout, /^ffmpeg version/m);

await import('canvas');
await import('puppeteer');
await import('zapo-js');
await import('@zapo-js/store-sqlite');
await import('@zapo-js/media-utils');

console.log(`Runtime qualification passed on ${process.versions.bun ? `Bun ${process.versions.bun}` : process.version}`);
