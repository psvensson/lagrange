/**
 * Regression tests for admission-real-size-estimates (verified-audit
 * findings 2+16).
 *
 * Every storage-admission sizing call site must feed estimateReplicaBytes
 * the partition's REAL size_bytes instead of the `sizeBytes: 0`
 * placeholder, and operation creation must thread ONE resolved estimate
 * into both admission evaluation and reservation creation so
 * storage_reservations.estimated_bytes is a single durable admission
 * witness.
 *
 * Red-on-revert: each test fails when any call site is reverted to
 * `sizeBytes: 0` while the rest of the change remains.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {NUM} from '../../src/constants/index.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  REBALANCER_ENTITY_TYPE,
} from '../../src/rebalancer/rebalancer-constants.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {
  ProvisioningAdmissionPolicy,
} from '../../src/rebalancer/provisioning-admission-policy.js';
import {
  StorageCapacityAccountingService,
} from '../../src/rebalancer/storage-capacity-accounting-service.js';
import {RebalanceCoordinator} from
  '../../src/rebalancer/rebalance-coordinator.js';
import {
  createMockCache,
  createMockCdcService,
  createMockControlPlaneReadinessService,
  createMockMessageRouter,
  createMockPolicyService,
  createMockTransactionCoordinator,
} from './test-helpers.js';

const TEST_PARTITION_ID = 'p-real-size';
const TEST_TARGET_NODE_ID = 'node-target';
const TEST_LOCAL_NODE_ID = 'node-local';
// Chosen far above minimumReplicaBytes + overhead so a real-size
// estimate is strictly larger than any floor-only (sizeBytes: 0)
// estimate: the assertions below are impossible to satisfy by accident.
const TEST_PARTITION_SIZE_BYTES = NUM.BYTES_PER_MIB * 100;
const ADMITTED_RESULT = Object.freeze({
  allowed: true,
  decisionType: 'admitted',
  blockingReasons: Object.freeze([]),
  eligibleNodeIds: Object.freeze([]),
  ineligibleNodes: Object.freeze([]),
});

function initializeConfig() {
  ConfigurationManager.resetInstance();
  ConfigurationManager.getInstance().initialize({
    rebalancer: {
      minimumReplicaBytes: NUM.TEN,
      partitionReplicaOverheadBytes: NUM.FIVE,
      messageGroupReplicaOverheadBytes: 2,
      serviceReplicaOverheadBytes: 1,
    },
  });
}

function createPartitionCache() {
  return createMockCache({
    partitions: [
      {
        partition_id: TEST_PARTITION_ID,
        size_bytes: TEST_PARTITION_SIZE_BYTES,
      },
    ],
  });
}

function createRecordingAccountingService() {
  const estimateCalls = [];
  const accounting = new StorageCapacityAccountingService({
    systemTableCache: createMockCache(),
  });
  accounting.initialize({systemTableCache: createMockCache()});
  const baseEstimate =
    accounting.estimateReplicaBytes.bind(accounting);
  accounting.estimateReplicaBytes = (options = {}) => {
    estimateCalls.push(options);
    return baseEstimate(options);
  };
  return {accounting, estimateCalls};
}

function findEstimateCallForPartition(estimateCalls) {
  return estimateCalls.find(
    (call) => call.entityType === SERVICE_TYPE.PARTITION,
  );
}

function createTrackingSqlEngine() {
  const operations = new Map();
  const reservations = new Map();
  return {
    operations,
    reservations,
    executeQuery: async (sql, params) => {
      if (sql.includes('INSERT INTO replica_operations')) {
        const [
          opId, type, partId, repId, targetClaimKey, srcNode, tgtNode,
          status, step, created, updated, completed, err, history,
          entityType, entityId,
        ] = params;
        operations.set(opId, {
          operation_id: opId, type, partition_id: partId,
          replica_id: repId, target_claim_key: targetClaimKey,
          source_node_id: srcNode, target_node_id: tgtNode,
          status, workflow_step: step, created_at: created,
          updated_at: updated, completed_at: completed,
          error_message: err, steps_history: history,
          entity_type: entityType, entity_id: entityId,
        });
        return {success: true, changes: 1};
      }
      if (sql.includes('INSERT INTO storage_reservations')) {
        const [resId, opId, eType, eId, partId, tgtNode,
          estBytes, ampFactor, status, reason,
          created, updated, expires] = params;
        reservations.set(resId, {
          reservation_id: resId, operation_id: opId,
          entity_type: eType, entity_id: eId,
          partition_id: partId, target_node_id: tgtNode,
          estimated_bytes: estBytes,
          amplification_factor: ampFactor,
          status, reason_code: reason,
          created_at: created, updated_at: updated,
          expires_at: expires, released_at: null,
        });
        return {success: true, changes: 1};
      }
      if (sql.includes('SELECT * FROM storage_reservations')) {
        return {success: true, rows: []};
      }
      if (sql.includes('replica_operations')) {
        return {success: true, rows: []};
      }
      return {success: true, rows: []};
    },
  };
}

function createRecordingAdmissionService() {
  const checkAddCalls = [];
  const checkReplaceCalls = [];
  return {
    checkAddCalls,
    checkReplaceCalls,
    async checkAdd(context) {
      checkAddCalls.push(context);
      return ADMITTED_RESULT;
    },
    async checkReplace(context) {
      checkReplaceCalls.push(context);
      return ADMITTED_RESULT;
    },
  };
}

function createCoordinatorWithRealSize(options = {}) {
  const systemTableCache = options.systemTableCache ||
    createPartitionCache();
  const {accounting, estimateCalls} = createRecordingAccountingService();
  const sqlEngine = createTrackingSqlEngine();
  const admissionService = options.storageAdmissionService ||
    createRecordingAdmissionService();

  const coordinator = new RebalanceCoordinator({
    nodeId: TEST_LOCAL_NODE_ID,
    systemTableCache,
    cdcIntegrationService: createMockCdcService(),
    controlPlaneSystemTableGateway: {
      readAuthoritativeRows: async (_table, sql, params = []) =>
        sqlEngine.executeQuery(sql, params),
      readRows: async (_table, sql, params = []) =>
        sqlEngine.executeQuery(sql, params),
      executeQuery: async (sql, params = []) =>
        sqlEngine.executeQuery(sql, params),
    },
    tablePolicyService: createMockPolicyService(),
    messageRouter: createMockMessageRouter(),
    sqlQueryEngine: sqlEngine,
    transactionCoordinator: createMockTransactionCoordinator(),
    controlPlaneReadinessService: createMockControlPlaneReadinessService({
      systemTableCache,
    }),
    enableTimeouts: false,
    storageAccountingService: accounting,
    storageAdmissionService: admissionService,
  });
  coordinator.initialize();
  return {coordinator, sqlEngine, estimateCalls, admissionService};
}

function createSizedAddOperation(coordinator) {
  return coordinator.createOperation({
    type: OperationType.ADD,
    partitionId: TEST_PARTITION_ID,
    nodeId: TEST_TARGET_NODE_ID,
    entityType: SERVICE_TYPE.PARTITION,
    entityId: TEST_PARTITION_ID,
    emitOperationCreated: false,
  });
}

// --- Site A: MovePlanner capacity filtering ---

function createCapacityPlanner(accounting, plannerOptions = {}) {
  return new MovePlanner({
    entityId: TEST_PARTITION_ID,
    entityType: REBALANCER_ENTITY_TYPE.PARTITION,
    moveStateProvider: {
      getAvailableNodes: () => [],
      systemTableCache: null,
    },
    accountingService: accounting,
    ...plannerOptions,
  });
}

test('MovePlanner estimates with the real partition size_bytes',
  async (t) => {
    initializeConfig();
    const {accounting, estimateCalls} = createRecordingAccountingService();

    const planner = createCapacityPlanner(accounting, {
      sizeBytesResolver: ({entityType, entityId}) => {
        t.equal(entityType, REBALANCER_ENTITY_TYPE.PARTITION);
        t.equal(entityId, TEST_PARTITION_ID);
        return TEST_PARTITION_SIZE_BYTES;
      },
    });

    const estimatedBytes = planner.getEstimatedBytesForEntity();

    const partitionCall = findEstimateCallForPartition(estimateCalls);
    t.ok(partitionCall, 'estimateReplicaBytes called for the partition');
    t.equal(
      partitionCall.sizeBytes,
      TEST_PARTITION_SIZE_BYTES,
      'MovePlanner must pass the real size_bytes, not the zero placeholder',
    );
    t.ok(
      estimatedBytes > TEST_PARTITION_SIZE_BYTES,
      'estimate grows with the real payload size',
    );
    t.end();
  });

test('MovePlanner keeps the zero floor when no size resolver is wired',
  async (t) => {
    initializeConfig();
    const {accounting, estimateCalls} = createRecordingAccountingService();

    const planner = createCapacityPlanner(accounting);

    planner.getEstimatedBytesForEntity();

    const partitionCall = findEstimateCallForPartition(estimateCalls);
    t.equal(partitionCall.sizeBytes, 0,
      'unwired resolver keeps the pre-change floor behavior');
    t.end();
  });

// --- Site B: admission evaluation (ProvisioningAdmissionPolicy) ---

test('admission evaluation sizes on the resolved real size_bytes',
  async (t) => {
    initializeConfig();
    const {accounting, estimateCalls} = createRecordingAccountingService();
    const admissionService = createRecordingAdmissionService();
    const policy = new ProvisioningAdmissionPolicy({
      nodeId: TEST_LOCAL_NODE_ID,
      delegates: {
        getStorageAdmissionService: () => admissionService,
        getStorageAccountingService: () => accounting,
        classifySystemPartition: () => ({systemTable: false}),
        normalizeMoveType: (moveType) => moveType,
      },
    });

    await policy.ensureProvisioningAdmissionAllowed({
      move: {type: OperationType.ADD, nodeId: TEST_TARGET_NODE_ID},
      entityType: SERVICE_TYPE.PARTITION,
      entityId: TEST_PARTITION_ID,
      partitionId: TEST_PARTITION_ID,
      sourceNodeId: TEST_LOCAL_NODE_ID,
      resolvedEntitySizeBytes: TEST_PARTITION_SIZE_BYTES,
    });

    const partitionCall = findEstimateCallForPartition(estimateCalls);
    t.ok(partitionCall, 'estimateReplicaBytes called during admission');
    t.equal(
      partitionCall.sizeBytes,
      TEST_PARTITION_SIZE_BYTES,
      'admission must pass the resolved real size_bytes',
    );
    t.equal(admissionService.checkAddCalls.length, 1);
    t.ok(
      admissionService.checkAddCalls[0].estimatedBytes >
        TEST_PARTITION_SIZE_BYTES,
      'admission check receives the real-size estimate',
    );
    t.end();
  });

// --- Site C: reservation creation via operation creation ---

test('operation creation persists the real-size reservation witness',
  async (t) => {
    initializeConfig();
    const {coordinator, sqlEngine, estimateCalls} =
      createCoordinatorWithRealSize();

    await createSizedAddOperation(coordinator);

    t.equal(sqlEngine.reservations.size, 1, 'one reservation persisted');
    const reservation = Array.from(sqlEngine.reservations.values())[0];
    const expectedEstimate = Math.ceil(
      Math.max(TEST_PARTITION_SIZE_BYTES, NUM.TEN) + NUM.FIVE,
    );
    t.equal(
      reservation.estimated_bytes,
      expectedEstimate,
      'reservation witness carries the real-size estimate, not the floor',
    );

    const partitionCalls = estimateCalls.filter(
      (call) =>
        call.entityType === SERVICE_TYPE.PARTITION &&
        call.sizeBytes === TEST_PARTITION_SIZE_BYTES,
    );
    t.ok(
      partitionCalls.length > 0,
      'the real size_bytes reached estimateReplicaBytes during creation',
    );
    t.end();
  });

test('admission and reservation share ONE resolved estimate',
  async (t) => {
    initializeConfig();
    const admissionService = createRecordingAdmissionService();
    const {coordinator, sqlEngine} = createCoordinatorWithRealSize({
      storageAdmissionService: admissionService,
    });

    await createSizedAddOperation(coordinator);

    t.equal(admissionService.checkAddCalls.length, 1,
      'admission evaluated once at creation');
    const admissionEstimate =
      admissionService.checkAddCalls[0].estimatedBytes;
    const reservation = Array.from(sqlEngine.reservations.values())[0];
    t.equal(
      reservation.estimated_bytes,
      admissionEstimate,
      'storage_reservations.estimated_bytes equals the admission-time ' +
        'value exactly (single durable admission witness)',
    );
    t.end();
  });

test('checkProvisioningAdmission probe sizes on the real size_bytes',
  async (t) => {
    initializeConfig();
    const {coordinator, estimateCalls} = createCoordinatorWithRealSize();

    const probe = await coordinator.checkProvisioningAdmission({
      type: OperationType.ADD,
      partitionId: TEST_PARTITION_ID,
      nodeId: TEST_TARGET_NODE_ID,
    });

    t.equal(probe.allowed, true, 'probe admits with capacity available');
    const partitionCall = findEstimateCallForPartition(estimateCalls);
    t.ok(partitionCall, 'estimateReplicaBytes called during the probe');
    t.equal(
      partitionCall.sizeBytes,
      TEST_PARTITION_SIZE_BYTES,
      'probe admission must pass the real size_bytes',
    );
    t.end();
  });

test('operation creation falls back to the floor without a partitions row',
  async (t) => {
    initializeConfig();
    const {coordinator, sqlEngine, estimateCalls} =
      createCoordinatorWithRealSize({
        systemTableCache: createMockCache(),
      });

    await createSizedAddOperation(coordinator);

    const reservation = Array.from(sqlEngine.reservations.values())[0];
    const floorEstimate = Math.ceil(NUM.TEN + NUM.FIVE);
    t.equal(
      reservation.estimated_bytes,
      floorEstimate,
      'missing partitions row keeps the minimum-replica floor estimate',
    );
    const partitionCall = findEstimateCallForPartition(estimateCalls);
    t.equal(partitionCall.sizeBytes, 0,
      'no row means the normalized zero size, not a fabricated one');
    t.end();
  });
