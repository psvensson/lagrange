// RuntimeServiceHandler's bound-creation routes (design
// ACTIVATION-DISCOVERY-DESIGN-20261017, Revision 3 governs: RV3.2 deferral
// carrier, RV3.3 result tables, RV3.5 re-entry guard; Revision 2: RV2.1 REMOVE,
// RV2.2 CREATE order, RV2.4 wake; Revision 5: RV5.1 the HELD re-entry resumes
// the creation, RV5.2 memo custody, RV5.3 wake corrections; Revision 6: RV6.1
// one writer of the creation link, RV6.2-RV6.4 replies to a retained memo;
// Revision 7: RV7.1 the deferral flag, RV7.2 only a live creation re-enters,
// RV7.3 a named ACTIVE memo answers a foreign request CONTENT_CONFLICT).
// Explicit-context functions over the handler. Routing keys on the manager's journal (a retained creation answers
// ADMISSION_RETAINED-class); only the refusal class of a CREATE that names no
// retained creation keys on the definition row. The handler memo is volatile;
// the manager's creation row is the authority, a services row only a hint.
import {RUNTIME_FIELD, RUNTIME_KIND, SERVICE_OPERATION_STATE as OP_STATE, WORKFLOW_STEP} from
  '../constants/index.js';
import {META_SERVICE_ID} from '../constants/wasm-meta.js';
import {SERVICE_INSTANCE_OUTCOME as OUTCOME} from '../constants/service-instance.js';
import {EXECUTOR_OUTCOME_TYPE} from '../rebalancer/executor-outcome-constants.js';
import {ReplicaOperationMessageType, ReplicaOperationResponseStatus} from
  '../rebalancer/replica-operation-constants.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {isRequestCellDefinition} from '../runtime/request-cell-runtime-contract.js';
import {CONSENSUS_BOOTSTRAP, consensusBootstrapDescriptor} from
  '../service/service-consensus-bootstrap.js';
import {CONSENSUS_CREATION_RESULT as CREATION} from
  '../service/service-consensus-creation-intent.js';
import {WASM_CREATION_RETIREMENT_FINALITY as FINALITY} from
  '../wasm-service/wasm-service-constants.js';
import {WASM_CREATION_CURRENT as CURRENT} from '../wasm-service/wasm-service-constants.js';
import {captureRetainedCreationOrigin, sameRetainedCreation} from
  '../service/service-consensus-creation-origin.js';
import {instanceDigest} from '../control-plane/owners/service-instance-contract.js';
import {matchesCreationRequest, matchesCreationWake, replicaExecution, currentExecution,
  retainedCreationPlan, executionRefusal, inProgressReply, installExecution, releaseExecution,
  joinRetirementObserver} from './runtime-service-creation-execution.js';
import {RECONCILE_REASON} from '../workflow/reconcile-queue-constants.js';
import {RUNTIME_SERVICE_CREATION_MEMO as MEMO,
  RUNTIME_SERVICE_RESTART_ACTION as ACTION, RUNTIME_SERVICE_RESTART_PLAN_STATE as PLAN_STATE,
  RUNTIME_SERVICE_CREATION_WAKE_OUTCOME as WAKE,
  RUNTIME_SERVICE_HANDLER_ERROR_MSG as HANDLER_ERROR,
  RUNTIME_SERVICE_HANDLER_LOG_MSG as LOG} from './runtime-service-handler-constants.js';

// What one bound answer decides for the handler's memo and outcome.
const BOUND_DECISION = Object.freeze({
  HELD: 'HELD', ACTIVE: 'ACTIVE', UNROUTED: 'UNROUTED', FAILED: 'FAILED',
  DEFERRED: 'DEFERRED', COMPLETED: 'COMPLETED',
});
const DECISION = BOUND_DECISION;
const BUILT_IN_META_SERVICE_IDS = new Set(Object.values(META_SERVICE_ID));
// RV3.3 resume table, keyed on the answer's status first, then its outcome;
// every other outcome is a permanent FAILED with its code.
const RESUME_STATUS = new Map([[CONSENSUS_BOOTSTRAP.HELD, DECISION.HELD],
  [CONSENSUS_BOOTSTRAP.PUBLISHED_UNPROJECTED, DECISION.HELD],
  [CONSENSUS_BOOTSTRAP.PUBLISHED, DECISION.ACTIVE]]);
const RESUME_OUTCOME = new Map([[CREATION.INTENT_NOT_FOUND, DECISION.UNROUTED],
  [OUTCOME.UNAVAILABLE, DECISION.UNROUTED], [OUTCOME.UNKNOWN, DECISION.DEFERRED]]);
// RV3.3 REMOVE table: the journal-only read, then the retirement answer. A
// NOT_ADMITTED read resolves the reservation first (design
// RECOVERY-DESIGN-20261017 R2-A), never answers COMPLETED by itself.
const READ_DECISION = new Map([[OUTCOME.UNAVAILABLE, DECISION.DEFERRED],
  [OUTCOME.UNKNOWN, DECISION.DEFERRED]]);
