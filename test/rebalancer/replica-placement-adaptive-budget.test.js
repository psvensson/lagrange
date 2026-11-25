import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {
  REPLICA_OPERATIONS_SCHEMA,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  generateCreateIndexSQL,
  generateCreateTableSQL,
} from '../../src/bootstrap/system-table-schema-sql.js';
import {COLUMN} from '../../src/constants/columns.js';
import {
  CDC_OPERATION,
  SERVICE_STATUS,
  TABLES,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {
  PARTITION_CDC_EVENT_BUILD_STATE,
} from '../../src/partition/partition-cdc-generator.js';
import {
  ensureCdcObligationLedger,
} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {
  committedStatementEntryKey,
  createCommittedStatementOutcomeTable,
} from '../../src/partition/partition-committed-statement-outcome.js';
import {
  openParticipantTransactionStore,
} from '../../src/partition/partition-participant-transaction-store.js';
import {
  buildPlacementCommand,
} from '../../src/partition/partition-placement-admission-command.js';
import {
  PLACEMENT_ADMIT_TYPE,
  PLACEMENT_RELEASE_HOLD_TYPE,
} from '../../src/partition/partition-placement-admission-constants.js';
import {
  LEDGER_PARTITION_ID,
} from '../../src/partition/partition-placement-admission-decision.js';
import {
  applyPlacementCommand,
} from '../../src/partition/partition-placement-admission.js';
import {
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import {
  PARTITION_WRITE_LEADERSHIP_REFUSAL,
} from '../../src/partition/partition-write-kernel.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  PLACEMENT_ADAPTIVE_BUDGET_REASON as REASON,
  PLACEMENT_ADAPTIVE_OBSERVATION_STATE as OBS_STATE,
  PLACEMENT_ADAPTIVE_WINDOW_ACTION as ACTION,
  createAdaptivePlacementBudgetController,
  decideAdaptiveResourceWindow,
  normalizeWindowConfig,
} from '../../src/rebalancer/replica-placement-adaptive-budget.js';
import {
  PLACEMENT_FORMATION_STATE,
} from '../../src/rebalancer/replica-placement-owner-constants.js';
import {
  createReplicaPlacementOwner,
} from '../../src/rebalancer/replica-placement-owner.js';
import {leadingLedgerStubFields} from '../test-helpers/controllable-consensus-port.js';

const NOW_MS = 2_000_000;
const LEASE_MS = 60_000;

function nodeRow(nodeId, hostId, {bootIncarnation = 1, leaseExpiresAt = NOW_MS + LEASE_MS} = {}) {
  return {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.READY_LEASE_EXPIRES_AT]: leaseExpiresAt,
    [COLUMN.BOOT_INCARNATION]: bootIncarnation,
    [COLUMN.HOST_ID]: hostId,
  };
}

function healthyObs(sampledAtMs = NOW_MS, overrides = {}) {
  return {
    sampledAtMs,
    bootIncarnation: 1,
    eventLoopDelayMs: 4,
    eventLoopUtilizationPercent: 30,
    singleCoreCpuPercent: 35,
    initQueueDelayMs: 5,
    writeLatencyMs: 3,
    transferQueueDelayMs: 5,
    backpressured: false,
    ...overrides,
  };
}

function createSimpleSystemCache(initialPartitions = [], initialServices = []) {
  const listeners = new Set();
  const rowsByTable = new Map([
    [TABLES.PARTITIONS, [...initialPartitions]],
    [TABLES.SERVICES, [...initialServices]],
    [TABLES.REPLICA_OPERATIONS, []],
  ]);
  return {
    getAll(tableName) {
      return [...(rowsByTable.get(tableName) || [])];
    },
    onCacheApplyChange(fn) {
      listeners.add(fn);
    },
    offCacheApplyChange(fn) {
      listeners.delete(fn);
    },
    applySystemTableChange(tableName, operation, row) {
      const list = rowsByTable.get(tableName) || [];
      if (tableName === TABLES.REPLICA_OPERATIONS) {
        const idx = list.findIndex((r) => r.operation_id === row.operation_id);
        if (operation === CDC_OPERATION.DELETE) {
          if (idx >= 0) list.splice(idx, 1);
        } else if (idx >= 0) {
          list[idx] = {...row};
        } else {
          list.push({...row});
        }
        rowsByTable.set(tableName, list);
      }
      for (const fn of listeners) fn(tableName, operation, row);
    },
  };
}

function createRealSqlLedgerHarness(cache, nodeId = 'n1', nowFn = () => NOW_MS) {
  const db = new Database(':memory:');
  db.exec(generateCreateTableSQL(REPLICA_OPERATIONS_SCHEMA));
  for (const indexSql of generateCreateIndexSQL(REPLICA_OPERATIONS_SCHEMA)) {
    db.exec(indexSql);
  }
  createCommittedStatementOutcomeTable(db);
  openParticipantTransactionStore(db);
  ensureCdcObligationLedger(db);
  let logIndex = 0;
  const resolvedWrites = new Map();
  const submittedStatements = [];
  const emitter = new EventEmitter();
  const service = Object.assign(emitter, {
    ...leadingLedgerStubFields(),
    partitionId: LEDGER_PARTITION_ID,
    tableName: REPLICA_OPERATIONS_SCHEMA.tableName,
    replicaId: `${LEDGER_PARTITION_ID}-r1`,
    nodeId,
    db,
    systemTableCache: cache,
    timeSource: {now: nowFn},
    hlcClock: {now: () => `${nowFn()}:0:${nodeId}`},
    logger: {debug() {}, info() {}, warn() {}, error() {}},
    cdcPipelineMetrics: {increment() {}},
    isLeader: true,
    isShutdown: false,
    trackPendingCDCEvent() {},
    cdcDelivery: {driveCdcObligations: async () => {}},
    getCommittedEntryKey: (command) => committedStatementEntryKey(command),
    syncCDCGeneratorDependencies: () => ({
      buildEvent: ({type, tableName, data, whereClause, entryId, timestamp}) => ({
        state: PARTITION_CDC_EVENT_BUILD_STATE.BUILT,
        cdcEvent: {
          type,
          tableName,
          operation:
            type === PARTITION_SERVICE_OPERATION.INSERT ?
              CDC_OPERATION.INSERT :
              CDC_OPERATION.UPDATE,
          data,
          whereClause,
          entryId,
          timestamp,
        },
      }),
    }),
    resolveCommittedWrite: (entryId, answer) => {
      resolvedWrites.set(entryId, answer);
    },
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
        command,
        index: logIndex,
        term: 1,
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
    db,
    service,
    submittedStatements,
    admitPlacement: (payload) => executeCommand(PLACEMENT_ADMIT_TYPE, payload),
    releasePlacementHold: (payload) => executeCommand(PLACEMENT_RELEASE_HOLD_TYPE, payload),
  };
}

function seededPartitionRow(partitionId, leaderNodeId = 'n1') {
  return {
    [COLUMN.PARTITION_ID]: partitionId,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    replica_count: 3,
    [COLUMN.LEADER_NODE_ID]: leaderNodeId,
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

    owner.shutdown();
  } finally {
    ledger.db.close();
  }
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
