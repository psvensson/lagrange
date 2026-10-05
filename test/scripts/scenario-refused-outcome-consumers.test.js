/**
 * Every consumer of distributed scenario results reads a REFUSED (not run)
 * scenario - the config's host topology cannot carry its claim - as
 * neither a pass nor a failure (owner ruling 2026-10-04: "Insufficient
 * topology is REFUSED/NOT-RUN, never PASS and never certification
 * evidence"). One witness per consumer.
 */

import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync,
  writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';

import {
  SCENARIO_OUTCOME,
  buildRefusedScenarioResult,
  outcomeOfRunnerExit,
  resolveRunExitCode,
  scenarioOutcomeOf,
} from '../../test/distributed/harness/scenario-outcome.js';
import {EXIT_CODES} from '../../test/distributed/harness/constants.js';
import {
  ReportWriter,
  computeSummary,
} from '../../test/distributed/harness/report-writer.js';
import {
  writeFailureBundlesForReport,
} from '../../test/distributed/harness/failure-bundle.js';
import {scenarioHarnessProbe} from '../../scripts/solve/probes.js';
import {classifyStatGateScenario} from '../../scripts/rolling-restart-stat-gate-summary.js';
import {run} from '../../scripts/lab/process.js';
import {
  buildRemoteConfig,
  observeMachineIdentities,
} from '../../scripts/lab/harness.js';
import {
  resolveConfigHostTopology,
} from '../../test/distributed/harness/scenario-host-topology.js';

const SCENARIO = 'public-path-multinode-baseline';
const REFUSAL = Object.freeze({available: null, hostIds: [],
  missingReasons: ['host_topology_undeclared'],
  reason: 'refused_insufficient_host_topology', required: 2,
  spreadUnit: 'host'});

function refusedEntry() {
  const writer = new ReportWriter('/tmp/unused.json');
  writer.addResult(SCENARIO, buildRefusedScenarioResult(REFUSAL,
    '2026-10-04T00:00:00.000Z'));
  return writer.scenarios[0];
}

function scratch(t, prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, {force: true, recursive: true}));
  return dir;
}

test('the outcome contract: three outcomes, a refused run never exits 0',
  () => {
    assert.equal(scenarioOutcomeOf(refusedEntry()), SCENARIO_OUTCOME.REFUSED);
    assert.equal(scenarioOutcomeOf({passed: true}), SCENARIO_OUTCOME.PASSED);
    assert.equal(scenarioOutcomeOf({passed: false}), SCENARIO_OUTCOME.FAILED);
    assert.equal(scenarioOutcomeOf({}), SCENARIO_OUTCOME.FAILED);
    assert.equal(resolveRunExitCode({hasFailures: false, hasRefusals: true}),
      EXIT_CODES.REFUSED);
    assert.notEqual(EXIT_CODES.REFUSED, EXIT_CODES.SUCCESS);
    assert.notEqual(EXIT_CODES.REFUSED, EXIT_CODES.FAILURE);
    assert.equal(resolveRunExitCode({hasFailures: true, hasRefusals: true}),
      EXIT_CODES.FAILURE);
    assert.equal(resolveRunExitCode({hasFailures: false, hasRefusals: false}),
      EXIT_CODES.SUCCESS);
  });

test('report writer + harness verdict: entry named refused, verdict ' +
  'REFUSED_NOT_RUN, summary counts it as not passed and as refused', () => {
  const entry = refusedEntry();
  assert.equal(entry.passed, false);
  assert.equal(entry.outcome, 'refused');
  assert.deepEqual(entry.refusal, REFUSAL);
  assert.equal(entry.verdict, 'REFUSED_NOT_RUN');
  assert.equal(entry.verdictReason, 'refused_insufficient_host_topology');
  const summary = computeSummary([entry, {duration: 1, passed: true}]);
  assert.deepEqual(summary,
    {duration: 1, failed: 1, passed: 1, refused: 1, total: 2});
});

test('failure bundle writer: no bundle for a refused scenario, and its ' +
  'directory (earlier evidence) is left untouched', async (t) => {
  const root = scratch(t, 'refused-bundle-');
  const scenarioDir = join(root, SCENARIO);
  mkdirSync(scenarioDir, {recursive: true});
  writeFileSync(join(scenarioDir, 'failure-bundle.json'), '{"earlier":1}');
  const entry = refusedEntry();
  const result = await writeFailureBundlesForReport({
    outputDir: root, reportOutputPath: join(root, 'r.json'),
    scenarios: [entry], workspaceRoot: root,
  });
  assert.equal(entry.failureBundle, undefined);
  assert.equal(result.runBundle, null);
  assert.equal(readFileSync(join(scenarioDir, 'failure-bundle.json'), 'utf8'),
    '{"earlier":1}');
  assert.equal(existsSync(join(scenarioDir, 'triage-summary.md')), false);
});

