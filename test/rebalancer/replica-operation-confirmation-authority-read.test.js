import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {ReplicaOperationRepository} from '../../src/rebalancer/replica-operation-repository.js';
import {OPERATION_VISIBILITY_STATE} from
  '../../src/rebalancer/replica-operation-repository-operation-visibility.js';
import {
  REPLICA_OPERATION_UPDATE_DISPOSITION,
} from '../../src/rebalancer/replica-operation-update-disposition.js';
import {
  CREATE_ADMISSION_ERROR_CODE,
  CREATE_ADMISSION_STATE,
  ReplicaCreateAdmissionOwner,
} from '../../src/node/replica-create-admission-owner.js';
import {
  buildReplicaCreateAdmissionToken,
  buildReplicaCreateAttemptToken,
} from '../../src/rebalancer/replica-create-admission-token.js';
import {
  runTerminalTransitionRepairAttempt,
} from '../../src/rebalancer/operation-workflow-terminal-transition-repair.js';

const TEST_NODE_ID = 'node-a';
const TEST_TARGET_NODE_ID = 'node-b';
const TEST_OPERATION_ID = 'op-confirm-authority';
const TEST_PARTITION_ID = 'replica_operations-p1';
const TEST_REPLICA_ID = 'replica_operations-p1-r5';
const TEST_CREATED_AT_MS = 1_000;
const TEST_TERMINAL_AT_MS = 2_000;
const TEST_RETRY_DELAY_MS = 1;
const TEST_VISIBILITY_TIMEOUT_MS = 0;
const TEST_OWNER_KEY_PREFIX = 'operation-owner';

function makeRow(overrides = {}) {
  return {
    operation_id: TEST_OPERATION_ID,
    type: OperationType.ADD,
    partition_id: TEST_PARTITION_ID,
    replica_id: TEST_REPLICA_ID,
    source_node_id: TEST_NODE_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    status: ReplicaStatus.ACTIVE,
    workflow_step: WORKFLOW_STEP.ACTIVE,
    created_at: TEST_CREATED_AT_MS,
    updated_at: TEST_TERMINAL_AT_MS,
    completed_at: TEST_TERMINAL_AT_MS,
    error_message: null,
    steps_history: JSON.stringify([
      {step: WORKFLOW_STEP.ACTIVE, timestamp: TEST_TERMINAL_AT_MS},
    ]),
    entity_type: SERVICE_TYPE.PARTITION,
    entity_id: TEST_PARTITION_ID,
    ...overrides,
  };
}

function createRepository(readAuthoritativeRows) {
  const gateway = {
    readAuthoritativeRows,
    executeQuery: async () => ({success: true, changes: 1}),
  };
  return new ReplicaOperationRepository({
    nodeId: TEST_NODE_ID,
    systemTableCache: {
      get: () => null,
      getAll: () => [],
      filter: () => [],
    },
    cdcIntegrationService: {},
    controlPlaneSystemTableGateway: gateway,
    authoritativeVisibilityTimeoutMs: TEST_VISIBILITY_TIMEOUT_MS,
    authoritativeVisibilityRetryDelayMs: TEST_RETRY_DELAY_MS,
    logger: {info() {}, warn() {}, error() {}, debug() {}},
  });
}

function cloneOperation(operation) {
  return {
    ...operation,
    stepsHistory: Array.isArray(operation.stepsHistory) ?
      operation.stepsHistory.map((entry) => ({...entry})) :
      [],
  };
}

function createRepairOwner(repository, projectedOperation) {
  const stateByOperationId = new Map([
    [
      projectedOperation.operationId,
      {
        projectedOperation: cloneOperation(projectedOperation),
        attempt: 0,
      },
    ],
  ]);
  return {
    repository,
    isInitialized: true,
    isShuttingDown: false,
    terminalTransitionRepairStateByOperationId: stateByOperationId,
    terminalTransitionRepairTimerByOperationId: new Map(),
    logger: {info() {}, warn() {}, error() {}, debug() {}},
    cloneOperationSnapshot: cloneOperation,
    clearTimeoutFn: () => {},
    setTimeoutFn: () => ({armed: true}),
    getOperationOwnerSingleFlightKey(operationId) {
      return `${TEST_OWNER_KEY_PREFIX}:${operationId}`;
    },
    async operationWorkflowRunExclusive(_key, callback) {
      return callback();
    },
  };
}