// R2-A, R3-E: the REMOVE-time reservation resolution's answers.
const RESOLUTION_DECISION = new Map([[CREATION.CANCELLED, DECISION.COMPLETED],
  [OUTCOME.UNAVAILABLE, DECISION.HELD], [OUTCOME.UNKNOWN, DECISION.HELD]]);
// R1-D, R3-D: a terminal creation row decides a REMOVE by its state:
// COMPLETED and CANCELLED are done (idempotent), FAILED is a typed failure.
const TERMINAL_REMOVAL = new Map([[OP_STATE.COMPLETED, DECISION.COMPLETED],
  [OP_STATE.CANCELLED, DECISION.COMPLETED], [OP_STATE.FAILED, DECISION.FAILED]]);
// R1-B (N5): a corrupt local file is an operator matter, never a re-drive.
const PERMANENT_RETIREMENT_REFUSALS = new Set([OUTCOME.INVALID_REQUEST,
  OUTCOME.CONTENT_CONFLICT, OUTCOME.INVALID_LINEAGE, OUTCOME.CORRUPT_STATE]);
// RV5.3: the wake reasons that leave work for after an in-flight CREATE;
// RESOURCE_CLOSED is "nothing local".
const PENDING_WAKE_REASONS = new Set([RECONCILE_REASON.CREATION_GENESIS_OBSERVED,
  RECONCILE_REASON.CREATION_GRANT_HELD]);

/**
 * The handler-side bound class of a definition row (RV2.2): an installed
 * wasm_component that is neither a request Cell nor a built-in meta service.
 * @param {Object|null} row - The service_definitions row.
 * @return {boolean}
 */
function isBoundClassDefinition(row) {
  return row?.[RUNTIME_FIELD.RUNTIME_KIND] === RUNTIME_KIND.WASM_COMPONENT &&
    !isRequestCellDefinition(row) && !BUILT_IN_META_SERVICE_IDS.has(row.service_id);
}

function decideResume(answer) {
  return RESUME_STATUS.get(answer?.status) ?? RESUME_OUTCOME.get(answer?.outcome) ??
    DECISION.FAILED;
}

function resumeCode(answer) {
  return answer?.reason ?? answer?.outcome ?? OUTCOME.UNKNOWN;
}

// A CREATE that names no retained creation, for a bound-class definition:
// a definitive absence refuses typed, an unavailable read defers.
function unroutedDecision(answer) {
  return answer.outcome === CREATION.INTENT_NOT_FOUND ?
    {kind: DECISION.FAILED, errorCode: HANDLER_ERROR.BOUND_ROUTE_REQUIRED} :
    {kind: DECISION.DEFERRED, errorCode: OUTCOME.UNAVAILABLE};
}

function failureOptions(replicaId, decision) {
  return {replicaId, errorMessage: decision.errorCode, errorCode: decision.errorCode,
    ...(decision.kind === DECISION.DEFERRED ? {deferRetry: true} : {})};
}

/**
 * Whether a handler memo names a retained creation (RV5.2, RV6.1): such a
 * memo has one writer, the route's settle.
 * @param {Object|undefined} memo
 * @return {boolean}
 */
function namesCreation(memo) {
  return typeof memo?.operationId === 'string';
}

// Current physical registration is observed immediately before a named
// projection. A failed historical attempt never takes another origin's memo.
function writesMemo(handler, entry, decision) {
  const memo = handler.localReplicas.get(entry.replicaId);
  if (!decision.names || entry.origin === undefined) {
    return !namesCreation(memo) && memo?.status !== MEMO.CONTINUATION_PENDING;
  }
  const observed = handler.serviceLifecycleManager.observeCurrentCreation(
    {consensusCreation: entry.origin});
  if (observed.outcome === CURRENT.CURRENT) return true;
  if (observed.outcome === CURRENT.DIFFERENT || decision.kind === DECISION.ACTIVE ||
      decision.kind === DECISION.HELD) return false;
  return memo?.status !== MEMO.CONTINUATION_PENDING && (!namesCreation(memo) ||
    (memo.operationId === entry.operationId &&
      (memo.origin === undefined || sameRetainedCreation(memo.origin, entry.origin))));
}

