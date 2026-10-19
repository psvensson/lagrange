// ServiceLifecycleManager's physical continuation of its one retained CREATE.
// Lower runtime owners consume this origin; none may mint a nested journal.
import {SERVICE_LIFECYCLE_STATE, UNIFIED_SERVICE_TYPE} from '../constants/index.js';
import {SERVICE_INSTANCE_LIMIT as LIMIT, SERVICE_INSTANCE_OUTCOME as OUTCOME,
  SERVICE_INSTANCE_PHASE as PHASE} from '../constants/service-instance.js';
import {captureInstanceJson, instanceDigest, instanceFailure, requireInstance} from
  '../control-plane/owners/service-instance-contract.js';
import {matchesInstanceResourceToken} from '../control-plane/owners/service-instance-state.js';
import {CONSENSUS_CREATION_OPENING, captureConsensusCreationIntent,
  completeConsensusCreation, prepareConsensusCreation, recoverConsensusCreation} from
  './service-consensus-creation-intent.js';
import {WASM_SERVICE_LIFECYCLE_REFUSAL} from '../wasm-service/wasm-service-constants.js';
import {projectCreationReplicaState} from './service-lifecycle-state-record.js';
import {WASM_CREATION_RETIREMENT_FINALITY as FINALITY} from
  '../wasm-service/wasm-service-constants.js';

const CONSENSUS_BOOTSTRAP = Object.freeze({
  HELD: 'BOOTSTRAPPED_HELD', ADMISSION: 'ADMISSION_RETAINED',
  // The exact admitted resource is granted, durably recorded locally and
  // serving (design SERVING-PUBLICATION-RETIREMENT-DESIGN-20261017 D7').
  PUBLISHED: 'PUBLISHED',
  // PUBLISHED and serving, but the runtime's discovery projection did not land
  // (design ACTIVATION-DISCOVERY-DESIGN-20261017 RV1.3/RV2.3): never retired,
  // the manager keeps STARTING and a re-drive re-projects.
  PUBLISHED_UNPROJECTED: 'PUBLISHED_UNPROJECTED',
  // Physical retirement is final; discovery withdrawal is still owed.
  RETIRED_UNPROJECTED: 'RETIRED_UNPROJECTED',
  CONTEXT_REQUIRED: 'CONSENSUS_CREATION_CONTEXT_REQUIRED',
  SERVING_UNAVAILABLE: 'CONSENSUS_SERVING_NOT_IMPLEMENTED',
});
// Delivery of a creation wake to the operation owner of the original CREATE.
const CREATION_WAKE_OUTCOME = Object.freeze({
  DELIVERED: 'DELIVERED', UNDELIVERED: 'UNDELIVERED', CONSUMER_ABSENT: 'CONSUMER_ABSENT',
});
const FIELDS = ['consensusBinding', 'consensusSlotRequest', 'consensusResourceToken'];
function hasConsensusCreation(value) {
  return value !== null && typeof value === 'object' &&
    FIELDS.some((field) => Object.hasOwn(value, field));
}
function consensusBootstrapDescriptor(origin) {
  return {...origin.intent.descriptor, consensusBinding: origin.intent.consensusBinding,
    consensusSlotRequest: origin.intent.consensusSlotRequest, consensusResourceToken: origin.token};
}
function captureConsensusBootstrap(definition, context) {
  requireInstance(context?.consensusCreation?.outcome === CONSENSUS_BOOTSTRAP.ADMISSION,
    CONSENSUS_BOOTSTRAP.CONTEXT_REQUIRED);
  const retained = context.consensusCreation;
  const intent = captureConsensusCreationIntent(retained.intent);
  const token = captureInstanceJson(retained.token, LIMIT.SLOT_BYTES);
  requireInstance(matchesInstanceResourceToken(intent.consensusBinding,
    intent.consensusSlotRequest, token), OUTCOME.CONTENT_CONFLICT);
  requireInstance(retained.operationId === token.operationId, OUTCOME.CONTENT_CONFLICT);
  const origin = {intent, token, operationId: token.operationId,
    outcome: CONSENSUS_BOOTSTRAP.ADMISSION};
  const descriptor = consensusBootstrapDescriptor(origin);
  requireInstance(instanceDigest(captureInstanceJson(definition, LIMIT.STATE_BYTES)) ===
    instanceDigest(descriptor), OUTCOME.CONTENT_CONFLICT);
  return {origin, descriptor};
}
// A bound START answer is accepted only as HELD, PUBLISHED or
// PUBLISHED_UNPROJECTED, and only for the exact original binding and resource
// token. Both serving answers additionally require the started flag: never a
// widened non-failed acceptance.
const SERVING_STATUSES = new Set([CONSENSUS_BOOTSTRAP.PUBLISHED,
  CONSENSUS_BOOTSTRAP.PUBLISHED_UNPROJECTED]);
