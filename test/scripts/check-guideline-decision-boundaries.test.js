import {test} from '../../src/test-helpers/tap.js';
import {
  FILE_CLASS,
  classifyFilePath,
  collectDecisionBoundaryViolationsFromSource,
} from '../../scripts/check-guideline-decision-boundaries.js';

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
  t.equal(violationsNullReturn.filter(v => v.kind === 'raw_null_empty_state_outcome').length, 1);

  const violationsPropNull = collectDecisionBoundaryViolationsFromSource(
    [
      'export function decide() {',
      '  return { outcome: null };',
      '}',
    ].join('\n'),
    '/repo/src/runtime/state-helper.js',
  );
  t.equal(violationsPropNull.filter(v => v.kind === 'raw_null_empty_state_outcome').length, 1);

  const violationsUndefinedAssign = collectDecisionBoundaryViolationsFromSource(
    [
      'export function check() {',
      '  let status = undefined;',
      '}',
    ].join('\n'),
    '/repo/src/runtime/state-helper.js',
  );
  t.equal(violationsUndefinedAssign.filter(v => v.kind === 'raw_null_empty_state_outcome').length, 1);

  const violationsEmptyArrayAssign = collectDecisionBoundaryViolationsFromSource(
    [
      'export function check() {',
      '  let outcome = [];',
      '}',
    ].join('\n'),
    '/repo/src/runtime/state-helper.js',
  );
  t.equal(violationsEmptyArrayAssign.filter(v => v.kind === 'raw_null_empty_state_outcome').length, 1);

  const compliantOutcome = collectDecisionBoundaryViolationsFromSource(
    [
      'export function decide() {',
      '  let outcome = "success";',
      '  return { status: "ready" };',
      '}',
    ].join('\n'),
    '/repo/src/runtime/state-helper.js',
  );
  t.equal(compliantOutcome.filter(v => v.kind === 'raw_null_empty_state_outcome').length, 0);
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
  t.equal(violationsMixed.filter(v => v.kind === 'mixed_cache_and_sql_decision').length, 1);

  const compliantCacheOnly = collectDecisionBoundaryViolationsFromSource(
    [
      'export function checkStatus() {',
      '  const cached = myCache.get("key");',
      '}',
    ].join('\n'),
    '/repo/src/runtime/decision-maker.js',
  );
  t.equal(compliantCacheOnly.filter(v => v.kind === 'mixed_cache_and_sql_decision').length, 0);

  const compliantSqlOnly = collectDecisionBoundaryViolationsFromSource(
    [
      'export function checkStatus() {',
      '  const row = db.query("SELECT 1");',
      '}',
    ].join('\n'),
    '/repo/src/runtime/decision-maker.js',
  );
  t.equal(compliantSqlOnly.filter(v => v.kind === 'mixed_cache_and_sql_decision').length, 0);
});

test('detects schema-unsafe INSERT OR REPLACE / REPLACE INTO system table writes', async (t) => {
  const violationsReplace = collectDecisionBoundaryViolationsFromSource(
    [
      'const query = "INSERT OR REPLACE INTO system_metadata VALUES (1)";',
    ].join('\n'),
    '/repo/src/runtime/db.js',
  );
  t.equal(violationsReplace.filter(v => v.kind === 'schema_unsafe_system_table_write').length, 1);

  const compliantInsert = collectDecisionBoundaryViolationsFromSource(
    [
      'const query = "INSERT INTO system_metadata VALUES (1)";',
    ].join('\n'),
    '/repo/src/runtime/db.js',
  );
  t.equal(compliantInsert.filter(v => v.kind === 'schema_unsafe_system_table_write').length, 0);
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
  t.equal(violationsTimeoutRetry.filter(v => v.kind === 'local_retry_loop').length, 1);

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
  t.equal(violationsWhileRetry.filter(v => v.kind === 'local_retry_loop').length, 1);

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
  t.equal(compliantTimeout.filter(v => v.kind === 'local_retry_loop').length, 0);
});
