import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from '../../src/test-helpers/tap.js';
import {
  FILE_CLASS,
  applyMagicLiteralBaseline,
  classifyFilePath,
  collectMagicLiteralViolations,
  collectMagicLiteralViolationsFromSource,
} from '../../scripts/check-guideline-literals.js';

test('classifyFilePath recognizes constants owners and tests', async (t) => {
  t.equal(
    classifyFilePath('/repo/src/constants/query-constants.js'),
    FILE_CLASS.CONSTANTS_OWNER,
  );
  t.equal(
    classifyFilePath('/repo/test/query/query-executor.test.js'),
    FILE_CLASS.TEST,
  );
  t.equal(
    classifyFilePath('test/distributed/harness/query-executor.js'),
    FILE_CLASS.TEST,
    'repo-relative harness paths remain test-owned',
  );
  t.equal(
    classifyFilePath('/repo/src/query/query-executor.js'),
    FILE_CLASS.RUNTIME,
  );
});

test('runtime scan flags free-floating literals but ignores file-local constants',
  async (t) => {
    const violations = collectMagicLiteralViolationsFromSource(
      [
        'const LOCAL_TIMEOUT_MS = 5000;',
        'export function runTask(task) {',
        '  return task === \'ready\' ? 3 : LOCAL_TIMEOUT_MS;',
        '}',
      ].join('\n'),
      '/repo/src/runtime/task-runner.js',
    );

    t.same(
      violations.map((violation) => violation.value),
      ['\'ready\'', '3'],
      'file-local named constants should be allowed while free-floating literals are flagged',
    );
  });

test('runtime scan flags exported constants outside constants-owner modules',
  async (t) => {
    const violations = collectMagicLiteralViolationsFromSource(
      'export const READY_STATE = \'ready\';\n',
      '/repo/src/bootstrap/bootstrap-ready.js',
    );

    t.same(
      violations.map((violation) => violation.kind),
      ['exported_literal_outside_constants_owner'],
      'exported literals outside constants-owner modules should be detected',
    );
  });

test('constants-owner files may define owned literals directly', async (t) => {
  const violations = collectMagicLiteralViolationsFromSource(
    [
      'export const READY_STATE = \'ready\';',
      'export const RETRY_AFTER_MS = 5000;',
    ].join('\n'),
    '/repo/src/constants/bootstrap-constants.js',
  );

  t.equal(
    violations.length,
    0,
    'canonical constants-owner modules should not be flagged for owned literals',
  );
});

test('scanner ignores module specifiers, property keys, and parseInt radix',
  async (t) => {
    const violations = collectMagicLiteralViolationsFromSource(
      [
        'import {x} from \'./module.js\';',
        'const LOCAL = {timeout_ms: x};',
        'export function parseValue(value) {',
        '  return parseInt(value, 10);',
        '}',
      ].join('\n'),
      '/repo/src/runtime/parser.js',
    );

    t.equal(
      violations.length,
      0,
      'allowed syntax-only literals should not be flagged',
    );
  });

test('scanner exempts JS-language primitives: typeof strings, empty string, 0/1/2',
  async (t) => {
    const violations = collectMagicLiteralViolationsFromSource(
      [
        'export function inspect(value, items) {',
        '  if (typeof value === \'function\') {',
        '    return items.length - 1;',
        '  }',
        '  switch (typeof value) {',
        '    case \'string\':',
        '      return \'\';',
        '    default:',
        '      return items[0] ?? 2;',
        '  }',
        '}',
      ].join('\n'),
      '/repo/src/runtime/inspector.js',
    );

    t.equal(
      violations.length,
      0,
      'typeof-comparison strings, empty string, and structural integers ' +
        'are JS-language primitives, not domain scalars',
    );
  });

test('scanner still flags non-primitive literals next to exempt ones',
  async (t) => {
    const violations = collectMagicLiteralViolationsFromSource(
      [
        'export function classify(value) {',
        '  if (typeof value === \'function\') {',
        '    return value(5000, \'ready\');',
        '  }',
        '  return 0;',
        '}',
      ].join('\n'),
      '/repo/src/runtime/classifier.js',
    );

    t.same(
      violations.map((violation) => violation.value),
      ['5000', '\'ready\''],
      'domain scalars stay flagged; only the JS primitives are exempt',
    );
  });

test('scanner skips test files by default because the guideline defines suite-local exceptions',
  async (t) => {
    const violations = collectMagicLiteralViolationsFromSource(
      'test(\'works\', async () => 42);\n',
      '/repo/test/runtime/parser.test.js',
    );

    t.equal(
      violations.length,
      0,
      'test files should be skipped unless explicitly included',
    );
  });