const CONFIRMED_STATUSES = new Set([CONSENSUS_BOOTSTRAP.HELD, ...SERVING_STATUSES]);
// The open's permanent typed refusals that reach the handler as the outcome
// itself (design RECOVERY-DESIGN-20261017 R1-B, R2-E, R3-C): a closed set.
// UNAVAILABLE is the one named exception, answered UNKNOWN{UNAVAILABLE} (R3-B);
// every other FAILED driver answer keeps the SERVING_UNAVAILABLE refusal.
const PERMANENT_OPEN_REFUSALS = new Set([CONSENSUS_CREATION_OPENING.STORAGE_MISSING,
  OUTCOME.CORRUPT_STATE, OUTCOME.CONTENT_CONFLICT, OUTCOME.RESOURCE_CLOSED,
  WASM_SERVICE_LIFECYCLE_REFUSAL.CREATION_RETIRED]);
// The runtime and the manager both confirm one START answer: an answer the
// runtime already mapped is passed through unchanged by the manager.
function unavailableOpen(result) {
  return result?.outcome === OUTCOME.UNAVAILABLE ||
    (result?.outcome === OUTCOME.UNKNOWN && result.reason === OUTCOME.UNAVAILABLE);
}
function refusedOpen(result, origin) {
  if (CONFIRMED_STATUSES.has(result?.status)) return null;
  if (PERMANENT_OPEN_REFUSALS.has(result?.outcome)) {
    return {outcome: result.outcome, operationId: origin.operationId};
  }
  return unavailableOpen(result) ?
    {outcome: OUTCOME.UNKNOWN, reason: OUTCOME.UNAVAILABLE, operationId: origin.operationId} :
    null;
}
function confirmConsensusBootstrapResult(result, origin) {
  const refusal = refusedOpen(result, origin);
  if (refusal !== null) return refusal;
  requireInstance(CONFIRMED_STATUSES.has(result?.status) &&
    (!SERVING_STATUSES.has(result.status) || result.started === true) &&
    instanceDigest(result.consensusBinding ?? null) ===
      instanceDigest(origin.intent.consensusBinding) &&
    instanceDigest(result.consensusResourceToken ?? null) === instanceDigest(origin.token),
  CONSENSUS_BOOTSTRAP.SERVING_UNAVAILABLE);
  return {...result, operationId: origin.operationId};
}
const AUTHORITY = Object.freeze({
  CONFIRMED: 'CONFIRMED', UNRESOLVED: 'UNRESOLVED', CONTRADICTED: 'CONTRADICTED',
});
// Owner answers that definitively contradict a PUBLISHED claim for the token.
const CONTRADICTING_OUTCOMES = new Set([OUTCOME.ADMITTED, OUTCOME.HISTORY_UNAVAILABLE,
  OUTCOME.CONTENT_CONFLICT]);
function publishedAuthority(current, token) {
  const confirmed = current?.outcome === OUTCOME.ADMITTED &&
    current.phase === PHASE.PUBLISHED &&
    instanceDigest(current.token ?? null) === instanceDigest(token);
  return confirmed ? AUTHORITY.CONFIRMED : CONTRADICTING_OUTCOMES.has(current?.outcome) ?
    AUTHORITY.CONTRADICTED : AUTHORITY.UNRESOLVED;
}
/**
 * The manager's own retirement of one retained creation (design D4'/N4): the
 * handle's retained creation, never a serviceId-keyed map, travels through
 * the existing adapter -> runtime -> driver -> WasmServiceLifecycle chain.
 * No generic STOP row is written and no transition is asserted: custody of an
 * unresolved CLOSED stays the creation row, and the typed result is returned.
 * @param {Object} manager - The ServiceLifecycleManager.
 * @param {Object} handle - {definition, consensusCreation, consensusOpeningOwner}.
 * @return {Promise<Object>} The typed retirement result.
 */
