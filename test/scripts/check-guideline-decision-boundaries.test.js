import fs from 'node:fs/promises';
import path from 'node:path';
import {test} from '../../src/test-helpers/tap.js';
import {
  DECISION_BASELINE_FILE_URL,
  FILE_CLASS,
  VIOLATION_KIND,
  buildDecisionBoundaryViolationIdentity,
  classifyFilePath,
  collectDecisionBoundaryViolationsFromSource,
  collectNamedWaitConstants,
} from '../../scripts/check-guideline-decision-boundaries.js';
import {applyCountBaseline} from '../../scripts/guideline-check-shared.js';

test('classifyFilePath recognizes runtime and test files', async (t) => {
  t.equal(
    classifyFilePath('/repo/src/runtime/readiness-owner.js'),
    FILE_CLASS.RUNTIME,
  );
  t.equal(
    classifyFilePath('/repo/test/runtime/readiness-owner.test.js'),
    FILE_CLASS.TEST,
  );
});

test('detects repeated semantic assignments across independent if statements',
  async (t) => {
    const violations = collectDecisionBoundaryViolationsFromSource(
      [
        'export function resolve(snapshot) {',
        '  let readinessState = deriveBaseline(snapshot);',
        '  if (snapshot.localReady) {',
        '    readinessState = computeReadyState(snapshot);',
        '  }',
        '  if (snapshot.recoveryPending) {',
        '    readinessState = computePendingState(snapshot);',
        '  }',
        '  if (snapshot.failed) {',
        '    readinessState = computeFailedState(snapshot);',
        '  }',
        '  return readinessState;',
        '}',
      ].join('\n'),
      '/repo/src/bootstrap/readiness-owner.js',
    );

    t.equal(violations.length, 1);
    t.equal(
      violations[0].kind,
      'independent_if_semantic_assignment',
    );
    t.match(violations[0].target, /readinessState/);
  });

test('detects semantic outcome objects returned from independent if statements',
  async (t) => {
    const violations = collectDecisionBoundaryViolationsFromSource(
      [
        'export function decide(snapshot) {',
        '  if (snapshot.ready) {',
        '    return {kind: resolveKind(snapshot), reason: resolveReason(snapshot)};',
        '  }',
        '  if (snapshot.failed) {',
        '    return {kind: resolveFailureKind(snapshot), reason: resolveFailureReason(snapshot)};',
        '  }',
        '  return {kind: deriveFallbackKind(snapshot)};',
        '}',
      ].join('\n'),
      '/repo/src/control-plane/startup-authority.js',
    );

    t.equal(violations.length, 1);
    t.equal(
      violations[0].kind,
      'independent_if_semantic_returns',
    );
    t.match(violations[0].target, /kind/);
    t.match(violations[0].target, /reason/);
  });

test('ignores local validation guards that do not build semantic outcomes',
  async (t) => {
    const violations = collectDecisionBoundaryViolationsFromSource(
      [
        'export function parseInput(value) {',
        '  if (!value) {',
        '    throw new Error(resolveMissingValueMessage());',
        '  }',
        '  if (value.length > maxAllowedLength()) {',
        '    throw new Error(resolveTooLongMessage());',
        '  }',
        '  return normalizeValue(value);',
        '}',
      ].join('\n'),
      '/repo/src/runtime/parser.js',
    );

    t.equal(violations.length, 0);
  });

test('ignores else-if chains because they are not independent if statements',
  async (t) => {
    const violations = collectDecisionBoundaryViolationsFromSource(
      [
        'export function decide(snapshot) {',
        '  if (snapshot.ready) {',
        '    return {kind: resolveReadyKind(snapshot)};',
        '  } else if (snapshot.failed) {',
        '    return {kind: resolveFailedKind(snapshot)};',
        '  }',
        '  return {kind: resolveFallbackKind(snapshot)};',
        '}',
      ].join('\n'),
      '/repo/src/runtime/decision-owner.js',
    );

    t.equal(violations.length, 0);
  });

test('skips test files by default', async (t) => {
  const violations = collectDecisionBoundaryViolationsFromSource(
    [
      'test(\'decision\', async () => {',
      '  if (fixture.ready) {',
      '    return {kind: resolveReadyKind(fixture)};',
      '  }',
      '  if (fixture.failed) {',
      '    return {kind: resolveFailedKind(fixture)};',
      '  }',
      '});',
    ].join('\n'),
    '/repo/test/runtime/decision-owner.test.js',
  );

  t.equal(violations.length, 0);
});