function makeReadRouter({localRows, authorityRows, readModes}) {
  return async (_tableName, _sql, _params, options = {}) => {
    readModes.push(options.authoritativeReadMode);
    if (
      options.authoritativeReadMode ===
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY
    ) {
      return {success: true, rows: localRows};
    }
    if (
      options.authoritativeReadMode ===
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED
    ) {
      return {success: true, rows: authorityRows};
    }
    return {success: true, rows: []};
  };
}

test(
  'terminal repair confirms through authority when the local ledger row is stale',
  async (t) => {
    const readModes = [];
    const terminalRow = makeRow();
    const staleLocalRow = makeRow({
      status: ReplicaStatus.PENDING,
      workflow_step: WORKFLOW_STEP.PENDING,
      updated_at: TEST_CREATED_AT_MS,
      completed_at: null,
    });
    const repository = createRepository(makeReadRouter({
      localRows: [staleLocalRow],
      authorityRows: [terminalRow],
      readModes,
    }));
    const projectedOperation = repository.rowToOperation(terminalRow);
    const owner = createRepairOwner(repository, projectedOperation);

    await runTerminalTransitionRepairAttempt(owner, projectedOperation.operationId);

    t.equal(
      owner.terminalTransitionRepairStateByOperationId.has(projectedOperation.operationId),
      false,
      'authority-confirmed terminal visibility should clear the retained repair state',
    );
    t.ok(
      readModes.length > 0 && readModes.every((mode) =>
        mode === CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED),
      'every confirmation observes the ledger authority despite the stale local row',
    );
  },
);

test(
  'terminal repair confirms through authority when no local ledger row exists',
  async (t) => {
    const readModes = [];
    const terminalRow = makeRow({operation_id: 'op-confirm-authority-missing-local'});
    const repository = createRepository(makeReadRouter({
      localRows: [],
      authorityRows: [terminalRow],
      readModes,
    }));
    const projectedOperation = repository.rowToOperation(terminalRow);
    const owner = createRepairOwner(repository, projectedOperation);

    await runTerminalTransitionRepairAttempt(owner, projectedOperation.operationId);

    t.equal(
      owner.terminalTransitionRepairStateByOperationId.has(projectedOperation.operationId),
      false,
      'missing local ledger visibility should not strand a confirmed authority row',
    );
    t.ok(
      readModes.length > 0 && readModes.every((mode) =>
        mode === CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED),
      'every confirmation observes the ledger authority when the local row is absent',
    );
  },
);

test(
  'terminal repair remains unconfirmed when the ledger authority lacks the row',
  async (t) => {
    const readModes = [];
    const terminalRow = makeRow({operation_id: 'op-confirm-authority-absent'});
    const staleLocalRow = makeRow({
      operation_id: terminalRow.operation_id,
      status: ReplicaStatus.PENDING,
      workflow_step: WORKFLOW_STEP.PENDING,
      updated_at: TEST_CREATED_AT_MS,
      completed_at: null,
    });
    const repository = createRepository(makeReadRouter({
      localRows: [staleLocalRow],
      authorityRows: [],
      readModes,
    }));
    const projectedOperation = repository.rowToOperation(terminalRow);
    const owner = createRepairOwner(repository, projectedOperation);

    await runTerminalTransitionRepairAttempt(owner, projectedOperation.operationId);

    t.equal(
      owner.terminalTransitionRepairStateByOperationId.has(projectedOperation.operationId),
      true,
      'missing authority rows must keep repair armed instead of claiming success',
    );
    t.ok(
      readModes.length > 0 && readModes.every((mode) =>
        mode === CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED),
      'the no-weakening case observes only the canonical owner',
    );
  },
);

