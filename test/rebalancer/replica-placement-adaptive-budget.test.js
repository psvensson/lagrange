import {AdminWebSocketAPI} from '../../src/admin/admin-websocket-api.js';
import {ADMIN_ROUTE} from '../../src/admin/admin-constants.js';
import {createServiceDiagnosticsProvider} from '../../src/entrypoint-runtime-admin-composition.js';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {REPLICA_OPERATIONS_SCHEMA} from '../../src/bootstrap/system-table-schemas-constants.js';
import {generateCreateIndexSQL, generateCreateTableSQL} from '../../src/bootstrap/system-table-schema-sql.js';
import {COLUMN} from '../../src/constants/columns.js';
import {CDC_OPERATION, SERVICE_STATUS, TABLES, WORKFLOW_STEP} from '../../src/constants/index.js';
import {PARTITION_CDC_EVENT_BUILD_STATE} from '../../src/partition/partition-cdc-generator.js';
import {ensureCdcObligationLedger} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {committedStatementEntryKey, createCommittedStatementOutcomeTable} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {openParticipantTransactionStore} from '../../src/partition/partition-participant-transaction-store.js';
import {buildPlacementCommand} from '../../src/partition/partition-placement-admission-command.js';
import {
  PLACEMENT_ADMIT_TYPE,
  PLACEMENT_RELEASE_HOLD_TYPE,
  PLACEMENT_REPAIR_PREPARE_TYPE,
  RETAINED_PLACEMENT_ATTEMPT,
} from '../../src/partition/partition-placement-admission-constants.js';
import {requestPlacementRepairPreparation} from '../../src/partition/partition-placement-repair-preparation.js';
import {LEDGER_PARTITION_ID} from '../../src/partition/partition-placement-admission-decision.js';
import {applyPlacementCommand} from '../../src/partition/partition-placement-admission.js';
import {PARTITION_SERVICE_OPERATION} from '../../src/partition/partition-service-constants.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from '../../src/partition/partition-write-kernel.js';
import {SchemaProvisioningJobOwner} from '../../src/query/schema-provisioning-job-owner.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {
  PLACEMENT_ADAPTIVE_BUDGET_REASON as REASON,
  PLACEMENT_ADAPTIVE_OBSERVATION_STATE as OBS_STATE,
  PLACEMENT_ADAPTIVE_WINDOW_ACTION as ACTION,
  createAdaptivePlacementBudgetController,
  decideAdaptiveResourceWindow,
  normalizeWindowConfig,
} from '../../src/rebalancer/replica-placement-adaptive-budget.js';
import {PLACEMENT_FORMATION_STATE, PLACEMENT_REFUSAL, PLACEMENT_TRIGGER} from
  '../../src/rebalancer/replica-placement-owner-constants.js';
import {createControlPlanePlacementNodeObservationReader, readRemoteHeartbeatObservation} from
  '../../src/rebalancer/replica-placement-owner-capacity.js';
import {NodeLifecyclePublication} from
  '../../src/control-plane/node-lifecycle-publication.js';
import {readLinuxMemAvailableBytes} from
  '../../src/node/node-host-statistics-sampler.js';
import {applyRebalanceCoordinatorOperationCreationSupportMethods} from
  '../../src/rebalancer/rebalance-coordinator-operation-creation-support.js';
import {ResourceDiagnosticsSampler} from '../../src/diagnostics/resource-diagnostics-sampler.js';
import {OperationType} from '../../src/rebalancer/replica-operation-progress.js';
import {createReplicaPlacementOwner} from '../../src/rebalancer/replica-placement-owner.js';
import {leadingLedgerStubFields} from '../test-helpers/controllable-consensus-port.js';

const NOW_MS = 2_000_000;
const LEASE_MS = 60_000;

function nodeRow(nodeId, hostId, {bootIncarnation = 1, leaseExpiresAt = NOW_MS + LEASE_MS} = {}) {
  return {
    [COLUMN.NODE_ID]: nodeId, [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.READY_LEASE_EXPIRES_AT]: leaseExpiresAt,
    [COLUMN.BOOT_INCARNATION]: bootIncarnation, [COLUMN.HOST_ID]: hostId,
  };
}

function healthyObs(sampledAtMs = NOW_MS, overrides = {}) {
  return {
    sampledAtMs, bootIncarnation: 1, eventLoopDelayMs: 4,
    eventLoopUtilizationPercent: 30, mainThreadCpuPercent: 35,
    initQueueDelayMs: 5, writeLatencyMs: 3, transferQueueDelayMs: 5,
    backpressured: false, ...overrides,
  };
}

function observeOperationFromLedgerDb(db, operationId, fallbackCopySourceNodeId) {
  const row = db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?').get(operationId);
  if (!row) return Promise.resolve({operation: null});
  const stepsHistory = JSON.parse(row.steps_history);
  const admission = stepsHistory[0]?.placementAdmission;
  return Promise.resolve({
    operation: {
      operationId: row.operation_id, type: row.type, partitionId: row.partition_id,
      entityType: row.entity_type, entityId: row.entity_id, replicaId: row.replica_id,
      sourceReplicaId: row.source_replica_id, sourceNodeId: row.source_node_id,
      targetNodeId: row.target_node_id, nodeId: row.target_node_id,
      copySourceNodeId: admission?.copySourceNodeId ?? fallbackCopySourceNodeId,
      targetNodeBootIncarnation: admission?.targetNodeBootIncarnation ?? null,
      targetNodeStorageIncarnation: admission?.targetNodeStorageIncarnation ?? null,
      workflowStep: row.workflow_step, status: row.status, stepsHistory,
    },
  });
}

function createSimpleSystemCache(initialPartitions = [], initialServices = [], initialNodes = []) {
  const listeners = new Set();
  const rowsByTable = new Map([
    [TABLES.PARTITIONS, [...initialPartitions]],
    [TABLES.SERVICES, [...initialServices]],
    [TABLES.NODES, [...initialNodes]],
    [TABLES.REPLICA_OPERATIONS, []],
  ]);
  return {
    get(tableName, primaryKey) {
      const list = rowsByTable.get(tableName) || [];
      if (tableName === TABLES.NODES) {
        return list.find((r) => r[COLUMN.NODE_ID] === primaryKey) ?? null;
      }
      if (tableName === TABLES.REPLICA_OPERATIONS) {
        return list.find((r) => r.operation_id === primaryKey) ?? null;
      }
      return null;
    },
    getAll: (tableName) => [...(rowsByTable.get(tableName) || [])],
    onCacheApplyChange: (fn) => listeners.add(fn),
    offCacheApplyChange: (fn) => listeners.delete(fn),
    applySystemTableChange(tableName, operation, row) {
      const list = rowsByTable.get(tableName) || [];
      if (tableName === TABLES.REPLICA_OPERATIONS || tableName === TABLES.NODES) {
        const keyField = tableName === TABLES.NODES ? COLUMN.NODE_ID : 'operation_id';
        const idx = list.findIndex((r) => r[keyField] === row[keyField]);
        if (operation === CDC_OPERATION.DELETE) {
          if (idx >= 0) list.splice(idx, 1);
        } else if (idx >= 0) list[idx] = {...row};
        else list.push({...row});
        rowsByTable.set(tableName, list);
      }
      for (const fn of listeners) fn(tableName, operation, row);
    },
  };
}

function createRealSqlLedgerHarness(cache, nodeId = 'n1', nowFn = () => NOW_MS) {
  const db = new Database(':memory:');
  db.exec(generateCreateTableSQL(REPLICA_OPERATIONS_SCHEMA));
  for (const indexSql of generateCreateIndexSQL(REPLICA_OPERATIONS_SCHEMA)) db.exec(indexSql);
  createCommittedStatementOutcomeTable(db);
  openParticipantTransactionStore(db);
  ensureCdcObligationLedger(db);
  let logIndex = 0;
  const resolvedWrites = new Map();
  const submittedStatements = [];
  const service = Object.assign(new EventEmitter(), {
    ...leadingLedgerStubFields(),
    partitionId: LEDGER_PARTITION_ID, tableName: REPLICA_OPERATIONS_SCHEMA.tableName,
    replicaId: `${LEDGER_PARTITION_ID}-r1`, replicaIds: [`${LEDGER_PARTITION_ID}-r1`],
    nodeId, db, systemTableCache: cache, timeSource: {now: nowFn},
    hlcClock: {now: () => `${nowFn()}:0:${nodeId}`},
    logger: {debug() {}, info() {}, warn() {}, error() {}},
    cdcPipelineMetrics: {increment() {}}, isLeader: true, isShutdown: false,
    hasKnownRemoteLeaderWitness: () => false, trackPendingCDCEvent() {},
    cdcDelivery: {driveCdcObligations: async () => {}},
    getCommittedEntryKey: (command) => committedStatementEntryKey(command),
    syncCDCGeneratorDependencies: () => ({
      buildEvent: ({type, tableName, data, whereClause, entryId, timestamp}) => ({
        state: PARTITION_CDC_EVENT_BUILD_STATE.BUILT,
        cdcEvent: {
          type, tableName,
          operation: type === PARTITION_SERVICE_OPERATION.INSERT ?
            CDC_OPERATION.INSERT : CDC_OPERATION.UPDATE,
          data, whereClause, entryId, timestamp,
        },
      }),
    }),
    resolveCommittedWrite: (entryId, answer) => resolvedWrites.set(entryId, answer),
    rejectCommittedWrite: (_entryId, error) => {
      throw error;
    },
  });
  const executeCommand = (type, {entryId, body}) => {
    submittedStatements.push({type, entryId, body});
    const command = buildPlacementCommand(service, {type, entryId, body});
    logIndex += 1;
    const afterCommit = [];
    const afterRollback = [];
    db.transaction(() => {
      applyPlacementCommand(service, {
        command, index: logIndex, term: 1,
        afterCommit: (fn) => afterCommit.push(fn),
        afterRollback: (fn) => afterRollback.push(fn),
      });
    })();
    for (const fn of afterCommit) fn();
    const answer = resolvedWrites.get(command.entryId);
    resolvedWrites.delete(command.entryId);
    return answer;
  };
  return {
    db, service, submittedStatements,
    admitPlacement: (payload) => executeCommand(PLACEMENT_ADMIT_TYPE, payload),
    releasePlacementHold: (payload) => executeCommand(PLACEMENT_RELEASE_HOLD_TYPE, payload),
  };
}

function seededPartitionRow(partitionId, leaderNodeId = 'n1') {
  return {
    [COLUMN.PARTITION_ID]: partitionId, [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    replica_count: 3, [COLUMN.LEADER_NODE_ID]: leaderNodeId,
  };
}

function seededServiceRows(partitionId, nodeId = 'n1') {
  return [1, 2, 3].map((idx) => ({
    [COLUMN.REPLICA_ID]: `${partitionId}-r${idx}`,
    [COLUMN.PARTITION_ID]: partitionId,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.RAFT_ROLE]: idx === 1 ? RAFT_ROLE.LEADER : RAFT_ROLE.FOLLOWER,
  }));
}

