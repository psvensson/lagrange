// How a partition replica opens its consensus operation port, and the typed
// startup refusal of a port its runtime owner refused: the port opened its
// group held (its durable record could not be read), a lone replica's
// campaign was refused, or - owner decision O4 - the replica must restore and
// holds no durable record. Every refusal releases what initialization
// acquired (R11) before it is thrown.

import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';
import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {PARTITION_CONSENSUS_STARTUP_OUTCOME} from
  './partition-service-constants.js';

const {PARTITION_SERVICE_ERROR_MSG} = PARTITION_SERVICE_SHARED;

/**
 * The typed startup refusal of a partition its consensus port refused at
 * initialization: the port opened its group held (its durable record could
 * not be read), or a lone replica's campaign was refused.
 * @param {string} partitionId - The partition.
 * @param {Object} answer - What the port answered (a status or a campaign).
 * @return {Error} The error, carrying the typed code, the port's phase and
 *   the port's answer.
 */
function consensusInitRefusedError(partitionId, answer) {
  const error = new Error(PARTITION_SERVICE_ERROR_MSG
    .consensusInitRefused(partitionId, answer));
  error.code = PARTITION_CONSENSUS_STARTUP_OUTCOME.CONSENSUS_INIT_REFUSED;
  error.phase = answer?.phase ?? null;
  error.consensus = answer;
  return error;
}

/**
 * Build the replica's operation port; a port the runtime owner refused to
 * open is the partition's typed init refusal, after shutdown.
 * @param {Object} service - The partition service.
 * @param {Object} request - Its RAFT_PARTITION_NODE_REQUEST.
 * @return {Promise<Object>} The port.
 */
async function openPartitionConsensusPort(service, request) {
  try {
    return service.createOperationPort(request);
  } catch (error) {
    if (error?.consensus?.outcome !== RAFT_OPERATION_OUTCOME.CORE_REFUSED) {
      throw error;
    }
    await service.shutdown();
    throw consensusInitRefusedError(service.partitionId, error.consensus);
  }
}

export {consensusInitRefusedError, openPartitionConsensusPort};
