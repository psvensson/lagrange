import {resolveWasmCreationAdmission, openWasmCreationRecords, tombstoneWasmCreationLocal,
  wasmCreationLocalIdentity, WASM_CREATION_RETIREMENT as RETIREMENT} from
  './wasm-creation-opening.js';
import {openServingState, retireServingState, WASM_SERVICE_SERVING_STATE as SERVING} from
  './wasm-service-serving-state.js';
import {requireInstance} from '../control-plane/owners/service-instance-contract.js';
import {resolveTimeSource} from '../time/time-source.js';
// The lifecycle of one WasmServiceReplica instance as a named state machine
// (R07): CREATED -> STARTING -> READY -> STOPPING -> STOPPED. An instance is
// single-use, as partition and message-group replica instances are used:
// shutdown is its end and a successor is a new instance. Every transition a
// concurrent call must observe happens at call, before any await, so a late
// shutdown never retires or releases what a later call opened, and an
// initialize during an in-flight shutdown is refused typed (REPLICA_RETIRED)
// instead of reopening an instance whose tail is still releasing it.

import {
  reportReplicaHandlerRetirement,
  requireReplicaHandlerRetirement,
  retireReplicaTransportHandler,
} from '../node/replica-transport-handler-identity.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {RAFT_EVENT} from '../raft/raft-operation-port-constants.js';
import {withRaftOpeningCleanupFailure} from '../raft/raft-operation-port.js';
import {wireReplicaLifecycleEvents} from '../raft/replica-leadership-state.js';
import {SessionKVStore} from './session-kv-store.js';
import {WasmWriterState} from './wasm-writer-state.js';
import {
  closeWasmServiceConsensus,
  openWasmServiceConsensusPort,
  openWasmServiceDatabase,
} from './wasm-service-consensus-port.js';
import {
  WASM_SERVICE_ERROR_MSG,
  WASM_SERVICE_LIFECYCLE_REFUSAL,
  WASM_SERVICE_LOG_MSG,
  WASM_SERVICE_NO_FAILURE,
  WASM_SERVICE_REPLICA_STATE,
  WASM_SERVICE_SHUTDOWN_INTENT,
} from './wasm-service-constants.js';

const STATE = WASM_SERVICE_REPLICA_STATE;
const NO_FAILURE = WASM_SERVICE_NO_FAILURE;
// How one open attempt settled, and the lifecycle state each settlement
// owns when no concurrent shutdown took the instance meanwhile (R07: one
// named outcome resolution instead of independent state assignments).
const OPEN_SETTLEMENT = Object.freeze({
  OPENED: 'opened', RELEASED: 'released', CLEANUP_REQUIRED: 'cleanup-required',
});
const OPEN_SETTLEMENT_STATE = Object.freeze({
  [OPEN_SETTLEMENT.OPENED]: STATE.READY,
  [OPEN_SETTLEMENT.RELEASED]: STATE.CREATED,
  [OPEN_SETTLEMENT.CLEANUP_REQUIRED]: STATE.CLEANUP_REQUIRED,
});
const RETIRED_LOCALLY = new Set([RETIREMENT.RETIRED, RETIREMENT.ALREADY]);

/**
 * Join a later failure to the failure custody already owed.
 * @param {Object} prior - A failure, or the named no-failure state.
 * @param {Error} error
 * @return {Error}
 */
function joinFailure(prior, error) {
  return prior === NO_FAILURE ? error : withRaftOpeningCleanupFailure(prior, error);
}

/**
 * The typed refusal of initializing an instance whose shutdown has begun.
 * @param {Object} replica - The WasmServiceReplica.
 * @return {Error}
 */
function replicaRetiredError(replica) {
  const error = new Error(WASM_SERVICE_ERROR_MSG.REPLICA_RETIRED);
  error.code = WASM_SERVICE_LIFECYCLE_REFUSAL.REPLICA_RETIRED;
  error.replicaId = replica.replicaId;
  error.lifecycleState = replica.lifecycleState;
  return error;
}