test('Scenario 11 & 3 & 4 & 10: small operating window (2 or 3) grows under constrained demand, holds when idle, reduces on congestion, and deduplicates multiple failures from one congestion episode', () => {
  const config = normalizeWindowConfig({
    initialLimit: 2,
    minLimit: 1,
    maxLimit: 5,
    additiveIncrease: 1,
    multiplicativeDecrease: 0.75,
    minAdjustIntervalMs: 1_000,
    requiredHealthySamplesAfterDecrease: 2,
  });

  // 1. At initial window = 2, healthy and constrained (occupancy=2, waiting=3) -> grows to 3:
  const step1 = decideAdaptiveResourceWindow(
    null,
    healthyObs(1_000),
    {occupancy: 2, waitingDemandCount: 3, nowMs: 1_000},
    config,
  );
  assert.equal(step1.action, ACTION.INCREASE);
  assert.equal(step1.reason, REASON.HEALTHY_BUDGET_CONSTRAINED_DEMAND);
  assert.equal(step1.limit, 3);

  // 2. Scenario 4 (Idle / unconstrained): occupancy=1 < limit=3 or waiting=0 -> holds at 3:
  const stepIdle = decideAdaptiveResourceWindow(
    step1.nextState,
    healthyObs(2_500),
    {occupancy: 1, waitingDemandCount: 0, nowMs: 2_500},
    config,
  );
  assert.equal(stepIdle.action, ACTION.HOLD);
  assert.equal(stepIdle.reason, REASON.WORKLOAD_IDLE_OR_UNCONSTRAINED);
  assert.equal(stepIdle.limit, 3);

  // 3. Scenario 11 (Small window reduction from 3 -> 2): disk write latency congestion at t=3000:
  const stepCongested1 = decideAdaptiveResourceWindow(
    stepIdle.nextState,
    healthyObs(3_000, {writeLatencyMs: 180, congestionEpochId: 'disk-stall-1'}),
    {occupancy: 3, waitingDemandCount: 4, nowMs: 3_000},
    config,
  );
  assert.equal(stepCongested1.action, ACTION.DECREASE);
  assert.equal(stepCongested1.reason, REASON.STORAGE_WRITE_LATENCY_CONGESTION);
  assert.equal(stepCongested1.limit, 2);

  // 4. Scenario 10 (Several failures share one congestion cause 'disk-stall-1'):
  // Repeated observations in the same congestion episode must NOT collapse the window to 1:
  const stepSameEpisode = decideAdaptiveResourceWindow(
    stepCongested1.nextState,
    healthyObs(3_200, {writeLatencyMs: 210, congestionEpochId: 'disk-stall-1'}),
    {occupancy: 2, waitingDemandCount: 4, nowMs: 3_200},
    config,
  );
  assert.equal(stepSameEpisode.action, ACTION.HOLD);
  assert.equal(stepSameEpisode.reason, REASON.CONGESTION_EPISODE_ALREADY_APPLIED);
  assert.equal(stepSameEpisode.limit, 2);

  // 5. A distinct later congestion episode at window=2 reduces from 2 -> 1:
  const stepCongested2 = decideAdaptiveResourceWindow(
    stepSameEpisode.nextState,
    healthyObs(4_500, {eventLoopDelayMs: 120, congestionEpochId: 'el-stall-2'}),
    {occupancy: 2, waitingDemandCount: 4, nowMs: 4_500},
    config,
  );
  assert.equal(stepCongested2.action, ACTION.DECREASE);
  assert.equal(stepCongested2.reason, REASON.EVENT_LOOP_CONGESTION);
  assert.equal(stepCongested2.limit, 1);

  // 6. Hysteresis recovery after decrease: first healthy sample holds (1 < required 2),
  // second healthy sample after cooldown grows 1 -> 2:
  const recoverySample1 = decideAdaptiveResourceWindow(
    stepCongested2.nextState,
    healthyObs(5_600),
    {occupancy: 1, waitingDemandCount: 2, nowMs: 5_600},
    config,
  );
  assert.equal(recoverySample1.action, ACTION.HOLD);
  assert.equal(recoverySample1.reason, REASON.RECOVERY_HYSTERESIS_HOLD);
  assert.equal(recoverySample1.limit, 1);

  const recoverySample2 = decideAdaptiveResourceWindow(
    recoverySample1.nextState,
    healthyObs(6_700),
    {occupancy: 1, waitingDemandCount: 2, nowMs: 6_700},
    config,
  );
  assert.equal(recoverySample2.action, ACTION.INCREASE);
  assert.equal(recoverySample2.reason, REASON.HEALTHY_BUDGET_CONSTRAINED_DEMAND);
  assert.equal(recoverySample2.limit, 2);
});

test('Scenario 5 & 6: size-normalized stage duration does not classify large operations as congestion, and missing/stale/mismatched observations refuse optimistic growth', () => {
  const config = normalizeWindowConfig({
    initialLimit: 3,
    minLimit: 1,
    maxLimit: 6,
  });

  // Scenario 5a: A 20 MiB snapshot taking 4,000 ms (5 MiB/s > 2 MiB/s floor) is healthy and grows:
  const largeHealthy = decideAdaptiveResourceWindow(
    null,
    healthyObs(10_000, {
      stageDurationMs: 4_000,
      operationBytes: 20 * 1024 * 1024,
    }),
    {occupancy: 3, waitingDemandCount: 2, nowMs: 10_000, expectedBootIncarnation: 1},
    config,
  );
  assert.equal(largeHealthy.action, ACTION.INCREASE);
  assert.equal(largeHealthy.limit, 4);

  // Scenario 5b: A tiny 64 KiB snapshot taking 4,000 ms (< 2 MiB/s floor) is classified as stage throughput congestion:
  const smallSlow = decideAdaptiveResourceWindow(
    largeHealthy.nextState,
    healthyObs(12_000, {
      stageDurationMs: 4_000,
      operationBytes: 64 * 1024,
      congestionEpochId: 'slow-stage-1',
    }),
    {occupancy: 4, waitingDemandCount: 2, nowMs: 12_000, expectedBootIncarnation: 1},
    config,
  );
  assert.equal(smallSlow.action, ACTION.DECREASE);
  assert.equal(smallSlow.reason, REASON.STAGE_THROUGHPUT_DEGRADATION_CONGESTION);
  assert.equal(smallSlow.limit, 3);

  // Scenario 6a: Missing observation -> UNAVAILABLE, holds without growing:
  const missingObs = decideAdaptiveResourceWindow(
    largeHealthy.nextState,
    null,
    {occupancy: 4, waitingDemandCount: 5, nowMs: 15_000, expectedBootIncarnation: 1},
    config,
  );
  assert.equal(missingObs.action, ACTION.HOLD);
  assert.equal(missingObs.observationState, OBS_STATE.UNAVAILABLE);
  assert.equal(missingObs.reason, REASON.OBSERVATION_UNAVAILABLE);
  assert.equal(missingObs.limit, 4);

  // Scenario 6b: Stale observation (sampledAtMs older than maxSampleAgeMs) -> STALE, holds:
  const staleObs = decideAdaptiveResourceWindow(
    largeHealthy.nextState,
    healthyObs(10_000),
    {occupancy: 4, waitingDemandCount: 5, nowMs: 40_000, expectedBootIncarnation: 1},
    config,
  );
  assert.equal(staleObs.action, ACTION.HOLD);
  assert.equal(staleObs.observationState, OBS_STATE.STALE);
  assert.equal(staleObs.reason, REASON.OBSERVATION_STALE);
  assert.equal(staleObs.limit, 4);

  // Scenario 6c: Observation from an older boot incarnation -> STALE, holds:
  const wrongBootObs = decideAdaptiveResourceWindow(
    largeHealthy.nextState,
    healthyObs(15_000, {bootIncarnation: 1}),
    {occupancy: 4, waitingDemandCount: 5, nowMs: 15_000, expectedBootIncarnation: 2},
    config,
  );
  assert.equal(wrongBootObs.action, ACTION.RESET);
  assert.equal(wrongBootObs.observationState, OBS_STATE.STALE);
  assert.equal(wrongBootObs.limit, 3);
});

test('Scenario 1, 2, 7 & 9: ReplicaPlacementOwner isolates slow destination from healthy destination, reduces source window on source congestion, retains ownership when window shrinks below occupancy, and wakes on resource recovery without completion', async () => {
  let nowMs = NOW_MS;
  const threeNodes = [nodeRow('n1', 'h1'), nodeRow('n2', 'h2'), nodeRow('n3', 'h3')];
  const nodeAuthority = {
    subscribe: () => () => {},
    scheduleRefresh: () => {},
    answerCommittedNodes: () => ({
      state: 'ready',
      epoch: {publicationEpoch: 4},
      nodeRows: threeNodes,
      formation: {state: PLACEMENT_FORMATION_STATE.FORMED, latchEpoch: 4},
    }),
  };

  // Seed 6 system partitions on n1 so all 6 need HOST_SPREAD copies onto n2 and n3:
  const partitionIds = [
    'services-p1',
    'partitions-p1',
    'tables-p1',
    'config-p1',
    'indices-p1',
    'logs-p1',
  ];
  const partitions = partitionIds.map((id) => seededPartitionRow(id, 'n1'));
  const services = partitionIds.flatMap((id) => seededServiceRows(id, 'n1'));
  const cache = createSimpleSystemCache(partitions, services);
  const ledger = createRealSqlLedgerHarness(cache, 'n1', () => nowMs);

  try {
    const controller = createAdaptivePlacementBudgetController({
      sourceWindow: {initialLimit: 6, minLimit: 1, maxLimit: 8, minAdjustIntervalMs: 500},
      targetWindow: {
        initialLimit: 2,
        minLimit: 1,
        maxLimit: 4,
        minAdjustIntervalMs: 500,
        requiredHealthySamplesAfterDecrease: 1,
      },
    });

    // Scenario 1: Destination n2 develops disk write congestion (writeLatencyMs: 250 -> target budget falls 2 -> 1),
    // while destination n3 is healthy (budget = 2):
    controller.recordObservation('n1', healthyObs(nowMs), {nowMs, notifyOnRecovery: false});
    controller.recordObservation(
      'n2',
      healthyObs(nowMs, {writeLatencyMs: 250, congestionEpochId: 'n2-disk-1'}),
      {nowMs, notifyOnRecovery: false},
    );
    controller.recordObservation('n3', healthyObs(nowMs), {nowMs, notifyOnRecovery: false});

    const owner = createReplicaPlacementOwner({
      nodeId: 'n1',
      ledgerPartitionService: ledger.service,
      nodeAuthority,
      systemTableCache: cache,
      now: () => nowMs,
      logger: ledger.service.logger,
      admitPlacement: ledger.admitPlacement,
      releasePlacementHold: ledger.releasePlacementHold,
      adaptiveBudgetController: controller,
    });

    owner.setLeader(true);
    await owner.awaitCurrentWorkIdle();

    // Pass 1: n2's window fell to 1 while n3's window stayed at 2 (and grew to 2/3):
    // Capacity-aware target selection prefers n3 (higher remaining capacity) and caps n2 at 1 copy!
    let activeRows = ledger.db
      .prepare('SELECT operation_id, partition_id, target_node_id, steps_history FROM replica_operations ORDER BY rowid')
      .all();
    const onN2Pass1 = activeRows.filter((r) => r.target_node_id === 'n2');
    const onN3Pass1 = activeRows.filter((r) => r.target_node_id === 'n3');
    assert.equal(onN2Pass1.length, 1, 'congested destination n2 is capped at its reduced budget of 1');
    assert.equal(onN3Pass1.length, 2, 'healthy destination n3 admits up to its full budget of 2');
    // Verify the recorded statement carried kTgt=1 for n2 and kTgt=2 for n3:
    const n2AdmitBody = ledger.submittedStatements.find(
      (s) => s.body?.moves?.[0]?.targetNodeId === 'n2',
    )?.body;
    const n3AdmitBody = ledger.submittedStatements.find(
      (s) => s.body?.moves?.[0]?.targetNodeId === 'n3',
    )?.body;
    assert.equal(n2AdmitBody.kTgt, 1);
    assert.equal(n3AdmitBody.kTgt, 2);

    // Scenario 9: Resource n2 recovers while NO operation completes!
    // Recording a healthy observation on n2 after minAdjustIntervalMs must wake
    // ReplicaPlacementOwner via TARGET_CAPACITY_CHANGED, grow n2's budget from 1 -> 2,
    // and admit 1 more waiting partition onto n2!
    nowMs += 1_000;
    controller.recordObservation('n2', healthyObs(nowMs), {nowMs});
    await owner.awaitCurrentWorkIdle();

    activeRows = ledger.db
      .prepare('SELECT operation_id, partition_id, target_node_id, workflow_step FROM replica_operations ORDER BY rowid')
      .all();
    assert.equal(
      activeRows.filter((r) => r.target_node_id === 'n2').length,
      2,
      'recovery notification woke ReplicaPlacementOwner and admitted waiting work onto n2 without waiting for a completion',
    );
    assert.equal(activeRows.length, 4, 'total 4 operations now active across n2 (2) and n3 (2)');

    // Scenario 2 & 7: Source n1 now becomes congested (eventLoopDelayMs: 150),
    // shrinking n1's source window from 6 -> 4 -> 3 while 4 operations are already active!
    nowMs += 1_000;
    controller.recordObservation(
      'n1',
      healthyObs(nowMs, {eventLoopDelayMs: 150, congestionEpochId: 'n1-el-1'}),
      {nowMs, notifyOnRecovery: false},
    );
    nowMs += 1_000;
    controller.recordObservation(
      'n1',
      healthyObs(nowMs, {eventLoopDelayMs: 160, congestionEpochId: 'n1-el-2'}),
      {nowMs},
    );
    await owner.awaitCurrentWorkIdle();

    // Even if n3 is healthy and could grow to 3, n1's source window shrunk below current occupancy (4),
    // so NO new operation is admitted AND all 4 existing operations retain their ownership and PENDING step:
    const rowsAfterShrink = ledger.db
      .prepare('SELECT operation_id, workflow_step, completed_at FROM replica_operations ORDER BY rowid')
      .all();
    assert.equal(rowsAfterShrink.length, 4, 'shrinking source window below occupancy blocks new admissions');
    assert.ok(
      rowsAfterShrink.every(
        (r) => r.workflow_step === WORKFLOW_STEP.PENDING && r.completed_at === null,
      ),
      'existing operations retain ownership and are not terminated or released early when window shrinks',
    );

    const diagnostics = createServiceDiagnosticsProvider({
      nodeId: 'n1', rebalanceCoordinator: {replicaPlacementOwner: owner},
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'n1', systemTableCache: cache, serviceDiagnosticsProvider: diagnostics,
    });
    await api.initialize(0, {listen: false});
    try {
      const last = owner.lastPlacementDecision;
      const response = await api.getFastify().inject({
        method: 'GET', url: ADMIN_ROUTE.SERVICE_DIAGNOSTICS,
      });
      assert.equal(response.statusCode, 200);
      const decision = response.json().diagnostics.lastPlacementDecision;
      assert.equal(decision.passSequence, last.passSequence);
      assert.equal(decision.nodes.n1.source.sample.eventLoopDelayMs, 160);
      assert.equal(decision.nodes.n1.source.demand.occupancy, 4);
      assert.equal(decision.nodes.n2.target.sample.writeLatencyMs, 3);
      assert.equal(decision.nodes.n1.source.admissionLimit, controller.getSourceBudget('n1'));
      assert.ok(decision.nodes.n1.source.demand.waitingDemandCount > 0);
      assert.equal(owner.lastPlacementDecision, last);
      owner.shutdown();
      assert.equal(diagnostics().lastPlacementDecision, null);
    } finally {
      await api.shutdown();
    }
  } finally {
    ledger.db.close();
  }
});

