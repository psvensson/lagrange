/**
 * Witnesses of the certification owner (scenario-certification.js) through
 * the REAL runner (runScenarios), the real split/leader host-spread gate and
 * the real bounded-wait census, over synthetic clusters and fake node logs
 * (no containers). Owner rulings 5 and 6 (2026-10-05): a certification-grade
 * verdict independently observes real publication convergence, the host
 * spread on one node per distinct machine, voters at target, the run's
 * spent waits and the exact commit; the ordinary run outcome is unchanged.
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {runScenarios} from '../../run.js';
import {EXIT_CODES} from '../constants.js';
import {fullLogDestPath} from '../full-node-log-capture.js';
import {PUBLICATION_CONVERGENCE_CLAIM_STATE} from '../publication-convergence-claim.js';
import {
  CERTIFICATION_CONDITION,
  CERTIFICATION_FAILURE,
  CERTIFICATION_KNOWN_FINDING_SPENT_WAIT_POLICY,
  CERTIFICATION_NOT_REQUESTED,
  KNOWN_FINDING_SPENT_WAIT_POLICY_MODE,
  classifySpentWaits,
  evaluateCertificationStreak,
  observeConvergenceWait,
  parseSpentWaitCensus,
  readSpentWaitCensus,
} from '../scenario-certification.js';
import {
  SCENARIO_REFUSAL,
  SPREAD_UNIT,
  describeProviderMachine,
  resolveConfigHostTopology,
} from '../scenario-host-topology.js';
import {resolveRunExitCode} from '../scenario-outcome.js';
import {
  buildUserActivityTableSql,
  createTableTopologyHelpers,
} from '../../scenarios/user-table-topology-helpers.js';

// Module-load captures — the harness tree's ambient-intrinsics rule.
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayIncludes = Function.call.bind(Array.prototype.includes);

const SHA = '0123456789abcdef0123456789abcdef01234567';
const OTHER_SHA = 'fedcba9876543210fedcba9876543210fedcba98';
const SCENARIO = 'certification-fixture';
const FIXTURE_PATH = new URL('../__fixtures__/certification-scenario.js',
  import.meta.url).pathname;
const SQL = buildUserActivityTableSql('t_table');
const GATE = 'split-leader-host-spread';
const KNOWN_WAIT = 'REPLICA_HANDLER_DEFAULT.SYNC_TIMEOUT_MS';
const KNOWN_OWNER = 'node/replica lifecycle';
const UNEXPECTED_WAIT = 'PING_TIMEOUT_MS';
const HOST_CLAIM = Object.freeze({
  minChildren: 2, minDistinctLeaders: 2, minReplicaSpreadPerChild: 2,
  requireChildLeader: true, requireParentDissolved: true,
  requirePolicyReplicaCount: true, spreadUnit: SPREAD_UNIT.HOST,
});
const LOAD_READY = Object.freeze({
  claimState: PUBLICATION_CONVERGENCE_CLAIM_STATE.CLAIMED_LOAD,
  publicationStatus: 'PUBLISHED', ready: true, reasons: []});
const LOAD_BLOCKED = Object.freeze({
  claimState: PUBLICATION_CONVERGENCE_CLAIM_STATE.CLAIMED_LOAD,
  pendingAckNodeIds: ['n3'], publicationStatus: 'ACK_PENDING', ready: false,
  reasons: ['publication_pending_ack:1']});
// What the STARTUP readiness admits on: not claimed, not ready.
const STARTUP_ADMISSION = Object.freeze({
  claimState: PUBLICATION_CONVERGENCE_CLAIM_STATE.NOT_CLAIMED_STARTUP,
  publicationStatus: 'PUBLISHING', ready: false,
  reasons: ['publication_not_published:PUBLISHING']});

// Five lab machines, each named by its observed boot id; one node each.
function labConfig(outputDir, machines = 5) {
  const hostInfo = [];
  const hosts = [];
  for (let index = 0; index < machines; index += 1) {
    hostInfo.push({internalIp: `192.168.86.${30 + index}`,
      machineId: `boot-${index}`});
    hosts.push(`tcp://127.0.0.1:${1000 + index}`);
  }
  return {docker: {hostInfo, hosts}, image: 'test:latest',
    nodesPerHost: machines >= 5 ? 1 : 2, outputDir, resourceLimits: {},
    size: 5, timeouts: {}};
}

function partition(id, leader, version, start, end) {
  return {leader_node_id: leader, partition_id: id, partition_key_end: end,
    partition_key_start: start, partition_version: version, replica_count: 3,
    state: 'NORMAL', table_id: 't'};
}

function voters(partitionId, nodeIds) {
  return arrayMap(nodeIds, (nodeId) => ({node_id: nodeId,
    partition_id: partitionId, raft_role: 'follower',
    replica_id: `${partitionId}-${nodeId}`, service_type: 'partition',
    status: 'active'}));
}

// The completed split, child leaders on n0 and n2 (two machines on the
// five-machine topology).
function threeVoters(leader, pool) {
  return [leader, ...arrayFilter(pool, (nodeId) => nodeId !== leader)]
    .slice(0, 3);
}

function splitTruth(leftLeader = 'n0', rightLeader = 'n2') {
  return {
    partitions: [partition('t_left', leftLeader, 2, null, '50'),
      partition('t_right', rightLeader, 2, '50', null)],
    services: [...voters('t_left', threeVoters(leftLeader, ['n1', 'n3'])),
      ...voters('t_right', threeVoters(rightLeader, ['n3', 'n1']))],
  };
}

function spentWaitLine(wait, nodeId) {
  return JSON.stringify({awaited: 'something', boundMs: 60000,
    elapsedMs: 60001, event: 'wait_bound_spent', lastObserved: {state: 'x'},
    level: 50, nodeId, repeats: 0, scope: {nodeId}, wait});
}

async function writeNodeLogs(config, nodes, plan) {
  for (const node of nodes) {
    if (plan.missingLogFor === node.id) {
      continue;
    }
    const path = fullLogDestPath(config.outputDir, SCENARIO, node.id);
    await mkdir(dirname(path), {recursive: true});
    if (plan.corruptLogFor === node.id) {
      await writeFile(path, 'not gzip');
      continue;
    }
    const lines = [JSON.stringify({level: 30, msg: 'booted'})];
    for (const spent of plan.spentWaits || []) {
      if (spent.nodeId === node.id) {
        lines.push(spentWaitLine(spent.wait, node.id));
      }
    }
    await writeFile(path, gzipSync(Buffer.from(lines.join('\n') + '\n')));
  }
}

async function defaultScenario(cluster, nodes, plan) {
  const helpers = createTableTopologyHelpers({scenarioName: SCENARIO,
    sql: SQL, tableName: 't_table'});
  for (const options of plan.scenarioConvergenceWaits || []) {
    await cluster.waitForConvergence(options);
  }
  await helpers.waitForSplitClaim(cluster, nodes, {budgetMs: 50,
    claim: {...HOST_CLAIM, spreadUnit: plan.gateUnit || SPREAD_UNIT.HOST},
    knownParentIds: new Set(['t-p1']), name: plan.gateName || GATE,
    now: Date.now, pollMs: 1, sleep: async () => {}, stableReadbacks: 2});
  if (plan.scenarioThrows) {
    throw new Error('scenario step failed');
  }
  return {};
}

function buildNodes(config, plan) {
  const topology = resolveConfigHostTopology(config);
  return arrayMap(topology.nodes, (placed) => ({
    hostIdentity: plan.unidentifiedNode === `n${placed.nodeIndex}` ?
      {hostId: null, missingReason: 'host_topology_undeclared'} :
      describeProviderMachine(config, placed.providerIndex),
    id: `n${placed.nodeIndex}`,
    query: async (sqlText) => (sqlText === SQL.SELECT_PARTITIONS ?
      plan.truth.partitions :
      plan.truth.services),
  }));
}

function fakeCluster(config, plan, counters) {
  counters.built += 1;
  const nodes = buildNodes(config, plan);
  const publication = [...(plan.publication || [LOAD_READY])];
  const cluster = {
    _incompleteCaptureWarning: plan.incompleteCapture || null,
    _staleSourceWarning: plan.staleSource || null,
    async _probeClusterActiveState(_deadline, options) {
      counters.probeModes.push(options?.mode);
      return {publicationConvergenceGate: publication.length > 1 ?
        publication.shift() :
        publication[0]};
    },
    getLogAnalyzer: () => ({analyze: () => ({summary: null}),
      runAnalyticalQueries: async () => ({}), writeAnalysis: async () => {}}),
    getLogCollector: () => ({collectContainerFallback: async () => {},
      getBuffer: () => [], writeOutput: async () => {}}),
    getNodes: () => nodes,
    getPlaybackManifest: () => ({files: {}, scenarioName: SCENARIO,
      warnings: []}),
    getTraceManifest: () => null,
    recordScenarioEvent: () => true,
    runFakeScenario: () => (plan.scenario || defaultScenario)(cluster,
      nodes, plan),
    setScenarioName: () => {},
    async start() {},
    async stop() {
      await writeNodeLogs(config, nodes, plan);
    },
    // The real cluster's waitForConvergence records through the same
    // observer (cluster-class-lifecycle-base.js).
    waitForConvergence: (options) => observeConvergenceWait(cluster, options,
      async () => {
        if (plan.stageWaitThrows && options === undefined) {
          throw new Error('convergence wait timed out');
        }
        return {voterTargets: {state: plan.voterState ||
          'voters_at_target'}};
      }),
  };
  return cluster;
}

function certificationRequest(overrides = {}) {
  return {
    clock: {budgetMs: 40, pollMs: 1},
    commitIdentity: {dirty: false, dirtyPathCount: 0, dirtyPaths: [],
      error: null, headSha: SHA, requestedSha: SHA,
      ...(overrides.commitIdentity || {})},
    image: {gitDirty: false, gitHash: SHA.slice(0, 12),
      ...(overrides.image || {})},
    requested: true,
    requestedSha: SHA,
  };
}

async function runFixture(planOverrides = {}, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'certification-'));
  const counters = {built: 0, probeModes: []};
  const plan = {truth: splitTruth(), ...planOverrides};
  try {
    const config = labConfig(join(dir, 'out'), options.machines);
    const result = await runScenarios(config,
      [{name: SCENARIO, path: FIXTURE_PATH}], {
        certification: options.certification === undefined ?
          certificationRequest(options.request) :
          options.certification,
        clusterFactory: (clusterConfig) => fakeCluster(clusterConfig, plan,
          counters),
        output: join(dir, 'report.json'), stateMachinePressurePreflight:
          {ready: true}, verbose: false,
      });
    return {...result, counters, entry: result.report.scenarios[0]};
  } finally {
    await rm(dir, {force: true, recursive: true});
  }
}

function conditionOf(certification, name) {
  return arrayFind(certification.conditions, (entry) =>
    entry.condition === name);
}

describe('certification-grade verdict (owner rulings 5 and 6)', () => {
  it('every condition observed: certified at the exact sha, each condition ' +
    'listed with its evidence, units explicit', async () => {
    const run = await runFixture();
    const certification = run.entry.certification;
    assert.equal(run.entry.outcome, 'passed', run.entry.error);
    assert.equal(certification.certified, true, JSON.stringify(
      certification.failures));
    assert.deepEqual(certification.failures, []);
    assert.equal(certification.sha, SHA);
    assert.deepEqual(arrayMap(certification.conditions, (entry) =>
      entry.condition), Object.values({
      a: CERTIFICATION_CONDITION.SCENARIO_PASSED,
      b: CERTIFICATION_CONDITION.NO_REFUSAL,
      c: CERTIFICATION_CONDITION.TOPOLOGY,
      d: CERTIFICATION_CONDITION.PUBLICATION_CONVERGENCE,
      e: CERTIFICATION_CONDITION.VOTERS_AT_TARGET,
      f: CERTIFICATION_CONDITION.HOST_SPREAD,
      g: CERTIFICATION_CONDITION.SPENT_WAITS,
      h: CERTIFICATION_CONDITION.COMMIT_IDENTITY,
    }));
    assert.equal(conditionOf(certification, 'topology').unit, 'host');
    assert.equal(conditionOf(certification, 'host_spread').unit, 'host');
    assert.deepEqual(conditionOf(certification, 'host_spread').evidence
      .leaderSpread, {members: ['host:boot-0', 'host:boot-2'], unit: 'host'});
    const publication = conditionOf(certification,
      'publication_convergence').evidence;
    assert.equal(publication.observed, true);
    assert.equal(publication.lastObserved.claimState,
      PUBLICATION_CONVERGENCE_CLAIM_STATE.CLAIMED_LOAD);
    assert.deepEqual(run.counters.probeModes, ['load']);
    assert.deepEqual(conditionOf(certification, 'voters_at_target').evidence
      .waits, [{error: null, state: 'voters_at_target',
      toleranceDeclared: false, toleranceReason: null}]);
    assert.ok(certification.notCertified.length >= 2);
    assert.equal(run.hasUncertified, false);
  });

  it('publication never converges: named failure, the bounded wait ' +
    'reported as a spent wait with its last observed state; outcome ' +
    'unchanged', async () => {
    const run = await runFixture({publication: [LOAD_BLOCKED]});
    assert.equal(run.entry.outcome, 'passed');
    assert.equal(run.entry.passed, true);
    assert.deepEqual(run.entry.certification.failures,
      [CERTIFICATION_FAILURE.PUBLICATION]);
    const evidence = conditionOf(run.entry.certification,
      'publication_convergence').evidence;
    assert.equal(evidence.observed, false);
    assert.equal(evidence.spentWait.wait,
      'CERTIFICATION_PUBLICATION_WAIT.BUDGET_MS');
    assert.equal(evidence.spentWait.boundMs, 40);
    assert.match(evidence.spentWait.awaited, /ready === true/u);
    assert.deepEqual(evidence.spentWait.lastObserved.pendingAckNodeIds,
      ['n3']);
    assert.ok(evidence.polls >= 1);
    assert.equal(run.hasUncertified, true);
    assert.equal(resolveRunExitCode({hasFailures: run.hasFailures,
      hasRefusals: run.hasRefusals, hasUncertified: run.hasUncertified}),
    EXIT_CODES.NOT_CERTIFIED);
  });

  it('startup admitted via not-claimed, then REAL convergence observed: ' +
    'certified; the not-claimed admission alone never certifies', async () => {
    const run = await runFixture({publication: [STARTUP_ADMISSION,
      LOAD_READY]});
    assert.equal(run.entry.certification.certified, true);
    assert.equal(conditionOf(run.entry.certification,
      'publication_convergence').evidence.polls, 2);
    const never = await runFixture({publication: [STARTUP_ADMISSION]});
    assert.deepEqual(never.entry.certification.failures,
      [CERTIFICATION_FAILURE.PUBLICATION]);
    // ready:true under the startup claim is not the load claim either.
    const startupReady = await runFixture({publication: [
      {...STARTUP_ADMISSION, ready: true}]});
    assert.deepEqual(startupReady.entry.certification.failures,
      [CERTIFICATION_FAILURE.PUBLICATION]);
  });

  it('voters: a declared tolerance, an under-target end, or a thrown ' +
    'stage wait each fail exactly that condition', async () => {
    const tolerated = await runFixture({scenarioConvergenceWaits: [
      {tolerateUnderReplication: {minVoters: 2, reason: 'node down'}}]});
    assert.deepEqual(tolerated.entry.certification.failures,
      [CERTIFICATION_FAILURE.VOTERS]);
    const under = await runFixture({voterState: 'under_target_voters'});
    assert.deepEqual(under.entry.certification.failures,
      [CERTIFICATION_FAILURE.VOTERS]);
    const thrown = await runFixture({stageWaitThrows: true});
    assert.deepEqual(thrown.entry.certification.failures,
      [CERTIFICATION_FAILURE.VOTERS]);
    assert.equal(conditionOf(thrown.entry.certification, 'voters_at_target')
      .evidence.waits[0].state, 'convergence_wait_failed');
    for (const run of [tolerated, under, thrown]) {
      assert.equal(run.entry.outcome, 'passed');
    }
  });

  it('host spread: a node-unit gate, a missing gate or a node without a ' +
    'declared machine fails the condition; the outcome is unchanged',
  async () => {
    const nodeUnit = await runFixture({gateUnit: SPREAD_UNIT.NODE});
    assert.equal(nodeUnit.entry.outcome, 'passed');
    assert.deepEqual(nodeUnit.entry.certification.failures,
      [CERTIFICATION_FAILURE.HOST_SPREAD]);
    const unnamed = await runFixture({gateName: 'some-other-gate'});
    assert.deepEqual(unnamed.entry.certification.failures,
      [CERTIFICATION_FAILURE.HOST_SPREAD]);
  });

  it('topology: a placed node without a machine identity fails the ' +
    'topology condition even on a certifiable config', async () => {
    // Node-unit claim so the scenario still passes; only identity changes.
    const run = await runFixture({gateUnit: SPREAD_UNIT.NODE,
      unidentifiedNode: 'n4'});
    assert.equal(run.entry.outcome, 'passed');
    assert.deepEqual(run.entry.certification.failures, [
      CERTIFICATION_FAILURE.TOPOLOGY, CERTIFICATION_FAILURE.HOST_SPREAD]);
  });

  it('5-on-4: certification REFUSES before any cluster; an ordinary run of ' +
    'the same placement runs, and both leaders on the shared machine still ' +
    'FAIL the host gate', async () => {
    const refused = await runFixture({}, {machines: 4});
    assert.equal(refused.counters.built, 0);
    assert.equal(refused.entry.outcome, 'refused');
    assert.equal(refused.entry.refusal.reason,
      SCENARIO_REFUSAL.CERTIFICATION_TOPOLOGY);
    assert.equal(refused.entry.refusal.maxNodesOnOneHost, 2);
    assert.match(refused.entry.error, /at most 1 node\(s\) per host, config places 2 on one host/u);
    assert.deepEqual(refused.entry.certification.failures, [
      CERTIFICATION_FAILURE.SCENARIO_NOT_PASSED, CERTIFICATION_FAILURE.REFUSED,
      CERTIFICATION_FAILURE.TOPOLOGY, CERTIFICATION_FAILURE.PUBLICATION,
      CERTIFICATION_FAILURE.VOTERS, CERTIFICATION_FAILURE.HOST_SPREAD,
      CERTIFICATION_FAILURE.SPENT_WAIT_EVIDENCE]);
    assert.equal(refused.hasRefusals, true);

    // n0 and n4 share boot-0 on the four-machine placement.
    const ordinary = await runFixture({truth: splitTruth('n0', 'n4')},
      {certification: null, machines: 4});
    assert.equal(ordinary.counters.built, 1);
    assert.equal(ordinary.entry.outcome, 'failed');
    assert.match(ordinary.entry.error, /leader_hosts_insufficient/u);
    assert.match(ordinary.entry.error, /spread unit: host/u);
    assert.equal(ordinary.entry.certification, CERTIFICATION_NOT_REQUESTED);
  });

  it('an ordinary run says it is not certification evidence and that ' +
    'startup did not claim publication convergence', async () => {
    const run = await runFixture({}, {certification: null});
    assert.equal(run.entry.outcome, 'passed');
    assert.equal(run.entry.certification, CERTIFICATION_NOT_REQUESTED);
    assert.equal(run.entry.certification.certified, false);
    assert.match(run.entry.certification.statement,
      /NOT certification evidence.*publication_convergence_not_claimed_startup/u);
    assert.deepEqual(run.counters.probeModes, []);
    assert.equal(run.hasUncertified, false);
  });

  it('spent waits: an unexpected wait fails; a known finding is listed ' +
    'with its owner and, under the policy constant, does not fail',
  async () => {
    const unexpected = await runFixture({spentWaits: [
      {nodeId: 'n2', wait: UNEXPECTED_WAIT}]});
    assert.equal(unexpected.entry.outcome, 'passed');
    assert.deepEqual(unexpected.entry.certification.failures,
      [CERTIFICATION_FAILURE.UNEXPECTED_SPENT_WAIT]);
    const spent = conditionOf(unexpected.entry.certification, 'spent_waits');
    assert.deepEqual(spent.evidence.unexpected, [UNEXPECTED_WAIT]);
    assert.equal(spent.evidence.byWait[0].expectedNoneInHealth, true);

    const known = await runFixture({spentWaits: [
      {nodeId: 'n1', wait: KNOWN_WAIT}, {nodeId: 'n3', wait: KNOWN_WAIT}]});
    assert.equal(CERTIFICATION_KNOWN_FINDING_SPENT_WAIT_POLICY,
      KNOWN_FINDING_SPENT_WAIT_POLICY_MODE.LIST_WITH_OWNER);
    assert.equal(known.entry.certification.certified, true);
    assert.deepEqual(conditionOf(known.entry.certification, 'spent_waits')
      .evidence.knownFindings, [{lines: 2, owner: KNOWN_OWNER,
      wait: KNOWN_WAIT}]);
  });

  it('spent-wait evidence: a missing or unreadable node log, or an ' +
    'incomplete capture, leaves the verdict uncertified (named)', async () => {
    for (const plan of [{missingLogFor: 'n3'}, {corruptLogFor: 'n1'},
      {incompleteCapture: 'Incomplete log capture for node(s) n2'}]) {
      const run = await runFixture(plan);
      assert.equal(run.entry.outcome, 'passed');
      assert.deepEqual(run.entry.certification.failures,
        [CERTIFICATION_FAILURE.SPENT_WAIT_EVIDENCE], JSON.stringify(plan));
    }
  });

  it('commit identity: a dirty tree, another sha, another image or stale ' +
    'booted source is not certified', async () => {
    for (const request of [{commitIdentity: {dirty: true, dirtyPathCount: 1}},
      {commitIdentity: {headSha: OTHER_SHA}},
      // HEAD and image agree with each other but not with the request.
      {commitIdentity: {requestedSha: OTHER_SHA}},
      {image: {gitHash: OTHER_SHA.slice(0, 12)}},
      {image: {gitDirty: true}}]) {
      const run = await runFixture({}, {request});
      assert.equal(run.entry.outcome, 'passed');
      assert.deepEqual(run.entry.certification.failures,
        [CERTIFICATION_FAILURE.COMMIT_IDENTITY], JSON.stringify(request));
      assert.equal(run.entry.certification.sha, null);
    }
    const stale = await runFixture({staleSource: 'Stale source detected'});
    assert.deepEqual(stale.entry.certification.failures,
      [CERTIFICATION_FAILURE.COMMIT_IDENTITY]);
  });

  it('a failed scenario is never certified (the stage never ran)',
    async () => {
      const run = await runFixture({scenarioThrows: true});
      assert.equal(run.entry.outcome, 'failed');
      assert.deepEqual(run.entry.certification.failures, [
        CERTIFICATION_FAILURE.SCENARIO_NOT_PASSED,
        CERTIFICATION_FAILURE.PUBLICATION, CERTIFICATION_FAILURE.VOTERS]);
    });
});

describe('spent-wait census and policy', () => {
  it('the census tables are read, not restated: known findings with ' +
    'owners, the expected-none list', () => {
    const census = readSpentWaitCensus();
    assert.equal(census.error, null);
    const row = arrayFind(census.knownFindings, (entry) =>
      arrayIncludes(entry.names, KNOWN_WAIT));
    assert.equal(row.owner, KNOWN_OWNER);
    assert.ok(arrayIncludes(census.expectedNone, UNEXPECTED_WAIT));
    assert.ok(arrayFind(census.knownFindings, (entry) =>
      arrayIncludes(entry.names, 'BACKGROUND_MAX_ATTEMPTS')));
    assert.equal(parseSpentWaitCensus('# nothing').error,
      'census classification tables not found');
  });

  it('the policy constant decides known findings; a compound wait name ' +
    'matches its census row; unexpected always fails', () => {
    const census = readSpentWaitCensus();
    const collected = {lines: [
      {nodeId: 'n0', wait: 'CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS + ' +
        'BACKGROUND_MAX_ATTEMPTS'},
      {nodeId: 'n1', wait: KNOWN_WAIT}],
    logs: [], missingNodeIds: [], nodeCount: 5, unreadable: []};
    const listed = classifySpentWaits(collected, census,
      KNOWN_FINDING_SPENT_WAIT_POLICY_MODE.LIST_WITH_OWNER);
    assert.equal(listed.met, true);
    assert.equal(listed.evidence.knownFindings.length, 2);
    const strict = classifySpentWaits(collected, census,
      KNOWN_FINDING_SPENT_WAIT_POLICY_MODE.FAIL);
    assert.deepEqual(strict.failures,
      [CERTIFICATION_FAILURE.KNOWN_FINDING_SPENT_WAIT]);
    const unknownPart = classifySpentWaits({...collected, lines: [
      {nodeId: 'n0', wait: `${KNOWN_WAIT} + SOMETHING_ELSE`}]}, census);
    assert.deepEqual(unknownPart.failures,
      [CERTIFICATION_FAILURE.UNEXPECTED_SPENT_WAIT]);
    const noCensus = classifySpentWaits({...collected, lines: []},
      {error: 'gone', expectedNone: [], knownFindings: []});
    assert.deepEqual(noCensus.failures,
      [CERTIFICATION_FAILURE.SPENT_WAIT_EVIDENCE]);
  });
});

describe('the certification streak rule', () => {
  const certified = (sha) => ({certification: {certified: true,
    requested: true, sha}, outcome: 'passed', passed: true});
  const uncertifiedPass = {certification: CERTIFICATION_NOT_REQUESTED,
    outcome: 'passed', passed: true};
  const failedCertification = {certification: {certified: false,
    requested: true, sha: null}, outcome: 'passed', passed: true};
  const fail = {outcome: 'failed', passed: false};
  const refused = {outcome: 'refused', passed: false,
    refusal: {reason: 'refused_certification_topology'}};

  it('three certified at one sha is done', () => {
    assert.deepEqual(evaluateCertificationStreak(
      [certified(SHA), certified(SHA), certified(SHA)], 3),
    {consecutive: 3, count: 3, done: true, endedBy: null, sha: SHA});
  });

  it('refused is not a sample and an uncertified pass does not count',
    () => {
      const streak = evaluateCertificationStreak([certified(SHA), refused,
        uncertifiedPass, certified(SHA), uncertifiedPass, certified(SHA)], 3);
      assert.equal(streak.count, 3);
      assert.equal(streak.done, true);
      assert.equal(evaluateCertificationStreak([uncertifiedPass,
        uncertifiedPass, uncertifiedPass], 3).count, 0);
    });

  it('a FAIL resets, a failed certification resets, another sha ends it',
    () => {
      assert.deepEqual(evaluateCertificationStreak([certified(SHA), fail,
        certified(SHA), certified(SHA)], 3), {consecutive: 3, count: 1,
        done: false, endedBy: 'failed', sha: SHA});
      assert.equal(evaluateCertificationStreak([certified(SHA),
        failedCertification, certified(SHA), certified(SHA)], 3).count, 1);
      assert.deepEqual(evaluateCertificationStreak([certified(SHA),
        certified(SHA), certified(OTHER_SHA)], 3), {consecutive: 3,
        count: 2, done: false, endedBy: 'other_sha', sha: SHA});
    });

  it('a certified block without a full sha is not a certified sample', () => {
    assert.equal(evaluateCertificationStreak([certified('abc'),
      certified(SHA)], 1).count, 0);
  });
});