async function retireConsensusCreation(manager, handle) {
  let operationId = null;
  try {
    const {origin, descriptor} = captureConsensusBootstrap(handle?.definition, handle);
    operationId = origin.operationId;
    const adapter = manager._resolveAdapter(UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE);
    projectCreationReplicaState(manager, {consensusCreation: origin},
      SERVICE_LIFECYCLE_STATE.STOPPING);
    const result = await adapter.stopReplica({definition: descriptor, consensusCreation: origin,
      consensusOpeningOwner: handle.consensusOpeningOwner ?? manager});
    if (result?.finality !== FINALITY.FINAL) return {...result, operationId};
    projectCreationReplicaState(manager, {consensusCreation: origin},
      SERVICE_LIFECYCLE_STATE.STOPPED);
    if (result.status === CONSENSUS_BOOTSTRAP.RETIRED_UNPROJECTED) {
      return {...result, operationId};
    }
    // Only the runtime's completed STOPPED projection permits the original
    // journal CAS. Physical finality alone leaves that debt unresolved.
    return {...result, operationId,
      completion: await completeConsensusCreation(manager, origin, result)};
  } catch (error) {
    const failure = instanceFailure(error);
    return operationId === null ? failure :
      {outcome: OUTCOME.UNKNOWN, reason: failure.outcome, operationId};
  }
}
// A PUBLISHED answer is presentation until the metadata owner confirms the
// exact slot PUBLISHED (D7'/N9). A contradicted claim retires the resource by
// its retained creation; an unreachable owner leaves the claim unconfirmed.
async function confirmPublishedAuthority(manager, owned, confirmed) {
  const {intent, token, operationId} = owned.consensusCreation;
  let current;
  try {
    current = await manager._serviceDefinitionsOwner.resolveInstanceResource(
      intent.consensusBinding, token);
  } catch (error) {
    current = instanceFailure(error);
  }
  switch (publishedAuthority(current, token)) {
  case AUTHORITY.CONFIRMED:
    // A confirmed PUBLISHED_UNPROJECTED keeps STARTING: serving, not yet
    // discoverable; never RUNNING and never retired (design Revision 4, F-1).
    if (confirmed.status === CONSENSUS_BOOTSTRAP.PUBLISHED) {
      projectCreationReplicaState(manager, owned, SERVICE_LIFECYCLE_STATE.RUNNING);
    }
    return confirmed;
  case AUTHORITY.CONTRADICTED:
    return {outcome: OUTCOME.UNKNOWN, reason: OUTCOME.CONTENT_CONFLICT, operationId,
      retirement: await retireConsensusCreation(manager, owned)};
  default:
    return {outcome: OUTCOME.UNKNOWN, reason: current?.outcome ?? OUTCOME.UNKNOWN, operationId};
  }
}
// The physical continuation of one retained creation answer, whichever owner
// read produced it (prepare for a new intent, recover for a retained one).
async function continueRetainedCreation(manager, retained) {
  let operationId = null;
  try {
    if (retained.outcome !== CONSENSUS_BOOTSTRAP.ADMISSION) return retained;
    operationId = retained.operationId;
    const descriptor = consensusBootstrapDescriptor(retained);
    const adapter = manager._resolveAdapter(UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE);
    const owned = {definition: descriptor, consensusCreation: retained,
      consensusOpeningOwner: manager};
    await adapter.createReplica(owned);
    projectCreationReplicaState(manager, owned, SERVICE_LIFECYCLE_STATE.STARTING);
    const result = await adapter.startReplica(owned);
    const confirmed = confirmConsensusBootstrapResult(result, retained);
    // The creation row stays IN_PROGRESS for a PUBLISHED answer too: the
    // COMPLETED-row re-entry belongs to the recovery stage (Revision 2 D7').
    // Both serving answers are presentation until the metadata owner confirms
    // the exact slot PUBLISHED (A-B5); ACTIVATION-DISCOVERY-DESIGN-20261017
    // Revision 4 supersedes RR5's "returns before any re-resolve".
    if (!SERVING_STATUSES.has(confirmed.status)) return confirmed;
    return await confirmPublishedAuthority(manager, owned, confirmed);
  } catch (error) {
    // The original intent/admission remains IN_PROGRESS, including on a
    // partially opened resource. No FAILED/COMPLETED row discharges custody.
    const failure = instanceFailure(error);
    return operationId === null ? failure :
      {outcome: OUTCOME.UNKNOWN, reason: failure.outcome, operationId};
  }
}
async function bootstrapConsensusCreation(manager, value, context = {}) {
  return continueRetainedCreation(manager,
    await prepareConsensusCreation(manager, value, context));
}
/**
 * Resume one retained creation by its operation id (design RV2.2): the
 * manager's own recover and its continuation in one pass, so the journal, the
 * runtime policy and the metadata resolve run once per re-entry.
 * @param {Object} manager - The ServiceLifecycleManager.
 * @param {string} operationId - The creation's operation id.
 * @param {Object} [context] - The lifecycle context.
 * @return {Promise<Object>} A bound START answer or a typed outcome.
 */
async function resumeConsensusCreation(manager, operationId, context = {}) {
  return continueRetainedCreation(manager,
    await recoverConsensusCreation(manager, operationId, context));
}
export {CONSENSUS_BOOTSTRAP, CREATION_WAKE_OUTCOME, hasConsensusCreation,
  consensusBootstrapDescriptor, captureConsensusBootstrap, confirmConsensusBootstrapResult,
  bootstrapConsensusCreation, resumeConsensusCreation, retireConsensusCreation};