test('baseline filtering keeps only new literal violations', async (t) => {
  const inheritedViolation = {
    filePath: '/repo/src/runtime/task-runner.js',
    line: 3,
    column: 18,
    value: '\'ready\'',
    kind: 'free_floating_string_literal',
  };
  const newViolation = {
    filePath: '/repo/src/runtime/task-runner.js',
    line: 3,
    column: 28,
    value: '3',
    kind: 'free_floating_number_literal',
  };
  const report = applyMagicLiteralBaseline(
    {
      scannedFileCount: 1,
      totalViolationCount: 2,
      filesWithViolations: [
        {
          filePath: '/repo/src/runtime/task-runner.js',
          violationCount: 2,
        },
      ],
      violations: [inheritedViolation, newViolation],
    },
    new Set([
      JSON.stringify([
        inheritedViolation.filePath,
        inheritedViolation.value,
        inheritedViolation.kind,
      ]),
    ]),
  );

  t.equal(report.inheritedViolationCount, 1);
  t.equal(report.totalViolationCount, 1);
  t.same(report.violations, [newViolation]);
});

test('scanner flags calculated local const initializers while accepting named policy constants',
  async (t) => {
    const violations = collectMagicLiteralViolationsFromSource(
      [
        'const RETRY_DELAY_MS = 250;',
        'const NEGATIVE_OFFSET = -50;',
        'const FIVE_SECONDS_MS = 5 * 1000;',
        'const POLICY = Object.freeze({defaultRetryDelayMs: 250});',
        'function delayDirect(value) {',
        '  return value > 0 ? value : 250;',
        '}',
        'function delayCalculated(value) {',
        '  const PRIVATE_DELAY_MS = 250;',
        '  const DERIVED_DELAY_MS = RETRY_DELAY_MS * 5;',
        '  const PRIVATE_POLICY = Object.freeze({...POLICY, defaultRetryDelayMs: 300});',
        '  const retryDelayMs = value > 0 ? value : 250;',
        '  const fallbackMs = value || 400;',
        '  const scaledMs = value * 500;',
        '  const isReady = value === \'ready\';',
        '  const formatted = formatValue(value, \'custom\');',
        '  const mixedObj = {status: \'timeout\', value};',
        '  const mixedArr = [\'--flag\', value];',
        '  const mixedFrozen = Object.freeze({status: \'bad\', value});',
        '  return isReady ? retryDelayMs : fallbackMs + scaledMs + formatted.length + ' +
          'PRIVATE_DELAY_MS + DERIVED_DELAY_MS + PRIVATE_POLICY.defaultRetryDelayMs + ' +
          'mixedObj.status.length + mixedArr.length + mixedFrozen.status.length + ' +
          'RETRY_DELAY_MS + NEGATIVE_OFFSET + FIVE_SECONDS_MS + POLICY.defaultRetryDelayMs;',
        '}',
      ].join('\n'),
      '/repo/src/runtime/delay-policy.js',
    );

    t.same(
      violations.map((violation) => ({line: violation.line, value: violation.value})),
      [
        {line: 6, value: '250'},
        {line: 12, value: '250'},
        {line: 13, value: '400'},
        {line: 14, value: '500'},
        {line: 15, value: '\'ready\''},
        {line: 16, value: '\'custom\''},
        {line: 17, value: '\'timeout\''},
        {line: 18, value: '\'--flag\''},
        {line: 19, value: '\'bad\''},
      ],
      'calculated locals and runtime-mixed containers must be flagged while pure policy ' +
        'constants remain accepted',
    );
  });

test('scanner distinguishes native-confirmed runtime names from their constant bindings',
  async (t) => {
    const cases = [
      {
        name: 'lowercase runtime parameter',
        source: 'function delay(budget) { const wait = budget * 500; return wait; }',
        expected: ['500'],
      },
      {
        name: 'uppercase runtime parameter',
        source: 'function delay(BUDGET) { const wait = BUDGET * 500; return wait; }',
        expected: ['500'],
      },
      {
        name: 'actual module constant',
        source: 'const BUDGET = 10; ' +
          'function delay() { const wait = BUDGET * 500; return wait; }',
        expected: [],
      },
      {
        name: 'runtime call without an alias',
        source: 'function delay(freeze) { const policy = freeze({waitMs: 500}); return policy; }',
        expected: ['500'],
      },
      {
        name: 'runtime call shadowing a module freeze alias',
        source: 'const freeze = Object.freeze; ' +
          'function delay(freeze) { const policy = freeze({waitMs: 500}); return policy; }',
        expected: ['500'],
      },
      {
        name: 'actual module freeze alias',
        source: 'const freeze = Object.freeze; ' +
          'function delay() { const policy = freeze({waitMs: 500}); return policy; }',
        expected: [],
      },
    ];
    for (const {name, source, expected} of cases) {
      const violations = collectMagicLiteralViolationsFromSource(
        source,
        '/repo/src/runtime/literal-binding-witness.js',
      );
      t.same(violations.map((violation) => violation.value), expected, name);
    }
  });