function settleCreation(handler, params, decision, entry) {
  if (!currentExecution(handler, entry)) return;
  const {operationId, entityId, replicaId} = params;
  const named = decision.names ? {operationId, origin: entry.origin} : {};
  const deferral = decision.kind === DECISION.DEFERRED ? {deferRetry: true} : {};
  const writes = writesMemo(handler, entry, decision);
  if (!currentExecution(handler, entry)) return;
  const memo = (status) => writes && handler.localReplicas.set(replicaId,
    {replicaId, entityId, status, ...named, ...deferral});
  const fields = {operationId, replicaId, entityId, nodeId: handler.nodeId};
  if (decision.kind === DECISION.ACTIVE) {
    memo(ReplicaStatus.ACTIVE);
    handler.emitExecutorOutcome(EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_ACTIVE,
      operationId, WORKFLOW_STEP.ACTIVE, {replicaId});
    handler.logger.info(LOG.CREATE_COMPLETED, fields);
  } else if (decision.kind === DECISION.HELD) {
    memo(ReplicaStatus.HELD);
    handler.emitExecutorOutcome(EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_HELD,
      operationId, WORKFLOW_STEP.CREATING, {replicaId});
    handler.logger.info(LOG.CREATE_HELD, fields);
  } else {
    memo(ReplicaStatus.FAILED);
    handler.emitExecutorOutcome(EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_FAILED,
      operationId, WORKFLOW_STEP.FAILED, failureOptions(replicaId, decision));
    handler.logger.error(LOG.CREATE_FAILED, {...fields, error: decision.errorCode});
  }
}

function finishCreationPlan(entry, decision) {
  const plan = entry.plan;
  if (plan === undefined) return;
  if (entry.origin !== undefined) plan.origin = entry.origin;
  plan.lastDecision = decision;
  plan.journalComplete ||= decision.journalComplete === true;
  plan.state = plan.journalComplete ? PLAN_STATE.SETTLED : PLAN_STATE.WAITING;
  if (decision.result !== undefined) plan.retirement = decision.result;
  plan.queued ||= !plan.journalComplete && decision.kind === DECISION.HELD &&
    plan.action === ACTION.REENTER && (entry.wakePending || plan.wakePending);
  plan.wakePending = false;
}

function scheduleBoundReentry(handler, params, plan) {
  const memo = handler.localReplicas.get(params.replicaId);
  const origin = plan?.origin ??
    (memo?.operationId === params.operationId ? memo.origin : undefined);
  const entry = installExecution(handler, params, ReplicaOperationMessageType.CREATE_REPLICA,
    {origin, plan, forceHydration: plan?.journalComplete === true});
  if (entry === undefined) {
    if (plan !== undefined && !plan.journalComplete &&
        plan.state !== PLAN_STATE.RUNNING) plan.queued = true;
    return false;
  }
  setImmediate(() => {
    if (!currentExecution(handler, entry)) return;
    routeRuntimeServiceCreate(handler, params, entry).catch((error) => {
      handler.logger.error(LOG.ASYNC_CREATE_FAILED, {operationId: params.operationId,
        replicaId: params.replicaId, error: error.message});
    });
  });
  return true;
}

const HYDRATION = Object.freeze({ORIGIN: 'ORIGIN', UNROUTED: 'UNROUTED', DECIDED: 'DECIDED'});
const CREATE_ROUTE = Object.freeze({BOUND: 'BOUND', GENERIC: 'GENERIC'});
function hydratedDecision(answer) {
  if (answer.outcome === CREATION.INTENT_NOT_FOUND || answer.outcome === OUTCOME.UNAVAILABLE ||
      answer.outcome === OUTCOME.UNKNOWN) return {kind: HYDRATION.UNROUTED, answer};
  return {kind: HYDRATION.DECIDED, decision: {kind: DECISION.FAILED,
    errorCode: resumeCode(answer), names: true,
    journalComplete: answer.outcome === CREATION.TERMINAL_OPERATION}};
}

async function hydrateCreation(handler, params, entry) {
  let answer;
  if (entry.origin !== undefined && !entry.forceHydration) {
    answer = {outcome: CREATION.ADMISSION_RETAINED, ...entry.origin};
  } else {
    answer = await handler.serviceLifecycleManager.readRetainedCreation(params.operationId);
    if (!currentExecution(handler, entry)) return undefined;
  }
  if (answer.outcome !== CREATION.ADMISSION_RETAINED && answer.outcome !== CREATION.NOT_ADMITTED) {
    return hydratedDecision(answer);
  }
  const origin = captureRetainedCreationOrigin(answer);
  if (!matchesCreationRequest(handler, origin, params)) {
    return {kind: HYDRATION.DECIDED, decision: {kind: DECISION.FAILED,
      errorCode: OUTCOME.CONTENT_CONFLICT, names: false}};
  }
  entry.origin = origin;
  return {kind: HYDRATION.ORIGIN};
}

function retainResumeAdmission(entry, answer) {
  if (entry.origin === undefined || answer.consensusResourceToken === undefined) return;
  const origin = captureRetainedCreationOrigin(
    {...entry.origin, token: answer.consensusResourceToken});
  if (instanceDigest(answer.consensusBinding) !== instanceDigest(origin.intent.consensusBinding) ||
      (entry.origin.token !== null && !sameRetainedCreation(entry.origin, origin))) {
    const error = new Error(OUTCOME.CONTENT_CONFLICT);
    error.code = OUTCOME.CONTENT_CONFLICT;
    throw error;
  }
  entry.origin = origin;
}