test('one placement pass distinguishes admissions sharing a copy source and class', async () => {
  const ids = ['tbl-a-p1', 'tbl-b-p1'];
  const nodeRows = [nodeRow('n1', 'h1'), nodeRow('n2', 'h2'), nodeRow('n3', 'h3')];
  const settled = 'tbl-settled-p1';
  const waiting = 'tbl-no-source-p1';
  const catchingUp = 'tbl-catching-up-p1';
  const spread = seededServiceRows(settled).map((row, i) => ({
    ...row, [COLUMN.NODE_ID]: nodeRows[i][COLUMN.NODE_ID],
  }));
  const learners = seededServiceRows(catchingUp).map((row, i) => ({
    ...row, [COLUMN.NODE_ID]: nodeRows[i][COLUMN.NODE_ID],
    [COLUMN.RAFT_ROLE]: i === 0 ? RAFT_ROLE.LEADER : RAFT_ROLE.LEARNER,
    caught_up: false,
  }));
  const cache = createSimpleSystemCache(
    [...ids, settled, waiting, catchingUp].map((id) => seededPartitionRow(id)),
    [...ids.flatMap((id) => seededServiceRows(id)), ...spread, ...learners]);
  const ledger = createRealSqlLedgerHarness(cache, 'n1', () => NOW_MS);
  const controller = createAdaptivePlacementBudgetController({
    sourceWindow: {initialLimit: 1, minLimit: 1, maxLimit: 1},
  });
  for (const row of nodeRows) {
    controller.recordObservation(row[COLUMN.NODE_ID], healthyObs(NOW_MS),
      {nowMs: NOW_MS, notifyOnRecovery: false});
  }
  const owner = createReplicaPlacementOwner({
    nodeId: 'n1', ledgerPartitionService: ledger.service, systemTableCache: cache,
    nodeAuthority: {
      subscribe: () => () => {}, scheduleRefresh: () => {},
      answerCommittedNodes: () => ({state: 'ready', nodeRows, epoch: {publicationEpoch: 1},
        formation: {state: PLACEMENT_FORMATION_STATE.FORMED, latchEpoch: 1}}),
    },
    now: () => NOW_MS, logger: ledger.service.logger,
    admitPlacement: ledger.admitPlacement, releasePlacementHold: ledger.releasePlacementHold,
    adaptiveBudgetController: controller,
  });
  const calls = [];
  const comparisons = [];
  let rowClassifications = 0;
  const readInputs = owner.readPassPartitionInputs.bind(owner);
  owner.readPassPartitionInputs = (...args) => {
    const inputs = readInputs(...args);
    for (const input of inputs.values()) {
      input.replicaRows = input.replicaRows.map((row) => ({
        ...row, get isLearner() { rowClassifications++; return row.isLearner; },
      }));
    }
    return inputs;
  };
  const evaluate = owner.evaluatePassPartition.bind(owner);
  owner.evaluatePassPartition = (id, ...rest) => {
    calls.push(id);
    return evaluate(id, ...rest);
  };
  const prepare = owner.preparePassOrderedCandidates.bind(owner);
  owner.preparePassOrderedCandidates = (nodes, inputs, saturated, excluded, rank, diagnostics, preliminary) => {
    const start = calls.length;
    const startReads = rowClassifications;
    const actual = prepare(nodes, inputs, saturated, excluded, rank, diagnostics, preliminary);
    const after = calls.length;
    assert.equal(rowClassifications, startReads);
    const reference = prepare(nodes, inputs, saturated, excluded, rank);
    assert.ok(rowClassifications > startReads);
    const referenceEvaluated = calls.slice(after);
    // Compare complete ordered candidates and wait reasons as target policy changes.
    for (const [busy, blocked, ranking] of [
      [new Set(), new Map(), (id) => Number(id === 'n3')],
      [new Set(['n3']), new Map(), (id) => Number(id === 'n3')],
      [new Set(), new Map([['n2', 'storage-pressure'], ['n3', 'storage-pressure']]), rank],
    ]) {
      const fast = prepare(nodes, inputs, busy, blocked, ranking, undefined, preliminary);
      assert.deepEqual(fast, prepare(nodes, inputs, busy, blocked, ranking));
    }
    comparisons.push({actual, reference, evaluated: calls.slice(start, after),
      referenceEvaluated});
    return actual;
  };
  try {
    owner.setLeader(true);
    await owner.awaitCurrentWorkIdle();
    // Two cache notifications during one drain create one additional pass for that trigger.
    const before = owner.lastPlacementDecision;
    owner.notify(PLACEMENT_TRIGGER.RESYNC);
    for (let i = 0; i < 2; i++) {
      cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPDATE, {...spread[0], [COLUMN.SERVICE_ID]: 'service-a'});
    }
    await owner.awaitCurrentWorkIdle();
    const decision = owner.lastPlacementDecision;
    assert.equal(decision.triggerNotifications.SERVICES_CHANGED - before.triggerNotifications.SERVICES_CHANGED, 2);
    assert.equal(decision.passesByTrigger.SERVICES_CHANGED - before.passesByTrigger.SERVICES_CHANGED, 1);
    assert.equal(decision.serviceWakes.adjacentRepeatedUpdates - before.serviceWakes.adjacentRepeatedUpdates, 1);
    assert.equal(decision.serviceWakes.repeatOnlyPasses, before.serviceWakes.repeatOnlyPasses);
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPDATE, {...spread[0], [COLUMN.SERVICE_ID]: 'service-a'});
    await owner.awaitCurrentWorkIdle();
    const observed = owner.lastPlacementDecision.serviceWakes;
    assert.equal(observed.repeatOnlyPasses, decision.serviceWakes.repeatOnlyPasses + 1);
    const repeatedPass = owner.lastPassSnapshot;
    assert.equal(observed.serviceOnlyPasses - decision.serviceWakes.serviceOnlyPasses, 1);
    assert.ok(repeatedPass.evaluated > 0 && repeatedPass.evaluated <= 5);
    assert.equal(observed.repeatOnlyEvaluations - decision.serviceWakes.repeatOnlyEvaluations, repeatedPass.evaluated);
    assert.equal(observed.serviceOnlyEvaluations - decision.serviceWakes.serviceOnlyEvaluations, repeatedPass.evaluated);
    assert.equal(observed.repeatOnlyProposals - decision.serviceWakes.repeatOnlyProposals, repeatedPass.proposals);
    assert.equal(observed.repeatOnlyAdmissions - decision.serviceWakes.repeatOnlyAdmissions, 0);
    owner.notify(PLACEMENT_TRIGGER.RESYNC);
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPDATE, {...spread[0], [COLUMN.SERVICE_ID]: 'service-a'});
    owner.notify(PLACEMENT_TRIGGER.RESYNC);
    await owner.awaitCurrentWorkIdle();
    assert.deepEqual(new Set(owner.lastPassSnapshot.triggers),
      new Set([PLACEMENT_TRIGGER.SERVICES_CHANGED, PLACEMENT_TRIGGER.RESYNC]));
    assert.deepEqual(owner.lastPlacementDecision.serviceWakes, {...observed,
      adjacentRepeatedUpdates: observed.adjacentRepeatedUpdates + 1});
    assert.ok(comparisons.length > 0);
    for (const {actual, reference, evaluated, referenceEvaluated} of comparisons) {
      assert.deepEqual(actual, reference);
      assert.ok(referenceEvaluated.includes(settled));
      assert.ok(referenceEvaluated.includes(catchingUp));
      assert.ok(evaluated.includes(waiting));
      assert.deepEqual(evaluated, referenceEvaluated.filter((id) => id !== settled && id !== catchingUp));
    }
    const rows = ledger.db.prepare('SELECT partition_id FROM replica_operations').all();
    assert.equal(rows.length, 1);
    const [admitted] = rows;
    const blockedId = ids.find((id) => id !== admitted.partition_id);
    const blocked = decision.partitions[blockedId];
    const accepted = decision.partitions[admitted.partition_id];
    assert.equal(decision.evaluatedAtMs, NOW_MS);
    assert.equal(decision.omittedPartitionCount, 0);
    assert.equal(blocked.placementClass, accepted.placementClass);
    assert.equal(blocked.copyCheck.sourceNodeId, 'n1');
    assert.equal(blocked.copyCheck.kSrc, 1);
    assert.equal(blocked.copyCheck.sourceOcc, 1);
    assert.equal(blocked.copyCheck.sourceAllowed, false);
    assert.equal(blocked.disposition, 'capacity_denied');
    assert.ok(accepted.disposition === 'ADMITTED' || accepted.busy);
    assert.equal(accepted.sourceNodeId ?? decision.activeCopies.find(
      (copy) => copy.partitionId === admitted.partition_id)?.sourceNodeId, 'n1');
    // Both target leases expire in the next committed node answer. The full
    // reference above rebuilds classification from this pass's authority.
    for (const row of nodeRows.slice(1)) row[COLUMN.READY_LEASE_EXPIRES_AT] = NOW_MS - 1;
    owner.notify(PLACEMENT_TRIGGER.RESYNC);
    await owner.awaitCurrentWorkIdle();
    assert.equal(ledger.db.prepare('SELECT count(*) AS n FROM replica_operations').get().n, 1);
    assert.equal(owner.lastPlacementDecision.partitions[blockedId].copyCheck, null);

    // Restore one target and raise the budget supplied to this pass. The
    // previously source-denied partition now submits with this turn's K.
    nodeRows[2][COLUMN.READY_LEASE_EXPIRES_AT] = NOW_MS + LEASE_MS;
    const higher = createAdaptivePlacementBudgetController({
      sourceWindow: {initialLimit: 2, minLimit: 2, maxLimit: 2},
    });
    for (const row of nodeRows) higher.recordObservation(row[COLUMN.NODE_ID], healthyObs(),
      {nowMs: NOW_MS, notifyOnRecovery: false});
    owner.adaptiveBudgetController = higher;
    owner.notify(PLACEMENT_TRIGGER.RESYNC);
    await owner.awaitCurrentWorkIdle();
    const next = ledger.submittedStatements.find(({body}) => body.partitionId === blockedId);
    assert.equal(next?.body.kSrc, 2);
    assert.equal(next.body.moves[0].targetNodeId, 'n3');
    // Complete an old-tenure pass after the new tenure has published its own decision.
    const oldCustody = owner.custody;
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    const steps = owner.runPassSteps.bind(owner);
    owner.runPassSteps = async (pass) => {
      await steps(pass);
      if (pass.custody === oldCustody) {
        entered.resolve();
        await release.promise;
      }
    };
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPDATE, {...spread[0], [COLUMN.SERVICE_ID]: 'service-a'});
    await entered.promise;
    const oldRun = oldCustody.running;
    owner.setLeader(false);
    owner.setLeader(true);
    try {
      await owner.custody.running;
    } finally {
      release.resolve();
      await oldRun;
    }
    assert.equal(owner.lastPlacementDecision.serviceWakes.repeatOnlyPasses, 0);
    assert.equal(owner.lastPlacementDecision.serviceWakes.adjacentRepeatedUpdates, 0);
  } finally {
    owner.shutdown();
    ledger.db.close();
  }
});

