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
import {deriveRaftRsPeerId} from
  '../../src/raft/raft-rs-peer-identity.js';
import {raftRsConfStateKey} from '../../src/raft/raft-rs-conf-state-key.js';
import {COMMITTED_MEMBERSHIP_STAMP_KIND} from
  '../../src/raft/raft-committed-membership-constants.js';
import {ReplicaOperationMessageGroupMembershipPermitOwner} from
  '../../src/rebalancer/replica-operation-message-group-membership-permit-owner.js';
import {buildMessageGroupMembershipWorkflowOwnerFence,
  encodeMessageGroupMembershipPermit} from
  '../../src/rebalancer/replica-operation-message-group-membership-permit.js';
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
  'message_group_membership_permit',
  'message_group_learner_stamp',
  'message_group_voter_stamp',
  'message_group_removal_stamp',
  'message_group_source_lifecycle_claim',
]);
const MEMBERSHIP_LANE_INDEX =
  'idx_replica_ops_message_group_membership_lane';
const GROUP_ID = 'mg-foundation';
const MEMBERSHIP_LANE_KEY = `message-group:${GROUP_ID}`;
const WORKFLOW_OWNER_NODE_ID = 'seed-node';
const INITIAL_OWNER_LEASE_EXPIRES_AT = 30_010;

function workflowOwnerFence(ownerNodeId, leaseExpiresAt) {
  return buildMessageGroupMembershipWorkflowOwnerFence(
    ownerNodeId, leaseExpiresAt);
}

function permit(overrides = {}) {
  const workflowOwnerNodeId = overrides.workflowOwnerNodeId ||
    WORKFLOW_OWNER_NODE_ID;
  const membershipLeaseExpiresAt = overrides.membershipLeaseExpiresAt ||
    INITIAL_OWNER_LEASE_EXPIRES_AT;
  const ownerFence = Object.hasOwn(overrides, 'workflowOwnerFence') ?
    overrides.workflowOwnerFence : workflowOwnerFence(
      workflowOwnerNodeId, membershipLeaseExpiresAt);
  return {version: 1, transitionIdentity: 'transition-1',
    permitSequence: 1, permitStage: 'add_learner', permitState: 'in_flight',
    proposerNodeId: 'leader-node', proposerBootIncarnation: 11,
    destinationNodeId: 'target-node', destinationBootIncarnation: 12,
    replicaLifecycleIncarnation: 'lifecycle-target', runtimeGeneration: 3,
    leaderTerm: 7, leaderConfigurationStamp: {configurationKey: 'v:1|l:',
      membershipGenerationIndex: 9}, proposalIndex: null, ...overrides,
    workflowOwnerNodeId, workflowOwnerFence: ownerFence,
    membershipLeaseExpiresAt};
}

function committedMembership(operation, stage, generation, appliedIndex) {
  const identity = JSON.parse(operation.messageGroupMembershipIdentity);
  const sourcePeerId = deriveRaftRsPeerId(identity.sourceReplicaId);
  const targetPeerId = identity.targetPeerId;
  const voters = stage === 'promote' ? [sourcePeerId, targetPeerId] :
    [sourcePeerId];
  const learners = stage === 'add_learner' ? [targetPeerId] : [];
  const confState = {voters, votersOutgoing: [], learners, learnersNext: []};
  return {kind: COMMITTED_MEMBERSHIP_STAMP_KIND.COMMITTED, ...confState,
    appliedIndex, configurationKey: raftRsConfStateKey(confState),
    membershipGenerationIndex: generation, commitIndex: appliedIndex,
    term: 7, leaderId: identity.sourceReplicaId, gateOpen: true,
    identities: stage === 'remove' ?
      {[sourcePeerId]: identity.sourceReplicaId} :
      {[sourcePeerId]: identity.sourceReplicaId,
        [targetPeerId]: identity.targetReplicaId}};
}

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
  let loseNextUpdateAnswer = options.loseNextUpdateAnswer === true;
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
    if (loseNextUpdateAnswer && result.success === true &&
        sql.startsWith('UPDATE replica_operations')) {
      loseNextUpdateAnswer = false;
      if (options.controller) options.controller.authorityAvailable = false;
      throw new Error('injected UPDATE answer loss');
    }
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
    readAuthoritativeRows: async (_table, sql, params = []) => {
      if (options.controller?.authorityAvailable === false) {
        throw new Error('injected authority unavailable');
      }
      return executeSql(database, sql, params);
    },
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
  const targetPeerId = deriveRaftRsPeerId(targetReplicaId);
  const identity = JSON.stringify({operationId, groupId: GROUP_ID,
    sourceReplicaId: 'mg-foundation-r1', sourceNodeId: 'seed-node',
    sourceCreatedAt: 3, sourceCreateAttemptToken: 'attempt-source-1',
    targetReplicaId, targetPeerId, targetNodeId: `${targetReplicaId}-node`,
    targetAddress: `${targetReplicaId}-address`,
    transitionIdentity: 'transition-1', membershipLaneKey: MEMBERSHIP_LANE_KEY});
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
    messageGroupMembershipIdentity: identity,
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

