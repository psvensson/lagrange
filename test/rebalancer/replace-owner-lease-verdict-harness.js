/**
 * Harness for the REPLACE owner-lease verdict evidence (quest
 * replace-source-removal-owner, narrowed scope L1/L2; record
 * solve/epics/raft-rs-full-cutover/quest-records/replace-source-removal-owner/
 * evidence-lease-verdict.md).
 *
 * Every expectation derives from the two authorities the frozen claim names:
 * the owner-availability contract (operation-owner-availability-policy.js
 * :7-15) and the owner-lease record (replica-operation-owner-lease.js). Cells
 * are built from the lease record's own stamping rule and classified by its
 * own state resolver, so the universe covers the lease enumeration by
 * construction. Workflow steps, operation types and step statuses are
 * imported from their enums and the per-type workflow authority; the
 * recorded owner comes from the repository's owner resolution. The routing
 * heuristic is driven through its authority (the readiness service the
 * owner's isNodeReadyForRouting reads), never by stubbing the verdict.
 */

import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OPERATION_DRAIN_OWNER_AVAILABILITY,
} from '../../src/rebalancer/operation-owner-availability-policy.js';
import {
  OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED,
} from '../../src/rebalancer/operation-workflow-recovery-reconcile-shared.js';
import {
  REPLICA_OPERATION_OWNER_LEASE_STATE,
  REPLICA_OPERATION_OWNER_LEASE_TTL_MS,
  resolveOperationOwnerLeaseExpiryForPersist,
  resolveOperationOwnerLeaseState,
} from '../../src/rebalancer/replica-operation-owner-lease.js';
import {
  WORKFLOW_STEP_TO_STATUS,
  isTerminalStep,
  isValidWorkflowStep,
} from '../../src/rebalancer/replica-status.js';
import {
  OperationType,
  ReplicaOperationResponseStatus,
  ReplicaStatus,
  buildPriorityDrainOwnerUnavailableReadinessService,
  createTestCoordinator,
  installActualReplicaObservationResolver,
} from './rebalance-coordinator-stopping-reconcile-fixtures.js';

// A priority-control-plane partition: the drain, its release and the
// re-entry wake only act on this class (H3 of the design census).
const LEASE_VERDICT_PARTITION_ID = 'sql_write_operations-p1';
const LEASE_VERDICT_OPERATION_ID = 'replace-owner-lease-verdict-op';
// Row roles, not owners: the recorded owner is whatever the repository's
// owner resolution answers for the row (the target for a priority REPLACE).
const LEASE_VERDICT_NODE = Object.freeze({
  SOURCE: 'lease-verdict-source',
  TARGET: 'lease-verdict-target',
  SEED: 'lease-verdict-seed',
  OTHER: 'lease-verdict-other',
});
const LEASE_VERDICT_REPLICA = Object.freeze({
  SOURCE: `${LEASE_VERDICT_PARTITION_ID}-r1`,
  TARGET: `${LEASE_VERDICT_PARTITION_ID}-r4`,
});
// A virtual owner clock far from the host clock: a decision that reads the
// ambient clock instead of the owner's sees every lease here as expired.
const LEASE_VERDICT_NOW_MS = 1_000_001_000_000;
const LEASE_VERDICT_SETTLE_OFFSET_MS = 1_000;
const LEASE_VERDICT_EDGE_MS = 1;
const LEASE_VERDICT_ENTITY_TYPE = 'partition';
const LEASE_VERDICT_VOTER_ROLE = 'follower';
const LEASE_VERDICT_NO_UNAVAILABLE_NODE = 'lease-verdict-nobody';
const LEASE_VERDICT_SOURCE_UNAVAILABLE =
  OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED
    .STOPPING_REPLICA_OBSERVATION_STATE.UNAVAILABLE;

// The lease cells, each defined by the lease record's own stamping rule
// (expiry = updatedAt + TTL) and checked against its own state resolver.
const LEASE_CELL = Object.freeze({
  UNFENCED: 'unfenced',
  EXPIRED_PAST: 'expired_past',
  EXPIRED_AT_BOUNDARY: 'expired_at_boundary',
  LIVE_AT_EDGE: 'live_at_edge',
  LIVE: 'live',
});

