// The former S6a probe recorded readiness RF5 versus planner RF3. Its original
// red source/evidence remains in Git. This successor closes the deferred S6b
// interaction: persisted declarations drive the actual planner, and unavailable
// policy never produces a default target. Physical formation is a separate gate.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {resolveDesiredReplicationFactor} from '../../src/bootstrap/replication-target-authority.js';
import {POLICY_ERROR_CODE} from '../../src/policy/policy-constants.js';
import {readPolicyForPartition} from '../../src/policy/table-policy-resolution.js';
import {MoveType} from '../../src/rebalancer/unified-rebalancer.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {PartitionSplitMergeManager} from '../../src/partition/partition-split-merge-manager.js';
import {partitionTargetFixture} from './partition-target-fixture.js';

function initialize(t) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({partition: {defaultReplicaCount: 1}});
  LoggingService.getInstance().initialize({level: 'error'});
  t.after(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
}

const UNAVAILABLE = {code: POLICY_ERROR_CODE.READ_UNAVAILABLE, deferRetry: true};

test('seeded priority partitions keep declared RF3 under RF1 creation configuration', async (t) => {
  initialize(t);
  for (const table of ['replica_operations', 'sql_transactions']) {
    const world = partitionTargetFixture({table, nodeCount: 1, colocated: true});
    try {
      const policy = await world.policyService.getPolicyForPartition(world.partition.partition_id);
      const target = await world.planner.calculateTargetState(world.replicas, policy);
      assert.equal(world.rebalancer.getPriorityControlPlaneTargetReplicaCount(), 3);
      assert.equal(world.planner.assessState(world.replicas, policy).desiredTarget, 3);
      assert.equal(target.targetReplicaCount, 3);
      assert.deepEqual(world.planner.calculateMoves(world.replicas, target), []);
    } finally {
      world.shutdown();
    }
  }
});

test('RF1/RF3/RF5/RF9 have one target through decoder, readiness, policy, assessment and moves', async (t) => {
  initialize(t);
  for (const target of [1, 3, 5, 9]) {
    const world = partitionTargetFixture({target, nodeCount: target + 2});
    try {
      const tablePolicy = await world.policyService.getTablePolicy(world.tableRow.table_id);
      const tableBefore = structuredClone(tablePolicy);
      const policy = await world.policyService.getPolicyForPartition(world.partition.partition_id);
      assert.equal(resolveDesiredReplicationFactor(world.partition).replicationFactor, target);
      assert.equal(world.rebalancer.getPriorityControlPlaneTargetReplicaCount(), target);
      assert.equal(policy.targetReplicaCount, target);
      assert.equal(Object.hasOwn(policy, 'replicaCount'), false);
      assert.equal(Object.hasOwn(tablePolicy, 'targetReplicaCount'), false);
      assert.deepEqual(tablePolicy, tableBefore, 'partition projection must not mutate cached table policy');
      assert.equal(world.planner.calculateTargetReplicaCount(world.replicas, policy), target);
      assert.equal(world.planner.validateReplicaCount(3, policy), target);
      const assessment = world.planner.assessState(world.replicas, policy);
      assert.equal(assessment.desiredTarget, target);
      assert.equal(assessment.actionableTarget, target);
      const targetState = await world.planner.calculateTargetState(world.replicas, policy);
      assert.equal(targetState.targetReplicaCount, target);
      assert.deepEqual(world.planner.calculateMoves(world.replicas, targetState), []);
    } finally {
      world.shutdown();
    }
  }
});

test('declared RF5 with three holders emits actual deficit moves; RF3 agreement stays quiet', async (t) => {
  initialize(t);
  for (const target of [3, 5]) {
    const world = partitionTargetFixture({target, holders: 3, nodeCount: 5});
    try {
      const policy = await world.policyService.getPolicyForPartition(world.partition.partition_id);
      const targetState = await world.planner.calculateTargetState(world.replicas, policy);
      const moves = world.planner.calculateMoves(world.replicas, targetState);
      assert.equal(world.planner.assessState(world.replicas, policy).desiredTarget, target);
      if (target === 5) {
        assert.ok(moves.some((move) =>
          [MoveType.ADD, MoveType.REPLACE].includes(move.type)), JSON.stringify(moves));
      } else {
        assert.deepEqual(moves, []);
      }
    } finally {
      world.shutdown();
    }
  }
});

test('missing, invalid, stale or failed metadata is unavailable even with a warm policy cache', async (t) => {
  initialize(t);
  const cases = [
    (w) => {
      w.rows.partitions = [];
    },
    (w) => {
      delete w.partition.replica_count;
    },
    (w) => {
      w.partition.replica_count = '3';
    },
    (w) => {
      w.rows.tables = [];
    },
    (w) => {
      w.tableRow.table_policies = '{';
    },
    (w) => {
      w.tableRow.table_policies = '{"replicaCount":3}';
    },
    (w) => {
      w.tableRow.table_policies = '{"targetReplicaCount":3}';
    },
    (w) => {
      w.tableRow.table_policies = '{"minReplicaCount":1.5}';
    },
    (w) => {
      w.cache.filter = () => {
        throw new Error('finite row read fault');
      };
    },
  ];
  for (const inject of cases) {
    const world = partitionTargetFixture();
    try {
      await world.policyService.getPolicyForPartition(world.partition.partition_id);
      inject(world);
      await assert.rejects(
        readPolicyForPartition(world.policyService, world.partition.partition_id), UNAVAILABLE);
    } finally {
      world.shutdown();
    }
  }
});

test('missing owner answers cannot fall through split/merge criteria', async (t) => {
  initialize(t);
  for (const owner of [null, ...[undefined, null, {}, {targetReplicaCount: 3}].map(
    (answer) => ({getPolicyForPartition: async () => answer}))]) {
    const manager = new PartitionSplitMergeManager({tablePolicyService: owner});
    try {
      await assert.rejects(manager.getTablePolicy('user-p1'), UNAVAILABLE);
    } finally {
      manager.shutdown();
    }
  }
});

test('planner refuses aliases/coercion/fractions; only runtime services can declare target zero', () => {
  const partition = new MovePlanner({entityId: 'user-p1', entityType: 'partition', moveStateProvider: {}});
  for (const policy of [{replicaCount: 3}, {}, {targetReplicaCount: '3'},
    {targetReplicaCount: 1.5}, {targetReplicaCount: 0},
    {targetReplicaCount: Number.MAX_SAFE_INTEGER + 1}]) {
    assert.throws(() => partition.getPolicyTargetReplicaCount(policy), UNAVAILABLE);
    assert.throws(() => partition.validateReplicaCount(3, policy), UNAVAILABLE);
  }
  const runtime = new MovePlanner({entityId: 'runtime',
    entityType: 'runtime_service', moveStateProvider: {}});
  assert.equal(runtime.getPolicyTargetReplicaCount({targetReplicaCount: 0}), 0);
});