test(
  'unavailable terminal authority retains the pending subject until the owner confirms its winner',
  async (t) => {
    const readModes = [];
    const projectedRow = makeRow({operation_id: 'op-conflict-guard-read-fail'});
    // The local projection says a different terminal won. Only the owner
    // can establish that conflict; unavailability grants no terminal write.
    const conflictingLocalRow = makeRow({
      operation_id: projectedRow.operation_id,
      status: 'failed',
      workflow_step: WORKFLOW_STEP.FAILED,
      updated_at: TEST_TERMINAL_AT_MS + 1,
      completed_at: TEST_TERMINAL_AT_MS + 1,
    });
    let ownerAvailable = false;
    const repository = createRepository(async (_tableName, _sql, _params, options = {}) => {
      readModes.push(options.authoritativeReadMode);
      if (
        options.authoritativeReadMode ===
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY
      ) {
        return {success: true, rows: [conflictingLocalRow]};
      }
      return ownerAvailable ? {success: true, rows: [conflictingLocalRow]} :
        {success: false, rows: [], error: 'Message timeout'};
    });
    const projectedOperation = repository.rowToOperation(projectedRow);
    const retained = cloneOperation(projectedOperation);

    await t.rejects(
      repository.shouldRejectConflictingTerminalTransitionMutation(
        projectedOperation,
      ),
      {visibilityState: OPERATION_VISIBILITY_STATE.UNAVAILABLE, deferRetry: true},
      'unknown authority is a typed refusal, never a false conflict guard or local adoption',
    );
    t.same(projectedOperation, retained, 'the pending subject is unchanged while its owner is unavailable');
    t.same(readModes, [CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED]);
    ownerAvailable = true;
    readModes.length = 0;
    t.equal(await repository.shouldRejectConflictingTerminalTransitionMutation(projectedOperation), true,
      'the original conflict rejection remains when the same owner confirms the winner',
    );
    t.same(readModes, [CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED]);
  },
);

test(
  'every confirmation read is pinned to the ledger authority leader',
  async (t) => {
    const ownerReads = [];
    const terminalRow = makeRow({operation_id: 'op-leader-pin'});
    const repository = createRepository(async (_tableName, _sql, _params, options = {}) => {
      ownerReads.push(options);
      return {success: true, rows: [terminalRow]};
    });
    const projectedOperation = repository.rowToOperation(terminalRow);
    const owner = createRepairOwner(repository, projectedOperation);

    await runTerminalTransitionRepairAttempt(owner, projectedOperation.operationId);

    t.ok(ownerReads.length > 0, 'the owner read must run');
    t.ok(
      ownerReads.every((options) =>
        options.authoritativeReadMode === CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED &&
        options.leaderMode === CONTROL_PLANE_READ_LEADER_MODE.PREFERRED),
      'every confirmation keeps the declared owner and partition leader requirement',
    );
  },
);

