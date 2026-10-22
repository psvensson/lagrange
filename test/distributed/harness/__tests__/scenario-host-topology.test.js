import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {
  SCENARIO_REFUSAL,
  SPREAD_UNIT,
  describeProviderMachine,
  evaluateScenarioTopologyRequirement,
  requireSpreadUnit,
  resolveConfigHostTopology,
} from '../scenario-host-topology.js';
import {
  UNMET_FACT,
  buildNodeHostIndex,
  evaluateSplitSpreadClaim,
} from '../scenario-ground-truth.js';
import {
  buildUserActivityTableSql,
  createTableTopologyHelpers,
} from '../../scenarios/user-table-topology-helpers.js';
import {createScenarioStepRunner} from '../scenario-step-log.js';
import {describeScenarioRefusal} from '../scenario-outcome.js';
import {
  SCENARIO_TOPOLOGY_REQUIREMENT as PUBLIC_PATH_REQUIREMENT,
} from '../../scenarios/public-path-multinode-baseline.js';
import {
  SCENARIO_TOPOLOGY_REQUIREMENT as USER_TABLE_REQUIREMENT,
} from '../../scenarios/user-table-leader-placement-spread.js';

// Module-load captures — the harness tree's ambient-intrinsics rule.
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayFilter = Function.call.bind(Array.prototype.filter);

function readConfig(name) {
  return JSON.parse(readFileSync(fileURLToPath(new URL(
    `../../config/${name}`, import.meta.url)), 'utf8'));
}

// The lab's five-node formation: four machines, node 0 and node 4 on the
// same one (provider 0), each machine named by its observed boot id.
const LAB_FIVE_NODES_FOUR_HOSTS = Object.freeze({
  docker: {
    hostInfo: [
      {internalIp: '192.168.86.32', machineId: 'boot-0'},
      {internalIp: '192.168.86.27', machineId: 'boot-1'},
      {internalIp: '192.168.86.34', machineId: 'boot-2'},
      {internalIp: '192.168.86.41', machineId: 'boot-3'},
    ],
    hosts: ['tcp://127.0.0.1:1', 'tcp://127.0.0.1:2', 'tcp://127.0.0.1:3',
      'tcp://127.0.0.1:4'],
  },
  nodesPerHost: 2,
  size: 5,
});

