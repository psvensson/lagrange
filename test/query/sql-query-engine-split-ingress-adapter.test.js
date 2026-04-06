/**
 * SQLQueryEngine — thin ingress adapter for split requests.
 *
 * Task 5.3: Proves SQLQueryEngine delegates split lifecycle to
 * ManagedSplitWorkflow and does not own split state.
 *
 * Uses ManagedSplitWorkflow as the canonical split lifecycle owner.
 * Requirements: 2, 3, 7, 8
 * Design: §3, Phase 3
 */

import {test} from '../../src/test-helpers/tap.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {TABLES} from '../../src/constants/index.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

/**
 * Minimal mock system cache for split-related tests.
 * @param {Array} tables - Table metadata rows.
 * @param {Array} partitions - Partition metadata rows.
 * @param {Array} [services] - Service metadata rows.
 * @return {Object} Mock system cache.
 */
function createMockSystemCache(tables, partitions, services) {
  return {
    tables,
    partitions,
    services: services || partitions.map((p) => ({
      service_id: p.partition_id,
      service_type: 'partition',
      partition_id: p.partition_id,
      node_id: 'test-node',
      raft_role: 'leader',
      address: `test-node/partition/${p.partition_id}`,
      status: 'active',
    })),
    get(type, key) {
      if (type === TABLES.TABLES) {
        return this.tables.find((t) => t.table_name === key);
      }
      return null;
    },
    filter(type, predicate) {
      if (type === TABLES.PARTITIONS) {
        return this.partitions.filter(predicate);
      }
      if (type === TABLES.SERVICES) {
        return this.services.filter(predicate);
      }
      return [];
    },
    getAll(type) {
      if (type === TABLES.PARTITIONS) return this.partitions;
      if (type === TABLES.TABLES) return this.tables;
      if (type === TABLES.SERVICES) return this.services;
      return [];
    },
    onCacheChange() {},
  };
}

// ---------------------------------------------------------------------------
// 1. Fail-closed: executeManagedSplit rejects when workflow owner lacks execute
// ---------------------------------------------------------------------------

test('executeManagedSplit fails closed when workflow owner lacks execute',
  async (t) => {
    const engine = new SQLQueryEngine({
      managedSplitWorkflow: {},
    });

    await t.rejects(
      engine.executeManagedSplit('users-p1'),
      /failed to start partition split/i,
      'must fail closed — no fallback when the canonical owner is invalid',
    );
  });

// ---------------------------------------------------------------------------
// 2. Pure delegation: executeManagedSplit forwards to workflow owner
// ---------------------------------------------------------------------------

test('executeManagedSplit delegates to ManagedSplitWorkflow.execute ' +
  'without owning split state', async (t) => {
  const systemTableWrites = [];
  const mockCDCService = {
    async updateSystemTableRow(tableName, key, fields) {
      systemTableWrites.push({tableName, key, fields});
      return {success: true, affectedRows: 1};
    },
    async insertSystemTableRow(tableName, row) {
      systemTableWrites.push({tableName, row});
      return {success: true};
    },
    async waitForCacheUpdate() {},
  };

  const workflowCalls = [];
  const engine = new SQLQueryEngine({
    cdcIntegrationService: mockCDCService,
    managedSplitWorkflow: {
      async execute(partitionId) {
        workflowCalls.push(partitionId);
        return {success: true, partitionId};
      },
    },
  });

  const result = await engine.executeManagedSplit('users-p1');

  t.equal(workflowCalls.length, 1, 'workflow owner must be called exactly once');
  t.same(workflowCalls, ['users-p1']);
  t.same(result, {success: true, partitionId: 'users-p1'});

  const splitStateWrites = systemTableWrites.filter((w) =>
    w.fields?.partition_transition_state !== undefined ||
    w.row?.partition_transition_state !== undefined,
  );
  t.equal(
    splitStateWrites.length,
    0,
    'SQLQueryEngine must not write partition_transition_state — ' +
    'uses ManagedSplitWorkflow as the canonical split lifecycle owner',
  );
});

// ---------------------------------------------------------------------------
// 3. No fallback: workflow owner errors propagate without alternate path
// ---------------------------------------------------------------------------

