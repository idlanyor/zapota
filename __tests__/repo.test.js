import { formatRepo } from '../src/commands/info/repo.js';

const repo = {
    name: 'zapota',
    description: null,
    html_url: 'https://github.com/idlanyor/zapota',
    stargazers_count: 2,
    forks_count: 1,
    open_issues_count: 1,
    language: 'JavaScript',
    license: null,
    default_branch: 'main',
};

describe('.repo formatting', () => {
    test('shows link, counts and the latest commit in WIB', () => {
        const text = formatRepo(repo, {
            sha: '5dec9f27f27a3e88bc848d364358fc2e2a98bfab',
            commit: { message: 'Merge pull request #9\n\nbody', committer: { date: '2026-11-18T12:50:32Z' } },
        });
        expect(text).toContain('https://github.com/idlanyor/zapota');
        expect(text).toContain('⭐ 2 stars · 🍴 1 forks');
        expect(text).toContain('5dec9f2 — Merge pull request #9');
        expect(text).not.toContain('body');
        expect(text).toContain('19.50 WIB');
    });

    test('works without description, license or commit', () => {
        const text = formatRepo(repo, null);
        expect(text).not.toContain('null');
        expect(text).not.toContain('Commit terakhir');
        expect(formatRepo({ ...repo, license: { spdx_id: 'MIT' } }, null)).toContain('📄 MIT');
    });
});
