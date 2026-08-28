import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
    js.configs.recommended,
    eslintConfigPrettier,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.node,
                ...globals.es2021,
            },
        },
        rules: {
            'no-unused-vars': 'warn',
            'no-console': 'warn',
            eqeqeq: 'off',
            'no-undef': 'off',
            'no-empty': 'warn',
            'no-control-regex': 'warn',
            'no-useless-escape': 'off',
            'no-useless-assignment': 'off',
            'no-dupe-keys': 'off',
            'preserve-caught-error': 'off',
            'no-case-declarations': 'warn',
            'no-prototype-builtins': 'warn',
            'no-useless-catch': 'warn',
        },
    },
    {
        ignores: [
            'node_modules/',
            'dist/',
            'auth_info_baileys/',
            '.cache/',
            'webui/',
            'unused/',
            '.puppeteer_cache/',
        ],
    },
];
