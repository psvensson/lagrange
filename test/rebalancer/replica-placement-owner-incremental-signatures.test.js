// Incremental operation-signature maintenance in ReplicaPlacementOwner (Finding 6D):
// recordTouchedOperationSignature uses indexed lookups (getShared/get or primary-key
// SQL) without scanning replica_operations via getAll; submitPlacementAttempt records
// touched operationIds incrementally; readPassCensus does not rescan replica_operations.
//
// REAL: ReplicaPlacementOwner, real SQLite replica_operations and outcome tables,
// and applyPlacementCommand.
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
import {
  CDC_OPERATION,
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
  PLACEMENT_RESULT_FIELD,
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
  OperationType,
} from '../../src/rebalancer/replica-operation-progress.js';
import {
  PLACEMENT_OUTCOME,
  PLACEMENT_TRIGGER,
} from '../../src/rebalancer/replica-placement-owner-constants.js';
import {
  createReplicaPlacementOwner,
} from '../../src/rebalancer/replica-placement-owner.js';
import {leadingLedgerStubFields} from '../test-helpers/controllable-consensus-port.js';

const NOW_MS = 1_000_000;

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

function createRealSqlLedgerHarness(cache, nodeId = 'n1') {
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
  const entryIdsSeen = [];
  const emitter = new EventEmitter();
  const service = Object.assign(emitter, {
    ...leadingLedgerStubFields(),
    partitionId: LEDGER_PARTITION_ID,
    tableName: REPLICA_OPERATIONS_SCHEMA.tableName,
    replicaId: `${LEDGER_PARTITION_ID}-r1`,
    nodeId,
    db,
    systemTableCache: cache,
    timeSource: {now: () => NOW_MS},
    hlcClock: {now: () => `${NOW_MS}:0:${nodeId}`},
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
    entryIdsSeen.push(entryId);
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
    entryIdsSeen,
    admitPlacement: (payload) => executeCommand(PLACEMENT_ADMIT_TYPE, payload),
    releasePlacementHold: (payload) => executeCommand(PLACEMENT_RELEASE_HOLD_TYPE, payload),
  };
}

test('Finding 6D: recordTouchedOperationSignature uses indexed lookup (getShared/get or primary-key SQL) and never scans replica_operations via getAll', () => {
  const baseCache = createSimpleSystemCache();
  const ledger = createRealSqlLedgerHarness(baseCache, 'n1');
  try {
    const getAllCalls = [];
    const sharedRows = new Map([[
      'op-shared',
      {
        operation_id: 'op-shared',
        workflow_step: WORKFLOW_STEP.PENDING,
        status: 'pending',
        steps_history: '[{"step":"PENDING"}]',
      },
    ]]);
    const cacheWithShared = {
      ...baseCache,
      getAll(tableName) {
        getAllCalls.push(tableName);
        return baseCache.getAll(tableName);
      },
      getShared(tableName, id) {
        return tableName === TABLES.REPLICA_OPERATIONS ? sharedRows.get(id) : undefined;
      },
      get() {
        throw new Error('get() should not be called when getShared() is available');
      },
    };
    const nodeAuthority = {
      answerCommittedNodes: () => ({state: 'unavailable', reason: 'init', nodeRows: []}),
      scheduleRefresh: () => {},
      subscribe: () => () => {},
    };
    const ownerShared = createReplicaPlacementOwner({
      nodeId: 'n1',
      ledgerPartitionService: ledger.service,
      nodeAuthority,
      systemTableCache: cacheWithShared,
      now: () => NOW_MS,
      logger: ledger.service.logger,
    });
    ownerShared.recordTouchedOperationSignature('op-shared');
    assert.equal(
      ownerShared.seenRowSignatures.get('op-shared'),
      `${WORKFLOW_STEP.PENDING}:pending:[{"step":"PENDING"}]`,
    );
    assert.deepEqual(getAllCalls, []);

    const getRows = new Map([[
      'op-get',
      {
        operation_id: 'op-get',
        workflow_step: WORKFLOW_STEP.ACTIVE,
        status: 'active',
        steps_history: '[{"step":"ACTIVE"}]',
      },
    ]]);
    const cacheWithGet = {
      ...baseCache,
      getAll(tableName) {
        getAllCalls.push(tableName);
        return baseCache.getAll(tableName);
      },
      get(tableName, id) {
        return tableName === TABLES.REPLICA_OPERATIONS ? getRows.get(id) : undefined;
      },
    };
    const ownerGet = createReplicaPlacementOwner({
      nodeId: 'n1',
      ledgerPartitionService: ledger.service,
      nodeAuthority,
      systemTableCache: cacheWithGet,
      now: () => NOW_MS,
      logger: ledger.service.logger,
    });
    ownerGet.recordTouchedOperationSignature('op-get');
    assert.equal(
      ownerGet.seenRowSignatures.get('op-get'),
      `${WORKFLOW_STEP.ACTIVE}:active:[{"step":"ACTIVE"}]`,
    );
    assert.deepEqual(getAllCalls, []);

    // Cache miss falls back to primary-key SQL WHERE operation_id = ? without calling getAll():
    ledger.db.prepare(
      `INSERT INTO replica_operations (
        operation_id, type, partition_id, replica_id, source_node_id, target_node_id,
        status, workflow_step, created_at, updated_at, completed_at, steps_history,
        entity_type, entity_id
      ) VALUES (?, 'ADD', 'tables-p1', 'tables-p1-r9', 'n1', 'n2', 'pending', ?, 1, 1, NULL, ?, 'partition', 'tables-p1')`,
    ).run('op-sql', WORKFLOW_STEP.SYNCING, '[{"step":"SYNCING"}]');
    ownerShared.recordTouchedOperationSignature('op-sql');
    assert.equal(
      ownerShared.seenRowSignatures.get('op-sql'),
      `${WORKFLOW_STEP.SYNCING}:pending:[{"step":"SYNCING"}]`,
    );
    assert.deepEqual(getAllCalls, []);
  } finally {
    ledger.db.close();
  }
});

test('Finding 6D: submitPlacementAttempt records signatures for every operationId in placementResult.operationIds without full-table scan or recordSeenOperationSignatures', async () => {
  const baseCache = createSimpleSystemCache();
  const ledger = createRealSqlLedgerHarness(baseCache, 'n1');
  try {
    let replicaOpsGetAllCount = 0;
    const cache = {
      ...baseCache,
      getAll(tableName) {
        if (tableName === TABLES.REPLICA_OPERATIONS) replicaOpsGetAllCount += 1;
        return baseCache.getAll(tableName);
      },
      getShared: () => undefined,
    };
    const owner = createReplicaPlacementOwner({
      nodeId: 'n1',
      ledgerPartitionService: ledger.service,
      nodeAuthority: {
        answerCommittedNodes: () => ({state: 'unavailable', reason: 'init', nodeRows: []}),
        scheduleRefresh: () => {},
        subscribe: () => () => {},
      },
      systemTableCache: cache,
      now: () => NOW_MS,
      logger: ledger.service.logger,
    });
    owner.setLeader(true);
    await owner.awaitCurrentWorkIdle();

    replicaOpsGetAllCount = 0;
    let recordSeenCount = 0;
    owner.recordSeenOperationSignatures = () => {
      recordSeenCount += 1;
    };
    const touchedIds = [];
    const origRecordTouched = owner.recordTouchedOperationSignature.bind(owner);
    owner.recordTouchedOperationSignature = (operationId) => {
      touchedIds.push(operationId);
      return origRecordTouched(operationId);
    };

    const insertOp = ledger.db.prepare(
      `INSERT INTO replica_operations (
        operation_id, type, partition_id, replica_id, source_node_id, target_node_id,
        status, workflow_step, created_at, updated_at, completed_at, steps_history,
        entity_type, entity_id
      ) VALUES (?, 'ADD', 'tbl-batch-p1', ?, 'n1', ?, 'pending', ?, 1, 1, NULL, ?, 'partition', 'tbl-batch-p1')`,
    );
    const attempt = {
      attemptKey: 'admit:tbl-batch-p1',
      intentKey: 'tbl-batch-p1:ADD:n2',
      entryId: 'placement-owner:n1:admit:tbl-batch-p1:1',
      body: {
        partitionId: 'tbl-batch-p1',
        moves: [
          {type: OperationType.ADD, targetNodeId: 'n2', copySourceNodeId: 'n1'},
          {type: OperationType.ADD, targetNodeId: 'n3', copySourceNodeId: 'n1'},
        ],
      },
    };
    const pass = {custody: owner.custody, operationIds: [], refused: {}, failedCandidates: {},
      localFailures: {}, uncertainCandidates: {}, observation: owner.observation};
    const progress = {handedOver: false, answered: false, answer: null};

    const answer = await owner.submitPlacementAttempt(
      attempt,
      async () => {
        insertOp.run('op-batch-1', 'tbl-batch-p1-r1', 'n2', WORKFLOW_STEP.PENDING, '[{"step":"PENDING","idx":1}]');
        insertOp.run('op-batch-2', 'tbl-batch-p1-r2', 'n3', WORKFLOW_STEP.PENDING, '[{"step":"PENDING","idx":2}]');
        return {
          success: true,
          committed: true,
          [PLACEMENT_RESULT_FIELD]: {
            outcome: PLACEMENT_OUTCOME.ADMITTED,
            operationIds: ['op-batch-1', 'op-batch-2'],
          },
        };
      },
      pass,
      progress,
    );

    assert.equal(answer.committed, true);
    assert.deepEqual(touchedIds, ['op-batch-1', 'op-batch-2']);
    assert.equal(recordSeenCount, 0);
    assert.equal(replicaOpsGetAllCount, 0);
    assert.equal(
      owner.seenRowSignatures.get('op-batch-1'),
      `${WORKFLOW_STEP.PENDING}:pending:[{"step":"PENDING","idx":1}]`,
    );
    assert.equal(
      owner.seenRowSignatures.get('op-batch-2'),
      `${WORKFLOW_STEP.PENDING}:pending:[{"step":"PENDING","idx":2}]`,
    );
    owner.shutdown();
  } finally {
    ledger.db.close();
  }
});

test('Finding 6D: readPassCensus does not call recordSeenOperationSignatures or systemTableCache.getAll(replica_operations)', async () => {
  const baseCache = createSimpleSystemCache();
  const ledger = createRealSqlLedgerHarness(baseCache, 'n1');
  try {
    let replicaOpsGetAllCount = 0;
    const cache = {
      ...baseCache,
      getAll(tableName) {
        if (tableName === TABLES.REPLICA_OPERATIONS) replicaOpsGetAllCount += 1;
        return baseCache.getAll(tableName);
      },
    };
    const owner = createReplicaPlacementOwner({
      nodeId: 'n1',
      ledgerPartitionService: ledger.service,
      nodeAuthority: {
        answerCommittedNodes: () => ({state: 'unavailable', reason: 'init', nodeRows: []}),
        scheduleRefresh: () => {},
        subscribe: () => () => {},
      },
      systemTableCache: cache,
      now: () => NOW_MS,
      logger: ledger.service.logger,
    });

    // Leadership start seeds signatures once during reconcileUnresolvedAttemptsOnLeadershipStart:
    owner.setLeader(true);
    await owner.awaitCurrentWorkIdle();
    assert.equal(replicaOpsGetAllCount, 1);
    assert.equal(owner.custody.reconciled, true);

    replicaOpsGetAllCount = 0;
    let recordSeenCount = 0;
    owner.recordSeenOperationSignatures = () => {
      recordSeenCount += 1;
    };

    const census = await owner.readPassCensus({custody: owner.custody});
    assert.ok(Array.isArray(census));
    assert.equal(recordSeenCount, 0);
    assert.equal(replicaOpsGetAllCount, 0);

    // Subsequent passes also skip recordSeenOperationSignatures and getAll('replica_operations'):
    owner.notify(PLACEMENT_TRIGGER.RESYNC);
    await owner.awaitCurrentWorkIdle();
    assert.equal(recordSeenCount, 0);
    assert.equal(replicaOpsGetAllCount, 0);
    owner.shutdown();
  } finally {
    ledger.db.close();
  }
});
