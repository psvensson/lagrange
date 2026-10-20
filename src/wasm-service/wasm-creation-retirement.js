// WasmServiceLifecycle's retirement of one exact bound resource (design
// SERVING-PUBLICATION-RETIREMENT-DESIGN-20261017 D4', Revision 3 N3/N4/N8/N15).
// Keyed by the retained creation (intent + token), never by the logical
// serviceId a successor may now hold: the matched live replica is fenced at
// call (its user admission closes synchronously), the metadata RELEASING
// attempt is recorded but never blocks the local stop, the receiver-local
// RETIRED tombstone is durable before the metadata CLOSED CAS, and an
// unresolved CLOSED keeps custody with the caller's retained creation.
import fs from 'node:fs';
import {SERVICE_INSTANCE_LIMIT as LIMIT, SERVICE_INSTANCE_OUTCOME as OUTCOME} from
  '../constants/service-instance.js';
import {captureInstanceJson, instanceDigest, instanceFailure, requireInstance} from
  '../control-plane/owners/service-instance-contract.js';
import {matchesInstanceResourceToken} from '../control-plane/owners/service-instance-state.js';
import {runtimeServiceConsensusIdentity} from '../rebalancer/runtime-service-replica-identity.js';
import {captureConsensusCreationIntent} from '../service/service-consensus-creation-intent.js';
import {resolveTimeSource} from '../time/time-source.js';
import {RECONCILE_REASON} from '../workflow/reconcile-queue-constants.js';
import {tombstoneWasmCreationLocal, WASM_CREATION_RETIREMENT as RETIREMENT} from
  './wasm-creation-opening.js';
import {deliverWasmCreationWake} from './wasm-creation-wake.js';
import {WASM_CREATION_RETIREMENT_FINALITY as FINALITY, WASM_SERVICE_LIFECYCLE_REFUSAL as REFUSAL, WASM_SERVICE_NO_FAILURE as NO_FAILURE,
  WASM_SERVICE_SHUTDOWN_INTENT as INTENT} from './wasm-service-constants.js';

// Local outcomes after which nothing local can serve or reopen this resource.
const RETIRED_LOCALLY = new Set([RETIREMENT.RETIRED, RETIREMENT.ALREADY,
  RETIREMENT.CREATION_STORAGE_MISSING]);
const OWNER_METHODS = ['releaseInstanceResource', 'closeInstanceResource'];
const EXACT_TOMBSTONE = new Set([RETIREMENT.RETIRED, RETIREMENT.ALREADY]);

function captureRetirement(lifecycle, value) {
  const intent = captureConsensusCreationIntent(value?.intent);
  const token = captureInstanceJson(value?.token, LIMIT.SLOT_BYTES);
  requireInstance(matchesInstanceResourceToken(intent.consensusBinding,
    intent.consensusSlotRequest, token), OUTCOME.CONTENT_CONFLICT);
  const identity = runtimeServiceConsensusIdentity(intent.consensusBinding,
    intent.consensusSlotRequest);
  requireInstance(identity.nodeId === lifecycle.nodeId, OUTCOME.INVALID_LINEAGE);
  return {intent, token, identity, serviceId: intent.descriptor.serviceId,
    dbPath: lifecycle.dataDirectoryManager.getWasmServiceDbPath(identity.groupId,
      identity.replicaId)};
}

function sameCreation(replica, retired) {
  const creation = replica?.consensusCreation ?? null;
  return creation !== null && instanceDigest(creation.token) === instanceDigest(retired.token) &&
    instanceDigest(creation.intent) === instanceDigest(retired.intent);
}

// The registered or still-retiring instance of this exact creation; a
// successor under the same serviceId is a different creation, never a match.
function retiringTarget(lifecycle, retired) {
  const candidates = [lifecycle.activeReplicas.get(retired.serviceId),
    ...lifecycle.retiringReplicas];
  return candidates.find((replica) => sameCreation(replica, retired)) ?? null;
}

async function settleOwner(call) {
  try {
    const answer = await call();
    return typeof answer?.outcome === 'string' ? answer : {outcome: OUTCOME.UNKNOWN};
  } catch (error) {
    return {outcome: OUTCOME.UNKNOWN, reason: instanceFailure(error).outcome};
  }
}

function failureDetail(failure) {
  return {code: failure?.code ?? failure?.outcome ?? null, message: failure?.message ?? null};
}

// Fence the live instance at call: shutdown() moves it to STOPPING before its
// first await. Its tombstone waits for the RELEASING attempt (any answer).
function fenceTarget(lifecycle, retired, replica, metadataRelease) {
  return lifecycle.stopOwnedReplica(retired.serviceId, replica,
    {intent: INTENT.RETIRE_RESOURCE, metadataRelease})
    .then(() => NO_FAILURE, (failure) => failure);
}

