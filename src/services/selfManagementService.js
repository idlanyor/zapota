import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec, execSync } from 'child_process';
import util from 'util';
import { commands, reloadCommand, unloadCommand } from '../lib/commands.js';
import logger from '../utils/logger.js';

const execAsync = util.promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');
const commandsDir = path.resolve(projectRoot, 'src/commands');
const backupDir = path.resolve(projectRoot, 'data/backups/plugins');

// Ensure backup dir exists
if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
}

/**
 * Deteksi package manager di environment
 */
export const detectPackageManager = () => {
    const check = (bin) => {
        try {
            execSync(`${bin} --version`, { stdio: 'ignore' });
            return true;
        } catch {
            return false;
        }
    };
    if (check('pnpm')) return 'pnpm';
    if (check('npm')) return 'npm';
    if (check('yarn')) return 'yarn';
    if (check('bun')) return 'bun';
    return 'npm';
};

/**
 * Rebuild manifest.json jika ada penambahan / penghapusan plugin
 */
export const rebuildManifest = async () => {
    try {
        const scriptPath = path.join(projectRoot, 'scripts/build-manifest.js');
        if (fs.existsSync(scriptPath)) {
            await execAsync(`node "${scriptPath}"`, { cwd: projectRoot });
            return true;
        }
    } catch (err) {
        logger.error(err, 'Failed to rebuild manifest.json');
    }
    return false;
};

/**
 * Mencari file plugin berdasarkan nama command / nama file
 */
export const findPluginFile = (name) => {
    const cleanName = name.replace(/\.js$/i, '').replace(/\.disabled$/i, '').toLowerCase();

    // 1. Cek langsung dari memory commands
    const existingCmd = commands.get(cleanName);
    if (existingCmd?._filePath && fs.existsSync(existingCmd._filePath)) {
        return existingCmd._filePath;
    }

    // 2. Scan rekursif src/commands
    const scanDir = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                const found = scanDir(fullPath);
                if (found) return found;
            } else if (
                entry.name.toLowerCase() === `${cleanName}.js` ||
                entry.name.toLowerCase() === `${cleanName}.js.disabled`
            ) {
                return fullPath;
            }
        }
        return null;
    };

    return scanDir(commandsDir);
};

/**
 * Cek sintaksis file JS menggunakan node --check
 */
export const checkSyntax = async (filePath) => {
    try {
        await execAsync(`node --check "${filePath}"`, { cwd: projectRoot });
        return { valid: true, error: null };
    } catch (err) {
        const errorMsg = err.stderr || err.stdout || err.message;
        return { valid: false, error: errorMsg.trim() };
    }
};

/**
 * Validasi kode string JS sebelum ditulis ke file
 */
export const validateCodeSnippet = async (code) => {
    const tempFile = path.join(projectRoot, `temp/lint_${Date.now()}_${Math.random().toString(36).slice(2)}.mjs`);
    try {
        fs.mkdirSync(path.dirname(tempFile), { recursive: true });
        fs.writeFileSync(tempFile, code, 'utf8');
        const res = await checkSyntax(tempFile);
        return res;
    } finally {
        if (fs.existsSync(tempFile)) {
            try { fs.unlinkSync(tempFile); } catch {}
        }
    }
};

/**
 * Buat snapshot backup sebelum plugin ditimpa / dihapus
 */
export const createBackupSnapshot = (filePath) => {
    if (!fs.existsSync(filePath)) return null;
    const baseName = path.basename(filePath);
    const timestamp = Date.now();
    const backupPath = path.join(backupDir, `${timestamp}_${baseName}.bak`);
    fs.copyFileSync(filePath, backupPath);
    return backupPath;
};

/**
 * Pulihkan snapshot backup jika terjadi kegagalan
 */
export const restoreBackupSnapshot = (backupPath, targetPath) => {
    if (backupPath && fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, targetPath);
        return true;
    }
    return false;
};

/**
 * Membaca kode plugin
 */
