import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE, ReplicaOperationRepository} from
  '../../src/rebalancer/replica-operation-repository.js';
import {OPERATION_VISIBILITY_STATE} from
  '../../src/rebalancer/replica-operation-repository-operation-visibility.js';
import {runTerminalTransitionRepairAttempt} from
  '../../src/rebalancer/operation-workflow-terminal-transition-repair.js';

const OPERATION_ID = 'operation-single-authority';
const NODE_ID = 'operation-owner';
const UNAVAILABLE_ERROR = Object.freeze({
  visibilityState: OPERATION_VISIBILITY_STATE.UNAVAILABLE,
  deferRetry: true,
});

function operationRow(overrides = {}) {
  return {operation_id: OPERATION_ID, type: OperationType.ADD,
    partition_id: 'operation-partition', replica_id: 'operation-replica',
    source_node_id: NODE_ID, target_node_id: 'target-node',
    entity_type: SERVICE_TYPE.PARTITION, entity_id: 'operation-partition',
    status: ReplicaStatus.ACTIVE, workflow_step: WORKFLOW_STEP.ACTIVE,
    created_at: 1000, updated_at: 2000, completed_at: 2000,
    error_message: null,
    steps_history: JSON.stringify([{step: WORKFLOW_STEP.ACTIVE, timestamp: 2000}]),
    ...overrides};
}

// The repository is real. The gateway has separately declared local and
// owner rows, retains every requested authority and executes the canonical
// mutation shape against its one durable row. A local row is a deliberate
// competing answer; it cannot supply confirmation when the owner is absent.
function fixture({localRow = operationRow(), durableRow = operationRow(), ownerAvailable = false} = {}) {
  const state = {localRow, durableRow, ownerAvailable};
  const reads = [];
  const mutations = [];
  const gateway = {
    async readAuthoritativeRows(_table, _sql, _params, options = {}) {
      reads.push({...options});
      if (options.authoritativeReadMode === CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY) {
        return {success: true, rows: state.localRow ? [{...state.localRow}] : []};
      }
      // Supply the owner's answer independently of its requested mode token.
      // Recorded-call assertions below prove the one permitted RPC mode;
      // this keeps the old source's owner read engaged for the baseline.
      if (!state.ownerAvailable) {
        return {success: false, error: 'controlled operation owner unavailable'};
      }
      return {success: true, rows: state.durableRow ? [{...state.durableRow}] : []};
    },
    async submitMutation(mutation) {
      mutations.push(mutation);
      if (mutation.operation === 'insert') {
        const applied = state.durableRow === null;
        if (applied) state.durableRow = {...mutation.row};
        return {success: true, partitionResult: {affectedRows: applied ? 1 : 0}};
      }
      const applied = state.durableRow !== null && Object.entries(mutation.whereClause).every(
        ([field, value]) => state.durableRow[field] === value);
      if (applied) Object.assign(state.durableRow, mutation.data);
      return {success: true, partitionResult: {affectedRows: applied ? 1 : 0}};
    },
  };
  const cdc = {
    insertSystemTableRow: (tableName, row) => gateway.submitMutation({operation: 'insert', tableName, row}),
    updateSystemTableRow: (tableName, whereClause, data) =>
      gateway.submitMutation({operation: 'update', tableName, whereClause, data}),
  };
  gateway.cdcIntegrationService = cdc;
  const repository = new ReplicaOperationRepository({nodeId: NODE_ID,
    cdcIntegrationService: cdc, controlPlaneSystemTableGateway: gateway,
    systemTableCache: {get: () => null, getAll: () => [], filter: () => []},
    authoritativeVisibilityTimeoutMs: 0, authoritativeVisibilityRetryDelayMs: 1,
    logger: {debug() {}, info() {}, warn() {}, error() {}}});
  return {state, reads, mutations, repository,
    operation: repository.rowToOperation(operationRow())};
}

function assertOneOwnerRead(t, f) {
  t.same(f.reads.map((options) => options.authoritativeReadMode),
    [CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED],
    'one confirmation attempt observes only the canonical owner');
}

test('matching local operation cannot answer an unavailable owner confirmation', async (t) => {
  const f = fixture();
  const observation = await f.repository.queryReplicaOperationPersistenceAuthorityObservation(f.operation);
  t.equal(observation.state, OPERATION_VISIBILITY_STATE.UNAVAILABLE);
  t.equal(observation.operation, null);
  t.ok(observation.deferredOutcome, 'the unavailable answer retains its recovery meaning');
  assertOneOwnerRead(t, f);
  t.equal(f.mutations.length, 0);
});

test('confirmation loop retains owner unavailability despite a matching local row', async (t) => {
  const f = fixture();
  const confirmation = await f.repository.confirmReplicaOperationPersistence(f.operation);
  t.equal(confirmation.confirmationState, REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE.DEFERRED);
  t.equal(confirmation.operation, null);
  t.ok(confirmation.deferredOutcome);
  assertOneOwnerRead(t, f);
  t.equal(f.mutations.length, 0);
});

