/**
 * Deterministic integration coverage for benchmark admission under replica instability.
 *
 * Covers failed movement and pending promotion using the in-process discovery
 * fixture layer instead of a Docker cluster.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  createBenchmarkDiscoveryApi,
  findReplica,
} from './helpers/benchmark-readiness-fixtures.js';

const TABLE_NAME = 'benchmark_events';

test('benchmark admission degrades failed replica replacement deterministically',
  async (t) => {
    const {api} = await createBenchmarkDiscoveryApi({
      nodeId: 'node-2',
      replicaOperations: [{
        operation_id: 'op-replace-failed',
        partition_id: 'partition-benchmark-events-1',
        type: 'REPLACE',
        source_node_id: 'node-1',
        target_node_id: 'node-2',
        status: 'failed',
        workflow_step: 'FAILED',
      }],
    });

    try {
      const snapshot = await api.resolveServiceDiscoverySnapshot({
        tableName: TABLE_NAME,
      });
      const replica = findReplica(snapshot, 'node-2');
      const admission = replica?.benchmarkAdmission || null;

      t.equal(admission?.state, 'blocked');
      t.equal(admission?.degradationState, 'move_failed');
      t.same(admission?.degradedByOperationIds, ['op-replace-failed']);
      t.equal(
        admission?.reasons?.some((reason) => reason?.code === 'replica_operation_failed'),
        true,
      );
    } finally {
      await api.shutdown();
    }
  });

test('benchmark admission blocks pending promotion deterministically',
  async (t) => {
    const {api} = await createBenchmarkDiscoveryApi({
      nodeId: 'node-2',
      replicaOperations: [{
        operation_id: 'op-add-pending',
        partition_id: 'partition-benchmark-events-1',
        type: 'ADD',
        source_node_id: 'node-1',
        target_node_id: 'node-2',
        status: 'creating',
        workflow_step: 'CREATING',
      }],
    });

    try {
      const snapshot = await api.resolveServiceDiscoverySnapshot({
        tableName: TABLE_NAME,
      });
      const targetReplica = findReplica(snapshot, 'node-2');
      const targetAdmission = targetReplica?.benchmarkAdmission || null;
      const sourceReplica = findReplica(snapshot, 'node-1');
      const sourceAdmission = sourceReplica?.benchmarkAdmission || null;

      t.equal(targetAdmission?.state, 'blocked');
      t.equal(targetAdmission?.degradationState, 'promotion_pending');
      t.same(targetAdmission?.degradedByOperationIds, ['op-add-pending']);
      t.equal(
        targetAdmission?.reasons?.some((reason) => reason?.code === 'replica_operation_in_flight'),
        true,
      );
      t.equal(sourceAdmission?.state, 'blocked');
      t.equal(sourceAdmission?.degradationState, 'healthy');
      t.same(sourceAdmission?.degradedByOperationIds, []);
      t.equal(
        sourceAdmission?.reasons?.some((reason) =>
          reason?.code === 'replica_operation_in_flight'),
        false,
      );
    } finally {
      await api.shutdown();
    }
  });

test('benchmark admission blocks failed promotion target without degrading source',
  async (t) => {
    const {api} = await createBenchmarkDiscoveryApi({
      nodeId: 'node-2',
      replicaOperations: [{
        operation_id: 'op-add-failed',
        partition_id: 'partition-benchmark-events-1',
        type: 'ADD',
        source_node_id: 'node-1',
        target_node_id: 'node-2',
        status: 'failed',
        workflow_step: 'FAILED',
      }],
    });

    try {
      const snapshot = await api.resolveServiceDiscoverySnapshot({
        tableName: TABLE_NAME,
      });
      const targetReplica = findReplica(snapshot, 'node-2');
      const targetAdmission = targetReplica?.benchmarkAdmission || null;
      const sourceReplica = findReplica(snapshot, 'node-1');
      const sourceAdmission = sourceReplica?.benchmarkAdmission || null;

      t.equal(targetAdmission?.state, 'blocked');
      t.equal(targetAdmission?.degradationState, 'promotion_failed');
      t.same(targetAdmission?.degradedByOperationIds, ['op-add-failed']);
      t.equal(
        targetAdmission?.reasons?.some((reason) =>
          reason?.code === 'replica_operation_failed'),
        true,
      );
      t.equal(sourceAdmission?.state, 'ready');
      t.equal(sourceAdmission?.degradationState, 'healthy');
      t.same(sourceAdmission?.degradedByOperationIds, []);
      t.equal(
        sourceAdmission?.reasons?.some((reason) =>
          reason?.code === 'replica_operation_failed'),
        false,
      );
    } finally {
      await api.shutdown();
    }
  });

test('benchmark admission ignores completed promotion deterministically',
  async (t) => {
    const {api} = await createBenchmarkDiscoveryApi({
      nodeId: 'node-2',
      replicaOperations: [{
        operation_id: 'op-add-complete',
        partition_id: 'partition-benchmark-events-1',
        type: 'ADD',
        target_node_id: 'node-2',
        status: 'active',
        workflow_step: 'ACTIVE',
        completed_at: 1741000000000,
      }],
    });

    try {
      const snapshot = await api.resolveServiceDiscoverySnapshot({
        tableName: TABLE_NAME,
      });
      const replica = findReplica(snapshot, 'node-2');
      const admission = replica?.benchmarkAdmission || null;

      t.equal(admission?.state, 'ready');
      t.equal(admission?.degradationState, 'healthy');
      t.same(admission?.degradedByOperationIds, []);
      t.equal(
        admission?.reasons?.some((reason) => reason?.code === 'replica_operation_in_flight'),
        false,
      );
    } finally {
      await api.shutdown();
    }
  });

test('benchmark admission ignores unrelated failed movement deterministically',
  async (t) => {
    const {api} = await createBenchmarkDiscoveryApi({
      nodeId: 'node-2',
      replicaOperations: [{
        operation_id: 'op-unrelated-failed',
        partition_id: 'partition-unrelated-1',
        entity_type: 'message_group',
        entity_id: 'partition-unrelated-1',
        type: 'REPLACE',
        source_node_id: 'node-1',
        target_node_id: 'node-2',
        status: 'failed',
        workflow_step: 'FAILED',
      }],
    });

    try {
      const snapshot = await api.resolveServiceDiscoverySnapshot({
        tableName: TABLE_NAME,
      });
      const replica = findReplica(snapshot, 'node-2');
      const admission = replica?.benchmarkAdmission || null;

      t.equal(admission?.state, 'ready');
      t.equal(admission?.degradationState, 'healthy');
      t.same(admission?.degradedByOperationIds, []);
      t.equal(
        admission?.reasons?.some((reason) => reason?.code === 'replica_operation_failed'),
        false,
      );
    } finally {
      await api.shutdown();
    }
  });

test('benchmark admission exposes stale timeout diagnostics for blocked REMOVE',
  async (t) => {
    const nowMs = Date.now();
    const staleUpdatedAtMs = nowMs - 70000;
    const {api} = await createBenchmarkDiscoveryApi({
      nodeId: 'node-2',
      updatedAt: nowMs,
      replicaOperations: [{
        operation_id: 'op-remove-stale',
        partition_id: 'partition-benchmark-events-1',
        type: 'REMOVE',
        source_node_id: 'node-1',
        target_node_id: 'node-2',
        status: 'stopping',
        workflow_step: 'STOPPING',
        updated_at: staleUpdatedAtMs,
      }],
    });

    try {
      const snapshot = await api.resolveServiceDiscoverySnapshot({
        tableName: TABLE_NAME,
      });
      const replica = findReplica(snapshot, 'node-2');
      const admission = replica?.benchmarkAdmission || null;

      t.equal(admission?.state, 'blocked');
      t.equal(
        admission?.reasons?.some((reason) =>
          reason?.code === 'replica_operation_stale_timeout'),
        true,
        'stale in-flight operation should be classified explicitly',
      );
      t.equal(
        Number.isInteger(snapshot?.replicaOperations?.staleInFlightCount),
        true,
        'snapshot should expose stale in-flight aggregate diagnostics',
      );
      t.ok(
        snapshot?.replicaOperations?.operationTimelineById?.['op-remove-stale'],
        'snapshot should include per-operation timeline artifact',
      );
    } finally {
      await api.shutdown();
    }
  });
