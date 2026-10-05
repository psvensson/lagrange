/**
 * Every consumer that could treat a run as certification or acceptance
 * evidence either REQUIRES `certified: true` (the quest probe's
 * certification streak, the lab certification run) or SAYS it is not
 * certification evidence (formation health, the seed budget gate, ship
 * readiness, the distributed matrix). Owner rulings 5 and 6 (2026-10-05).
 * One witness per consumer.
 */

import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';

import {scenarioHarnessProbe} from '../../scripts/solve/probes.js';
import {
  prepareCertificationRun,
  runHarness,
} from '../../scripts/lab/harness.js';
import {renderTrendSummary} from '../../scripts/checks/formation-health.js';
import {
  runFormationSeedBudgetGate,
} from '../../scripts/checks/run-formation-seed-budget.js';
import {
  assessShipReadiness,
  summarizeValidationRuns,
} from '../../test/distributed/harness/validation-matrix.js';
import {
  CERTIFICATION_NOT_REQUESTED,
  NOT_CERTIFICATION_EVIDENCE,
} from '../../test/distributed/harness/scenario-certification.js';
import {ReportWriter} from '../../test/distributed/harness/report-writer.js';

const SHA = '0123456789abcdef0123456789abcdef01234567';
const OTHER_SHA = 'fedcba9876543210fedcba9876543210fedcba98';
const SCENARIO = 'public-path-multinode-baseline';
const NOT_EVIDENCE = /NOT certification evidence/u;

function scratch(t, prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, {force: true, recursive: true}));
  return dir;
}

function certifiedEntry(sha) {
  return {certification: {certified: true, requested: true, sha},
    outcome: 'passed', passed: true, scenario: SCENARIO};
}

const UNCERTIFIED_PASS = Object.freeze({
  certification: CERTIFICATION_NOT_REQUESTED, outcome: 'passed',
  passed: true, scenario: SCENARIO});

function writeReports(dir, entries) {
  entries.forEach((entry, index) => {
    writeFileSync(join(dir, `r${index}.report.json`), JSON.stringify({
      scenarios: [entry], summary: {failed: entry.passed ? 0 : 1},
      timestamp: `2026-10-05T00:00:${String(10 + index)}.000Z`}));
  });
}

test('quest probe, certification: true - only certified runs at ONE sha ' +
  'count; an uncertified pass does not; another sha does not', (t) => {
  const three = scratch(t, 'cert-probe-');
  // Oldest first on disk; the probe reads newest first.
  writeReports(three, [certifiedEntry(SHA), UNCERTIFIED_PASS,
    certifiedEntry(SHA), certifiedEntry(SHA)]);
  const done = scenarioHarnessProbe.measure({certification: true,
    consecutive: 3, reportDir: three, scenario: SCENARIO});
  assert.equal(done.done, true);
  assert.equal(done.metric, 0);
  assert.equal(done.detail.certification.sha, SHA);

  const mixed = scratch(t, 'cert-probe-sha-');
  writeReports(mixed, [certifiedEntry(OTHER_SHA), certifiedEntry(SHA),
    certifiedEntry(SHA)]);
  const notDone = scenarioHarnessProbe.measure({certification: true,
    consecutive: 3, reportDir: mixed, scenario: SCENARIO});
  assert.equal(notDone.done, false);
  assert.equal(notDone.metric, 1);
  assert.equal(notDone.detail.certification.endedBy, 'other_sha');

  // Three plain passes satisfy a pass streak and NOT a certification one.
  const passes = scratch(t, 'cert-probe-pass-');
  writeReports(passes, [UNCERTIFIED_PASS, UNCERTIFIED_PASS,
    UNCERTIFIED_PASS]);
  const plain = scenarioHarnessProbe.measure({consecutive: 3,
    reportDir: passes, scenario: SCENARIO});
  assert.equal(plain.done, true);
  assert.equal(plain.detail.certification, NOT_CERTIFICATION_EVIDENCE);
  assert.equal(scenarioHarnessProbe.measure({certification: true,
    consecutive: 3, reportDir: passes, scenario: SCENARIO}).done, false);
});

const LAB_NODES = Object.freeze([
  {ip: '192.168.86.32', name: 'tv-dator', ssh: 'peter@192.168.86.32'},
  {ip: '192.168.86.26', name: 'carinas-windows', ssh: 'peter@192.168.86.26'},
  {ip: '192.168.86.34', name: 'adam-laptop', ssh: 'peter@192.168.86.34'},
  {ip: '192.168.86.41', name: 'adams-gamla', ssh: 'peter@192.168.86.41'},
  {ip: '192.168.86.27', name: 'lenovo-laptop', ssh: 'peter@192.168.86.27'},
]);
const BASE_FIVE = 'test/distributed/config/local.json';

function bootIdOf(node) {
  return `1f0e2d3c-0000-4000-8000-0000000000${node.ip.slice(-2)}`;
}

function cleanAt(sha) {
  return () => ({dirty: false, dirtyPathCount: 0, dirtyPaths: [], error: null,
    headSha: sha, requestedSha: SHA});
}

const NEVER_HOLD = () => {
  throw new Error('a refused certification run must hold no node');
};

