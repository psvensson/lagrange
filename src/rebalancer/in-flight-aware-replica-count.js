import {REBALANCER_MOVE_TYPE as MoveType} from './rebalancer-constants.js';
import {ReplicaStatus} from './replica-status.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {WORKFLOW_STEP} from '../constants/index.js';

// Single authoritative in-flight-aware replica accounting for one partition.
//
// Committed replica ROWS lag in-flight work: a REPLACE/ADD operation is tracked
// in replica_operations the moment it is dispatched, but the target's replica
// row does not materialize until CREATE_REPLICA lands (and a replacement never
// reaches voter-ready under load). Any over-target / deficit decision that reads
// only rows therefore UNDER-counts work already in flight and re-creates surplus
// (the rolling-restart over-replication drain stall: replacements pile up across
// hopping target nodes faster than blocked source removals drain them, pushing a
// critical partition over its voter target and dead-locking learner promotion).
//
// This is the ONE place that joins committed rows with in-flight operations.
// Callers derive their own thresholds from the returned breakdown (provisioning
// fan-out, the single-replace overshoot allowance, deficit fill are genuinely
// different POLICIES on the same COUNT) but never re-count, so the count
// invariant has a single owner instead of several disagreeing authors.

const OCCUPIED_STATUSES = new Set([
  ReplicaStatus.PENDING,
  ReplicaStatus.CREATING,
  ReplicaStatus.SYNCING,
  ReplicaStatus.ACTIVE,
]);

const ADD_TRANSITIONAL_STATUSES = new Set([
  ReplicaStatus.PENDING,
  ReplicaStatus.CREATING,
  ReplicaStatus.SYNCING,
]);

// A replica row is "not live" for voter accounting once it is failing or being
// torn down. Mirrors the promotion guard's isLiveReplicaServiceRowForPromotion
// (partition-service-learner-promotion-methods.js) so the two reads agree.
const NON_LIVE_STATUSES = new Set([
  ReplicaStatus.FAILED,
  ReplicaStatus.REMOVING,
  ReplicaStatus.REMOVED,
]);

// Authoritative raft VOTER roles — the promotion guard's ACTIVE_VOTER_ROLES
// (partition-service-shared.js). A LEARNER is a non-voting catch-up member and
// is excluded; a promoted voter carries one of these roles the instant it is
// promoted, BEFORE its status column catches up to ACTIVE.
const VOTER_RAFT_ROLES = new Set([
  RAFT_ROLE.LEADER,
  RAFT_ROLE.FOLLOWER,
  RAFT_ROLE.CANDIDATE,
]);

// True when a committed row is an authoritative raft voter: live (not
// failed/removing/removed) AND holding a voter raft_role. This is the SAME
// predicate the learner-promotion guard enforces on (countActiveVoters), so a
// read built on it cannot disagree with the guard by construction. Crucially it
// does NOT require status === ACTIVE: a just-promoted voter reads
// raft_role=follower while its status still lags at creating/syncing, and that
// row IS a voter for quorum/target purposes.
function isLiveVoterRow(replica, normalizedStatus) {
  if (NON_LIVE_STATUSES.has(normalizedStatus)) {
    return false;
  }
  const role = trimmedString(replica?.raft_role).toLowerCase();
  return VOTER_RAFT_ROLES.has(role);
}

function trimmedString(value) {
  return String(value || '').trim();
}

function normalizeReplicaId(replica) {
  return trimmedString(replica?.replica_id || replica?.service_id);
}

function operationType(operation) {
  return trimmedString(
    operation?.type || operation?.operation_type || operation?.operationType,
  ).toLowerCase();
}

function operationPartitionId(operation) {
  return trimmedString(
    operation?.partition_id ||
      operation?.partitionId ||
      operation?.entity_id ||
      operation?.entityId,
  );
}

// An operation is "add-transitional" when it is bringing a replica up (pending /
// creating / syncing / dispatch-sending) — i.e. a replacement is being created.
// This keys on the workflow step / status, NOT the operation type, so a REPLACE
// whose replacement is mid-creation counts the same as an ADD in creation.
const SENDING_STEP_LOWER = String(WORKFLOW_STEP.SENDING).toLowerCase();