test('canonical permit encoding rejects extra keys and repository CAS survives terminal settlement', async () => {
  assert.throws(() => encodeMessageGroupMembershipPermit({...permit(), evil: true}),
    /Invalid message-group membership permit/);
  const database = createCanonicalDatabase(':memory:');
  const repository = createRepository(database);
  const operation = createMembershipOperation('permit-terminal-after',
    'mg-foundation-r4');
  await repository.persistNewOperation(operation);
  const owner = new ReplicaOperationMessageGroupMembershipPermitOwner(repository);
  const authorized = await owner.authorizeLearner(operation.operationId,
    operation.messageGroupMembershipIdentity, permit(), 10_000);
  assert.equal(authorized.outcome, 'applied');
  const terminal = {...authorized.operation,
    stepsHistory: [...authorized.operation.stepsHistory], completedAt: 50,
    status: ReplicaStatus.FAILED, workflowStep: WORKFLOW_STEP.FAILED,
    updatedAt: 50};
  await repository.persistOperationUpdate(terminal, {terminalTransition: true});
  const adopted = await owner.takeOverExpired(operation.operationId,
    operation.messageGroupMembershipIdentity, permit(), permit({
      permitSequence: 2, workflowOwnerNodeId: 'owner-b',
      membershipLeaseExpiresAt: 80_000,
    }), 50_000);
  assert.equal(adopted.outcome, 'applied');
  assert.equal(adopted.operation.completedAt, 50);
  assert.equal(adopted.operation.messageGroupMembershipLaneKey,
    MEMBERSHIP_LANE_KEY);
  database.close();
});


test('strict permit parser is not fooled by mutable Set.prototype.has', () => {
  const original = Set.prototype.has;
  Reflect.set(Set.prototype, 'has', () => true);
  try {
    assert.throws(() => encodeMessageGroupMembershipPermit(permit({
      permitState: 'forged_state',
    })), /Invalid message-group membership permit/);
  } finally {
    Reflect.set(Set.prototype, 'has', original);
  }
});

test('strict permit parser is not fooled by mutable Array.prototype.every', () => {
  const original = Array.prototype.every;
  Reflect.set(Array.prototype, 'every', () => true);
  try {
    assert.throws(() => encodeMessageGroupMembershipPermit(permit({
      permitState: 'forged_state',
    })), /Invalid message-group membership permit/);
  } finally {
    Reflect.set(Array.prototype, 'every', original);
  }
});

test('strict permit parser binds proposalIndex to permit state', () => {
  assert.throws(() => encodeMessageGroupMembershipPermit(permit({
    permitState: 'anchored', proposalIndex: null,
  })), /Invalid message-group membership permit/);
  assert.throws(() => encodeMessageGroupMembershipPermit(permit({
    permitState: 'in_flight', proposalIndex: 10,
  })), /Invalid message-group membership permit/);
});

test('release lane cannot adopt a pre-released row after its exact CAS changes zero rows', async () => {
  const database = createCanonicalDatabase(':memory:');
  try {
    const repository = createRepository(database);
    const operation = createMembershipOperation('permit-release-zero-row',
      'mg-foundation-r4');
    await repository.persistNewOperation(operation);
    const owner = new ReplicaOperationMessageGroupMembershipPermitOwner(repository);
    const removeCommitted = permit({permitSequence: 3, permitStage: 'remove',
      permitState: 'committed', proposalIndex: 30,
      membershipLeaseExpiresAt: 90_000});
    const absent = committedMembership(operation, 'remove', 30, 30);
    const removalStamp = JSON.stringify(absent);
    database.prepare(`UPDATE replica_operations SET
      message_group_membership_lane_key = NULL,
      message_group_membership_obligation_state = 'resolved_absent',
      message_group_membership_phase = 'removal_committed',
      message_group_membership_permit = ?,
      message_group_removal_stamp = ?
      WHERE operation_id = ?`).run(
      encodeMessageGroupMembershipPermit({...removeCommitted, permitSequence: 99}),
      removalStamp, operation.operationId);

    const released = await owner.releaseLane(operation.operationId,
      operation.messageGroupMembershipIdentity, removeCommitted,
      {settlementAppliedIndex: 30, committedMembership: absent});
    assert.equal(released.outcome, 'conflict',
      'a zero-row release must not be accepted from a merely released row');
  } finally {
    database.close();
  }
});


test('release lane cannot adopt a released row with a different identity after zero-row CAS', async () => {
  const database = createCanonicalDatabase(':memory:');
  try {
    const repository = createRepository(database);
    const operation = createMembershipOperation('permit-release-wrong-identity',
      'mg-foundation-r4');
    await repository.persistNewOperation(operation);
    const owner = new ReplicaOperationMessageGroupMembershipPermitOwner(repository);
    const removeCommitted = permit({permitSequence: 3, permitStage: 'remove',
      permitState: 'committed', proposalIndex: 30,
      membershipLeaseExpiresAt: 90_000});
    const absent = committedMembership(operation, 'remove', 30, 30);
    const wrongIdentity = JSON.parse(operation.messageGroupMembershipIdentity);
    wrongIdentity.targetAddress = 'other-address';
    database.prepare(`UPDATE replica_operations SET
      message_group_membership_lane_key = NULL,
      message_group_membership_obligation_state = 'resolved_absent',
      message_group_membership_phase = 'removal_committed',
      message_group_membership_identity = ?,
      message_group_membership_permit = ?,
      message_group_removal_stamp = ?
      WHERE operation_id = ?`).run(JSON.stringify(wrongIdentity),
      encodeMessageGroupMembershipPermit(removeCommitted), JSON.stringify(absent),
      operation.operationId);

    const released = await owner.releaseLane(operation.operationId,
      operation.messageGroupMembershipIdentity, removeCommitted,
      {settlementAppliedIndex: 30, committedMembership: absent});
    assert.equal(released.outcome, 'conflict',
      'release winner must still be the exact durable membership identity');
  } finally {
    database.close();
  }
});