const LEASE_CELL_EXPECTED_STATE = Object.freeze(new Map([
  [LEASE_CELL.UNFENCED, REPLICA_OPERATION_OWNER_LEASE_STATE.UNFENCED],
  [LEASE_CELL.EXPIRED_PAST, REPLICA_OPERATION_OWNER_LEASE_STATE.EXPIRED],
  [LEASE_CELL.EXPIRED_AT_BOUNDARY, REPLICA_OPERATION_OWNER_LEASE_STATE.EXPIRED],
  [LEASE_CELL.LIVE_AT_EDGE, REPLICA_OPERATION_OWNER_LEASE_STATE.ACTIVE],
  [LEASE_CELL.LIVE, REPLICA_OPERATION_OWNER_LEASE_STATE.ACTIVE],
]));

const LEASE_CELL_UPDATED_AT_MS = Object.freeze(new Map([
  [LEASE_CELL.UNFENCED, LEASE_VERDICT_NOW_MS - LEASE_VERDICT_SETTLE_OFFSET_MS],
  [
    LEASE_CELL.EXPIRED_PAST,
    LEASE_VERDICT_NOW_MS - REPLICA_OPERATION_OWNER_LEASE_TTL_MS -
      LEASE_VERDICT_EDGE_MS,
  ],
  [
    LEASE_CELL.EXPIRED_AT_BOUNDARY,
    LEASE_VERDICT_NOW_MS - REPLICA_OPERATION_OWNER_LEASE_TTL_MS,
  ],
  [
    LEASE_CELL.LIVE_AT_EDGE,
    LEASE_VERDICT_NOW_MS - REPLICA_OPERATION_OWNER_LEASE_TTL_MS +
      LEASE_VERDICT_EDGE_MS,
  ],
  [LEASE_CELL.LIVE, LEASE_VERDICT_NOW_MS - LEASE_VERDICT_SETTLE_OFFSET_MS],
]));

/**
 * Every (operation type, workflow step) pair from the two enums, classified
 * by the per-type workflow authority: a step the type never takes is not a
 * row that can exist and is reported as excluded, never silently dropped.
 * @return {{rows: Array, excluded: Array}}
 */
function enumerateOperationTypeSteps() {
  const rows = [];
  const excluded = [];
  for (const type of Object.values(OperationType)) {
    for (const step of Object.values(WORKFLOW_STEP)) {
      const terminal = isTerminalStep(type, step);
      if (isValidWorkflowStep(type, step) || terminal) {
        rows.push({type, step, terminal});
      } else {
        excluded.push({type, step});
      }
    }
  }
  return {rows, excluded};
}

function stampLeaseCell(row, leaseCell, writerNodeId) {
  const updatedAt = LEASE_CELL_UPDATED_AT_MS.get(leaseCell);
  row.updated_at = updatedAt;
  if (leaseCell !== LEASE_CELL.UNFENCED) {
    row.lease_expires_at = resolveOperationOwnerLeaseExpiryForPersist(
      {updatedAt},
      writerNodeId,
    );
  }
  return row;
}

/**
 * Build a durable operation row whose lease is stamped by the lease record's
 * rule. The harness pre-stamps it; production stamps only on the insert
 * touch and the gateway UPDATE payload (record, limits).
 * @param {Object} options - {type, step, leaseCell, stepEnteredAtMs}
 * @return {Object} replica_operations row
 */
