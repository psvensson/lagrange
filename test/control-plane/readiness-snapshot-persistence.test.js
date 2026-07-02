/**
 * Tests proving readiness snapshots are persisted with decisions.
 * Task 4.2 — Requirements 4, 7, 9.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  AUTHORITY_DESCRIPTOR_STATE,
  READINESS_SNAPSHOT_KEY,
  CONTROL_PLANE_READINESS_DIMENSION,
  PROVISIONING_ELIGIBILITY_STATE,
  RUNTIME_AUTHORITY_PUBLICATION_STATE,
  RUNTIME_AUTHORITY_REPAIR_STATE,
  RUNTIME_AUTHORITY_STATE,
  RUNTIME_AUTHORITY_VISIBILITY_STATE,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  OPERATION_METADATA_KEY,
} from '../../src/rebalancer/replica-status.js';
import {RebalanceCoordinator} from
  '../../src/rebalancer/rebalance-coordinator.js';
import {ReplicaDispatchService} from
  '../../src/control-plane/replica-dispatch-service.js';
import {
  StorageAdmissionService,
} from '../../src/rebalancer/storage-admission-service.js';
import {StorageCapacityAccountingService} from
  '../../src/rebalancer/storage-capacity-accounting-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CDC_OPERATION} from '../../src/constants/cdc.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {
  COLUMN,
  NUM,
  SERVICE_TYPE,
  TABLES,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {
  ADMISSION_MODE,
  STORAGE_CAPACITY_DEFAULT,
} from '../../src/rebalancer/storage-capacity-constants.js';
import {
  STORAGE_ADMISSION_DECISION_TYPE,
} from '../../src/rebalancer/storage-admission-constants.js';
import {DISPATCH_EVENT} from
  '../../src/control-plane/replica-dispatch-service-constants.js';

const TEST_NODE_ID = 'node-test-1';
const TEST_BUDGET_BYTES = 1000000;
const TEST_ESTIMATED_BYTES = 100;

function initializeConfig(overrides = {}) {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({
    rebalancer: {
      minimumReplicaBytes: NUM.TEN,
      partitionReplicaOverheadBytes: NUM.FIVE,
      messageGroupReplicaOverheadBytes: 2,
      serviceReplicaOverheadBytes: 1,
      storageSoftPressurePercent:
        STORAGE_CAPACITY_DEFAULT.SOFT_PRESSURE_PERCENT,
      storageHardPressurePercent:
        STORAGE_CAPACITY_DEFAULT.HARD_PRESSURE_PERCENT,
      storageEmergencyHeadroomPercent:
        STORAGE_CAPACITY_DEFAULT.EMERGENCY_HEADROOM_PERCENT,
      storageAdmissionMode: ADMISSION_MODE.ENFORCE,
      ...overrides,
    },
  });
}

function insertRow(cache, tableName, row) {
  cache.applySystemTableChange(tableName, CDC_OPERATION.INSERT, row);
}

function createReadiness(nodeId, overrides = {}) {
  return Object.freeze({
    nodeId,
    lifecycleState: overrides.lifecycleState || 'running',
    publication: Object.freeze({mode: 'grouped'}),
    capacity: null,
    observedAt: overrides.observedAt || '2026-03-06T00:00:00.000Z',
    runtimeAuthority: Object.freeze(overrides.runtimeAuthority || {
      state: RUNTIME_AUTHORITY_STATE.CONFIRMED,
      authorityAvailable: true,
      ready: true,
      processAlive: true,
      clusterMemberHealthy: true,
      routingReady: true,
      writeEligible: true,
      recoveryEligible: true,
      repairEligible: true,
      publication: Object.freeze({
        state: RUNTIME_AUTHORITY_PUBLICATION_STATE.HEALTHY,
        healthy: true,
      }),
      visibility: Object.freeze({
        state: RUNTIME_AUTHORITY_VISIBILITY_STATE.CONFIRMED,
        published: true,
        observedAt: overrides.observedAt || '2026-03-06T00:00:00.000Z',
      }),
      repair: Object.freeze({
        state: RUNTIME_AUTHORITY_REPAIR_STATE.NOT_ATTEMPTED,
        applied: false,
      }),
      provisioning: Object.freeze({
        state: PROVISIONING_ELIGIBILITY_STATE.STEADY,
        eligible: true,
      }),
      failure: Object.freeze({
        state: AUTHORITY_DESCRIPTOR_STATE.NONE,
        reason: null,
      }),
      reasonCodes: Object.freeze([]),
    }),
    dimensions: Object.freeze({
      processAlive: true,
      clusterMemberHealthy: true,
      routingReady: true,
      loadReady: true,
      placementEligible: true,
      provisioningEligible: true,
      controlPlaneWritable: true,
      metadataPublicationHealthy: true,
      [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
      ...(overrides.dimensions || {}),
    }),
    reasons: Object.freeze(overrides.reasons || []),
  });
}

function createReadinessService(readinessByNodeId) {
  return {
    getNodeReadinessSync(nodeId) {
      return readinessByNodeId[nodeId] || null;
    },
    async getNodeReadiness(nodeId) {
      return readinessByNodeId[nodeId] || createReadiness(nodeId);
    },
  };
}

function createTransactionCoordinator() {
  return {
    async begin() {
      return {success: true};
    },
    async commit() {
      return {success: true};
    },
    async rollback() {
      return {success: true};
    },
  };
}

// --- compactSnapshotSummary ---

test('compactSnapshotSummary extracts key fields from full snapshot',
  async (t) => {
    const snapshot = createReadiness(TEST_NODE_ID, {
      lifecycleState: 'running',
      observedAt: '2026-03-06T00:00:00.000Z',
      reasons: [
        {code: 'storage_budget_unavailable', dimension: 'placementEligible'},
      ],
    });

    const summary =
      ControlPlaneReadinessService.compactSnapshotSummary(
        snapshot,
        CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
      );

    t.equal(
      summary[READINESS_SNAPSHOT_KEY.NODE_ID],
      TEST_NODE_ID,
    );
    t.ok(summary[READINESS_SNAPSHOT_KEY.DIMENSIONS]);
    t.equal(
      summary[READINESS_SNAPSHOT_KEY.DIMENSIONS].processAlive,
      true,
    );
    t.same(
      summary[READINESS_SNAPSHOT_KEY.REASON_CODES],
      ['storage_budget_unavailable'],
    );
    t.equal(
      summary[READINESS_SNAPSHOT_KEY.LIFECYCLE_STATE],
      'running',
    );
    t.equal(
      summary[READINESS_SNAPSHOT_KEY.OBSERVED_AT],
      '2026-03-06T00:00:00.000Z',
    );
    t.equal(
      summary[READINESS_SNAPSHOT_KEY.DECISION_DIMENSION],
      CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
    );
    t.match(
      summary[READINESS_SNAPSHOT_KEY.RUNTIME_AUTHORITY],
      {
        state: RUNTIME_AUTHORITY_STATE.CONFIRMED,
        publication: {
          state: RUNTIME_AUTHORITY_PUBLICATION_STATE.HEALTHY,
        },
        visibility: {
          state: RUNTIME_AUTHORITY_VISIBILITY_STATE.CONFIRMED,
        },
      },
    );
  });

test('compactSnapshotSummary returns null for null input',
  async (t) => {
    const summary =
      ControlPlaneReadinessService.compactSnapshotSummary(null);
    t.equal(summary, null);
  });

test('compactSnapshotSummary returns frozen object', async (t) => {
  const snapshot = createReadiness(TEST_NODE_ID);
  const summary =
    ControlPlaneReadinessService.compactSnapshotSummary(snapshot);
  t.ok(Object.isFrozen(summary));
  t.ok(Object.isFrozen(summary[READINESS_SNAPSHOT_KEY.DIMENSIONS]));
  t.ok(Object.isFrozen(summary[READINESS_SNAPSHOT_KEY.REASON_CODES]));
});

// --- StorageAdmissionService includes readinessSnapshots ---

test('admission result includes readinessSnapshots per candidate node',
  async (t) => {
    initializeConfig();
    const cache = new SystemTableCache();
    const accounting = new StorageCapacityAccountingService({
      systemTableCache: cache,
    });
    accounting.initialize({systemTableCache: cache});

    insertRow(cache, TABLES.NODES, {
      [COLUMN.NODE_ID]: TEST_NODE_ID,
      [COLUMN.STORAGE_BUDGET_BYTES]: TEST_BUDGET_BYTES,
    });

    const readiness = createReadiness(TEST_NODE_ID);
    const readinessService = createReadinessService({
      [TEST_NODE_ID]: readiness,
    });

    const admission = new StorageAdmissionService({
      accountingService: accounting,
      controlPlaneReadinessService: readinessService,
    });

    const result = await admission.checkAdd({
      targetNodeId: TEST_NODE_ID,
      estimatedBytes: TEST_ESTIMATED_BYTES,
    });

    t.equal(result.allowed, true);
    t.equal(
      result.decisionType,
      STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
    );
    t.ok(result.readinessSnapshots, 'result has readinessSnapshots');
    t.ok(
      result.readinessSnapshots[TEST_NODE_ID],
      'snapshot present for target node',
    );
    t.equal(
      result.readinessSnapshots[TEST_NODE_ID][
        READINESS_SNAPSHOT_KEY.NODE_ID
      ],
      TEST_NODE_ID,
    );
    t.ok(
      result.readinessSnapshots[TEST_NODE_ID][
        READINESS_SNAPSHOT_KEY.DIMENSIONS
      ],
    );
    t.equal(
      result.readinessSnapshots[TEST_NODE_ID][
        READINESS_SNAPSHOT_KEY.DECISION_DIMENSION
      ],
      CONTROL_PLANE_READINESS_DIMENSION.PROVISIONING_ELIGIBLE,
    );
    t.equal(
      result.readinessSnapshots[TEST_NODE_ID][
        READINESS_SNAPSHOT_KEY.OBSERVED_AT
      ],
      readiness.observedAt,
    );
  });

// --- RebalanceCoordinator persists readiness snapshot in stepsHistory ---

test('coordinator createOperation persists readiness snapshot in initial step',
  async (t) => {
    initializeConfig();
    const targetNodeId = 'node-target-1';
    const readiness = createReadiness(targetNodeId, {
      lifecycleState: 'running',
      reasons: [{code: 'test_reason', dimension: 'loadReady'}],
    });
    const readinessService = createReadinessService({
      [targetNodeId]: readiness,
    });
    const storageAccountingService = {
      estimateReplicaBytes() {
        return TEST_ESTIMATED_BYTES;
      },
    };
    const storageAdmissionService = {
      async checkAdd() {
        return {
          allowed: true,
          decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
          readinessSnapshots: {
            [targetNodeId]:
              ControlPlaneReadinessService.compactSnapshotSummary(
                readiness,
                CONTROL_PLANE_READINESS_DIMENSION.PROVISIONING_ELIGIBLE,
              ),
          },
        };
      },
    };

    let persistedStepsHistory = null;
    let persistedOperationRow = null;
    const controlPlaneSystemTableGateway = {
      async submitMutation(_mutation) {
        return {
          success: true,
          partitionResult: {affectedRows: 1},
        };
      },
      async executeQuery(_sql, params = []) {
        if (typeof _sql === 'string' &&
            _sql.includes('FROM replica_operations') &&
            Array.isArray(params) &&
            params.length === 1 &&
            params[0] === persistedOperationRow?.operation_id) {
          return {
            success: true,
            rows: [persistedOperationRow],
          };
        }
        if (Array.isArray(params) && params.length > NUM.TEN) {
          persistedOperationRow = {
            operation_id: params[0],
            type: params[1],
            partition_id: params[2],
            replica_id: params[3],
            source_node_id: params[4],
            target_node_id: params[5],
            status: params[6],
            workflow_step: params[7],
            created_at: params[8],
            updated_at: params[9],
            completed_at: params[10],
            error_message: params[11],
            steps_history: params[12],
            entity_type: params[13],
            entity_id: params[14],
          };
          if (typeof persistedOperationRow.steps_history === 'string') {
            persistedStepsHistory = JSON.parse(
              persistedOperationRow.steps_history,
            );
          }
        }
        return {success: true, rows: [], affectedRows: 1, changes: 1};
      },
      async readAuthoritativeRows(_tableName, _sql, params = []) {
        return controlPlaneSystemTableGateway.executeQuery(_sql, params);
      },
      async readRows(_tableName, _sql, params = []) {
        return controlPlaneSystemTableGateway.executeQuery(_sql, params);
      },
    };
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-local',
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'initiated'};
        },
      },
      sqlQueryEngine: {
        async executeQuery(_sql, params) {
          if (typeof _sql === 'string' &&
              _sql.includes('FROM replica_operations') &&
              Array.isArray(params) &&
              params.length === 1 &&
              params[0] === persistedOperationRow?.operation_id) {
            return {
              success: true,
              rows: [persistedOperationRow],
            };
          }
          if (params && Array.isArray(params) && params.length > NUM.TEN) {
            // INSERT_OPERATION — capture stepsHistory (param index 12)
            const historyJson = params[12];
            if (typeof historyJson === 'string') {
              persistedStepsHistory = JSON.parse(historyJson);
            }
            persistedOperationRow = {
              operation_id: params[0],
              type: params[1],
              partition_id: params[2],
              replica_id: params[3],
              source_node_id: params[4],
              target_node_id: params[5],
              status: params[6],
              workflow_step: params[7],
              created_at: params[8],
              updated_at: params[9],
              completed_at: params[10],
              error_message: params[11],
              steps_history: params[12],
              entity_type: params[13],
              entity_id: params[14],
            };
          }
          return {success: true, rows: [], affectedRows: 1, changes: 1};
        },
      },
      controlPlaneReadinessService: readinessService,
      controlPlaneSystemTableGateway,
      storageAccountingService,
      storageAdmissionService,
      enableTimeouts: false,
    });
    coordinator.initialize();

    try {
      const operation = await coordinator.createOperation({
        type: 'ADD',
        partitionId: 'partition-1',
        nodeId: targetNodeId,
      });

      t.ok(operation, 'operation created');
      t.ok(persistedStepsHistory, 'stepsHistory was persisted');
      t.ok(
        persistedStepsHistory.length > 0,
        'stepsHistory has entries',
      );

      const initialStep = persistedStepsHistory[0];
      t.ok(
        initialStep[OPERATION_METADATA_KEY.READINESS_SNAPSHOT],
        'initial step has readinessSnapshot',
      );
      t.equal(
        initialStep[OPERATION_METADATA_KEY.READINESS_SNAPSHOT][
          READINESS_SNAPSHOT_KEY.NODE_ID
        ],
        targetNodeId,
      );
      t.same(
        initialStep[OPERATION_METADATA_KEY.READINESS_SNAPSHOT][
          READINESS_SNAPSHOT_KEY.REASON_CODES
        ],
        ['test_reason'],
      );
    } finally {
      await coordinator.shutdown();
    }
  });

// --- ReplicaDispatchService includes readiness snapshot in dispatch event ---

test('dispatch service emits readiness snapshot with dispatch event',
  async (t) => {
    initializeConfig();
    const targetNodeId = 'node-dispatch-target';
    const readiness = createReadiness(targetNodeId, {
      lifecycleState: 'running',
    });
    const readinessService = createReadinessService({
      [targetNodeId]: readiness,
    });

    let dispatchedEvent = null;
    const dispatchService = new ReplicaDispatchService({
      nodeId: 'node-local',
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'initiated'};
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      systemTableCache: {
        get() {
          return null;
        },
        getAll() {
          return [];
        },
        onCacheChange() {},
        offCacheChange() {},
      },
      rebalanceCoordinator: {
        async claimDispatchTransition(opId) {
          return {
            operationId: opId,
            type: 'ADD',
            partitionId: 'partition-1',
            entityType: 'partition',
            entityId: 'partition-1',
            replicaId: 'partition-1-r1',
            sourceNodeId: 'node-local',
            targetNodeId,
            status: 'in_progress',
            workflowStep: WORKFLOW_STEP.SENDING,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            completedAt: null,
            errorMessage: null,
            stepsHistory: [],
          };
        },
        async executeOperation() {
          return {success: true};
        },
        on() {},
        off() {},
      },
      controlPlaneReadinessService: readinessService,
    });

    dispatchService.on(DISPATCH_EVENT.OPERATION_DISPATCHED, (event) => {
      dispatchedEvent = event;
    });

    const row = {
      operation_id: 'op-dispatch-1',
      type: 'ADD',
      partition_id: 'partition-1',
      replica_id: 'partition-1-r1',
      source_node_id: 'node-local',
      target_node_id: targetNodeId,
      status: 'pending',
      workflow_step: WORKFLOW_STEP.PENDING,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    await dispatchService.dispatchOperationRow(row);

    t.ok(dispatchedEvent, 'dispatch event was emitted');
    t.ok(
      dispatchedEvent.readinessSnapshot,
      'dispatch event includes readinessSnapshot',
    );
    t.equal(
      dispatchedEvent.readinessSnapshot[READINESS_SNAPSHOT_KEY.NODE_ID],
      targetNodeId,
    );
    t.ok(
      dispatchedEvent.readinessSnapshot[
        READINESS_SNAPSHOT_KEY.DIMENSIONS
      ],
    );
  });

test('dispatch service passes row metadata through direct dispatch',
  async (t) => {
    initializeConfig();
    const targetNodeId = 'node-dispatch-target';
    const readiness = createReadiness(targetNodeId);
    const readinessService = createReadinessService({
      [targetNodeId]: readiness,
    });

    let capturedOperation = null;
    const dispatchService = new ReplicaDispatchService({
      nodeId: 'node-local',
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'initiated'};
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      systemTableCache: {
        get() {
          return null;
        },
        getAll() {
          return [];
        },
        onCacheChange() {},
        offCacheChange() {},
      },
      rebalanceCoordinator: {
        async dispatchOperation(operation) {
          capturedOperation = operation;
          return {success: true};
        },
        on() {},
        off() {},
      },
      controlPlaneReadinessService: readinessService,
    });

    const row = {
      operation_id: 'op-dispatch-bootstrap',
      type: 'ADD',
      partition_id: 'partition-1',
      replica_id: 'partition-1-r1',
      source_node_id: 'node-local',
      target_node_id: targetNodeId,
      status: 'pending',
      workflow_step: WORKFLOW_STEP.PENDING,
      created_at: Date.now(),
      updated_at: Date.now(),
      steps_history: JSON.stringify([{
        [OPERATION_METADATA_KEY.REPLICA_IDS]: ['partition-1-r1'],
        [OPERATION_METADATA_KEY.PEER_ADDRESSES]: ['node-a:8080'],
        [OPERATION_METADATA_KEY.BOOTSTRAP_TABLE_METADATA]: {
          table_id: 'table-1',
          table_name: 'benchmark_events',
        },
        [OPERATION_METADATA_KEY.BOOTSTRAP_PARTITION_METADATA]: {
          partition_id: 'partition-1',
          table_id: 'table-1',
        },
      }]),
    };

    await dispatchService.dispatchOperationRow(row);

    t.ok(capturedOperation, 'dispatch coordinator received an operation');
    t.same(
      capturedOperation.replicaIds,
      ['partition-1-r1'],
      'dispatch uses replica metadata from the row context',
    );
    t.same(
      capturedOperation.peerAddresses,
      ['node-a:8080'],
      'dispatch uses peer metadata from the row context',
    );
    t.same(
      capturedOperation.bootstrapTableMetadata,
      {
        table_id: 'table-1',
        table_name: 'benchmark_events',
      },
      'dispatch uses bootstrap table metadata from the row context',
    );
    t.same(
      capturedOperation.bootstrapPartitionMetadata,
      {
        partition_id: 'partition-1',
        table_id: 'table-1',
      },
      'dispatch uses bootstrap partition metadata from the row context',
    );
  });

test('dispatch service emits failure event when target is not ready',
  async (t) => {
    initializeConfig();
    const targetNodeId = 'node-dispatch-blocked';
    const readiness = createReadiness(targetNodeId, {
      dimensions: {
        [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
      },
    });
    const readinessService = createReadinessService({
      [targetNodeId]: readiness,
    });

    let failureEvent = null;
    const dispatchService = new ReplicaDispatchService({
      nodeId: 'node-local',
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'initiated'};
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      systemTableCache: {
        get() {
          return null;
        },
        getAll() {
          return [];
        },
        onCacheChange() {},
        offCacheChange() {},
      },
      rebalanceCoordinator: {
        async dispatchOperation() {
          t.fail('dispatch should not run for a not-ready target');
        },
        on() {},
        off() {},
      },
      controlPlaneReadinessService: readinessService,
    });
    t.teardown(() => {
      dispatchService.stop();
    });

    dispatchService.on(DISPATCH_EVENT.OPERATION_FAILED, (event) => {
      failureEvent = event;
    });

    await dispatchService.dispatchOperationRow({
      operation_id: 'op-dispatch-blocked',
      type: 'ADD',
      partition_id: 'partition-1',
      replica_id: 'partition-1-r1',
      source_node_id: 'node-local',
      target_node_id: targetNodeId,
      status: 'pending',
      workflow_step: WORKFLOW_STEP.PENDING,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    t.ok(failureEvent, 'dispatch failure event was emitted');
    t.equal(
      failureEvent.reason,
      'target_node_not_ready',
      'failure event reports readiness gate reason',
    );
    t.equal(
      failureEvent.targetNodeId,
      targetNodeId,
      'failure event reports target node',
    );
    t.ok(
      failureEvent.readinessSnapshot,
      'failure event includes readiness snapshot',
    );
  });

// --- Coordinator updateStep persists readiness snapshot ---

test('coordinator updateStep persists readiness snapshot in step entry',
  async (t) => {
    initializeConfig();
    const targetNodeId = 'node-step-target';
    const readiness = createReadiness(targetNodeId, {
      lifecycleState: 'running',
    });
    const readinessService = createReadinessService({
      [targetNodeId]: readiness,
    });

    let lastPersistedHistory = null;
    const coordinator = new RebalanceCoordinator({
      nodeId: 'node-local',
      systemTableCache: {
        get() {
          return null;
        },
      },
      cdcIntegrationService: {
        async waitForCacheUpdate() {},
      },
      tablePolicyService: {
        async getPolicyForPartition() {
          return {minReplicaCount: 1};
        },
      },
      messageRouter: {
        async deliver() {
          return {acknowledged: true, status: 'initiated'};
        },
      },
      sqlQueryEngine: {
        async executeQuery(_sql, params) {
          if (params && Array.isArray(params)) {
            // UPDATE_OPERATION — stepsHistory is param index 5
            const historyCandidate = params[NUM.FIVE];
            if (typeof historyCandidate === 'string' &&
                historyCandidate.startsWith('[')) {
              lastPersistedHistory = JSON.parse(historyCandidate);
            }
          }
          return {success: true, rows: [], affectedRows: 1, changes: 1};
        },
      },
      controlPlaneReadinessService: readinessService,
      transactionCoordinator: createTransactionCoordinator(),
      enableTimeouts: false,
    });
    coordinator.initialize();

    try {
      const operation = {
        operationId: 'op-step-test',
        type: 'ADD',
        partitionId: 'partition-1',
        entityType: SERVICE_TYPE.PARTITION,
        entityId: 'partition-1',
        replicaId: 'partition-1-r1',
        sourceNodeId: 'node-local',
        targetNodeId,
        status: 'pending',
        workflowStep: WORKFLOW_STEP.PENDING,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        completedAt: null,
        errorMessage: null,
        stepsHistory: [{step: WORKFLOW_STEP.PENDING, timestamp: Date.now()}],
      };

      await coordinator.updateStep(operation, WORKFLOW_STEP.SENDING);

      t.ok(lastPersistedHistory, 'stepsHistory was persisted');
      const sendingEntry = lastPersistedHistory.find(
        (e) => e.step === WORKFLOW_STEP.SENDING,
      );
      t.ok(sendingEntry, 'SENDING step entry exists');
      t.ok(
        sendingEntry[OPERATION_METADATA_KEY.READINESS_SNAPSHOT],
        'SENDING step has readinessSnapshot',
      );
      t.equal(
        sendingEntry[OPERATION_METADATA_KEY.READINESS_SNAPSHOT][
          READINESS_SNAPSHOT_KEY.NODE_ID
        ],
        targetNodeId,
      );
    } finally {
      await coordinator.shutdown();
    }
  });
