import path from 'path';
import { pathToFileURL } from 'url';
import { readFile } from 'node:fs/promises';
import chokidar from 'chokidar';
import logger from '../utils/logger.js';

const commands = new Map();
const buttonHandlers = new Map();

const commandsDir = path.resolve('src/commands');
const manifestPath = path.join(commandsDir, 'manifest.json');

/** file -> lazy loaded real exports array */
const exportsCache = new Map();
let manifest = [];

const categoryFromPath = (filePath) => {
    const rel = path.relative(commandsDir, filePath);
    if (path.dirname(rel) === '.') return 'General';
    return path
        .dirname(rel)
        .split(path.sep)
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(' ');
};

/** Import (once, cached) the real exports of a command file. */
const loadModule = async (filePath) => {
    const cached = exportsCache.get(filePath);
    if (cached) return cached;
    const timestamp = Date.now();
    const fileUrl = `${pathToFileURL(filePath).href}?v=${timestamp}`;
    const mod = await import(fileUrl);
    const arr = Array.isArray(mod.default) ? mod.default : [mod.default];
    exportsCache.set(filePath, arr);
    return arr;
};

/** Load the real command object for a manifest entry. */
const resolveEntry = async (entry) => {
    const arr = await loadModule(entry.file);
    return arr[entry.index] || null;
};

/**
 * Build a stub shaped like a command but that only resolves the real object
 * when behavior (execute / handleSession / handleButton) is accessed.
 */
const makeStub = (entry) => {
    let realPromise = null;
    const real = () => (realPromise || (realPromise = resolveEntry(entry)));

    const stub = {
        name: entry.name,
        aliases: entry.aliases,
        description: entry.description,
        category: entry.category || categoryFromPath(entry.file),
        _filePath: entry.file,
        _manifestEntry: entry,
        _resolve: real,
        execute: async (sock, m, args, text) => {
            const cmd = await real();
            if (!cmd?.execute) throw new Error(`Command ${entry.name} tidak valid`);
            return cmd.execute(sock, m, args, text);
        },
        handleSession: async (sock, m, session) => {
            const cmd = await real();
            if (typeof cmd?.handleSession === 'function') return cmd.handleSession(sock, m, session);
        },
        handleButton: async (sock, m, isOwner) => {
            const cmd = await real();
            return cmd.handleButton(sock, m, isOwner);
        },
        get buttonPrefix() {
            return entry.buttonPrefix || '';
        },
    };
    return stub;
};

const registerEntry = (entry) => {
    const stub = makeStub(entry);
    commands.set(entry.name.toLowerCase(), stub);
    for (const alias of entry.aliases || []) {
        if (alias) commands.set(alias.toLowerCase(), stub);
    }
    if (entry.hasHandleButton && entry.buttonPrefix) {
        const handler = async (...args) => {
            const cached = exportsCache.get(entry.file)?.[entry.index];
            const cmd = cached || (await resolveEntry(entry));
            if (cmd?.handleButton) return cmd.handleButton(...args);
            return false;
        };
        handler._filePath = entry.file;
        buttonHandlers.set(entry.buttonPrefix.toLowerCase(), handler);
    }
};

/**
 * Load command registry. In production we read a pre-built manifest (light
 * JSON, no module import) so the heavy command modules stay lazy until first
 * use. In development we import once so hot-reload works as before.
 */
export const loadCommands = async () => {
    logger.info(`Scanning for commands in: ${commandsDir}`);

    if (process.env.NODE_ENV === 'production') {
        try {
            manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
        } catch (e) {
            logger.error(`Manifest missing or invalid: ${manifestPath}`, e.message);
            manifest = [];
        }
        for (const entry of manifest) registerEntry(entry);
        logger.info(
            `\x1b[32m%s\x1b[0m`,
            `✅ Loaded ${commands.size} total commands/aliases and ${buttonHandlers.size} button handlers`
        );
        return;
    }

    // Development: import real modules (hot-reload friendly)
    const { glob } = await import('glob');
    const files = await glob(`${commandsDir}/**/*.js`);
    for (const file of files) {
        if (file.endsWith('manifest.json')) continue;
        await importCommand(file);
    }
    logger.info(
        `\x1b[32m%s\x1b[0m`,
        `✅ Loaded ${commands.size} total commands/aliases and ${buttonHandlers.size} button handlers`
    );

    const watcher = chokidar.watch(commandsDir, {
        ignored: /(^|[\/\\])\../,
        persistent: true,
        ignoreInitial: true,
    });
    watcher
        .on('ready', () => logger.info('🔥 Hot-Reload Monitor Active and Ready'))
        .on('add', (filePath) => reloadCommand(filePath))
        .on('change', (filePath) => reloadCommand(filePath))
        .on('unlink', (filePath) => unloadCommand(filePath))
        .on('error', (error) => logger.error(`Watcher error: ${error}`));
};

const importCommand = async (filePath) => {
    try {
        unloadCommand(filePath);
        const arr = await loadModule(filePath);
        if (!arr.length) return false;
        arr.forEach((cmd, index) => {
            if (!cmd?.name || typeof cmd.execute !== 'function') return;
            // Build a manifest entry on the fly (dev)
            const entry = {
                file: filePath,
                index,
                name: cmd.name,
                aliases: Array.isArray(cmd.aliases) ? cmd.aliases : [],
                description: cmd.description || '',
                category: cmd.category || categoryFromPath(filePath),
                buttonPrefix: cmd.buttonPrefix || '',
                hasHandleButton: typeof cmd.handleButton === 'function',
                hasHandleSession: typeof cmd.handleSession === 'function',
            };
            registerEntry(entry);
        });
        return true;
    } catch (error) {
        logger.error(` Error loading ${path.basename(filePath)}: ${error.message}`);
        return false;
    }
};

const reloadCommand = async (filePath) => {
    if (!filePath.endsWith('.js')) return false;
    await new Promise((resolve) => setTimeout(resolve, 300));
    const success = await importCommand(filePath);
    if (success) {
        logger.info(`\x1b[36m%s\x1b[0m`, `✨ Plugin Reloaded: ${path.basename(filePath)}`);
    }
    return Boolean(success);
};

const unloadCommand = (filePath) => {
    exportsCache.delete(filePath);
    for (const [key, cmd] of commands.entries()) {
        if (cmd._filePath === filePath) commands.delete(key);
    }
    for (const [key, handler] of buttonHandlers.entries()) {
        if (handler._filePath === filePath) buttonHandlers.delete(key);
    }
};

export { commands, buttonHandlers, reloadCommand, importCommand, unloadCommand };