export const readPlugin = (name) => {
    const filePath = findPluginFile(name);
    if (!filePath) {
        throw new Error(`Plugin "${name}" tidak ditemukan.`);
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const isCategory = path.basename(path.dirname(filePath));
    const isDisabled = filePath.endsWith('.disabled');
    return {
        filePath,
        fileName: path.basename(filePath),
        category: isCategory,
        content,
        isDisabled,
    };
};

/**
 * Menyimpan / memperbarui kode plugin dengan safety test & auto-rollback
 */
export const savePlugin = async ({ name, category = 'tools', code }) => {
    if (!name) throw new Error('Nama plugin wajib diisi.');
    if (!code) throw new Error('Kode plugin tidak boleh kosong.');

    const cleanName = name.replace(/\.js$/i, '').trim().toLowerCase();
    const targetCategory = category.toLowerCase().trim();
    const targetDir = path.join(commandsDir, targetCategory);
    const targetFile = path.join(targetDir, `${cleanName}.js`);

    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    // 1. Pre-validation syntax
    const validation = await validateCodeSnippet(code);
    if (!validation.valid) {
        return {
            success: false,
            error: `Syntax Error: ${validation.error}`,
            rolledBack: false,
        };
    }

    // 2. Snapshot backup jika file sudah ada
    let existingFile = findPluginFile(cleanName);
    let backupPath = null;
    if (existingFile && fs.existsSync(existingFile)) {
        backupPath = createBackupSnapshot(existingFile);
    }

    const destinationFile = existingFile || targetFile;

    try {
        // Tulis file
        fs.writeFileSync(destinationFile, code, 'utf8');

        // 3. Dry-run load ke memory runtime
        const loadSuccess = await reloadCommand(destinationFile);
        if (!loadSuccess) {
            throw new Error('Gagal mengimpor plugin ke command registry. Kemungkinan export format tidak sesuai atau dependencies tidak ditemukan.');
        }

        // Rebuild manifest di background
        rebuildManifest().catch(() => {});

        return {
            success: true,
            filePath: destinationFile,
            category: targetCategory,
            backupPath,
        };
    } catch (err) {
        // 4. Auto-Rollback jika gagal runtime
        let rolledBack = false;
        if (backupPath && existingFile) {
            restoreBackupSnapshot(backupPath, existingFile);
            await reloadCommand(existingFile).catch(() => {});
            rolledBack = true;
        } else if (!existingFile && fs.existsSync(destinationFile)) {
            // Hapus file baru yang gagal di-load
            fs.unlinkSync(destinationFile);
            unloadCommand(destinationFile);
            rolledBack = true;
        }

        return {
            success: false,
            error: err.message,
            rolledBack,
        };
    }
};

/**
 * Menghapus plugin
 */
export const deletePlugin = async (name) => {
    const filePath = findPluginFile(name);
    if (!filePath) {
        throw new Error(`Plugin "${name}" tidak ditemukan.`);
    }

    const backupPath = createBackupSnapshot(filePath);
    unloadCommand(filePath);
    fs.unlinkSync(filePath);
    await rebuildManifest();

    return {
        success: true,
        deletedFile: filePath,
        backupPath,
    };
};

/**
 * Toggle enable/disable plugin
 */
export const togglePlugin = async (name, enable = null) => {
    const filePath = findPluginFile(name);
    if (!filePath) {
        throw new Error(`Plugin "${name}" tidak ditemukan.`);
    }

    const isCurrentlyDisabled = filePath.endsWith('.disabled');
    const shouldEnable = enable !== null ? Boolean(enable) : isCurrentlyDisabled;

    if (shouldEnable && !isCurrentlyDisabled) {
        return { success: true, message: `Plugin "${name}" sudah dalam status aktif.` };
    }
    if (!shouldEnable && isCurrentlyDisabled) {
        return { success: true, message: `Plugin "${name}" sudah dinonaktifkan.` };
    }

    if (shouldEnable) {
        const newPath = filePath.replace(/\.disabled$/i, '');
        fs.renameSync(filePath, newPath);
        await reloadCommand(newPath);
        await rebuildManifest();
        return { success: true, enabled: true, newPath };
    } else {
        const newPath = `${filePath}.disabled`;
        unloadCommand(filePath);
        fs.renameSync(filePath, newPath);
        await rebuildManifest();
        return { success: true, enabled: false, newPath };
    }
};

/**
 * List semua plugin yang terdaftar beserta statusnya
 */
export const listPlugins = () => {
    const results = [];
    const scanDir = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                scanDir(fullPath);
            } else if (entry.name.endsWith('.js') || entry.name.endsWith('.js.disabled')) {
                if (entry.name === 'manifest.json') continue;
                const rel = path.relative(commandsDir, fullPath);
                const category = path.dirname(rel) === '.' ? 'General' : path.dirname(rel);
                const isDisabled = entry.name.endsWith('.disabled');
                const cleanName = entry.name.replace(/\.js(\.disabled)?$/i, '');
                results.push({
                    name: cleanName,
                    category,
                    fileName: entry.name,
                    disabled: isDisabled,
                    fullPath,
                });
            }
        }
    };
    scanDir(commandsDir);
    return results;
};