// Kept identical in the predecessor and candidate CPU seals. All warm and
// measured wakes enter the real owner; exclude harness comparisons from timing.
test('46-partition source-limited owner pass CPU', async (t) => {
  const nodes = ['n1', 'n2', 'n3'].map((id) => nodeRow(id, 'host-' + id));
  const ids = Array.from({length: 46}, (_, i) => 'tbl-cost-' + i + '-p1');
  const services = ids.flatMap((id, i) => seededServiceRows(id).map((row, index) =>
    i < 25 ? row : {...row, [COLUMN.NODE_ID]: nodes[index][COLUMN.NODE_ID]}));
  const cache = createSimpleSystemCache(ids.map((id) => seededPartitionRow(id)), services);
  const ledger = createRealSqlLedgerHarness(cache);
  const controller = createAdaptivePlacementBudgetController({
    sourceWindow: {initialLimit: 1, minLimit: 1, maxLimit: 1},
  });
  for (const row of nodes) controller.recordObservation(row[COLUMN.NODE_ID], healthyObs(),
    {nowMs: NOW_MS, notifyOnRecovery: false});
  const owner = createReplicaPlacementOwner({
    nodeId: 'n1', ledgerPartitionService: ledger.service, systemTableCache: cache,
    nodeAuthority: {subscribe: () => () => {}, scheduleRefresh() {},
      answerCommittedNodes: () => ({state: 'ready', nodeRows: nodes, epoch: {publicationEpoch: 1},
        formation: {state: PLACEMENT_FORMATION_STATE.FORMED, latchEpoch: 1}})},
    now: () => NOW_MS, logger: ledger.service.logger, adaptiveBudgetController: controller,
    admitPlacement: ledger.admitPlacement, releasePlacementHold: ledger.releasePlacementHold,
  });
  try {
    owner.setLeader(true);
    await owner.awaitCurrentWorkIdle();
    const sample = async () => {
      const before = owner.lastPlacementDecision.passSequence;
      const cpu = process.threadCpuUsage();
      for (let i = 0; i < 32; i++) {
        owner.notify(PLACEMENT_TRIGGER.RESYNC);
        await owner.awaitCurrentWorkIdle();
      }
      const {user, system} = process.threadCpuUsage(cpu);
      const decision = owner.lastPlacementDecision;
      assert.equal(decision.passSequence - before, 32);
      const dispositions = Object.values(decision.partitions).map((row) => row.disposition);
      assert.equal(dispositions.filter((d) => d === 'capacity_denied').length, 24);
      assert.equal(dispositions.filter((d) => d === 'partition_busy').length, 1);
      assert.equal(dispositions.filter((d) => d === 'NONE').length, 21);
      return (user + system) / 32;
    };
    await sample();
    const usPerPass = [];
    for (let batch = 0; batch < 7; batch++) usPerPass.push(await sample());
    t.diagnostic(JSON.stringify({usPerPass, passesPerBatch: 32, partitions: ids.length}));
  } finally {
    owner.shutdown();
    ledger.db.close();
  }
});

test('a repeated SERVICES wake admits the same newly feasible copy as a fresh resync', async () => {
  const partitionId = 'tbl-repeat-copy-p1';
  const nodes = ['n1', 'n2', 'n3'].map((id) => nodeRow(id, 'host-' + id));
  async function run(repeat) {
    const services = seededServiceRows(partitionId);
    const update = {...services[0], [COLUMN.SERVICE_ID]: 'repeat-source'};
    const cache = createSimpleSystemCache([seededPartitionRow(partitionId)], services);
    const ledger = createRealSqlLedgerHarness(cache);
    let targetAvailable = false;
    const owner = createReplicaPlacementOwner({
      nodeId: 'n1', ledgerPartitionService: ledger.service, systemTableCache: cache,
      now: () => NOW_MS, logger: ledger.service.logger,
      nodeAuthority: {subscribe: () => () => {}, scheduleRefresh() {},
        answerCommittedNodes: () => ({state: 'ready', nodeRows: nodes, epoch: {publicationEpoch: 1},
          formation: {state: PLACEMENT_FORMATION_STATE.FORMED, latchEpoch: 1}})},
      storageAccountingService: {subscribeCapacitySemanticChanges: () => () => {},
        getCapacitySemanticIdentity: (id) => ({projection: {capacity: {
          budgetBytes: id === 'n1' || (id === 'n3' && targetAvailable) ? 1000000 : null,
        }}})},
      admitPlacement: ledger.admitPlacement, releasePlacementHold: ledger.releasePlacementHold,
    });
    try {
      owner.setLeader(true);
      await owner.awaitCurrentWorkIdle();
      cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPDATE, update);
      await owner.awaitCurrentWorkIdle();
      assert.equal(ledger.submittedStatements.length, 0);
      const before = owner.lastPlacementDecision.serviceWakes;
      targetAvailable = true;
      if (repeat) cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPDATE, {...update});
      else owner.notify(PLACEMENT_TRIGGER.RESYNC);
      await owner.awaitCurrentWorkIdle();
      const admissions = ledger.submittedStatements.filter(({type}) => type === PLACEMENT_ADMIT_TYPE);
      assert.equal(admissions.length, 1);
      assert.equal(admissions[0].body.moves[0].targetNodeId, 'n3');
      assert.equal(owner.lastPlacementDecision.serviceWakes.repeatOnlyAdmissions - before.repeatOnlyAdmissions,
        repeat ? 1 : 0);
      return admissions.map(({body}) => body);
    } finally {
      owner.shutdown();
      ledger.db.close();
    }
  }
  assert.deepEqual(await run(true), await run(false));
});

test('Scenario 8: leadership change with uncertain admission reconstructs occupancy and replays exact retained statement with its original recorded adaptive limits', async () => {
  const nowMs = NOW_MS;
  const threeNodes = [nodeRow('n1', 'h1'), nodeRow('n2', 'h2'), nodeRow('n3', 'h3')];
  const nodeAuthority = {
    subscribe: () => () => {},
    scheduleRefresh: () => {},
    answerCommittedNodes: () => ({
      state: 'ready',
      epoch: {publicationEpoch: 5},
      nodeRows: threeNodes,
      formation: {state: PLACEMENT_FORMATION_STATE.FORMED, latchEpoch: 5},
    }),
  };
  const cache = createSimpleSystemCache(
    [seededPartitionRow('tables-p1')],
    seededServiceRows('tables-p1'),
  );
  const ledger = createRealSqlLedgerHarness(cache, 'n1', () => nowMs);

  try {
    const controller1 = createAdaptivePlacementBudgetController({
      sourceWindow: {initialLimit: 5, minLimit: 1, maxLimit: 8},
      targetWindow: {initialLimit: 4, minLimit: 1, maxLimit: 6},
    });
    let dropFirstReply = true;
    const seenPayloads = [];
    const owner1 = createReplicaPlacementOwner({
      nodeId: 'n1',
      ledgerPartitionService: ledger.service,
      nodeAuthority,
      systemTableCache: cache,
      now: () => nowMs,
      logger: ledger.service.logger,
      adaptiveBudgetController: controller1,
      admitPlacement: async (payload) => {
        seenPayloads.push(payload);
        if (dropFirstReply) {
          dropFirstReply = false;
          return {
            success: false,
            failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN,
          };
        }
        return ledger.admitPlacement(payload);
      },
      releasePlacementHold: ledger.releasePlacementHold,
    });

    owner1.setLeader(true);
    await owner1.awaitCurrentWorkIdle();
    assert.equal(seenPayloads.length, 1);
    const originalAttempt = seenPayloads[0];
    assert.equal(originalAttempt.body.kSrc, 5);
    assert.equal(originalAttempt.body.kTgt, 4);
    owner1.shutdown();

    // New leader (owner2) starts with different initial soft controller estimates (kSrc=3, kTgt=2),
    // but must reconcile and replay the unresolved attempt with its exact original entryId and body (kSrc=5, kTgt=4):
    const controller2 = createAdaptivePlacementBudgetController({
      sourceWindow: {initialLimit: 3, minLimit: 1, maxLimit: 8},
      targetWindow: {initialLimit: 2, minLimit: 1, maxLimit: 6},
    });
    const owner2 = createReplicaPlacementOwner({
      nodeId: 'n1',
      ledgerPartitionService: ledger.service,
      nodeAuthority,
      systemTableCache: cache,
      now: () => nowMs,
      logger: ledger.service.logger,
      adaptiveBudgetController: controller2,
      admitPlacement: async (payload) => {
        seenPayloads.push(payload);
        return ledger.admitPlacement(payload);
      },
      releasePlacementHold: ledger.releasePlacementHold,
    });

    owner2.setLeader(true);
    await owner2.awaitCurrentWorkIdle();
    assert.equal(seenPayloads.length, 2);
    assert.equal(seenPayloads[1].entryId, originalAttempt.entryId);
    assert.deepEqual(seenPayloads[1].body, originalAttempt.body);
    owner2.shutdown();
  } finally {
    ledger.db.close();
  }
});

