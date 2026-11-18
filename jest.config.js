export default {
    transform: {},
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
    testPathIgnorePatterns: [
        '/node_modules/',
        '/src/database/__tests__/migrate.test.js',
        '/src/database/__tests__/repos.test.js',
        '/src/lib/__tests__/youtubeSearch.test.js',
        '/src/services/__tests__/utamaApi.test.js',
        '/src/lib/__tests__/quoteRenderer.test.js',
        '/src/lib/__tests__/getMedia.test.js',
        '/src/utils/__tests__/commandInput.test.js',
        '/__tests__/smeme.test.js',
        '/core/test/',
        '<rootDir>/werewolf/',
    ],
};
