/**
 * Durable foundation for the fresh message-group membership owner.
 *
 * The production replica_operations schema must carry the exact monotonic
 * membership state and a nullable unique lane key. Later cells in this file
 * exercise two real repository/coordinator instances against one SQLite file;
 * this first red fixes the canonical schema boundary before either owner can
 * claim or recover the lane.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import Database from 'better-sqlite3';

import {REPLICA_OPERATIONS_SCHEMA} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {
  generateCreateIndexSQL,
  generateCreateTableSQL,
} from '../../src/bootstrap/system-table-schema-sql.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {
  ReplicaOperationRepository,
} from '../../src/rebalancer/replica-operation-repository.js';
import {
  REPLICA_OPERATION_INSERT_DISPOSITION,
} from '../../src/rebalancer/replica-operation-insert-disposition.js';
import {
  REPLICA_OPERATION_UPDATE_DISPOSITION,
} from '../../src/rebalancer/replica-operation-update-disposition.js';
import {OperationType, ReplicaStatus} from
  '../../src/rebalancer/replica-status.js';
import {RebalanceCoordinator} from
  '../../src/rebalancer/rebalance-coordinator.js';
import {repairOperationRowForGateRepairedReservation} from
  '../../src/rebalancer/operation-workflow-gate-operation-row-repair.js';
import {
  createMockControlPlaneReadinessService,
  createMockTransactionCoordinator,
} from './test-helpers.js';

const MEMBERSHIP_COLUMNS = Object.freeze([
  'source_replica_id',
  'message_group_membership_lane_key',
  'message_group_membership_phase',
  'message_group_membership_obligation_state',
  'message_group_membership_identity',
  'message_group_learner_stamp',
  'message_group_voter_stamp',
  'message_group_removal_stamp',
  'message_group_source_lifecycle_claim',
]);
const MEMBERSHIP_LANE_INDEX =
  'idx_replica_ops_message_group_membership_lane';
const GROUP_ID = 'mg-foundation';
const MEMBERSHIP_LANE_KEY = `message-group:${GROUP_ID}`;

function executeSql(database, sql, params = []) {
  try {
    const statement = database.prepare(sql);
    if (statement.reader) {
      const rows = statement.all(...params);
      return {success: true, rows, affectedRows: rows.length};
    }
    const result = statement.run(...params);
    return {
      success: true,
      affectedRows: result.changes,
      changes: result.changes,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      errorCode: error.code || null,
    };
  }
}

function createSqlGateway(database, options = {}) {
  let loseNextInsertAnswer = options.loseNextInsertAnswer === true;
  let failNextInsertResult = options.failNextInsertResult || null;
  const execute = async (sql, params = []) => {
    if (
      failNextInsertResult !== null &&
      sql.includes('INSERT INTO replica_operations')
    ) {
      const result = failNextInsertResult;
      failNextInsertResult = null;
      return result;
    }
    const result = executeSql(database, sql, params);
    if (
      loseNextInsertAnswer &&
      result.success === true &&
      sql.includes('INSERT INTO replica_operations')
    ) {
      loseNextInsertAnswer = false;
      return {
        success: false,
        deferRetry: true,
        error: 'injected replica-operation INSERT answer loss',
      };
    }
    return result;
  };
  return {
    executeQuery: execute,
    readAuthoritativeRows: async (_table, sql, params = []) =>
      executeSql(database, sql, params),
    readRows: async (_table, sql, params = []) =>
      executeSql(database, sql, params),
  };
}

function createRepository(database, options = {}) {
  return new ReplicaOperationRepository({
    nodeId: options.nodeId || 'foundation-owner',
    systemTableCache: {
      get: () => null,
      getAll: () => [],
      filter: () => [],
    },
    cdcIntegrationService: {waitForCacheUpdate: async () => {}},
    controlPlaneSystemTableGateway: createSqlGateway(database, options),
    authoritativeVisibilityTimeoutMs: 25,
    authoritativeVisibilityRetryDelayMs: 1,
    logger: {debug() {}, error() {}, info() {}, warn() {}},
  });
}

function createCoordinator(database, nodeId) {
  const gateway = createSqlGateway(database);
  const coordinator = new RebalanceCoordinator({
    nodeId,
    systemTableCache: {
      get: () => null,
      getAll: () => [],
      filter: () => [],
    },
    cdcIntegrationService: {waitForCacheUpdate: async () => {}},
    controlPlaneSystemTableGateway: gateway,
    sqlQueryEngine: gateway,
    messageRouter: {deliver: async () => ({acknowledged: true})},
    tablePolicyService: {
      getPolicyForPartition: async () => ({minReplicaCount: 1}),
    },
    controlPlaneReadinessService: createMockControlPlaneReadinessService(),
    transactionCoordinator: createMockTransactionCoordinator(),
    enableTimeouts: false,
  });
  coordinator.initialize();
  return coordinator;
}

function allowOrdinaryReplaceCreation(coordinator, targetReplicaId) {
  coordinator.assertLocalControlPlaneMutationReady = () => {};
  coordinator.runOperationLedgerInterlockAccountedCreate =
    async (_move, create) => create();
  coordinator.getRetiredReplaceSourceMoveSafetyError = async () => null;
  coordinator.ensureOperationLedgerSelfMoveSerialized = async () => {};
  coordinator.ensureNoConflictingInFlightReplaceForRemove = async () => {};
  coordinator.ensurePriorityControlPlaneRemoveLaneAvailable = async () => {};
  coordinator.ensurePrioritySurplusRemovePlacementFenceAllowed =
    async () => {};
  coordinator.ensureEntityAddLikeCreateLaneAvailable = async () => {};
  coordinator.ensureCriticalPartitionCreateLaneAvailable = async () => {};
  coordinator.ensureCreateTopologyGuardAllowed = async () => {};
  coordinator.ensureProvisioningAdmissionAllowed = async () => {};
  coordinator.allocateCanonicalReplicaId = async () => targetReplicaId;
  coordinator.createReservationForOperation = async () => ({
    outcome: 'not_required',
  });
}

function createMembershipOperation(operationId, targetReplicaId, overrides = {}) {
  return {
    operationId,
    type: OperationType.REPLACE,
    partitionId: GROUP_ID,
    entityType: SERVICE_TYPE.MESSAGE_GROUP,
    entityId: GROUP_ID,
    membershipPublicationEpoch: 17,
    sourceReplicaId: 'mg-foundation-r1',
    replicaId: targetReplicaId,
    targetClaimKey: null,
    sourceNodeId: 'seed-node',
    targetNodeId: `${targetReplicaId}-node`,
    status: ReplicaStatus.PENDING,
    workflowStep: WORKFLOW_STEP.PENDING,
    createdAt: 10,
    updatedAt: 10,
    completedAt: null,
    errorMessage: null,
    stepsHistory: [],
    messageGroupMembershipLaneKey: MEMBERSHIP_LANE_KEY,
    messageGroupMembershipPhase: 'learner_requested',
    messageGroupMembershipObligationState: 'intent_recorded',
    messageGroupMembershipIdentity: JSON.stringify({
      groupId: GROUP_ID,
      targetReplicaId,
      targetPeerId: targetReplicaId === 'mg-foundation-r4' ? 44 : 55,
    }),
    messageGroupLearnerStamp: null,
    messageGroupVoterStamp: null,
    messageGroupRemovalStamp: null,
    messageGroupSourceLifecycleClaim: JSON.stringify({
      replicaId: 'mg-foundation-r1',
      createdAt: 3,
      stateEnteredAt: 4,
      createAttemptToken: 'attempt-source-1',
    }),
    ...overrides,
  };
}

function createCanonicalDatabase(dbPath) {
  const database = new Database(dbPath);
  database.exec(generateCreateTableSQL(REPLICA_OPERATIONS_SCHEMA));
  for (const sql of generateCreateIndexSQL(REPLICA_OPERATIONS_SCHEMA)) {
    database.exec(sql);
  }
  return database;
}

test('canonical replica_operations schema owns the durable message-group ' +
  'phase and one nullable unique membership lane', () => {
  const database = new Database(':memory:');
  try {
    database.exec(generateCreateTableSQL(REPLICA_OPERATIONS_SCHEMA));
    for (const sql of generateCreateIndexSQL(REPLICA_OPERATIONS_SCHEMA)) {
      database.exec(sql);
    }

    const columnNames = new Set(database
      .prepare('PRAGMA table_info(replica_operations)')
      .all()
      .map((column) => column.name));
    assert.deepEqual(
      MEMBERSHIP_COLUMNS.filter((column) => !columnNames.has(column)),
      [],
      'fresh and reopened databases expose every owner field canonically',
    );

    const laneIndex = database
      .prepare('PRAGMA index_list(replica_operations)')
      .all()
      .find((index) => index.name === MEMBERSHIP_LANE_INDEX);
    assert.ok(laneIndex, 'the canonical schema creates the group lane index');
    assert.equal(laneIndex.unique, 1,
      'the authoritative SQL boundary, not a planner precheck, owns exclusion');
  } finally {
    database.close();
  }
});

test('two repository owners converge on one durable message-group lane and ' +
  'retain it across terminal settlement and reopen', async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'message-group-membership-lane-'),
  );
  const dbPath = path.join(directory, 'replica-operations.sqlite');
  let database = createCanonicalDatabase(dbPath);
  try {
    const firstRepository = createRepository(database, {nodeId: 'owner-a'});
    const secondRepository = createRepository(database, {nodeId: 'owner-b'});
    const firstOperation = createMembershipOperation(
      'membership-operation-r1-r4',
      'mg-foundation-r4',
    );
    const secondOperation = createMembershipOperation(
      'membership-operation-r2-r5',
      'mg-foundation-r5',
    );

    const results = await Promise.all([
      firstRepository.persistNewOperation(firstOperation, {
        returnDisposition: true,
      }),
      secondRepository.persistNewOperation(secondOperation, {
        returnDisposition: true,
      }),
    ]);
    const inserted = results.find((result) => result.disposition ===
      REPLICA_OPERATION_INSERT_DISPOSITION.INSERTED);
    const conflict = results.find((result) => result.disposition ===
      REPLICA_OPERATION_INSERT_DISPOSITION.MEMBERSHIP_LANE_CONFLICT);
    assert.ok(inserted, 'one repository owns the authoritative lane insert');
    assert.ok(conflict, 'the concurrent loser receives a typed lane conflict');
    assert.equal(
      conflict.operation.operationId,
      inserted.operation.operationId,
      'the loser adopts the exact durable lane owner',
    );
    assert.equal(
      database.prepare(
        'SELECT COUNT(*) FROM replica_operations ' +
        'WHERE message_group_membership_lane_key = ?',
      ).pluck().get(MEMBERSHIP_LANE_KEY),
      1,
      'the SQL unique index admits exactly one group obligation',
    );

    const owner = inserted.operation;
    owner.status = ReplicaStatus.FAILED;
    owner.workflowStep = WORKFLOW_STEP.FAILED;
    owner.updatedAt = 20;
    owner.completedAt = 20;
    owner.errorMessage = 'target failed after membership intent';
    await firstRepository.persistOperationUpdate(owner, {
      terminalTransition: true,
    });
    const terminalRow = database.prepare(
      'SELECT * FROM replica_operations WHERE operation_id = ?',
    ).get(owner.operationId);
    assert.equal(terminalRow.completed_at, 20,
      'ordinary operation settlement persists independently');
    assert.equal(
      terminalRow.message_group_membership_lane_key,
      MEMBERSHIP_LANE_KEY,
      'generic terminal persistence cannot release membership serialization',
    );
    assert.equal(
      terminalRow.message_group_membership_obligation_state,
      'intent_recorded',
      'generic terminal persistence cannot rewrite membership-owner state',
    );

    database.close();
    database = createCanonicalDatabase(dbPath);
    const restartedRepository = createRepository(database, {
      nodeId: 'owner-after-restart',
    });
    const restartedOwner =
      await restartedRepository
        .queryAuthoritativeOperationByMessageGroupMembershipLane(
          MEMBERSHIP_LANE_KEY,
        );
    assert.equal(restartedOwner.operationId, owner.operationId,
      'a fresh repository reconstructs the terminal retained obligation');
    assert.equal(restartedOwner.sourceReplicaId, 'mg-foundation-r1',
      'the source identity is durable rather than reconstructed from history');
    assert.equal(
      restartedOwner.messageGroupMembershipIdentity,
      owner.messageGroupMembershipIdentity,
      'restart preserves the exact peer-identity binding',
    );
  } finally {
    if (database.open) database.close();
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('lost INSERT answer recovers the same membership owner without a ' +
  'duplicate lane row', async () => {
  const database = createCanonicalDatabase(':memory:');
  try {
    const repository = createRepository(database, {
      nodeId: 'lost-answer-owner',
      loseNextInsertAnswer: true,
    });
    const operation = createMembershipOperation(
      'membership-operation-lost-answer',
      'mg-foundation-r4',
    );
    const result = await repository.persistNewOperation(operation, {
      returnDisposition: true,
    });
    assert.equal(
      result.disposition,
      REPLICA_OPERATION_INSERT_DISPOSITION.UNKNOWN,
      'the owner reports an unknown delivered answer without claiming fresh insert',
    );
    assert.equal(
      database.prepare('SELECT COUNT(*) FROM replica_operations').pluck().get(),
      1,
      'recovery observes one durable operation row',
    );
    assert.equal(
      database.prepare(
        'SELECT COUNT(*) FROM replica_operations ' +
        'WHERE message_group_membership_lane_key = ?',
      ).pluck().get(MEMBERSHIP_LANE_KEY),
      1,
      'answer loss cannot duplicate the per-group lane',
    );
  } finally {
    database.close();
  }
});

test('two real coordinator facades request typed persistence disposition and ' +
  'adopt the one authoritative membership lane owner', async () => {
  const database = createCanonicalDatabase(':memory:');
  const firstCoordinator = createCoordinator(database, 'coordinator-a');
  const secondCoordinator = createCoordinator(database, 'coordinator-b');
  try {
    const results = await Promise.all([
      firstCoordinator.persistNewOperation(createMembershipOperation(
        'coordinator-membership-r1-r4',
        'mg-foundation-r4',
      ), {returnDisposition: true}),
      secondCoordinator.persistNewOperation(createMembershipOperation(
        'coordinator-membership-r2-r5',
        'mg-foundation-r5',
      ), {returnDisposition: true}),
    ]);
    const inserted = results.find((result) => result.disposition ===
      REPLICA_OPERATION_INSERT_DISPOSITION.INSERTED);
    const conflict = results.find((result) => result.disposition ===
      REPLICA_OPERATION_INSERT_DISPOSITION.MEMBERSHIP_LANE_CONFLICT);
    assert.ok(inserted, 'one coordinator facade inserts the lane owner');
    assert.ok(conflict, 'the other facade returns the typed lane conflict');
    assert.equal(conflict.operation.operationId, inserted.operation.operationId,
      'the coordinator caller adopts the exact authoritative owner row');
    assert.equal(
      database.prepare(
        'SELECT COUNT(*) FROM replica_operations ' +
        'WHERE message_group_membership_lane_key = ?',
      ).pluck().get(MEMBERSHIP_LANE_KEY),
      1,
      'the coordinator path admits exactly one nonterminal group lane',
    );
  } finally {
    await firstCoordinator.shutdown();
    await secondCoordinator.shutdown();
    database.close();
  }
});

test('canonical visibility treats omitted nullable membership fields as SQL ' +
  'NULL while preserving non-null owner stamps', async () => {
  const database = createCanonicalDatabase(':memory:');
  let coordinator = null;
  try {
    const repository = createRepository(database, {nodeId: 'visibility-owner'});
    coordinator = createCoordinator(database, 'ordinary-replace-owner');
    allowOrdinaryReplaceCreation(coordinator, 'ordinary-p1-r2');
    const sourceBearingReplace = await coordinator.createOperation({
      operationIntentId: 'source-bearing-replace-without-membership',
      type: OperationType.REPLACE,
      partitionId: 'ordinary-p1',
      entityType: SERVICE_TYPE.PARTITION,
      entityId: 'ordinary-p1',
      nodeId: 'ordinary-target-node',
      sourceNodeId: 'ordinary-source-node',
      replicaId: 'ordinary-p1-r1',
      deferDispatchUntilBootstrapTopology: true,
      emitOperationCreated: false,
    });
    const authoritativeOrdinary =
      await coordinator.repository.queryAuthoritativeOperationById(
        sourceBearingReplace.operationId,
      );
    assert.equal(authoritativeOrdinary.sourceReplicaId, 'ordinary-p1-r1',
      'the production coordinator persists the exact REPLACE source');
    for (const field of [
      'messageGroupMembershipLaneKey',
      'messageGroupMembershipPhase',
      'messageGroupMembershipObligationState',
      'messageGroupMembershipIdentity',
      'messageGroupLearnerStamp',
      'messageGroupVoterStamp',
      'messageGroupRemovalStamp',
      'messageGroupSourceLifecycleClaim',
    ]) {
      assert.equal(authoritativeOrdinary[field], null,
        `ordinary REPLACE decodes ${field} as canonical null`);
    }
    database.prepare(
      'DELETE FROM replica_operations WHERE operation_id = ?',
    ).run(authoritativeOrdinary.operationId);
    const repaired = await repairOperationRowForGateRepairedReservation(
      {repository: coordinator.repository, logger: {warn() {}}},
      authoritativeOrdinary,
    );
    assert.equal(repaired, true,
      'ordinary source-bearing REPLACE remains eligible for gate-row repair');
    assert.equal(
      database.prepare(
        'SELECT COUNT(*) FROM replica_operations WHERE operation_id = ?',
      ).pluck().get(authoritativeOrdinary.operationId),
      1,
      'the existing gate-row repair owner restores the ordinary operation',
    );

    const membershipIntent = createMembershipOperation(
      'membership-intent-with-future-stamps-omitted',
      'mg-foundation-r5',
      {messageGroupMembershipLaneKey: 'message-group:mg-second'},
    );
    delete membershipIntent.messageGroupLearnerStamp;
    delete membershipIntent.messageGroupVoterStamp;
    delete membershipIntent.messageGroupRemovalStamp;
    const membershipResult = await repository.persistNewOperation(
      membershipIntent,
      {returnDisposition: true},
    );
    assert.equal(membershipResult.disposition,
      REPLICA_OPERATION_INSERT_DISPOSITION.INSERTED,
      'a membership intent round-trips omitted future stamps');
    assert.equal(
      membershipResult.operation.messageGroupMembershipIdentity,
      membershipIntent.messageGroupMembershipIdentity,
      'the exact non-null membership identity is unchanged',
    );
    assert.equal(
      membershipResult.operation.messageGroupSourceLifecycleClaim,
      membershipIntent.messageGroupSourceLifecycleClaim,
      'the exact non-null source lifecycle claim is unchanged',
    );
  } finally {
    if (coordinator) await coordinator.shutdown();
    database.close();
  }
});

test('non-unique SQLite constraints remain hard insert failures and cannot ' +
  'adopt a membership lane', async () => {
  for (const failure of [
    {
      errorCode: 'SQLITE_CONSTRAINT_NOTNULL',
      error: 'NOT NULL constraint failed: replica_operations.target_node_id',
    },
    {
      errorCode: 'SQLITE_CONSTRAINT_CHECK',
      error: 'CHECK constraint failed: operation_identity',
    },
    {
      errorCode: 'SQLITE_CONSTRAINT_FOREIGNKEY',
      error: 'FOREIGN KEY constraint failed',
    },
  ]) {
    const database = createCanonicalDatabase(':memory:');
    try {
      const repository = createRepository(database, {
        nodeId: `hard-failure-${failure.errorCode}`,
        failNextInsertResult: {success: false, ...failure},
      });
      await assert.rejects(
        repository.persistNewOperation(createMembershipOperation(
          `operation-${failure.errorCode}`,
          'mg-foundation-r4',
        ), {returnDisposition: true}),
        new RegExp(failure.error.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'),
        `${failure.errorCode} is surfaced instead of reclassified`,
      );
      assert.equal(
        database.prepare('SELECT COUNT(*) FROM replica_operations').pluck().get(),
        0,
        `${failure.errorCode} cannot create or adopt a lane row`,
      );
    } finally {
      database.close();
    }
  }
});

test('an unrelated UNIQUE constraint cannot be reclassified as ownership of ' +
  'an existing message-group lane', async () => {
  const database = createCanonicalDatabase(':memory:');
  try {
    const firstRepository = createRepository(database, {nodeId: 'lane-owner'});
    await firstRepository.persistNewOperation(createMembershipOperation(
      'existing-lane-operation',
      'mg-foundation-r4',
    ), {returnDisposition: true});

    const unrelatedFailure =
      'UNIQUE constraint failed: replica_operations.unrelated_unique';
    const secondRepository = createRepository(database, {
      nodeId: 'unrelated-unique-owner',
      failNextInsertResult: {
        success: false,
        errorCode: 'SQLITE_CONSTRAINT_UNIQUE',
        error: unrelatedFailure,
      },
    });
    await assert.rejects(
      secondRepository.persistNewOperation(createMembershipOperation(
        'unrelated-unique-operation',
        'mg-foundation-r5',
      ), {returnDisposition: true}),
      /replica_operations\.unrelated_unique/u,
      'only a named owner constraint may enter collision adoption',
    );
    assert.equal(
      database.prepare('SELECT COUNT(*) FROM replica_operations').pluck().get(),
      1,
      'the unrelated failure neither inserts nor adopts another owner row',
    );
  } finally {
    database.close();
  }
});

test('a vanished authoritative row cannot be resurrected from a stale ' +
  'membership-bearing operation snapshot', async () => {
  const database = createCanonicalDatabase(':memory:');
  try {
    const repository = createRepository(database, {nodeId: 'stale-owner'});
    const operation = createMembershipOperation(
      'membership-operation-stale-reinsert',
      'mg-foundation-r4',
    );
    await repository.persistNewOperation(operation, {returnDisposition: true});
    database.prepare(
      'DELETE FROM replica_operations WHERE operation_id = ?',
    ).run(operation.operationId);
    operation.status = ReplicaStatus.FAILED;
    operation.workflowStep = WORKFLOW_STEP.FAILED;
    operation.updatedAt = 30;
    operation.completedAt = 30;

    const outcome = await repository.persistOperationUpdate(operation, {
      expectedWorkflowStep: WORKFLOW_STEP.PENDING,
      returnDisposition: true,
      terminalTransition: true,
    });
    assert.equal(
      outcome.disposition,
      REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED,
      'the repository refuses to recreate vanished membership authority',
    );
    assert.equal(
      database.prepare('SELECT COUNT(*) FROM replica_operations').pluck().get(),
      0,
      'the stale snapshot cannot resurrect its lane or membership obligation',
    );
  } finally {
    database.close();
  }
});