/**
 * Whether the replica holds live resources: its open is in flight or done
 * and its shutdown has not begun.
 * @param {Object} replica - The WasmServiceReplica.
 * @return {boolean}
 */
function isLiveWasmServiceReplica(replica) {
  return replica.lifecycleState === STATE.STARTING ||
    replica.lifecycleState === STATE.READY ||
    replica.lifecycleState === STATE.CLEANUP_REQUIRED;
}

/**
 * Release the port, then the KV store's borrowed connection and the
 * database itself.
 * @param {Object} replica - The WasmServiceReplica.
 * @return {Promise<void>}
 */
async function releaseWasmServiceReplicaConsensus(replica) {
  await closeWasmServiceConsensus(replica);
}

/**
 * Construct the native resources synchronously (no await: an unbound open
 * stays synchronous up to READY). A bound replica's serving state is decided
 * here from the verified local record and the metadata phase its open
 * resolved (D2'); a replica that opens SERVING never binds native events
 * (Revision 3 N16).
 * @param {Object} replica - The WasmServiceReplica.
 * @param {string|undefined} metadataPhase - The bound open's metadata phase.
 */
function openReplicaResources(replica, metadataPhase) {
  openWasmServiceDatabase(replica);
  let localPhase;
  replica.db.transaction(() => {
    localPhase = openWasmCreationRecords(replica);
    replica.writerState = new WasmWriterState(replica.db, replica.serviceDefinitionId);
    replica.kvStore = new SessionKVStore(replica.db);
  })();
  openWasmServiceConsensusPort(replica);
  wireReplicaLifecycleEvents(replica, {
    events: RAFT_EVENT,
    roles: RAFT_ROLE,
    getCurrentTerm: () => replica.resolveCurrentTermSafe(),
    onLeader: () => replica.onBecameLeader(),
    onFollower: () => replica.onBecameFollower(),
    onCandidate: () => replica.onBecameFollower(),
  });
  openServingState(replica, localPhase, metadataPhase);
  if (replica.servingState !== SERVING.SERVING) replica.creationReconciliation?.bind();
  if (replica.transport) {
    // The exact handler identity is kept so retirement removes only it
    // (owner decision N2). Registration is the open's last step.
    const handler = (message) => replica.handleMessage(message);
    replica.transport.register(replica.unifiedAddress, handler);
    replica.transportHandler = handler;
  }
}

/**
 * Release what a failed open acquired; a failed release retains cleanup custody.
 * @param {Object} replica - The WasmServiceReplica.
 * @param {Error} error - The open failure.
 * @return {Promise<{outcome: string, error: Error}>} RELEASED or CLEANUP_REQUIRED.
 */
async function releaseFailedOpen(replica, error) {
  replica.startupFailure = error;
  try {
    await releaseWasmServiceReplicaConsensus(replica);
  } catch (cleanup) {
    replica.startupFailure = withRaftOpeningCleanupFailure(error, cleanup);
    return {outcome: OPEN_SETTLEMENT.CLEANUP_REQUIRED, error: replica.startupFailure};
  }
  replica.startupFailure = NO_FAILURE;
  return {outcome: OPEN_SETTLEMENT.RELEASED, error};
}

/**
 * Settle one open: the instance takes the settlement's state only while
 * still STARTING; a shutdown that began meanwhile owns the state from here
 * on and the open answers REPLICA_RETIRED.
 * @param {Object} replica - The WasmServiceReplica.
 * @param {{outcome: string, error?: Error}} opening
 */
function settleOpening(replica, opening) {
  const owned = replica.lifecycleState === STATE.STARTING;
  if (owned) replica.lifecycleState = OPEN_SETTLEMENT_STATE[opening.outcome];
  if (opening.outcome !== OPEN_SETTLEMENT.OPENED) throw opening.error;
  if (!owned) throw replicaRetiredError(replica);
}

/**
 * Bound opening first awaits its existing metadata and journal owners, then
 * rechecks STARTING before synchronously constructing native resources.
 * Failure releases acquired resources; failed release retains cleanup custody.
 * @param {Object} replica - The WasmServiceReplica.
 * @return {Promise<void>}
 */
