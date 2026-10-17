/**
 * The creation-bound (direct consensus) route of Wasm_Component_Driver: one
 * retained creation per call, read from the replica context exactly as the
 * manager handed it down, never from serviceId-keyed driver bookkeeping
 * (design SERVING-PUBLICATION-RETIREMENT-DESIGN-20261017 D7', Revision 3 N4).
 * A bound start answers HELD or PUBLISHED, never RUNNING and never an
 * endpoint intent; a bound stop is the exact resource's retirement.
 *
 * @module runtime/wasm-component-driver-consensus
 */
import {captureConsensusBootstrap, CONSENSUS_BOOTSTRAP} from
  '../service/service-consensus-bootstrap.js';
import {instanceDigest} from '../control-plane/owners/service-instance-contract.js';
import {START_STATUS} from './runtime-driver.js';
import {DriverLifecycleError} from './runtime-driver-errors.js';
import {WASM_COMPONENT_ERROR, DRIVER_ACTION, DRIVER_SEPARATOR, buildDriverStatusResult} from
  './wasm-component-driver-vocabulary.js';
import {WASM_SERVICES_ROW_MARK} from '../wasm-service/wasm-service-serving-state.js';

function startFailure(detail) {
  return buildDriverStatusResult(START_STATUS.FAILED,
    `${WASM_COMPONENT_ERROR.START_REPLICA_FAILED}${DRIVER_SEPARATOR.DETAIL}${detail}`);
}

// A bound start answer is exactly one of these; anything else is FAILED.
const BOUND_START = Object.freeze({
  NO_RESULT: 'NO_RESULT', HELD: 'HELD', PUBLISHED: 'PUBLISHED', REFUSED: 'REFUSED',
});
function boundStartKind(startResult) {
  const bootstrapped = startResult?.bootstrapped === true;
  return [
    [!startResult, BOUND_START.NO_RESULT],
    [bootstrapped && startResult.started === false &&
      startResult.status === CONSENSUS_BOOTSTRAP.HELD, BOUND_START.HELD],
    [bootstrapped && startResult.started === true &&
      startResult.status === CONSENSUS_BOOTSTRAP.PUBLISHED, BOUND_START.PUBLISHED],
    [true, BOUND_START.REFUSED],
  ].find(([matches]) => matches)[1];
}

function projectBoundStart(driver, startResult, serviceId) {
  const kind = boundStartKind(startResult);
  if (kind === BOUND_START.NO_RESULT) {
    return buildDriverStatusResult(START_STATUS.FAILED,
      WASM_COMPONENT_ERROR.START_REPLICA_NO_RESULT);
  }
  const bound = {consensusBinding: startResult.consensusBinding,
    consensusResourceToken: startResult.consensusResourceToken, genesis: startResult.genesis,
    ...(startResult.grant === undefined ? {} : {grant: startResult.grant})};
  switch (kind) {
  case BOUND_START.HELD:
    return {status: CONSENSUS_BOOTSTRAP.HELD, ...bound};
  case BOUND_START.PUBLISHED:
    driver._running.add(serviceId);
    return {status: CONSENSUS_BOOTSTRAP.PUBLISHED, started: true, bootstrapped: true,
      port: startResult.port, host: startResult.host, ...bound};
  default:
    return {...startFailure(startResult.error || WASM_COMPONENT_ERROR.UNKNOWN_LIFECYCLE_FAILURE),
      ...(startResult.diagnostic ? {diagnostic: startResult.diagnostic} : {})};
  }
}

/**
 * Start the bound replica the driver prepared, through its lifecycle.
 * @param {Object} driver - The WasmComponentDriver.
 * @param {Object} lifecycle - The WasmServiceLifecycle that prepared it.
 * @param {Object} replicaContext - Carries the retained consensusCreation.
 * @param {string} serviceId
 * @return {Promise<Object>} HELD, PUBLISHED or a typed FAILED result.
 */
async function startBoundReplica(driver, lifecycle, replicaContext, serviceId) {
  try {
    const {origin} = captureConsensusBootstrap(driver._prepared.get(serviceId), replicaContext);
    const app = JSON.parse(origin.intent.descriptor.runtimeConfig).definition;
    const startResult = await lifecycle.startReplica(serviceId,
      {handlerFunctionId: app.handlerFunctionId});
    return projectBoundStart(driver, startResult, serviceId);
  } catch (cause) {
    return startFailure(cause.message);
  }
}

function clearRetiredBookkeeping(driver, serviceId, origin) {
  const prepared = driver._prepared.get(serviceId);
  if (instanceDigest(prepared?.consensusResourceToken ?? null) !== instanceDigest(origin.token)) {
    return;
  }
  driver._running.delete(serviceId);
  driver._prepared.delete(serviceId);
  driver._lifecycles.delete(serviceId);
  driver._replicaContexts.delete(serviceId);
}

/**
 * Retire the exact retained resource: WasmServiceLifecycle.retireReplica with
 * the context's creation. Bookkeeping is cleared only for this same creation
 * once its replica is gone; a successor's prepared entry is never touched.
 * @param {Object} driver - The WasmComponentDriver.
 * @param {Object} replicaContext - Carries the retained consensusCreation.
 * @param {string} serviceId
 * @return {Promise<Object>} The lifecycle's typed retirement result.
 */
async function retireBoundReplica(driver, replicaContext, serviceId) {
  const {origin} = captureConsensusBootstrap(replicaContext.definition, replicaContext);
  const lifecycle = driver._wasmServiceLifecycle;
  if (!lifecycle) {
    throw new DriverLifecycleError(driver.kind, DRIVER_ACTION.STOP,
      WASM_COMPONENT_ERROR.CONSENSUS_LIFECYCLE_REQUIRED);
  }
  const result = await lifecycle.retireReplica(origin);
  if (result?.retired === true) clearRetiredBookkeeping(driver, serviceId, origin);
  return result;
}

/**
 * Enable role/leader services-row publication for the bound replica whose
 * services row the runtime projected (design RV2.3, RV3.4): keyed by the exact
 * retained token through the composition root's lifecycle, never by
 * serviceId-keyed driver bookkeeping.
 * @param {Object} driver - The WasmComponentDriver.
 * @param {string} serviceId
 * @param {string} serviceType - The projected row's service_type.
 * @param {Object} consensusResourceToken - The creation's admission token.
 * @return {{outcome: string}} The serving-state mark answer.
 */
function markBoundServicesRowPresent(driver, serviceId, serviceType, consensusResourceToken) {
  const lifecycle = driver._wasmServiceLifecycle;
  if (!lifecycle) return {outcome: WASM_SERVICES_ROW_MARK.NOT_REGISTERED};
  return lifecycle.enableServicesRowPublication(serviceId, serviceType, consensusResourceToken);
}

export {startBoundReplica, retireBoundReplica, markBoundServicesRowPresent};