test('Review P1 (Items 1, 2, 3, 4): incomplete remote observations hold without growing, cached ResourceDiagnosticsSampler sampleId deduplicates multi-pass decrease within 1s window, fresh coordinator requests respect reduced adaptive kTgt, and TABLES.NODES heartbeat recovery wakes ReplicaPlacementOwner', async () => {
  let nowMs = NOW_MS;
  const config = normalizeWindowConfig({
    initialLimit: 6,
    minLimit: 1,
    maxLimit: 8,
    multiplicativeDecrease: 0.75,
    minAdjustIntervalMs: 1_000,
  });

  // 1. Item 2: Missing remote pressure measurements must NOT count as healthy:
  // An observation with only sampledAtMs, bootIncarnation, and availableMemoryBytes is INCOMPLETE and HOLDS:
  const memoryOnlyObs = {
    sampledAtMs: nowMs,
    bootIncarnation: 1,
    availableMemoryBytes: 512 * 1024 * 1024,
  };
  const incompleteDecision = decideAdaptiveResourceWindow(
    null,
    memoryOnlyObs,
    {occupancy: 6, waitingDemandCount: 4, nowMs, expectedBootIncarnation: 1},
    config,
  );
  assert.equal(incompleteDecision.action, ACTION.HOLD);
  assert.equal(incompleteDecision.observationState, OBS_STATE.INCOMPLETE);
  assert.equal(incompleteDecision.reason, REASON.OBSERVATION_INCOMPLETE);
  assert.equal(incompleteDecision.limit, 6);

  // A fresh host-only sample cannot classify main-thread pressure.
  const remoteIncompleteHeartbeat = readRemoteHeartbeatObservation({
    resource_sample_interval_ms: 1000, host_cpu_utilization_percent: 98,
    [COLUMN.NODE_ID]: 'n2',
    [COLUMN.LAST_HEARTBEAT]: nowMs,
    [COLUMN.BOOT_INCARNATION]: 1,
    telemetry_sample_id: nowMs, telemetry_sampled_at: nowMs,
    memory_mb: 1024,
    memory_usage_percent: 25,
  });
  assert.equal(remoteIncompleteHeartbeat.pressureSensorsComplete, false);
  const remoteHoldDecision = decideAdaptiveResourceWindow(
    null,
    remoteIncompleteHeartbeat,
    {occupancy: 6, waitingDemandCount: 4, nowMs, expectedBootIncarnation: 1},
    config,
  );
  assert.equal(remoteHoldDecision.action, ACTION.HOLD);
  assert.equal(remoteHoldDecision.observationState, OBS_STATE.INCOMPLETE);
  assert.equal(remoteHoldDecision.reason, REASON.OBSERVATION_INCOMPLETE);
  assert.equal(remoteHoldDecision.limit, 6);

  const remoteHealthyHeartbeat = readRemoteHeartbeatObservation({
    [COLUMN.NODE_ID]: 'n2',
    [COLUMN.LAST_HEARTBEAT]: nowMs,
    [COLUMN.BOOT_INCARNATION]: 1,
    telemetry_sample_id: nowMs, telemetry_sampled_at: nowMs,
    memory_mb: 1024,
    memory_usage_percent: 25,
    main_thread_cpu_percent: 20, resource_sample_interval_ms: 1000,
    host_cpu_utilization_percent: 98,
  });
  assert.equal(remoteHealthyHeartbeat.pressureSensorsComplete, true);
  assert.equal(remoteHealthyHeartbeat.mainThreadCpuPercent, 20);
  assert.equal(remoteHealthyHeartbeat.sampleId, nowMs);
  assert.equal(remoteHealthyHeartbeat.congestionEpochId, nowMs);

  const remoteHighCpuHeartbeat = readRemoteHeartbeatObservation({
    [COLUMN.NODE_ID]: 'n2',
    [COLUMN.LAST_HEARTBEAT]: nowMs,
    [COLUMN.BOOT_INCARNATION]: 1,
    telemetry_sample_id: nowMs, telemetry_sampled_at: nowMs,
    memory_mb: 1024,
    memory_usage_percent: 25,
    main_thread_cpu_percent: 98, resource_sample_interval_ms: 1000,
    host_cpu_utilization_percent: 20,
  });
  const remoteCpuDecreaseDecision = decideAdaptiveResourceWindow(
    null,
    remoteHighCpuHeartbeat,
    {occupancy: 6, waitingDemandCount: 4, nowMs, expectedBootIncarnation: 1},
    config,
  );
  assert.equal(remoteCpuDecreaseDecision.action, ACTION.DECREASE);
  assert.equal(remoteCpuDecreaseDecision.reason, REASON.SINGLE_THREAD_CPU_QUEUE_CONGESTION);
  assert.equal(remoteCpuDecreaseDecision.limit, 4);

  // 2. Item 3: 4 placement passes at different millisecond timestamps within one 1000ms
  // ResourceDiagnosticsSampler.getSharedReport(1000) interval reduce a congested window ONLY ONCE (6 -> 4):
  const initialNodes = [
    {
      ...nodeRow('n1', 'h1'),
      [COLUMN.LAST_HEARTBEAT]: nowMs,
      memory_mb: 2048,
      memory_usage_percent: 30,
    },
    {
      ...nodeRow('n2', 'h2'),
      [COLUMN.LAST_HEARTBEAT]: nowMs,
      memory_mb: 2048,
      memory_usage_percent: 98, // Hard memory constrained (< 64 MiB free)!
    },
    {
      ...nodeRow('n3', 'h3'),
      [COLUMN.LAST_HEARTBEAT]: nowMs,
      memory_mb: 2048,
      memory_usage_percent: 20,
    },
  ];
  const partitions = [
    seededPartitionRow('services-p1', 'n1'),
    seededPartitionRow('partitions-p1', 'n1'),
    seededPartitionRow('tables-p1', 'n1'),
  ];
  const services = [
    ...seededServiceRows('services-p1', 'n1'),
    ...seededServiceRows('partitions-p1', 'n1'),
    ...seededServiceRows('tables-p1', 'n1'),
  ];
  const cache = createSimpleSystemCache(partitions, services, initialNodes);
  const ledger = createRealSqlLedgerHarness(cache, 'n1', () => nowMs);

  try {
    const sampler = new ResourceDiagnosticsSampler({
      nodeId: 'n1',
      nowFn: () => nowMs,
      cpuUsageFn: () => ({user: 900_000, system: 80_000}),
      cpusFn: () => [{model: 'cpu-0'}],
      eluFn: () => ({utilization: 0.96}),
      eventLoopDelayProvider: () => 140,
    });
    const readNodeObservation = createControlPlanePlacementNodeObservationReader({
      localNodeId: 'n1',
      resourceDiagnosticsSampler: sampler,
      systemTableCache: cache,
    });
    const controller = createAdaptivePlacementBudgetController({
      readNodeObservation,
      sourceWindow: {
        initialLimit: 6,
        minLimit: 1,
        maxLimit: 8,
        multiplicativeDecrease: 0.75,
        minAdjustIntervalMs: 500,
      },
      targetWindow: {
        initialLimit: 2,
        minLimit: 1,
        maxLimit: 4,
        multiplicativeDecrease: 0.75,
        minAdjustIntervalMs: 500,
      },
    });
    const nodeInput = {
      eligibility: {
        eligibleNodeIds: ['n1', 'n2', 'n3'],
        nodeBoots: new Map([['n1', 1], ['n2', 1], ['n3', 1]]),
        declaredHosts: new Map([['n1', 'h1'], ['n2', 'h2'], ['n3', 'h3']]),
      },
    };
    const passLimits = [];
    for (const offsetMs of [100, 300, 600, 850]) {
      nowMs = NOW_MS + offsetMs;
      const snap = controller.evaluatePassBudgets({
        nodeInput,
        occupancy: {bySource: new Map([['n1', 4]]), byTarget: new Map(), unrecordedSourceCopies: 0},
        waitingBySource: new Map([['n1', 3]]),
        waitingByTarget: new Map(),
        nowMs,
      });
      passLimits.push(snap.sourceBudgetOf('n1'));
    }
    assert.deepEqual(
      passLimits,
      [4, 4, 4, 4],
      '4 passes within one 1000ms sampler interval reduce n1 window only once (6 -> 4), never 6 -> 4 -> 3 -> 2 -> 1',
    );

    // 3. Item 1: When the controller reduces target n3's window to 1 and one committed copy already
    // occupies n3, a fresh coordinator request via createPartitionOperationViaPlacementAdmission
    // receives kTgt = 1 from the shared controller and is refused with TARGET_AT_CAPACITY:
    controller.recordObservation(
      'n3',
      healthyObs(nowMs, {writeLatencyMs: 240, congestionEpochId: 'n3-stall-1'}),
      {nowMs, notifyOnRecovery: false},
    );
    const nodeAuthority = {
      subscribe: () => () => {}, scheduleRefresh: () => {},
      answerCommittedNodes: () => ({
        state: 'ready', epoch: {publicationEpoch: 4},
        nodeRows: cache.getAll(TABLES.NODES),
        formation: {state: PLACEMENT_FORMATION_STATE.FORMED, latchEpoch: 4},
      }),
    };
    const owner = createReplicaPlacementOwner({
      nodeId: 'n1', ledgerPartitionService: ledger.service, nodeAuthority,
      systemTableCache: cache, now: () => nowMs, logger: ledger.service.logger,
      admitPlacement: ledger.admitPlacement, releasePlacementHold: ledger.releasePlacementHold,
      adaptiveBudgetController: controller,
    });
    owner.setLeader(true);
    await owner.awaitCurrentWorkIdle();

    let rows = ledger.db
      .prepare('SELECT operation_id, partition_id, target_node_id FROM replica_operations ORDER BY rowid')
      .all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].target_node_id, 'n3');
    assert.equal(controller.getTargetBudget('n3'), 1);

    class TestCoordinator {
      constructor() {
        this.nodeId = 'n1';
        this.timeSource = {now: () => nowMs};
        this.replicaPlacementOwner = owner;
        this.adaptiveBudgetController = controller;
        this.ledgerPartitionServices = new Set([ledger.service]);
        this.controlPlaneReadinessService = {
          answerCommittedNodes: () => nodeAuthority.answerCommittedNodes(),
        };
        this.submitPlacementPayload = (payload) => Promise.resolve(ledger.admitPlacement(payload));
      }
      assertNativePlacementAliasProof() {}
    }
    applyRebalanceCoordinatorOperationCreationSupportMethods(TestCoordinator);
    const coordinator = new TestCoordinator();

    const rejectedMove = {type: OperationType.ADD, nodeId: 'n3', copySourceNodeId: 'n1'};
    await assert.rejects(
      () => coordinator.createPartitionOperationViaPlacementAdmission({
        partitionId: 'tables-p1', entityType: 'partition', entityId: 'tables-p1',
        sourceNodeId: 'n1', normalizedMoveType: OperationType.ADD,
        move: rejectedMove, requestedMove: rejectedMove,
      }),
      (err) => err.code === PLACEMENT_REFUSAL.TARGET_AT_CAPACITY &&
        err.placementResult?.occupancy?.targetLimit === 1 &&
        err.placementResult?.occupancy?.targetOccupancy === 1,
    );

    nowMs += 1_000;
    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPDATE, {
      ...nodeRow('n2', 'h2'), [COLUMN.LAST_HEARTBEAT]: nowMs,
      memory_mb: 2048, memory_usage_percent: 25, host_cpu_utilization_percent: 15,
    });
    await owner.awaitCurrentWorkIdle();

    rows = ledger.db
      .prepare('SELECT operation_id, partition_id, target_node_id FROM replica_operations ORDER BY rowid')
      .all();
    const onN2AfterHeartbeatRecovery = rows.filter((r) => r.target_node_id === 'n2');
    assert.equal(
      onN2AfterHeartbeatRecovery.length,
      2,
      'TABLES.NODES heartbeat recovery woke ReplicaPlacementOwner and admitted waiting partitions onto n2',
    );
    owner.shutdown();
  } finally {
    ledger.db.close();
  }
});

