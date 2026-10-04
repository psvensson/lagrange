import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {Cluster, NodeHandle, distributeNodes} from '../cluster.js';
import {
  HOST_AUTHORITY,
  UNMET_FACT,
  buildNodeHostIndex,
  countDistinctHosts,
  evaluateSplitSpreadClaim,
  isActiveVoterReplicaRow,
  pollGroundTruthClaim,
} from '../scenario-ground-truth.js';
import {
  differentialTopologyCount,
  generateDifferentialTopology,
  oldGatePasses,
} from './scenario-ground-truth-differential-oracle.js';

// Module-load captures — the harness tree's ambient-intrinsics rule.
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);

const CLAIM = Object.freeze({
  minChildren: 2,
  minDistinctLeaders: 2,
  minReplicaSpreadPerChild: 2,
  requireChildLeader: true,
  requireParentDissolved: true,
  requirePolicyReplicaCount: true,
  spreadUnit: 'host',
});

function hostNode(id, providerIndex) {
  return {
    hostIdentity: {
      hostId: `host:10.0.0.${providerIndex + 1}`,
      label: `10.0.0.${providerIndex + 1}`,
      providerIndex,
    },
    id,
  };
}

const FIVE_NODES_FOUR_HOSTS = Object.freeze([
  hostNode('n0', 0), hostNode('n1', 1), hostNode('n2', 2),
  hostNode('n3', 3), hostNode('n4', 0),
]);

function partitionRow(partitionId, leader, version, keyStart, keyEnd) {
  return {
    leader_node_id: leader,
    partition_id: partitionId,
    partition_key_end: keyEnd,
    partition_key_start: keyStart,
    partition_version: version,
    replica_count: 3,
    state: version === 1 ? 'normal' : 'NORMAL',
    table_id: 't',
  };
}

function serviceRow(partitionId, nodeId, status = 'active',
  raftRole = 'follower') {
  return {
    node_id: nodeId,
    partition_id: partitionId,
    raft_role: raftRole,
    replica_id: `${partitionId}-${nodeId}`,
    service_type: 'partition',
    status,
  };
}

const PARENT = partitionRow('t-p1', 'n0', 1, null, null);
const LEFT = partitionRow('t_left', 'n1', 2, null, '50.0');
const RIGHT = partitionRow('t_right', 'n2', 2, '50.0', null);

function truthfulServices() {
  return [
    serviceRow('t_left', 'n0'), serviceRow('t_left', 'n1'),
    serviceRow('t_left', 'n2'), serviceRow('t_right', 'n1'),
    serviceRow('t_right', 'n2'), serviceRow('t_right', 'n3'),
  ];
}

function evaluate(partitionRows, serviceRows, knownParentIds = new Set(),
  nodes = FIVE_NODES_FOUR_HOSTS) {
  return evaluateSplitSpreadClaim({
    claim: CLAIM,
    hostIndex: buildNodeHostIndex(nodes),
    knownParentIds,
    partitionRows,
    serviceRows,
  });
}

function unmetFacts(evaluation) {
  return arrayMap(evaluation.unmet, (entry) => entry.fact);
}

