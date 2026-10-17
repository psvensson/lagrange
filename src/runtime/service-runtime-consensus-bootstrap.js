// The runtime lifecycle consumes the manager-owned origin, without a second
// PREPARE/START journal or projection. The registered driver remains executor.
import {captureConsensusBootstrap, confirmConsensusBootstrapResult, CONSENSUS_BOOTSTRAP} from
  '../service/service-consensus-bootstrap.js';
import {requireInstance} from '../control-plane/owners/service-instance-contract.js';
import {PREPARE_STATUS} from './runtime-driver.js';

async function prepareConsensusBootstrap(owner, definition, context) {
  const {origin, descriptor} = captureConsensusBootstrap(definition, context);
  const driver = owner._resolveDriver(descriptor.runtimeKind);
  const result = await driver.prepare(descriptor, {consensusCreation: origin,
    consensusOpeningOwner: context.consensusOpeningOwner});
  requireInstance(result?.status === PREPARE_STATUS.READY,
    result?.error ?? CONSENSUS_BOOTSTRAP.CONTEXT_REQUIRED);
  return {...result, operationId: origin.operationId};
}
async function startConsensusBootstrap(owner, definition, context) {
  const {origin, descriptor} = captureConsensusBootstrap(definition, context);
  const driver = owner._resolveDriver(descriptor.runtimeKind);
  const result = await driver.start({definition: descriptor,
    serviceId: descriptor.serviceId, consensusCreation: origin});
  // HELD or PUBLISHED only, never a widened non-failed acceptance. A bound
  // replica has no endpoint row, state projection or nested journal in this
  // stage: those rows need the deferred discovery stage's identity design.
  return confirmConsensusBootstrapResult(result, origin);
}
/**
 * Retire the exact retained resource through the registered driver. The
 * typed retirement result flows back unchanged; nothing published the bound
 * replica's endpoint or state, so nothing is removed or projected here.
 * @param {Object} owner - The ServiceRuntimeLifecycle.
 * @param {Object} definition - The bound descriptor.
 * @param {Object} context - Carries the retained consensusCreation.
 * @return {Promise<Object>}
 */
async function retireConsensusBootstrap(owner, definition, context) {
  const {origin, descriptor} = captureConsensusBootstrap(definition, context);
  const driver = owner._resolveDriver(descriptor.runtimeKind);
  return driver.stop({definition: descriptor, serviceId: descriptor.serviceId,
    consensusCreation: origin});
}
export {prepareConsensusBootstrap, startConsensusBootstrap, retireConsensusBootstrap};