test('a confirmed empty owner is not replaced by a different local terminal row', async (t) => {
  const f = fixture({ownerAvailable: true, durableRow: null,
    localRow: operationRow({status: ReplicaStatus.FAILED, workflow_step: WORKFLOW_STEP.FAILED,
      updated_at: 2100, completed_at: 2100})});
  const observation = await f.repository.queryReplicaOperationPersistenceAuthorityObservation(f.operation);
  t.equal(observation.state, OPERATION_VISIBILITY_STATE.ABSENT);
  t.equal(observation.operation, null);
  assertOneOwnerRead(t, f);
  t.equal(f.mutations.length, 0, 'a read alone does not reinsert or settle an operation');
});

for (const local of ['matching', 'conflicting', 'absent']) {
  test(`unknown terminal authority refuses mutation without consuming ${local} local evidence`, async (t) => {
    const f = fixture({localRow: local === 'absent' ? null : operationRow(local === 'conflicting' ? {
      status: ReplicaStatus.FAILED, workflow_step: WORKFLOW_STEP.FAILED,
      completed_at: 2100, updated_at: 2100,
    } : {})});
    const original = structuredClone(f.operation);
    await t.rejects(f.repository.persistOperationUpdate(f.operation, {
      terminalTransition: true, confirmPersistence: false, returnDisposition: true,
    }), UNAVAILABLE_ERROR);
    t.equal(f.mutations.length, 0, 'unavailability neither grants a write nor adopts a local terminal');
    t.same(f.operation, original, 'the exact pending subject remains available for its owner retry');
    assertOneOwnerRead(t, f);
  });
}

test('zero-change resolution preserves unavailable authority without local success or reinsertion', async (t) => {
  const f = fixture();
  await t.rejects(f.repository.resolveZeroChangeOperationUpdate(f.operation, WORKFLOW_STEP.SENDING,
    {terminalTransition: true, resultOptions: {returnDisposition: true}}), UNAVAILABLE_ERROR);
  assertOneOwnerRead(t, f);
  t.equal(f.mutations.length, 0, 'unknown is neither idempotent success nor an INSERT permission');
});

test('retryable mutation recovery cannot certify a matching local operation', async (t) => {
  const f = fixture();
  const failedMutation = {success: false, error: 'controlled pressure refusal',
    errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED', deferRetry: true, retryAfterMs: 25};
  t.equal(f.repository.isRetryableOperationPersistError(failedMutation), true,
    'the actual retry recovery branch is engaged');
  await t.rejects(f.repository.recoverPersistedReplicaOperationMutation(f.operation, failedMutation),
    UNAVAILABLE_ERROR);
  assertOneOwnerRead(t, f);
  t.equal(f.mutations.length, 0);
});

function repairOwner(f) {
  const held = {projectedOperation: structuredClone(f.operation), attempt: 0};
  const owner = {repository: f.repository, isInitialized: true, isShuttingDown: false,
    terminalTransitionRepairStateByOperationId: new Map([[OPERATION_ID, held]]),
    terminalTransitionRepairTimerByOperationId: new Map(),
    logger: {debug() {}, info() {}, warn() {}, error() {}},
    cloneOperationSnapshot: (operation) => structuredClone(operation),
    clearTimeoutFn() {}, setTimeoutFn: (callback) => ({callback}),
    getOperationOwnerSingleFlightKey: (operationId) => `operation:${operationId}`,
    operationWorkflowRunExclusive: async (_key, callback) => callback()};
  return {owner, held};
}

test('terminal repair retains unknown work and heals through the same owner when it returns', async (t) => {
  const f = fixture();
  const {owner, held} = repairOwner(f);
  await t.rejects(runTerminalTransitionRepairAttempt(owner, OPERATION_ID), UNAVAILABLE_ERROR);
  t.equal(owner.terminalTransitionRepairStateByOperationId.get(OPERATION_ID), held);
  t.equal(f.mutations.length, 0, 'the failed authority attempt cannot reassert its projected terminal');
  assertOneOwnerRead(t, f);
  f.state.ownerAvailable = true;
  f.reads.length = 0;
  await runTerminalTransitionRepairAttempt(owner, OPERATION_ID);
  t.equal(owner.terminalTransitionRepairStateByOperationId.has(OPERATION_ID), false,
    'the original retained work clears only after owner-confirmed healing');
  t.ok(f.reads.length > 0);
  t.equal(f.reads.every((options) =>
    options.authoritativeReadMode === CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED), true);
  t.equal(f.mutations.length, 1, 'healing uses the existing guarded terminal UPDATE');
  t.equal(f.mutations[0].whereClause.completed_at, null,
    'the existing first-terminal-wins CAS remains intact');
  t.same(f.state.durableRow, operationRow());
});