test('scanner resolves the nearest lexical binding across runtime shadowing forms',
  async (t) => {
    const owners = 'const BUDGET = 10; const freeze = Object.freeze; ';
    const calculated = 'const wait = BUDGET * 500; const policy = freeze({waitMs: 600});';
    const cases = [
      ['object parameter', `function run({BUDGET, freeze}) { ${calculated} }`],
      ['array parameter', `function run([BUDGET, freeze]) { ${calculated} }`],
      ['rest parameter', `function run(...[BUDGET, freeze]) { ${calculated} }`],
      ['default parameter', `function run(BUDGET = 1, freeze = fallback) { ${calculated} }`],
      ['closure over parameters',
        `function run(BUDGET, freeze) { return () => { ${calculated} }; }`],
      ['block bindings',
        `function run(input) { { let BUDGET = input, freeze = input; ${calculated} } }`],
      ['loop destructuring',
        `function run(inputs) { for (const [BUDGET, freeze] of inputs) { ${calculated} } }`],
      ['catch destructuring',
        `function run() { try {} catch ({BUDGET, freeze}) { ${calculated} } }`],
      ['hoisted var declarations',
        `function run() { ${calculated} var BUDGET, freeze; }`],
      ['hoisted function declarations',
        `function run() { ${calculated} function BUDGET() {} function freeze() {} }`],
      ['named function expression', `const run = function freeze(BUDGET) { ${calculated} };`],
      ['named class expression', `const Run = class freeze { run(BUDGET) { ${calculated} } };`],
      ['switch case bindings',
        'function run(input) { switch (input) { case 0: ' +
          `let BUDGET = input, freeze = input; ${calculated} } }`],
      ['local runtime const bindings',
        `function run(input) { const BUDGET = input, freeze = input; ${calculated} }`],
    ];
    for (const [name, source] of cases) {
      const violations = collectMagicLiteralViolationsFromSource(
        owners + source,
        '/repo/src/runtime/literal-binding-shadows.js',
      );
      t.same(violations.map((violation) => violation.value), ['500', '600'], name);
    }
  });

test('scanner preserves real constant identities without borrowing unrelated shadows',
  async (t) => {
    const cases = [
      ['imported constant',
        'import {BUDGET} from "./policy-constants.js"; ' +
          'function run() { const wait = BUDGET * 500; }'],
      ['imported Node Buffer intrinsic',
        'import {Buffer} from "node:buffer"; ' +
          'function run() { const bytes = Buffer.from([500]); }'],
      ['static local constant',
        'function run() { const BUDGET = 10; const wait = BUDGET * 500; }'],
      ['nearest static const overrides a runtime parameter',
        'function run(BUDGET) { { const BUDGET = 10; const wait = BUDGET * 500; } }'],
      ['destructured module freeze alias',
        'const {freeze} = Object; function run() { const policy = freeze({waitMs: 500}); }'],
      ['unrelated parameter shadows do not affect a module owner',
        'const BUDGET = 10; const freeze = Object.freeze; ' +
          'function unrelated(BUDGET, freeze) {} ' +
          'function run() { const wait = BUDGET * 500; const policy = freeze({waitMs: 600}); }'],
      ['body var declarations do not shadow parameter initializers',
        'const BUDGET = 10; const freeze = Object.freeze; ' +
          'function run(value = (() => { const wait = BUDGET * 500; ' +
          'const policy = freeze({waitMs: 600}); return policy; })()) { var BUDGET, freeze; }'],
      ['switch case bindings do not shadow the discriminant',
        'const BUDGET = 10; const freeze = Object.freeze; ' +
          'switch ((() => { const wait = BUDGET * 500; ' +
          'const policy = freeze({waitMs: 600}); return wait; })()) { ' +
          'case 0: let BUDGET, freeze; }'],
      ['an Object parameter does not change the captured module freeze alias',
        'const freeze = Object.freeze; ' +
          'function run(Object) { const policy = freeze({waitMs: 500}); }'],
    ];
    for (const [name, source] of cases) {
      t.same(collectMagicLiteralViolationsFromSource(
        source,
        '/repo/src/runtime/literal-binding-controls.js',
      ), [], name);
    }
  });