async function createRouteDecision(handler, params, entry) {
  const hydration = await hydrateCreation(handler, params, entry);
  if (!currentExecution(handler, entry)) return;
  switch (hydration.kind) {
  case HYDRATION.UNROUTED:
    return isBoundClassDefinition(handler.resolveServiceDefinition(params.entityId)) ?
      {route: CREATE_ROUTE.BOUND,
        decision: {...unroutedDecision(hydration.answer), names: false}} :
      {route: CREATE_ROUTE.GENERIC};
  case HYDRATION.DECIDED:
    return {route: CREATE_ROUTE.BOUND, decision: hydration.decision};
  default:
    break;
  }
  const answer = await handler.serviceLifecycleManager.resumeConsensusCreation(
    params.operationId, {nodeId: handler.nodeId});
  if (!currentExecution(handler, entry)) return;
  retainResumeAdmission(entry, answer);
  const kind = decideResume(answer);
  const decision = kind === DECISION.UNROUTED ? {...unroutedDecision(answer), names: true} :
    {kind, errorCode: resumeCode(answer), names: true,
      journalComplete: answer.outcome === CREATION.TERMINAL_OPERATION};
  return {route: CREATE_ROUTE.BOUND, decision};
}

async function routeRuntimeServiceCreate(handler, params, installed) {
  const entry = installed ?? handler.inProgressOperations.get(params.operationId);
  if (!currentExecution(handler, entry)) return;
  let generic = false;
  let decision;
  try {
    const routed = await createRouteDecision(handler, params, entry);
    if (!currentExecution(handler, entry)) return;
    generic = routed.route === CREATE_ROUTE.GENERIC;
    if (generic) {
      await handler.createGenericReplicaAsync(params, entry);
      return;
    }
    decision = routed.decision;
    settleCreation(handler, params, decision, entry);
  } catch (error) {
    decision = {kind: DECISION.DEFERRED, errorCode: error?.code ?? OUTCOME.UNKNOWN,
      names: entry.origin !== undefined};
    settleCreation(handler, params, decision, entry);
  } finally {
    if (!generic && currentExecution(handler, entry)) {
      if (decision !== undefined) finishCreationPlan(entry, decision);
      if (entry.plan === undefined && entry.wakePending && decision?.kind === DECISION.HELD) {
        const memo = handler.localReplicas.get(entry.replicaId);
        if (memo?.status === ReplicaStatus.HELD && memo.operationId === entry.operationId &&
            sameRetainedCreation(memo.origin, entry.origin)) memo.wakePending = true;
      }
      releaseExecution(handler, entry);
    }
  }
}

/**
 * A CREATE for a locally retained creation (a HELD memo, or a named deferral,
 * RV6.2) re-enters the memo's creation once (RV3.5, RV5.1): resumed, guarded
 * and emitted under the creation's operation id (the key wakes use), skipped
 * while a re-entry of it is in flight; the request's own id is only the log
 * field requestOperationId. Answers IN_PROGRESS. A memo that names no
 * creation is corrupt (RV6.4): the typed ERROR reply, memo untouched,
 * nothing emitted, never the request's id.
 * @param {Object} handler
 * @param {Object} existing - The memo (its operationId names the creation).
 * @param {Object} params - The request's {operationId, entityId, replicaId}.
 * @return {Object} The reply.
 */
function reenterRetainedCreation(handler, existing, params) {
  if (!namesCreation(existing)) {
    handler.logger.error(LOG.CREATE_FAILED, {replicaId: params.replicaId, nodeId: handler.nodeId,
      requestOperationId: params.operationId, error: HANDLER_ERROR.CORRUPT_LOCAL_MEMO});
    return {status: ReplicaOperationResponseStatus.ERROR, error: HANDLER_ERROR.CORRUPT_LOCAL_MEMO,
      errorCode: HANDLER_ERROR.CORRUPT_LOCAL_MEMO, deferRetry: false, nodeId: handler.nodeId};
  }
  const creation = {operationId: existing.operationId,
    entityId: params.entityId, replicaId: params.replicaId};
  if (replicaExecution(handler, creation.replicaId) === undefined) {
    scheduleBoundReentry(handler, creation);
  }
  handler.logger.info(LOG.CREATE_IN_PROGRESS, {replicaId: params.replicaId,
    nodeId: handler.nodeId, operationId: creation.operationId,
    requestOperationId: params.operationId});
  return inProgressReply(handler, params.replicaId);
}

// RV6.3: a CREATE for a replica whose bound retirement is in progress is
// deferred typed under the request's id; nothing is routed and the nameless
// settle leaves the memo (RV5.2); the next REMOVE re-drives the retirement.
function deferDuringRetirement(handler, existing, params) {
  handler.emitExecutorOutcome(EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_FAILED,
    params.operationId, WORKFLOW_STEP.FAILED, failureOptions(params.replicaId,
      {kind: DECISION.DEFERRED, errorCode: HANDLER_ERROR.RETIREMENT_IN_PROGRESS}));
  return inProgressReply(handler, params.replicaId);
}

// RV7.2: only a deferral is a live retained creation; a permanently failed
// named memo answers null (the CREATE proceeds under its own id, RV6.1).
function reenterDeferredCreation(handler, existing, params) {
  return existing.deferRetry === true ? reenterRetainedCreation(handler, existing, params) : null;
}