test('learner authorization requires the current structural owner lease and fence', async () => {
  const database = createCanonicalDatabase(':memory:');
  try {
    const repository = createRepository(database);
    const operation = createMembershipOperation('permit-wrong-owner',
      'mg-foundation-r4');
    await repository.persistNewOperation(operation);
    const owner = new ReplicaOperationMessageGroupMembershipPermitOwner(repository);
    const wrongOwnerPermit = permit({workflowOwnerNodeId: 'not-current-owner'});
    const refused = await owner.authorizeLearner(operation.operationId,
      operation.messageGroupMembershipIdentity, wrongOwnerPermit, 10_000);
    assert.equal(refused.outcome, 'conflict',
      'the durable row owner, not the caller-provided permit, authorizes L1');
    const wrongFence = await owner.authorizeLearner(operation.operationId,
      operation.messageGroupMembershipIdentity,
      permit({workflowOwnerFence: 'not-the-durable-fence'}), 10_000);
    assert.equal(wrongFence.outcome, 'conflict',
      'the durable row fence is part of the L1 authorization CAS');
    const negativeNow = await owner.authorizeLearner(operation.operationId,
      operation.messageGroupMembershipIdentity, permit(), -1);
    assert.equal(negativeNow.outcome, 'conflict',
      'a negative observation time cannot make an expired lease look live');
    assert.equal(database.prepare(`SELECT message_group_membership_permit AS permit
      FROM replica_operations WHERE operation_id = ?`).get(operation.operationId)
      .permit, null);
  } finally {
    database.close();
  }
});

test('zero-row L1 winner requires exact identity phase and obligation', async () => {
  const database = createCanonicalDatabase(':memory:');
  try {
    const repository = createRepository(database);
    const operation = createMembershipOperation('permit-l1-zero-row-exact',
      'mg-foundation-r4');
    await repository.persistNewOperation(operation);
    const encodedPermit = encodeMessageGroupMembershipPermit(permit());
    const wrongIdentity = JSON.parse(operation.messageGroupMembershipIdentity);
    wrongIdentity.targetAddress = 'other-address';
    database.prepare(`UPDATE replica_operations SET
      message_group_membership_phase = 'promotion_proposal_in_flight',
      message_group_membership_obligation_state = 'unknown',
      message_group_membership_identity = ?,
      message_group_membership_permit = ?
      WHERE operation_id = ?`).run(JSON.stringify(wrongIdentity), encodedPermit,
      operation.operationId);
    const owner = new ReplicaOperationMessageGroupMembershipPermitOwner(repository);
    const answer = await owner.authorizeLearner(operation.operationId,
      operation.messageGroupMembershipIdentity, permit(), 10_000);
    assert.equal(answer.outcome, 'conflict',
      'L1 winner cannot adopt an exact permit on the wrong row shape');
  } finally {
    database.close();
  }
});

test('terminal-first authorization clears only the membership lane', async () => {
  const database = createCanonicalDatabase(':memory:');
  const repository = createRepository(database);
  const operation = createMembershipOperation('permit-terminal-first',
    'mg-foundation-r4', {completedAt: 20, status: ReplicaStatus.FAILED,
      workflowStep: WORKFLOW_STEP.FAILED});
  await repository.persistNewOperation(operation);
  const owner = new ReplicaOperationMessageGroupMembershipPermitOwner(repository);
  const refused = await owner.authorizeLearner(operation.operationId,
    operation.messageGroupMembershipIdentity, permit(), 10_000);
  assert.equal(refused.outcome, 'conflict');
  const answer = await owner.settleTerminalFirst(operation.operationId,
    operation.messageGroupMembershipIdentity);
  assert.equal(answer.outcome, 'terminal_first');
  assert.equal(answer.operation.messageGroupMembershipLaneKey, null);
  assert.equal(answer.operation.messageGroupMembershipPermit, null);
  database.close();
});

test('terminal-first zero-row winner requires exact identity and null permit', async () => {
  const database = createCanonicalDatabase(':memory:');
  try {
    const repository = createRepository(database);
    const operation = createMembershipOperation('permit-terminal-zero-exact',
      'mg-foundation-r4', {completedAt: 20, status: ReplicaStatus.FAILED,
        workflowStep: WORKFLOW_STEP.FAILED});
    await repository.persistNewOperation(operation);
    const wrongIdentity = JSON.parse(operation.messageGroupMembershipIdentity);
    wrongIdentity.targetAddress = 'other-address';
    database.prepare(`UPDATE replica_operations SET
      message_group_membership_lane_key = NULL,
      message_group_membership_obligation_state = 'definitive_non_admission',
      message_group_membership_identity = ?
      WHERE operation_id = ?`).run(JSON.stringify(wrongIdentity),
      operation.operationId);
    const owner = new ReplicaOperationMessageGroupMembershipPermitOwner(repository);
    const answer = await owner.settleTerminalFirst(operation.operationId,
      operation.messageGroupMembershipIdentity);
    assert.equal(answer.outcome, 'conflict',
      'terminal-first winner cannot adopt a different membership identity');
  } finally {
    database.close();
  }
});

