import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from '../../src/test-helpers/tap.js';
import {
  DECISION_BASELINE_FILE_URL,
  FILE_CLASS,
  TIMER_ONLY_BASELINE_CEILING,
  VIOLATION_KIND,
  buildDecisionBoundaryViolationIdentity,
  checkTimerOnlyBaselineCeiling,
  classifyFilePath,
  collectDecisionBoundaryViolations,
  collectDecisionBoundaryViolationsFromSource,
  collectDecisionBoundaryViolationsWithBaseline,
  collectNamedWaitConstants,
  collectRefutedDeadClaims,
  withoutUnbaselinableWaitAllowances,
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
    'const TIMEOUTS = {X_TIMEOUT_MS: \'config.xTimeoutMs\'};',
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

test('object-member bounds are governed like named constants', async (t) => {
  t.same(waitKinds([
    'export const REPLICA_HANDLER_DEFAULT = Object.freeze({',
    '  // ends-on: the voter reports ready',
    '  SYNC_TIMEOUT_MS: TIME_MS.MINUTE,',
    '  REMOVAL_CONSENSUS_EXIT_BACKSTOP_MS: TIME_MS.SECOND * 30,',
    '  NESTED: {',
    '    MOVE_TIMEOUT_MS: 5000, // ends-on: the move operation completes',
    '    STEP_DEADLINE_MS: 5000,',
    '  },',
    '});',
    'const PLAIN = {',
    '  QUERY_TIMEOUT_MS: 30000,',
    '  PING_TIMEOUT_MS: 1, // ends-on: n/a clamp',
    '};',
  ].join('\n')), [
    ['REPLICA_HANDLER_DEFAULT.REMOVAL_CONSENSUS_EXIT_BACKSTOP_MS',
      VIOLATION_KIND.WAIT_CONSTANT_UNDECLARED],
    ['REPLICA_HANDLER_DEFAULT.NESTED.STEP_DEADLINE_MS',
      VIOLATION_KIND.WAIT_CONSTANT_UNDECLARED],
    ['PLAIN.QUERY_TIMEOUT_MS', VIOLATION_KIND.WAIT_CONSTANT_UNDECLARED],
  ], 'Object.freeze, plain and nested members; the comment above or on the ' +
    'member line declares it');
  t.same(waitKinds([
    'const NAMES = Object.freeze({',
    '  QUERY_TIMEOUT_MS: \'query.timeoutMs\',',
    '  TIMEOUT: \'timeout\',',
    '  ALIAS_TIMEOUT_MS: OTHER_DEFAULT.RPC_TIMEOUT_MS,',
    '  OTHER_TIMEOUT_MS,',
    '  CACHE_WAIT_TIMEOUT: (key) => `wait ${key}`,',
    '  SHARD_DEADLINE: \'passed before \' + \'admission\',',
    '});',
  ].join('\n')), [],
  'key names, codes, aliases of a governed name and message builders are ' +
    'not bounds');
});

test('the declaration holes are closed', async (t) => {
  t.same(waitKinds('const A_TIMEOUT_MS = 1; // ends-on: n/a\n'), [
    ['A_TIMEOUT_MS', VIOLATION_KIND.WAIT_CONSTANT_UNKNOWN_NON_WAIT_KIND],
  ], 'a bare n/a names no kind');
  for (const timer of ['Timer', 'the timer', 'its timer', 'THE TIMER fires']) {
    t.same(waitKinds(`const A_TIMEOUT_MS = 1; // ends-on: ${timer}\n`), [
      ['A_TIMEOUT_MS', VIOLATION_KIND.WAIT_CONSTANT_TIMER_ONLY],
    ], `"${timer}" is the timer`);
  }
  for (const vague of ['x', 'reply arrives', '. . .']) {
    t.same(waitKinds(`const A_TIMEOUT_MS = 1; // ends-on: ${vague}\n`), [
      ['A_TIMEOUT_MS', VIOLATION_KIND.WAIT_CONSTANT_EVENT_UNNAMED],
    ], `"${vague}" names no event`);
  }
  t.same(waitKinds('let LET_TIMEOUT_MS = 1;\nvar VAR_DEADLINE_MS = 1;\n'), [
    ['LET_TIMEOUT_MS', VIOLATION_KIND.WAIT_CONSTANT_UNDECLARED],
    ['VAR_DEADLINE_MS', VIOLATION_KIND.WAIT_CONSTANT_UNDECLARED],
  ], 'let and var declarations are governed');
  t.same(waitKinds([
    'const CONNECT_TIMEOUT = 5000;',
    'const EXIT_BACKSTOP = TIME_MS.SECOND * 30;',
    'const CAUSE_TIMEOUT = \'timeout\';',
    'const ERROR_TIMEOUT = OTHER_CAUSE_TIMEOUT;',
    'const MEMBERS = {RPC_TIMEOUT: 5000};',
  ].join('\n')), [
    ['CONNECT_TIMEOUT', VIOLATION_KIND.WAIT_CONSTANT_UNDECLARED],
    ['EXIT_BACKSTOP', VIOLATION_KIND.WAIT_CONSTANT_UNDECLARED],
    ['MEMBERS.RPC_TIMEOUT', VIOLATION_KIND.WAIT_CONSTANT_UNDECLARED],
  ], 'a *_TIMEOUT name without _MS is governed when it holds a bound');
});

test('the timebox, dead and misnamed non-wait kinds pass; skip is not one',
  async (t) => {
    t.same(waitKinds([
      '// ends-on: n/a timebox (the designed exit of a best-effort step)',
      'const STEP_TIMEOUT_MS = 3000;',
      'const UNUSED_TIMEOUT_MS = 1; // ends-on: n/a dead',
      'const N_TIMEOUT_MS = 1; // ends-on: N/A clamp',
      'const L = {SQL_QUERY_TIMEOUT_MS: 100}; ' +
        '// ends-on: n/a misnamed (a SQL preview length, not a time)',
    ].join('\n')), []);
    for (const bare of ['n/a misnamed', 'n/a misnamed (a length)']) {
      t.same(waitKinds(`const M_TIMEOUT_MS = 1; // ends-on: ${bare}\n`), [
        ['M_TIMEOUT_MS', VIOLATION_KIND.WAIT_CONSTANT_MISNAMED_UNJUSTIFIED],
      ], `"${bare}" does not say what the value is`);
    }
    t.same(waitKinds('const S_TIMEOUT_MS = 1; // ends-on: n/a skip\n'), [
      ['S_TIMEOUT_MS', VIOLATION_KIND.WAIT_CONSTANT_UNKNOWN_NON_WAIT_KIND],
    ], 'skip is not a non-wait kind: a 1 ms delivery is still a wait');
  });

async function loadWaitBaselineEntries() {
  const baseline = JSON.parse(
    await fs.readFile(DECISION_BASELINE_FILE_URL, 'utf8'));
  return baseline.violations.filter((violation) =>
    violation.kind.startsWith('wait_constant'));
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

test('the shared baseline admits only timer-only waits', async (t) => {
  const violations = collectDecisionBoundaryViolationsFromSource(
    'const OLD_TIMEOUT_MS = 5; // ends-on: timer\n' +
    'const UNDECLARED_TIMEOUT_MS = 5;\n' +
    'const KIND_TIMEOUT_MS = 5; // ends-on: n/a\n' +
    'const VAGUE_TIMEOUT_MS = 5; // ends-on: x\n',
    WAIT_RULE_FILE,
  );
  const allowances = new Map(violations.map((violation) =>
    [buildDecisionBoundaryViolationIdentity(violation), 1]));
  const report = applyCountBaseline(
    {totalViolationCount: violations.length, violations},
    withoutUnbaselinableWaitAllowances(allowances),
    buildDecisionBoundaryViolationIdentity,
  );
  t.same(report.violations.map((violation) => violation.functionName),
    ['UNDECLARED_TIMEOUT_MS', 'KIND_TIMEOUT_MS', 'VAGUE_TIMEOUT_MS'],
    'an undeclared, unknown-kind or unnamed-event entry is no allowance');
});

// One-way: the baseline may only shrink (the ceiling is the audit's own,
// TIMER_ONLY_BASELINE_CEILING). Only timer-only waits may enter the shared
// decision-boundary baseline: an undeclared wait, an unknown non-wait kind or
// an unnamed event can never be baselined.

test('the timer-only baseline cannot grow and holds no stale entry',
  async (t) => {
    const entries = await loadWaitBaselineEntries();
    t.same(entries
      .filter((entry) => entry.kind !== VIOLATION_KIND.WAIT_CONSTANT_TIMER_ONLY)
      .map((entry) => `${entry.filePath}:${entry.functionName}`), [],
    'only timer-only waits are baselined');
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
    const textScan = /\b(?:const|let|var)\s+((?:[A-Z0-9]+_)*(?:TIMEOUT|BACKSTOP|DEADLINE)(?:_[A-Z0-9]+)*_MS)\b/gu;
    const fromText = new Set();
    const fromAudit = new Set();
    const undeclared = [];
    let memberCount = 0;
    for (const filePath of await listSourceFiles('src')) {
      const source = await fs.readFile(filePath, 'utf8');
      for (const match of source.matchAll(textScan)) {
        fromText.add(`${filePath}:${match[1]}`);
      }
      if (!/(?:TIMEOUT|BACKSTOP|DEADLINE)/u.test(source)) {
        continue;
      }
      for (const constant of collectNamedWaitConstants(source, filePath)) {
        if (constant.member) {
          memberCount += 1;
        } else if (constant.name.endsWith('_MS')) {
          fromAudit.add(`${filePath}:${constant.name}`);
        }
        if (constant.kind !== VIOLATION_KIND.WAIT_CONSTANT_DECLARED &&
            constant.kind !== VIOLATION_KIND.WAIT_CONSTANT_TIMER_ONLY) {
          undeclared.push(`${filePath}:${constant.name}`);
        }
      }
    }
    t.ok(fromAudit.size > 0, `the audit derives ${fromAudit.size} constants`);
    t.ok(memberCount > 50, `the audit derives ${memberCount} object members`);
    t.same([...fromAudit].sort(), [...fromText].sort(),
      'the audit set equals an independent text scan of src/');
    t.same(undeclared, [], 'every named wait in src/ declares its end');
  });

test('a timer expiry named anywhere in the event is the timer', async (t) => {
  for (const timer of [
    'when the timer fires',
    'on timer expiry the step is cut',
    'the request timeout elapses first',
    'the deadline expires before any reply',
  ]) {
    t.same(waitKinds(`const A_TIMEOUT_MS = 1; // ends-on: ${timer}\n`), [
      ['A_TIMEOUT_MS', VIOLATION_KIND.WAIT_CONSTANT_TIMER_ONLY],
    ], `"${timer}" is the timer`);
  }
  for (const event of [
    'the heartbeat timer delivers a fresh lease',
    'the peer acknowledges the deadline request',
  ]) {
    t.same(waitKinds(`const A_TIMEOUT_MS = 1; // ends-on: ${event}\n`), [],
      `"${event}" names another timer-driven subject`);
  }
});

async function writeReferenceFixture(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dead-claims-'));
  const sourceRoot = path.join(root, 'src');
  await fs.mkdir(sourceRoot, {recursive: true});
  for (const [name, text] of Object.entries(files)) {
    await fs.writeFile(path.join(sourceRoot, name), text);
  }
  return sourceRoot;
}

const DEAD_CLAIM_CONSTANTS = [
  'export const OWNER = Object.freeze({',
  '  // ends-on: n/a dead (nothing reads it)',
  '  UNREAD_TIMEOUT_MS: 1,',
  '  // ends-on: n/a dead (claimed dead, read by reader.js)',
  '  READ_TIMEOUT_MS: 1,',
  '  NESTED: {',
  '    // ends-on: n/a dead (claimed dead, read through a computed key)',
  '    KEYED_TIMEOUT_MS: 1,',
  '  },',
  '});',
  'export const ESCAPES = {',
  '  // ends-on: n/a dead (claimed dead, read after the object escapes)',
  '  ESCAPED_TIMEOUT_MS: 1,',
  '};',
  '// ends-on: n/a dead (claimed dead, read below)',
  'const LOCAL_DEADLINE_MS = 1;',
  'export const twice = LOCAL_DEADLINE_MS * 2;',
].join('\n');

const DEAD_CLAIM_READER = [
  'import {OWNER, ESCAPES} from \'./constants.js\';',
  'const FIELD = \'KEYED_TIMEOUT_MS\';',
  'export const read = OWNER.READ_TIMEOUT_MS;',
  'export const keyed = OWNER.NESTED[FIELD];',
  'const bag = {ESCAPES};',
  'export const escaped = bag.ESCAPES.ESCAPED_TIMEOUT_MS;',
  'export const unrelated = {UNREAD_TIMEOUT_MS: 5}.UNREAD_TIMEOUT_MS;',
].join('\n');

test('an n/a dead claim is checked against every reference in src/',
  async (t) => {
    const sourceRoot = await writeReferenceFixture({
      'constants.js': DEAD_CLAIM_CONSTANTS,
      'reader.js': DEAD_CLAIM_READER,
    });
    const report = await collectDecisionBoundaryViolations(
      [path.join(sourceRoot, 'constants.js')],
      {referenceRoots: [sourceRoot]},
    );
    t.same(report.violations
      .filter((violation) => violation.kind.startsWith('wait_constant'))
      .map((violation) => [violation.functionName, violation.kind]), [
      ['OWNER.READ_TIMEOUT_MS', VIOLATION_KIND.WAIT_CONSTANT_DEAD_REFERENCED],
      ['OWNER.NESTED.KEYED_TIMEOUT_MS',
        VIOLATION_KIND.WAIT_CONSTANT_DEAD_REFERENCED],
      ['ESCAPES.ESCAPED_TIMEOUT_MS',
        VIOLATION_KIND.WAIT_CONSTANT_DEAD_REFERENCED],
      ['LOCAL_DEADLINE_MS', VIOLATION_KIND.WAIT_CONSTANT_DEAD_REFERENCED],
    ], 'a direct, computed, escaped or declarator read refutes the claim; ' +
      'a same-named key on an unrelated object does not');
    await fs.rm(path.dirname(sourceRoot), {recursive: true, force: true});
  });

test('the live removal backstop cannot be declared dead', async (t) => {
  const filePath = 'src/node/replica-handler-constants.js';
  const source = (await fs.readFile(filePath, 'utf8')).replace(
    /\n(\s*)REMOVAL_CONSENSUS_EXIT_BACKSTOP_MS:/u,
    '\n$1// ends-on: n/a dead (a false claim)\n$1' +
      'REMOVAL_CONSENSUS_EXIT_BACKSTOP_MS:',
  );
  const claims = collectNamedWaitConstants(source, filePath).filter(
    (constant) =>
      constant.name === 'REPLICA_HANDLER_DEFAULT.REMOVAL_CONSENSUS_EXIT_BACKSTOP_MS');
  t.equal(claims.length, 1, 'the false claim is read');
  t.same((await collectRefutedDeadClaims(claims, ['src']))
    .map((violation) => violation.kind),
  [VIOLATION_KIND.WAIT_CONSTANT_DEAD_REFERENCED], 'src/ refutes it');
});

test('the audit itself refuses a timer-only baseline above its ceiling',
  async (t) => {
    const allowance = (name) => [buildDecisionBoundaryViolationIdentity({
      filePath: 'src/x.js',
      functionName: name,
      kind: VIOLATION_KIND.WAIT_CONSTANT_TIMER_ONLY,
    }), 1];
    const atCeiling = new Map(Array.from(
      {length: TIMER_ONLY_BASELINE_CEILING},
      (_, index) => allowance(`T${index}_TIMEOUT_MS`)));
    t.same(checkTimerOnlyBaselineCeiling(atCeiling), [], 'at the ceiling');
    const above = new Map([...atCeiling, allowance('GROWN_TIMEOUT_MS')]);
    t.same(checkTimerOnlyBaselineCeiling(above)
      .map((violation) => violation.kind),
    [VIOLATION_KIND.WAIT_CONSTANT_BASELINE_CEILING], 'one above it is red');
    t.equal(TIMER_ONLY_BASELINE_CEILING, 2,
      'the ceiling holds exactly the two cold-reconnect constants');
    const sourceRoot = await writeReferenceFixture({'empty.js': '\n'});
    const baselinePath = path.join(path.dirname(sourceRoot), 'baseline.json');
    await fs.writeFile(baselinePath, JSON.stringify({
      version: 1,
      violations: [...above.keys()].map((identity) => {
        const [filePath, functionName, kind] = JSON.parse(identity);
        return {filePath, functionName, kind};
      }),
    }));
    const report = await collectDecisionBoundaryViolationsWithBaseline(
      [sourceRoot],
      {baselineFileUrl: baselinePath, referenceRoots: [sourceRoot]},
    );
    t.same(report.violations.map((violation) => violation.kind),
      [VIOLATION_KIND.WAIT_CONSTANT_BASELINE_CEILING],
      'the baselined audit run itself is red');
    await fs.rm(path.dirname(sourceRoot), {recursive: true, force: true});
  });
