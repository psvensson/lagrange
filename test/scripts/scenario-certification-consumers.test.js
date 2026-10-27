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
import {
  mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';

import {scenarioHarnessProbe} from '../../scripts/solve/probes.js';
import {
  prepareCertificationRun,
  runHarness,
} from '../../scripts/lab/harness.js';
import {
  keepCertificationEvidence,
  parseHostAnswer,
} from '../../scripts/lab/certification-preflight.js';
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
} from '../../test/distributed/harness/scenario-certification.js';
import {
  archiveCertificationRun,
  describeCertificationRun,
  formatCertificationRecord,
  startCertificationRun,
} from '../../test/distributed/harness/certification-evidence-archive.js';
import {
  NOT_CERTIFICATION_EVIDENCE,
} from '../../test/distributed/harness/certification-evidence-statement.js';
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
  return {certification: {certified: true, requested: true,
    requestedSha: sha, sha}, outcome: 'passed', passed: true,
  scenario: SCENARIO};
}

// Durable evidence, oldest first (certification-evidence-archive.js); each
// run's record line is appended to `log` as `solve note --kind evidence`
// records it.
async function archiveEntries(root, entries, {log = null} = {}) {
  let second = 10;
  const lines = [];
  for (const entry of entries) {
    second += 1;
    const archived = await archiveCertificationRun({entry, gates: [],
      nodes: [], outputDir: null, root,
      runStartedAt: `2026-10-05T00:00:${second}Z`, scenarioName: SCENARIO});
    const line = formatCertificationRecord(describeCertificationRun(
      archived.dir), 'q');
    lines.push(JSON.stringify({kind: 'evidence',
      text: line.slice(line.indexOf('certification-run'), -1),
      ts: `2026-10-05T00:01:${second}Z`, type: 'finding'}));
  }
  if (log !== null) {
    writeFileSync(log, lines.join('\n') + '\n', {flag: 'a'});
  }
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
  'from durable evidence count; report files never do; another sha does ' +
  'not', async (t) => {
  const three = scratch(t, 'cert-probe-');
  const log = join(three, 'log.ndjson');
  // Oldest first; the probe reads newest first.
  await archiveEntries(three, [certifiedEntry(SHA), certifiedEntry(SHA),
    certifiedEntry(SHA)], {log});
  const done = scenarioHarnessProbe.measure({certification: true,
    consecutive: 3, evidenceDir: three, recordedLog: log, scenario: SCENARIO});
  assert.equal(done.done, true);
  assert.equal(done.metric, 0);
  assert.equal(done.detail.certification.sha, SHA);
  assert.equal(done.detail.certification.recordedCheck, 'checked');
  // Without the quest log the streak is not claimed.
  const unrecorded = scenarioHarnessProbe.measure({certification: true,
    consecutive: 3, evidenceDir: three, scenario: SCENARIO});
  assert.equal(unrecorded.done, false);
  assert.equal(unrecorded.detail.certification.recordedCheck, 'not_supplied');
  // An empty log: every certified sample is unrecorded, none counts.
  const emptyLog = join(three, 'empty.ndjson');
  writeFileSync(emptyLog, '');
  const none = scenarioHarnessProbe.measure({certification: true,
    consecutive: 3, evidenceDir: three, recordedLog: emptyLog,
    scenario: SCENARIO});
  assert.equal(none.done, false);
  assert.equal(none.detail.certification.unrecordedSamples.length, 3);

  const mixed = scratch(t, 'cert-probe-sha-');
  await archiveEntries(mixed, [certifiedEntry(OTHER_SHA),
    certifiedEntry(SHA), certifiedEntry(SHA)], {log: join(mixed, 'log')});
  const notDone = scenarioHarnessProbe.measure({certification: true,
    consecutive: 3, evidenceDir: mixed, recordedLog: join(mixed, 'log'),
    scenario: SCENARIO});
  assert.equal(notDone.done, false);
  assert.equal(notDone.metric, 1);
  assert.equal(notDone.detail.certification.endedBy, 'other_sha');

  // Certified entries in mutable report files are not evidence.
  const reportsOnly = scratch(t, 'cert-probe-reports-');
  writeReports(reportsOnly, [certifiedEntry(SHA), certifiedEntry(SHA),
    certifiedEntry(SHA)]);
  const fromReports = scenarioHarnessProbe.measure({certification: true,
    consecutive: 3, evidenceDir: scratch(t, 'cert-probe-empty-'),
    reportDir: reportsOnly, scenario: SCENARIO});
  assert.equal(fromReports.done, false);
  assert.equal(fromReports.measuring, false);

  // Three plain passes satisfy a pass streak and NOT a certification one.
  const passes = scratch(t, 'cert-probe-pass-');
  writeReports(passes, [UNCERTIFIED_PASS, UNCERTIFIED_PASS,
    UNCERTIFIED_PASS]);
  const plain = scenarioHarnessProbe.measure({consecutive: 3,
    reportDir: passes, scenario: SCENARIO});
  assert.equal(plain.done, true);
  assert.equal(plain.detail.certification, NOT_CERTIFICATION_EVIDENCE);
  assert.equal(scenarioHarnessProbe.measure({certification: true,
    consecutive: 3, evidenceDir: passes, reportDir: passes,
    scenario: SCENARIO}).done, false);
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
  return () => ({contextDirtyPathCount: 0, contextDirtyPaths: [],
    contextRoots: [], dirty: false, dirtyPathCount: 0, dirtyPaths: [],
    error: null, headSha: sha, requestedSha: SHA});
}

const NEVER_HOLD = () => {
  throw new Error('a refused certification run must hold no node');
};

const NODE_DIGEST = 'node@sha256:43ac6c60b8f8';
const DISTROLESS_DIGEST = 'gcr.io/distroless/nodejs22-debian12@sha256:8a3e96fe3345';
const BASE_IMAGE_IDS = Object.freeze({
  'gcr.io/distroless/nodejs22-debian12': {imageId: 'sha256:8a3e96fe3345',
    repoDigests: [DISTROLESS_DIGEST]},
  'node:22-slim': {imageId: 'sha256:43ac6c60b8f8',
    repoDigests: [NODE_DIGEST]}});

// What the pre-flight's one read-only ssh command answers for a healthy
// host (certification-preflight.js).
function healthyHost(node) {
  const now = Date.now();
  return {baseImages: {...BASE_IMAGE_IDS}, bootId: bootIdOf(node),
    clockMs: now, docker: '29.1.3', freeKib: 50 * 1024 * 1024,
    receivedMs: now, sentMs: now, storageDriver: 'overlayfs'};
}

function labRun(overrides = {}, write = () => {}) {
  return runHarness({baseConfig: BASE_FIVE, certify: SHA, dryRun: true,
    environment: {}, hold: NEVER_HOLD, nodes: LAB_NODES,
    observeHost: async (node) => healthyHost(node),
    observeMachine: async (node) =>
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
  assert.match(output, /^PASS clean checkout at the sha/mu);
  assert.match(output, /^PASS host carinas-windows clock skew/mu);
  assert.match(output, /^PASS 5 distinct boot ids/mu);
  assert.match(output, /^certification preflight: PASS$/mu);
  assert.doesNotMatch(output, /^FAIL /mu);
  assert.match(output, /Certification topology: 5 node\(s\) on 5 distinct machine\(s\), at most 1 per machine: met/u);
  assert.match(output, new RegExp(`--certify ${SHA} --no-fast-local`, 'u'));
  const configPath = /Would write config: (\S+)/u.exec(output)[1];
  t.after(() => rmSync(configPath, {force: true}));
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.equal(config.nodesPerHost, 1);
  assert.equal(new Set(config.docker.hostInfo.map((entry) =>
    entry.machineId)).size, 5);
});

test('lab certification pre-flight (--dry-run --certify): each failing ' +
  'item is a FAIL line and refuses the run, nothing held or built',
async () => {
  const at = (name, change) => async (node) => (node.name === name ?
    {...healthyHost(node), ...change(healthyHost(node))} : healthyHost(node));
  const cases = [
    [{observeHost: at('adam-laptop', () => ({baseImages: {...BASE_IMAGE_IDS,
      'node:22-slim': {imageId: 'sha256:43ac6c60b8f8',
        repoDigests: ['node@sha256:older']}}}))},
    /FAIL base image registry digests equal on every host: node:22-slim: .*adam-laptop=sha256:older/u],
    [{observeHost: at('adam-laptop', () => ({baseImages: {...BASE_IMAGE_IDS,
      'node:22-slim': {imageId: 'sha256:43ac6c60b8f8', repoDigests: []}}}))},
    /FAIL host adam-laptop base images present: no registry digest \(RepoDigests\) for: node:22-slim=sha256:43ac6c60b8f8 \[\]/u],
    [{observeHost: at('tv-dator', () => ({baseImages: {}}))},
      /FAIL host tv-dator base images present: missing: node:22-slim/u],
    [{observeHost: at('lenovo-laptop', () => ({freeKib: 1024}))},
      /FAIL host lenovo-laptop free disk: 1024 KiB free/u],
    [{observeHost: at('carinas-windows', (host) => ({clockMs:
      host.receivedMs + 2001}))}, /FAIL host carinas-windows clock skew/u],
    [{observeHost: at('adams-gamla', () => ({docker: 'unreachable'}))},
      /FAIL host adams-gamla docker: docker unreachable/u],
    [{observeHost: async (node) => {
      if (node.name === 'tv-dator') throw new Error('ssh: connect timed out');
      return healthyHost(node);
    }}, /FAIL host tv-dator reachable: ssh: connect timed out/u],
    [{observeHost: at('adams-gamla', () => ({bootId: bootIdOf(LAB_NODES[0])}))},
      /FAIL 5 distinct boot ids: 4 distinct of 5/u],
    [{environment: {LAGRANGE_LOG_FILE: '/tmp/x.log'}},
      /FAIL log capture streamed .*: LAGRANGE_LOG_FILE/u],
    [{environment: {LOG_PRETTY_PRINT: 'true'}},
      /FAIL log capture streamed .*: LOG_PRETTY_PRINT/u],
    [{readCommitIdentity: () => ({...cleanAt(SHA)(), dirty: true,
      dirtyPathCount: 2})}, /FAIL clean checkout at the sha/u],
  ];
  for (const [overrides, pattern] of cases) {
    let output = '';
    await assert.rejects(labRun(overrides, (text) => {
      output += text;
    }), /certification refused \(nothing held, nothing run\): the certification preflight failed/u,
    String(pattern));
    assert.match(output, pattern);
    assert.match(output, /^certification preflight: FAIL \(\d item\(s\)\)$/mu,
      String(pattern));
    assert.doesNotMatch(output, /Would write config/u);
  }
});

test('lab certification (B3): the run directory and its started.json ' +
  'exist BEFORE any hold; a run aborted at the hold leaves it and prints ' +
  'its record line as interrupted; a directory that cannot be created ' +
  'aborts before any hold', async (t) => {
  const root = join(scratch(t, 'cert-lab-run-'), 'certification');
  const seen = [];
  let output = '';
  await assert.rejects(labRun({dryRun: false, evidenceRoot: root,
    hold: () => {
      seen.push(readdirSync(join(root, SHA)));
      throw new Error('hold lost');
    }, quest: 'certification-quest'}, (text) => {
    output += text;
  }), /hold lost/u);
  const [runName] = readdirSync(join(root, SHA));
  assert.deepEqual(seen, [[runName]]);
  assert.deepEqual(readdirSync(join(root, SHA, runName)), ['started.json']);
  const started = JSON.parse(readFileSync(join(root, SHA, runName,
    'started.json'), 'utf8'));
  assert.equal(started.scenario, SCENARIO);
  assert.equal(started.requestedSha, SHA);
  assert.equal(started.hostSet.length, 5);
  assert.equal(started.controller.pid, process.pid);
  assert.match(output, new RegExp('node scripts/solve\\.js note --id ' +
    'certification-quest --kind evidence --finding ' +
    `"certification-run scenario=${SCENARIO} sha=${SHA} ` +
    `start=${started.runStartedAt} outcome=interrupted ` +
    'manifest=none \\(no manifest: interrupted\\)"', 'u'));
  const blocked = join(scratch(t, 'cert-lab-blocked-'), 'file');
  writeFileSync(blocked, 'not a directory');
  await assert.rejects(labRun({dryRun: false, evidenceRoot: join(blocked, 'x'),
    hold: NEVER_HOLD}), /ENOTDIR/u);
});

test('lab certification pre-flight parses a host answer, a clock read as ' +
  'seconds with any fraction width (uutils date on carinas-windows)', () => {
  const answer = parseHostAnswer('BOOT be32\nCLOCK 1791195512.3914937\n' +
    'DOCKER 29.1.3\nDRIVER overlay2\nDISK 6438752\n' +
    'BASE node:22-slim sha256:a ["node@sha256:43ac"]\n' +
    'BASE gcr.io/d missing\nBASE local:1 sha256:b []\n');
  assert.deepEqual(answer, {baseImages: {'gcr.io/d': {imageId: 'missing',
    repoDigests: []}, 'local:1': {imageId: 'sha256:b', repoDigests: []},
  'node:22-slim': {imageId: 'sha256:a', repoDigests: ['node@sha256:43ac']}},
  bootId: 'be32', clockMs: 1791195512391, docker: '29.1.3',
  freeKib: 6438752, storageDriver: 'overlay2'});
});

test('lab certification pre-flight compares base images by registry ' +
  'digest (RepoDigests), never by image Id: the classic and the containerd ' +
  'image store report different Ids for the same pulled content',
async () => {
  const preflight = async (observeHost) => {
    const lines = [];
    await labRun({observeHost}, (text) => lines.push(String(text)))
      .catch(() => {});
    return lines.join('');
  };
  // lenovo-laptop: overlay2 store, config-digest Ids; the rest: containerd
  // store, manifest-digest Ids; identical RepoDigests -> PASS.
  const differentIds = await preflight(async (node) => (node.name ===
    'lenovo-laptop' ? {...healthyHost(node), storageDriver: 'overlay2',
      baseImages: {
        'gcr.io/distroless/nodejs22-debian12': {imageId: 'sha256:a5830fa2',
          repoDigests: [DISTROLESS_DIGEST]},
        'node:22-slim': {imageId: 'sha256:88f8ba58',
          repoDigests: ['docker.io/library/' + NODE_DIGEST]}}} :
    healthyHost(node)));
  assert.match(differentIds, /^PASS base image registry digests equal on every host/mu);
  assert.match(differentIds, /^PASS host lenovo-laptop docker: docker 29\.1\.3 \(storage driver overlay2\)/mu);
  assert.match(differentIds, /^certification preflight: PASS$/mu);
  // Equal Ids, different registry content -> FAIL.
  const equalIds = await preflight(async (node) => (node.name ===
    'adams-gamla' ? {...healthyHost(node), baseImages: {...BASE_IMAGE_IDS,
      'node:22-slim': {imageId: 'sha256:43ac6c60b8f8',
        repoDigests: ['node@sha256:0ther']}}} : healthyHost(node)));
  assert.match(equalIds, /^FAIL base image registry digests equal on every host: node:22-slim: .*adams-gamla=sha256:0ther/mu);
  // No RepoDigests on one host (a locally built base) -> FAIL, named.
  const undigested = await preflight(async (node) => (node.name ===
    'tv-dator' ? {...healthyHost(node), baseImages: {...BASE_IMAGE_IDS,
      'gcr.io/distroless/nodejs22-debian12': {imageId: 'sha256:8a3e96fe3345',
        repoDigests: []}}} : healthyHost(node)));
  assert.match(undigested, /^FAIL host tv-dator base images present: no registry digest \(RepoDigests\) for: gcr\.io\/distroless\/nodejs22-debian12/mu);
  assert.match(undigested, /^FAIL base image registry digests equal on every host: gcr\.io\/distroless\/nodejs22-debian12: .*tv-dator=missing/mu);
});

test('lab harness keep-evidence prints the record line of ANY run ' +
  'directory, an interrupted one (SIGKILL: no line was printed) included, ' +
  'before it keeps the verdict files', async (t) => {
  const dir = scratch(t, 'cert-keep-');
  const interrupted = await startCertificationRun({requestedSha: SHA,
    root: join(dir, 'cert'), runStartedAt: '2026-10-05T09:00:00.000Z',
    scenario: SCENARIO});
  const lines = [];
  const kept = await keepCertificationEvidence({quest: 'zl',
    runDir: interrupted.dir, to: join(dir, 'committed'),
    write: (text) => lines.push(String(text))});
  const output = lines.join('');
  assert.match(lines[0], /^certification run record/u);
  assert.ok(output.includes('node scripts/solve.js note --id zl --kind ' +
    `evidence --finding "certification-run scenario=${SCENARIO} sha=${SHA} ` +
    'start=2026-10-05T09:00:00.000Z outcome=interrupted manifest=none ' +
    '(no manifest: interrupted)"'), output);
  assert.deepEqual(kept.copied, ['started.json']);
  // A second keep refuses (never overwritten), but the line is still
  // printed first.
  const again = [];
  await assert.rejects(keepCertificationEvidence({quest: 'zl',
    runDir: interrupted.dir, to: join(dir, 'committed'),
    write: (text) => again.push(String(text))}), /EEXIST/u);
  assert.match(again.join(''), /outcome=interrupted manifest=none/u);
});

test('lab certification (S5): a sixth listed machine gets no node, so it ' +
  'is neither observed, held nor tunneled', async (t) => {
  const observed = [];
  const extra = {ip: '192.168.86.20', name: 'main-linux',
    ssh: 'peter@192.168.86.20'};
  const output = await captureOutput((write) => labRun({
    nodes: [...LAB_NODES, extra], observeMachine: async (node) => {
      observed.push(node.name);
      return bootIdOf(node);
    }}, write));
  const configPath = /Would write config: (\S+)/u.exec(output)[1];
  t.after(() => rmSync(configPath, {force: true}));
  assert.deepEqual(observed, LAB_NODES.map((node) => node.name));
  assert.match(output, /main-linux: no node placed \(not observed, held or tunneled\)/u);
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.equal(config.docker.hosts.length, 5);
  assert.ok(!config.docker.hostInfo.some((entry) =>
    entry.internalIp === extra.ip));
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
      dirtyPathCount: 2})}, /checkout is dirty \(2 path\(s\)/u],
    [{readCommitIdentity: () => ({...cleanAt(SHA)(), contextDirtyPathCount: 1,
      contextDirtyPaths: ['!! src/stray.js'], dirty: true})},
    /1 untracked, ignored or modified path\(s\) inside the build context/u],
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

test('certification:verdict (S6) states what it certifies and that it is ' +
  'not the formation certification; its verdict and metric are unchanged',
(t) => {
  const reports = scratch(t, 'cert-verdict-');
  const json = spawnSync(process.execPath, [
    'scripts/checks/certification-verdict.js', '--scenario',
    'rolling-restart', '--reports', reports], {encoding: 'utf8'});
  const projected = JSON.parse(json.stdout);
  assert.equal(projected.formationCertification, false);
  assert.match(projected.certifies, /sealed-bar statistical certification/u);
  assert.match(projected.statement, /NOT the formation certification/u);
  assert.ok(projected.shortfalls.length > 0);
  const metric = spawnSync(process.execPath, [
    'scripts/checks/certification-verdict.js', '--scenario',
    'rolling-restart', '--reports', reports, '--metric'], {encoding: 'utf8'});
  assert.equal(metric.status, json.status);
  assert.match(metric.stdout, /^\d+\n$/u);
  assert.match(metric.stderr, /NOT the formation certification/u);
});

test('the GCP handoff streak (S6) names itself a pass streak, not ' +
  'certification, in its header and refusal text', () => {
  const source = readFileSync(
    'scripts/checks/run-formation-release-handoff-gcp-streak.js', 'utf8');
  assert.match(source, /^\/\/ Bounded PASS streak \(NOT certification/u);
  assert.doesNotMatch(source, /runner certifies|certification streak/u);
});