test('permit owner advances add, promote, remove and releases only committed absence', async () => {
  const database = createCanonicalDatabase(':memory:');
  const repository = createRepository(database);
  const operation = createMembershipOperation('permit-full-chain',
    'mg-foundation-r4');
  await repository.persistNewOperation(operation);
  const owner = new ReplicaOperationMessageGroupMembershipPermitOwner(repository);
  const add = permit({leaderConfigurationStamp: {
    configurationKey: raftRsConfStateKey({voters: [deriveRaftRsPeerId(
      'mg-foundation-r1')]}), membershipGenerationIndex: 1}});
  assert.equal((await owner.authorizeLearner(operation.operationId,
    operation.messageGroupMembershipIdentity, add, 10_000)).outcome, 'applied');
  const addAnchored = {...add, permitState: 'anchored', proposalIndex: 10};
  assert.equal((await owner.recordProposalAnchor(operation.operationId,
    operation.messageGroupMembershipIdentity, add, 10)).outcome, 'applied');
  const learner = committedMembership(operation, 'add_learner', 10, 10);
  assert.equal((await owner.recordCommittedStage(operation.operationId,
    operation.messageGroupMembershipIdentity, addAnchored,
    {settlementAppliedIndex: 10, committedMembership: learner})).outcome,
  'applied');
  const addCommitted = {...addAnchored, permitState: 'committed'};
  const promote = {...add, permitSequence: 2, permitStage: 'promote',
    membershipLeaseExpiresAt: 50_000, workflowOwnerFence: workflowOwnerFence(
      WORKFLOW_OWNER_NODE_ID, 50_000),
    leaderConfigurationStamp: {configurationKey: learner.configurationKey,
      membershipGenerationIndex: learner.membershipGenerationIndex}};
  assert.equal((await owner.advanceStage(operation.operationId,
    operation.messageGroupMembershipIdentity, addCommitted, promote,
    20_000)).outcome, 'applied');
  const promoteAnchored = {...promote, permitState: 'anchored',
    proposalIndex: 20};
  assert.equal((await owner.recordProposalAnchor(operation.operationId,
    operation.messageGroupMembershipIdentity, promote, 20)).outcome, 'applied');
  const voter = committedMembership(operation, 'promote', 20, 20);
  assert.equal((await owner.recordCommittedStage(operation.operationId,
    operation.messageGroupMembershipIdentity, promoteAnchored,
    {settlementAppliedIndex: 20, committedMembership: voter})).outcome,
  'applied');
  const promoteCommitted = {...promoteAnchored, permitState: 'committed'};
  const remove = {...promote, permitSequence: 3, permitStage: 'remove',
    membershipLeaseExpiresAt: 60_000, workflowOwnerFence: workflowOwnerFence(
      WORKFLOW_OWNER_NODE_ID, 60_000),
    leaderConfigurationStamp: {configurationKey: voter.configurationKey,
      membershipGenerationIndex: voter.membershipGenerationIndex}};
  assert.equal((await owner.advanceStage(operation.operationId,
    operation.messageGroupMembershipIdentity, promoteCommitted, remove,
    30_000)).outcome, 'applied');
  const removeAnchored = {...remove, permitState: 'anchored', proposalIndex: 30};
  assert.equal((await owner.recordProposalAnchor(operation.operationId,
    operation.messageGroupMembershipIdentity, remove, 30)).outcome, 'applied');
  const absent = committedMembership(operation, 'remove', 30, 30);
  const removeCommitted = {...removeAnchored, permitState: 'committed'};
  assert.equal((await owner.releaseLane(operation.operationId,
    operation.messageGroupMembershipIdentity, removeCommitted,
    {settlementAppliedIndex: 30, committedMembership: absent})).outcome,
  'conflict', 'absence cannot release before the removal stamp is durable');
  assert.equal((await owner.recordCommittedStage(operation.operationId,
    operation.messageGroupMembershipIdentity, removeAnchored,
    {settlementAppliedIndex: 30, committedMembership: absent})).outcome,
  'applied');
  const released = await owner.releaseLane(operation.operationId,
    operation.messageGroupMembershipIdentity, removeCommitted,
    {settlementAppliedIndex: 30, committedMembership: absent});
  assert.equal(released.outcome, 'applied');
  assert.equal(released.operation.messageGroupMembershipLaneKey, null);
  assert.equal(released.operation.completedAt, null,
    'lane release does not settle the ordinary operation');
  database.close();
});

test('committed stage refuses an anchored permit without a proposal index', async () => {
  const operation = createMembershipOperation('permit-anchorless-commit',
    'mg-foundation-r4');
  const owner = new ReplicaOperationMessageGroupMembershipPermitOwner({});
  assert.throws(() => owner.recordCommittedStage(operation.operationId,
    operation.messageGroupMembershipIdentity,
    permit({permitState: 'anchored', proposalIndex: null}),
    {settlementAppliedIndex: 10, committedMembership: committedMembership(
      operation, 'add_learner', 10, 10)}),
  /Invalid message-group membership permit/);
});

test('replace-permit zero-row winner requires exact identity and lane', async () => {
  const database = createCanonicalDatabase(':memory:');
  try {
    const repository = createRepository(database);
    const operation = createMembershipOperation('permit-replace-zero-exact',
      'mg-foundation-r4');
    await repository.persistNewOperation(operation);
    const owner = new ReplicaOperationMessageGroupMembershipPermitOwner(repository);
    const add = permit();
    await owner.authorizeLearner(operation.operationId,
      operation.messageGroupMembershipIdentity, add, 10_000);
    const anchored = {...add, permitState: 'anchored', proposalIndex: 10};
    const wrongIdentity = JSON.parse(operation.messageGroupMembershipIdentity);
    wrongIdentity.targetAddress = 'other-address';
    database.prepare(`UPDATE replica_operations SET
      message_group_membership_identity = ?,
      message_group_membership_permit = ?
      WHERE operation_id = ?`).run(JSON.stringify(wrongIdentity),
      encodeMessageGroupMembershipPermit(anchored), operation.operationId);
    const answer = await owner.recordProposalAnchor(operation.operationId,
      operation.messageGroupMembershipIdentity, add, 10);
    assert.equal(answer.outcome, 'conflict',
      'replace winner cannot adopt a permit written on a different identity');
  } finally {
    database.close();
  }
});

