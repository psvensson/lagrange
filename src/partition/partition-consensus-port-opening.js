// How a partition replica opens its consensus operation port, and the typed
// startup refusal of a port its runtime owner refused: the port opened its
// group held (its durable record could not be read), a lone replica's
// campaign was refused, or - owner decision O4 - the replica must restore and
// holds no durable record. Every refusal releases what initialization
// acquired (R11) before it is thrown.

import {
  consensusInitRefusedError,
  isRaftOpeningFailure,
  withRaftOpeningCleanupFailure,
} from '../raft/raft-operation-port.js';
import {ENTITY_TYPE} from '../constants/addresses.js';

// The partition's typed startup refusal is the port's one refusal, in the
// partition domain, for the group the port was opened for.
function partitionConsensusInitRefusal(service, answer) {
  return consensusInitRefusedError({domain: ENTITY_TYPE.PARTITION,
    identity: {groupId: service.partitionId, replicaId: service.replicaId},
    answer});
}

/**
 * Build the replica's operation port; a port the runtime owner refused to
 * open is the partition's typed init refusal, after shutdown.
 * @param {Object} service - The partition service.
 * @param {Object} request - Its RAFT_OPERATION_PORT_REQUEST.
 * @return {Promise<Object>} The port.
 */
async function openPartitionConsensusPort(service, request) {
  try {
    return service.createOperationPort(request);
  } catch (error) {
    const primary = isRaftOpeningFailure(error) ?
      partitionConsensusInitRefusal(service, error.consensus) : error;
    return cleanupRefusedPartitionStartup(service, primary);
  }
}

// All partition opening refusals (construction, initial status, campaign)
// use this same lifecycle interaction. Cleanup failure cannot replace the
// primary refusal, and pending cleanup cannot admit another opening.
async function refusePartitionConsensusStartup(service, answer) {
  return cleanupRefusedPartitionStartup(service,
    partitionConsensusInitRefusal(service, answer));
}

async function cleanupRefusedPartitionStartup(service, primary) {
  service.startupFailure = primary;
  // If an external shutdown already owns teardown, initialization must reject
  // and let that owner continue after the joined initialization settles.
  if (service.shutdownSettlement) {
    throw primary;
  }
  service.initializationOwnsCleanup = true;
  try {
    await service.shutdown();
  } catch (cleanup) {
    service.startupFailure = withRaftOpeningCleanupFailure(primary, cleanup);
    throw service.startupFailure;
  } finally {
    service.initializationOwnsCleanup = false;
  }
  throw primary;
}

export {openPartitionConsensusPort, refusePartitionConsensusStartup};