test('detects raw null/undefined/empty-array assigned or returned to/from semantic targets', async (t) => {
  const violationsNullReturn = collectDecisionBoundaryViolationsFromSource(
    [
      'export function deriveState() {',
      '  return null;',
      '}',
    ].join('\n'),
    '/repo/src/runtime/state-helper.js',
  );
  t.equal(violationsNullReturn.filter((v) => v.kind === 'raw_null_empty_state_outcome').length, 1);

  const violationsPropNull = collectDecisionBoundaryViolationsFromSource(
    [
      'export function decide() {',
      '  return { outcome: null };',
      '}',
    ].join('\n'),
    '/repo/src/runtime/state-helper.js',
  );
  t.equal(violationsPropNull.filter((v) => v.kind === 'raw_null_empty_state_outcome').length, 1);

  const violationsUndefinedAssign = collectDecisionBoundaryViolationsFromSource(
    [
      'export function check() {',
      '  let status = undefined;',
      '}',
    ].join('\n'),
    '/repo/src/runtime/state-helper.js',
  );
  t.equal(violationsUndefinedAssign.filter((v) => v.kind === 'raw_null_empty_state_outcome').length, 1);

  const violationsEmptyArrayAssign = collectDecisionBoundaryViolationsFromSource(
    [
      'export function check() {',
      '  let outcome = [];',
      '}',
    ].join('\n'),
    '/repo/src/runtime/state-helper.js',
  );
  t.equal(violationsEmptyArrayAssign.filter((v) => v.kind === 'raw_null_empty_state_outcome').length, 1);

  const compliantOutcome = collectDecisionBoundaryViolationsFromSource(
    [
      'export function decide() {',
      '  let outcome = "success";',
      '  return { status: "ready" };',
      '}',
    ].join('\n'),
    '/repo/src/runtime/state-helper.js',
  );
  t.equal(compliantOutcome.filter((v) => v.kind === 'raw_null_empty_state_outcome').length, 0);
});

test('detects mixed cache and SQL accesses in a decision function', async (t) => {
  const violationsMixed = collectDecisionBoundaryViolationsFromSource(
    [
      'export function checkStatus() {',
      '  const cached = myCache.get("key");',
      '  const row = db.query("SELECT 1");',
      '}',
    ].join('\n'),
    '/repo/src/runtime/decision-maker.js',
  );
  t.equal(violationsMixed.filter((v) => v.kind === 'mixed_cache_and_sql_decision').length, 1);

  const compliantCacheOnly = collectDecisionBoundaryViolationsFromSource(
    [
      'export function checkStatus() {',
      '  const cached = myCache.get("key");',
      '}',
    ].join('\n'),
    '/repo/src/runtime/decision-maker.js',
  );
  t.equal(compliantCacheOnly.filter((v) => v.kind === 'mixed_cache_and_sql_decision').length, 0);

  const compliantSqlOnly = collectDecisionBoundaryViolationsFromSource(
    [
      'export function checkStatus() {',
      '  const row = db.query("SELECT 1");',
      '}',
    ].join('\n'),
    '/repo/src/runtime/decision-maker.js',
  );
  t.equal(compliantSqlOnly.filter((v) => v.kind === 'mixed_cache_and_sql_decision').length, 0);
});

test('detects schema-unsafe INSERT OR REPLACE / REPLACE INTO system table writes', async (t) => {
  const violationsReplace = collectDecisionBoundaryViolationsFromSource(
    [
      'const query = "INSERT OR REPLACE INTO system_metadata VALUES (1)";',
    ].join('\n'),
    '/repo/src/runtime/db.js',
  );
  t.equal(violationsReplace.filter((v) => v.kind === 'schema_unsafe_system_table_write').length, 1);

  const compliantInsert = collectDecisionBoundaryViolationsFromSource(
    [
      'const query = "INSERT INTO system_metadata VALUES (1)";',
    ].join('\n'),
    '/repo/src/runtime/db.js',
  );
  t.equal(compliantInsert.filter((v) => v.kind === 'schema_unsafe_system_table_write').length, 0);
});