// The replies to a memo that names a retained creation, by its status.
const NAMED_MEMO_REPLIES = new Map([[ReplicaStatus.FAILED, reenterDeferredCreation],
  [ReplicaStatus.REMOVING, deferDuringRetirement]]);

/**
 * RV7.3: a named ACTIVE memo never earns an outcome for a different request.
 * For a request whose id differs from the memo's creation, CREATE_FAILED with
 * CONTENT_CONFLICT is emitted under the request's id and true is answered; a
 * same-id duplicate or a nameless memo answers false (the caller's
 * CREATE_ACTIVE re-announce, unchanged). The memo is never written.
 * @param {Object} handler
 * @param {Object} existing - The ACTIVE memo.
 * @param {Object} params - The request's {operationId, replicaId}.
 * @return {boolean}
 */
function refuseForeignCreation(handler, existing, {operationId, replicaId}) {
  if (!namesCreation(existing) || existing.operationId === operationId) return false;
  const decision = {kind: DECISION.FAILED, errorCode: OUTCOME.CONTENT_CONFLICT};
  handler.emitExecutorOutcome(EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_FAILED,
    operationId, WORKFLOW_STEP.FAILED, failureOptions(replicaId, decision));
  handler.logger.error(LOG.CREATE_FAILED, {operationId, replicaId, nodeId: handler.nodeId,
    creationOperationId: existing.operationId, error: decision.errorCode});
  return true;
}

/**
 * The reply a CREATE gets from a memo of a locally retained creation
 * (RV3.5, RV6.2-RV6.4, RV7.2): HELD re-enters (a nameless HELD is refused
 * corrupt); a named FAILED deferral (deferRetry) re-enters; a named REMOVING
 * is deferred typed. Any other memo, a permanently failed named memo, and
 * every nameless FAILED or REMOVING memo answers null.
 * @param {Object} handler
 * @param {Object|undefined} existing - The local replica memo.
 * @param {Object} params - The request's {operationId, entityId, replicaId}.
 * @return {Object|null} The reply, or null to proceed.
 */
function replyToRetainedMemo(handler, existing, params) {
  if (existing?.status === ReplicaStatus.HELD) {
    return reenterRetainedCreation(handler, existing, params);
  }
  const reply = namesCreation(existing) ? NAMED_MEMO_REPLIES.get(existing.status) : undefined;
  return reply ? reply(handler, existing, params) : null;
}

// A wake proves only an exact local target. It never installs an admission
// token and never turns RESOURCE_CLOSED or an unavailable grant into CREATE.
function unavailableGrantWake(wake) {
  return wake?.reason === RECONCILE_REASON.CREATION_GRANT_HELD &&
    wake.grant?.outcome === OUTCOME.UNAVAILABLE;
}

function matchingWakeTarget(handler, serviceDefinitionId, wake) {
  const operationId = wake?.token?.operationId;
  if (typeof operationId !== 'string') return undefined;
  const plan = retainedCreationPlan(handler, operationId);
  if (plan !== undefined) {
    return matchesCreationWake(plan.origin, serviceDefinitionId, wake) ? {plan} : undefined;
  }
  const entry = handler.inProgressOperations.get(operationId);
  if (entry !== undefined && matchesCreationWake(entry.origin, serviceDefinitionId, wake)) {
    return {entry};
  }
  const memo = [...handler.localReplicas.values()].find((item) =>
    item.operationId === operationId &&
    matchesCreationWake(item.origin, serviceDefinitionId, wake));
  return memo === undefined ? undefined : {memo};
}

const WAKE_ACTION = Object.freeze({NONE: 'NONE', RECORD: 'RECORD', EXECUTION: 'EXECUTION',
  PLAN: 'PLAN', MEMO: 'MEMO'});
function creationWakeAction(handler, serviceDefinitionId, wake) {
  const found = handler.stopped ? undefined :
    matchingWakeTarget(handler, serviceDefinitionId, wake);
  const plan = found?.plan;
  const entry = found?.entry ?? (plan === undefined ? undefined :
    handler.inProgressOperations.get(plan.creation.operationId));
  const memo = found?.memo;
  const action = [
    [found === undefined, WAKE_ACTION.NONE],
    [!PENDING_WAKE_REASONS.has(wake?.reason) || unavailableGrantWake(wake), WAKE_ACTION.RECORD],
    [entry?.type === ReplicaOperationMessageType.CREATE_REPLICA &&
      matchesCreationWake(entry.origin, serviceDefinitionId, wake), WAKE_ACTION.EXECUTION],
    [plan !== undefined && (plan.action !== ACTION.REENTER || plan.journalComplete ||
      plan.lastDecision?.kind === DECISION.FAILED), WAKE_ACTION.RECORD],
    [plan !== undefined, WAKE_ACTION.PLAN],
    [memo?.status === ReplicaStatus.HELD, WAKE_ACTION.MEMO],
    [true, WAKE_ACTION.RECORD],
  ].find(([matches]) => matches)[1];
  return {action, entry, plan, memo};
}

