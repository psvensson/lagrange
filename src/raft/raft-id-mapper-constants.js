const RAFT_ID_MAPPER_DEFAULT = Object.freeze({
  MIN_INTERNAL_NODE_ID: 1,
  CLUSTER_NODE_ID_STEP: 1,
});

const RAFT_ID_MAPPER_ERROR_MSG = Object.freeze({
  INVALID_EXTERNAL_IDS: 'externalIds must be a non-empty array',
  INVALID_INTERNAL_ID_OPTIONS:
    'minInternalNodeId and clusterNodeIdStep must be positive integers',
  INVALID_EXTERNAL_ID: 'externalIds must contain non-empty string values',
  duplicateExternalId: (externalId) =>
    `Duplicate external ID in mapping input: ${externalId}`,
  NON_BIJECTIVE_MAPPING:
    'Raft ID maps must be bijective between external and internal IDs',
});

export {
  RAFT_ID_MAPPER_DEFAULT,
  RAFT_ID_MAPPER_ERROR_MSG,
};