test('committed receipt is not fooled by mutable Array.prototype.includes', async () => {
  const database = createCanonicalDatabase(':memory:');
  try {
    const repository = createRepository(database);
    const operation = createMembershipOperation('permit-includes-hostile',
      'mg-foundation-r4');
    await repository.persistNewOperation(operation);
    const owner = new ReplicaOperationMessageGroupMembershipPermitOwner(repository);
    const add = permit();
    await owner.authorizeLearner(operation.operationId,
      operation.messageGroupMembershipIdentity, add, 10_000);
    await owner.recordProposalAnchor(operation.operationId,
      operation.messageGroupMembershipIdentity, add, 10);
    const anchored = {...add, permitState: 'anchored', proposalIndex: 10};
    const voterOnly = committedMembership(operation, 'promote', 10, 10);
    const original = Array.prototype.includes;
    Reflect.set(Array.prototype, 'includes', () => true);
    try {
      assert.equal((await owner.recordCommittedStage(operation.operationId,
        operation.messageGroupMembershipIdentity, anchored,
        {settlementAppliedIndex: 10, committedMembership: voterOnly})).outcome,
      'conflict', 'a voter receipt cannot satisfy an add-learner permit');
    } finally {
      Reflect.set(Array.prototype, 'includes', original);
    }
    assert.equal(database.prepare(`SELECT message_group_learner_stamp AS stamp
      FROM replica_operations WHERE operation_id = ?`).get(operation.operationId)
      .stamp, null);
  } finally {
    database.close();
  }
});

test('committed receipt refuses proxy and wrong-role owner answers without mutation', async () => {
  const database = createCanonicalDatabase(':memory:');
  const repository = createRepository(database);
  const operation = createMembershipOperation('permit-hostile-receipt',
    'mg-foundation-r4');
  await repository.persistNewOperation(operation);
  const owner = new ReplicaOperationMessageGroupMembershipPermitOwner(repository);
  const add = permit();
  await owner.authorizeLearner(operation.operationId,
    operation.messageGroupMembershipIdentity, add, 10_000);
  await owner.recordProposalAnchor(operation.operationId,
    operation.messageGroupMembershipIdentity, add, 10);
  const anchored = {...add, permitState: 'anchored', proposalIndex: 10};
  const learner = committedMembership(operation, 'add_learner', 10, 10);
  for (const answer of [new Proxy(learner, {}),
    committedMembership(operation, 'promote', 10, 10)]) {
    assert.equal((await owner.recordCommittedStage(operation.operationId,
      operation.messageGroupMembershipIdentity, anchored,
      {settlementAppliedIndex: 10, committedMembership: answer})).outcome,
    'conflict');
  }
  const row = database.prepare(`SELECT message_group_learner_stamp AS stamp,
    message_group_membership_phase AS phase FROM replica_operations
    WHERE operation_id = ?`).get(operation.operationId);
  assert.equal(row.stamp, null);
  assert.equal(row.phase, 'learner_proposal_in_flight');
  database.close();
});

test('strict permit parser binds lane to group and captured Number Object JSON intrinsics', () => {
  const operation = createMembershipOperation('hostile-intrinsics',
    'mg-foundation-r4');
  const identity = JSON.parse(operation.messageGroupMembershipIdentity);
  identity.membershipLaneKey = 'message-group:other';
  assert.throws(() => new ReplicaOperationMessageGroupMembershipPermitOwner({})
    .authorizeLearner(operation.operationId, identity, permit(), 10_000),
  /Invalid message-group membership identity/);

  const originalNumber = Number.isSafeInteger;
  const originalObjectIs = Object.is;
  const originalParse = JSON.parse;
  const originalStringify = JSON.stringify;
  Reflect.set(Number, 'isSafeInteger', () => true);
  Reflect.set(Object, 'is', () => false);
  Reflect.set(JSON, 'parse', () => permit());
  Reflect.set(JSON, 'stringify', () => 'same');
  try {
    assert.throws(() => encodeMessageGroupMembershipPermit(permit({
      leaderTerm: Infinity,
    })), /Invalid message-group membership permit/);
    assert.throws(() => encodeMessageGroupMembershipPermit(permit({
      runtimeGeneration: -0,
    })), /Invalid message-group membership permit/);
    assert.throws(() => encodeMessageGroupMembershipPermit('not-json'),
      /Invalid message-group membership permit/);
    assert.notEqual(encodeMessageGroupMembershipPermit(permit()),
      encodeMessageGroupMembershipPermit(permit({permitSequence: 2})));
  } finally {
    Reflect.set(Number, 'isSafeInteger', originalNumber);
    Reflect.set(Object, 'is', originalObjectIs);
    Reflect.set(JSON, 'parse', originalParse);
    Reflect.set(JSON, 'stringify', originalStringify);
  }
});

