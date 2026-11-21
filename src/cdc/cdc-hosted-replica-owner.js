// The owner of the replicas a node hosts, as the CDC service's leader-qualified
// read reaches it (S0 of the fallback-read closure, lead ruling Q3). That
// owner is the node's replica handler: its registry holds every live replica
// of the node, whatever created it (bootstrap and join attach theirs to it;
// CREATE registers its own). The handler binds itself, at construction, into
// the CDC service's hostedReplicaOwner field; no replica is held here or
// there. A CDC service with no bound handler has no in-process arm: its
// leader-qualified reads go to the owner over the query transport.
const NO_HOSTED_REPLICAS = Object.freeze([]);

/**
 * Bind the node's replica handler to its CDC service (one per service; the
 * handler of a later boot incarnation replaces the earlier binding).
 * @param {Object} cdcIntegrationService - The node's CDC service.
 * @param {Object} owner - The replica handler (hostedPartitionReplicas).
 */
function bindHostedReplicaOwner(cdcIntegrationService, owner) {
  cdcIntegrationService.hostedReplicaOwner = owner;
}

/**
 * The live replicas of a partition the CDC service's node hosts, read from
 * their owner; none when no handler is bound.
 * @param {Object} cdcIntegrationService - The node's CDC service.
 * @param {string} partitionId - The partition.
 * @return {Array<Object>} The hosted PartitionServices, registry order.
 */
function hostedPartitionReplicasOf(cdcIntegrationService, partitionId) {
  const owner = cdcIntegrationService.hostedReplicaOwner;
  return owner === null || owner === undefined ? NO_HOSTED_REPLICAS :
    owner.hostedPartitionReplicas(partitionId);
}

export {bindHostedReplicaOwner, hostedPartitionReplicasOf};
