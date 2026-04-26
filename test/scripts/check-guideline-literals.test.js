import {test} from '../../src/test-helpers/tap.js';
import {
  FILE_CLASS,
  applyMagicLiteralBaseline,
  classifyFilePath,
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
        inheritedViolation.line,
        inheritedViolation.column,
        inheritedViolation.value,
        inheritedViolation.kind,
      ]),
    ]),
  );

  t.equal(report.inheritedViolationCount, 1);
  t.equal(report.totalViolationCount, 1);
  t.same(report.violations, [newViolation]);
});
