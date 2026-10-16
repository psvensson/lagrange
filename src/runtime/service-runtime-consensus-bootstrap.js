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
  // In this increment there is no bound serving/publication implementation.
  // Unknown/nonfailed/RUNNING results cannot accidentally reach the old sinks.
  return confirmConsensusBootstrapResult(result, origin);
}
export {prepareConsensusBootstrap, startConsensusBootstrap};
