import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import tap from 'tap';

const QUEST_ID = 'solver-terminal-integrity-red-test-bootstrap';
const W1_SCENARIO = 'solver-terminal-integrity-cutover';
const REPORT_DIR = path.join('test-output', 'reports');
const PRE_FIX_EVIDENCE_PATH = path.join(
  REPORT_DIR,
  `${QUEST_ID}.report.json`,
);
const POST_FIX_EVIDENCE_PATH = path.join(
  REPORT_DIR,
  `${W1_SCENARIO}-post-fix.report.json`,
);
const REQUIRED_GUARD_IDS = Object.freeze([
  'W1-GUARD-VIOLATION-RECORDED',
  'W1-GUARD-REJECTED-NOT-ATTEMPT',
  'W1-GUARD-REJECTED-NOT-SOLVED',
  'W1-GUARD-AUDIT-UNRESOLVED-VIOLATION',
  'W1-GUARD-TERMINAL-PROJECTION',
  'W1-GUARD-TERMINAL-NEXT-PROJECTION',
  'W1-GUARD-NON-MEASUREMENT-EVENT',
  'W1-GUARD-NON-MEASUREMENT-NOT-ATTEMPT',
  'W1-GUARD-OPERATOR-CANNOT-RESOLVE-VIOLATION',
  'W1-GUARD-LEGACY-HISTORY-UNVERIFIABLE',
  'W1-GUARD-MANUAL-STEP-REJECTED-NOT-TERMINAL',
  'W1-GUARD-MANUAL-STEP-NO-QUEST-EVENT',
  'W1-GUARD-NON-MEASURING-DONE-NOT-TERMINAL',
  'W1-GUARD-FRESH-ACCEPTED-SAMPLE-RESOLVES-BOUND-VIOLATION',
  'W1-GUARD-RESOLVED-VIOLATION-CLEARS-AUDIT',
  'W1-GUARD-HISTORICAL-VIOLATION-ATTEMPT-RECORDED',
  'W1-GUARD-HISTORICAL-VIOLATION-NOT-SOLVED',
  'W1-GUARD-MISSING-EVIDENCE-NOT-TERMINAL',
  'W1-GUARD-MISSING-EVIDENCE-NO-QUEST-EVENT',
  'W1-GUARD-STRICT-UPGRADE-CANNOT-LAUNDER-LEGACY-INTEGRITY',
  'W1-GUARD-ACCEPTED-CHANGEREF-IDENTITY-SEALED',
  'W1-GUARD-CHANGEREF-REPLACEMENT-DETECTED',
  'W1-GUARD-CHANGEREF-REPLACEMENT-BLOCKS-TERMINAL',
  'W1-GUARD-CHANGEREF-REPLACEMENT-NO-SOLVED-QUEST',
  'W1-GUARD-CHANGEREF-REPLACEMENT-BLOCKS-RUN-LOOP',
  'W1-GUARD-CHANGEREF-REPLACEMENT-BLOCKS-EXHAUSTED',
  'W1-GUARD-CHANGEREF-REPLACEMENT-NO-EXHAUSTED-QUEST',
  'W1-GUARD-MALFORMED-V2-VIOLATION-BLOCKS-TERMINAL',
  'W1-GUARD-MALFORMED-V2-VIOLATION-FAILS-AUDIT',
  'W1-GUARD-MALFORMED-V2-VIOLATION-BLOCKS-RUN-LOOP',
  'W1-GUARD-MALFORMED-V2-VIOLATION-BLOCKS-EXHAUSTED',
  'W1-GUARD-MALFORMED-V2-VIOLATION-NO-EXHAUSTED-QUEST',
  'W1-GUARD-MISSING-CHANGEREF-IDENTITY-REJECTED',
  'W1-GUARD-MISSING-CHANGEREF-IDENTITY-NOT-ATTEMPT',
  'W1-GUARD-MISSING-CHANGEREF-IDENTITY-NOT-SOLVED',
]);
const EXPECTED_SIGNATURE = 'invalid_attempt_persisted_and_solved';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function emittedReportPath(stdout) {
  const match = String(stdout || '').match(/^report: (.+\.report\.json)$/mu);
  return match ? match[1] : null;
}