test('scanner rejects unresolved, mutable, cyclic, and shadowed intrinsic references',
  async (t) => {
    const cases = [
      ['unresolved uppercase reference',
        'function run() { const wait = BUDGET * 500; }', ['500']],
      ['mutable module reference',
        'let BUDGET = 1; function run() { const wait = BUDGET * 500; }', ['500']],
      ['parameter shadows an imported constant',
        'import {BUDGET} from "./policy-constants.js"; ' +
          'function run(BUDGET) { const wait = BUDGET * 500; }', ['500']],
      ['local runtime const member',
        'function run(input) { const BUDGET = {input}; const wait = BUDGET.input * 500; }',
        ['500']],
      ['cyclic local const references',
        'function run() { const FIRST = SECOND; const SECOND = FIRST; ' +
          'const wait = FIRST * 500; }', ['500']],
      ['shadowed intrinsic names',
        'function run(Object, Buffer, Set, Map) { const a = Object.freeze({waitMs: 500}); ' +
          'const b = Buffer.from([600]); const c = new Set([700]); ' +
          'const d = new Map([[800, 1]]); }', ['500', '600', '700', '800']],
      ['freeze alias of a shadowed Object',
        'const Object = custom; const freeze = Object.freeze; ' +
          'function run() { const policy = freeze({waitMs: 500}); }', ['500']],
    ];
    for (const [name, source, expected] of cases) {
      const violations = collectMagicLiteralViolationsFromSource(
        source,
        '/repo/src/runtime/literal-binding-rejections.js',
      );
      t.same(violations.map((violation) => violation.value), expected, name);
    }
  });

test('scanner does not let outer const cross function, arrow, method, or class boundaries',
  async (t) => {
    const violations = collectMagicLiteralViolationsFromSource(
      [
        'const SERVICE = {',
        '  defaultMs: 250,',
        '  delay(value) {',
        '    return value > 0 ? value : 300;',
        '  },',
        '};',
        'const arrowTernary = (value) => value > 0 ? value : 350;',
        'const arrowDirect = () => 400;',
        'const arrowDefault = (value = 450) => value;',
        'const fnExpr = function(value) {',
        '  return value ?? 500;',
        '};',
        'const ServiceClass = class {',
        '  static TIMEOUT_MS = 550;',
        '  delay() {',
        '    return 600;',
        '  }',
        '};',
        'export const EXPORTED_SERVICE = {',
        '  delay() {',
        '    return 650;',
        '  },',
        '};',
      ].join('\n'),
      '/repo/src/runtime/service-methods.js',
    );

    t.same(
      violations.map((violation) => ({
        line: violation.line,
        value: violation.value,
        kind: violation.kind,
      })),
      [
        {line: 4, value: '300', kind: 'free_floating_number_literal'},
        {line: 7, value: '350', kind: 'free_floating_number_literal'},
        {line: 8, value: '400', kind: 'free_floating_number_literal'},
        {line: 9, value: '450', kind: 'free_floating_number_literal'},
        {line: 11, value: '500', kind: 'free_floating_number_literal'},
        {line: 14, value: '550', kind: 'free_floating_number_literal'},
        {line: 16, value: '600', kind: 'free_floating_number_literal'},
        {line: 21, value: '650', kind: 'free_floating_number_literal'},
      ],
      'outer const declarations must never exempt literals across function or class boundaries',
    );
  });

test('scanner rejects destructuring defaults, let/var, and top-level runtime expressions',
  async (t) => {
    const violations = collectMagicLiteralViolationsFromSource(
      [
        'const TOP_RUNTIME = process.env.DELAY || 250;',
        'const TOP_COND = process.platform === \'win32\' ? \'npm.cmd\' : \'npm\';',
        'const TOP_AWAIT = await queryWindow(\'positive-immediate\', 1000);',
        'const {timeout = 300} = globalThis;',
        'const [first = 350] = [];',
        'let mutableLimit = 400;',
        'var legacyLimit = 450;',
      ].join('\n'),
      '/repo/src/runtime/runtime-defaults.js',
    );

    t.same(
      violations.map((violation) => violation.value),
      [
        '250',
        '\'win32\'',
        '\'npm.cmd\'',
        '\'npm\'',
        '\'positive-immediate\'',
        '1000',
        '300',
        '350',
        '400',
        '450',
      ],
    );
  });