function buildLeaseVerdictOperationRow(options) {
  const type = options.type || OperationType.REPLACE;
  const step = options.step;
  const updatedAt = LEASE_CELL_UPDATED_AT_MS.get(options.leaseCell);
  const stepEnteredAtMs = Number.isFinite(options.stepEnteredAtMs) ?
    options.stepEnteredAtMs :
    Math.min(updatedAt, LEASE_VERDICT_NOW_MS - LEASE_VERDICT_SETTLE_OFFSET_MS);
  const createdAt = stepEnteredAtMs - LEASE_VERDICT_EDGE_MS;
  const history = [{
    step: WORKFLOW_STEP.PENDING,
    timestamp: createdAt,
    sourceReplicaId: LEASE_VERDICT_REPLICA.SOURCE,
  }];
  if (step !== WORKFLOW_STEP.PENDING) {
    history.push({step, timestamp: stepEnteredAtMs});
  }
  const row = {
    operation_id: LEASE_VERDICT_OPERATION_ID,
    type,
    partition_id: LEASE_VERDICT_PARTITION_ID,
    replica_id: LEASE_VERDICT_REPLICA.TARGET,
    source_node_id: LEASE_VERDICT_NODE.SOURCE,
    target_node_id: LEASE_VERDICT_NODE.TARGET,
    status: WORKFLOW_STEP_TO_STATUS[step] ?? ReplicaStatus[step],
    workflow_step: step,
    created_at: createdAt,
    completed_at: isTerminalStep(type, step) ? stepEnteredAtMs : null,
    error_message: null,
    entity_type: LEASE_VERDICT_ENTITY_TYPE,
    entity_id: LEASE_VERDICT_PARTITION_ID,
    steps_history: JSON.stringify(history),
  };
  return stampLeaseCell(row, options.leaseCell, LEASE_VERDICT_NODE.TARGET);
}

function buildServiceRow(replicaId, nodeId, status) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    service_type: LEASE_VERDICT_ENTITY_TYPE,
    partition_id: LEASE_VERDICT_PARTITION_ID,
    node_id: nodeId,
    raft_role: LEASE_VERDICT_VOTER_ROLE,
    status,
    address: `${nodeId}/partition/${replicaId}`,
  };
}

/**
 * Service rows: the target replica in `targetStatus` and the source replica
 * in `sourceStatus` (null: absent).
 * @param {string|null} sourceStatus
 * @param {string|null} [targetStatus]
 * @return {Array<Object>}
 */
function buildLeaseVerdictServiceRows(
  sourceStatus,
  targetStatus = ReplicaStatus.ACTIVE,
) {
  const rows = [];
  if (targetStatus !== null) {
    rows.push(buildServiceRow(
      LEASE_VERDICT_REPLICA.TARGET,
      LEASE_VERDICT_NODE.TARGET,
      targetStatus,
    ));
  }
  if (sourceStatus !== null) {
    rows.push(buildServiceRow(
      LEASE_VERDICT_REPLICA.SOURCE,
      LEASE_VERDICT_NODE.SOURCE,
      sourceStatus,
    ));
  }
  return rows;
}

/**
 * The readiness service whose answers ARE the routing heuristic's input.
 * @param {boolean} ownerRoutingReady
 * @param {string} ownerNodeId
 * @return {Object}
 */
function buildLeaseVerdictReadinessService(ownerRoutingReady, ownerNodeId) {
  return buildPriorityDrainOwnerUnavailableReadinessService(
    LEASE_VERDICT_PARTITION_ID,
    ownerRoutingReady ? LEASE_VERDICT_NO_UNAVAILABLE_NODE : ownerNodeId,
  );
}

function installSourceObservation(coordinator, sourceObservation) {
  if (sourceObservation === LEASE_VERDICT_SOURCE_UNAVAILABLE) {
    coordinator.repository.getActualReplicaObservation = async () =>
      Object.freeze({state: LEASE_VERDICT_SOURCE_UNAVAILABLE});
    return;
  }
  // A lifecycle status (present) or null (absent), answered authoritatively.
  installActualReplicaObservationResolver(
    coordinator,
    async () => sourceObservation,
  );
}

/**
 * A remote (non-owner) coordinator holding one durable operation row, on a
 * controlled owner clock. Deliveries are recorded.
 * @param {Object} cell - {type, step, leaseCell, stepEnteredAtMs,
 *   observerNodeId, recordedOwnerNodeId, ownerRoutingReady, sourceObservation,
 *   targetStatus}
 * @return {Object}
 */
