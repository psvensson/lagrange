// The runtime lifecycle consumes the manager-owned origin, without a second
// PREPARE/START journal or projection. The registered driver remains executor.
import {captureConsensusBootstrap, confirmConsensusBootstrapResult, CONSENSUS_BOOTSTRAP} from
  '../service/service-consensus-bootstrap.js';
import {requireInstance} from '../control-plane/owners/service-instance-contract.js';
import {PREPARE_STATUS} from './runtime-driver.js';
import {projectPublishedConsensus, withdrawRetiredConsensus} from
  './service-runtime-consensus-publication.js';

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
  const bound = captureConsensusBootstrap(definition, context);
  const driver = owner._resolveDriver(bound.descriptor.runtimeKind);
  const result = await driver.start({definition: bound.descriptor,
    serviceId: bound.descriptor.serviceId, consensusCreation: bound.origin});
  // HELD or PUBLISHED only, never a widened non-failed acceptance; no nested
  // journal. A PUBLISHED replica is projected into discovery under its
  // instance-qualified identity (ACTIVATION-DISCOVERY-DESIGN-20261017 RV2.3).
  const confirmed = confirmConsensusBootstrapResult(result, bound.origin);
  if (confirmed.status !== CONSENSUS_BOOTSTRAP.PUBLISHED) return confirmed;
  return projectPublishedConsensus(owner, driver, bound, confirmed);
}
/**
 * Retire the exact retained resource through the registered driver: the
 * bound replica's endpoint is withdrawn first and its services row after
 * CLOSED (service-runtime-consensus-publication.js); the typed retirement
 * result flows back.
 * @param {Object} owner - The ServiceRuntimeLifecycle.
 * @param {Object} definition - The bound descriptor.
 * @param {Object} context - Carries the retained consensusCreation.
 * @return {Promise<Object>}
 */
async function retireConsensusBootstrap(owner, definition, context) {
  const bound = captureConsensusBootstrap(definition, context);
  return withdrawRetiredConsensus(owner, owner._resolveDriver(bound.descriptor.runtimeKind),
    bound);
}
export {prepareConsensusBootstrap, startConsensusBootstrap, retireConsensusBootstrap};
