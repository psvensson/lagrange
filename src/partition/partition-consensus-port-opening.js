// How a partition replica opens its consensus operation port, and the typed
// startup refusal of a port its runtime owner refused: the port opened its
// group held (its durable record could not be read), a lone replica's
// campaign was refused, or - owner decision O4 - the replica must restore and
// holds no durable record. Every refusal releases what initialization
// acquired (R11) before it is thrown.

import {
  assertConsensusNotHeldAtOpen,
  consensusInitRefusedError,
  consensusOpeningFailure,
  withRaftOpeningCleanupFailure,
} from '../raft/raft-operation-port.js';
import {ENTITY_TYPE} from '../constants/addresses.js';

// The partition's opening: the partition domain, for the group the port was
// opened for. Its typed startup refusal is the port's one refusal.
function partitionConsensusOpening(service) {
  return {domain: ENTITY_TYPE.PARTITION,
    identity: {groupId: service.partitionId, replicaId: service.replicaId}};
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
    return cleanupRefusedPartitionStartup(service,
      consensusOpeningFailure(error, partitionConsensusOpening(service)));
  }
}

/**
 * Refuse a port that opened the partition's group held by its host failure,
 * releasing what initialization acquired (R11), as every opening refusal.
 * @param {Object} service - The partition service.
 * @param {Object} opened - The port's status read at open.
 * @return {Promise<void>}
 */
async function refusePartitionConsensusHeldAtOpen(service, opened) {
  try {
    assertConsensusNotHeldAtOpen(opened, partitionConsensusOpening(service));
  } catch (refusal) {
    await cleanupRefusedPartitionStartup(service, refusal);
  }
}

// All partition opening refusals (construction, initial status, campaign)
// use this same lifecycle interaction. Cleanup failure cannot replace the
// primary refusal, and pending cleanup cannot admit another opening.
async function refusePartitionConsensusStartup(service, answer) {
  return cleanupRefusedPartitionStartup(service,
    consensusInitRefusedError({...partitionConsensusOpening(service), answer}));
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

export {openPartitionConsensusPort, refusePartitionConsensusHeldAtOpen,
  refusePartitionConsensusStartup};