test('strict permit parser rejects proxy, getter, symbol, negative zero and forged peer identity', async () => {
  const valid = permit();
  const hostile = [new Proxy(valid, {}), {...valid, runtimeGeneration: -0},
    Object.assign({...valid}, {[Symbol('extra')]: true}),
    {...valid, proposerBootIncarnation: '11'}];
  let getterReads = 0;
  const getter = {...valid};
  Object.defineProperty(getter, 'leaderTerm', {enumerable: true, get: () => {
    getterReads += 1;
    return 7;
  }});
  hostile.push(getter);
  for (const value of hostile) {
    assert.throws(() => encodeMessageGroupMembershipPermit(value),
      /Invalid message-group membership permit/);
  }
  assert.equal(getterReads, 0, 'validation never invokes an input accessor');
  const originalDescriptors = Object.getOwnPropertyDescriptors;
  Object.getOwnPropertyDescriptors = () => ({malformed: true});
  try {
    assert.equal(JSON.parse(encodeMessageGroupMembershipPermit(valid)).leaderTerm,
      7, 'validation uses its captured intrinsic rather than mutable globals');
  } finally {
    Object.getOwnPropertyDescriptors = originalDescriptors;
  }
  const operation = createMembershipOperation('forged-identity',
    'mg-foundation-r4');
  const identity = JSON.parse(operation.messageGroupMembershipIdentity);
  identity.targetPeerId = '01';
  assert.throws(() => new ReplicaOperationMessageGroupMembershipPermitOwner({})
    .authorizeLearner(operation.operationId, identity, valid, 10_000),
  /Invalid message-group membership identity/);
  const database = createCanonicalDatabase(':memory:');
  try {
    const repository = createRepository(database);
    await repository.persistNewOperation(operation);
    const exactIdentity = JSON.parse(operation.messageGroupMembershipIdentity);
    assert.equal((await new ReplicaOperationMessageGroupMembershipPermitOwner(
      repository).authorizeLearner(operation.operationId, exactIdentity,
      {...valid, membershipLeaseExpiresAt: 40_001}, 10_000)).outcome,
    'conflict', 'L1 cannot invent or extend the existing owner lease duration');
  } finally {
    database.close();
  }
});

test('two owners race L1, live lease refuses takeover, and expiry admits one exact successor', async () => {
  const database = createCanonicalDatabase(':memory:');
  const repositoryA = createRepository(database, {nodeId: 'owner-a'});
  const repositoryB = createRepository(database, {nodeId: 'owner-b'});
  const operation = createMembershipOperation('permit-owner-race',
    'mg-foundation-r4');
  await repositoryA.persistNewOperation(operation);
  const ownerA = new ReplicaOperationMessageGroupMembershipPermitOwner(
    repositoryA);
  const ownerB = new ReplicaOperationMessageGroupMembershipPermitOwner(
    repositoryB);
  const permitA = permit();
  const permitB = permit({workflowOwnerFence: 'stale-fence-b'});
  const raced = await Promise.all([ownerA.authorizeLearner(operation.operationId,
    operation.messageGroupMembershipIdentity, permitA, 10_000),
  ownerB.authorizeLearner(operation.operationId,
    operation.messageGroupMembershipIdentity, permitB, 10_000)]);
  assert.deepEqual(raced.map(({outcome}) => outcome).sort(),
    ['applied', 'conflict']);
  const successor = {...permitA, permitSequence: 2,
    workflowOwnerNodeId: 'owner-b', workflowOwnerFence: workflowOwnerFence(
      'owner-b', 80_000), membershipLeaseExpiresAt: 80_000};
  assert.equal((await ownerB.takeOverExpired(operation.operationId,
    operation.messageGroupMembershipIdentity, permitA, successor,
    30_009)).outcome, 'conflict');
  assert.throws(() => ownerB.takeOverExpired(operation.operationId,
    operation.messageGroupMembershipIdentity, permitA, successor, -0),
  /Invalid membership lease time/);
  assert.equal((await ownerB.takeOverExpired(operation.operationId,
    operation.messageGroupMembershipIdentity, permitA, successor,
    50_000)).outcome, 'applied');
  database.close();
});

test('expired takeover clears old proposal anchors and live stage advance retains owner fence', async () => {
  const database = createCanonicalDatabase(':memory:');
  try {
    const repository = createRepository(database);
    const operation = createMembershipOperation('permit-takeover-anchor',
      'mg-foundation-r4');
    await repository.persistNewOperation(operation);
    const owner = new ReplicaOperationMessageGroupMembershipPermitOwner(repository);
    const add = permit();
    await owner.authorizeLearner(operation.operationId,
      operation.messageGroupMembershipIdentity, add, 10_000);
    await owner.recordProposalAnchor(operation.operationId,
      operation.messageGroupMembershipIdentity, add, 10);
    const anchored = {...add, permitState: 'anchored', proposalIndex: 10};
    const reusedAnchor = {...anchored, permitSequence: 2,
      workflowOwnerNodeId: 'owner-b', workflowOwnerFence: workflowOwnerFence(
        'owner-b', 80_000), membershipLeaseExpiresAt: 80_000};
    assert.equal((await owner.takeOverExpired(operation.operationId,
      operation.messageGroupMembershipIdentity, anchored, reusedAnchor,
      50_000)).outcome, 'conflict',
    'takeover must not carry an old accepted proposalIndex forward');
    const arbitraryFence = {...add, permitSequence: 2,
      workflowOwnerNodeId: 'owner-b', workflowOwnerFence: 'arbitrary',
      membershipLeaseExpiresAt: 80_000};
    assert.equal((await owner.takeOverExpired(operation.operationId,
      operation.messageGroupMembershipIdentity, add, arbitraryFence,
      50_000)).outcome, 'conflict',
    'takeover requires the next owner fence to match owner and expiry');
    const committed = {...anchored, permitState: 'committed'};
    const changedOwner = {...add, permitSequence: 2, permitStage: 'promote',
      workflowOwnerNodeId: 'owner-b', workflowOwnerFence: workflowOwnerFence(
        'owner-b', 50_000), membershipLeaseExpiresAt: 50_000};
    assert.equal((await owner.advanceStage(operation.operationId,
      operation.messageGroupMembershipIdentity, committed, changedOwner,
      20_000)).outcome, 'conflict',
    'live stage advance cannot silently rotate workflow owner/fence');
    const staleFence = {...add, permitSequence: 2, permitStage: 'promote',
      membershipLeaseExpiresAt: 50_000, workflowOwnerFence: add.workflowOwnerFence};
    assert.equal((await owner.advanceStage(operation.operationId,
      operation.messageGroupMembershipIdentity, committed, staleFence,
      20_000)).outcome, 'conflict',
    'live stage advance cannot retain a fence for the old lease expiry');
  } finally {
    database.close();
  }
});