test('detects local retry loops using setTimeout/setInterval or loops', async (t) => {
  const violationsTimeoutRetry = collectDecisionBoundaryViolationsFromSource(
    [
      'export function schedule() {',
      '  setTimeout(() => {',
      '    retryCount++;',
      '  }, 100);',
      '}',
    ].join('\n'),
    '/repo/src/runtime/runner.js',
  );
  t.equal(violationsTimeoutRetry.filter((v) => v.kind === 'local_retry_loop').length, 1);

  const violationsWhileRetry = collectDecisionBoundaryViolationsFromSource(
    [
      'export function loop() {',
      '  while (shouldRetry) {',
      '    doSomething();',
      '  }',
      '}',
    ].join('\n'),
    '/repo/src/runtime/runner.js',
  );
  t.equal(violationsWhileRetry.filter((v) => v.kind === 'local_retry_loop').length, 1);

  const compliantTimeout = collectDecisionBoundaryViolationsFromSource(
    [
      'export function schedule() {',
      '  setTimeout(() => {',
      '    console.log("tick");',
      '  }, 100);',
      '}',
    ].join('\n'),
    '/repo/src/runtime/runner.js',
  );
  t.equal(compliantTimeout.filter((v) => v.kind === 'local_retry_loop').length, 0);
});

// Named waits declare their ending event (owner rule 2026-10-04). The rule
// lives inside this guideline audit; these witnesses pin its four refusals,
// the one-way baseline, and that the governed set is derived from src/.

const WAIT_RULE_FILE = '/repo/src/runtime/waits.js';

function waitKinds(source, filePath = WAIT_RULE_FILE) {
  return collectDecisionBoundaryViolationsFromSource(source, filePath)
    .filter((violation) => violation.kind.startsWith('wait_constant'))
    .map((violation) => [violation.functionName, violation.kind]);
}

test('a named wait constant without an ends-on declaration fails', async (t) => {
  t.same(waitKinds('const VOTER_READY_TIMEOUT_MS = 60000;\n'), [
    ['VOTER_READY_TIMEOUT_MS', VIOLATION_KIND.WAIT_CONSTANT_UNDECLARED],
  ]);
  t.same(waitKinds('// a comment that declares nothing\n' +
    'export const EXIT_BACKSTOP_MS = 30000;\n'), [
    ['EXIT_BACKSTOP_MS', VIOLATION_KIND.WAIT_CONSTANT_UNDECLARED],
  ]);
  t.same(waitKinds('const DEFAULT_DEADLINE_MS = 1; // ends-on:\n'), [
    ['DEFAULT_DEADLINE_MS', VIOLATION_KIND.WAIT_CONSTANT_UNDECLARED],
  ], 'an empty declaration is no declaration');
});

test('a wait whose only exit is the timer fails', async (t) => {
  t.same(waitKinds('const X_TIMEOUT_MS = 5; // ends-on: timer\n'), [
    ['X_TIMEOUT_MS', VIOLATION_KIND.WAIT_CONSTANT_TIMER_ONLY],
  ]);
});

test('a declared wait or an enumerated non-wait kind passes', async (t) => {
  t.same(waitKinds([
    '// ends-on: the voter reports ready',
    'const VOTER_READY_TIMEOUT_MS = 60000;',
    '// Multi-line note above.',
    '// ends-on: the replica leaves the consensus group',
    'export const EXIT_BACKSTOP_MS = 30000;',
    'const A_DEADLINE_MS =',
    '  5; // not this line',
    'const B_TIMEOUT_MIN_MS = 1; // ends-on: n/a clamp',
    'const C_TIMEOUT_LOOKBACK_MS = 1; // ends-on: n/a lookback',
    'const NOT_A_WAIT_MS = 1;',
    'const TIMEOUTS = {X_TIMEOUT_MS: 1};',
  ].join('\n')), [
    ['A_DEADLINE_MS', VIOLATION_KIND.WAIT_CONSTANT_UNDECLARED],
  ], 'only the undeclared one fails; non-matching names are not governed');
  t.same(waitKinds('const A_DEADLINE_MS = // ends-on: the reply arrives\n  5;\n'),
    [], 'a declaration on the first line of a multi-line const passes');
  t.same(waitKinds('const Y_TIMEOUT_MS = 1; // ends-on: n/a whatever\n'), [
    ['Y_TIMEOUT_MS', VIOLATION_KIND.WAIT_CONSTANT_UNKNOWN_NON_WAIT_KIND],
  ], 'a non-wait kind outside the enumeration fails');
  t.same(waitKinds('const Z_TIMEOUT_MS = 1;\n', '/repo/scripts/tool.js'), [],
    'the rule governs src/ only');
});

