import { glob } from 'glob';
import path from 'path';
import { pathToFileURL } from 'url';
import chokidar from 'chokidar';
import logger from '../utils/logger.js';

const commands = new Map();
const buttonHandlers = new Map();
const commandsDir = path.resolve('src/commands');

/**
 * Initial load and watcher setup
 */
export const loadCommands = async () => {
    // 1. Initial Load All Files
    logger.info(`Scanning for commands in: ${commandsDir}`);
    const files = await glob(`${commandsDir}/**/*.js`);
    logger.info(`Found ${files.length} command files.`);
    for (const file of files) {
        await importCommand(file);
    }
    logger.info(
        `\x1b[32m%s\x1b[0m`,
        `✅ Loaded ${commands.size} total commands/aliases and ${buttonHandlers.size} button handlers`
    );

    // 2. Setup Watcher for Hot-Reload
    const watcher = chokidar.watch(commandsDir, {
        ignored: /(^|[\/\\])\../,
        persistent: true,
        ignoreInitial: true,
        usePolling: true,
        interval: 100,
        binaryInterval: 300,
    });

    watcher
        .on('ready', () => logger.info('🔥 Hot-Reload Monitor Active and Ready'))
        .on('add', (filePath) => reloadCommand(filePath))
        .on('change', (filePath) => reloadCommand(filePath))
        .on('unlink', (filePath) => {
            const fileName = path.basename(filePath);
            unloadCommand(filePath);
            logger.info(`🗑️ Plugin Deleted: ${fileName}`);
        })
        .on('error', (error) => logger.error(`Watcher error: ${error}`));
};

/**
 * Handle import logic with cache busting
 */
const importCommand = async (filePath) => {
    try {
        const timestamp = Date.now();
        const fileUrl = `${pathToFileURL(filePath).href}?v=${timestamp}`;
        const { default: moduleExport } = await import(fileUrl);

        if (!moduleExport) return false;

        // Clean previous registration
        unloadCommand(filePath);

        const relativePath = path.relative(commandsDir, filePath);
        const category = path.dirname(relativePath);
        const categoryName =
            category === '.'
                ? 'General'
                : category
                      .split(path.sep)
                      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
                      .join(' ');

        const register = (cmd) => {
            if (cmd && cmd.name && typeof cmd.execute === 'function') {
                cmd.category = cmd.category || categoryName;
                cmd._filePath = filePath;

                // Set main name
                commands.set(cmd.name.toLowerCase(), cmd);

                // Set aliases
                if (Array.isArray(cmd.aliases)) {
                    cmd.aliases.forEach((alias) => {
                        if (alias) commands.set(alias.toLowerCase(), cmd);
                    });
                }

                // REGISTER BUTTON HANDLER AUTOMATICALLY
                if (cmd.buttonPrefix && typeof cmd.handleButton === 'function') {
                    buttonHandlers.set(cmd.buttonPrefix.toLowerCase(), cmd.handleButton);
                }

                return true;
            }
            return false;
        };

        if (Array.isArray(moduleExport)) {
            moduleExport.forEach(register);
        } else {
            register(moduleExport);
        }

        return true;
    } catch (error) {
        logger.error(` Error loading ${path.basename(filePath)}: ${error.message}`);
        return false;
    }
};

const reloadCommand = async (filePath) => {
    if (!filePath.endsWith('.js')) return;

    // Tiny delay to ensure OS file write is complete
    await new Promise((resolve) => setTimeout(resolve, 300));

    const success = await importCommand(filePath);
    if (success) {
        logger.info(`\x1b[36m%s\x1b[0m`, `✨ Plugin Reloaded: ${path.basename(filePath)}`);
    }
};

const unloadCommand = (filePath) => {
    for (const [key, cmd] of commands.entries()) {
        if (cmd._filePath === filePath) {
            commands.delete(key);
        }
    }
};

export { commands, buttonHandlers };
