import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import tap from 'tap';

const QUEST_ID = 'solver-terminal-integrity-red-test-bootstrap';
const W1_SCENARIO = 'solver-terminal-integrity-cutover';
const REPORT_DIR = path.join('test-output', 'reports');
const EVIDENCE_PATH = path.join(
  REPORT_DIR,
  `${QUEST_ID}.report.json`,
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

  t.equal(guardResult.status, 1, 'W0-META-W1-GUARDS-ARE-RED');
  t.equal(runnerResult.status, 1, 'W0-META-W1-RUNNER-IS-RED');
  for (const guardId of REQUIRED_GUARD_IDS) {
    t.match(output, new RegExp(guardId, 'u'), `W0-META-OBSERVED-${guardId}`);
  }
  const failedIds = failedGuardIds(output);
  t.ok(failedIds.includes('W1-GUARD-REJECTED-NOT-ATTEMPT'),
    'W0-META-EXACT-REJECTED-ATTEMPT-FAILURE');
  t.ok(failedIds.includes('W1-GUARD-REJECTED-NOT-SOLVED'),
    'W0-META-EXACT-REJECTED-SOLVED-FAILURE');

  const baselineReport = emittedReportPath(runnerResult.stdout);
  t.ok(baselineReport, 'W0-META-W1-BASELINE-REPORT-WRITTEN');
  t.ok(fs.statSync(baselineReport).mtimeMs >= runnerStartedAtMs,
    'W0-META-W1-BASELINE-REPORT-IS-FRESH');
  const baseline = JSON.parse(fs.readFileSync(baselineReport, 'utf8'));
  t.equal(baseline.scenario, W1_SCENARIO, 'W0-META-W1-BASELINE-SCENARIO');
  t.equal(baseline.summary.failed, 1, 'W0-META-W1-BASELINE-FAILS');

  const evidence = {
    questId: QUEST_ID,
    metaTestId: 'W0-META',
    classification: EXPECTED_SIGNATURE,
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
  fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2));
  t.equal(evidence.observedGuardIds.length, REQUIRED_GUARD_IDS.length,
    'W0-META-ALL-REQUIRED-GUARDS-OBSERVED');
  t.end();
});