test(
  'composed workflow UPDATE confirmation and CREATE admission progression preserve both write visibility and physical permission boundaries',
  async (t) => {
    const admissionToken = buildReplicaCreateAdmissionToken({
      operationId: TEST_OPERATION_ID,
      operationType: OperationType.ADD,
      entityType: SERVICE_TYPE.PARTITION,
      entityId: TEST_PARTITION_ID,
      partitionId: TEST_PARTITION_ID,
      replicaId: TEST_REPLICA_ID,
      targetNodeId: TEST_TARGET_NODE_ID,
      workflowUpdatedAt: TEST_CREATED_AT_MS,
    });
    const attemptToken = buildReplicaCreateAttemptToken(admissionToken, 1);
    let authoritativeRow = makeRow({
      status: ReplicaStatus.PENDING,
      workflow_step: WORKFLOW_STEP.SENDING,
      updated_at: TEST_CREATED_AT_MS,
      completed_at: null,
      create_admission_state: null,
      create_admission_token: null,
      create_admission_replica_created_at: null,
      create_admission_attempt_token: null,
      create_admission_previous_attempt_token: null,
      create_admission_attempt_seq: null,
      create_admission_workflow_updated_at: null,
      create_admission_owner_incarnation: null,
    });
    let admissionOwner = null;
    let claimedEvidence = null;

    const sharedGateway = {
      readAuthoritativeRows: async (tableName) => {
        if (tableName === 'nodes') {
          return {
            success: true,
            rows: [{node_id: TEST_TARGET_NODE_ID, boot_incarnation: 1}],
          };
        }
        return {
          success: true,
          rows: [{...authoritativeRow}],
        };
      },
      updateSystemTableRow: async (_table, whereClause, data) => {
        const matches = Object.entries(whereClause).every(([col, val]) =>
          (authoritativeRow[col] ?? null) === val);
        if (!matches) {
          return {success: true, changes: 0, partitionResult: {affectedRows: 0}};
        }
        authoritativeRow = {...authoritativeRow, ...data};
        return {success: true, changes: 1, partitionResult: {affectedRows: 1}};
      },
      submitMutation: async (mutation) => {
        const data = mutation?.data || {};
        authoritativeRow = {...authoritativeRow, ...data};
        // Before the workflow writer's confirmation read runs, the actual
        // ReplicaCreateAdmissionOwner advances ADMITTED -> MATERIALIZED.
        if (admissionOwner && claimedEvidence) {
          claimedEvidence = await admissionOwner.markMaterialized(claimedEvidence);
        }
        return {success: true, partitionResult: {affectedRows: 1}};
      },
      cdcIntegrationService: {
        insertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async () => ({success: true}),
      },
    };

    admissionOwner = new ReplicaCreateAdmissionOwner({
      nodeId: TEST_TARGET_NODE_ID,
      ownerIncarnation: 1,
      gateway: sharedGateway,
    });
    claimedEvidence = await admissionOwner.claim({
      operationId: TEST_OPERATION_ID,
      operationType: OperationType.ADD,
      entityType: SERVICE_TYPE.PARTITION,
      entityId: TEST_PARTITION_ID,
      partitionId: TEST_PARTITION_ID,
      replicaId: TEST_REPLICA_ID,
      targetNodeId: TEST_TARGET_NODE_ID,
      admissionToken,
      workflowUpdatedAt: TEST_CREATED_AT_MS,
      attemptToken,
      attemptSeq: 1,
    });
    t.equal(
      claimedEvidence?.admissionState,
      CREATE_ADMISSION_STATE.ADMITTED,
      'admission owner claims ADMITTED on the shared row',
    );

    const repository = new ReplicaOperationRepository({
      nodeId: TEST_NODE_ID,
      systemTableCache: {get: () => null, getAll: () => [], filter: () => []},
      cdcIntegrationService: {},
      controlPlaneSystemTableGateway: sharedGateway,
      authoritativeVisibilityTimeoutMs: TEST_VISIBILITY_TIMEOUT_MS,
      authoritativeVisibilityRetryDelayMs: TEST_RETRY_DELAY_MS,
      logger: {info() {}, warn() {}, error() {}, debug() {}},
    });
    const callerSnapshot = repository.rowToOperation({...authoritativeRow});
    const workflowUpdate = {
      ...callerSnapshot,
      status: ReplicaStatus.SYNCING,
      workflowStep: WORKFLOW_STEP.SYNCING,
      updatedAt: TEST_TERMINAL_AT_MS,
    };

    const updateResult = await repository.persistOperationUpdate(
      workflowUpdate,
      {returnDisposition: true, disableSystemWriteSession: true},
    );
    t.equal(updateResult.persisted, true, 'workflow UPDATE confirms despite concurrent admission progression');
    t.equal(
      updateResult.disposition,
      REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED,
      'workflow UPDATE reports UPDATED disposition',
    );
    t.equal(
      claimedEvidence?.admissionState,
      CREATE_ADMISSION_STATE.MATERIALIZED,
      'admission owner concurrently advanced to MATERIALIZED',
    );

    // Stale admission work still receives no physical permission from the admission owner.
    const staleEvidence = {
      ...claimedEvidence,
      admissionToken: `${admissionToken}-stale`,
    };
    await t.rejects(
      admissionOwner.markProgress(staleEvidence, CREATE_ADMISSION_STATE.ACTIVE),
      {code: CREATE_ADMISSION_ERROR_CODE.STALE},
      'stale admission token still receives no permission from ReplicaCreateAdmissionOwner',
    );
  },
);