function failedGuardIds(output) {
  return REQUIRED_GUARD_IDS.filter((guardId) =>
    new RegExp(`not ok \\d+ - ${guardId}(?:\\s|$)`, 'u').test(output));
}

tap.test('W0-META fresh pre-fix terminal-integrity evidence', (t) => {
  const testedHead = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const childEnv = {...process.env};
  delete childEnv.NODE_TEST_CONTEXT;
  const guardResult = spawnSync(
    process.execPath,
    ['--test', 'test/solve/solver-terminal-integrity-cutover.test.js'],
    {encoding: 'utf8', env: childEnv},
  );
  const output = `${guardResult.stdout || ''}\n${guardResult.stderr || ''}`;
  const runnerStartedAtMs = Date.now();
  const runnerResult = spawnSync(
    process.execPath,
    ['scripts/run-solver-terminal-integrity-cutover-scenarios.js'],
    {encoding: 'utf8', env: childEnv},
  );

  const postFix = guardResult.status === 0;
  t.ok([0, 1].includes(guardResult.status),
    'W0-META-W1-GUARDS-HAVE-EXPECTED-EXIT');
  t.equal(runnerResult.status, postFix ? 0 : 1,
    'W0-META-W1-RUNNER-MATCHES-GUARD-STATE');
  for (const guardId of REQUIRED_GUARD_IDS) {
    t.match(output, new RegExp(guardId, 'u'), `W0-META-OBSERVED-${guardId}`);
  }
  const failedIds = failedGuardIds(output);
  if (postFix) {
    t.equal(failedIds.length, 0, 'W0-META-POST-FIX-NO-FAILED-GUARDS');
  } else {
    t.ok(failedIds.includes('W1-GUARD-REJECTED-NOT-ATTEMPT'),
      'W0-META-EXACT-REJECTED-ATTEMPT-FAILURE');
    t.ok(failedIds.includes('W1-GUARD-REJECTED-NOT-SOLVED'),
      'W0-META-EXACT-REJECTED-SOLVED-FAILURE');
  }

  const baselineReport = emittedReportPath(runnerResult.stdout);
  t.ok(baselineReport, 'W0-META-W1-BASELINE-REPORT-WRITTEN');
  t.ok(fs.statSync(baselineReport).mtimeMs >= runnerStartedAtMs,
    'W0-META-W1-BASELINE-REPORT-IS-FRESH');
  const baseline = JSON.parse(fs.readFileSync(baselineReport, 'utf8'));
  t.equal(baseline.scenario, W1_SCENARIO, 'W0-META-W1-BASELINE-SCENARIO');
  t.equal(baseline.summary.failed, postFix ? 0 : 1,
    'W0-META-W1-BASELINE-MATCHES-GUARD-STATE');

  const evidence = {
    questId: QUEST_ID,
    metaTestId: 'W0-META',
    classification: postFix ?
      'terminal_integrity_guards_green' : EXPECTED_SIGNATURE,
    timestamp: new Date().toISOString(),
    testedHead,
    requiredGuardIds: REQUIRED_GUARD_IDS,
    observedGuardIds: REQUIRED_GUARD_IDS.filter((id) => output.includes(id)),
    guardExitStatus: guardResult.status,
    runnerExitStatus: runnerResult.status,
    failedGuardIds: failedIds,
    guardOutputSha256: sha256(output),
    runnerOutputSha256: sha256(
      `${runnerResult.stdout || ''}\n${runnerResult.stderr || ''}`,
    ),
    baselineReport,
    baselineReportTimestamp: baseline.timestamp,
    baselineReportSha256: sha256(fs.readFileSync(baselineReport)),
  };
  fs.mkdirSync(REPORT_DIR, {recursive: true});
  fs.writeFileSync(
    postFix ? POST_FIX_EVIDENCE_PATH : PRE_FIX_EVIDENCE_PATH,
    JSON.stringify(evidence, null, 2),
  );
  t.equal(evidence.observedGuardIds.length, REQUIRED_GUARD_IDS.length,
    'W0-META-ALL-REQUIRED-GUARDS-OBSERVED');
  t.end();
});
