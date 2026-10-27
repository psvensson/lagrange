// One applied startup observation and exact per-creation continuations. U1 v3
// and its addenda supersede the last-row-wins memo of recovery revisions 1-5.
import {ReplicaOperationResponseStatus as REPLY} from
  '../rebalancer/replica-operation-constants.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {SERVICE_INSTANCE_OUTCOME as OUTCOME} from '../constants/service-instance.js';
import {CONSENSUS_CREATION_RESULT as CREATION} from
  '../service/service-consensus-creation-intent.js';
import {captureRetainedCreationOrigin} from '../service/service-consensus-creation-origin.js';
import {WASM_CREATION_LOCAL_INSPECTION as LOCAL} from '../wasm-service/wasm-creation-opening.js';
import {scheduleBoundReentry, scheduleRetiredCreation, resumeHeldMemoWake} from
  './runtime-service-bound-creation-route.js';
import {replicaExecution, retainedCreationPlan, matchesCreationRequest,
  executionRefusal, inProgressReply, executionForRequest} from './runtime-service-creation-execution.js';
import {RUNTIME_SERVICE_CREATION_MEMO as MEMO,
  RUNTIME_SERVICE_RESTART_ACTION as ACTION, RUNTIME_SERVICE_RESTART_PLAN_STATE as STATE,
  RUNTIME_SERVICE_HANDLER_ERROR_MSG as ERROR,
  RUNTIME_SERVICE_HANDLER_LOG_MSG as LOG} from './runtime-service-handler-constants.js';

const RESTART_MEMO = Object.freeze({[ACTION.REENTER]: ReplicaStatus.HELD,
  [ACTION.REDRIVE]: ReplicaStatus.REMOVING});
const SKIP_GENERIC_ROWS = Object.freeze({resolveServiceContext: () => null});

function createRestartLatch(engaged) {
  const latch = Promise.withResolvers();
  let open = !engaged;
  let closed = false;
  if (open) latch.resolve();
  return {ready: latch.promise, isReady: () => open && !closed,
    open: () => {
      if (closed) return;
      open = true;
      latch.resolve();
    },
    close: () => {
      closed = true;
      open = false;
    }};
}

function notReadyReply(handler) {
  const reason = handler.stopped ? ERROR.HANDLER_STOPPED : ERROR.NOT_READY;
  return {status: REPLY.ERROR, error: reason, errorCode: reason,
    deferRetry: true, nodeId: handler.nodeId};
}

function stoppedInventory() {
  return {outcome: OUTCOME.UNAVAILABLE, reason: ERROR.HANDLER_STOPPED};
}

function nodeEntries(handler, results) {
  const entries = [];
  for (const entry of results) {
    if (entry?.status !== CREATION.INVENTORIED) continue;
    if (entry.reentry === false) {
      handler.logger.error(LOG.RESTART_ENTRY_UNREADABLE, {operationId: entry.operationId,
        outcome: entry.outcome, nodeId: handler.nodeId});
    } else if (entry.nodeId === handler.nodeId) {
      entries.push(entry);
    }
  }
  return entries;
}

async function planEntry(handler, entry) {
  const origin = captureRetainedCreationOrigin(entry);
  const local = entry.outcome === undefined ?
    await handler.serviceLifecycleManager.inspectRetainedCreation({consensusCreation: {
      ...origin, opening: entry.opening}}) : {outcome: entry.outcome};
  return {creation: {operationId: origin.operationId, entityId: origin.intent.descriptor.serviceId,
    replicaId: origin.intent.consensusSlotRequest.replicaId}, origin,
  rowState: entry.rowState, opening: entry.opening, local: local?.outcome ?? OUTCOME.UNKNOWN,
  inspection: local, action: local?.outcome === LOCAL.RETIRED ? ACTION.REDRIVE : ACTION.REENTER,
  state: STATE.INITIAL, queued: false, wakePending: false, journalComplete: false};
}

function applyMemos(handler, plans) {
  const groups = new Map();
  for (const plan of plans) {
    const key = plan.creation.replicaId;
    const group = groups.get(key) ?? [];
    group.push(plan);
    groups.set(key, group);
  }
  for (const [replicaId, group] of groups) {
    const first = group[0];
    const memo = {replicaId, entityId: first.creation.entityId};
    handler.localReplicas.set(replicaId, group.length === 1 ? {...memo,
      status: RESTART_MEMO[first.action], operationId: first.creation.operationId,
      origin: first.origin} : {...memo, status: MEMO.CONTINUATION_PENDING});
  }
}