describe('scenario topology requirement: refused before anything starts ' +
  '(R1)', () => {
  it('the two scenarios declare their unit and host minimum', () => {
    assert.deepEqual({...PUBLIC_PATH_REQUIREMENT},
      {minDistinctHosts: 2, spreadUnit: SPREAD_UNIT.HOST});
    assert.deepEqual({...USER_TABLE_REQUIREMENT},
      {minDistinctHosts: 0, spreadUnit: SPREAD_UNIT.NODE});
  });

  it('the lab 5-node/4-host config carries the public-path claim', () => {
    const topology = resolveConfigHostTopology(LAB_FIVE_NODES_FOUR_HOSTS);
    assert.equal(topology.distinctHosts, 4);
    assert.deepEqual(arrayMap(topology.nodes, (node) => node.hostId),
      ['host:boot-0', 'host:boot-1', 'host:boot-2', 'host:boot-3',
        'host:boot-0']);
    assert.equal(evaluateScenarioTopologyRequirement(
      PUBLIC_PATH_REQUIREMENT, LAB_FIVE_NODES_FOUR_HOSTS), null);
  });

  it('every single-host local config is refused for the public-path claim, ' +
    'naming required vs available', () => {
    for (const name of ['local-three-node.json',
      'public-path-baseline-three-node.json',
      'user-table-leader-spread-three-node.json']) {
      const refusal = evaluateScenarioTopologyRequirement(
        PUBLIC_PATH_REQUIREMENT, readConfig(name));
      assert.equal(refusal.reason,
        SCENARIO_REFUSAL.INSUFFICIENT_HOST_TOPOLOGY, name);
      assert.equal(refusal.required, 2);
      assert.equal(refusal.available, null, name);
      assert.deepEqual(refusal.missingReasons, ['host_topology_undeclared']);
      assert.match(describeScenarioRefusal(refusal),
        /refused_insufficient_host_topology: requires >= 2 distinct host\(s\), config provides unknown \(host_topology_undeclared\)/u);
    }
    // The node-unit scenario needs no host minimum: it runs locally.
    assert.equal(evaluateScenarioTopologyRequirement(
      USER_TABLE_REQUIREMENT, readConfig('local-three-node.json')), null);
  });

  it('two providers on one machine are one host: refused, available 1',
    () => {
      const config = {docker: {
        hostInfo: [{internalIp: '10.0.0.1', machineId: 'boot-x'},
          {internalIp: '10.0.0.2', machineId: 'boot-x'}],
        hosts: ['tcp://127.0.0.1:1', 'tcp://127.0.0.1:2'],
      }, size: 3};
      const refusal = evaluateScenarioTopologyRequirement(
        PUBLIC_PATH_REQUIREMENT, config);
      assert.equal(refusal.available, 1);
      assert.deepEqual(refusal.hostIds, ['host:boot-x']);
    });

  it('missing topology fails closed: endpoints alone, a provider without ' +
    'hostInfo, or mixed sources never count as hosts', () => {
    const endpointsOnly = {docker: {hosts: ['tcp://a:1', 'tcp://b:2']},
      size: 2};
    const oneUndeclared = {docker: {hostInfo: [{internalIp: '10.0.0.1'}],
      hosts: ['tcp://a:1', 'tcp://b:2']}, size: 2};
    const mixed = {docker: {hostInfo: [
      {internalIp: '10.0.0.1', machineId: 'boot-a'}, {internalIp: '10.0.0.2'}],
    hosts: ['tcp://a:1', 'tcp://b:2']}, size: 2};
    for (const [config, reason] of [
      [endpointsOnly, 'host_topology_undeclared'],
      [oneUndeclared, 'host_topology_undeclared'],
      [mixed, 'host_identity_sources_mixed']]) {
      const refusal = evaluateScenarioTopologyRequirement(
        PUBLIC_PATH_REQUIREMENT, config);
      assert.equal(refusal.available, null);
      assert.deepEqual(refusal.missingReasons, [reason]);
    }
    assert.equal(describeProviderMachine(endpointsOnly, 1).hostId, null);
  });

  it('an invalid declaration is refused, never run as if absent', () => {
    for (const requirement of [{minDistinctHosts: 2},
      {minDistinctHosts: 2, spreadUnit: 'rack'},
      {minDistinctHosts: -1, spreadUnit: 'host'}]) {
      assert.equal(evaluateScenarioTopologyRequirement(requirement,
        LAB_FIVE_NODES_FOUR_HOSTS).reason,
      SCENARIO_REFUSAL.INVALID_REQUIREMENT);
    }
  });

  it('a spread count without its unit is invalid evidence (R3)', () => {
    assert.throws(() => requireSpreadUnit({distinctLeaderNodes: 2},
      SPREAD_UNIT.NODE, 'reader'), /reader: spread_unit_absent/u);
    assert.throws(() => requireSpreadUnit({spreadUnit: 'host'},
      SPREAD_UNIT.NODE, 'reader'), /reader: spread_unit_mismatch/u);
    assert.deepEqual(requireSpreadUnit({spreadUnit: 'node'}, SPREAD_UNIT.NODE,
      'reader'), {spreadUnit: 'node'});
  });
});

// ---------------------------------------------------------------------------
// R2: the public-path split/leader-HOST-spread gate over a synthetic
// 5-node/4-host topology (no containers), step by step.

const SQL = buildUserActivityTableSql('t_table');
const HOST_CLAIM = Object.freeze({
  minChildren: 2, minDistinctLeaders: 2, minReplicaSpreadPerChild: 2,
  requireChildLeader: true, requireParentDissolved: true,
  requirePolicyReplicaCount: true, spreadUnit: SPREAD_UNIT.HOST,
});
const NODE_CLAIM = Object.freeze({...HOST_CLAIM, spreadUnit: SPREAD_UNIT.NODE});

function labNodes(topologyRows) {
  const topology = resolveConfigHostTopology(LAB_FIVE_NODES_FOUR_HOSTS);
  return arrayMap(topology.nodes, (placed) => ({
    hostIdentity: describeProviderMachine(LAB_FIVE_NODES_FOUR_HOSTS,
      placed.providerIndex),
    id: `n${placed.nodeIndex}`,
    query: async (sqlText) => (sqlText === SQL.SELECT_PARTITIONS ?
      topologyRows.current.partitions :
      topologyRows.current.services),
  }));
}

function partition(id, leader, version, start, end, state = 'NORMAL') {
  return {leader_node_id: leader, partition_id: id, partition_key_end: end,
    partition_key_start: start, partition_version: version, replica_count: 3,
    state, table_id: 't'};
}

function voters(partitionId, nodeIds) {
  return arrayMap(nodeIds, (nodeId) => ({node_id: nodeId,
    partition_id: partitionId, raft_role: 'follower',
    replica_id: `${partitionId}-${nodeId}`, service_type: 'partition',
    status: 'active'}));
}