test('stage progression rejects expired, skipped and stale permit transitions', async () => {
  const database = createCanonicalDatabase(':memory:');
  const repository = createRepository(database);
  const operation = createMembershipOperation('permit-stage-regression',
    'mg-foundation-r4');
  await repository.persistNewOperation(operation);
  const owner = new ReplicaOperationMessageGroupMembershipPermitOwner(repository);
  const add = permit();
  await owner.authorizeLearner(operation.operationId,
    operation.messageGroupMembershipIdentity, add, 10_000);
  const committed = {...add, permitState: 'committed', proposalIndex: 10};
  const skipped = {...add, permitSequence: 2, permitStage: 'remove',
    membershipLeaseExpiresAt: 70_000};
  assert.equal((await owner.advanceStage(operation.operationId,
    operation.messageGroupMembershipIdentity, committed, skipped,
    40_000)).outcome, 'conflict');
  const next = {...skipped, permitStage: 'promote'};
  assert.equal((await owner.advanceStage(operation.operationId,
    operation.messageGroupMembershipIdentity, committed, next,
    40_000)).outcome, 'conflict', 'the expiry instant is no longer live');
  assert.equal(database.prepare(`SELECT message_group_membership_phase AS phase
    FROM replica_operations WHERE operation_id = ?`).get(operation.operationId)
    .phase, 'learner_proposal_in_flight');
  database.close();
});

test('lost L1 answer with unavailable authority dispatches nothing and recovers on retry', async () => {
  const database = createCanonicalDatabase(':memory:');
  const controller = {authorityAvailable: true};
  const repository = createRepository(database, {loseNextUpdateAnswer: true,
    controller});
  const operation = createMembershipOperation('permit-lost-answer',
    'mg-foundation-r4');
  // Insert must not consume the injected UPDATE failure.
  await repository.persistNewOperation(operation);
  const owner = new ReplicaOperationMessageGroupMembershipPermitOwner(repository);
  const first = await owner.authorizeLearner(operation.operationId,
    operation.messageGroupMembershipIdentity, permit(), 10_000);
  assert.equal(first.outcome, 'unavailable');
  assert.equal(database.prepare(`SELECT COUNT(*) AS count FROM replica_operations
    WHERE operation_id = ? AND message_group_membership_permit IS NOT NULL`)
    .get(operation.operationId).count, 0);
  controller.authorityAvailable = true;
  const recovered = await owner.authorizeLearner(operation.operationId,
    operation.messageGroupMembershipIdentity, permit(), 10_000);
  assert.equal(recovered.outcome, 'applied');
  assert.equal(recovered.operation.messageGroupMembershipPhase,
    'learner_proposal_in_flight');
  database.close();
});

test('committed stage cannot adopt a precommitted row with the wrong stamp after zero-row CAS', async () => {
  const database = createCanonicalDatabase(':memory:');
  try {
    const repository = createRepository(database);
    const operation = createMembershipOperation('permit-commit-zero-row',
      'mg-foundation-r4');
    await repository.persistNewOperation(operation);
    const owner = new ReplicaOperationMessageGroupMembershipPermitOwner(repository);
    const add = permit();
    await owner.authorizeLearner(operation.operationId,
      operation.messageGroupMembershipIdentity, add, 10_000);
    const anchored = {...add, permitState: 'anchored', proposalIndex: 10};
    const committed = {...anchored, permitState: 'committed'};
    const learner = committedMembership(operation, 'add_learner', 10, 10);
    const wrongLearner = {...learner, appliedIndex: 11, commitIndex: 11};
    database.prepare(`UPDATE replica_operations SET
      message_group_membership_phase = 'learner_committed',
      message_group_membership_permit = ?,
      message_group_learner_stamp = ?
      WHERE operation_id = ?`).run(
      encodeMessageGroupMembershipPermit(committed), JSON.stringify(wrongLearner),
      operation.operationId);
    const answer = await owner.recordCommittedStage(operation.operationId,
      operation.messageGroupMembershipIdentity, anchored,
      {settlementAppliedIndex: 10, committedMembership: learner});
    assert.equal(answer.outcome, 'conflict',
      'a zero-row commit must not adopt a row unless the exact stamp matches');
  } finally {
    database.close();
  }
});