// The file's own identity when it exists (design RECOVERY-DESIGN-20261017
// R1-B, section 7 F-R1: compared when present, never required): a copied or
// replaced file refuses CONTENT_CONFLICT and is never tombstoned (B4).
function presentStorage(lifecycle, retired) {
  if (!fs.existsSync(retired.dbPath)) return {};
  return {storage: lifecycle.dataDirectoryManager.getWasmServiceFileIdentity(
    retired.identity.groupId, retired.identity.replicaId)};
}

function tombstoneByPath(lifecycle, retired) {
  const {groupId, replicaId, nodeId} = retired.identity;
  const at = resolveTimeSource({timeSource: lifecycle.dependencies.timeSource}).now();
  try {
    return tombstoneWasmCreationLocal({dbPath: retired.dbPath},
      {format: LIMIT.FORMAT, groupId, replicaId, nodeId, token: retired.token,
        ...presentStorage(lifecycle, retired)},
      {reason: INTENT.RETIRE_RESOURCE, at});
  } catch (error) {
    return {outcome: instanceFailure(error, error?.code ?? OUTCOME.UNAVAILABLE).outcome};
  }
}

// How the local half of one retirement ended.
const LOCAL_RETIREMENT = Object.freeze({
  BLOCKED: 'BLOCKED', REFUSED: 'REFUSED', DURABLE: 'DURABLE',
});

function captureOrRefuse(lifecycle, value) {
  const owner = lifecycle.dependencies.serviceDefinitionsOwner;
  try {
    const retired = captureRetirement(lifecycle, value);
    requireInstance(OWNER_METHODS.every((method) => typeof owner?.[method] === 'function'),
      OUTCOME.UNAVAILABLE);
    return {retired, owner};
  } catch (error) {
    return {refusal: {outcome: instanceFailure(error).outcome, retired: false, closed: false}};
  }
}

// Fence the live instance (if any), record the RELEASING attempt, then make
// the tombstone durable: on the live connection inside the shutdown, or by
// path once no handle is open.
async function retireLocally(lifecycle, {retired, owner}) {
  const binding = retired.intent.consensusBinding;
  const replica = retiringTarget(lifecycle, retired);
  const released = Promise.withResolvers();
  const fenced = replica === null ? Promise.resolve(NO_FAILURE) :
    fenceTarget(lifecycle, retired, replica, released.promise);
  const release = await settleOwner(() => owner.releaseInstanceResource(binding, retired.token));
  released.resolve(release);
  const failure = await fenced;
  // A failed shutdown that still holds the file: no tombstone can be
  // trusted, so no CLOSED follows; an explicit re-stop re-enters it (N8).
  if (replica?.db?.open === true) {
    return {state: LOCAL_RETIREMENT.BLOCKED, release, failure: failureDetail(failure)};
  }
  const tombstone = tombstoneByPath(lifecycle, retired);
  return {state: RETIRED_LOCALLY.has(tombstone.outcome) ? LOCAL_RETIREMENT.DURABLE :
    LOCAL_RETIREMENT.REFUSED, release, tombstone};
}

async function closeRetired(lifecycle, {retired, owner}, {release, tombstone}) {
  const close = await settleOwner(() => owner.closeInstanceResource(
    retired.intent.consensusBinding, retired.token));
  return close.outcome === OUTCOME.CLOSED ?
    {outcome: OUTCOME.CLOSED, retired: true, closed: true, finality: FINALITY.FINAL,
      release, tombstone, close,
      wake: deliverWasmCreationWake(lifecycle, retired,
        RECONCILE_REASON.CREATION_RESOURCE_CLOSED)} :
    {outcome: RETIREMENT.CLOSE_UNRESOLVED, retired: true, closed: false,
      finality: close.outcome === OUTCOME.HISTORY_UNAVAILABLE &&
        EXACT_TOMBSTONE.has(tombstone.outcome) ? FINALITY.FINAL : FINALITY.UNRESOLVED,
      release, tombstone,
      close};
}

/**
 * @param {Object} lifecycle - The WasmServiceLifecycle of this node.
 * @param {Object} value - The retained creation ({intent, token, ...}).
 * @return {Promise<Object>} {outcome, retired, closed, release, tombstone,
 *   close, wake} with outcome CLOSED, CLOSE_UNRESOLVED or a typed refusal.
 */
async function retireWasmCreation(lifecycle, value) {
  const retirement = captureOrRefuse(lifecycle, value);
  if (retirement.refusal !== undefined) {
    return {...retirement.refusal, finality: FINALITY.UNRESOLVED};
  }
  const local = await retireLocally(lifecycle, retirement);
  switch (local.state) {
  case LOCAL_RETIREMENT.BLOCKED:
    return {outcome: REFUSAL.RETIREMENT_BLOCKED_CLEANUP_REQUIRED, retired: false, closed: false,
      finality: FINALITY.FINAL,
      release: local.release, failure: local.failure};
  case LOCAL_RETIREMENT.REFUSED:
    return {outcome: local.tombstone.outcome, retired: false, closed: false,
      finality: FINALITY.UNRESOLVED,
      release: local.release, tombstone: local.tombstone};
  default:
    return closeRetired(lifecycle, retirement, local);
  }
}

export {retireWasmCreation};
