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

// navigability-rule:state_read_defaults (epic code-navigability-and-mistake-
// resistance, row state_read_defaults; R07). A read of a state field
// (status, role, raft_role/raftRole, workflow_step/workflowStep, phase, step,
// plainly, by string or template key, or by a constants member named STATUS,
// ROLE, RAFT_ROLE, WORKFLOW_STEP, PHASE or STEP, optionally chained) that has
// a term after it in a flattened `||` or `??` chain makes a value appear when
// the fact is absent; so does a conditional that answers a state read on a
// test reading a state field (`typeof r.status === 'string' ? r.status : d`),
// the reader's decision written inline. The selectors below report exactly
// the sites scripts/checks/code-navigability-detectors.js counts for that
// row: a term followed by another (`T || d`), the right term of a chain that
// continues (`a || T || d`), the right term of an explicitly parenthesised
// right-nested chain that continues (`(x || (a || T)) || d`, nested up to
// STATE_READ_DEFAULT_RIGHT_NESTING levels; the detector has no bound, and a
// deeper nesting is outside the promoted rule), and each state-read branch
// of such a conditional. test/scripts/state-read-named-defaults.test.js pins
// report-for-site parity on every shape the detector's fixture counts.
const STATE_FIELD_PATTERN =
  '/^(status|role|raft_role|raftRole|workflow_step|workflowStep|phase|step)$/';
const STATE_CONSTANT_PATTERN =
  '/^(STATUS|ROLE|RAFT_ROLE|WORKFLOW_STEP|PHASE|STEP)$/';
const STATE_READ = ':matches(' + [
  `MemberExpression[computed=false][property.name=${STATE_FIELD_PATTERN}]`,
  'MemberExpression[computed=true][property.type="Literal"]' +
    `[property.value=${STATE_FIELD_PATTERN}]`,
  'MemberExpression[computed=true][property.type="TemplateLiteral"]' +
    `[property.expressions.length=0][property.quasis.0.value.cooked=${STATE_FIELD_PATTERN}]`,
  'MemberExpression[computed=true][property.type="MemberExpression"]' +
    `[property.computed=false][property.property.name=${STATE_CONSTANT_PATTERN}]`,
].join(', ') + ')';
const STATE_READ_DEFAULT_MESSAGE =
  'navigability-rule:state_read_defaults: a state read carries a || or ?? ' +
  'default, or a conditional decides on it inline (R07). Read the field its ' +
  'schema column or decoder guarantees, or ' +
  'read an optional one with readStateField (src/utils/state-field-read.js) ' +
  'and decide on STATE_ABSENT explicitly.';
const FALLBACK_OPERATORS = ['||', '??'];
// How many explicitly parenthesised right-nested chains may sit between a
// state read and the `.left` of the chain that continues past it.
const STATE_READ_DEFAULT_RIGHT_NESTING = 6;
// The term positions, as the field path from the term up to the chain node
// that proves a term follows it; the operator is the same at every level:
// the term is the left of a chain, or the right of a chain that is the right
// of zero or more chains, the last of which is the left of a chain.
function stateReadDefaultPositions(op) {
  const chain = `LogicalExpression[operator="${op}"]`;
  const positions = [`${chain} > TERM.left`];
  for (let nesting = 0; nesting <= STATE_READ_DEFAULT_RIGHT_NESTING; nesting += 1) {
    const rights = Array.from({length: nesting},
      () => `LogicalExpression.right[operator="${op}"]`);
    positions.push([chain, `LogicalExpression.left[operator="${op}"]`, ...rights,
      'TERM.right'].join(' > '));
  }
  return positions;
}
// A conditional whose test is, or contains, a state read.
const STATE_TEST_CONDITIONAL =
  `ConditionalExpression:has(> .test:matches(${STATE_READ}, :has(${STATE_READ})))`;
const STATE_READ_TERNARY_POSITIONS = ['consequent', 'alternate'].map((branch) =>
  `${STATE_TEST_CONDITIONAL} > TERM.${branch}`);
const STATE_READ_DEFAULT_RESTRICTIONS = [
  ...FALLBACK_OPERATORS.flatMap(stateReadDefaultPositions),
  ...STATE_READ_TERNARY_POSITIONS,
].flatMap((position) => [
  position.replace('TERM', STATE_READ),
  position.replace('TERM', 'ChainExpression') + ` > ${STATE_READ}`,
]).map((selector) => ({selector, message: STATE_READ_DEFAULT_MESSAGE}));

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
    // One no-restricted-syntax entry list for src: flat config replaces a
    // rule's setting per matching object, so every promoted navigability
    // pattern joins this list rather than a second object.
    files: ['src/**/*.js'],
    rules: {
      'no-restricted-syntax': ['error',
        ...VALUE_OR_PROMISE_SELECTORS,
        ...STATE_READ_DEFAULT_RESTRICTIONS,
      ],
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