describe('scenario ground truth: active voter replica (W4/W8)', () => {
  it('counts only active rows with a voter raft role', () => {
    assert.equal(isActiveVoterReplicaRow(serviceRow('p', 'n')), true);
    assert.equal(isActiveVoterReplicaRow(
      serviceRow('p', 'n', 'active', 'leader')), true);
    assert.equal(isActiveVoterReplicaRow(
      serviceRow('p', 'n', 'active', 'candidate')), true);
    for (const [status, role] of [
      ['active', 'learner'], ['syncing', 'learner'], ['syncing', null],
      ['active', null], ['removing', 'follower'], ['failed', 'learner'],
      ['pending', null], ['creating', null], ['syncing', 'follower'],
      ['stopped', 'follower'],
    ]) {
      assert.equal(isActiveVoterReplicaRow(serviceRow('p', 'n', status, role)),
        false, `${status}/${role}`);
    }
    assert.equal(isActiveVoterReplicaRow({
      ...serviceRow('p', 'n'), service_type: 'message_group',
    }), false);
  });

  it('a learner, a syncing row and a retiring replica do not fill a ' +
    'child to its policy replica count', () => {
    const services = arrayFilter(truthfulServices(),
      (row) => row.partition_id !== 't_left');
    services.push(serviceRow('t_left', 'n1'));
    services.push(serviceRow('t_left', 'n2', 'active', 'learner'));
    services.push(serviceRow('t_left', 'n3', 'syncing', 'follower'));
    services.push(serviceRow('t_left', 'n0', 'removing', 'follower'));
    const evaluation = evaluate([LEFT, RIGHT], services);
    assert.equal(evaluation.satisfied, false);
    const mismatch = arrayFilter(evaluation.unmet, (entry) =>
      entry.fact === UNMET_FACT.CHILD_ACTIVE_VOTER_COUNT)[0];
    assert.deepEqual(
      {observed: mismatch.observed, partitionId: mismatch.partitionId,
        required: mismatch.required},
      {observed: 1, partitionId: 't_left', required: 3});
  });
});

describe('scenario ground truth: distinct hosts (W3/W8)', () => {
  it('two nodes on one provider are one host; a node id is never a host',
    () => {
      const index = buildNodeHostIndex(FIVE_NODES_FOUR_HOSTS);
      assert.equal(index.authority, HOST_AUTHORITY);
      assert.deepEqual(countDistinctHosts(['n0', 'n4'], index),
        {hosts: ['host:10.0.0.1'], unknownNodeIds: []});
      assert.deepEqual(countDistinctHosts(['n0', 'n1', 'n4'], index).hosts,
        ['host:10.0.0.1', 'host:10.0.0.2']);
      const bare = buildNodeHostIndex([{id: 'n9'}]);
      assert.deepEqual(countDistinctHosts(['n9'], bare),
        {hosts: [], unknownNodeIds: ['n9']});
    });

  it('the harness authority places five nodes on four providers with ' +
    'the seed and node 4 sharing provider 0, and stamps it on handles',
  () => {
    const providers = [{}, {}, {}, {}];
    assert.deepEqual(distributeNodes(5, providers, 2), [0, 1, 2, 3, 0]);
    const config = {docker: {
      hostInfo: [{internalIp: '192.168.86.32'}, {internalIp: '192.168.86.27'}],
      hosts: ['tcp://127.0.0.1:1', 'tcp://127.0.0.1:2'],
    }};
    const described = Cluster.prototype._describeProviderHost.call(
      {_config: config}, 0);
    assert.deepEqual({...described},
      {hostId: 'host:192.168.86.32', label: '192.168.86.32',
        missingReason: null, providerIndex: 0,
        source: 'provider_internal_address'});
    const handle = new NodeHandle('n0', 'c0', '10.0.0.1', 'seed', null,
      undefined, {hostIdentity: described});
    assert.equal(handle.hostIdentity, described);
    assert.equal(new NodeHandle('n1', 'c1', '10.0.0.2', 'joiner', null)
      .hostIdentity, null);
  });

  it('a child whose voters sit on one host is not spread', () => {
    const services = arrayFilter(truthfulServices(),
      (row) => row.partition_id !== 't_left');
    services.push(serviceRow('t_left', 'n0'), serviceRow('t_left', 'n4'));
    services.push(serviceRow('t_left', 'n1'));
    const hostsOneOnly = [hostNode('n0', 0), hostNode('n1', 0),
      hostNode('n2', 1), hostNode('n3', 2), hostNode('n4', 0)];
    const evaluation = evaluate([LEFT, RIGHT], services, new Set(),
      hostsOneOnly);
    assert.ok(arrayIncludes(unmetFacts(evaluation),
      UNMET_FACT.CHILD_REPLICA_HOSTS_INSUFFICIENT));
  });
});

