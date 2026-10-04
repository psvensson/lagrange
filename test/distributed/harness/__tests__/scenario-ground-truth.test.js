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

// Module-load captures — the harness tree's ambient-intrinsics rule.
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);

const CLAIM = Object.freeze({
  minChildren: 2,
  minDistinctLeaderHosts: 2,
  minReplicaHostsPerChild: 2,
  requireChildLeader: true,
  requireParentDissolved: true,
  requirePolicyReplicaCount: true,
});

function hostNode(id, providerIndex) {
  return {
    hostIdentity: {
      hostId: `provider-${providerIndex}`,
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
        {hosts: ['provider-0'], unknownNodeIds: []});
      assert.deepEqual(countDistinctHosts(['n0', 'n1', 'n4'], index).hosts,
        ['provider-0', 'provider-1']);
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
      {hostId: 'provider-0', label: '192.168.86.32', providerIndex: 0});
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
      assert.deepEqual(evaluation.leaderHosts, ['provider-1', 'provider-2']);
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