test('executeManagedSplit propagates workflow owner errors without fallback',
  async (t) => {
    const ownerError = new Error('workflow-owner-rejection');
    const engine = new SQLQueryEngine({
      managedSplitWorkflow: {
        async execute(_partitionId) {
          throw ownerError;
        },
      },
    });

    await t.rejects(
      engine.executeManagedSplit('users-p1'),
      /workflow-owner-rejection/,
      'must propagate the owner error — no alternate split path',
    );
  });

// ---------------------------------------------------------------------------
// 4. Callback injection: helpers are injected, not independent owners
// ---------------------------------------------------------------------------

test('split helper methods are injected into ManagedSplitWorkflow as ' +
  'callbacks, not independent state owners', (t) => {
  const cache = createMockSystemCache(
    [{
      table_id: 'tbl-users',
      table_name: 'users',
      partition_key: 'id',
      active_partition_version: 1,
      partition_transition_state: null,
      partition_transition_metadata: null,
    }],
    [{
      partition_id: 'users-p1',
      table_id: 'tbl-users',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
      partition_version: 1,
      replica_count: 1,
      leader_node_id: 'node-a',
    }],
  );

  const engine = new SQLQueryEngine({
    nodeId: 'node-a',
    systemCache: cache,
    messageRouter: {deliver: async () => ({acknowledged: true})},
    partitionSplitMergeManager: {
      async splitPartition() {
        return {
          medianKey: 'm',
          leftPartition: {
            partitionId: 'users-p-left',
            keyRange: {start: null, end: 'm'},
          },
          rightPartition: {
            partitionId: 'users-p-right',
            keyRange: {start: 'm', end: null},
          },
        };
      },
    },
  });

  const workflow = engine.managedSplitWorkflow;

  t.ok(workflow, 'ManagedSplitWorkflow must be created');
  t.equal(
    typeof workflow.buildManagedSplitPlan,
    'function',
    'buildManagedSplitPlan injected as callback',
  );
  t.equal(
    typeof workflow.startSplitReplicationOnSourcePartition,
    'function',
    'startSplitReplicationOnSourcePartition injected as callback',
  );
  t.equal(
    typeof workflow.provisionInitialTablePartition,
    'function',
    'provisionInitialTablePartition injected as callback',
  );

  t.notOk(
    workflow.cdcIntegrationService,
    'workflow must not receive cdcIntegrationService directly — ' +
    'system table writes are owned by the workflow, not by callbacks',
  );
  t.equal(
    workflow.transactionCoordinator,
    engine.transactionCoordinator,
    'ManagedSplitWorkflow must use SQLQueryEngine transaction coordinator',
  );

  t.end();
});

test('split source routability helper uses control-plane recovery eligibility ' +
  'dimension for owner-path convergence', (t) => {
  const cache = createMockSystemCache(
    [{
      table_id: 'tbl-users',
      table_name: 'users',
      partition_key: 'id',
      active_partition_version: 1,
      partition_transition_state: null,
      partition_transition_metadata: null,
    }],
    [{
      partition_id: 'users-p1',
      table_id: 'tbl-users',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
      partition_version: 1,
      replica_count: 1,
      leader_node_id: 'node-a',
    }],
  );
  const engine = new SQLQueryEngine({
    nodeId: 'node-a',
    systemCache: cache,
    messageRouter: {deliver: async () => ({acknowledged: true})},
  });
  const observedCalls = [];
  engine.queryExecutor = {
    getRoutablePartitionServices(partitionId, readinessDimension) {
      observedCalls.push({partitionId, readinessDimension});
      return [{
        partition_id: partitionId,
        node_id: 'node-a',
        status: 'active',
        address: `node-a/partition/${partitionId}`,
      }];
    },
  };

  const nodeIds =
    engine.managedSplitWorkflow.getRoutablePartitionServiceNodeIds('users-p1');

  t.same(
    observedCalls,
    [{
      partitionId: 'users-p1',
      readinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    }],
    'ManagedSplitWorkflow source-routability ingress must use recovery ' +
    'dimension during control-plane convergence',
  );
  t.same(
    nodeIds,
    ['node-a'],
    'ManagedSplitWorkflow source-routability ingress must return the routed ' +
    'node cohort from the query executor',
  );

  t.end();
});

// ---------------------------------------------------------------------------
// 5. Read-only: listManagedSplitPartitions does not mutate split state
// ---------------------------------------------------------------------------