function children(leftLeader, rightLeader, leftVoters, rightVoters) {
  return {
    partitions: [partition('t_left', leftLeader, 2, null, '50'),
      partition('t_right', rightLeader, 2, '50', null)],
    services: [...voters('t_left', leftVoters),
      ...voters('t_right', rightVoters)],
  };
}

const PROGRESSION = Object.freeze([
  {name: 'unsplit', truth: {
    partitions: [partition('t-p1', 'n0', 1, null, null)],
    services: voters('t-p1', ['n0', 'n1', 'n2'])},
  unmet: [UNMET_FACT.LEADER_HOSTS_INSUFFICIENT,
    UNMET_FACT.SPLIT_CHILDREN_MISSING]},
  {name: 'splitting', truth: {
    partitions: [partition('t-p1', 'n0', 1, null, null, 'SPLITTING'),
      partition('t_left', 'n1', 2, null, '50', 'SPLITTING'),
      partition('t_right', 'n2', 2, '50', null, 'SPLITTING')],
    services: [...voters('t-p1', ['n0', 'n1', 'n2']),
      ...voters('t_left', ['n1', 'n2', 'n3']),
      ...voters('t_right', ['n2', 'n3', 'n0'])]},
  unmet: [UNMET_FACT.PARENT_NOT_DISSOLVED, UNMET_FACT.PARTITION_TRANSITIONAL]},
  {name: 'children under-replicated',
    truth: children('n1', 'n2', ['n1', 'n2'], ['n2', 'n3']),
    unmet: [UNMET_FACT.CHILD_ACTIVE_VOTER_COUNT]},
  {name: 'both leaders on one node',
    truth: children('n1', 'n1', ['n1', 'n2', 'n3'], ['n1', 'n2', 'n3']),
    unmet: [UNMET_FACT.LEADER_HOSTS_INSUFFICIENT]},
  {name: 'two leaders on the SHARED host (n0 and n4)',
    truth: children('n0', 'n4', ['n0', 'n1', 'n4'], ['n4', 'n2', 'n0']),
    unmet: [UNMET_FACT.LEADER_HOSTS_INSUFFICIENT]},
]);

function gateHarness() {
  const rows = {current: null};
  const nodes = labNodes(rows);
  const events = [];
  const cluster = {recordScenarioEvent: (type, entityId, details) => {
    events.push({details, entityId, type});
    return true;
  }};
  let clockMs = 0;
  const knownParentIds = new Set();
  const helpers = createTableTopologyHelpers({scenarioName: 'synthetic',
    sql: SQL, tableName: 't_table'});
  const gate = (claim) => ({budgetMs: 2000, claim, knownParentIds,
    name: 'split-leader-host-spread', now: () => clockMs, pollMs: 500,
    sleep: async (ms) => {
      clockMs += ms;
    },
    stableReadbacks: 2});
  return {cluster, events, gate, helpers, nodes, rows};
}

function unmetFacts(record) {
  return [...new Set(arrayMap(record.unmet, (entry) => entry.fact))].sort();
}

