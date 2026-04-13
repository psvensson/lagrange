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