function startRestartPlan(handler, plan) {
  if (handler.stopped || plan.state === STATE.SETTLED || plan.state === STATE.RUNNING) return;
  if (replicaExecution(handler, plan.creation.replicaId) !== undefined) {
    plan.queued = true;
    return;
  }
  if (plan.action === ACTION.REDRIVE) scheduleRetiredCreation(handler, plan);
  else scheduleBoundReentry(handler, plan.creation, plan);
}

function resumeRestartPlans(handler, replicaId) {
  if (handler.stopped) return;
  if (handler.restartTask?.applied === true) {
    for (const plan of handler.restartTask.plansById.values()) {
      if (plan.creation.replicaId === replicaId && plan.queued) startRestartPlan(handler, plan);
    }
  }
  resumeHeldMemoWake(handler, replicaId);
}

function retryRetiredPlans(handler, replicaId) {
  if (handler.stopped || handler.restartTask?.applied !== true) return;
  for (const plan of handler.restartTask.plansById.values()) {
    if (plan.creation.replicaId === replicaId && plan.action === ACTION.REDRIVE &&
        plan.state !== STATE.SETTLED && plan.state !== STATE.RUNNING) {
      plan.queued = true;
    }
  }
  resumeRestartPlans(handler, replicaId);
}

function replyToRestartPlan(handler, params) {
  const plan = retainedCreationPlan(handler, params.operationId);
  if (plan === undefined) return undefined;
  if (!matchesCreationRequest(handler, plan.origin, params)) {
    return executionRefusal(handler, OUTCOME.CONTENT_CONFLICT, false);
  }
  const requestEntry = executionForRequest(handler, params.operationId);
  if (requestEntry !== undefined && (requestEntry.plan !== plan ||
      requestEntry.operationId !== params.operationId)) {
    return executionRefusal(handler, OUTCOME.CONTENT_CONFLICT, false);
  }
  if (plan.journalComplete) {
    return scheduleBoundReentry(handler, params, plan) ?
      inProgressReply(handler, params.replicaId) : executionRefusal(handler);
  }
  startRestartPlan(handler, plan);
  return plan.action === ACTION.REDRIVE ? executionRefusal(handler) :
    inProgressReply(handler, params.replicaId);
}

async function inventoryAttempt(handler, task) {
  const results = await handler.serviceLifecycleManager.recoverPendingOperations(SKIP_GENERIC_ROWS);
  if (handler.stopped || handler.restartTask !== task) return stoppedInventory();
  const plans = [];
  for (const entry of nodeEntries(handler, results)) {
    plans.push(await planEntry(handler, entry));
    if (handler.stopped || handler.restartTask !== task) return stoppedInventory();
  }
  applyMemos(handler, plans);
  task.plansById = new Map(plans.map((plan) => [plan.creation.operationId, plan]));
  task.applied = true;
  handler.restartLatch.open();
  setImmediate(() => {
    if (handler.stopped || handler.restartTask !== task) return;
    for (const plan of plans) {
      if (plan.state === STATE.INITIAL) startRestartPlan(handler, plan);
    }
  });
  handler.logger.info(LOG.RESTART_INVENTORY_APPLIED, {nodeId: handler.nodeId,
    entries: plans.map((plan) => ({operationId: plan.creation.operationId,
      local: plan.local, action: plan.action}))});
  return plans;
}

function recoverRetainedCreations(handler) {
  if (handler.stopped) return Promise.resolve(stoppedInventory());
  if (handler.restartTask !== undefined) return handler.restartTask.promise;
  const completion = Promise.withResolvers();
  const task = {promise: completion.promise, applied: false, plansById: new Map()};
  handler.restartTask = task;
  inventoryAttempt(handler, task).then(completion.resolve, (error) => {
    if (!task.applied && handler.restartTask === task) handler.restartTask = undefined;
    completion.reject(error);
  });
  return task.promise;
}

export {createRestartLatch, notReadyReply, recoverRetainedCreations, resumeRestartPlans,
  replyToRestartPlan, retryRetiredPlans};
