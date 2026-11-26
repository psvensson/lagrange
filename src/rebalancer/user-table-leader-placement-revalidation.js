import {resolvePartitionTableId} from '../bootstrap/system-partition-classification.js';
import {resolveDesiredReplicationFactor} from '../bootstrap/replication-target-authority.js';

const MIN_SETTLED_PARTITION_COUNT = 2;

function hasMatchingActiveVoterFollower(collectOwnVoterFollowers, rebalancer, target) {
  if (!target?.nodeId || !target?.replicaId) {
    return false;
  }
  return collectOwnVoterFollowers(rebalancer).some(
    (follower) =>
      follower.nodeId === target.nodeId &&
      follower.replicaId === target.replicaId,
  );
}

function isSystemCohortStillEligibleForHandoff(
  rebalancer,
  partitionRow,
  decision,
  freshCensus,
  deps,
) {
  const {replicationFactor} = resolveDesiredReplicationFactor(partitionRow);
  const cohort = deps.buildSystemCohortCensus({
    eligibleVoterHosts: freshCensus.systemEligibleVoterHosts,
    nodeId: rebalancer.nodeId,
    ownVoterFollowers: deps.collectOwnVoterFollowers(rebalancer),
    partitionId: rebalancer.entityId,
    settledPartitions:
      deps.resolveSettledSystemPartitionsFromCensus(rebalancer, freshCensus),
    targetReplicaCount: replicationFactor,
  });
  if (
    cohort.sortedSystemPartitionIds.length < MIN_SETTLED_PARTITION_COUNT ||
    deps.isSystemPartitionTargetIneligible(
      {hasInFlightReplicaOperation: false},
      cohort,
    )
  ) {
    return false;
  }
  if (
    decision?.census?.fingerprint &&
    cohort.fingerprint !== decision.census.fingerprint
  ) {
    return false;
  }
  const cohortIndex =
    cohort.sortedSystemPartitionIds.indexOf(rebalancer.entityId);
  const assignedHost =
    cohort.ownActiveVoterHosts[cohortIndex % cohort.ownActiveVoterHosts.length];
  return assignedHost === decision.target.nodeId;
}

function isUserTableCohortStillEligibleForHandoff(
  rebalancer,
  partitionRow,
  decision,
  deps,
) {
  const tableId = resolvePartitionTableId({
    partitionId: rebalancer.entityId,
    partitionRow,
  });
  if (!tableId) {
    return false;
  }
  const settledPartitions = deps.collectSettledTablePartitions(rebalancer, tableId);
  if (settledPartitions.length < MIN_SETTLED_PARTITION_COUNT) {
    return false;
  }
  if (
    decision?.census?.fingerprint &&
    deps.censusFingerprint(settledPartitions) !== decision.census.fingerprint
  ) {
    return false;
  }
  const distinctLeaderHosts = new Set(
    settledPartitions.map((entry) => entry.leaderNodeId).filter(Boolean),
  );
  const eligibleVoterHosts =
    deps.collectEligibleVoterHosts(rebalancer, settledPartitions);
  const requiredLeaderHosts = Math.min(
    settledPartitions.length,
    eligibleVoterHosts.size,
  );
  return distinctLeaderHosts.size < requiredLeaderHosts &&
    !distinctLeaderHosts.has(decision.target.nodeId);
}

// Re-read placement authority after any queue or inbound-drain wait, just
// before the native transfer decision uses its own current role and ConfState.
function isTargetEligibleForHandoff(rebalancer, decision, nowMs, deps) {
  const freshCensus = deps.buildSharedLeaderPlacementPassCensus(rebalancer, nowMs);
  if (!freshCensus) {
    return false;
  }
  if (freshCensus.inFlightReplicaOperationPartitionIds.has(rebalancer.entityId)) {
    return false;
  }
  if (
    !hasMatchingActiveVoterFollower(
      deps.collectOwnVoterFollowers,
      rebalancer,
      decision?.target,
    )
  ) {
    return false;
  }
  const partitionRow = deps.resolveCachedPartitionRow(rebalancer, freshCensus);
  if (!partitionRow || !deps.isSettledPartitionState(partitionRow.state)) {
    return false;
  }
  if (deps.isSystemTableCohortCurePartition(rebalancer, partitionRow)) {
    return isSystemCohortStillEligibleForHandoff(
      rebalancer,
      partitionRow,
      decision,
      freshCensus,
      deps,
    );
  }
  if (deps.isOrdinaryUserTablePartition(rebalancer, partitionRow)) {
    return isUserTableCohortStillEligibleForHandoff(
      rebalancer,
      partitionRow,
      decision,
      deps,
    );
  }
  return false;
}

export {isTargetEligibleForHandoff};
