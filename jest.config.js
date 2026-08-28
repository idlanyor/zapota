export default {
    transform: {},
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
    testPathIgnorePatterns: [
        '/node_modules/',
        '/src/database/__tests__/adapter.test.js',
        '/src/lib/__tests__/youtubeSearch.test.js',
        '/src/services/__tests__/utamaApi.test.js',
        '/core/test/',
        '<rootDir>/werewolf/',
    ],
};
