// RuntimeServiceHandler's restart inventory of bound creations (design
// RECOVERY-DESIGN-20261017, Revision 5 governs, then Revisions 4-1: R1-A the
// two owners and the composer, R1-E the RETIRED re-drive emits nothing, R1-H
// the ready latch, R2-F NOT_READY, R3-F journal-corrupt entries). Explicit-context
// functions over the handler. Order: the manager's one scan (journal half) ->
// the adapter's by-path reader (local half) -> memos -> ready -> re-entries.
// The memo is a cache rebuilt from the journal and the local record (RV7.4);
// a re-entry's typed answer writes it through the route's one settle writer.
import {ReplicaOperationMessageType, ReplicaOperationResponseStatus} from
  '../rebalancer/replica-operation-constants.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {SERVICE_INSTANCE_OUTCOME as OUTCOME} from '../constants/service-instance.js';
import {CONSENSUS_CREATION_RESULT as CREATION} from
  '../service/service-consensus-creation-intent.js';
import {WASM_CREATION_LOCAL_INSPECTION as LOCAL} from '../wasm-service/wasm-creation-opening.js';
import {BOUND_DECISION as DECISION, decideBoundRemoval, scheduleBoundReentry} from
  './runtime-service-bound-creation-route.js';
import {RUNTIME_SERVICE_HANDLER_ERROR_MSG as HANDLER_ERROR,
  RUNTIME_SERVICE_HANDLER_LOG_MSG as LOG} from './runtime-service-handler-constants.js';

// What one inventoried creation does after `ready`.
const RESTART_ACTION = Object.freeze({REENTER: 'REENTER', REDRIVE: 'REDRIVE'});
// The reason the restart re-drive hands the bound STOP (no REMOVE request).
const RESTART_REDRIVE_REASON = 'restart_retirement_redrive';
// The memo each action writes before `ready` (R1-A: HELD re-enters, REMOVING
// keeps the retirement's custody).
const RESTART_MEMO = Object.freeze({[RESTART_ACTION.REENTER]: ReplicaStatus.HELD,
  [RESTART_ACTION.REDRIVE]: ReplicaStatus.REMOVING});
// The memo a re-drive's decision leaves; HELD and DEFERRED keep REMOVING.
const REDRIVE_MEMO = new Map([[DECISION.COMPLETED, ReplicaStatus.REMOVED],
  [DECISION.FAILED, ReplicaStatus.FAILED]]);
// The generic rows of the shared scan are left untouched here: the
// activation quest decides their production re-run (R2-G).
const SKIP_GENERIC_ROWS = Object.freeze({resolveServiceContext: () => null});

/**
 * The handler's ready latch (R1-H): engaged, it holds every message until the
 * inventory is applied; not engaged, the handler is ready at construction.
 * @param {boolean} engaged
 * @return {{ready: Promise<void>, isReady: Function, open: Function}}
 */
function createRestartLatch(engaged) {
  const latch = Promise.withResolvers();
  let open = !engaged;
  if (open) latch.resolve();
  return {ready: latch.promise, isReady: () => open, open: () => {
    open = true;
    latch.resolve();
  }};
}

/**
 * The typed refusal of a message before `ready` (R1-H, R2-F): the handler's
 * ERROR reply shape with NOT_READY and deferRetry; no outcome is emitted.
 * @param {Object} handler
 * @return {Object} The reply.
 */
function notReadyReply(handler) {
  return {status: ReplicaOperationResponseStatus.ERROR, error: HANDLER_ERROR.NOT_READY,
    errorCode: HANDLER_ERROR.NOT_READY, deferRetry: true, nodeId: handler.nodeId};
}

function creationOf(entry) {
  return {operationId: entry.operationId, entityId: entry.intent.descriptor.serviceId,
    replicaId: entry.intent.consensusSlotRequest.replicaId};
}

// The local half of one entry through the adapter (no effect); a
// journal-corrupt entry with a decodable intent is re-entered unread.
async function localAnswer(handler, entry) {
  if (entry.outcome !== undefined) return {outcome: entry.outcome};
  return handler.serviceLifecycleManager.inspectRetainedCreation({consensusCreation: {
    operationId: entry.operationId, intent: entry.intent, token: entry.token,
    opening: entry.opening}});
}