test('quest scenario-harness probe: a refused run is no sample - it never ' +
  'extends a pass streak and never resets one', (t) => {
  const dir = scratch(t, 'refused-probe-');
  const write = (name, timestamp, entry) => writeFileSync(join(dir, name),
    JSON.stringify({scenarios: [{scenario: SCENARIO, ...entry}],
      summary: {failed: entry.passed ? 0 : 1, passed: entry.passed ? 1 : 0},
      timestamp}));
  write('a.report.json', '2026-10-04T00:00:01.000Z', {passed: true});
  write('b.report.json', '2026-10-04T00:00:02.000Z', {passed: true});
  write('c.report.json', '2026-10-04T00:00:03.000Z', refusedEntry());
  const measured = scenarioHarnessProbe.measure({consecutive: 3,
    reportDir: dir, scenario: SCENARIO});
  assert.equal(measured.done, false);
  assert.equal(measured.detail.passingStreak, 2);
  // It is no sample either: not a measured failure that resets real
  // passes - it is skipped, and three real passes complete the streak.
  write('d.report.json', '2026-10-04T00:00:04.000Z', {passed: true});
  const skipped = scenarioHarnessProbe.measure({consecutive: 3,
    reportDir: dir, scenario: SCENARIO});
  assert.equal(skipped.done, true);
  assert.equal(skipped.detail.passingStreak, 3);
  // A refused-only history is no evidence at all.
  const onlyRefused = scratch(t, 'refused-probe-only-');
  for (const name of ['a', 'b', 'c']) {
    writeFileSync(join(onlyRefused, `${name}.report.json`), JSON.stringify({
      scenarios: [refusedEntry()], summary: {failed: 1, passed: 0, refused: 1},
      timestamp: `2026-10-04T00:00:0${name.charCodeAt(0) - 96}.000Z`}));
  }
  const none = scenarioHarnessProbe.measure({consecutive: 1,
    reportDir: onlyRefused, scenario: SCENARIO});
  assert.equal(none.done, false);
});

test('distributed:all matrix + lab harness read the runner exit: REFUSED ' +
  'is its own outcome, carried on the child error', async () => {
  assert.equal(outcomeOfRunnerExit(0), SCENARIO_OUTCOME.PASSED);
  assert.equal(outcomeOfRunnerExit(EXIT_CODES.REFUSED),
    SCENARIO_OUTCOME.REFUSED);
  assert.equal(outcomeOfRunnerExit(1), SCENARIO_OUTCOME.FAILED);
  assert.equal(outcomeOfRunnerExit(null), SCENARIO_OUTCOME.FAILED);
  await assert.rejects(run(process.execPath,
    ['-e', `process.exit(${EXIT_CODES.REFUSED})`], {stdio: 'ignore'}),
  (error) => error.exitCode === EXIT_CODES.REFUSED);
});

test('summarize-harness-runs (the matrix summary table) shows REFUSED ' +
  'apart from PASS and FAIL', (t) => {
  const dir = scratch(t, 'refused-summary-');
  writeFileSync(join(dir, 'a.report.json'), JSON.stringify({
    scenarios: [refusedEntry()], timestamp: '2026-10-04T00:00:01.000Z'}));
  const result = spawnSync(process.execPath,
    ['scripts/summarize-harness-runs.js', '--report-dir', dir],
    {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /0 passed, 0 failed, 1 refused \(not run\)/u);
  assert.match(result.stdout, /REFUSED/u);
  assert.doesNotMatch(result.stdout, /✓ PASS|✗ FAIL/u);
});

test('rerun-failed never re-runs a refused scenario on the same config',
  (t) => {
    const dir = scratch(t, 'refused-rerun-');
    writeFileSync(join(dir, 'a.report.json'), JSON.stringify({
      metadata: {executionTarget: 'local', matrixConfig: 'local-three-node.json'},
      scenarios: [refusedEntry()], timestamp: '2026-10-04T00:00:01.000Z'}));
    const result = spawnSync('bash', [
      'scripts/rerun-failed-distributed-scenarios.sh', '--report-dir', dir,
      '--dry-run'], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, new RegExp(SCENARIO, 'u'));
  });

test('triage classifies a refused report REFUSED, never healthy or stalled',
  () => {
    assert.equal(classifyStatGateScenario(refusedEntry()).class, 'REFUSED');
    const {outcome: _o, refusal: _r, ...legacy} = refusedEntry();
    assert.equal(classifyStatGateScenario(legacy).class, 'STALLED');
  });

test('lab harness declares each node\'s observed boot id: two nodes on one ' +
  'machine are one host, an unobservable node refuses the formation',
async (t) => {
  const nodes = [{ip: '192.168.86.32', name: 'main-linux', ssh: 'a'},
    {ip: '192.168.86.40', name: 'controller-docker', ssh: 'b'},
    {ip: '192.168.86.27', name: 'tv-dator', ssh: 'c'}];
  const boots = {a: '1f0e2d3c-0000-4000-8000-00000000000a',
    b: '1f0e2d3c-0000-4000-8000-00000000000a',
    c: '1f0e2d3c-0000-4000-8000-00000000000c'};
  const ids = await observeMachineIdentities(nodes,
    async (node) => `${boots[node.ssh]}\n`);
  assert.equal(ids[0], ids[1]);
  assert.notEqual(ids[0], ids[2]);
  const dir = scratch(t, 'refused-lab-');
  const base = join(dir, 'base.json');
  writeFileSync(base, JSON.stringify({docker: {socketPath: '/x'}, size: 3}));
  const config = await buildRemoteConfig(base, nodes, [1, 2, 3],
    join(dir, 'out.json'), 1, ids);
  assert.equal(config.docker.hostInfo[0].machineId, ids[0]);
  assert.equal(resolveConfigHostTopology(config).distinctHosts, 2);
  await assert.rejects(observeMachineIdentities(nodes, async (node) => {
    if (node.ssh === 'b') {
      throw new Error('ssh: connect refused');
    }
    return boots[node.ssh];
  }), /harness: no machine identity for node controller-docker: ssh: connect refused/u);
  await assert.rejects(observeMachineIdentities(nodes, async () => ''),
    /no machine identity for node main-linux/u);
});