async function loadTimerOnlyBaseline() {
  const baseline = JSON.parse(
    await fs.readFile(DECISION_BASELINE_FILE_URL, 'utf8'));
  return baseline.violations.filter((violation) =>
    violation.kind === VIOLATION_KIND.WAIT_CONSTANT_TIMER_ONLY);
}

test('timer-only constants pass only through the baseline', async (t) => {
  const violations = collectDecisionBoundaryViolationsFromSource(
    'const OLD_TIMEOUT_MS = 5; // ends-on: timer\n' +
    'const NEW_TIMEOUT_MS = 5; // ends-on: timer\n',
    WAIT_RULE_FILE,
  );
  const baselined = violations.filter((violation) =>
    violation.functionName === 'OLD_TIMEOUT_MS');
  const allowances = new Map(baselined.map((violation) =>
    [buildDecisionBoundaryViolationIdentity(violation), 1]));
  const report = applyCountBaseline(
    {totalViolationCount: violations.length, violations},
    allowances,
    buildDecisionBoundaryViolationIdentity,
  );
  t.same(report.violations.map((violation) => violation.functionName),
    ['NEW_TIMEOUT_MS'], 'an unbaselined timer-only wait still fails');
});

// One-way: the baseline may only shrink. Lower this ceiling when an entry is
// removed; never raise it.
const TIMER_ONLY_BASELINE_CEILING = 0;

test('the timer-only baseline cannot grow and holds no stale entry',
  async (t) => {
    const entries = await loadTimerOnlyBaseline();
    t.ok(entries.length <= TIMER_ONLY_BASELINE_CEILING,
      `timer-only baseline ${entries.length} <= ${TIMER_ONLY_BASELINE_CEILING}`);
    for (const entry of entries) {
      const source = await fs.readFile(entry.filePath, 'utf8');
      const live = collectNamedWaitConstants(source, entry.filePath)
        .filter((constant) => constant.name === entry.functionName &&
          constant.kind === VIOLATION_KIND.WAIT_CONSTANT_TIMER_ONLY);
      t.equal(live.length, 1,
        `${entry.functionName} is still timer-only in ${entry.filePath}; ` +
        'a fixed one leaves the baseline');
    }
  });

async function listSourceFiles(directory) {
  const entries = await fs.readdir(directory, {withFileTypes: true});
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listSourceFiles(entryPath));
    } else if (entry.name.endsWith('.js')) {
      files.push(entryPath);
    }
  }
  return files;
}

test('the governed set is derived from src/, and every member is declared',
  async (t) => {
    const textScan = /\bconst\s+((?:[A-Z0-9]+_)*(?:TIMEOUT|BACKSTOP|DEADLINE)(?:_[A-Z0-9]+)*_MS)\s*=/gu;
    const fromText = new Set();
    const fromAudit = new Set();
    const undeclared = [];
    for (const filePath of await listSourceFiles('src')) {
      const source = await fs.readFile(filePath, 'utf8');
      for (const match of source.matchAll(textScan)) {
        fromText.add(`${filePath}:${match[1]}`);
      }
      if (!/(?:TIMEOUT|BACKSTOP|DEADLINE)/u.test(source)) {
        continue;
      }
      for (const constant of collectNamedWaitConstants(source, filePath)) {
        fromAudit.add(`${filePath}:${constant.name}`);
        if (constant.kind === VIOLATION_KIND.WAIT_CONSTANT_UNDECLARED ||
            constant.kind ===
              VIOLATION_KIND.WAIT_CONSTANT_UNKNOWN_NON_WAIT_KIND) {
          undeclared.push(`${filePath}:${constant.name}`);
        }
      }
    }
    t.ok(fromAudit.size > 0, `the audit derives ${fromAudit.size} constants`);
    t.same([...fromAudit].sort(), [...fromText].sort(),
      'the audit set equals an independent text scan of src/');
    t.same(undeclared, [], 'every named wait in src/ declares its end');
  });