describe('scenario ground truth: split claim', () => {
  it('W2 passes a dissolved parent with spread children and lists facts',
    () => {
      const evaluation = evaluate([LEFT, RIGHT], truthfulServices(),
        new Set(['t-p1']));
      assert.deepEqual(evaluation.unmet, []);
      assert.equal(evaluation.satisfied, true);
      assert.deepEqual(evaluation.leaderHosts,
        ['host:10.0.0.2', 'host:10.0.0.3']);
      assert.deepEqual(arrayMap(evaluation.partitions,
        (entry) => [entry.partitionId, entry.role, entry.activeVoterCount]),
      [['t_left', 'child', 3], ['t_right', 'child', 3]]);
    });

  it('the lingering parent is a parent, not a third partition', () => {
    const known = new Set();
    const evaluation = evaluate([PARENT, LEFT, RIGHT],
      [...truthfulServices(), serviceRow('t-p1', 'n0')], known);
    assert.deepEqual(unmetFacts(evaluation),
      [UNMET_FACT.PARENT_NOT_DISSOLVED]);
    assert.deepEqual([...known], ['t-p1']);
    // The row gone but an active parent replica left: still not dissolved.
    const residual = evaluate([LEFT, RIGHT],
      [...truthfulServices(), serviceRow('t-p1', 'n0')], known);
    assert.deepEqual(unmetFacts(residual), [UNMET_FACT.PARENT_NOT_DISSOLVED]);
  });

  it('an unsplit table never satisfies a split claim', () => {
    const evaluation = evaluate([PARENT], [serviceRow('t-p1', 'n0')]);
    assert.ok(arrayIncludes(unmetFacts(evaluation),
      UNMET_FACT.SPLIT_CHILDREN_MISSING));
  });

  it('a leader without an active voter replica there is no leader', () => {
    const evaluation = evaluate(
      [LEFT, {...RIGHT, leader_node_id: 'n0'}], truthfulServices(),
      new Set(['t-p1']));
    assert.ok(arrayIncludes(unmetFacts(evaluation),
      UNMET_FACT.CHILD_LEADER_NOT_ACTIVE_VOTER));
  });
});

describe('scenario ground truth: stability (W5)', () => {
  function sequencePoll(sequence, stableReadbacksRequired = 2) {
    let clock = 0;
    let index = 0;
    return pollGroundTruthClaim({
      budgetMs: sequence.length * 10,
      evaluate: (shape) => shape,
      now: () => clock,
      pollMs: 10,
      readback: async () => sequence[Math.min(index++, sequence.length - 1)],
      sleep: async (ms) => {
        clock += ms;
      },
      stableReadbacksRequired,
    });
  }
  const ok = (fingerprint) => ({fingerprint, satisfied: true, unmet: []});
  const no = {fingerprint: 'x', satisfied: false,
    unmet: [{fact: UNMET_FACT.PARENT_NOT_DISSOLVED}]};

  it('a single transient satisfying readback does not pass', async () => {
    const outcome = await sequencePoll([no, ok('a'), no, no, no]);
    assert.equal(outcome.passed, false);
    assert.equal(outcome.unmetTally[UNMET_FACT.PARENT_NOT_DISSOLVED], 4);
  });

  it('an unmet readback between two identical satisfying ones resets ' +
    'the streak', async () => {
    const outcome = await sequencePoll([ok('a'), no, ok('a'), no]);
    assert.equal(outcome.passed, false);
  });

  it('two satisfying readbacks of different shapes do not pass',
    async () => {
      const outcome = await sequencePoll([ok('a'), ok('b'), no, no]);
      assert.equal(outcome.passed, false);
    });

  it('N consecutive identical satisfying readbacks pass', async () => {
    const outcome = await sequencePoll([no, ok('a'), ok('a'), no]);
    assert.equal(outcome.passed, true);
    assert.equal(outcome.readbacks, 3);
    assert.equal(outcome.stableReadbacks, 2);
  });
});

