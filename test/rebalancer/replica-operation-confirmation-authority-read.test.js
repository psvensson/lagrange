import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {ReplicaOperationRepository} from '../../src/rebalancer/replica-operation-repository.js';
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
    cdcIntegrationService: {waitForCacheUpdate: async () => {}},
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
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED_SQL_FALLBACK
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
      readModes.includes(
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED_SQL_FALLBACK,
      ),
      'a stale local confirmation must escalate to the ledger authority',
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
      readModes.includes(
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED_SQL_FALLBACK,
      ),
      'an empty local confirmation must escalate to the ledger authority',
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
      readModes.includes(
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED_SQL_FALLBACK,
      ),
      'the no-weakening case should still prove it checked the authority',
    );
  },
);

test(
  'a failed escalated read must not erase local terminal-conflict evidence',
  async (t) => {
    const readModes = [];
    const projectedRow = makeRow({operation_id: 'op-conflict-guard-read-fail'});
    // A DIFFERENT durable terminal state already won locally.
    const conflictingLocalRow = makeRow({
      operation_id: projectedRow.operation_id,
      status: 'failed',
      workflow_step: WORKFLOW_STEP.FAILED,
      updated_at: TEST_TERMINAL_AT_MS + 1,
      completed_at: TEST_TERMINAL_AT_MS + 1,
    });
    const repository = createRepository(async (_tableName, _sql, _params, options = {}) => {
      readModes.push(options.authoritativeReadMode);
      if (
        options.authoritativeReadMode ===
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY
      ) {
        return {success: true, rows: [conflictingLocalRow]};
      }
      // Escalated read is unreachable (pressure-deferred / transport failure).
      return {success: false, rows: [], error: 'Message timeout'};
    });
    const projectedOperation = repository.rowToOperation(projectedRow);

    const rejected =
      await repository.shouldRejectConflictingTerminalTransitionMutation(
        projectedOperation,
      );

    t.equal(
      rejected,
      true,
      'a locally visible different terminal row must reject even when the escalated read fails',
    );
    t.ok(
      readModes.includes(
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED_SQL_FALLBACK,
      ),
      'the guard escalated before falling back to local evidence',
    );
  },
);

test(
  'the escalated confirmation read is pinned to the ledger authority leader',
  async (t) => {
    const escalatedReads = [];
    const terminalRow = makeRow({operation_id: 'op-leader-pin'});
    const repository = createRepository(async (_tableName, _sql, _params, options = {}) => {
      if (
        options.authoritativeReadMode ===
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY
      ) {
        return {success: true, rows: []};
      }
      escalatedReads.push(options);
      return {success: true, rows: [terminalRow]};
    });
    const projectedOperation = repository.rowToOperation(terminalRow);
    const owner = createRepairOwner(repository, projectedOperation);

    await runTerminalTransitionRepairAttempt(owner, projectedOperation.operationId);

    t.ok(escalatedReads.length > 0, 'the escalated read must run');
    t.ok(
      escalatedReads.every((options) => options.preferOwnerRpcReadLeader === true),
      'every escalated read must pin to the partition leader so a self-stale replica cannot serve it',
    );
  },
);
