import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {waitForConvergence} from '../assertions.js';
import {
  VOTER_TARGET_STATE,
  buildPartitionVoterTargets,
  buildUnclaimedVoterTargetVerdict,
  classifyVoterTargets,
  describeVoterTargetVerdict,
  readPartitionVoterTargets,
} from '../convergence-voter-targets.js';
import {
  isPostRebalanceCdcProjectionVisibleSatisfied,
} from '../post-rebalance-closure-contract.js';
import {
  buildControlSnapshotRecord,
  buildPartitionReplicaRow,
  withPolicyTargets,
} from './assertions-test-helpers.js';

const ROLES = Object.freeze(['leader', 'follower', 'follower', 'follower',
  'follower']);
const FAST = Object.freeze({
  finalAdjudicationDrainTimeoutMs: 0,
  maxSustainedOverTargetMs: 80,
  quietWindowMs: 0,
  sampleIntervalMs: 10,
  settleTimeoutMs: 80,
});

// One stub node whose control snapshot shows `voters` active voters of p1
// and whose partitions row declares `policy` (undefined = no row).
function clusterOf(voters, policy) {
  const snapshot = buildControlSnapshotRecord({
    nodeId: 'n1',
    partitionIds: ['p1'],
    servicesRows: Array.from({length: voters}, (_unused, index) =>
      buildPartitionReplicaRow('p1', `r${index}`, ROLES[index])),
  });
  const node = {
    getControlSnapshot: async () => ({rows: [snapshot]}),
    id: 'n1',
    isReachable: async () => true,
  };
  return policy === undefined ? node : withPolicyTargets(node, ['p1'], policy);
}

async function verdictOf(voters, policy, options = {}) {
  try {
    const result = await waitForConvergence([clusterOf(voters, policy)],
      {...FAST, targetVoterCount: 3, ...options});
    return {passed: true, voterTargets: result.voterTargets};
  } catch (error) {
    return {message: error.message, passed: false,
      voterTargets: error.diagnostics?.voterTargets};
  }
}

describe('waitForConvergence: voters must reach each partition\'s policy ' +
  'target', () => {
  it('a partition at 1 of 3 voters never converges', async () => {
    const outcome = await verdictOf(1, 3);
    assert.equal(outcome.passed, false);
    assert.equal(outcome.voterTargets.state, VOTER_TARGET_STATE.UNDER_TARGET);
    assert.match(outcome.message,
      /under_target_voters underTarget\[p1=1\/3\]/u);
  });

  it('a partition at 2 of 3 voters never converges', async () => {
    const outcome = await verdictOf(2, 3);
    assert.equal(outcome.passed, false);
    assert.deepEqual(outcome.voterTargets.underTarget,
      [{partitionId: 'p1', target: 3, voters: 2}]);
  });

  it('exactly the policy target converges and the result states it',
    async () => {
      const outcome = await verdictOf(3, 3);
      assert.equal(outcome.passed, true);
      assert.equal(outcome.voterTargets.state, VOTER_TARGET_STATE.AT_TARGET);
      // A different declared policy is the target, not the caller's number.
      const two = await verdictOf(2, 2);
      assert.equal(two.passed, true);
    });

  it('more voters than the policy target is not converged, even with ' +
    'stale in-flight operations ignored', async () => {
    const outcome = await verdictOf(4, 3, {targetVoterCount: 5,
      ignoreStaleInFlightReplicaOperations: true});
    assert.equal(outcome.passed, false);
    assert.equal(outcome.voterTargets.state, VOTER_TARGET_STATE.OVER_TARGET);
  });

  it('above the ceiling is over_ceiling_voters', async () => {
    const outcome = await verdictOf(3, 3, {targetVoterCount: 2});
    assert.equal(outcome.passed, false);
    assert.equal(outcome.voterTargets.state, VOTER_TARGET_STATE.OVER_CEILING);
  });

  it('absent target evidence is refused, never a default', async () => {
    const noRow = await verdictOf(3, undefined);
    assert.equal(noRow.passed, false);
    assert.equal(noRow.voterTargets.state,
      VOTER_TARGET_STATE.EVIDENCE_ABSENT);
    assert.match(noRow.message, /target read: no node exposes/u);
    // A row without a usable replica_count declares nothing.
    const zero = await verdictOf(3, 0);
    assert.equal(zero.voterTargets.state, VOTER_TARGET_STATE.EVIDENCE_ABSENT);
  });

  it('a tolerated under-replication passes only with its reason and a ' +
    'declared voter floor, and the result records both', async () => {
    const reason = 'witness: one of three nodes is down';
    const tolerance = {minVoters: 2, reason};
    const outcome = await verdictOf(2, 3, {tolerateUnderReplication: tolerance});
    assert.equal(outcome.passed, true);
    assert.equal(outcome.voterTargets.state, VOTER_TARGET_STATE.TOLERATED);
    assert.equal(outcome.voterTargets.toleranceReason, reason);
    assert.equal(outcome.voterTargets.toleranceMinVoters, 2);
    assert.deepEqual(outcome.voterTargets.underTarget,
      [{partitionId: 'p1', target: 3, voters: 2}]);
  });

  it('below the declared floor is under_target_voters, never tolerated',
    async () => {
      const tolerance = {minVoters: 2, reason: 'witness: floor of two'};
      const one = await verdictOf(1, 3, {tolerateUnderReplication: tolerance});
      assert.equal(one.passed, false);
      assert.equal(one.voterTargets.state, VOTER_TARGET_STATE.UNDER_TARGET);
      for (const voters of [0, 1]) {
        const verdict = classifyVoterTargets({
          expectedPartitionIds: new Set(['p1', 'p2']),
          tolerance,
          voterCeiling: 3,
          voterCounts: new Map([['p1', 2], ['p2', voters]]),
          voterTargets: new Map([['p1', 3], ['p2', 3]]),
        });
        assert.equal(verdict.state, VOTER_TARGET_STATE.UNDER_TARGET,
          `${voters} of 3 voters under a floor of 2`);
        assert.equal(verdict.satisfied, false);
      }
    });

  it('a tolerance without a reason or without a voter floor is refused',
    async () => {
      for (const tolerance of ['', 'a reason but no floor', {reason: 'r'},
        {minVoters: 2}, {minVoters: 0, reason: 'r'},
        {minVoters: 1.5, reason: 'r'}, {minVoters: 2, reason: ''}]) {
        await assert.rejects(waitForConvergence([clusterOf(2, 3)],
          {...FAST, tolerateUnderReplication: tolerance}),
        /tolerateUnderReplication/u, JSON.stringify(tolerance));
      }
    });
});