test('Finding 3: Distributed Leader vs Follower Active-Owner Admission + Leadership Transition', async () => {
  const nowMs = NOW_MS;
  const threeNodes = [
    {...nodeRow('n1', 'h1'), [COLUMN.LAST_HEARTBEAT]: nowMs, memory_mb: 8192, memory_usage_percent: 20, host_cpu_utilization_percent: 25},
    {...nodeRow('n2', 'h2'), [COLUMN.LAST_HEARTBEAT]: nowMs, memory_mb: 8192, memory_usage_percent: 20, host_cpu_utilization_percent: 25},
    {...nodeRow('n3', 'h3'), [COLUMN.LAST_HEARTBEAT]: nowMs, memory_mb: 8192, memory_usage_percent: 20, host_cpu_utilization_percent: 25},
  ];
  const partitions = [
    seededPartitionRow(LEDGER_PARTITION_ID, 'n1'),
    seededPartitionRow('services-p1', 'n2'),
    seededPartitionRow('tables-p1', 'n2'),
    seededPartitionRow('config-p1', 'n2'),
  ];
  const services = [
    ...[['r1', 'n1', RAFT_ROLE.LEADER], ['r2', 'n2', RAFT_ROLE.FOLLOWER], ['r3', 'n3', RAFT_ROLE.FOLLOWER]].map(
      ([rSuffix, nId, role]) => ({
        [COLUMN.REPLICA_ID]: `${LEDGER_PARTITION_ID}-${rSuffix}`,
        [COLUMN.SERVICE_ID]: `${LEDGER_PARTITION_ID}-${rSuffix}`,
        [COLUMN.PARTITION_ID]: LEDGER_PARTITION_ID,
        [COLUMN.NODE_ID]: nId,
        service_type: 'partition',
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.RAFT_ROLE]: role,
        address: `${nId}/partition/${LEDGER_PARTITION_ID}-${rSuffix}`,
      }),
    ),
    ...seededServiceRows('services-p1', 'n2'),
    ...seededServiceRows('tables-p1', 'n2'),
    ...seededServiceRows('config-p1', 'n2'),
  ];
  const cache = createSimpleSystemCache(partitions, services, threeNodes);
  cache.get = (tableName, key) => {
    const fieldByTable = {
      [TABLES.PARTITIONS]: COLUMN.PARTITION_ID,
      [TABLES.NODES]: COLUMN.NODE_ID,
      [TABLES.REPLICA_OPERATIONS]: 'operation_id',
    };
    if (tableName === TABLES.SERVICES) {
      return cache.getAll(TABLES.SERVICES).find(
        (r) => r[COLUMN.REPLICA_ID] === key || r[COLUMN.SERVICE_ID] === key,
      ) ?? null;
    }
    const field = fieldByTable[tableName];
    return field ? cache.getAll(tableName).find((r) => r[field] === key) ?? null : null;
  };
  cache.filter = (tableName, pred) => cache.getAll(tableName).filter(pred);

  const ledgerA = createRealSqlLedgerHarness(cache, 'n1', () => nowMs);
  try {
    const nodeAuthority = {
      subscribe: () => () => {},
      scheduleRefresh: () => {},
      answerCommittedNodes: () => ({
        state: 'ready', epoch: {publicationEpoch: 6},
        nodeRows: cache.getAll(TABLES.NODES),
        formation: {state: PLACEMENT_FORMATION_STATE.FORMED, latchEpoch: 6},
      }),
    };

    const controllerA = createAdaptivePlacementBudgetController({
      sourceWindow: {initialLimit: 6, minLimit: 1, maxLimit: 8},
      targetWindow: {initialLimit: 2, minLimit: 1, maxLimit: 4},
    });
    const ownerA = createReplicaPlacementOwner({
      nodeId: 'n1', ledgerPartitionService: ledgerA.service, nodeAuthority,
      systemTableCache: cache, now: () => nowMs, logger: ledgerA.service.logger,
      admitPlacement: ledgerA.admitPlacement, releasePlacementHold: ledgerA.releasePlacementHold,
      adaptiveBudgetController: controllerA,
    });
    ledgerA.service.rebalancerLeadershipSink = ownerA;
    ownerA.setLeader(true);
    controllerA.recordObservation(
      'n1',
      healthyObs(nowMs, {eventLoopDelayMs: 140, congestionEpochId: 'n1-local-congestion'}),
      {nowMs, notifyOnRecovery: false},
    );
    await ownerA.awaitCurrentWorkIdle();

    const rowsAfterLeaderPass = ledgerA.db
      .prepare('SELECT operation_id, partition_id, target_node_id FROM replica_operations WHERE target_node_id = ?')
      .all('n1');
    assert.equal(rowsAfterLeaderPass.length, 1, '1 copy is already in flight to Node A (n1)');
    assert.equal(controllerA.getTargetBudget('n1'), 1);

    const followerLedgerServiceB = {
      partitionId: LEDGER_PARTITION_ID, replicaId: `${LEDGER_PARTITION_ID}-r2`,
      nodeId: 'n2', isLeader: false, isShutdown: false, rebalancerLeadershipSink: null,
    };
    const controllerB = createAdaptivePlacementBudgetController({
      sourceWindow: {initialLimit: 6, minLimit: 1, maxLimit: 8},
      targetWindow: {initialLimit: 2, minLimit: 1, maxLimit: 4},
    });
    assert.equal(controllerB.getTargetBudget('n1'), 2, 'Follower B local controller still has target window 2 for n1');
    const ownerB = {
      nodeId: 'n2', isLeader: false, adaptiveBudgetController: controllerB,
      nodeAuthority, now: () => nowMs,
    };
    followerLedgerServiceB.rebalancerLeadershipSink = ownerB;

    const prepareRequestsSeenOnLeaderA = [];
    const admittedPayloadsSeen = [];
    let failNextAdmitWithUnknown = false;

    const transportB = {
      deliver: async (address, message) => {
        assert.equal(address, `n1/partition/${LEDGER_PARTITION_ID}-r1`);
        if (message.type === PLACEMENT_REPAIR_PREPARE_TYPE) {
          prepareRequestsSeenOnLeaderA.push(message);
          return buildDeliveryEnvelope(
            {acknowledged: true},
            requestPlacementRepairPreparation(ledgerA.service, message),
          );
        }
        if (message.type === PLACEMENT_ADMIT_TYPE) {
          admittedPayloadsSeen.push(message);
          if (failNextAdmitWithUnknown) {
            failNextAdmitWithUnknown = false;
            return buildDeliveryEnvelope({acknowledged: true}, {
              success: false,
              failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN,
            });
          }
          return buildDeliveryEnvelope({acknowledged: true}, ledgerA.admitPlacement(message));
        }
        throw new Error(`Unexpected message type: ${message.type}`);
      },
    };

    class FollowerCoordinator {
      constructor() {
        this.nodeId = 'n2';
        this.timeSource = {now: () => nowMs};
        this.systemTableCache = cache;
        this.messageRouter = transportB;
        this.replicaPlacementOwner = ownerB;
        this.adaptiveBudgetController = controllerB;
        this.ledgerPartitionServices = new Set([followerLedgerServiceB]);
        this.controlPlaneReadinessService = {
          answerCommittedNodes: () => nodeAuthority.answerCommittedNodes(),
        };
      }
      assertNativePlacementAliasProof() {}
      observeExactCreationOperation(operationId) {
        return observeOperationFromLedgerDb(ledgerA.db, operationId, 'n2');
      }
      buildPlacementCreationIntent(operation, admitted) {
        const [firstStep] = operation.stepsHistory || [];
        return {
          entryId: firstStep?.placementAdmission?.entryId ?? admitted?.entryId ?? null,
          operationIntentId: admitted?.operationIntentId ?? null,
          replicaIntentId: admitted?.replicaIntentId ?? null,
        };
      }
      operationMatchesCreationRequest() {
        return true;
      }
    }
    applyRebalanceCoordinatorOperationCreationSupportMethods(FollowerCoordinator);
    const coordinatorB = new FollowerCoordinator();

    assert.equal(
      coordinatorB.resolveActiveReplicaPlacementOwner(),
      null,
      'Follower B never treats its own inactive ReplicaPlacementOwner as the active owner',
    );

    const freshMoveToN1 = {type: OperationType.ADD, nodeId: 'n1', copySourceNodeId: 'n2'};
    await assert.rejects(
      () => coordinatorB.createPartitionOperationViaPlacementAdmission({
        partitionId: 'indices-p1', entityType: 'partition', entityId: 'indices-p1',
        sourceNodeId: 'n2', normalizedMoveType: OperationType.ADD,
        move: freshMoveToN1, requestedMove: freshMoveToN1,
      }),
      (err) => err.code === PLACEMENT_REFUSAL.TARGET_AT_CAPACITY &&
        err.placementResult?.occupancy?.targetLimit === 1 &&
        err.placementResult?.occupancy?.targetOccupancy === 1 &&
        err.admissionResult?.allowed === false,
    );
    assert.equal(prepareRequestsSeenOnLeaderA.length, 1);
    assert.equal(prepareRequestsSeenOnLeaderA[0].move.targetNodeId, 'n1');
    assert.equal(admittedPayloadsSeen.length, 1);
    assert.equal(admittedPayloadsSeen[0].body.kTgt, 1);

    ledgerA.db.prepare('DELETE FROM replica_operations WHERE target_node_id = ?').run('n3');
    failNextAdmitWithUnknown = true;
    const moveToN3 = {
      type: OperationType.ADD, nodeId: 'n3', copySourceNodeId: 'n2',
      operationIntentId: 'intent-add-indices-n3',
    };
    await assert.rejects(
      () => coordinatorB.createPartitionOperationViaPlacementAdmission({
        partitionId: 'indices-p1', entityType: 'partition', entityId: 'indices-p1',
        sourceNodeId: 'n2', normalizedMoveType: OperationType.ADD,
        move: moveToN3, requestedMove: moveToN3,
      }),
      (err) => err.admissionAnswer?.failureCode ===
        PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN &&
        err.admissionAnswer?.[RETAINED_PLACEMENT_ATTEMPT] === true &&
        err.admissionResult === undefined,
    );
    assert.equal(prepareRequestsSeenOnLeaderA.length, 2);
    assert.equal(admittedPayloadsSeen.length, 2);
    const firstUncertainPayload = admittedPayloadsSeen[1];
    assert.equal(firstUncertainPayload.body.kSrc, 6);
    assert.equal(firstUncertainPayload.body.kTgt, 2);

    ownerA.setLeader(false);
    ledgerA.service.isLeader = false;
    followerLedgerServiceB.isLeader = true;
    ownerB.isLeader = true;
    controllerB.recordObservation(
      'n2', healthyObs(nowMs, {eventLoopDelayMs: 140, congestionEpochId: 'n2-cong'}),
      {nowMs, notifyOnRecovery: false},
    );
    controllerB.recordObservation(
      'n3', healthyObs(nowMs, {writeLatencyMs: 220, congestionEpochId: 'n3-cong'}),
      {nowMs, notifyOnRecovery: false},
    );
    coordinatorB.submitPlacementPayload = async (payload) => {
      admittedPayloadsSeen.push({type: PLACEMENT_ADMIT_TYPE, ...payload});
      return ledgerA.admitPlacement(payload);
    };

    const replayedOperation = await coordinatorB.createPartitionOperationViaPlacementAdmission({
      partitionId: 'indices-p1', entityType: 'partition', entityId: 'indices-p1',
      sourceNodeId: 'n2', normalizedMoveType: OperationType.ADD,
      move: moveToN3, requestedMove: moveToN3,
    });
    assert.ok(replayedOperation?.operationId);
    assert.equal(prepareRequestsSeenOnLeaderA.length, 2);
    assert.equal(admittedPayloadsSeen.length, 3);
    assert.equal(admittedPayloadsSeen[2].entryId, firstUncertainPayload.entryId);
    assert.deepEqual(admittedPayloadsSeen[2].body, firstUncertainPayload.body);

    followerLedgerServiceB.isLeader = false;
    ownerB.isLeader = false;
    let routeAvailable = false;
    const isRouteTable = (tName) => tName === TABLES.PARTITIONS || tName === TABLES.SERVICES;
    coordinatorB.systemTableCache = {
      ...cache,
      getAll: (tName) => (!routeAvailable && isRouteTable(tName)) ? [] : cache.getAll(tName),
    };
    const unroutedMove = {
      type: OperationType.ADD, nodeId: 'n3', copySourceNodeId: 'n2',
      operationIntentId: 'intent-unrouted-must-not-retain',
    };
    await assert.rejects(
      () => coordinatorB.createPartitionOperationViaPlacementAdmission({
        partitionId: 'config-p1', entityType: 'partition', entityId: 'config-p1',
        sourceNodeId: 'n2', normalizedMoveType: OperationType.ADD,
        move: unroutedMove, requestedMove: unroutedMove,
      }),
      (err) => err.code === 'PLACEMENT_LEDGER_LEADER_UNAVAILABLE',
    );
    assert.equal(coordinatorB.uncertainPlacementAdmissionAttempts.size, 0);
    routeAvailable = true;
  } finally {
    ledgerA.db.close();
  }
});