async function openReplica(replica) {
  let opening;
  try {
    let metadataPhase;
    if (replica.consensusCreation !== null) {
      metadataPhase = await resolveWasmCreationAdmission(replica);
      if (replica.lifecycleState !== STATE.STARTING) throw replicaRetiredError(replica);
    }
    openReplicaResources(replica, metadataPhase);
    opening = {outcome: OPEN_SETTLEMENT.OPENED};
  } catch (error) {
    opening = await releaseFailedOpen(replica, error);
  }
  settleOpening(replica, opening);
}

/**
 * Open the replica (see openReplica). READY is a no-op; a concurrent call
 * joins the open in flight; STOPPING/STOPPED is refused typed.
 * @param {Object} replica - The WasmServiceReplica.
 * @return {Promise<void>}
 */
async function initializeWasmServiceReplica(replica) {
  switch (replica.lifecycleState) {
  case STATE.READY:
    return;
  case STATE.STARTING:
    return replica.lifecycleSettlement;
  case STATE.CLEANUP_REQUIRED:
    throw replica.startupFailure === NO_FAILURE ? replicaRetiredError(replica) :
      replica.startupFailure;
  case STATE.STOPPING:
  case STATE.STOPPED:
    throw replicaRetiredError(replica);
  default:
    break;
  }
  const {promise, resolve, reject} = Promise.withResolvers();
  replica.lifecycleState = STATE.STARTING;
  replica.lifecycleSettlement = promise;
  openReplica(replica).then(resolve, reject);
  return promise;
}

/**
 * A retirement's receiver-local tombstone (design D4' step 4, Revision 3
 * N15): written on the replica's still-open connection after its handler is
 * retired and before its port and database close, once the metadata
 * RELEASING attempt has settled (whatever it answered). A replica with no
 * open connection is retired by path by the lifecycle after the shutdown.
 * A tombstone that cannot be written fails the shutdown with the handles
 * still open, so no CLOSED can follow it.
 * @param {Object} replica - The WasmServiceReplica.
 * @param {Object} retirement - The shutdown's captured intent.
 * @return {Promise<void>}
 */
async function tombstoneRetiringReplica(replica, retirement) {
  if (retirement.intent !== WASM_SERVICE_SHUTDOWN_INTENT.RETIRE_RESOURCE ||
      replica.consensusCreation === null) {
    return;
  }
  await retirement.metadataRelease;
  if (replica.db?.open !== true) return;
  const at = resolveTimeSource({timeSource: replica.providedTimeSource}).now();
  const result = tombstoneWasmCreationLocal({db: replica.db}, wasmCreationLocalIdentity(replica),
    {reason: retirement.intent, at});
  requireInstance(RETIRED_LOCALLY.has(result.outcome), result.outcome);
  retireServingState(replica);
  replica.logger.info(WASM_SERVICE_LOG_MSG.CREATION_RETIRED, {
    replicaId: replica.replicaId, outcome: result.outcome,
  });
}

/**
 * Retire the snapshotted handler and release the port and database.
 * @param {Object} replica - The WasmServiceReplica.
 * @param {Function|null} handler - The handler this instance registered.
 * @param {Promise|null} starting - A failing open still releasing.
 * @param {Object} activityFailure - An activity stop still owed, or NO_FAILURE.
 * @param {Object} shutdownIntent - The shutdown's captured retirement intent.
 * @return {Promise<void>}
 */
