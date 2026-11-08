import js from '@eslint/js';
import googleConfig from 'eslint-config-google';

// navigability rule value_or_promise_then_checks (epic code-navigability-and-
// mistake-resistance, quest always-promise-port-answers): a consumer never
// probes an answer for a promise shape. The selectors mirror the budget
// detector: typeof on `.then`/`.catch` (optional chain or not) compared with
// === or !==, a `.then`/`.catch` read whose truthiness decides an if or a
// conditional (through !, &&, || and ??), and `instanceof Promise`. The one
// adapter that names a foreign answer (turnFromForeignAnswer in
// src/raft/raft-rs-turn-answer.js) reads `then` into a local and needs no
// exemption.
const PROMISE_METHOD_MEMBER = 'MemberExpression:matches(' +
  '[computed=false][property.name=/^(?:then|catch)$/], ' +
  '[computed=true][property.value=/^(?:then|catch)$/])';
const TRUTHINESS_OPERAND =
  ':matches(LogicalExpression, UnaryExpression[operator="!"])';
// How deep a promise-method read may sit under !, &&, || and ?? in a test.
const TRUTHINESS_OPERAND_DEPTH = 4;

// Each selector reports the promise-method read itself, reached by child
// steps from the comparison or the test it decides.
function truthinessTestSelectors() {
  const selectors = [];
  for (let depth = 0; depth <= TRUTHINESS_OPERAND_DEPTH; depth += 1) {
    const operands = Array.from({length: depth}, () => TRUTHINESS_OPERAND);
    for (const leaf of [[PROMISE_METHOD_MEMBER],
      ['ChainExpression', PROMISE_METHOD_MEMBER]]) {
      const steps = [...operands, ...leaf];
      steps[0] = `${steps[0]}.test`;
      selectors.push(
        [':matches(IfStatement, ConditionalExpression)', ...steps].join(' > '));
    }
  }
  return selectors;
}

const VALUE_OR_PROMISE_MESSAGE = 'navigability-rule:value_or_promise_then_checks ' +
  '- never probe an answer for a promise shape: its producer answers one ' +
  'shape (a promise, or a named settled-or-pending turn from ' +
  'src/raft/raft-rs-turn-answer.js).';
const TYPEOF_COMPARISON =
  'BinaryExpression[operator=/^[!=]==$/] > UnaryExpression[operator="typeof"]';
const VALUE_OR_PROMISE_SELECTORS = Object.freeze([
  `${TYPEOF_COMPARISON} > ${PROMISE_METHOD_MEMBER}`,
  `${TYPEOF_COMPARISON} > ChainExpression > ${PROMISE_METHOD_MEMBER}`,
  ...truthinessTestSelectors(),
  'BinaryExpression[operator="instanceof"][right.type="Identifier"]' +
    '[right.name="Promise"]',
].map((selector) => Object.freeze({selector, message: VALUE_OR_PROMISE_MESSAGE})));

export default [
  js.configs.recommended,
  {
    ignores: [
      'test/**/*-part-*.js',
      'test/**/*-tail-*.js',
      'test/**/*-segment-*.js',
      // The vendor root, like node_modules, holds generated and third-party
      // material nobody here maintains. Every other checker excludes it by
      // walking its own source roots (src, scripts, test) and never reaching
      // it; eslint is reached with explicit staged paths by the pre-commit
      // hook, so the root is declared non-source here once rather than as a
      // carve-out per artifact. Hand-written code belongs in src/.
      'vendor/**',
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
      // A block-scoped variable referenced before its declaration throws a
      // temporal-dead-zone ReferenceError on paths tests may never take
      // locally (full-gate run 32623687633 failed on exactly this in the
      // query executor's leader-redirect exhaustion branch). Functions and
      // classes hoist safely and stay exempt; variables do not.
      'no-use-before-define': ['error', {
        functions: false,
        classes: false,
        variables: true,
      }],
      'new-cap': ['error', {
        capIsNewExceptions: [
          'EventEmitter',
          'Piscina',
          'Fastify',
          'CREATE_TOPOLOGY_REQUIRED',
          'MISSING_REQUIRED_FIELD',
          'REPLICA_HANDLER_ADDRESS',
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
    files: ['src/**/*.js'],
    rules: {
      'no-restricted-syntax': ['error', ...VALUE_OR_PROMISE_SELECTORS],
    },
  },
  {
    files: ['test/**/*.js'],
    rules: {
      'no-invalid-this': 'off',
    },
  },
  // MUST stay last: flat config is last-match-wins, so this overrides the earlier
  // sourceType:'module' for CommonJS files. A .cjs file is CommonJS at runtime
  // regardless of package.json "type":"module", so require/module/exports are globals.
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        exports: 'writable',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
  },
];