function consumeCreationWake(handler, serviceDefinitionId, wake) {
  const {action, entry, plan, memo} = creationWakeAction(handler, serviceDefinitionId, wake);
  switch (action) {
  case WAKE_ACTION.NONE:
    if (!handler.stopped) {
      handler.logger.warn(LOG.CREATION_WAKE_NO_LOCAL_OPERATION,
        {serviceDefinitionId, operationId: wake?.token?.operationId, nodeId: handler.nodeId});
    }
    return {outcome: WAKE.NO_LOCAL_OPERATION};
  case WAKE_ACTION.EXECUTION:
    entry.wakePending = true;
    return {outcome: WAKE.RECORDED};
  case WAKE_ACTION.PLAN:
    plan.wakePending = true;
    if (plan.state !== PLAN_STATE.RUNNING) {
      plan.queued = true;
      handler.resumeRestartPlans(plan.creation.replicaId);
    }
    return {outcome: WAKE.QUEUED};
  case WAKE_ACTION.MEMO:
    memo.wakePending = true;
    resumeHeldMemoWake(handler, memo.replicaId);
    return {outcome: WAKE.QUEUED};
  default:
    return {outcome: WAKE.RECORDED};
  }
}

function resumeHeldMemoWake(handler, replicaId) {
  const memo = handler.localReplicas.get(replicaId);
  if (handler.stopped || memo?.wakePending !== true || memo.status !== ReplicaStatus.HELD ||
      memo.origin === undefined || replicaExecution(handler, replicaId) !== undefined) return;
  const origin = captureRetainedCreationOrigin(memo.origin);
  const observation = handler.serviceLifecycleManager.observeCurrentCreation(
    {consensusCreation: origin});
  if (observation.outcome !== CURRENT.CURRENT || handler.stopped ||
      handler.localReplicas.get(replicaId) !== memo || memo.status !== ReplicaStatus.HELD ||
      memo.operationId !== origin.operationId || !sameRetainedCreation(memo.origin, origin)) return;
  if (scheduleBoundReentry(handler, {operationId: origin.operationId, entityId: memo.entityId,
    replicaId})) memo.wakePending = false;
}

// Physical finality is consumed once across runtime, manager and handler.
// It cannot settle a REMOVE until its original creation journal is confirmed.
function decideRetirement(result) {
  const kind = [
    [result?.finality === FINALITY.FINAL &&
      result.completion?.outcome === CREATION.ROW_COMPLETED, DECISION.COMPLETED],
    [PERMANENT_RETIREMENT_REFUSALS.has(result?.outcome), DECISION.FAILED],
    [true, DECISION.HELD],
  ].find(([matches]) => matches)[1];
  const errorCode = kind === DECISION.FAILED ? result.outcome :
    result?.completion?.outcome ?? result?.projection?.outcome ??
      result?.status ?? result?.outcome ?? OUTCOME.UNKNOWN;
  return {kind, result, ...(kind === DECISION.COMPLETED ? {journalComplete: true} : {errorCode})};
}

function terminalOrTable(answer, table) {
  const terminal = answer.outcome === CREATION.TERMINAL_OPERATION;
  const kind = terminal ? TERMINAL_REMOVAL.get(answer.rowState) : table.get(answer.outcome);
  return {kind: kind ?? DECISION.FAILED, errorCode: answer.reason ?? answer.outcome,
    journalComplete: terminal || answer.outcome === CREATION.CANCELLED,
    // Keep the journal owner's exact answer, not a handler-derived substitute
    // for physical finality. It may prove cancellation of a never-admitted
    // creation, whose physical owner necessarily has no resource token.
    journalAnswer: answer};
}

function stoppedRemovalDecision() {
  return {kind: DECISION.HELD, errorCode: HANDLER_ERROR.HANDLER_STOPPED};
}

function classifyRetainedRemoval(answer, table) {
  return answer.outcome === CREATION.ADMISSION_RETAINED ? {retained: answer} :
    {decision: terminalOrTable(answer, table)};
}

async function retainedForRemoval(manager, creationOperationId, live) {
  const retained = await manager.readRetainedCreation(creationOperationId);
  if (!live()) return {decision: stoppedRemovalDecision()};
  if (retained.outcome !== CREATION.NOT_ADMITTED) {
    return classifyRetainedRemoval(retained, READ_DECISION);
  }
  const resolved = await manager.resolveRetainedReservation(creationOperationId);
  return live() ? classifyRetainedRemoval(resolved, RESOLUTION_DECISION) :
    {decision: stoppedRemovalDecision()};
}

function matchesRemovalOrigin(handler, entry, creationOperationId, origin) {
  if (entry === undefined) return true;
  const target = {...entry.params, operationId: creationOperationId};
  return matchesCreationRequest(handler, origin, target) && (entry.origin === undefined ||
    (instanceDigest(entry.origin.intent) === instanceDigest(origin.intent) &&
    (entry.origin.token === null || sameRetainedCreation(entry.origin, origin))));
}