async function retireReplica(replica, handler, starting, activityFailure, shutdownIntent) {
  // The shutdown caller has already fenced admission and snapshotted this
  // exact registration. Invoke the identity owner's retirement *now*, before
  // joining any asynchronous opening or reconciliation. For a WASM service
  // handler lane is null, so unregisterExact executes in this call stack.
  // Attach both settlement handlers immediately: an early transport failure
  // must stay owned while the opening/reconciliation joins are still pending.
  const retirement = {
    address: replica.unifiedAddress,
    replicaId: replica.replicaId,
  };
  const handlerRetirement = retireReplicaTransportHandler({
    ...retirement,
    transport: replica.transport,
    handler,
    lane: null,
  }).then(
    (outcome) => ({outcome}),
    (error) => ({error}));
  try {
    if (starting) {
      // The failed open releases its own handles first; its error belongs
      // to its initialize caller.
      await Promise.allSettled([starting]);
    }
    try {
      await replica.creationReconciliation?.shutdown();
    } catch (error) {
      activityFailure = joinFailure(activityFailure, error);
    }
    const settled = await handlerRetirement;
    if ('error' in settled) throw settled.error;
    reportReplicaHandlerRetirement(replica.logger, retirement, settled.outcome);
    requireReplicaHandlerRetirement(settled.outcome);
    if (replica.transportHandler === handler) {
      replica.transportHandler = null;
    }
    await tombstoneRetiringReplica(replica, shutdownIntent);
    await releaseWasmServiceReplicaConsensus(replica);
    if (activityFailure !== NO_FAILURE) {
      throw activityFailure;
    }
  } catch (error) {
    // DIAGNOSTIC ONLY: deliberately violate retained native cleanup custody.
    await releaseWasmServiceReplicaConsensus(replica);
    replica.lifecycleState = STATE.CLEANUP_REQUIRED;
    throw error === activityFailure ? error : joinFailure(activityFailure, error);
  }
  replica.startupFailure = NO_FAILURE;
  replica.lifecycleState = STATE.STOPPED;
  replica.logger.info(WASM_SERVICE_LOG_MSG.REPLICA_STOPPED, {
    replicaId: replica.replicaId,
    serviceDefinitionId: replica.serviceDefinitionId,
  });
}

/**
 * Shut the replica down: the transition to STOPPING, the snapshot of the
 * handler it retires, the shutdown's retirement intent and the replica's own
 * activity stop happen at call, before any await; a repeated shutdown joins
 * the one in flight (and its intent: a joiner never assumes a tombstone).
 * @param {Object} replica - The WasmServiceReplica.
 * @param {Function} stopActivity - Stops the replica's timers and
 *   publication helpers (synchronous).
 * @param {Object} retirement - {intent: WASM_SERVICE_SHUTDOWN_INTENT,
 *   metadataRelease?: Promise}.
 * @return {Promise<void>}
 */
async function shutdownWasmServiceReplica(replica, stopActivity, retirement) {
  // A retirement joining an orderly stop cannot claim that stop tombstones.
  // It still retains the debt if the joined cleanup fails and is retried.
  if (replica.lifecycleState !== STATE.STOPPED &&
      retirement.intent === WASM_SERVICE_SHUTDOWN_INTENT.RETIRE_RESOURCE) {
    replica.retainedShutdownIntent ??= retirement;
  }
  switch (replica.lifecycleState) {
  case STATE.STOPPING:
    return replica.lifecycleSettlement;
  case STATE.STOPPED:
    return;
  default:
    break;
  }
  const starting = replica.lifecycleState === STATE.STARTING ?
    replica.lifecycleSettlement : null;
  const {promise, resolve, reject} = Promise.withResolvers();
  replica.lifecycleState = STATE.STOPPING;
  replica.creationReconciliation?.closeAdmission();
  replica.lifecycleSettlement = promise;
  const shutdownIntent = replica.retainedShutdownIntent ?? retirement;
  const handler = replica.transportHandler;
  let activityFailure = NO_FAILURE;
  try {
    stopActivity();
  } catch (error) {
    activityFailure = error;
  }
  // Joiners already see this settlement. Retirement proceeds even if an
  // activity stop failed, but cannot then claim every obligation completed.
  retireReplica(replica, handler, starting, activityFailure, shutdownIntent).then(resolve, reject);
  return promise;
}

export {
  initializeWasmServiceReplica,
  isLiveWasmServiceReplica,
  releaseWasmServiceReplicaConsensus,
  shutdownWasmServiceReplica,
};
