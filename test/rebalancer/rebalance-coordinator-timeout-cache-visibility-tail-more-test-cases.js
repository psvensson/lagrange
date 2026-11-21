import {CDC_OPERATION} from '../../src/constants/index.js';
import {
  createCommittedTimeoutLedger, createTimeoutSweepCoordinator, createTimeoutVisibilityCache,
} from './rebalance-coordinator-timeout-cache-visibility-fixture.js';
import {createCoordinatorSqlStore} from './test-helpers.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {registerRebalanceCoordinatorTimeoutCacheVisibilityTailFinalTests} from './rebalance-coordinator-timeout-cache-visibility-tail-final-test-cases.js';

const REPLICA_OPERATION_CRITICAL_RECOVERY_QUERY_TIMEOUT_MS = 15_000;

function buildActiveHandoffTimeoutFixture(operationId, step, status) {
  const nowMs = Date.now();
  const staleUpdatedAtMs = nowMs - 70000;
  const observedServiceRow = {
    service_id: 'partition-1-r2',
    replica_id: 'partition-1-r2',
    partition_id: 'partition-1',
    node_id: 'node-2',
    address: 'node-2/partition/partition-1-r2',
    status: 'active',
    created_at: staleUpdatedAtMs - 700,
    state_entered_at: staleUpdatedAtMs - 600,
    updated_at: staleUpdatedAtMs - 500,
    raft_role: 'follower',
    service_type: 'partition',
  };
  const operationRow = {
    operation_id: operationId,
    type: 'ADD',
    partition_id: 'partition-1',
    replica_id: 'partition-1-r2',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    status,
    workflow_step: step,
    created_at: staleUpdatedAtMs - 5000,
    updated_at: staleUpdatedAtMs,
    completed_at: null,
    error_message: null,
    steps_history: JSON.stringify([
      {step: 'PENDING', timestamp: staleUpdatedAtMs - 1000},
      {step: 'SENDING', timestamp: staleUpdatedAtMs - 900},
      ...(step === 'CREATING' ? [{step, timestamp: staleUpdatedAtMs - 800}] : []),
    ]),
    entity_type: 'partition',
    entity_id: 'partition-1',
  };
  const gatewayCalls = [];

  const notifications = [];
  const cache = createTimeoutVisibilityCache(operationRow, [observedServiceRow], {
    scheduleCacheChangeNotification: (notify) => notifications.push(notify),
  });
  const authorityRow = {...observedServiceRow, updated_at: nowMs, state_entered_at: nowMs};
  let activeAuthority = false;
  const ledger = createCommittedTimeoutLedger(operationRow, {
    cache,
    readServices(sql, params) {
      gatewayCalls.push({sql, params});
      const rows = activeAuthority && params[0] === observedServiceRow.service_id ?
        [authorityRow] : [];
      return {success: true, rows, rowSetComplete: rows.length === 1};
    },
  });

  const coordinator = createTimeoutSweepCoordinator({
    nodeId: operationRow.source_node_id,
    systemTableCache: cache,
    ...ledger.options,
    setTimeoutFn: (callback) => ({callback}),
    clearTimeoutFn() {},
  });

  return {authorityRow, cache, coordinator, gatewayCalls, ledger, notifications,
    releaseServiceAuthority() { activeAuthority = true; }};
}