describe('public-path host-spread gate over a synthetic 5-node/4-host ' +
  'topology (R2)', () => {
  it('refuses every intermediate shape with the named fact and a record, ' +
    'then passes the truthful one', async () => {
    const harness = gateHarness();
    for (const step of PROGRESSION) {
      harness.rows.current = step.truth;
      await assert.rejects(harness.helpers.waitForSplitClaim(harness.cluster,
        harness.nodes, harness.gate(HOST_CLAIM)), (error) => {
        assert.match(error.message, /spread unit: host/u, step.name);
        return true;
      }, step.name);
      const record = harness.events.at(-1).details;
      assert.equal(harness.events.at(-1).type, 'scenario.gate');
      assert.equal(record.passed, false, step.name);
      assert.equal(record.spreadUnit, SPREAD_UNIT.HOST);
      assert.deepEqual(unmetFacts(record), [...step.unmet].sort(), step.name);
      assert.equal(record.nodeHosts.length, 5);
    }
    // The shared-host step: one host by the host claim, two nodes by the
    // node claim - the unit decides, and the record says which.
    const shared = evaluateSplitSpreadClaim({
      claim: NODE_CLAIM, hostIndex: buildNodeHostIndex(harness.nodes),
      knownParentIds: new Set(['t-p1']),
      partitionRows: PROGRESSION[4].truth.partitions,
      serviceRows: PROGRESSION[4].truth.services});
    assert.equal(shared.satisfied, true);
    assert.deepEqual(shared.leaderSpread, {members: ['n0', 'n4'],
      unit: SPREAD_UNIT.NODE});
    assert.deepEqual(shared.leaderHosts, ['host:boot-0']);

    harness.rows.current = children('n0', 'n2', ['n0', 'n1', 'n2'],
      ['n2', 'n3', 'n4']);
    const proven = await harness.helpers.waitForSplitClaim(harness.cluster,
      harness.nodes, harness.gate(HOST_CLAIM));
    const record = proven.record;
    assert.equal(record.passed, true);
    assert.equal(record.stableReadbacks, 2);
    assert.equal(record.spreadUnit, SPREAD_UNIT.HOST);
    assert.deepEqual(record.leaderSpread,
      {members: ['host:boot-0', 'host:boot-2'], unit: SPREAD_UNIT.HOST});
    assert.deepEqual(record.unmet, []);
    assert.deepEqual(record.parentIdsObserved, ['t-p1']);
    assert.deepEqual(arrayMap(arrayFilter(record.partitions,
      (entry) => entry.role === 'child'), (entry) => entry.activeVoterCount),
    [3, 3]);
    assert.deepEqual([...new Set(arrayMap(record.nodeHosts,
      (entry) => entry.host))].sort(),
    ['host:boot-0', 'host:boot-1', 'host:boot-2', 'host:boot-3']);
    assert.deepEqual(record.unmetTally, {});
    assert.equal(record.readbacks, 2);
    assert.equal(harness.events.at(-1).details, record);
  });

  it('a claim needing more hosts than the cluster has is refused at once, ' +
    'recorded, with no readback (M9)', async () => {
    const harness = gateHarness();
    harness.rows.current = children('n0', 'n2', ['n0', 'n1', 'n2'],
      ['n2', 'n3', 'n4']);
    await assert.rejects(harness.helpers.waitForSplitClaim(harness.cluster,
      harness.nodes, harness.gate({...HOST_CLAIM, minDistinctLeaders: 5})),
    /cluster_hosts_insufficient\(unit="host" observed=4 required=5\)/u);
    const record = harness.events.at(-1).details;
    assert.equal(record.passed, false);
    assert.equal(record.readbacks, 0);
    // A node with no host identity leaves the host count unknown.
    const blind = gateHarness();
    blind.nodes[3].hostIdentity = describeProviderMachine({}, 0);
    blind.rows.current = harness.rows.current;
    await assert.rejects(blind.helpers.waitForSplitClaim(blind.cluster,
      blind.nodes, blind.gate(HOST_CLAIM)), /host_identity_unknown/u);
    assert.equal(blind.events.at(-1).details.readbacks, 0);
    // A claim with no unit is invalid before any readback.
    const unitless = gateHarness();
    unitless.rows.current = harness.rows.current;
    await assert.rejects(unitless.helpers.waitForSplitClaim(unitless.cluster,
      unitless.nodes, unitless.gate({...HOST_CLAIM, spreadUnit: undefined})),
    /spread_unit_invalid/u);
    assert.equal(unitless.events.at(-1).details.spreadUnit, null);
  });

  it('a readback that throws still records the failed gate with the error',
    async () => {
      const harness = gateHarness();
      harness.nodes.forEach((node) => {
        node.query = async () => {
          throw new Error('pg wire reset');
        };
      });
      await assert.rejects(harness.helpers.waitForSplitClaim(harness.cluster,
        harness.nodes, harness.gate(HOST_CLAIM)), /pg wire reset/u);
      const record = harness.events.at(-1).details;
      assert.equal(record.passed, false);
      assert.equal(record.error, 'pg wire reset');
      assert.deepEqual(unmetFacts(record), [UNMET_FACT.READBACK_FAILED]);
    });

  it('a failing step records scenario.step failed and stamps the error ' +
    'with the step (M10)', async () => {
    const events = [];
    const cluster = {recordScenarioEvent: (type, entityId, details) => {
      events.push({details, entityId, type});
      return true;
    }};
    let clock = 100;
    const step = createScenarioStepRunner(cluster, 'synthetic',
      () => (clock += 5));
    const error = await step('split-leader-host-spread', async () => {
      throw new Error('gate refused');
    }).catch((caught) => caught);
    assert.deepEqual(error.scenarioStep,
      {scenarioName: 'synthetic', step: 'split-leader-host-spread'});
    assert.deepEqual(arrayMap(events, (event) => event.details.status),
      ['started', 'failed']);
    assert.equal(events[1].details.error, 'gate refused');
  });
});
