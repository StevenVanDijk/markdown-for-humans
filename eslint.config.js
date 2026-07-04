const { FlatCompat } = require('@eslint/eslintrc');
const js = require('@eslint/js');

const compat = new FlatCompat({
    baseDirectory: __dirname,
    resolvePluginsRelativeTo: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

module.exports = [
    ...compat.config({
        parser: '@typescript-eslint/parser',
        extends: [
            'eslint:recommended',
            'plugin:@typescript-eslint/recommended',
            'plugin:prettier/recommended'
        ],
        parserOptions: {
            ecmaVersion: 2020,
            sourceType: 'module'
        },
        rules: {
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/no-explicit-any': 'warn',
            'no-console': ['warn', { allow: ['warn', 'error'] }]
        }
    }),
    {
        ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'eslint.config.js']
    },
    {
        files: ['src/__tests__/**'],
        linterOptions: {
            reportUnusedDisableDirectives: false
        },
        rules: {
            'no-console': 'off',
            '@typescript-eslint/no-explicit-any': 'off'
        }
    },
    {
        files: ['src/webview/**'],
        rules: {
            'no-console': 'off'
        }
    },
    {
        files: ['scripts/**/*.js', 'src/__mocks__/**/*.js'],
        languageOptions: {
            globals: {
                process: 'readonly',
                console: 'readonly',
                require: 'readonly',
                __dirname: 'readonly',
                module: 'readonly',
            },
            ecmaVersion: 2022,
            sourceType: 'commonjs',
        },
        rules: {
            'no-console': 'off', // Build scripts / Jest mocks can use console.log
            '@typescript-eslint/no-require-imports': 'off', // CommonJS build scripts and Jest mocks use require
            '@typescript-eslint/no-var-requires': 'off'
        }
    }
];