export function registerRebalanceCoordinatorTimeoutCacheVisibilityTailMoreTests({
  test,
  RebalanceCoordinator,
  CONTROL_PLANE_TIMEOUT_DEFAULT,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  QUERY_ERROR_MSG,
  REBALANCER_CONCURRENT_BUDGET_READ_MODE,
  ReplicaStatus,
  PRIORITY_RECOVERY_DEFERRED_COMPLETION_STATE,
  EMERGENCY_PRIORITY_PARTITION_ID,
  buildTransactionCoordinator,
  createCoordinator,
}) {
  test(
    'canStartRemoveOperation keeps emergency publication recovery admitted while the reserved lane contains background pressure',
    async (t) => {
      let replicaOperationReads = 0;
      const coordinator = createCoordinator({
        nodeId: 'node-emergency-priority-remove',
        transactionCoordinator: buildTransactionCoordinator(),
        systemTableCache: {
          filter() {
            return [];
          },
          get() {
            return null;
          },
        },
        cdcIntegrationService: {
      refreshAuthoritativeCacheRow: async () => true,
        },
        controlPlaneReadinessService: {
          async getPriorityRecoveryPlanningSnapshotBestEffort() {
            return this.getPriorityRecoveryPlanningAnswerSync();
          },
          getPriorityRecoveryPlanningAnswerSync() {
            return {
              publicationStatus: 'PENDING',
              priorityPartitionSummary: {
                satisfied: false,
                blockedPartitions: [{
                  partitionId: EMERGENCY_PRIORITY_PARTITION_ID,
                  spreadGap: 1,
                }],
              },
            };
          },
        },
        messageRouter: {
          async deliver() {
            return buildDeliveryEnvelope({acknowledged: true}, {status: 'completed'});
          },
          getOutboundPressureSummary() {
            return {backpressured: true};
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {targetReplicaCount: 3, minReplicaCount: 1};
          },
        },
        sqlQueryEngine: {
          async executeQuery(sql) {
            if (String(sql).includes('FROM replica_operations')) {
              replicaOperationReads += 1;
              return {
                success: false,
                error: 'Distributed operation failed due to participant failures',
                errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
                retryAfterMs: 250,
              };
            }
            return {success: true, rows: [], affectedRows: 0};
          },
        },
        enableTimeouts: false,
      });

      coordinator.initialize();
      try {
        const canStart = await coordinator.canStartRemoveOperation({
          bypassEmptyQueryDelay: true,
          partitionId: EMERGENCY_PRIORITY_PARTITION_ID,
        });
        const outcome =
        coordinator.repository.getLastIncompleteOperationReadOutcome();

        t.equal(
          canStart,
          true,
          'emergency publication recovery removes should stay admitted while only background pressure is being contained',
        );
        t.equal(
          replicaOperationReads,
          1,
          'the emergency remove lane should still attempt one authoritative owner read',
        );
        t.equal(
          outcome?.completionState,
          PRIORITY_RECOVERY_DEFERRED_COMPLETION_STATE,
          'the deferred owner-read outcome should remain visible for remove diagnostics even when admission continues',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  test(
    'canStartRemoveOperation reuses empty cache observation boundary before routed SQL',
    async (t) => {
      let sqlQueryCalls = 0;
      const coordinator = createCoordinator({
        nodeId: 'node-1',
        transactionCoordinator: buildTransactionCoordinator(),
        systemTableCache: {
          filter(tableName) {
            if (tableName !== 'replica_operations') {
              return [];
            }
            return [];
          },
          get() {
            return null;
          },
        },
        cdcIntegrationService: {
      refreshAuthoritativeCacheRow: async () => true,
        },
        messageRouter: {
          async deliver() {
            return buildDeliveryEnvelope({acknowledged: true}, {status: 'completed'});
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {targetReplicaCount: 3, minReplicaCount: 1};
          },
        },
        sqlQueryEngine: {
          async executeQuery() {
            sqlQueryCalls += 1;
            return {success: true, rows: []};
          },
        },
        enableTimeouts: false,
      });

      coordinator.initialize();
      try {
        const canStart = await coordinator.canStartRemoveOperation();
        t.equal(
          canStart,
          false,
          'empty cache should defer remove scheduling until authoritative confirmation is allowed',
        );
        t.equal(
          sqlQueryCalls,
          0,
          'remove scheduling admission should not route replica_operations SQL on empty cache',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  test(
    'checkTimeouts reuses empty cache observation boundary before routed SQL',
    async (t) => {
      let sqlQueryCalls = 0;
      const otherSql = [];
      const coordinator = createCoordinator({
        nodeId: 'node-1',
        transactionCoordinator: buildTransactionCoordinator(),
        systemTableCache: {
          filter(tableName) {
            if (tableName !== 'replica_operations') {
              return [];
            }
            return [];
          },
          get() {
            return null;
          },
        },
        cdcIntegrationService: {
      refreshAuthoritativeCacheRow: async () => true,
        },
        messageRouter: {
          async deliver() {
            return buildDeliveryEnvelope({acknowledged: true}, {status: 'completed'});
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {targetReplicaCount: 3, minReplicaCount: 1};
          },
        },
        sqlQueryEngine: {
          async executeQuery(sql) {
            if (!sql.includes('replica_operations')) {
              otherSql.push(sql);
              return {success: true, rows: []};
            }
            sqlQueryCalls += 1;
            throw new Error('timeout scans should not route replica_operations SQL');
          },
        },
        enableTimeouts: false,
      });

      coordinator.initialize();
      try {
        await coordinator.checkTimeouts();
        t.equal(
          sqlQueryCalls,
          0,
          'timeout scans should stay on the empty cache observation boundary',
        );
        // The periodic storage-reservation sweep (Req 4.4) runs on its own
        // cadence, independent of the incomplete-operation scan: an idle
        // tick reads storage_reservations, never replica_operations.
        t.ok(otherSql.length > 0,
          'the reservation sweep still runs while no operation is incomplete');
        t.equal(
          otherSql.every((sql) => sql.includes('storage_reservations')),
          true,
          'the only SQL an idle timeout tick routes is the reservation sweep',
        );
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  test('queryExistingInFlightOperation falls back to cache when routed SQL read fails',
    async (t) => {
      let sqlQueryCalls = 0;
      const cacheRows = [
        {
          operation_id: 'op-cache-dedupe-1',
          type: 'ADD',
          partition_id: 'partition-1',
          replica_id: 'partition-1-r2',
          source_node_id: 'node-1',
          target_node_id: 'node-2',
          status: 'creating',
          workflow_step: 'CREATING',
          created_at: 100,
          updated_at: 200,
          completed_at: null,
          error_message: null,
          steps_history: '[]',
          entity_type: 'partition',
          entity_id: 'partition-1',
        },
      ];
      const coordinator = createCoordinator({
        nodeId: 'node-1',
        transactionCoordinator: buildTransactionCoordinator(),
        systemTableCache: {
          filter(tableName, predicate) {
            if (tableName !== 'replica_operations') {
              return [];
            }
            return cacheRows.filter(predicate);
          },
          get() {
            return null;
          },
        },
        cdcIntegrationService: {
      refreshAuthoritativeCacheRow: async () => true,
        },
        messageRouter: {
          async deliver() {
            return buildDeliveryEnvelope({acknowledged: true}, {status: 'completed'});
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {targetReplicaCount: 3, minReplicaCount: 1};
          },
        },
        sqlQueryEngine: {
          async executeQuery() {
            sqlQueryCalls += 1;
            return {
              success: false,
              error: 'synthetic read failure',
              rows: [],
            };
          },
        },
        enableTimeouts: false,
      });

      coordinator.initialize();
      try {
        const operation = await coordinator.queryExistingInFlightOperation(
          'partition-1',
          'node-2',
          'partition',
          'partition-1',
          {
            type: 'ADD',
            partitionId: 'partition-1',
            entityType: 'partition',
            entityId: 'partition-1',
            nodeId: 'node-2',
          },
        );
        t.equal(
          operation?.operationId,
          'op-cache-dedupe-1',
          'cache fallback should answer in-flight dedupe reads after SQL failure',
        );
        t.equal(sqlQueryCalls, 1, 'SQL-first dedupe path should attempt one routed read');
      } finally {
        await coordinator.shutdown();
      }
    });

  test('queryIncompleteOperations scopes reads to local operation owner',
    async (t) => {
      const executeQueryCalls = [];
      const coordinator = createCoordinator({
        nodeId: 'node-local',
        transactionCoordinator: buildTransactionCoordinator(),
        systemTableCache: {
          get() {
            return null;
          },
        },
        cdcIntegrationService: {
      refreshAuthoritativeCacheRow: async () => true,
        },
        messageRouter: {
          async deliver() {
            return buildDeliveryEnvelope({acknowledged: true}, {status: 'completed'});
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {targetReplicaCount: 3, minReplicaCount: 1};
          },
        },
        sqlQueryEngine: {
          async executeQuery(sql, params, options = {}) {
            executeQueryCalls.push({
              sql: String(sql),
              params: [...(Array.isArray(params) ? params : [])],
              options,
            });
            return {
              success: true,
              rows: [],
              affectedRows: 0,
            };
          },
        },
        enableTimeouts: false,
      });

      coordinator.initialize();
      try {
        await coordinator.queryIncompleteOperations();
      } finally {
        await coordinator.shutdown();
      }

      const operationQuery = executeQueryCalls[0];
      t.equal(
        Boolean(operationQuery),
        true,
        'queryIncompleteOperations should execute SQL read',
      );
      t.equal(
        operationQuery.sql.includes('source_node_id = ?') &&
        operationQuery.sql.includes('target_node_id = ?'),
        true,
        'query should scope results to the local operation owner set',
      );
      t.equal(
        operationQuery.sql.includes('source_node_id IS NULL OR source_node_id = \'\''),
        false,
        'query should avoid legacy target fallback predicate in owner path',
      );
      t.equal(
        operationQuery.params.includes('node-local'),
        true,
        'owner-scoped query should bind local node id',
      );
      t.equal(
        operationQuery.options.timeoutMs,
        REPLICA_OPERATION_CRITICAL_RECOVERY_QUERY_TIMEOUT_MS,
        'owner-scoped query should retain the critical recovery timeout budget',
      );
    });

  test('queryIncompleteOperations avoids legacy OR predicate timeout path',
    async (t) => {
      const executeQueryCalls = [];
      const coordinator = createCoordinator({
        nodeId: 'node-owner-only',
        transactionCoordinator: buildTransactionCoordinator(),
        systemTableCache: {
          get() {
            return null;
          },
        },
        cdcIntegrationService: {
      refreshAuthoritativeCacheRow: async () => true,
        },
        messageRouter: {
          async deliver() {
            return buildDeliveryEnvelope({acknowledged: true}, {status: 'completed'});
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {targetReplicaCount: 3, minReplicaCount: 1};
          },
        },
        sqlQueryEngine: {
          async executeQuery(sql, params, options = {}) {
            const query = String(sql);
            executeQueryCalls.push({
              sql: query,
              params: [...(Array.isArray(params) ? params : [])],
              options,
            });
            if (query.includes('source_node_id IS NULL OR source_node_id = \'\'')) {
              return {
                success: false,
                error: 'Query timeout after 5000ms',
                rows: [],
              };
            }
            return {
              success: true,
              rows: [
                {
                  operation_id: 'owner-op-1',
                  type: 'ADD',
                  partition_id: 'partition-owner',
                  replica_id: 'partition-owner-r2',
                  source_node_id: 'node-owner-only',
                  target_node_id: 'node-target',
                  status: 'creating',
                  workflow_step: 'CREATING',
                  created_at: 10,
                  updated_at: 20,
                  completed_at: null,
                  error_message: null,
                  steps_history: '[]',
                  entity_type: 'partition',
                  entity_id: 'partition-owner',
                },
              ],
              affectedRows: 0,
            };
          },
        },
        enableTimeouts: false,
      });

      coordinator.initialize();
      try {
        const operations = await coordinator.queryIncompleteOperations();
        t.equal(
          operations.length,
          1,
          'owner-scoped query should return in-flight operations without legacy OR fallback',
        );
        t.equal(
          executeQueryCalls.some((call) =>
            call.sql.includes('source_node_id IS NULL OR source_node_id = \'\'')),
          false,
          'query path should not execute legacy OR fallback predicate',
        );
      } finally {
        await coordinator.shutdown();
      }
    });

  test(
    'checkTimeouts retains creating operations until exact ACTIVE services handoff',
    async (t) => {
      const operationId = 'op-cache-visible-active';
      const fixture = buildActiveHandoffTimeoutFixture(operationId, 'CREATING', 'creating');
      const {authorityRow, cache, coordinator, gatewayCalls, ledger, notifications, releaseServiceAuthority} = fixture;

      coordinator.initialize();
      try {
        await coordinator.checkTimeouts();
        const owner = coordinator.workflowOwner;
        t.ok(ledger.pointReads.some(({rows}) => rows[0]?.operation_id === operationId),
          'the operation is exact and current while the services read is incomplete');
        t.equal(ledger.read().workflow_step, 'CREATING');
        t.equal(ledger.read().error_message, null);
        t.same(ledger.terminalChanges, [], 'incomplete services proof cannot fail the ADD');
        t.ok(gatewayCalls.some(({params}) => params[0] === authorityRow.service_id),
          'the authoritative services lookup targets exactly the nominated replica');
        const pendingRetry = () => owner.observedProgressRetryTimerByOperationId.get(operationId);
        const retry = pendingRetry();
        t.ok(retry, 'cache ACTIVE preserves the existing owner wake');
        let consumed = retry;
        for (let turn = 0; turn < 2 && consumed; turn++) {
          await consumed.timeoutHandle.callback();
          const successor = pendingRetry();
          t.ok(successor && successor.timeoutHandle !== consumed.timeoutHandle,
            'each unavailable turn retains a distinct successor wake');
          t.equal(ledger.read().workflow_step, 'CREATING');
          consumed = successor;
        }

        releaseServiceAuthority();
        cache.applySystemTableChange('services', CDC_OPERATION.UPSERT, authorityRow);
        for (const deliver of notifications.splice(0)) deliver();
        await owner.operationWorkflowRunExclusive(
          owner.getOperationOwnerSingleFlightKey(operationId), () => null);
        const committed = ledger.read();
        t.equal(committed.workflow_step, 'ACTIVE', 'the real services CDC wakes and completes the original ADD');
        t.equal(committed.status, 'active');
        const aligned = cache.get('services', authorityRow.service_id);
        t.match(aligned, authorityRow,
          'the production CDC handoff observes the exact target and its new lifecycle version');
        t.equal(owner.observedProgressRetryTimerByOperationId.has(operationId), false);
      } finally {
        try {
          await coordinator.shutdown();
        } finally {
          ledger.close();
        }
      }
    },
  );

  test(
    'checkTimeouts drains stale priority CREATING REPLACE from ' +
    'cache-visible active target evidence when priority recovery converged',
    async (t) => {
      const TEST_OPERATION_ID = 'op-cache-visible-replace-active';
      const TEST_OPERATION_TYPE = 'REPLACE';
      const TEST_PARTITION_ID = 'replica_operations-p1';
      const TEST_TARGET_REPLICA_ID = 'replica_operations-p1-r5';
      const TEST_SOURCE_REPLICA_ID = 'replica_operations-p1-r2';
      const TEST_SOURCE_NODE_ID = 'node-1';
      const TEST_TARGET_NODE_ID = 'node-2';
      const TEST_ENTITY_TYPE = 'partition';
      const TEST_SERVICE_ADDRESS = 'node-2/partition/replica_operations-p1-r5';
      const TEST_SOURCE_SERVICE_ADDRESS =
      'node-1/partition/replica_operations-p1-r2';
      const TEST_PEER_REPLICA_ID_ONE = 'replica_operations-p1-r1';
      const TEST_PEER_REPLICA_ID_TWO = 'replica_operations-p1-r3';
      const TEST_PEER_NODE_ID_ONE = 'node-3';
      const TEST_PEER_NODE_ID_TWO = 'node-4';
      const TEST_PEER_SERVICE_ADDRESS_ONE =
      'node-3/partition/replica_operations-p1-r1';
      const TEST_PEER_SERVICE_ADDRESS_TWO =
      'node-4/partition/replica_operations-p1-r3';
      const TEST_PUBLICATION_STATUS = 'PUBLISHED';
      const TEST_CONTROL_PLANE_RECOVERY_ELIGIBLE_DIMENSION =
      'controlPlaneRecoveryEligible';
      const TEST_REPAIR_ELIGIBLE_DIMENSION = 'repairEligible';
      const TEST_SERVE_ELIGIBLE_DIMENSION = 'serveEligible';
      const TEST_REPLICA_OPERATIONS_TABLE = 'replica_operations';
      const TEST_SERVICES_TABLE = 'services';
      const TEST_PENDING_STEP = 'PENDING';
      const TEST_SENDING_STEP = 'SENDING';
      const TEST_CREATING_STEP = 'CREATING';
      const TEST_REMOVED_STEP = 'REMOVED';
      const TEST_RAFT_ROLE = 'follower';
      const TEST_DISPATCH_STATUS = 'initiated';
      const TEST_STALE_OPERATION_AGE_MS = 70000;
      const TEST_OPERATION_CREATED_OFFSET_MS = 5000;
      const TEST_PENDING_STEP_OFFSET_MS = 1000;
      const TEST_SENDING_STEP_OFFSET_MS = 900;
      const TEST_CREATING_STEP_OFFSET_MS = 800;
      const TEST_MIN_REPLICA_COUNT = 3;
      const TEST_EXPECTED_MIN_GATEWAY_CALLS = 2;

      const nowMs = Date.now();
      const staleUpdatedAtMs = nowMs - TEST_STALE_OPERATION_AGE_MS;
      const observedServiceRow = {
        service_id: TEST_TARGET_REPLICA_ID,
        replica_id: TEST_TARGET_REPLICA_ID,
        partition_id: TEST_PARTITION_ID,
        node_id: TEST_TARGET_NODE_ID,
        service_type: TEST_ENTITY_TYPE,
        status: ReplicaStatus.ACTIVE,
        raft_role: TEST_RAFT_ROLE,
        address: TEST_SERVICE_ADDRESS,
      };
      const sourceServiceRow = {
        service_id: TEST_SOURCE_REPLICA_ID,
        replica_id: TEST_SOURCE_REPLICA_ID,
        partition_id: TEST_PARTITION_ID,
        node_id: TEST_SOURCE_NODE_ID,
        service_type: TEST_ENTITY_TYPE,
        status: ReplicaStatus.ACTIVE,
        raft_role: TEST_RAFT_ROLE,
        address: TEST_SOURCE_SERVICE_ADDRESS,
      };
      const peerServiceRowOne = {
        service_id: TEST_PEER_REPLICA_ID_ONE,
        replica_id: TEST_PEER_REPLICA_ID_ONE,
        partition_id: TEST_PARTITION_ID,
        node_id: TEST_PEER_NODE_ID_ONE,
        service_type: TEST_ENTITY_TYPE,
        status: ReplicaStatus.ACTIVE,
        raft_role: TEST_RAFT_ROLE,
        address: TEST_PEER_SERVICE_ADDRESS_ONE,
      };
      const peerServiceRowTwo = {
        service_id: TEST_PEER_REPLICA_ID_TWO,
        replica_id: TEST_PEER_REPLICA_ID_TWO,
        partition_id: TEST_PARTITION_ID,
        node_id: TEST_PEER_NODE_ID_TWO,
        service_type: TEST_ENTITY_TYPE,
        status: ReplicaStatus.ACTIVE,
        raft_role: TEST_RAFT_ROLE,
        address: TEST_PEER_SERVICE_ADDRESS_TWO,
      };
      const observedServiceRows = [
        observedServiceRow,
        sourceServiceRow,
        peerServiceRowOne,
        peerServiceRowTwo,
      ];
      const recoveryNodeIds = [
        TEST_SOURCE_NODE_ID,
        TEST_TARGET_NODE_ID,
        TEST_PEER_NODE_ID_ONE,
        TEST_PEER_NODE_ID_TWO,
      ];
      const publishedPriorityRecoverySnapshot = Object.freeze({
        publicationStatus: TEST_PUBLICATION_STATUS,
        publishedActiveNodeIdsPresent: true,
        publishedActiveNodeIds: Object.freeze([...recoveryNodeIds]),
        recoveryActiveNodeIds: Object.freeze([...recoveryNodeIds]),
        projectedServingNodeIds: Object.freeze([...recoveryNodeIds]),
        locallyEligibleNodeIds: Object.freeze([...recoveryNodeIds]),
        publishedMembershipIncludesTargetNode: true,
        priorityPartitionSummary: Object.freeze({
          satisfied: true,
          requiredDistinctNodeCount: TEST_MIN_REPLICA_COUNT,
          missingPartitionIds: Object.freeze([]),
        }),
      });
      const operationRow = {
        operation_id: TEST_OPERATION_ID,
        type: TEST_OPERATION_TYPE,
        partition_id: TEST_PARTITION_ID,
        replica_id: TEST_TARGET_REPLICA_ID,
        source_node_id: TEST_SOURCE_NODE_ID,
        target_node_id: TEST_TARGET_NODE_ID,
        status: ReplicaStatus.CREATING,
        workflow_step: TEST_CREATING_STEP,
        created_at: staleUpdatedAtMs - TEST_OPERATION_CREATED_OFFSET_MS,
        updated_at: staleUpdatedAtMs,
        completed_at: null,
        error_message: null,
        steps_history: JSON.stringify([
          {
            step: TEST_PENDING_STEP,
            timestamp: staleUpdatedAtMs - TEST_PENDING_STEP_OFFSET_MS,
            sourceReplicaId: TEST_SOURCE_REPLICA_ID,
          },
          {
            step: TEST_SENDING_STEP,
            timestamp: staleUpdatedAtMs - TEST_SENDING_STEP_OFFSET_MS,
          },
          {
            step: TEST_CREATING_STEP,
            timestamp: staleUpdatedAtMs - TEST_CREATING_STEP_OFFSET_MS,
          },
        ]),
        entity_type: TEST_ENTITY_TYPE,
        entity_id: TEST_PARTITION_ID,
      };
      const gatewayCalls = [];

      const store = createCoordinatorSqlStore({
        getAll: (table) => table === TEST_REPLICA_OPERATIONS_TABLE ? [operationRow] : [],
        upsert: (_table, row) => Object.assign(operationRow, row),
      });

      const coordinator = createCoordinator({
        nodeId: TEST_TARGET_NODE_ID,
        transactionCoordinator: buildTransactionCoordinator(),
        systemTableCache: {
          get(tableName, key) {
            if (tableName === TEST_REPLICA_OPERATIONS_TABLE) {
              return key === operationRow.operation_id ? operationRow : null;
            }
            if (tableName === TEST_SERVICES_TABLE) {
              return observedServiceRows.find((row) => row.service_id === key) ||
              null;
            }
            return null;
          },
          getAll(tableName) {
            if (tableName === TEST_REPLICA_OPERATIONS_TABLE) {
              return [operationRow];
            }
            if (tableName === TEST_SERVICES_TABLE) {
              return observedServiceRows;
            }
            return [];
          },
          filter(tableName, predicate) {
            return this.getAll(tableName).filter(predicate);
          },
        },
        cdcIntegrationService: {
      refreshAuthoritativeCacheRow: async () => true,
        },
        controlPlaneReadinessService: {
          getNodeReadinessSync(nodeId) {
            return {
              nodeId,
              dimensions: {
                [TEST_CONTROL_PLANE_RECOVERY_ELIGIBLE_DIMENSION]: true,
                [TEST_REPAIR_ELIGIBLE_DIMENSION]: true,
                [TEST_SERVE_ELIGIBLE_DIMENSION]: true,
              },
            };
          },
          async getPriorityRecoveryPlanningSnapshotBestEffort() {
            return this.getPriorityRecoveryPlanningAnswerSync();
          },
          getPriorityRecoveryPlanningAnswerSync() {
            return publishedPriorityRecoverySnapshot;
          },
        },
        controlPlaneSystemTableGateway: {
          async readAuthoritativeRows(tableName, sql, params, options) {
            gatewayCalls.push({tableName, sql, options});
            // The ledger is present and current; only SERVICES misses the
            // cache-visible target. These are distinct owner observations.
            return store.execute(sql, params);
          },
          async executeQuery(sql, params) {
            return store.execute(sql, params);
          },
        },
        messageRouter: {
          async deliver() {
            return buildDeliveryEnvelope({acknowledged: true}, {status: TEST_DISPATCH_STATUS});
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {targetReplicaCount: 3, minReplicaCount: TEST_MIN_REPLICA_COUNT};
          },
        },
        enableTimeouts: false,
      });

      coordinator.initialize();
      try {
        await coordinator.checkTimeouts();

        t.not(
          operationRow.workflow_step,
          TEST_REMOVED_STEP,
          'a REPLACE whose source services row is still ACTIVE must never ' +
            'terminalize as REMOVED off target evidence alone',
        );
        t.equal(
          operationRow.workflow_step,
          'FAILED',
          'stale priority REPLACE without source-retirement evidence ' +
            'should settle as FAILED (re-plannable)',
        );
        t.equal(
          operationRow.status,
          ReplicaStatus.FAILED,
          'stale priority REPLACE drain settle should persist failed status',
        );
        t.equal(
          gatewayCalls.length >= TEST_EXPECTED_MIN_GATEWAY_CALLS,
          true,
          'timeout reconciliation should attempt authoritative reads before using observed cache state',
        );
      } finally {
        await coordinator.shutdown();
        store.suspend();
      }
    },
  );

  test(
    'checkTimeouts retains sending operations until exact ACTIVE services handoff',
    async (t) => {
      const operationId = 'op-cache-visible-sending-active';
      const fixture = buildActiveHandoffTimeoutFixture(operationId, 'SENDING', 'pending');
      const {authorityRow, cache, coordinator, gatewayCalls, ledger, releaseServiceAuthority} = fixture;

      coordinator.initialize();
      try {
        await coordinator.checkTimeouts();
        const owner = coordinator.workflowOwner;
        t.ok(ledger.pointReads.some(({rows}) => rows[0]?.operation_id === operationId),
          'the operation is exact and current while the services read is incomplete');
        t.equal(ledger.read().workflow_step, 'SENDING');
        t.equal(ledger.read().error_message, null);
        t.same(ledger.terminalChanges, [], 'incomplete services proof cannot fail the ADD');
        t.ok(gatewayCalls.some(({params}) => params[0] === authorityRow.service_id),
          'the authoritative services lookup targets exactly the nominated replica');
        const retry = owner.observedProgressRetryTimerByOperationId.get(operationId);
        t.ok(retry, 'cache ACTIVE preserves the existing owner wake');

        releaseServiceAuthority();
        await retry.timeoutHandle.callback();
        const committed = ledger.read();
        t.equal(committed.workflow_step, 'ACTIVE', 'the retained wake completes the original ADD');
        t.equal(committed.status, 'active');
        const aligned = cache.get('services', authorityRow.service_id);
        t.match(aligned, authorityRow,
          'the production CDC handoff observes the exact target and its new lifecycle version');
        t.equal(owner.observedProgressRetryTimerByOperationId.has(operationId), false);
      } finally {
        try {
          await coordinator.shutdown();
        } finally {
          ledger.close();
        }
      }
    },
  );

  test('timeout checker backs off empty incomplete-operation scans', async (t) => {
    let incompleteQueryAttempts = 0;
    const coordinator = createCoordinator({
      nodeId: 'node-empty-backoff',
      transactionCoordinator: buildTransactionCoordinator(),
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
      refreshAuthoritativeCacheRow: async () => true,
      },
      messageRouter: {
        async deliver() {
          return buildDeliveryEnvelope({acknowledged: true}, {status: 'completed'});
        },
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {targetReplicaCount: 3, minReplicaCount: 1};
        },
      },
      sqlQueryEngine: {
        async executeQuery(sql) {
          if (String(sql).includes('FROM replica_operations')) {
            incompleteQueryAttempts += 1;
          }
          return {
            success: true,
            rows: [],
            affectedRows: 0,
          };
        },
      },
      enableTimeouts: false,
    });
    coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs = 60_000;

    coordinator.initialize();
    try {
      await coordinator.checkTimeouts();
      await coordinator.checkTimeouts();
      await coordinator.checkTimeouts();
      t.equal(
        incompleteQueryAttempts,
        1,
        'empty timeout scans should back off instead of querying on every loop',
      );

      coordinator.workflowOwner.lastEmptyIncompleteOperationQueryAtMs =
      Date.now() -
      coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs -
      1;
      await coordinator.checkTimeouts();
      t.equal(
        incompleteQueryAttempts,
        2,
        'query should resume once empty-scan backoff window has elapsed',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

  test(
    'timeout checker survives repeated replica_operations query timeouts',
    async (t) => {
      let incompleteQueryAttempts = 0;
      const coordinator = createCoordinator({
        nodeId: 'node-timeout-loop',
        transactionCoordinator: buildTransactionCoordinator(),
        systemTableCache: {
          get() {
            return null;
          },
        },
        cdcIntegrationService: {
      refreshAuthoritativeCacheRow: async () => true,
        },
        messageRouter: {
          async deliver() {
            return buildDeliveryEnvelope({acknowledged: true}, {status: 'completed'});
          },
        },
        tablePolicyService: {
          async getPolicyForPartition() {
            return {targetReplicaCount: 3, minReplicaCount: 1};
          },
        },
        sqlQueryEngine: {
          async executeQuery(sql) {
            if (String(sql).includes('FROM replica_operations')) {
              incompleteQueryAttempts += 1;
              throw new Error('Query timeout after 5000ms');
            }
            return {
              success: true,
              rows: [],
              affectedRows: 0,
            };
          },
        },
      });
      coordinator.timeoutCheckIntervalMs = 5;

      coordinator.initialize();
      try {
        await new Promise((resolve) => setTimeout(resolve, 30));
      } finally {
        await coordinator.shutdown();
      }

      t.equal(
        incompleteQueryAttempts >= 2,
        true,
        'periodic timeout loop should keep running through repeated query timeouts',
      );
      t.equal(
        coordinator.timeoutCheckInFlight,
        false,
        'timeout loop should release in-flight guard after timeout errors',
      );
    },
  );


  registerRebalanceCoordinatorTimeoutCacheVisibilityTailFinalTests({
    test,
    RebalanceCoordinator,
    CONTROL_PLANE_TIMEOUT_DEFAULT,
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
    QUERY_ERROR_MSG,
    REBALANCER_CONCURRENT_BUDGET_READ_MODE,
    ReplicaStatus,
    PRIORITY_RECOVERY_DEFERRED_COMPLETION_STATE,
    EMERGENCY_PRIORITY_PARTITION_ID,
    buildTransactionCoordinator,
    createCoordinator,
  });
}