describe('voter-target authority', () => {
  it('decodes policy targets with the production decoder', () => {
    assert.deepEqual([...buildPartitionVoterTargets([
      {partition_id: 'a', replica_count: 3},
      {partition_id: 'b', replica_count: '3'},
      {partition_id: 'c'},
      {partition_id: 'd', replica_count: 5},
    ])], [['a', 3], ['d', 5]]);
  });

  it('reads targets from the first node that answers, else absent',
    async () => {
      const failing = {id: 'x', query: async () => {
        throw new Error('down');
      }};
      const answering = withPolicyTargets({id: 'y'}, ['p1'], 3);
      const read = await readPartitionVoterTargets([failing, answering]);
      assert.equal(read.sourceNodeId, 'y');
      assert.deepEqual([...read.targets], [['p1', 3]]);
      const none = await readPartitionVoterTargets([failing]);
      assert.equal(none.targets, null);
      assert.equal(none.error, 'down');
    });

  it('partitions rows outside the claimed set are named, never dropped',
    async () => {
      const verdict = classifyVoterTargets({expectedPartitionIds: ['p1'],
        policyPartitionIds: ['p1', 'p8', 'p9'], voterCeiling: 3,
        voterCounts: new Map([['p1', 3]]),
        voterTargets: new Map([['p1', 3], ['p9', 3]])});
      assert.equal(verdict.state, VOTER_TARGET_STATE.AT_TARGET);
      // p9 has a target, p8 a row with no usable replica_count: both named.
      assert.deepEqual(verdict.unclaimedPartitionIds, ['p8', 'p9']);
      assert.match(describeVoterTargetVerdict(verdict), /unclaimed\[p8,p9\]/u);
      const claimedAll = classifyVoterTargets({expectedPartitionIds: ['p1'],
        voterCeiling: 3, voterCounts: new Map([['p1', 3]]),
        voterTargets: new Map([['p1', 3]])});
      assert.deepEqual(claimedAll.unclaimedPartitionIds, []);
      // Through the wait: the policy read's extra row reaches the record.
      const node = clusterOf(3, undefined);
      withPolicyTargets(node, ['p1', 'p7'], 3);
      const result = await waitForConvergence([node],
        {...FAST, targetVoterCount: 3});
      assert.deepEqual(result.voterTargets.unclaimedPartitionIds, ['p7']);
      const read = await readPartitionVoterTargets([node]);
      assert.deepEqual(read.partitionIds, ['p1', 'p7']);
    });

  it('membership freeze names an over-target, never hides it', () => {
    const verdict = classifyVoterTargets({expectedPartitionIds: ['p1'],
      membershipFreezeActive: true, voterCeiling: 5,
      voterCounts: new Map([['p1', 4]]), voterTargets: new Map([['p1', 3]])});
    assert.equal(verdict.state,
      VOTER_TARGET_STATE.OVER_TARGET_MEMBERSHIP_FROZEN);
    assert.equal(verdict.overTarget.length, 1);
  });
});

describe('post-rebalance closure contract requires the voter verdict', () => {
  const closed = {
    expectedPartitionIds: ['p1'],
    inFlightReplicaOperationCount: 0,
    leaders: new Map([['p1', 'n1']]),
    targetVoterCount: 3,
    voterCounts: new Map([['p1', 3]]),
  };

  it('absent or unsatisfied verdict keeps the contract open', () => {
    assert.equal(isPostRebalanceCdcProjectionVisibleSatisfied(closed), false);
    const under = classifyVoterTargets({expectedPartitionIds: ['p1'],
      voterCeiling: 3, voterCounts: new Map([['p1', 1]]),
      voterTargets: new Map([['p1', 3]])});
    assert.equal(isPostRebalanceCdcProjectionVisibleSatisfied({...closed,
      voterTargetVerdict: under}), false);
  });

  it('a satisfied or explicitly unclaimed verdict lets the contract decide',
    () => {
      const atTarget = classifyVoterTargets({expectedPartitionIds: ['p1'],
        voterCeiling: 3, voterCounts: new Map([['p1', 3]]),
        voterTargets: new Map([['p1', 3]])});
      assert.equal(isPostRebalanceCdcProjectionVisibleSatisfied({...closed,
        voterTargetVerdict: atTarget}), true);
      assert.equal(isPostRebalanceCdcProjectionVisibleSatisfied({...closed,
        voterTargetVerdict: buildUnclaimedVoterTargetVerdict('probe')}), true);
    });
});
