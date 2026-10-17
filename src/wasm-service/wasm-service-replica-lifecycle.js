import {resolveWasmCreationAdmission, openWasmCreationRecords} from './wasm-creation-opening.js';
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
  WASM_SERVICE_REPLICA_STATE,
} from './wasm-service-constants.js';

const STATE = WASM_SERVICE_REPLICA_STATE;

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
 * Bound opening first awaits its existing metadata and journal owners,
 * then rechecks STARTING before synchronously constructing native resources.
 * Failure releases acquired resources; failed release retains cleanup custody.
 * @param {Object} replica - The WasmServiceReplica.
 * @return {Promise<void>}
 */
async function openReplica(replica) {
  try {
    if (replica.consensusCreation !== null) {
      await resolveWasmCreationAdmission(replica);
      if (replica.lifecycleState !== STATE.STARTING) throw replicaRetiredError(replica);
    }
    openWasmServiceDatabase(replica);
    replica.db.transaction(() => {
      openWasmCreationRecords(replica);
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
    replica.creationReconciliation?.bind();
    if (replica.transport) {
      // The exact handler identity is kept so retirement removes only it
      // (owner decision N2). Registration is the open's last step.
      const handler = (message) => replica.handleMessage(message);
      replica.transport.register(replica.unifiedAddress, handler);
      replica.transportHandler = handler;
    }
  } catch (error) {
    replica.startupFailure = error;
    try {
      await releaseWasmServiceReplicaConsensus(replica);
    } catch (cleanup) {
      replica.startupFailure = withRaftOpeningCleanupFailure(error, cleanup);
      // A concurrent shutdown retains its existing settlement/ownership.
      if (replica.lifecycleState === STATE.STARTING) {
        replica.lifecycleState = STATE.CLEANUP_REQUIRED;
      }
      throw replica.startupFailure;
    }
    replica.startupFailure = null;
    // A shutdown that began meanwhile owns the state from here on.
    if (replica.lifecycleState === STATE.STARTING) {
      replica.lifecycleState = STATE.CREATED;
    }
    throw error;
  }
  if (replica.lifecycleState !== STATE.STARTING) throw replicaRetiredError(replica);
  replica.lifecycleState = STATE.READY;
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
    throw replica.startupFailure ?? replicaRetiredError(replica);
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
 * Retire the snapshotted handler and release the port and database.
 * @param {Object} replica - The WasmServiceReplica.
 * @param {Function|null} handler - The handler this instance registered.
 * @param {Promise|null} starting - A failing open still releasing.
 * @param {Error|null} activityFailure - An activity stop still owed.
 * @return {Promise<void>}
 */
async function retireReplica(replica, handler, starting, activityFailure) {
  try {
    if (starting) {
      // The failed open releases its own handles first; its error belongs
      // to its initialize caller.
      await Promise.allSettled([starting]);
    }
    try {
      await replica.creationReconciliation?.shutdown();
    } catch (error) {
      activityFailure = activityFailure === null ? error :
        withRaftOpeningCleanupFailure(activityFailure, error);
    }
    // Exact-identity retirement (owner decision N2): a successor's handler
    // at the same address is never removed. No replica-lifecycle activation
    // binds a WASM service handler, so there is no effect section to wait on.
    const retirement = {
      address: replica.unifiedAddress,
      replicaId: replica.replicaId,
    };
    const outcome = await retireReplicaTransportHandler({
      ...retirement,
      transport: replica.transport,
      handler,
      lane: null,
    });
    reportReplicaHandlerRetirement(replica.logger, retirement, outcome);
    requireReplicaHandlerRetirement(outcome);
    if (replica.transportHandler === handler) {
      replica.transportHandler = null;
    }
    await releaseWasmServiceReplicaConsensus(replica);
    if (activityFailure !== null) {
      throw activityFailure;
    }
  } catch (error) {
    replica.lifecycleState = STATE.CLEANUP_REQUIRED;
    throw activityFailure !== null && error !== activityFailure ?
      withRaftOpeningCleanupFailure(activityFailure, error) : error;
  }
  replica.startupFailure = null;
  replica.lifecycleState = STATE.STOPPED;
  replica.logger.info(WASM_SERVICE_LOG_MSG.REPLICA_STOPPED, {
    replicaId: replica.replicaId,
    serviceDefinitionId: replica.serviceDefinitionId,
  });
}

/**
 * Shut the replica down: the transition to STOPPING, the snapshot of the
 * handler it retires and the replica's own activity stop happen at call,
 * before any await; a repeated shutdown joins the one in flight.
 * @param {Object} replica - The WasmServiceReplica.
 * @param {Function} stopActivity - Stops the replica's timers and
 *   publication helpers (synchronous).
 * @return {Promise<void>}
 */
async function shutdownWasmServiceReplica(replica, stopActivity) {
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
  const handler = replica.transportHandler;
  let activityFailure = null;
  try {
    stopActivity();
  } catch (error) {
    activityFailure = error;
  }
  // Joiners already see this settlement. Retirement proceeds even if an
  // activity stop failed, but cannot then claim every obligation completed.
  retireReplica(replica, handler, starting, activityFailure).then(resolve, reject);
  return promise;
}

export {
  initializeWasmServiceReplica,
  isLiveWasmServiceReplica,
  releaseWasmServiceReplicaConsensus,
  shutdownWasmServiceReplica,
};