test('scanner accepts genuine module-level tables, catalogs, freeze aliases, and primitives',
  async (t) => {
    const violations = collectMagicLiteralViolationsFromSource(
      [
        'import path from \'node:path\';',
        'import {TABLES, COL, freezeDefinition} from \'./schema-constants.js\';',
        'const tap = await import(\'tap\');',
        'const {freeze: destructuredFreeze} = Object;',
        'const freezeObject = Object.freeze;',
        'const POLICY = freezeObject({',
        '  defaultRetryDelayMs: 250,',
        '  nested: Object.freeze({maxAttempts: 5}),',
        '});',
        'const DESTRUCTURED_POLICY = destructuredFreeze({timeoutMs: 750});',
        'const ALLOWED = Object.freeze(new Set([\'fast\', \'slow\']));',
        'const OID_BYTES = Object.freeze({KEY: Buffer.from([0x2b, 0x65])});',
        'const SCHEMA = {table: TABLES.X, cols: [{name: \'id\', type: COL.TEXT}]};',
        'const CONFIGS = [{id: \'spec-fixed\', module: path.resolve(\'models\', \'Spec.tla\')}];',
        'const CATALOG = Object.freeze({',
        '  [TABLES.X]: freezeDefinition({code: \'snapshot_missing\'}),',
        '});',
        'const USAGE = [\'line 1\', \'line 2\'].join(\'\\n\');',
        'const SQL = \'SELECT * FROM \' + `_${TABLES.X} ` + \'ORDER BY id\';',
        'function withPrimitives(value) {',
        '  const a = value > 0 ? value : -1;',
        '  const b = value || \'\';',
        '  const c = value ?? 2;',
        '  return typeof a === \'number\' ? a : b + c + (tap ? 0 : 1) + CONFIGS.length + ' +
          'Object.keys(CATALOG).length;',
        '}',
      ].join('\n'),
      '/repo/src/runtime/valid-constants.js',
    );

    t.equal(violations.length, 0);
  });

test('constants-owner exported tables referencing imported constants remain accepted',
  async (t) => {
    const violations = collectMagicLiteralViolationsFromSource(
      [
        'import {SUBSYSTEM_PGWIRE_COMPAT} from \'./subsystems.js\';',
        'const OTHER_REASON = \'other_reason\';',
        'export const REASON = Object.freeze({',
        '  PUBLICATION_PUBLISHED: \'publication_published\',',
        '  OTHER: OTHER_REASON,',
        '});',
        'export const RULES = Object.freeze([',
        '  {id: \'pgwire-basename\', subsystem: SUBSYSTEM_PGWIRE_COMPAT},',
        ']);',
      ].join('\n'),
      '/repo/src/diagnostics/topology-convergence-constants.js',
    );

    t.equal(violations.length, 0);
  });

test('collectMagicLiteralViolations preserves binding violations in filesystem reports',
  async (t) => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'literal-checker-'));
    try {
      const targetFile = path.join(tempDir, 'delay-sample.js');
      await fs.writeFile(
        targetFile,
        [
          'const RETRY_DELAY_MS = 250;',
          'const POLICY = Object.freeze({defaultRetryDelayMs: 250});',
          'const SERVICE = {',
          '  delay(value) {',
          '    return value > 0 ? value : 300;',
          '  },',
          '};',
          'const arrowDelay = (value) => value > 0 ? value : 350;',
          'function delayDirect(value) {',
          '  return value > 0 ? value : 400;',
          '}',
          'function delayLocalCalculated(value) {',
          '  const retryDelayMs = value > 0 ? value : 450;',
          '  return retryDelayMs;',
          '}',
          'const freeze = Object.freeze;',
          'function delayUpper(BUDGET) { const wait = BUDGET * 500; return wait; }',
          'function delayFreeze(freeze) { const policy = freeze({waitMs: 500}); return policy; }',
        ].join('\n'),
        'utf8',
      );

      const report = await collectMagicLiteralViolations([tempDir]);
      t.equal(report.scannedFileCount, 1);
      t.equal(report.totalViolationCount, 6);
      t.same(
        report.violations.map((violation) => ({
          line: violation.line,
          value: violation.value,
          kind: violation.kind,
        })),
        [
          {line: 5, value: '300', kind: 'free_floating_number_literal'},
          {line: 8, value: '350', kind: 'free_floating_number_literal'},
          {line: 10, value: '400', kind: 'free_floating_number_literal'},
          {line: 13, value: '450', kind: 'free_floating_number_literal'},
          {line: 17, value: '500', kind: 'free_floating_number_literal'},
          {line: 18, value: '500', kind: 'free_floating_number_literal'},
        ],
      );
    } finally {
      await fs.rm(tempDir, {recursive: true, force: true});
    }
  });