// This node's entries (R7: a shared journal lists every node's rows); an
// undecodable intent names no node and no replica: logged typed, never
// re-entered (R3-F).
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
  const local = await localAnswer(handler, entry);
  return {creation: creationOf(entry), local: local?.outcome ?? OUTCOME.UNKNOWN,
    action: local?.outcome === LOCAL.RETIRED ? RESTART_ACTION.REDRIVE : RESTART_ACTION.REENTER};
}

/**
 * The restart re-drive of a RETIRED creation (R1-E): an in-flight REMOVE
 * entry for the replica, the bound retirement by the creation's id, the memo
 * REMOVED on CLOSED (REMOVING otherwise, FAILED on a permanent refusal). It
 * answers no request, so it emits no executor outcome.
 * @param {Object} handler
 * @param {Object} creation - {operationId, entityId, replicaId}.
 * @return {Promise<Object>} The retirement decision.
 */
async function redriveRetiredCreation(handler, creation) {
  handler.inProgressOperations.set(creation.operationId, {
    type: ReplicaOperationMessageType.REMOVE_REPLICA, replicaId: creation.replicaId,
    entityId: creation.entityId, startedAt: Date.now()});
  let decision;
  try {
    decision = await decideBoundRemoval(handler, creation.operationId, RESTART_REDRIVE_REASON);
  } catch (error) {
    decision = {kind: DECISION.HELD, errorCode: error?.code ?? OUTCOME.UNKNOWN};
  } finally {
    handler.inProgressOperations.delete(creation.operationId);
  }
  const memo = handler.localReplicas.get(creation.replicaId);
  const status = REDRIVE_MEMO.get(decision.kind);
  if (status !== undefined && memo?.operationId === creation.operationId) {
    handler.localReplicas.set(creation.replicaId, {...memo, status});
  }
  handler.logger.info(LOG.RESTART_RETIREMENT_REDRIVEN, {...creation, nodeId: handler.nodeId,
    decision: decision.kind, outcome: decision.errorCode ?? null});
  return decision;
}

// RV5.1: one re-entry under the creation's own id, and only while the memo
// written before `ready` still holds it HELD: a wake that queued a re-entry
// after `ready` is not doubled, and a REMOVE that took custody (REMOVING,
// R7/P-R14) is not raced by a CREATE re-entry.
function reentersRestartMemo(handler, creation) {
  const memo = handler.localReplicas.get(creation.replicaId);
  return !handler.inProgressOperations.has(creation.operationId) &&
    memo?.status === ReplicaStatus.HELD && memo.operationId === creation.operationId;
}

function startPlan(handler, plan) {
  if (plan.action === RESTART_ACTION.REDRIVE) {
    redriveRetiredCreation(handler, plan.creation).catch((error) => {
      handler.logger.error(LOG.ASYNC_REMOVE_FAILED, {...plan.creation, error: error.message});
    });
  } else if (reentersRestartMemo(handler, plan.creation)) {
    scheduleBoundReentry(handler, plan.creation);
  }
}

/**
 * Apply the restart inventory (R1-A, R1-H): this node's entries of the
 * manager's one scan, each completed with its local answer; every memo is
 * written, then `ready` opens, then the re-entries start after the caller's
 * turn. Messages before `ready` are refused NOT_READY by the handler.
 * @param {Object} handler - The RuntimeServiceHandler.
 * @return {Promise<Object[]>} The applied plans ({creation, local, action}).
 */
async function recoverRetainedCreations(handler) {
  const results = await handler.serviceLifecycleManager.recoverPendingOperations(
    SKIP_GENERIC_ROWS);
  const plans = [];
  for (const entry of nodeEntries(handler, results)) {
    plans.push(await planEntry(handler, entry));
  }
  for (const plan of plans) {
    handler.localReplicas.set(plan.creation.replicaId, {replicaId: plan.creation.replicaId,
      entityId: plan.creation.entityId, status: RESTART_MEMO[plan.action],
      operationId: plan.creation.operationId});
  }
  handler.restartLatch.open();
  setImmediate(() => {
    for (const plan of plans) startPlan(handler, plan);
  });
  handler.logger.info(LOG.RESTART_INVENTORY_APPLIED, {nodeId: handler.nodeId,
    entries: plans.map((plan) => ({operationId: plan.creation.operationId, local: plan.local,
      action: plan.action}))});
  return plans;
}

export {createRestartLatch, notReadyReply, recoverRetainedCreations};
