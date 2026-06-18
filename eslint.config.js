import js from '@eslint/js';
import googleConfig from 'eslint-config-google';

export default [
  js.configs.recommended,
  {
    ignores: [
      'test/**/*-part-*.js',
      'test/**/*-tail-*.js',
      'test/**/*-segment-*.js',
    ],
  },
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        fetch: 'readonly',
        queueMicrotask: 'readonly',
        structuredClone: 'readonly',
        URL: 'readonly',
        AbortController: 'readonly',
        global: 'readonly',
      },
    },
    rules: {
      ...googleConfig.rules,
      'indent': ['error', 2],
      'quotes': ['error', 'single'],
      'semi': ['error', 'always'],
      'max-len': ['error', {
        code: 100,
        ignoreComments: true,
        ignorePattern:
          '^\\s*(import\\s|return\\s+[A-Z0-9_]+\\.|[A-Z0-9_]+\\.|\\w+:\\s+[A-Z0-9_]+\\.|[A-Za-z0-9_]+\\s+as\\s)',
        ignoreRegExpLiterals: true,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
      }],
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'require-jsdoc': 'off',
      'valid-jsdoc': 'off',
      'new-cap': ['error', {
        capIsNewExceptions: [
          'EventEmitter',
          'Piscina',
          'Fastify',
          'CREATE_TOPOLOGY_REQUIRED',
          'MISSING_REQUIRED_FIELD',
          'REPLICA_HANDLER_NOT_REGISTERED',
          'SEED_READINESS_TIMEOUT_MSG',
          'SQL_SELECT_ALL_FROM_TABLE',
          'UNKNOWN_MESSAGE_TYPE',
          'UNSUPPORTED_MODE',
        ],
      }],
    },
  },
  {
    files: ['test/**/*.js'],
    rules: {
      'no-invalid-this': 'off',
    },
  },
];
