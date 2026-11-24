import {resolvePartitionTableId} from '../bootstrap/system-partition-classification.js';
import {resolveDesiredReplicationFactor} from '../bootstrap/replication-target-authority.js';

const MIN_SETTLED_PARTITION_COUNT = 2;
const ALLOW_TARGET_DISPATCH = () => true;

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

function isSystemCohortStillEligibleAfterDemotion(
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

function isUserTableCohortStillEligibleAfterDemotion(
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

/**
 * Revalidate from current systemTableCache after awaiting source leader
 * demotion that the target election leg is still safe to dispatch:
 * 1. optional caller predicate allows dispatch,
 * 2. the partition still has no nonterminal replica operation,
 * 3. decision.target is still an active eligible voter follower, and
 * 4. the partition and its settled cohort remain stable and eligible.
 * @param {Object} rebalancer - Rebalancer or coordinator cure context.
 * @param {Object} decision - Pre-demotion handoff decision.
 * @param {number} nowMs - Post-demotion timestamp.
 * @param {Object} options - Dispatch options.
 * @param {Object} deps - Canonical placement census helpers.
 * @return {boolean} True when target election may still dispatch.
 */
function isTargetEligibleAfterDemotion(
  rebalancer,
  decision,
  nowMs,
  options,
  deps,
) {
  const {shouldDispatchTargetAfterDemotion = ALLOW_TARGET_DISPATCH} =
    options || {};
  if (!shouldDispatchTargetAfterDemotion({decision, nowMs, rebalancer})) {
    return false;
  }
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
    return isSystemCohortStillEligibleAfterDemotion(
      rebalancer,
      partitionRow,
      decision,
      freshCensus,
      deps,
    );
  }
  if (deps.isOrdinaryUserTablePartition(rebalancer, partitionRow)) {
    return isUserTableCohortStillEligibleAfterDemotion(
      rebalancer,
      partitionRow,
      decision,
      deps,
    );
  }
  return false;
}

export {isTargetEligibleAfterDemotion};
