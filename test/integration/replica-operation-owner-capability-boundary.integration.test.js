/**
 * L0 RED witness for the replica_operations semantic-owner boundary.
 *
 * Each generic mutation uses the real ControlPlaneSystemTableGateway against a
 * fresh canonical SQLite table. At 82b54 the gateway admits the same protected
 * row that ReplicaOperationRepository owns. The assertions deliberately state
 * the target contract and therefore remain red until owner capability admission
 * exists. The owner call is made before each assertion so a failure cannot hide
 * whether the named owner still works after the generic attempt.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  SYSTEM_TABLE_NAME,
  getSchemaByTableName,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
  ControlPlaneSystemTableGateway,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {
  REPLICA_OPERATION_INSERT_DISPOSITION,
} from '../../src/rebalancer/replica-operation-insert-disposition.js';
import {
  ReplicaOperationRepository,
} from '../../src/rebalancer/replica-operation-repository.js';
import {
  REPLICA_OPERATION_UPDATE_DISPOSITION,
} from '../../src/rebalancer/replica-operation-update-disposition.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {withFoundingStamp} from
  '../partition/partition-founding-stamp.js';

const GROUP_ID = 'p4c-message-group';
const MEMBERSHIP_LANE_KEY = `message-group:${GROUP_ID}`;
const PARTITION_ID = 'replica_operations-p1';
const TEST_TIMEOUT_MS = 30_000;

function initializeEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'p4c-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
}

async function waitForLeader(partition) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (partition.getRole() === 'leader') return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('replica_operations-p1 did not elect its single-replica leader');
}

async function createWorld(root, name) {
  const replicaId = `${PARTITION_ID}-${name}-r1`;
  const partition = new PartitionService(withFoundingStamp({
    partitionId: PARTITION_ID,
    tableId: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    replicaId,
    replicaIds: [replicaId],
    nodeId: 'p4c-node',
    dbPath: path.join(root, name, `${replicaId}.db`),
    schema: getSchemaByTableName(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS),
  }));
  await partition.initialize();
  await waitForLeader(partition);
  const cdc = new CDCIntegrationService({nodeId: 'p4c-node'});
  cdc.initialize();
  cdc.setBootstrapMode(true, new Map([[replicaId, partition]]));
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'p4c-node',
    cdcIntegrationService: cdc,
    logger: {debug() {}, error() {}, info() {}, warn() {}},
  });
  // The production OWNER_RPC_REQUIRED read composition needs the surrounding
  // runtime router/provider graph. Keep this test-only read adapter explicit:
  // mutation still traverses the real gateway -> CDC -> PartitionService path.
  const repositoryGateway = {
    supportsMutationSubmission: () => true,
    resolveCdcIntegrationService: () => cdc,
    submitMutation: (...args) => gateway.submitMutation(...args),
    executeQuery: (...args) => gateway.executeQuery(...args),
    readRows: async (_tableName, sql, params = []) =>
      partition.executeLocalQuery(sql, params),
    readAuthoritativeRows: async (_tableName, sql, params = []) =>
      partition.executeLocalQuery(sql, params),
  };
  const repository = new ReplicaOperationRepository({
    nodeId: 'p4c-owner',
    systemTableCache: {
      get: () => null,
      getAll: () => [],
      filter: () => [],
    },
    cdcIntegrationService: {waitForCacheUpdate: async () => {}},
    controlPlaneSystemTableGateway: repositoryGateway,
    authoritativeVisibilityTimeoutMs: 25,
    authoritativeVisibilityRetryDelayMs: 1,
    logger: {debug() {}, error() {}, info() {}, warn() {}},
  });
  return {cdc, gateway, partition, repository};
}

function createMembershipOperation(operationId = 'p4c-operation') {
  return {
    operationId,
    type: OperationType.REPLACE,
    partitionId: GROUP_ID,
    entityType: SERVICE_TYPE.MESSAGE_GROUP,
    entityId: GROUP_ID,
    membershipPublicationEpoch: 17,
    sourceReplicaId: `${GROUP_ID}-r1`,
    replicaId: `${GROUP_ID}-r4`,
    targetClaimKey: null,
    sourceNodeId: 'source-node',
    targetNodeId: 'target-node',
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
      targetReplicaId: `${GROUP_ID}-r4`,
      targetPeerId: 44,
    }),
    messageGroupLearnerStamp: null,
    messageGroupVoterStamp: null,
    messageGroupRemovalStamp: null,
    messageGroupSourceLifecycleClaim: JSON.stringify({
      replicaId: `${GROUP_ID}-r1`,
      createdAt: 3,
      stateEnteredAt: 4,
      createAttemptToken: 'source-attempt-1',
    }),
  };
}

async function readRow(world, operationId) {
  const result = await world.partition.executeLocalQuery(
    'SELECT * FROM replica_operations WHERE operation_id = ?',
    [operationId],
  );
  return result.rows[0] || null;
}

async function closeWorld(world) {
  world.cdc.markShuttingDown();
  await world.partition.shutdown();
}

test('P4c owner INSERT keeps the exact membership tuple and unique lane',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    initializeEnvironment();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'replica-ops-p4c-'));
    const world = await createWorld(root, 'owner');
    const {repository} = world;
    try {
      const operation = createMembershipOperation('p4c-owner-positive');
      const inserted = await repository.persistNewOperation(operation, {
        returnDisposition: true,
      });
      const adoptedAfterLostAnswer = await repository.persistNewOperation(
        operation,
        {returnDisposition: true},
      );
      const conflicting = await repository.persistNewOperation(
        createMembershipOperation('p4c-owner-conflict'),
        {returnDisposition: true},
      );
      const row = await readRow(world, operation.operationId);
      assert.equal(inserted.disposition,
        REPLICA_OPERATION_INSERT_DISPOSITION.INSERTED);
      assert.equal(adoptedAfterLostAnswer.disposition,
        REPLICA_OPERATION_INSERT_DISPOSITION.EXISTING,
        'a retry adopts the exact durable row after an unobserved first answer');
      assert.equal(conflicting.disposition,
        REPLICA_OPERATION_INSERT_DISPOSITION.MEMBERSHIP_LANE_CONFLICT);
      assert.equal(conflicting.operation.operationId, operation.operationId,
        'the losing owner adopts the durable lane row');
      assert.equal(row.message_group_membership_identity,
        operation.messageGroupMembershipIdentity);
      assert.equal(row.message_group_source_lifecycle_claim,
        operation.messageGroupSourceLifecycleClaim);

      operation.status = ReplicaStatus.FAILED;
      operation.workflowStep = WORKFLOW_STEP.FAILED;
      operation.updatedAt = 20;
      operation.completedAt = 20;
      operation.errorMessage = 'terminal after membership intent';
      const terminal = await repository.persistOperationUpdate(operation, {
        terminalTransition: true,
      });
      assert.equal(terminal.disposition,
        REPLICA_OPERATION_UPDATE_DISPOSITION.APPLIED);
      const terminalRow = await readRow(world, operation.operationId);
      assert.equal(terminalRow.message_group_membership_lane_key,
        MEMBERSHIP_LANE_KEY);
      assert.equal(terminalRow.message_group_membership_obligation_state,
        'intent_recorded');
    } finally {
      await closeWorld(world);
      fs.rmSync(root, {recursive: true, force: true});
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('P4c generic whole-row INSERT is refused before the owner inserts',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    initializeEnvironment();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'replica-ops-p4c-'));
    const world = await createWorld(root, 'generic-insert');
    const {gateway, repository} = world;
    try {
      const operation = createMembershipOperation('p4c-generic-insert');
      const exactOwnerRow = repository.buildReplicaOperationRow(operation);
      const generic = await gateway.submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
        tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        row: exactOwnerRow,
      });
      const rowAfterGeneric = await readRow(world, operation.operationId);
      const owner = await repository.persistNewOperation(operation, {
        returnDisposition: true,
      });

      assert.deepEqual({
        genericAdmitted: generic.success === true && rowAfterGeneric !== null,
        ownerDisposition: owner.disposition,
      }, {
        genericAdmitted: false,
        ownerDisposition: REPLICA_OPERATION_INSERT_DISPOSITION.INSERTED,
      }, 'generic refusal must leave the byte-identical owner INSERT available');
    } finally {
      await closeWorld(world);
      fs.rmSync(root, {recursive: true, force: true});
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('P4c generic whole-row UPDATE is refused before owner workflow update',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    initializeEnvironment();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'replica-ops-p4c-'));
    const world = await createWorld(root, 'generic-update');
    const {gateway, repository} = world;
    try {
      const operation = createMembershipOperation('p4c-generic-update');
      await repository.persistNewOperation(operation, {returnDisposition: true});
      const destination = {
        ...repository.buildReplicaOperationRow(operation),
        status: ReplicaStatus.FAILED,
        workflow_step: WORKFLOW_STEP.FAILED,
        updated_at: 20,
        completed_at: 20,
        error_message: 'generic terminal overwrite',
      };
      const generic = await gateway.submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        whereClause: {operation_id: operation.operationId},
        data: destination,
      });
      const rowAfterGeneric = await readRow(world, operation.operationId);

      operation.status = ReplicaStatus.FAILED;
      operation.workflowStep = WORKFLOW_STEP.FAILED;
      operation.updatedAt = 20;
      operation.completedAt = 20;
      operation.errorMessage = 'owner terminal transition';
      const owner = await repository.persistOperationUpdate(operation, {
        terminalTransition: true,
      });

      assert.deepEqual({
        genericAdmitted: generic.success === true &&
          rowAfterGeneric?.workflow_step === WORKFLOW_STEP.FAILED,
        ownerSucceeded: owner === true || owner?.persisted === true ||
          owner?.disposition === REPLICA_OPERATION_UPDATE_DISPOSITION.APPLIED,
      }, {
        genericAdmitted: false,
        ownerSucceeded: true,
      }, 'generic refusal must leave the owner workflow transition available');
    } finally {
      await closeWorld(world);
      fs.rmSync(root, {recursive: true, force: true});
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });

test('P4c generic whole-row DELETE is refused and has no owner-positive prune',
  {timeout: TEST_TIMEOUT_MS}, async () => {
    initializeEnvironment();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'replica-ops-p4c-'));
    const world = await createWorld(root, 'generic-delete');
    const {gateway, repository} = world;
    try {
      const operation = createMembershipOperation('p4c-generic-delete');
      await repository.persistNewOperation(operation, {returnDisposition: true});
      const generic = await gateway.submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.DELETE,
        tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        whereClause: {operation_id: operation.operationId},
      });
      const rowAfterGeneric = await readRow(world, operation.operationId);

      assert.deepEqual({
        genericAdmitted: generic.success === true && rowAfterGeneric === null,
        ownerRowPresent: rowAfterGeneric !== null,
      }, {
        genericAdmitted: false,
        ownerRowPresent: true,
      }, 'the owner row must remain; no semantic prune API exists');
    } finally {
      await closeWorld(world);
      fs.rmSync(root, {recursive: true, force: true});
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  });