async function decideBoundRemoval(handler, creationOperationId, reason, entry) {
  const manager = handler.serviceLifecycleManager;
  const live = () => entry === undefined ? !handler.stopped : currentExecution(handler, entry);
  const {retained, decision} = await retainedForRemoval(manager, creationOperationId, live);
  if (!live()) return stoppedRemovalDecision();
  if (decision !== undefined) return decision;
  const origin = captureRetainedCreationOrigin(retained);
  if (!matchesRemovalOrigin(handler, entry, creationOperationId, origin)) {
    return {kind: DECISION.FAILED, errorCode: OUTCOME.CONTENT_CONFLICT};
  }
  if (entry !== undefined) entry.origin = origin;
  return decideRetirement(await manager.stopReplica({
    definition: consensusBootstrapDescriptor(retained), consensusCreation: retained,
    consensusOpeningOwner: manager}, {nodeId: handler.nodeId, reason}));
}

// A sealed PENDING -> CANCELLED CAS belongs to the journal owner. Its original
// creation never had a physical token; neither a cache nor a physical caller
// may derive this proof from a generic FAILED/UNKNOWN result. The caller also
// must still hold exactly the memo for the journaled creation.
function journalCancelledBeforeAdmission(entry, memo, decision) {
  return decision.kind === DECISION.COMPLETED &&
    decision.journalAnswer?.outcome === CREATION.CANCELLED &&
    decision.journalAnswer.operationId === entry.creationOperationId &&
    entry.origin?.token === null && memo?.origin?.token === null &&
    memo.operationId === entry.creationOperationId &&
    sameRetainedCreation(memo.origin, entry.origin);
}

function maySettleRemovalMemo(handler, entry, memo, decision) {
  if (memo?.operationId !== entry.creationOperationId || entry.origin === undefined ||
      (memo.origin !== undefined && !sameRetainedCreation(memo.origin, entry.origin))) return false;
  if (journalCancelledBeforeAdmission(entry, memo, decision)) return true;
  const current = handler.serviceLifecycleManager.observeCurrentCreation(
    {consensusCreation: entry.origin});
  return current.outcome === CURRENT.CURRENT || current.outcome === CURRENT.ABSENT;
}

function settleRemoval(handler, params, decision, entry) {
  if (!currentExecution(handler, entry)) return;
  const {operationId, entityId, replicaId} = params;
  const memo = handler.localReplicas.get(replicaId);
  const writes = maySettleRemovalMemo(handler, entry, memo, decision);
  if (!currentExecution(handler, entry)) return;
  const fields = {operationId, replicaId, entityId, nodeId: handler.nodeId};
  if (decision.kind === DECISION.COMPLETED) {
    if (writes) {
      // A permanently cancelled, never-admitted CREATE did not retire a
      // physical resource. Keep its original terminal identity for bounded
      // re-reads, but do not let its prior deferral resume again.
      if (journalCancelledBeforeAdmission(entry, memo, decision)) {
        const terminal = {...memo, status: ReplicaStatus.FAILED};
        delete terminal.deferRetry;
        handler.localReplicas.set(replicaId, terminal);
      } else {
        handler.localReplicas.set(replicaId, {...memo, status: ReplicaStatus.REMOVED});
      }
    }
    if (entry.silent !== true || params === entry.observer) {
      handler.emitExecutorOutcome(EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_REMOVE_COMPLETED,
        operationId, WORKFLOW_STEP.REMOVED, {replicaId});
    }
    handler.logger.info(LOG.REMOVE_COMPLETED, fields);
  } else if (decision.kind === DECISION.HELD || decision.kind === DECISION.DEFERRED) {
    if (entry.silent !== true || params === entry.observer) {
      handler.emitExecutorOutcome(EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_REMOVE_HELD,
        operationId, WORKFLOW_STEP.STOPPING, {replicaId});
    }
    handler.logger.warn(LOG.REMOVE_HELD, {...fields, outcome: decision.errorCode});
  } else {
    if (writes) handler.localReplicas.set(replicaId, {...memo, status: ReplicaStatus.FAILED});
    if (entry.silent !== true || params === entry.observer) {
      handler.emitExecutorOutcome(EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_REMOVE_FAILED,
        operationId, WORKFLOW_STEP.FAILED, failureOptions(replicaId, decision));
    }
    handler.logger.error(LOG.REMOVE_FAILED, {...fields, error: decision.errorCode});
  }
}

async function routeBoundRemoval(handler, params, creationOperationId, installed) {
  const entry = installed ?? handler.inProgressOperations.get(params.operationId);
  if (!currentExecution(handler, entry)) return;
  let decision;
  try {
    decision = await decideBoundRemoval(handler, creationOperationId, params.reason, entry);
  } catch (error) {
    decision = {kind: DECISION.HELD, errorCode: error?.code ?? OUTCOME.UNKNOWN};
  }
  if (!currentExecution(handler, entry)) return;
  finishCreationPlan(entry, decision);
  settleRemoval(handler, params, decision, entry);
  if (entry.observer !== undefined) settleRemoval(handler, entry.observer, decision, entry);
  releaseExecution(handler, entry);
}

