// The runtime's discovery projection of one bound replica (design
// ACTIVATION-DISCOVERY-DESIGN-20261017, Revision 3 governs: RV3.1 host, RV3.3
// writer answers, RV3.4 token-keyed mark; Revision 2: RV2.3 rows, remover,
// projection order (a); Revision 1: RV1.3 columns). On the lifecycle's
// PUBLISHED (the owner's CAS and the durable local grant already happened) the
// services row and then the endpoint row are written under the
// instance-qualified physical identity, and only then is the replica's
// role/leader publication enabled by the exact token. Any step that does not
// land answers the typed PUBLISHED_UNPROJECTED: serving stays open (the grant
// is the metadata owner's), discovery stays closed, a re-drive re-projects
// UPDATE-first. Retirement withdraws the endpoint before the local stop and the
// services row after CLOSED.
import {RUNTIME_REPLICA_STATUS} from '../constants/runtime.js';
import {CONSENSUS_BOOTSTRAP} from '../service/service-consensus-bootstrap.js';
import {runtimeServiceConsensusIdentity} from '../rebalancer/runtime-service-replica-identity.js';
import {getOrCreateCauseId} from '../utils/cause-id.js';
import {isRetainedStateProjection} from './service-runtime-state-projection-handoff.js';
import {WASM_SERVICES_ROW_MARK as MARK} from '../wasm-service/wasm-service-serving-state.js';

// Why a PUBLISHED bound replica is not (yet) discoverable.
const CONSENSUS_PROJECTION = Object.freeze({
  WRITER_ABSENT: 'PROJECTION_WRITER_ABSENT',
  HOST_UNAVAILABLE: 'ENDPOINT_HOST_UNAVAILABLE',
  SERVICES_ROW_FAILED: 'SERVICES_ROW_PROJECTION_FAILED',
  SERVICES_ROW_RETAINED: 'SERVICES_ROW_PROJECTION_RETAINED',
  ENDPOINT_WRITE_FAILED: 'ENDPOINT_WRITE_FAILED',
  NOT_MARKED: 'SERVICES_ROW_NOT_MARKED',
});
// The serving-state mark answers (wasm-service-serving-state.js) that mean the
// row is PRESENT for exactly this creation.
const PRESENT_MARKS = new Set([MARK.PRESENT, MARK.ALREADY_PRESENT]);

function physicalIdentity(origin) {
  return runtimeServiceConsensusIdentity(origin.intent.consensusBinding,
    origin.intent.consensusSlotRequest);
}

// Existing services columns only (RV1.3, RV2.3 RR4): physical service_id,
// canonical replica_id, the instance group, the creation's operation id as
// create_attempt_token, the derived host as address. No cleanup_token.
function servicesRowColumns(origin, physical, host) {
  return {node_id: physical.nodeId, replica_id: origin.intent.descriptor.replicaId,
    group_id: physical.groupId, create_attempt_token: origin.operationId, address: host};
}

async function projectServicesRow(owner, bound, physical, host, causeId) {
  try {
    const projected = await owner._projectReplicaState(physical.replicaId, bound.descriptor,
      RUNTIME_REPLICA_STATUS.ACTIVE, servicesRowColumns(bound.origin, physical, host), {causeId});
    return isRetainedStateProjection(projected?.projectionResult) ?
      {outcome: CONSENSUS_PROJECTION.SERVICES_ROW_RETAINED} :
      {serviceType: projected.stateRow.service_type};
  } catch (error) {
    return {outcome: CONSENSUS_PROJECTION.SERVICES_ROW_FAILED, error: error.message,
      errorCode: error.code ?? null};
  }
}

