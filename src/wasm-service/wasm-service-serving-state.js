// The one serving fence of a WasmServiceReplica instance (design
// SERVING-PUBLICATION-RETIREMENT-DESIGN-20261017 D3', Revision 3 N2/N16).
// An unbound replica is OPEN; a creation-bound replica is HELD until the run
// that recorded its local PUBLISHED grant (or the open-time check of a
// recorded grant against metadata PUBLISHED) flips it to SERVING, and RETIRED
// once its tombstone is durable. User work is admitted only while the state
// serves AND the instance is READY: the READY term is the synchronous
// STOPPING fence, so a stopping replica answers nothing. The HELD -> SERVING
// edge is the process-local latch of the leader-effect replay; the durable
// phase is only the restart latch.
import {SERVICE_INSTANCE_PHASE as PHASE} from '../constants/service-instance.js';
import {WASM_CREATION_LOCAL_PHASE as LOCAL_PHASE} from './wasm-creation-opening.js';
import {WASM_SERVICE_ERROR_MSG, WASM_SERVICE_REPLICA_STATE as STATE} from
  './wasm-service-constants.js';
import {admitWasmBootstrapCommand, admitWasmServiceCommand} from
  './wasm-service-committed-command-admission.js';
import {WRITER_REASON, WRITER_STATUS} from './wasm-writer-profile.js';

const WASM_SERVICE_SERVING_STATE = Object.freeze({
  OPEN: 'OPEN', HELD: 'HELD', SERVING: 'SERVING', RETIRED: 'RETIRED',
});
const SERVING = WASM_SERVICE_SERVING_STATE;
const ADMITTING_STATES = new Set([SERVING.OPEN, SERVING.SERVING]);
// A bound replica past its STOPPING fence refuses typed WRITER_SHUTDOWN;
// before READY it is not ready yet.
const STOPPED_LIFECYCLE_STATES = new Set([STATE.STOPPING, STATE.STOPPED,
  STATE.CLEANUP_REQUIRED]);
const UNBOUND_REFUSAL = Object.freeze({error: WASM_SERVICE_ERROR_MSG.SERVICE_NOT_READY});

/** @param {Object} replica - Set the constructed instance's serving state. */
function initializeServingState(replica) {
  replica.servingState = replica.consensusCreation === null ? SERVING.OPEN : SERVING.HELD;
}

/**
 * The open-time serving decision of a bound replica (D2'): SERVING only when
 * the local record is PUBLISHED and the metadata answered PUBLISHED for the
 * exact token at this open; a local grant without metadata PUBLISHED is HELD.
 * @param {Object} replica
 * @param {string|undefined} localPhase - The verified local record phase.
 * @param {string|undefined} metadataPhase - The phase this open resolved.
 */
function openServingState(replica, localPhase, metadataPhase) {
  if (replica.consensusCreation === null) return;
  replica.servingState = localPhase === LOCAL_PHASE.PUBLISHED &&
    metadataPhase === PHASE.PUBLISHED ? SERVING.SERVING : SERVING.HELD;
}

/**
 * @param {Object} replica
 * @return {boolean} Whether user work, timers and leader effects are admitted.
 */
function isServing(replica) {
  return ADMITTING_STATES.has(replica.servingState) && replica.lifecycleState === STATE.READY;
}

/**
 * Role/leader services-row publication: unbound replicas only. The row a
 * bound replica would CAS is owned by the deferred discovery stage (D3').
 * @param {Object} replica
 * @return {boolean}
 */
function publishesServicesRow(replica) {
  return replica.consensusCreation === null;
}

function boundRefusalReason(replica) {
  return STOPPED_LIFECYCLE_STATES.has(replica.lifecycleState) ?
    WRITER_REASON.SHUTDOWN : WRITER_REASON.NOT_READY;
}

/**
 * The typed refusal of user work, or null while the replica serves.
 * @param {Object} replica
 * @return {Object|null}
 */
function servingRefusal(replica) {
  if (isServing(replica)) return null;
  return replica.consensusCreation === null ? UNBOUND_REFUSAL :
    {status: WRITER_STATUS.REFUSED, reason: boundRefusalReason(replica), identity: null};
}

/**
 * The admission of a bound replica's proposal: full admission while serving,
 * genesis-only admission while held and READY, a typed refusal otherwise.
 * @param {Object} replica - A creation-bound replica.
 * @param {Object} entry - The command about to be proposed.
 * @return {Object} An admission ({admitted: true} or a typed refusal).
 */
function boundProposalAdmission(replica, entry) {
  if (isServing(replica)) return admitWasmServiceCommand(entry);
  if (replica.lifecycleState === STATE.READY) return admitWasmBootstrapCommand(entry);
  return {admitted: false, reason: boundRefusalReason(replica), type: entry?.type ?? null};
}

/**
 * The HELD -> SERVING edge, taken at most once per instance: replays the
 * admission-independent leader effects the held state suppressed, then
 * serves. Refused (false) unless READY and not yet serving; an effect that
 * throws leaves the state HELD so a later re-entry replays it exactly once.
 * @param {Object} replica - A creation-bound replica whose local grant is durable.
 * @return {boolean} Whether this call performed the edge.
 */
function enableServing(replica) {
  if (replica.servingState !== SERVING.HELD || replica.lifecycleState !== STATE.READY) {
    return false;
  }
  if (replica.isLeader) replica.applyLeaderEffects();
  replica.servingState = SERVING.SERVING;
  return true;
}

/** @param {Object} replica - Mark a bound replica whose tombstone is durable. */
function retireServingState(replica) {
  replica.servingState = SERVING.RETIRED;
}

export {WASM_SERVICE_SERVING_STATE, initializeServingState, openServingState, isServing,
  publishesServicesRow, servingRefusal, boundProposalAdmission, enableServing,
  retireServingState};