describe('scenario ground truth: never weaker than the settled-state gate',
  () => {
    it('F1 a SPLITTING or MERGING row is an unmet transitional fact', () => {
      for (const state of ['SPLITTING', 'merging']) {
        const evaluation = evaluate(
          [LEFT, {...RIGHT, state}], truthfulServices(), new Set(['t-p1']));
        assert.equal(evaluation.satisfied, false, state);
        const transitional = arrayFilter(evaluation.unmet, (entry) =>
          entry.fact === UNMET_FACT.PARTITION_TRANSITIONAL)[0];
        assert.deepEqual({partitionId: transitional.partitionId,
          state: transitional.state}, {partitionId: 't_right', state});
      }
    });

    it('differential: over seeded random topologies the new gate passes ' +
      'only where the old settled-state gate passed', () => {
      const claims = {
        leaderSpread: {...CLAIM, requirePolicyReplicaCount: false},
        managedSplit: {...CLAIM, minDistinctLeaders: 0,
          minReplicaSpreadPerChild: 0, requireChildLeader: false,
          requirePolicyReplicaCount: false},
        publicPathSpread: CLAIM,
        replicaSpread: {...CLAIM, minDistinctLeaders: 0,
          requireChildLeader: false, requirePolicyReplicaCount: false},
      };
      const newPasses = {};
      const weaker = [];
      for (let index = 0; index < differentialTopologyCount(); index += 1) {
        const topology = generateDifferentialTopology(index);
        for (const [name, claim] of Object.entries(claims)) {
          const satisfied = evaluateSplitSpreadClaim({
            claim,
            hostIndex: buildNodeHostIndex(topology.nodes),
            knownParentIds: new Set(topology.knownParentIds),
            partitionRows: topology.partitions,
            serviceRows: topology.services,
          }).satisfied;
          if (satisfied) {
            newPasses[name] = (newPasses[name] || 0) + 1;
            if (!oldGatePasses(name, topology)) {
              weaker.push({index, name});
            }
          }
        }
      }
      assert.deepEqual(weaker, []);
      // Non-vacuous: every claim passes on some generated topologies.
      for (const name of Object.keys(claims)) {
        assert.ok((newPasses[name] || 0) >= 5,
          `${name} passed only ${newPasses[name] || 0} times`);
      }
    });
  });

describe('scenario ground truth: named facts the mutants exposed (F2)', () => {
  it('managed-split honours minChildren: one child never passes', () => {
    const evaluation = evaluateSplitSpreadClaim({
      claim: {...CLAIM, minDistinctLeaders: 0, minReplicaSpreadPerChild: 0,
        requireChildLeader: false, requirePolicyReplicaCount: false},
      hostIndex: buildNodeHostIndex(FIVE_NODES_FOUR_HOSTS),
      knownParentIds: new Set(['t-p1']),
      partitionRows: [{...LEFT, partition_key_end: null}],
      serviceRows: truthfulServices(),
    });
    assert.ok(arrayIncludes(unmetFacts(evaluation),
      UNMET_FACT.SPLIT_CHILDREN_MISSING));
  });

  it('a node the harness placed nowhere is host_identity_unknown', () => {
    const nodes = [...FIVE_NODES_FOUR_HOSTS.slice(0, 2), {id: 'n2'},
      ...FIVE_NODES_FOUR_HOSTS.slice(3)];
    const evaluation = evaluate([LEFT, RIGHT], truthfulServices(),
      new Set(['t-p1']), nodes);
    const unknown = arrayFilter(evaluation.unmet, (entry) =>
      entry.fact === UNMET_FACT.HOST_IDENTITY_UNKNOWN)[0];
    assert.deepEqual(unknown.nodeIds, ['n2']);
  });

  it('a dissolved parent\'s leftover replica rows are listed (F4)', () => {
    const services = [...truthfulServices(),
      serviceRow('t-p1', 'n0', 'removing', 'follower'),
      serviceRow('t-p1', 'n4', 'removing', 'follower')];
    const evaluation = evaluate([LEFT, RIGHT], services, new Set(['t-p1']));
    assert.equal(evaluation.satisfied, true);
    assert.deepEqual(evaluation.parentResidualReplicas, [{
      partitionId: 't-p1',
      replicas: [
        {activeVoter: false, host: 'host:10.0.0.1', hostLabel: '10.0.0.1',
          nodeId: 'n0', raftRole: 'follower', replicaId: 't-p1-n0',
          status: 'removing'},
        {activeVoter: false, host: 'host:10.0.0.1', hostLabel: '10.0.0.1',
          nodeId: 'n4', raftRole: 'follower', replicaId: 't-p1-n4',
          status: 'removing'},
      ],
    }]);
  });

  it('active replicas of a table partition with no row are orphans', () => {
    const services = [...truthfulServices(), serviceRow('t-p0', 'n3')];
    const evaluation = evaluate([LEFT, RIGHT], services, new Set());
    const orphan = arrayFilter(evaluation.unmet, (entry) =>
      entry.fact === UNMET_FACT.ORPHAN_ACTIVE_REPLICAS)[0];
    assert.deepEqual({partitionId: orphan.partitionId,
      activeReplicaCount: orphan.activeReplicaCount},
    {activeReplicaCount: 1, partitionId: 't-p0'});
    // Another table's rows are not this table's orphans.
    const other = evaluate([LEFT, RIGHT],
      [...truthfulServices(), serviceRow('u-p1', 'n3')], new Set(['t-p1']));
    assert.equal(other.satisfied, true);
  });
});