/**
 * Manajemen Library (Package Manager)
 */
export const installPackage = async (pkgName, isDev = false) => {
    if (!pkgName) throw new Error('Nama package wajib diisi.');
    const manager = detectPackageManager();
    const flag = isDev ? (manager === 'yarn' ? '-D' : '--save-dev') : '';
    const addCmd = manager === 'yarn' ? 'add' : manager === 'bun' ? 'add' : manager === 'pnpm' ? 'add' : 'install';
    const command = `${manager} ${addCmd} ${pkgName} ${flag}`.trim();

    const { stdout, stderr } = await execAsync(command, { cwd: projectRoot, timeout: 5 * 60 * 1000 });
    return {
        manager,
        command,
        output: [stdout, stderr].filter(Boolean).join('\n').trim(),
    };
};

export const uninstallPackage = async (pkgName) => {
    if (!pkgName) throw new Error('Nama package wajib diisi.');
    const manager = detectPackageManager();
    const removeCmd = manager === 'yarn' ? 'remove' : manager === 'bun' ? 'remove' : manager === 'pnpm' ? 'remove' : 'uninstall';
    const command = `${manager} ${removeCmd} ${pkgName}`.trim();

    const { stdout, stderr } = await execAsync(command, { cwd: projectRoot, timeout: 5 * 60 * 1000 });
    return {
        manager,
        command,
        output: [stdout, stderr].filter(Boolean).join('\n').trim(),
    };
};

/**
 * Git Operations
 */
export const gitStatus = async () => {
    const { stdout } = await execAsync('git status -s', { cwd: projectRoot });
    return stdout.trim() || 'No changes detected. Working tree clean.';
};

export const gitDiff = async (target = '') => {
    const cmd = target ? `git diff -- "${target}"` : 'git diff';
    const { stdout } = await execAsync(cmd, { cwd: projectRoot, maxBuffer: 2 * 1024 * 1024 });
    return stdout.trim() || '(tidak ada perubahan git diff)';
};

export const gitCommit = async (message, files = '.') => {
    if (!message) throw new Error('Commit message wajib diisi.');
    const safeMessage = message.replace(/"/g, '\\"');
    await execAsync(`git add ${files}`, { cwd: projectRoot });
    const { stdout, stderr } = await execAsync(`git commit -m "${safeMessage}"`, { cwd: projectRoot });
    return [stdout, stderr].filter(Boolean).join('\n').trim();
};

export const gitRollback = async (target = 'HEAD') => {
    const { stdout, stderr } = await execAsync(`git checkout ${target} -- src/commands/`, { cwd: projectRoot });
    await rebuildManifest();
    return [stdout, stderr].filter(Boolean).join('\n').trim() || 'Rollback src/commands berhasil.';
};