async function writeEndpoint(owner, bound, physical, intent, causeId) {
  try {
    const written = await owner._endpointWriter(physical.replicaId, bound.descriptor.runtimeKind,
      intent, {causeId});
    return written?.success === false ?
      {outcome: written.outcome ?? CONSENSUS_PROJECTION.ENDPOINT_WRITE_FAILED} : null;
  } catch (error) {
    return {outcome: CONSENSUS_PROJECTION.ENDPOINT_WRITE_FAILED, error: error.message};
  }
}

function markPresent(driver, descriptor, serviceType, token) {
  const mark = typeof driver.markServicesRowPresent === 'function' ?
    driver.markServicesRowPresent(descriptor.serviceId, serviceType, token) : null;
  return PRESENT_MARKS.has(mark?.outcome) ? {mark: mark.outcome} :
    {outcome: CONSENSUS_PROJECTION.NOT_MARKED, mark: mark?.outcome ?? null};
}

/**
 * Project a confirmed PUBLISHED bound START into discovery.
 * @param {Object} owner - The ServiceRuntimeLifecycle.
 * @param {Object} driver - The bound replica's driver.
 * @param {{origin: Object, descriptor: Object}} bound - The captured bootstrap.
 * @param {Object} confirmed - The confirmed PUBLISHED answer (carries port, host).
 * @return {Promise<Object>} PUBLISHED with its projection, or PUBLISHED_UNPROJECTED.
 */
async function projectPublishedConsensus(owner, driver, bound, confirmed) {
  const unprojected = (projection) =>
    ({...confirmed, status: CONSENSUS_BOOTSTRAP.PUBLISHED_UNPROJECTED, projection});
  if (!owner._stateProjectionWriter || !owner._endpointWriter) {
    return unprojected({outcome: CONSENSUS_PROJECTION.WRITER_ABSENT});
  }
  const host = confirmed.host;
  if (typeof host !== 'string' || host.length === 0) {
    return unprojected({outcome: CONSENSUS_PROJECTION.HOST_UNAVAILABLE});
  }
  const physical = physicalIdentity(bound.origin);
  const causeId = getOrCreateCauseId(bound.origin.operationId);
  const row = await projectServicesRow(owner, bound, physical, host, causeId);
  if (row.outcome !== undefined) return unprojected(row);
  const endpointRefusal = await writeEndpoint(owner, bound, physical, {host,
    port: confirmed.port, consensusBinding: bound.origin.intent.consensusBinding,
    consensusResourceToken: bound.origin.token}, causeId);
  if (endpointRefusal !== null) return unprojected(endpointRefusal);
  const mark = markPresent(driver, bound.descriptor, row.serviceType, bound.origin.token);
  return mark.outcome === undefined ? {...confirmed, projection: mark} : unprojected(mark);
}

/**
 * Retire one bound replica: its endpoint row by physical id first (no
 * logical resolution), then the driver's exact retirement, then on CLOSED the
 * services row's STOPPED projection (row delete by identity). Custody of an
 * unresolved CLOSED keeps the row; the typed result flows back.
 * @param {Object} owner - The ServiceRuntimeLifecycle.
 * @param {Object} driver - The bound replica's driver.
 * @param {{origin: Object, descriptor: Object}} bound - The captured bootstrap.
 * @return {Promise<Object>} The retirement result with the endpoint removal.
 */
async function withdrawRetiredConsensus(owner, driver, bound) {
  const physical = physicalIdentity(bound.origin);
  const endpointRemoval = await owner._removeEndpoint(physical.replicaId, bound.descriptor,
    {consensusBinding: bound.origin.intent.consensusBinding});
  const result = await driver.stop({definition: bound.descriptor,
    serviceId: bound.descriptor.serviceId, consensusCreation: bound.origin});
  if (result?.closed === true) {
    await owner._projectReplicaState(physical.replicaId, bound.descriptor,
      RUNTIME_REPLICA_STATUS.STOPPED, {node_id: physical.nodeId});
  }
  return {...result, endpointRemoval: endpointRemoval ?? null};
}

export {projectPublishedConsensus, withdrawRetiredConsensus};