function queueBoundRemoval(handler, entry) {
  setImmediate(() => {
    if (!currentExecution(handler, entry)) return;
    routeBoundRemoval(handler, entry.params, entry.creationOperationId, entry).catch((error) => {
      handler.logger.error(LOG.ASYNC_REMOVE_FAILED, {operationId: entry.operationId,
        error: error.message});
      if (currentExecution(handler, entry)) {
        finishCreationPlan(entry, {kind: DECISION.HELD, errorCode: error?.code ?? OUTCOME.UNKNOWN});
        releaseExecution(handler, entry);
      }
    });
  });
}

const RESTART_REDRIVE_REASON = 'restart_retirement_redrive';
function scheduleRetiredCreation(handler, plan) {
  const params = {...plan.creation, reason: RESTART_REDRIVE_REASON};
  const entry = installExecution(handler, params, ReplicaOperationMessageType.REMOVE_REPLICA,
    {origin: plan.origin, plan, silent: true, creationOperationId: plan.creation.operationId});
  if (entry === undefined) {
    plan.queued = true;
    return false;
  }
  queueBoundRemoval(handler, entry);
  return true;
}

function admitBoundRemoval(handler, params, memo) {
  const creationOperationId = memo.operationId;
  const busy = replicaExecution(handler, params.replicaId);
  if (busy !== undefined) {
    return busy.type === ReplicaOperationMessageType.REMOVE_REPLICA ?
      joinRetirementObserver(handler, busy, params, creationOperationId) :
      executionRefusal(handler);
  }
  const plan = retainedCreationPlan(handler, creationOperationId);
  const entry = installExecution(handler, params, ReplicaOperationMessageType.REMOVE_REPLICA,
    {origin: plan?.origin ?? memo.origin, plan, creationOperationId});
  if (entry === undefined) return executionRefusal(handler);
  if (plan !== undefined) plan.action = ACTION.REDRIVE;
  handler.localReplicas.set(params.replicaId, {...memo, status: ReplicaStatus.REMOVING});
  handler.retryRetiredPlans(params.replicaId);
  queueBoundRemoval(handler, entry);
  return {status: memo.status === ReplicaStatus.REMOVING ?
    ReplicaOperationResponseStatus.IN_PROGRESS : ReplicaOperationResponseStatus.INITIATED,
  operationId: params.operationId, replicaId: params.replicaId, nodeId: handler.nodeId};
}

function replicaReply(status, fields) {
  return {status, ...fields};
}

function replyToExistingReplica(handler, existing, params) {
  const {operationId, replicaId} = params;
  if (existing?.operationId === operationId && existing.origin !== undefined &&
        !matchesCreationRequest(handler, existing.origin, params)) {
    return executionRefusal(handler, OUTCOME.CONTENT_CONFLICT, false);
  }
  const status = existing?.status;
  if (status === ReplicaStatus.ACTIVE) {
    handler.logger.info(
      LOG.CREATE_ALREADY_ACTIVE,
      {replicaId, nodeId: handler.nodeId},
    );
    if (!refuseForeignCreation(handler, existing, {operationId, replicaId})) {
      handler.emitExecutorOutcome(
        EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_ACTIVE,
        operationId,
        WORKFLOW_STEP.ACTIVE,
        {replicaId},
      );
    }
    return replicaReply(
      ReplicaOperationResponseStatus.ALREADY_EXISTS,
      {
        replicaId,
        nodeId: handler.nodeId,
      },
    );
  }
  const retainedReply = replyToRetainedMemo(handler, existing, params);
  if (retainedReply) {
    return retainedReply;
  }
  if (status === ReplicaStatus.CREATING) {
    handler.logger.info(
      LOG.CREATE_IN_PROGRESS,
      {replicaId, nodeId: handler.nodeId},
    );
    return replicaReply(
      ReplicaOperationResponseStatus.IN_PROGRESS,
      {
        replicaId,
        nodeId: handler.nodeId,
      },
    );
  }
  return null;
}

/**
 * The creation a services row names for a REMOVE whose memo was lost (RV2.1,
 * RV3.6 N3): the row's create_attempt_token is a hint carrying the id only.
 * @param {Object} row - The services row.
 * @return {Object} The memo fields it contributes.
 */
function rowCreationHint(row) {
  const token = row?.create_attempt_token;
  return typeof token === 'string' && token.length > 0 ? {operationId: token} : {};
}

export {routeRuntimeServiceCreate, replyToRetainedMemo, refuseForeignCreation, namesCreation,
  consumeCreationWake, routeBoundRemoval, rowCreationHint, decideBoundRemoval,
  scheduleBoundReentry, scheduleRetiredCreation, admitBoundRemoval, resumeHeldMemoWake,
  replyToExistingReplica, BOUND_DECISION};