test('committed-stage zero-row winner requires exact identity lane and stamp', async () => {
  const database = createCanonicalDatabase(':memory:');
  try {
    const repository = createRepository(database);
    const operation = createMembershipOperation('permit-commit-zero-identity',
      'mg-foundation-r4');
    await repository.persistNewOperation(operation);
    const owner = new ReplicaOperationMessageGroupMembershipPermitOwner(repository);
    const add = permit();
    await owner.authorizeLearner(operation.operationId,
      operation.messageGroupMembershipIdentity, add, 10_000);
    const anchored = {...add, permitState: 'anchored', proposalIndex: 10};
    const committed = {...anchored, permitState: 'committed'};
    const learner = committedMembership(operation, 'add_learner', 10, 10);
    const wrongIdentity = JSON.parse(operation.messageGroupMembershipIdentity);
    wrongIdentity.targetAddress = 'other-address';
    database.prepare(`UPDATE replica_operations SET
      message_group_membership_phase = 'learner_committed',
      message_group_membership_identity = ?,
      message_group_membership_permit = ?,
      message_group_learner_stamp = ?
      WHERE operation_id = ?`).run(JSON.stringify(wrongIdentity),
      encodeMessageGroupMembershipPermit(committed), JSON.stringify(learner),
      operation.operationId);
    const answer = await owner.recordCommittedStage(operation.operationId,
      operation.messageGroupMembershipIdentity, anchored,
      {settlementAppliedIndex: 10, committedMembership: learner});
    assert.equal(answer.outcome, 'conflict',
      'commit winner cannot adopt an exact stamp on a different identity');
  } finally {
    database.close();
  }
});

test('same-generation changed configuration and stale receipt cannot commit or release', async () => {
  const database = createCanonicalDatabase(':memory:');
  const repository = createRepository(database);
  const operation = createMembershipOperation('permit-stale-receipt',
    'mg-foundation-r4');
  await repository.persistNewOperation(operation);
  const owner = new ReplicaOperationMessageGroupMembershipPermitOwner(repository);
  const add = permit({leaderConfigurationStamp: {configurationKey: 'old-key',
    membershipGenerationIndex: 10}});
  await owner.authorizeLearner(operation.operationId,
    operation.messageGroupMembershipIdentity, add, 10_000);
  await owner.recordProposalAnchor(operation.operationId,
    operation.messageGroupMembershipIdentity, add, 10);
  const anchored = {...add, permitState: 'anchored', proposalIndex: 10};
  const stamp = committedMembership(operation, 'add_learner', 10, 10);
  assert.notEqual(stamp.configurationKey, 'old-key');
  assert.equal((await owner.recordCommittedStage(operation.operationId,
    operation.messageGroupMembershipIdentity, anchored,
    {settlementAppliedIndex: 10, committedMembership: stamp})).outcome,
  'conflict');
  assert.equal(database.prepare(`SELECT message_group_learner_stamp AS stamp
    FROM replica_operations WHERE operation_id = ?`).get(operation.operationId)
    .stamp, null);
  for (const settlementAppliedIndex of [-0, 9]) {
    assert.equal((await owner.recordCommittedStage(operation.operationId,
      operation.messageGroupMembershipIdentity, anchored,
      {settlementAppliedIndex, committedMembership: stamp})).outcome,
    'conflict');
  }
  database.close();
});

test('terminal-first lost answer is retained and the exact retry observes one release', async () => {
  const database = createCanonicalDatabase(':memory:');
  const controller = {authorityAvailable: true};
  const repository = createRepository(database, {loseNextUpdateAnswer: true,
    controller});
  const operation = createMembershipOperation('permit-terminal-first-lost',
    'mg-foundation-r4', {completedAt: 20, status: ReplicaStatus.FAILED,
      workflowStep: WORKFLOW_STEP.FAILED});
  await repository.persistNewOperation(operation);
  const owner = new ReplicaOperationMessageGroupMembershipPermitOwner(repository);
  const first = await owner.settleTerminalFirst(operation.operationId,
    operation.messageGroupMembershipIdentity);
  assert.equal(first.outcome, 'applied_unobserved');
  controller.authorityAvailable = true;
  const recovered = await owner.settleTerminalFirst(operation.operationId,
    operation.messageGroupMembershipIdentity);
  assert.equal(recovered.outcome, 'terminal_first');
  assert.equal(recovered.operation.messageGroupMembershipLaneKey, null);
  database.close();
});

test('authorized permit and terminal obligation survive a real SQLite restart', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'permit-restart-'));
  const dbPath = path.join(directory, 'replica-operations.sqlite');
  let database = createCanonicalDatabase(dbPath);
  try {
    let repository = createRepository(database);
    const operation = createMembershipOperation('permit-restart',
      'mg-foundation-r4');
    await repository.persistNewOperation(operation);
    const owner = new ReplicaOperationMessageGroupMembershipPermitOwner(
      repository);
    const authorized = await owner.authorizeLearner(operation.operationId,
      operation.messageGroupMembershipIdentity, permit(), 10_000);
    const terminal = {...authorized.operation,
      stepsHistory: [...authorized.operation.stepsHistory], completedAt: 55,
      updatedAt: 55, status: ReplicaStatus.FAILED,
      workflowStep: WORKFLOW_STEP.FAILED};
    await repository.persistOperationUpdate(terminal, {terminalTransition: true});
    database.close();
    database = createCanonicalDatabase(dbPath);
    repository = createRepository(database);
    const recovered = await repository.queryAuthoritativeOperationById(
      operation.operationId);
    assert.equal(recovered.messageGroupMembershipPermit,
      encodeMessageGroupMembershipPermit(permit()));
    assert.equal(recovered.messageGroupMembershipLaneKey, MEMBERSHIP_LANE_KEY);
    assert.equal(recovered.completedAt, 55);
  } finally {
    if (database.open) database.close();
    fs.rmSync(directory, {recursive: true, force: true});
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
      'messageGroupMembershipPermit',
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