test(
  'operation visibility permits legitimate membership-lane release and rejects negative identity controls',
  async (t) => {
    const repository = createRepository(async () => ({success: true, rows: []}));
    const baseExpected = repository.rowToOperation(makeRow({
      type: OperationType.REPLACE,
      status: ReplicaStatus.SYNCING,
      workflow_step: WORKFLOW_STEP.SYNCING,
      updated_at: TEST_TERMINAL_AT_MS,
      completed_at: null,
      source_replica_id: 'mg-p1-r1',
      message_group_membership_lane_key: 'message-group:mg-p1',
      message_group_membership_phase: 'source_removal_proposal_in_flight',
      message_group_membership_obligation_state: 'unknown',
      message_group_membership_identity: '{"groupId":"mg-p1"}',
      create_admission_state: CREATE_ADMISSION_STATE.ADMITTED,
      create_admission_token: 'adm-token-1',
      create_admission_attempt_seq: 2,
    }));

    const releasedMembershipObserved = {
      ...baseExpected,
      messageGroupMembershipLaneKey: null,
      messageGroupMembershipPhase: 'source_removed',
      messageGroupMembershipObligationState: 'settled',
      messageGroupRemovalStamp: '{"term":2}',
    };
    t.equal(
      repository.isReplicaOperationVisibilitySatisfied(
        baseExpected,
        releasedMembershipObserved,
      ),
      true,
      'legitimate membership-lane release to NULL with settled obligation satisfies visibility',
    );

    const negativeCases = [
      ['different operationId', {...baseExpected, operationId: 'op-other'}],
      ['different replicaId', {...baseExpected, replicaId: 'r-other'}],
      ['different workflowStep', {...baseExpected, workflowStep: WORKFLOW_STEP.CREATING}],
      ['different status', {...baseExpected, status: ReplicaStatus.CREATING}],
      ['older workflow updatedAt', {...baseExpected, updatedAt: TEST_TERMINAL_AT_MS - 1}],
      ['different admission token', {...baseExpected, createAdmissionToken: 'adm-other'}],
      ['lower admission attemptSeq', {...baseExpected, createAdmissionAttemptSeq: 1}],
      ['different sourceReplicaId', {...baseExpected, sourceReplicaId: 'mg-p1-r9'}],
      ['different membership identity', {...baseExpected, messageGroupMembershipIdentity: '{"groupId":"other"}'}],
      [
        'unsettled cleared membership lane key',
        {
          ...baseExpected,
          messageGroupMembershipLaneKey: null,
          messageGroupMembershipObligationState: 'unknown',
        },
      ],
    ];
    for (const [label, observed] of negativeCases) {
      t.equal(
        repository.isReplicaOperationVisibilitySatisfied(baseExpected, observed),
        false,
        `visibility rejects ${label}`,
      );
    }

    const pendingExpected = {
      ...baseExpected,
      workflowStep: WORKFLOW_STEP.PENDING,
      status: ReplicaStatus.PENDING,
    };
    t.equal(
      repository.isReplicaOperationVisibilitySatisfied(pendingExpected, {
        ...pendingExpected,
        createAdmissionState: CREATE_ADMISSION_STATE.MATERIALIZED,
      }),
      false,
      'initial PENDING comparison remains strict on admission fields',
    );
  },
);

test(
  'losing terminal write adopts earlier winner updatedAt so subsequent visibility check accepts the winner',
  async (t) => {
    const earlierWinnerRow = makeRow({
      status: ReplicaStatus.ACTIVE,
      workflow_step: WORKFLOW_STEP.ACTIVE,
      updated_at: TEST_CREATED_AT_MS,
      completed_at: TEST_CREATED_AT_MS,
    });
    const repository = createRepository(async () => ({
      success: true,
      rows: [earlierWinnerRow],
    }));
    const losingProjection = {
      ...repository.rowToOperation(earlierWinnerRow),
      status: ReplicaStatus.FAILED,
      workflowStep: WORKFLOW_STEP.FAILED,
      updatedAt: TEST_TERMINAL_AT_MS + 5_000,
      completedAt: TEST_TERMINAL_AT_MS + 5_000,
      errorMessage: 'late losing failure',
    };

    const result = await repository.persistOperationUpdate(losingProjection, {
      terminalTransition: true,
      returnDisposition: true,
    });
    t.equal(
      result.disposition,
      REPLICA_OPERATION_UPDATE_DISPOSITION.TERMINAL_ADOPTED,
      'losing writer reports TERMINAL_ADOPTED',
    );
    t.equal(
      losingProjection.updatedAt,
      TEST_CREATED_AT_MS,
      'losing projection adopts the winning terminal updatedAt timestamp',
    );
    t.equal(
      repository.isReplicaOperationVisibilitySatisfied(
        losingProjection,
        repository.rowToOperation(earlierWinnerRow),
      ),
      true,
      'adopted projection accepts the earlier winning row through the timestamp floor check',
    );
  },
);