describe('scenario ground truth: one machine is one host (F5)', () => {
  const describeHost = (config, index) =>
    Cluster.prototype._describeProviderHost.call({_config: config}, index);

  it('two providers on the same machine count as one host', () => {
    // The lab harness observes each node's boot id and declares it: two
    // providers (e.g. main-linux and the controller's own Docker) on one
    // machine share it, whatever their addresses or endpoints.
    const config = {docker: {
      hostInfo: [
        {internalIp: '192.168.86.32', machineId: 'boot-a'},
        {internalIp: '192.168.86.40', machineId: 'boot-a'},
        {internalIp: '192.168.86.27', machineId: 'boot-b'}],
      hosts: ['tcp://127.0.0.1:1', 'tcp://127.0.0.1:2', 'tcp://127.0.0.1:3'],
    }};
    assert.equal(describeHost(config, 0).hostId, 'host:boot-a');
    assert.equal(describeHost(config, 0).hostId, describeHost(config, 1).hostId);
    assert.notEqual(describeHost(config, 0).hostId,
      describeHost(config, 2).hostId);
    assert.equal(describeHost(config, 0).source, 'declared_machine_id');
    const index = buildNodeHostIndex([
      {hostIdentity: describeHost(config, 0), id: 'a'},
      {hostIdentity: describeHost(config, 1), id: 'b'},
      {hostIdentity: describeHost(config, 2), id: 'c'},
    ]);
    assert.deepEqual(countDistinctHosts(['a', 'b'], index).hosts,
      ['host:boot-a']);
    assert.deepEqual(index.hostIds, ['host:boot-a', 'host:boot-b']);
    // Same resolved address, no declared id: one machine.
    const sameAddress = {docker: {hostInfo: [
      {internalIp: '10.0.0.1'}, {internalIp: '10.0.0.1'}]}};
    assert.equal(describeHost(sameAddress, 0).hostId,
      describeHost(sameAddress, 1).hostId);
  });

  it('missing topology is no host: never the provider index, the ' +
    'endpoint, the local socket or the node id', () => {
    const endpointsOnly = {docker: {
      hosts: ['tcp://127.0.0.1:1', 'tcp://127.0.0.1:2']}};
    for (const config of [endpointsOnly, {docker: {}}, {},
      {docker: {hostInfo: [{externalIp: '203.0.113.9'}]}}]) {
      const described = describeHost(config, 0);
      assert.equal(described.hostId, null, JSON.stringify(config));
      assert.equal(described.missingReason, 'host_topology_undeclared');
    }
    // A mix of declared ids and bare addresses could count one machine
    // twice: no identity at all.
    const mixed = {docker: {hostInfo: [
      {internalIp: '10.0.0.1', machineId: 'boot-a'},
      {internalIp: '10.0.0.2'}]}};
    assert.equal(describeHost(mixed, 0).hostId, null);
    assert.equal(describeHost(mixed, 1).missingReason,
      'host_identity_sources_mixed');
    // The gate fails closed on such nodes.
    const index = buildNodeHostIndex([
      {hostIdentity: describeHost(endpointsOnly, 0), id: 'n0'},
      {hostIdentity: describeHost(endpointsOnly, 1), id: 'n1'},
    ]);
    assert.deepEqual(index.hostIds, []);
    assert.deepEqual(arrayMap(index.nodes, (node) => node.hostMissingReason),
      ['host_topology_undeclared', 'host_topology_undeclared']);
    assert.deepEqual(countDistinctHosts(['n0', 'n1'], index),
      {hosts: [], unknownNodeIds: ['n0', 'n1']});
  });
});

