import {
  RAFT_ID_MAPPER_DEFAULT,
  RAFT_ID_MAPPER_ERROR_MSG,
} from './raft-id-mapper-constants.js';

const LOCAL_STR_STRING = 'string';

/**
 * Build deterministic external<->internal ID maps for a replica set.
 * @param {Array<string>} externalIds
 * @param {Object} [options]
 * @param {number} [options.minInternalNodeId]
 * @param {number} [options.clusterNodeIdStep]
 * @return {{
 *   externalToInternal: Map<string, string>,
 *   internalToExternal: Map<string, string>,
 * }}
 */
function buildDeterministicRaftIdMaps(externalIds, options = {}) {
  if (!Array.isArray(externalIds) || externalIds.length === 0) {
    throw new Error(RAFT_ID_MAPPER_ERROR_MSG.INVALID_EXTERNAL_IDS);
  }

  const minInternalNodeId = Number.isInteger(options.minInternalNodeId) ?
    options.minInternalNodeId :
    RAFT_ID_MAPPER_DEFAULT.MIN_INTERNAL_NODE_ID;
  const clusterNodeIdStep = Number.isInteger(options.clusterNodeIdStep) ?
    options.clusterNodeIdStep :
    RAFT_ID_MAPPER_DEFAULT.CLUSTER_NODE_ID_STEP;

  if (minInternalNodeId < 1 || clusterNodeIdStep < 1) {
    throw new Error(RAFT_ID_MAPPER_ERROR_MSG.INVALID_INTERNAL_ID_OPTIONS);
  }

  const externalToInternal = new Map();
  const internalToExternal = new Map();

  let nextId = minInternalNodeId;
  for (const externalIdValue of externalIds) {
    if (typeof externalIdValue !== LOCAL_STR_STRING || externalIdValue.trim() === '') {
      throw new Error(RAFT_ID_MAPPER_ERROR_MSG.INVALID_EXTERNAL_ID);
    }

    const externalId = String(externalIdValue);
    if (externalToInternal.has(externalId)) {
      throw new Error(
        RAFT_ID_MAPPER_ERROR_MSG.duplicateExternalId(externalId),
      );
    }

    const internalId = String(nextId);
    nextId += clusterNodeIdStep;
    externalToInternal.set(externalId, internalId);
    internalToExternal.set(internalId, externalId);
  }

  assertBijectiveRaftIdMaps(externalToInternal, internalToExternal);
  return {externalToInternal, internalToExternal};
}

/**
 * Validate that the two raft ID maps are bijective.
 * @param {Map<string, string>} externalToInternal
 * @param {Map<string, string>} internalToExternal
 */
function assertBijectiveRaftIdMaps(externalToInternal, internalToExternal) {
  if (externalToInternal.size !== internalToExternal.size) {
    throw new Error(RAFT_ID_MAPPER_ERROR_MSG.NON_BIJECTIVE_MAPPING);
  }

  for (const [externalId, internalId] of externalToInternal.entries()) {
    if (internalToExternal.get(internalId) !== externalId) {
      throw new Error(RAFT_ID_MAPPER_ERROR_MSG.NON_BIJECTIVE_MAPPING);
    }
  }
}

export {
  assertBijectiveRaftIdMaps,
  buildDeterministicRaftIdMaps,
};