function createLeaseVerdictRemoteCoordinator(cell) {
  const deliveries = [];
  const sourceRowStatus =
    cell.sourceObservation === LEASE_VERDICT_SOURCE_UNAVAILABLE ?
      ReplicaStatus.ACTIVE :
      cell.sourceObservation;
  const coordinator = createTestCoordinator({
    nodeId: cell.observerNodeId,
    enableTimeouts: false,
    messageRouter: {
      async deliver(target, payload) {
        deliveries.push(`${payload?.type}->${target}`);
        return {
          acknowledged: true,
          status: ReplicaOperationResponseStatus.INITIATED,
        };
      },
    },
    controlPlaneReadinessService: buildLeaseVerdictReadinessService(
      cell.ownerRoutingReady,
      cell.recordedOwnerNodeId,
    ),
    cacheData: {
      services: buildLeaseVerdictServiceRows(
        sourceRowStatus,
        cell.targetStatus === undefined ? ReplicaStatus.ACTIVE : cell.targetStatus,
      ),
      replicaOperations: [buildLeaseVerdictOperationRow(cell)],
    },
  });
  coordinator.workflowOwner.timeSource = {now: () => LEASE_VERDICT_NOW_MS};
  installSourceObservation(coordinator, cell.sourceObservation);
  return {coordinator, deliveries};
}

/**
 * The contract oracle: the verdict the module's contract (:7-15) and the
 * lease record prescribe, derived without the implementation.
 * @param {Object} input - {ownerNodeId, nodeId, operation, nowMs, ready}
 * @return {{state: string, unavailable: boolean, ownersLiveLease: boolean}}
 */
function resolveContractOwnerAvailability(input) {
  const ownerNodeId = typeof input.ownerNodeId === 'string' &&
    input.ownerNodeId.length > 0 ? input.ownerNodeId : null;
  if (ownerNodeId === null || ownerNodeId === input.nodeId) {
    return {
      state: OPERATION_DRAIN_OWNER_AVAILABILITY.LOCAL_OR_UNKNOWN_OWNER,
      unavailable: false,
      ownersLiveLease: false,
    };
  }
  const lease = resolveOperationOwnerLeaseState(input.operation, input.nowMs);
  // The row carries no owner column: an unattributed live lease is the
  // recorded owner's (lease record :91-96); an attributed one counts only
  // when its holder IS the recorded owner.
  const ownersLiveLease =
    lease.state === REPLICA_OPERATION_OWNER_LEASE_STATE.ACTIVE &&
    (lease.ownerNodeId === null || lease.ownerNodeId === ownerNodeId);
  if (ownersLiveLease) {
    return {
      state: OPERATION_DRAIN_OWNER_AVAILABILITY.FENCED_BY_LIVE_LEASE,
      unavailable: false,
      ownersLiveLease,
    };
  }
  return {
    state: input.ready ?
      OPERATION_DRAIN_OWNER_AVAILABILITY.HEURISTIC_AVAILABLE :
      OPERATION_DRAIN_OWNER_AVAILABILITY.HEURISTIC_UNAVAILABLE,
    unavailable: input.ready !== true,
    ownersLiveLease,
  };
}

export {
  LEASE_CELL,
  LEASE_CELL_EXPECTED_STATE,
  LEASE_CELL_UPDATED_AT_MS,
  LEASE_VERDICT_NODE,
  LEASE_VERDICT_NOW_MS,
  LEASE_VERDICT_OPERATION_ID,
  LEASE_VERDICT_PARTITION_ID,
  LEASE_VERDICT_REPLICA,
  LEASE_VERDICT_SOURCE_UNAVAILABLE,
  buildLeaseVerdictOperationRow,
  buildLeaseVerdictReadinessService,
  buildLeaseVerdictServiceRows,
  createLeaseVerdictRemoteCoordinator,
  enumerateOperationTypeSteps,
  resolveContractOwnerAvailability,
  stampLeaseCell,
};
