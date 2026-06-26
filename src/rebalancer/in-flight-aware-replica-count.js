import {REBALANCER_MOVE_TYPE as MoveType} from './rebalancer-constants.js';
import {ReplicaStatus} from './replica-status.js';
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
  const occupiedReplicaIds = new Set();
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
    if (OCCUPIED_STATUSES.has(status)) {
      occupiedReplicaIds.add(replicaId);
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

  const activeCount = activeReplicaIds.size;
  return {
    activeCount,
    occupiedCount: occupiedReplicaIds.size,
    inFlightAddCount,
    inFlightReplaceInCreationCount,
    // Count-increasing work only: what a genuine replica-count DEFICIT decision
    // should compare against the target (a REPLACE is net-neutral, never fills a
    // deficit).
    deficitEffectiveCount: activeCount + inFlightAddCount,
    // All replicas that will exist if every in-flight creation lands before any
    // blocked source drains — what an OVER-creation cap must bound.
    creationEffectiveCount:
      activeCount + inFlightAddCount + inFlightReplaceInCreationCount,
  };
}
