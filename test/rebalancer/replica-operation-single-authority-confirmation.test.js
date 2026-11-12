import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE, ReplicaOperationRepository} from
  '../../src/rebalancer/replica-operation-repository.js';
import {OPERATION_VISIBILITY_STATE, buildOperationVisibilityUnavailableError,
  buildUnavailableOperationVisibility} from
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
function fixture({localRow = operationRow(), durableRow = operationRow(), ownerAvailable = false,
  timeSource} = {}) {
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
    timeSource,
    cdcIntegrationService: cdc, controlPlaneSystemTableGateway: gateway,
    systemTableCache: {get: () => null, getAll: () => [], filter: () => []},
    authoritativeVisibilityTimeoutMs: 0, authoritativeVisibilityRetryDelayMs: 1,
    logger: {debug() {}, info() {}, warn() {}, error() {}}});
  return {state, reads, mutations, gateway, repository,
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
    {...UNAVAILABLE_ERROR, cause: failedMutation});
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

// These controls suspend the real repository's owner read. A witness is the
// exact cell in its existing Map, not the cloned public observation of it.
function holdOwnerRead(f, failure = null) {
  const started = Promise.withResolvers();
  const release = Promise.withResolvers();
  const read = f.gateway.readAuthoritativeRows;
  f.gateway.readAuthoritativeRows = async (...args) => {
    if (args[3]?.authoritativeReadMode === CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY) {
      return read(...args);
    }
    started.resolve();
    await release.promise;
    if (failure !== null) {
      f.reads.push({...args[3]});
      throw failure;
    }
    return read(...args);
  };
  return {started: started.promise, release: release.resolve};
}

for (const replaceWitness of [false, true]) {
  test(`a held confirmation read clears only its original witness: replacement=${replaceWitness}`, async (t) => {
    const f = fixture({ownerAvailable: true, localRow: null});
    f.repository.recordOwnerPersistedTransitionVisibilityWitness(f.operation);
    const original = f.repository.ownerPersistedTransitionVisibilityWitnesses.get(OPERATION_ID);
    const held = holdOwnerRead(f);
    const pending = f.repository.queryAuthoritativeOperationVisibilityObservation(OPERATION_ID, {
      authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      allowOwnerPersistedTransitionDeferredVisibility: true,
      expectedOperation: f.operation,
    });
    await held.started;
    if (replaceWitness) f.repository.recordOwnerPersistedTransitionVisibilityWitness({
      ...f.operation, updatedAt: 3000, completedAt: 3000,
    });
    const retained = f.repository.ownerPersistedTransitionVisibilityWitnesses.get(OPERATION_ID);
    held.release();
    const observation = await pending;
    t.equal(observation.state, OPERATION_VISIBILITY_STATE.PRESENT);
    t.equal(f.repository.ownerPersistedTransitionVisibilityWitnesses.get(OPERATION_ID),
      replaceWitness ? retained : undefined,
      'only the original, still-current witness can be settled by this read');
    if (replaceWitness) t.not(retained, original);
    t.equal(f.mutations.length, 0);
  });
}

test('confirmation finally cannot erase a witness acquired by its post-read observer', async (t) => {
  const f = fixture({ownerAvailable: true, localRow: null});
  let replacement = null;
  f.repository.logger.warn = () => {
    f.repository.recordOwnerPersistedTransitionVisibilityWitness({
      ...f.operation, updatedAt: 3000, completedAt: 3000,
    });
    replacement = f.repository.ownerPersistedTransitionVisibilityWitnesses.get(OPERATION_ID);
  };
  const result = await f.repository.confirmPersistenceThroughWitness(f.operation);
  t.equal(result.confirmationState, REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE.CONFIRMED);
  t.ok(replacement, 'the actual divergence observer ran after the accepted owner read');
  t.equal(f.repository.ownerPersistedTransitionVisibilityWitnesses.get(OPERATION_ID), replacement);
  t.equal(f.mutations.length, 0);
});

for (const replaceWitness of [false, true]) {
  test(`unavailable confirmation preserves its original cause and retained witness: replacement=${replaceWitness}`, async (t) => {
    const f = fixture({localRow: null});
    const failure = buildOperationVisibilityUnavailableError(
      buildUnavailableOperationVisibility({reasonCode: 'held_owner_unavailable', retryAfterMs: 25}),
      OPERATION_ID);
    const held = holdOwnerRead(f, failure);
    const pending = f.repository.confirmPersistenceThroughWitness(f.operation);
    await held.started;
    const original = f.repository.ownerPersistedTransitionVisibilityWitnesses.get(OPERATION_ID);
    if (replaceWitness) f.repository.recordOwnerPersistedTransitionVisibilityWitness({
      ...f.operation, updatedAt: 3000, completedAt: 3000,
    });
    const retained = f.repository.ownerPersistedTransitionVisibilityWitnesses.get(OPERATION_ID);
    held.release();
    let caught = null;
    try { await pending; } catch (error) { caught = error; }
    t.equal(caught, failure, 'the typed original owner refusal is propagated unchanged');
    t.equal(f.repository.ownerPersistedTransitionVisibilityWitnesses.get(OPERATION_ID), retained);
    t.ok(original, 'the actual persistence confirmation acquired its witness before the read');
    if (replaceWitness) t.not(retained, original);
    t.equal(f.mutations.length, 0);
  });
}

