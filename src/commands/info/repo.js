import axios from 'axios';

export const REPO = 'idlanyor/zapota';
const API = `https://api.github.com/repos/${REPO}`;
const CACHE_MS = 10 * 60 * 1000;

let cache = { at: 0, text: null };

const github = (path = '') =>
    axios.get(`${API}${path}`, {
        timeout: 15_000,
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'zapota-bot' },
    });

const fmtDate = (iso) =>
    new Date(iso).toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

export const formatRepo = (repo, commit) => {
    const lines = [
        `*📦 Source Code ${repo.name}*`,
        repo.description ? `_${repo.description}_` : null,
        '',
        `🔗 ${repo.html_url}`,
        `⭐ ${repo.stargazers_count} stars · 🍴 ${repo.forks_count} forks · 🐞 ${repo.open_issues_count} issues/PR`,
        `💻 ${repo.language || '-'}${repo.license?.spdx_id && repo.license.spdx_id !== 'NOASSERTION' ? ` · 📄 ${repo.license.spdx_id}` : ''}`,
        `🌿 Branch: ${repo.default_branch}`,
    ];
    if (commit) {
        const message = commit.commit.message.split('\n')[0];
        lines.push(
            '',
            '*Commit terakhir*',
            `• ${commit.sha.slice(0, 7)} — ${message.length > 80 ? `${message.slice(0, 77)}...` : message}`,
            `• ${fmtDate(commit.commit.committer?.date || commit.commit.author?.date)} WIB`
        );
    }
    lines.push('', 'Jangan lupa kasih ⭐ ya!');
    return lines.filter((l) => l !== null).join('\n');
};

export default {
    name: 'repo',
    aliases: ['sc', 'script', 'sourcecode'],
    description: 'Info source code bot (repo GitHub)',
    category: 'Info',
    execute: async (sock, m) => {
        try {
            if (!cache.text || Date.now() - cache.at > CACHE_MS) {
                const { data: repo } = await github();
                const commit = await github(`/commits/${repo.default_branch}`)
                    .then((r) => r.data)
                    .catch(() => null);
                cache = { at: Date.now(), text: formatRepo(repo, commit) };
            }
            await m.reply(cache.text);
        } catch (err) {
            console.error('[repo] failed:', err.message);
            await m.reply(`Gagal mengambil info repo. Cek langsung: https://github.com/${REPO}`);
        }
    },
};