describe('scenario ground truth: every spread claim states its unit (R3)',
  () => {
    const evaluateClaim = (claim, rows, services) => evaluateSplitSpreadClaim({
      claim, hostIndex: buildNodeHostIndex(FIVE_NODES_FOUR_HOSTS),
      knownParentIds: new Set(['t-p1']), partitionRows: rows,
      serviceRows: services});
    const sharedHostLeaders = [{...LEFT, leader_node_id: 'n0'},
      {...RIGHT, leader_node_id: 'n4'}];
    const sharedHostServices = [serviceRow('t_left', 'n0'),
      serviceRow('t_left', 'n1'), serviceRow('t_left', 'n2'),
      serviceRow('t_right', 'n4'), serviceRow('t_right', 'n2'),
      serviceRow('t_right', 'n3')];

    it('node unit: two leader nodes on one host are two; host unit: one',
      () => {
        const byNode = evaluateClaim({...CLAIM, spreadUnit: 'node'},
          sharedHostLeaders, sharedHostServices);
        assert.equal(byNode.satisfied, true);
        assert.deepEqual(byNode.leaderSpread,
          {members: ['n0', 'n4'], unit: 'node'});
        const byHost = evaluateClaim(CLAIM, sharedHostLeaders,
          sharedHostServices);
        assert.deepEqual(unmetFacts(byHost),
          [UNMET_FACT.LEADER_HOSTS_INSUFFICIENT]);
        assert.deepEqual(byHost.leaderSpread,
          {members: ['host:10.0.0.1'], unit: 'host'});
      });

    it('node unit: one leader node is leader_nodes_insufficient, one voter ' +
      'node is child_replica_nodes_insufficient', () => {
      const evaluation = evaluateClaim({...CLAIM, spreadUnit: 'node',
        requirePolicyReplicaCount: false},
      [{...LEFT, leader_node_id: 'n1'}, {...RIGHT, leader_node_id: 'n1'}],
      [serviceRow('t_left', 'n1'), ...arrayFilter(truthfulServices(),
        (row) => row.partition_id === 't_right')]);
      const facts = unmetFacts(evaluation);
      assert.ok(arrayIncludes(facts, UNMET_FACT.LEADER_NODES_INSUFFICIENT));
      assert.ok(arrayIncludes(facts,
        UNMET_FACT.CHILD_REPLICA_NODES_INSUFFICIENT));
    });

    it('a claim without a valid unit never passes', () => {
      for (const spreadUnit of [undefined, null, 'rack']) {
        const evaluation = evaluateClaim({...CLAIM, spreadUnit},
          [LEFT, RIGHT], truthfulServices());
        assert.equal(evaluation.satisfied, false);
        assert.ok(arrayIncludes(unmetFacts(evaluation),
          UNMET_FACT.SPREAD_UNIT_INVALID));
      }
    });
  });