test('Finding 4: Partial-Cohort Schema Provisioning Recovery Under Temporary Memory Pressure', async () => {
  let nowMs = NOW_MS;
  const twoNodes = [
    {...nodeRow('n1', 'h1'), [COLUMN.LAST_HEARTBEAT]: nowMs, memory_mb: 8192, memory_usage_percent: 25, host_cpu_utilization_percent: 20},
    {...nodeRow('n2', 'h2'), [COLUMN.LAST_HEARTBEAT]: nowMs, memory_mb: 2048, memory_usage_percent: 99, host_cpu_utilization_percent: 20},
  ];
  const partitionId = 'tbl-partial-recovery-p1';
  const existingServices = [{
    [COLUMN.REPLICA_ID]: `${partitionId}-r1`, [COLUMN.SERVICE_ID]: `${partitionId}-r1`,
    [COLUMN.PARTITION_ID]: partitionId, [COLUMN.NODE_ID]: 'n1',
    service_type: 'partition', [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER, address: `n1/partition/${partitionId}-r1`,
  }];
  const cache = createSimpleSystemCache([], existingServices, twoNodes);
  cache.filter = (tableName, pred) => cache.getAll(tableName).filter(pred);
  const ledger = createRealSqlLedgerHarness(cache, 'n1', () => nowMs);

  try {
    const nodeAuthority = {
      subscribe: () => () => {}, scheduleRefresh: () => {},
      answerCommittedNodes: () => ({
        state: 'ready', epoch: {publicationEpoch: 4},
        nodeRows: cache.getAll(TABLES.NODES),
        formation: {state: PLACEMENT_FORMATION_STATE.FORMED, latchEpoch: 4},
      }),
    };
    const readNodeObservation = createControlPlanePlacementNodeObservationReader({
      localNodeId: 'n1', resourceDiagnosticsSampler: null, systemTableCache: cache,
    });
    const controller = createAdaptivePlacementBudgetController({
      readNodeObservation,
      sourceWindow: {initialLimit: 6, minLimit: 1, maxLimit: 8},
      targetWindow: {initialLimit: 2, minLimit: 1, maxLimit: 4},
    });
    const owner = createReplicaPlacementOwner({
      nodeId: 'n1', ledgerPartitionService: ledger.service, nodeAuthority,
      systemTableCache: cache, now: () => nowMs, logger: ledger.service.logger,
      admitPlacement: ledger.admitPlacement, releasePlacementHold: ledger.releasePlacementHold,
      adaptiveBudgetController: controller,
    });
    ledger.service.rebalancerLeadershipSink = owner;
    owner.setLeader(true);
    await owner.awaitCurrentWorkIdle();

    class ProvisioningCoordinator {
      constructor() {
        this.nodeId = 'n1';
        this.placementAdmissionEnabled = true;
        this.timeSource = {now: () => nowMs};
        this.replicaPlacementOwner = owner;
        this.adaptiveBudgetController = controller;
        this.ledgerPartitionServices = new Set([ledger.service]);
        this.controlPlaneReadinessService = {
          answerCommittedNodes: () => nodeAuthority.answerCommittedNodes(),
        };
        this.submitPlacementPayload = (payload) => Promise.resolve(ledger.admitPlacement(payload));
      }
      assertNativePlacementAliasProof() {}
      async checkProvisioningAdmission() {
        return {
          allowed: true, decisionType: 'admitted',
          admissionResult: {allowed: true, decisionType: 'admitted'},
        };
      }
      async createOperation(move, options = {}) {
        return this.createPartitionOperationViaPlacementAdmission({
          partitionId: move.partitionId, entityType: 'partition', entityId: move.partitionId,
          sourceNodeId: 'n1', normalizedMoveType: OperationType.ADD,
          move, requestedMove: move,
          assertFreshCreationAllowed: options.assertFreshCreationAllowed,
        });
      }
      async executeOperation(operation) {
        existingServices.push({
          [COLUMN.REPLICA_ID]: operation.replicaId, [COLUMN.SERVICE_ID]: operation.replicaId,
          [COLUMN.PARTITION_ID]: operation.partitionId, [COLUMN.NODE_ID]: operation.targetNodeId,
          service_type: 'partition', [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          [COLUMN.RAFT_ROLE]: RAFT_ROLE.FOLLOWER,
          address: `${operation.targetNodeId}/partition/${operation.replicaId}`,
        });
        return {success: true};
      }
      observeExactCreationOperation(operationId) {
        return observeOperationFromLedgerDb(ledger.db, operationId, 'n1');
      }
      buildPlacementCreationIntent(operation, admitted) {
        const [firstStep] = operation.stepsHistory || [];
        return {
          entryId: firstStep?.placementAdmission?.entryId ?? admitted?.entryId ?? null,
          operationIntentId: admitted?.operationIntentId ?? null,
          replicaIntentId: admitted?.replicaIntentId ?? null,
        };
      }
      operationMatchesCreationRequest() {
        return true;
      }
    }
    applyRebalanceCoordinatorOperationCreationSupportMethods(ProvisioningCoordinator);
    const coordinator = new ProvisioningCoordinator();
    coordinator.releaseBootstrapTopologyDispatchHold = async (operationId) => {
      const op = await coordinator.observeExactCreationOperation(operationId);
      return {released: true, operation: op.operation};
    };

    const engine = Object.create(SQLQueryEngine.prototype);
    Object.assign(engine, {
      logger: ledger.service.logger, nowFn: () => nowMs,
      tablePartitionProvisioningTimeoutMs: 5_000,
      tablePartitionTargetNodeConvergenceTimeoutMs: 1_000,
      queryExecutor: {defaultRoutingReadinessDimension: null},
      rebalanceCoordinator: coordinator,
      normalizeTargetNodeIds: (ids) => ids || [],
      resolveMinimumProvisioningReplicaCount: (min, target) => min || target,
      calculateQuorumReplicaCount: (count) => Math.floor(count / 2) + 1,
      createControlPlaneTimeoutBudget: () => ({
        startedAtMs: nowMs, configuredBudgetMs: 5_000, budgetMs: 5_000,
      }),
      getRoutablePartitionServiceNodeIds: () => existingServices.map((s) => s[COLUMN.NODE_ID]),
      getPartitionServiceRows: () => existingServices,
      resolveInitialPartitionBootstrapLeaderNodeId: () => 'n1',
      waitForPartitionServiceMetadata: async () => {},
      waitForMinimumRoutableReplicaMetadata: async () => {},
      waitForRoutablePartitionServiceCount: async () =>
        existingServices.map((s) => s[COLUMN.NODE_ID]),
      waitForPartitionLeaderService: async () => existingServices[0],
    });

    const jobRowsByIdentity = new Map();
    const jobOwner = new SchemaProvisioningJobOwner({
      repository: {
        findByTableIdentity: async (key) => jobRowsByIdentity.get(key) || null,
        insertIntent: async (row) => {
          jobRowsByIdentity.set(row.table_identity_key, {...row});
          return {created: true, row: {...row}};
        },
        listNonterminalRows: async () => [],
        recoverWorkflowRows: () => [],
        persistWorkflowCandidate: async (workflow) => ({workflow}),
      },
      now: () => nowMs,
      retrySetTimeoutFn: () => ({unref() {}}),
      retryClearTimeoutFn: () => {},
    });

    const ddlAst = {
      type: 'CREATE_TABLE', tableName: 'partial_orders',
      columns: [{name: 'id', dataType: 'INTEGER', primaryKey: true}],
    };
    const executeProvisioningAttempt = (context) =>
      engine.provisionInitialTablePartition({
        partitionId, replicaCount: 2, minimumRoutableReplicaCount: 2,
        minimumRoutableReplicaCountWasDefaulted: true, targetNodeIds: ['n1', 'n2'],
        schemaJobId: context.jobId, schemaOwnerFenceToken: context.ownerFenceToken,
        assertProvisioningOwnership: context.assertOwnership,
      });

    const firstOutcome = await jobOwner.execute(ddlAst, {}, executeProvisioningAttempt);
    const workflowAfterPressure = jobOwner.workflowCoordinator.getWorkflowById(firstOutcome.jobId);
    assert.equal(workflowAfterPressure.status, 'PENDING',
      'Schema job stays PENDING under temporary memory pressure instead of transitioning to terminal FAILED');
    assert.equal(firstOutcome.nextAction, 'retry');

    nowMs += 1_500;
    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPDATE, {
      ...nodeRow('n2', 'h2'), [COLUMN.LAST_HEARTBEAT]: nowMs,
      memory_mb: 8192, memory_usage_percent: 25, host_cpu_utilization_percent: 20,
    });

    const secondOutcome = await jobOwner.execute(ddlAst, {}, executeProvisioningAttempt);
    const workflowAfterRecovery = jobOwner.workflowCoordinator.getWorkflowById(firstOutcome.jobId);
    assert.equal(workflowAfterRecovery.status, 'SUCCEEDED');
    assert.equal(secondOutcome.contractState, 'ready');
    assert.equal(secondOutcome.nextAction, 'proceed');
    const admittedOps = ledger.db
      .prepare('SELECT operation_id, partition_id, target_node_id FROM replica_operations WHERE partition_id = ?')
      .all(partitionId);
    assert.equal(admittedOps.length, 1);
    assert.equal(admittedOps[0].target_node_id, 'n2');

    jobOwner.shutdown();
    owner.shutdown();
  } finally {
    ledger.db.close();
  }
});

test('Finding 5: Real Remote Heartbeat Telemetry (TABLES.NODES Producer Shape Only: Pressure -> Decrease -> Recovery -> Increase)', () => {
  let nowMs = NOW_MS;
  const cache = createSimpleSystemCache([], [], []);
  const readNodeObservation = createControlPlanePlacementNodeObservationReader({
    localNodeId: 'n1', resourceDiagnosticsSampler: null, systemTableCache: cache,
  });
  const controller = createAdaptivePlacementBudgetController({
    readNodeObservation,
    targetWindow: {
      initialLimit: 2, minLimit: 1, maxLimit: 4,
      minAdjustIntervalMs: 1_000, requiredHealthySamplesAfterDecrease: 1,
    },
  });
  const nodeInput = {
    eligibility: {
      eligibleNodeIds: ['n2'], nodeBoots: new Map([['n2', 1]]),
      declaredHosts: new Map([['n2', 'h2']]),
    },
  };
  const evalTarget = (occ) => controller.evaluatePassBudgets({
    nodeInput,
    occupancy: {bySource: new Map(), byTarget: new Map([['n2', occ]]), unrecordedSourceCopies: 0},
    waitingBySource: new Map(), waitingByTarget: new Map([['n2', 2]]), nowMs,
  });

  cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, {
    node_id: 'n2', last_heartbeat: nowMs, boot_incarnation: 1,
    telemetry_sampled_at: nowMs, telemetry_sample_id: nowMs,
    memory_mb: 8192, memory_usage_percent: 35,
  });
  let snap = evalTarget(2);
  assert.equal(snap.targetDecisions.get('n2').action, ACTION.HOLD);
  assert.equal(snap.targetDecisions.get('n2').reason, REASON.OBSERVATION_INCOMPLETE);
  assert.equal(snap.targetBudgetOf('n2'), 2);

  nowMs += 100;
  cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPDATE, {
    node_id: 'n2', last_heartbeat: nowMs, boot_incarnation: 1,
    telemetry_sampled_at: nowMs, telemetry_sample_id: nowMs,
    host_cpu_utilization_percent: 25, memory_usage_percent: 35,
  });
  snap = evalTarget(2);
  assert.equal(snap.targetDecisions.get('n2').action, ACTION.HOLD);
  assert.equal(snap.targetDecisions.get('n2').reason, REASON.OBSERVATION_INCOMPLETE);
  assert.equal(snap.targetBudgetOf('n2'), 2);

  const congestedAtMs = nowMs + 100;
  nowMs = congestedAtMs;
  cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPDATE, {
    node_id: 'n2', last_heartbeat: nowMs, boot_incarnation: 1,
    telemetry_sampled_at: nowMs, telemetry_sample_id: nowMs,
    memory_mb: 8192, memory_usage_percent: 35,
    resource_sample_interval_ms: 1000, main_thread_cpu_percent: 95,
  });
  snap = evalTarget(2);
  assert.equal(snap.targetDecisions.get('n2').action, ACTION.DECREASE);
  assert.equal(snap.targetDecisions.get('n2').reason, REASON.SINGLE_THREAD_CPU_QUEUE_CONGESTION);
  assert.equal(snap.targetBudgetOf('n2'), 1);

  nowMs = congestedAtMs + 1_500;
  cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPDATE, {
    node_id: 'n2', last_heartbeat: nowMs, boot_incarnation: 1,
    telemetry_sampled_at: nowMs, telemetry_sample_id: nowMs,
    memory_mb: 8192, memory_usage_percent: 35,
    resource_sample_interval_ms: 1000, main_thread_cpu_percent: 30,
  });
  snap = evalTarget(1);
  assert.equal(snap.targetDecisions.get('n2').action, ACTION.INCREASE);
  assert.equal(snap.targetDecisions.get('n2').reason, REASON.HEALTHY_BUDGET_CONSTRAINED_DEMAND);
  assert.equal(snap.targetBudgetOf('n2'), 2);

  nowMs = congestedAtMs + 3_000;
  cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPDATE, {
    node_id: 'n2', last_heartbeat: nowMs, boot_incarnation: 1,
    telemetry_sampled_at: nowMs, telemetry_sample_id: nowMs,
    memory_mb: 8192, memory_usage_percent: 35,
    resource_sample_interval_ms: 1000, main_thread_cpu_percent: 30,
  });
  snap = evalTarget(2);
  assert.equal(snap.targetDecisions.get('n2').action, ACTION.INCREASE);
  assert.equal(snap.targetDecisions.get('n2').reason, REASON.HEALTHY_BUDGET_CONSTRAINED_DEMAND);
  assert.equal(snap.targetBudgetOf('n2'), 3);

  const multiSampleController = createAdaptivePlacementBudgetController({
    readNodeObservation,
    targetWindow: {
      initialLimit: 3, minLimit: 1, maxLimit: 4,
      minAdjustIntervalMs: 1_000, requiredHealthySamplesAfterDecrease: 2,
    },
  });
  const evalMulti = (occ) => multiSampleController.evaluatePassBudgets({
    nodeInput,
    occupancy: {bySource: new Map(), byTarget: new Map([['n2', occ]]), unrecordedSourceCopies: 0},
    waitingBySource: new Map(), waitingByTarget: new Map([['n2', 2]]), nowMs,
  });
  nowMs += 2_000;
  cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPDATE, {
    node_id: 'n2', last_heartbeat: nowMs, telemetry_sampled_at: nowMs, telemetry_sample_id: 101,
    boot_incarnation: 1, memory_mb: 8192, memory_usage_percent: 35,
    resource_sample_interval_ms: 1000, main_thread_cpu_percent: 96,
  });
  let multiSnap = evalMulti(3);
  assert.equal(multiSnap.targetDecisions.get('n2').action, ACTION.DECREASE);
  assert.equal(multiSnap.targetBudgetOf('n2'), 2);
  const cachedSampleAtMs = nowMs + 5_000;
  for (const hbAtMs of [cachedSampleAtMs, cachedSampleAtMs + 5_000]) {
    nowMs = hbAtMs;
    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPDATE, {
      node_id: 'n2', last_heartbeat: nowMs, telemetry_sampled_at: cachedSampleAtMs, telemetry_sample_id: 102,
      boot_incarnation: 1, memory_mb: 8192, memory_usage_percent: 35,
      resource_sample_interval_ms: 1000, main_thread_cpu_percent: 25,
    });
    multiSnap = evalMulti(2);
    assert.equal(multiSnap.targetDecisions.get('n2').action, ACTION.HOLD);
    assert.equal(multiSnap.targetDecisions.get('n2').reason, REASON.RECOVERY_HYSTERESIS_HOLD);
  }
  nowMs = cachedSampleAtMs + 7_000;
  cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPDATE, {
    node_id: 'n2', last_heartbeat: nowMs, telemetry_sampled_at: nowMs, telemetry_sample_id: 103,
    boot_incarnation: 1, memory_mb: 8192, memory_usage_percent: 35,
    resource_sample_interval_ms: 1000, main_thread_cpu_percent: 24,
  });
  multiSnap = evalMulti(2);
  assert.equal(multiSnap.targetDecisions.get('n2').action, ACTION.INCREASE);
  assert.equal(multiSnap.targetBudgetOf('n2'), 3);
});
test('A10-1, A9-2, A9-3: multicore low normalized CPU never vetoes measured event-loop congestion', () => {
  const config = normalizeWindowConfig({
    initialLimit: 6, minLimit: 1, maxLimit: 8,
    minAdjustIntervalMs: 1_000, requiredHealthySamplesAfterDecrease: 2,
  });
  const baseObs = {
    sampledAtMs: NOW_MS, sampleId: 501, congestionEpochId: 501, bootIncarnation: 1,
    processCpuCores: 1.08, mainThreadCpuPercent: 25, eventLoopDelayMs: 120,
    eventLoopUtilizationPercent: 45, availableMemoryBytes: 4096 * 1024 * 1024,
  };
  const ctx = {occupancy: 6, waitingDemandCount: 3, nowMs: NOW_MS, expectedBootIncarnation: 1};
  const severeDecision = decideAdaptiveResourceWindow(null, baseObs, ctx, config);
  assert.equal(severeDecision.action, ACTION.DECREASE);
  assert.equal(severeDecision.reason, REASON.EVENT_LOOP_CONGESTION);
  assert.equal(severeDecision.limit, 4);
  const moderateDelay = decideAdaptiveResourceWindow(
    null, {...baseObs, eventLoopDelayMs: 30}, ctx, config,
  );
  assert.equal(moderateDelay.action, ACTION.HOLD);
  assert.equal(moderateDelay.reason, REASON.HYSTERESIS_BAND_HOLD);
  const highEluDecision = decideAdaptiveResourceWindow(
    null, {...baseObs, sampleId: 502, congestionEpochId: 502, eventLoopUtilizationPercent: 95, eventLoopDelayMs: 30}, ctx, config,
  );
  assert.equal(highEluDecision.action, ACTION.DECREASE);
  assert.equal(highEluDecision.reason, REASON.EVENT_LOOP_CONGESTION);
  assert.equal(highEluDecision.limit, 4);
  const healthyMulticoreDecision = decideAdaptiveResourceWindow(
    null,
    {
      ...baseObs, sampleId: 503, congestionEpochId: 503,
      mainThreadCpuPercent: 54, eventLoopDelayMs: 10, eventLoopUtilizationPercent: 30,
    },
    ctx,
    config,
  );
  assert.equal(healthyMulticoreDecision.action, ACTION.INCREASE);
  assert.equal(healthyMulticoreDecision.reason, REASON.HEALTHY_BUDGET_CONSTRAINED_DEMAND);
  assert.equal(healthyMulticoreDecision.limit, 7);
  const backgroundWorkerCpuDecision = decideAdaptiveResourceWindow(
    null,
    {
      ...baseObs, sampleId: 504, congestionEpochId: 504,
      processCpuCores: 1.5, mainThreadCpuPercent: 25,
      eventLoopDelayMs: 10, eventLoopUtilizationPercent: 45,
    },
    ctx,
    config,
  );
  assert.equal(backgroundWorkerCpuDecision.action, ACTION.INCREASE);
  assert.equal(backgroundWorkerCpuDecision.reason, REASON.HEALTHY_BUDGET_CONSTRAINED_DEMAND);
  assert.equal(backgroundWorkerCpuDecision.limit, 7);

  const existingRow = {
    [COLUMN.NODE_ID]: 'n2', [COLUMN.NODE_ADDRESS]: '127.0.0.1:9102', [COLUMN.HOST_ID]: 'h2',
    [COLUMN.CPU_CORES]: 6, [COLUMN.MEMORY_MB]: 8192, [COLUMN.DISK_GB]: 100,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE, [COLUMN.CONNECTION_STATE]: 'ready',
    [COLUMN.LAST_HEARTBEAT]: NOW_MS - 5_000, [COLUMN.BOOT_INCARNATION]: 1,
    [COLUMN.READY_LEASE_EXPIRES_AT]: NOW_MS + LEASE_MS, [COLUMN.CREATED_AT]: NOW_MS - 60_000,
  };
  const publication = new NodeLifecyclePublication({
    gateway: {},
    leaseAuthority: {
      readyLeaseMs: LEASE_MS, renewalIntervalMs: 5_000,
      holdsLiveLease: () => true, grant: (atMs) => atMs + LEASE_MS,
    },
    now: () => NOW_MS,
  });
  const plan = publication.planPublication(
    {
      nodeId: 'n2', nodeAddress: '127.0.0.1:9102', state: 'ready', heartbeatAt: NOW_MS,
      telemetry: {
        host_cpu_utilization_percent: 22, memory_usage_percent: 40, disk_usage_percent: 15,
        telemetry_sampled_at: NOW_MS - 500, telemetry_sample_id: 77,
      },
    },
    existingRow,
    1,
  );
  assert.equal(plan.update.telemetry_sampled_at, NOW_MS - 500);
  assert.equal(plan.update.telemetry_sample_id, 77);
  assert.equal(plan.expectedRow.telemetry_sampled_at, NOW_MS - 500);
  assert.equal(plan.expectedRow.telemetry_sample_id, 77);

  const totalBytes = 8 * 1024 * 1024 * 1024;
  const highOsFreeBytes = 512 * 1024 * 1024;
  assert.equal(readLinuxMemAvailableBytes(totalBytes, highOsFreeBytes, 'MemTotal: 8388608 kB\nMemAvailable: 16384 kB\n'), 16384 * 1024);
  assert.equal(readLinuxMemAvailableBytes(totalBytes, highOsFreeBytes, 'MemTotal: 8388608 kB\nMemAvailable: 0 kB\n'), 0);
});