test('listManagedSplitPartitions is read-only and does not mutate ' +
  'split state', (t) => {
  const systemTableWrites = [];
  const cache = createMockSystemCache(
    [{
      table_id: 'tbl-users',
      table_name: 'users',
      partition_key: 'id',
      active_partition_version: 1,
      partition_transition_state: null,
      partition_transition_metadata: null,
    }],
    [{
      partition_id: 'users-p1',
      table_id: 'tbl-users',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
      partition_version: 1,
      state: 'NORMAL',
      leader_node_id: 'node-a',
    }],
  );

  const engine = new SQLQueryEngine({
    nodeId: 'node-a',
    systemCache: cache,
    cdcIntegrationService: {
      async updateSystemTableRow(tableName, key, fields) {
        systemTableWrites.push({tableName, key, fields});
        return {success: true};
      },
    },
  });

  const result = engine.listManagedSplitPartitions();

  t.ok(Array.isArray(result), 'returns an array');
  t.equal(
    systemTableWrites.length,
    0,
    'listManagedSplitPartitions must not write system tables',
  );

  t.end();
});

test('listManagedSplitPartitions keeps retryable split states eligible ' +
  'only after their retry window opens', (t) => {
  const retryMetadata = (workflowId, nextAttemptAt = null) => JSON.stringify({
    [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID]: workflowId,
    [PARTITION_TRANSITION_METADATA_FIELD.RETRY]: nextAttemptAt ?
      {attemptCount: 1, nextAttemptAt, backoffMs: 1000} :
      undefined,
  });
  const cache = createMockSystemCache(
    [
      {
        table_id: 'tbl-normal',
        table_name: 'normal_users',
        partition_key: 'id',
        active_partition_version: 1,
        partition_transition_state: null,
        partition_transition_metadata: null,
      },
      {
        table_id: 'tbl-deferred',
        table_name: 'deferred_users',
        partition_key: 'id',
        active_partition_version: 1,
        partition_transition_state: PARTITION_TRANSITION_STATE.DEFERRED,
        partition_transition_metadata: retryMetadata(
          'wf-deferred',
          '1970-01-01T00:00:00.500Z',
        ),
      },
      {
        table_id: 'tbl-blocked',
        table_name: 'blocked_users',
        partition_key: 'id',
        active_partition_version: 1,
        partition_transition_state: PARTITION_TRANSITION_STATE.BLOCKED,
        partition_transition_metadata: retryMetadata(
          'wf-blocked',
          '1970-01-01T00:00:02.000Z',
        ),
      },
      {
        table_id: 'tbl-active',
        table_name: 'active_users',
        partition_key: 'id',
        active_partition_version: 1,
        partition_transition_state: PARTITION_TRANSITION_STATE.SPLIT_PREPARING,
        partition_transition_metadata: retryMetadata('wf-active'),
      },
    ],
    [
      {
        partition_id: 'normal-p1',
        table_id: 'tbl-normal',
        table_name: 'normal_users',
        partition_key_start: null,
        partition_key_end: null,
        partition_version: 1,
        state: 'NORMAL',
        leader_node_id: 'node-a',
      },
      {
        partition_id: 'deferred-p1',
        table_id: 'tbl-deferred',
        table_name: 'deferred_users',
        partition_key_start: null,
        partition_key_end: null,
        partition_version: 1,
        state: 'NORMAL',
        leader_node_id: 'node-a',
      },
      {
        partition_id: 'blocked-p1',
        table_id: 'tbl-blocked',
        table_name: 'blocked_users',
        partition_key_start: null,
        partition_key_end: null,
        partition_version: 1,
        state: 'NORMAL',
        leader_node_id: 'node-a',
      },
      {
        partition_id: 'active-p1',
        table_id: 'tbl-active',
        table_name: 'active_users',
        partition_key_start: null,
        partition_key_end: null,
        partition_version: 1,
        state: 'NORMAL',
        leader_node_id: 'node-a',
      },
    ],
  );

  const engine = new SQLQueryEngine({
    nodeId: 'node-a',
    systemCache: cache,
    nowFn: () => 1000,
  });

  t.same(
    engine.listManagedSplitPartitions().map((partition) => partition.partition_id),
    ['normal-p1', 'deferred-p1'],
    'retryable transition states should stay eligible only when their next retry window is due',
  );

  t.end();
});