function labRun(overrides = {}, write = () => {}) {
  return runHarness({baseConfig: BASE_FIVE, certify: SHA, dryRun: true,
    hold: NEVER_HOLD, nodes: LAB_NODES, observeMachine: async (node) =>
      bootIdOf(node), readCommitIdentity: cleanAt(SHA), scenario: SCENARIO,
    verbose: false, write, ...overrides});
}

// The lab harness writes through an injected sink here; the test runner's
// own stdout is never touched.
async function captureOutput(run) {
  const lines = [];
  await run((text) => lines.push(String(text)));
  return lines.join('');
}

test('lab certification dry-run: five nodes on five observed machines, ' +
  'one per machine, the runner asked for the verdict', async (t) => {
  const output = await captureOutput((write) => labRun({}, write));
  assert.match(output, /Certification topology: 5 node\(s\) on 5 distinct machine\(s\), at most 1 per machine: met/u);
  assert.match(output, new RegExp(`--certify ${SHA} --no-fast-local`, 'u'));
  const configPath = /Would write config: (\S+)/u.exec(output)[1];
  t.after(() => rmSync(configPath, {force: true}));
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.equal(config.nodesPerHost, 1);
  assert.equal(new Set(config.docker.hostInfo.map((entry) =>
    entry.machineId)).size, 5);
});

test('lab certification refuses before any hold: shared boot id, an ' +
  'unobservable machine, a dirty or other checkout, two per host, a ' +
  'passthrough --certify, an undeclared scenario, too few machines',
async () => {
  const refusals = [
    [{observeMachine: async (node) => (node.name === 'lenovo-laptop' ?
      bootIdOf(LAB_NODES[0]) : bootIdOf(node))},
    /share one machine \(boot id boot:[^)]+\): tv-dator,lenovo-laptop/u],
    [{observeMachine: async (node) => {
      if (node.name === 'carinas-windows') throw new Error('ssh timeout');
      return bootIdOf(node);
    }}, /no machine identity for node carinas-windows: ssh timeout/u],
    [{readCommitIdentity: () => ({...cleanAt(SHA)(), dirty: true,
      dirtyPathCount: 2})}, /checkout is dirty \(2 path\(s\)\)/u],
    [{readCommitIdentity: cleanAt(OTHER_SHA)},
      /checkout HEAD fedcba.* is not the requested 0123/u],
    [{nodesPerHost: 2}, /--nodes-per-host must be 1 or omitted, got 2/u],
    [{extraArgs: ['--certify', SHA]}, /not as a runner passthrough/u],
    [{scenario: 'rolling-restart'},
      /rolling-restart declares no SCENARIO_CERTIFICATION_REQUIREMENT/u],
    [{nodes: LAB_NODES.slice(0, 4)},
      /cannot certify: refused_certification_topology \(4 node\(s\)/u],
  ];
  for (const [overrides, pattern] of refusals) {
    await assert.rejects(labRun(overrides), (error) => {
      assert.match(error.message, /^harness: certification refused/u);
      assert.match(error.message, pattern);
      return true;
    }, String(pattern));
  }
  // An ordinary run cannot smuggle certification in as a passthrough.
  await assert.rejects(runHarness({certify: null, dryRun: true,
    extraArgs: ['--certify', SHA], hold: NEVER_HOLD, nodes: LAB_NODES,
    scenario: SCENARIO}), /not as a runner passthrough/u);
  assert.equal(typeof prepareCertificationRun, 'function');
});

test('formation health and the seed budget gate say they are not ' +
  'certification evidence', (t) => {
  assert.match(renderTrendSummary([{head: 'abc', passed: true,
    verdict: 'PASS'}]), NOT_EVIDENCE);
  const dir = scratch(t, 'cert-seed-');
  const report = join(dir, 'formation.report.json');
  writeFileSync(report, JSON.stringify({formationVerdict: {
    budget: {}, reason: 'formed', seedStarved: false, verdict: 'PASS'}}));
  const lines = [];
  runFormationSeedBudgetGate({log: (line) => lines.push(line), report,
    root: dir});
  assert.match(lines.join('\n'), NOT_EVIDENCE);
});

test('a report entry without a certification verdict says it is not ' +
  'certification evidence', () => {
  const writer = new ReportWriter('unused.report.json');
  writer.addResult(SCENARIO, {duration: 1, passed: true});
  assert.equal(writer.scenarios[0].certification, CERTIFICATION_NOT_REQUESTED);
  assert.equal(writer.scenarios[0].certification.certified, false);
});

test('ship readiness (validation matrix) says it is not certification',
  () => {
    const gate = assessShipReadiness(summarizeValidationRuns([]));
    assert.equal(gate.certification.certificationEvidence, false);
    assert.match(gate.certification.statement, NOT_EVIDENCE);
  });

test('the distributed matrix never certifies: it says so and refuses a ' +
  '--certify passthrough', () => {
  const dry = spawnSync(process.execPath, ['scripts/run-distributed-matrix.js',
    '--target', 'local', '--profile', 'topology', '--dry-run'],
  {encoding: 'utf8'});
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /Distributed matrix: NOT certification evidence/u);
  const refused = spawnSync(process.execPath, [
    'scripts/run-distributed-matrix.js', '--target', 'local', '--profile',
    'topology', '--dry-run', '--', '--certify', SHA], {encoding: 'utf8'});
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr,
    /--certify is owned by the distributed matrix runner/u);
});