test('witness clearing without the exact expected cell has no deletion authority', async (t) => {
  const f = fixture();
  f.repository.recordOwnerPersistedTransitionVisibilityWitness(f.operation);
  const cell = f.repository.ownerPersistedTransitionVisibilityWitnesses.get(OPERATION_ID);
  const snapshot = f.repository.getOwnerPersistedTransitionVisibilityWitness(OPERATION_ID);
  t.not(snapshot, cell, 'the existing public snapshot stays independent of the retained cell');
  f.repository.clearOwnerPersistedTransitionVisibilityWitness(OPERATION_ID);
  t.equal(f.repository.ownerPersistedTransitionVisibilityWitnesses.get(OPERATION_ID), cell);
  f.repository.clearOwnerPersistedTransitionVisibilityWitness(OPERATION_ID, snapshot);
  t.equal(f.repository.ownerPersistedTransitionVisibilityWitnesses.get(OPERATION_ID), cell,
    'equal snapshot data is not release authority');
  f.repository.clearOwnerPersistedTransitionVisibilityWitness(OPERATION_ID, cell);
  t.equal(f.repository.ownerPersistedTransitionVisibilityWitnesses.has(OPERATION_ID), false,
    'the exact retained cell can still release itself');
});

test('one confirmation poll cannot add an inner retry clock when its owner is unavailable', async (t) => {
  const clock = new VirtualTimeSource({startMs: 5000});
  const f = fixture({localRow: null, timeSource: clock});
  f.gateway.readAuthoritativeRows = async (_table, _sql, _params, options) => {
    f.reads.push({...options});
    return {success: false, deferRetry: true, retryAfterMs: 1,
      errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED'};
  };
  let settled = false;
  const pending = f.repository.confirmReplicaOperationVisibility(f.operation).then((result) => {
    settled = true;
    return result;
  });
  await new Promise((resolve) => setImmediate(resolve));
  const beforeDrive = {settled, timers: clock.pendingTimerCount(), reads: f.reads.length};
  // Drain the old source's bounded inner clock so the red retains real custody.
  for (let step = 0; !settled && step < 20; step += 1) {
    clock.advance(100);
    await new Promise((resolve) => setImmediate(resolve));
  }
  t.equal(beforeDrive.settled, true, 'the zero-budget outer owner receives one immediate observation');
  t.equal(beforeDrive.timers, 0, 'the observation does not acquire a second retry delay');
  t.equal(beforeDrive.reads, 1);
  t.ok(settled, 'the original bounded attempt is drained before this control completes');
  if (settled) {
    const result = await pending;
    t.equal(result.confirmationState, REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE.DEFERRED);
  }
  t.equal(clock.pendingTimerCount(), 0);
});

test('a later unavailable owner poll is not converted to absence by an earlier mismatch', async (t) => {
  const clock = new VirtualTimeSource({startMs: 5000});
  const f = fixture({localRow: null, timeSource: clock});
  f.repository.replicaOperationAuthoritativeVisibilityTimeoutMs = 1;
  let ownerReads = 0;
  f.gateway.readAuthoritativeRows = async (_table, _sql, _params, options) => {
    f.reads.push({...options});
    if (options.authoritativeReadMode === CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY) {
      return {success: true, rows: []};
    }
    ownerReads += 1;
    return ownerReads === 1 ? {success: true, rows: [operationRow({
      status: ReplicaStatus.PENDING, workflow_step: WORKFLOW_STEP.PENDING,
      updated_at: 1000, completed_at: null,
    })]} : {success: false, error: 'the same owner became unavailable'};
  };
  const pending = f.repository.confirmReplicaOperationVisibility(f.operation);
  await new Promise((resolve) => setImmediate(resolve));
  t.equal(ownerReads, 1, 'the first canonical owner answered a different step');
  t.equal(clock.pendingTimerCount(), 1, 'the existing outer confirmation cadence owns the wait');
  clock.advance(1);
  const result = await pending;
  t.equal(result.confirmationState, REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE.DEFERRED);
  t.ok(result.deferredOutcome);
  t.equal(ownerReads, 2);
  t.equal(clock.pendingTimerCount(), 0);
});
