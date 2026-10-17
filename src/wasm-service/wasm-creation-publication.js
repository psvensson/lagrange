// The grant half of the keyed bound-creation continuation (design
// SERVING-PUBLICATION-RETIREMENT-DESIGN-20261017 D1', Revision 3 N2/N10):
// after observed genesis, the metadata PUBLISHED CAS on the exact admitted
// slot, then the durable receiver-local PUBLISHED record, then serving. Every
// await is followed by the caller's exact recheck; the local write and the
// serving edge are synchronous after it, so nothing interleaves. Total: every
// failure is a typed outcome, never a throw (the queue never rejects START).
import {SERVICE_INSTANCE_OUTCOME as OUTCOME, SERVICE_INSTANCE_PHASE as PHASE} from
  '../constants/service-instance.js';
import {instanceDigest, requireInstance} from
  '../control-plane/owners/service-instance-contract.js';
import {CONSENSUS_BOOTSTRAP} from '../service/service-consensus-bootstrap.js';
import {resolveTimeSource} from '../time/time-source.js';
import {recordWasmCreationLocalPhase, WASM_CREATION_LOCAL_PHASE as LOCAL_PHASE,
  WASM_CREATION_LOCAL_RECORD as LOCAL_RECORD} from './wasm-creation-opening.js';
import {WASM_CREATION_GENESIS} from './wasm-creation-genesis.js';
import {WASM_SERVICE_LIFECYCLE_REFUSAL as REFUSAL, WASM_SERVICE_LOG_MSG} from
  './wasm-service-constants.js';
import {enableServing, isServing} from './wasm-service-serving-state.js';

/** How one publication attempt ended for its run. */
const WASM_CREATION_PUBLICATION = Object.freeze({
  GRANTED: 'GRANTED', HELD: 'HELD', STOPPED: 'STOPPED',
});
const PUBLICATION = WASM_CREATION_PUBLICATION;
const RECORDED_LOCALLY = new Set([LOCAL_RECORD.RECORDED, LOCAL_RECORD.ALREADY]);

function failureOutcome(error) {
  return error?.outcome ?? error?.code ?? OUTCOME.UNAVAILABLE;
}

async function resolveGrant(owner, binding, token) {
  const answer = await owner.grantInstanceResource(binding, token);
  if (answer?.outcome !== OUTCOME.UNKNOWN) return answer;
  // One authoritative resolution of an unknown answer, never a second CAS.
  const resolved = await owner.resolveInstanceResource(binding, token);
  return resolved?.outcome === OUTCOME.ADMITTED && resolved.phase === PHASE.PUBLISHED ?
    {outcome: PHASE.PUBLISHED, phase: PHASE.PUBLISHED, token: resolved.token} :
    {outcome: OUTCOME.UNKNOWN, reason: resolved?.outcome ?? OUTCOME.UNKNOWN};
}

function granted(grant, token) {
  return grant?.outcome === PHASE.PUBLISHED &&
    instanceDigest(grant.token ?? null) === instanceDigest(token);
}

function held(outcome, reason) {
  return {publication: PUBLICATION.HELD,
    grant: reason === undefined ? {outcome} : {outcome, reason}};
}

function recordLocalGrant(replica, token) {
  const at = resolveTimeSource({timeSource: replica.providedTimeSource}).now();
  const recorded = recordWasmCreationLocalPhase(replica.db, {from: LOCAL_PHASE.ADMITTED,
    to: LOCAL_PHASE.PUBLISHED, detail: {grant: {token, at}}});
  requireInstance(RECORDED_LOCALLY.has(recorded.outcome), recorded.outcome);
}

/**
 * @param {Object} replica - The bound replica whose genesis this run observed.
 * @param {Function} current - The run's exact recheck (registry, port,
 *   creation, READY, no consensus closing).
 * @return {Promise<{publication: string, grant?: Object, flipped?: boolean}>}
 */
async function publishWasmCreation(replica, current) {
  const creation = replica.consensusCreation;
  const binding = creation.intent.consensusBinding;
  let grant;
  try {
    grant = await resolveGrant(replica.serviceDefinitionsOwner, binding, creation.token);
  } catch (error) {
    grant = {outcome: OUTCOME.UNKNOWN, reason: failureOutcome(error)};
  }
  // A stop or replacement that began during the CAS owns the replica: the
  // metadata grant (if it landed) stays counted; nothing local is written.
  if (!current()) return {publication: PUBLICATION.STOPPED};
  if (!granted(grant, creation.token)) return held(grant?.outcome ?? OUTCOME.UNKNOWN);
  try {
    recordLocalGrant(replica, creation.token);
  } catch (error) {
    return held(REFUSAL.LOCAL_GRANT_NOT_RECORDED, failureOutcome(error));
  }
  let flipped;
  try {
    flipped = enableServing(replica);
  } catch (error) {
    return held(REFUSAL.SERVING_ENABLE_FAILED, failureOutcome(error));
  }
  if (flipped) {
    replica.logger.info(WASM_SERVICE_LOG_MSG.CREATION_PUBLISHED, {replicaId: replica.replicaId,
      operationId: creation.token.operationId});
  }
  return {publication: PUBLICATION.GRANTED, grant, flipped};
}

/**
 * The bound START answer mapped from the continuation's result: PUBLISHED
 * only when this run's grant is durable locally and the instance serves;
 * otherwise the existing HELD shape, carrying any typed grant outcome.
 * @param {Object} replica
 * @param {Object} run - The continuation result.
 * @return {Object}
 */
function boundStartResult(replica, run) {
  const creation = replica.consensusCreation;
  const shared = {bootstrapped: true, consensusBinding: creation.intent.consensusBinding,
    consensusResourceToken: creation.token, genesis: run,
    ...(run.grant === undefined ? {} : {grant: run.grant})};
  if (run.outcome === WASM_CREATION_GENESIS.PUBLISHED && isServing(replica)) {
    return {started: true, status: CONSENSUS_BOOTSTRAP.PUBLISHED,
      port: replica.portAllocation, ...shared};
  }
  return {started: false, status: CONSENSUS_BOOTSTRAP.HELD, ...shared};
}

export {publishWasmCreation, boundStartResult, WASM_CREATION_PUBLICATION};