function isAddTransitional(operation) {
  const workflowStep = operation?.workflow_step || operation?.workflowStep || null;
  const normalizedStep = workflowStep ?
    String(workflowStep).toLowerCase() :
    null;
  // The dispatch step (the planner's own classifier compares the raw enum
  // "SENDING") is add-transitional; compare case-insensitively so both the raw
  // enum and lower-cased forms are recognized.
  if (normalizedStep === SENDING_STEP_LOWER) {
    return true;
  }
  const state = normalizedStep || trimmedString(operation?.status).toLowerCase();
  return ADD_TRANSITIONAL_STATUSES.has(state);
}

/**
 * Compute the in-flight-aware replica accounting for one partition.
 *
 * @param {Object} options
 * @param {Array<Object>} options.currentReplicas committed replica rows
 * @param {Array<Object>} options.inFlightOperations topology-blocking in-flight ops
 * @param {string|null} options.partitionId restrict ops to this partition (null = all given)
 * @return {{
 *   activeCount: number,
 *   activeVoterCount: number,
 *   occupiedCount: number,
 *   inFlightAddCount: number,
 *   inFlightReplaceInCreationCount: number,
 *   deficitEffectiveCount: number,
 *   creationEffectiveCount: number,
 * }}
 */
export function computeInFlightAwareReplicaAccounting({
  currentReplicas = [],
  inFlightOperations = [],
  partitionId = null,
} = {}) {
  const targetPartition = trimmedString(partitionId);
  const activeReplicaIds = new Set();
  // Authoritative raft-voter set (raft_role based), counted separately from the
  // status===ACTIVE set so an over-target decision can read the SAME voters the
  // promotion guard enforces on and stop under-counting a just-promoted voter
  // whose status column still lags at creating/syncing.
  const activeVoterReplicaIds = new Set();
  const occupiedReplicaIds = new Set();
  // Materialized-but-not-yet-active replica rows (durable learners) indexed by
  // node, so a drain-phase REPLACE can be row-op-linked to the specific
  // replacement row sitting on its target node (see the credit pass below).
  const nonActiveOccupiedByNode = new Map();
  for (const replica of currentReplicas) {
    if (!replica?.node_id) {
      continue;
    }
    const replicaId = normalizeReplicaId(replica);
    if (!replicaId) {
      continue;
    }
    const status = trimmedString(replica?.status || ReplicaStatus.ACTIVE).toLowerCase();
    if (status === ReplicaStatus.ACTIVE) {
      activeReplicaIds.add(replicaId);
    }
    if (isLiveVoterRow(replica, status)) {
      activeVoterReplicaIds.add(replicaId);
    }
    if (OCCUPIED_STATUSES.has(status)) {
      occupiedReplicaIds.add(replicaId);
      if (status !== ReplicaStatus.ACTIVE) {
        const nodeId = trimmedString(replica.node_id);
        if (!nonActiveOccupiedByNode.has(nodeId)) {
          nonActiveOccupiedByNode.set(nodeId, new Set());
        }
        nonActiveOccupiedByNode.get(nodeId).add(replicaId);
      }
    }
  }

  let inFlightAddCount = 0;
  let inFlightReplaceInCreationCount = 0;
  for (const operation of inFlightOperations) {
    if (!isAddTransitional(operation)) {
      continue;
    }
    const opPartition = operationPartitionId(operation);
    if (targetPartition && opPartition && opPartition !== targetPartition) {
      continue;
    }
    const type = operationType(operation);
    if (type === MoveType.ADD) {
      // An ADD op's replica_id IS the new replica it is creating; if that row
      // already exists (occupied) it is already counted above — do not double
      // count.
      const opReplicaId = trimmedString(operation?.replica_id || operation?.replicaId);
      if (opReplicaId && occupiedReplicaIds.has(opReplicaId)) {
        continue;
      }
      inFlightAddCount += 1;
    } else if (type === MoveType.REPLACE) {
      // A REPLACE op's replica_id is the SOURCE being removed (already an active
      // row); the replacement is a brand-new replica with no row yet, so it is a
      // transient +1 above the still-present source until the (often blocked)
      // source removal lands. Count it as creation pressure, not deficit fill.
      inFlightReplaceInCreationCount += 1;
    }
  }

  // Row-op-linked drain-phase REPLACE credit. A REPLACE is USUALLY net-neutral
  // (its source is still an active voter, so its slot is already in activeCount).
  // But once the source has DRAINED (left activeCount) while the replacement is
  // still a durable non-voting LEARNER (a materialized syncing/creating row, not
  // yet ACTIVE), that replacement's slot is counted NOWHERE: activeCount dropped
  // with the source, and deficitEffectiveCount excludes REPLACE replacements. The
  // planner then reads a false deficit, mints a spurious count-increasing ADD, and
  // the group overshoots target (4 voters / 3), concentrates, and stalls. Credit
  // exactly the specific replacement row on the op's target node (industry
  // pattern: TiKV/PD "current + in-flight operator influence"; CockroachDB counts
  // the learner). Row-op-linked — NOT an occupied-count heuristic — so stale
  // learners unlinked to a REPLACE, replacements already ACTIVE, and net-neutral
  // (source-still-active) REPLACEs are all correctly excluded.
  let drainPhaseReplacementCredit = 0;
  const creditedReplacementIds = new Set();
  for (const operation of inFlightOperations) {
    if (operationType(operation) !== MoveType.REPLACE) {
      continue;
    }
    const opPartition = operationPartitionId(operation);
    if (targetPartition && opPartition && opPartition !== targetPartition) {
      continue;
    }
    const sourceReplicaId = trimmedString(
      operation?.replica_id || operation?.replicaId,
    );
    // Net-neutral REPLACE: source still an active voter -> already counted.
    if (sourceReplicaId && activeReplicaIds.has(sourceReplicaId)) {
      continue;
    }
    const targetNodeId = trimmedString(
      operation?.target_node_id || operation?.targetNodeId,
    );
    const candidates = targetNodeId ?
      nonActiveOccupiedByNode.get(targetNodeId) :
      null;
    if (!candidates) {
      continue;
    }
    // Bind to exactly one materialized non-active replacement row on the target
    // node, excluding the source and any row already credited to another REPLACE
    // (two REPLACEs cannot both claim one learner).
    for (const replicaId of candidates) {
      if (replicaId === sourceReplicaId ||
        creditedReplacementIds.has(replicaId)) {
        continue;
      }
      creditedReplacementIds.add(replicaId);
      drainPhaseReplacementCredit += 1;
      break;
    }
  }

  const activeCount = activeReplicaIds.size;
  return {
    activeCount,
    // Authoritative voter count by raft_role (guard-parity). Differs from
    // activeCount exactly during the promotion window, where a promoted voter
    // reads raft_role=follower but status=creating/syncing: activeCount misses
    // it, activeVoterCount sees it. Used by the over-creation cap so the cap
    // fires on the SAME surplus the promotion guard is blocked by.
    activeVoterCount: activeVoterReplicaIds.size,
    occupiedCount: occupiedReplicaIds.size,
    inFlightAddCount,
    inFlightReplaceInCreationCount,
    drainPhaseReplacementCredit,
    // Count-increasing work only: what a genuine replica-count DEFICIT decision
    // should compare against the target. A net-neutral REPLACE never fills a
    // deficit, but a drain-phase REPLACE whose source has left activeCount and
    // whose replacement is a durable learner DOES occupy the slot — credit it so
    // the planner does not re-fill an already-filled slot and overshoot target.
    deficitEffectiveCount:
      activeCount + inFlightAddCount + drainPhaseReplacementCredit,
    // All replicas that will exist if every in-flight creation lands before any
    // blocked source drains — what an OVER-creation cap must bound.
    creationEffectiveCount:
      activeCount + inFlightAddCount + inFlightReplaceInCreationCount,
  };
}
