import { glob } from 'glob';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';

const commandsDir = path.resolve('src/commands');
const files = await glob(`${commandsDir}/**/*.js`);
const manifest = [];

const categoryFromPath = (filePath) => {
    const rel = path.relative(commandsDir, filePath);
    if (path.dirname(rel) === '.') return 'General';
    return path
        .dirname(rel)
        .split(path.sep)
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(' ');
};

for (const file of files) {
    if (file.endsWith('manifest.json')) continue;
    try {
        const { default: def } = await import(`${pathToFileURL(file).href}?manifest=${Date.now()}`);
        const arr = Array.isArray(def) ? def : [def];
        arr.forEach((cmd, index) => {
            if (!cmd?.name || typeof cmd.execute !== 'function') return;
            manifest.push({
                file: path.relative(process.cwd(), file),
                index,
                name: cmd.name,
                aliases: Array.isArray(cmd.aliases) ? cmd.aliases : [],
                description: cmd.description || '',
                category: cmd.category || categoryFromPath(file),
                buttonPrefix: cmd.buttonPrefix || '',
                hasHandleButton: typeof cmd.handleButton === 'function',
                hasHandleSession: typeof cmd.handleSession === 'function',
            });
        });
    } catch (e) {
        console.error(`Failed to inspect ${file}:`, e.message);
    }
}

manifest.sort((a, b) => a.file.localeCompare(b.file) || a.index - b.index);
await writeFile('src/commands/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Manifest updated: ${manifest.length} commands.`);
process.exit(0);
