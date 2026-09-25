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
 * construction. The routing heuristic is driven through its authority (the
 * readiness service the owner's isNodeReadyForRouting reads), never by
 * stubbing the verdict.
 */

import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OPERATION_DRAIN_OWNER_AVAILABILITY,
} from '../../src/rebalancer/operation-owner-availability-policy.js';
import {
  REPLICA_OPERATION_OWNER_LEASE_STATE,
  REPLICA_OPERATION_OWNER_LEASE_TTL_MS,
  resolveOperationOwnerLeaseExpiryForPersist,
  resolveOperationOwnerLeaseState,
} from '../../src/rebalancer/replica-operation-owner-lease.js';
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
const LEASE_VERDICT_NODE = Object.freeze({
  SOURCE: 'lease-verdict-source',
  OWNER: 'lease-verdict-owner',
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

// The three REPLACE phases the release decision admits (design census H1):
// ACTIVE, STOPPING, and SYNCING with the target observed ACTIVE.
const REPLACE_PHASES = Object.freeze([
  WORKFLOW_STEP.ACTIVE,
  WORKFLOW_STEP.STOPPING,
  WORKFLOW_STEP.SYNCING,
]);

const REPLACE_PHASE_STATUS = Object.freeze(new Map([
  [WORKFLOW_STEP.ACTIVE, ReplicaStatus.ACTIVE],
  [WORKFLOW_STEP.STOPPING, ReplicaStatus.REMOVING],
  [WORKFLOW_STEP.SYNCING, ReplicaStatus.SYNCING],
]));

// A present source: an ACTIVE voter, or REMOVING once STOPPING has issued it.
const REPLACE_PHASE_PRESENT_SOURCE_STATUS = Object.freeze(new Map([
  [WORKFLOW_STEP.ACTIVE, ReplicaStatus.ACTIVE],
  [WORKFLOW_STEP.STOPPING, ReplicaStatus.REMOVING],
  [WORKFLOW_STEP.SYNCING, ReplicaStatus.ACTIVE],
]));

function stampLeaseCell(row, leaseCell, holderNodeId) {
  const updatedAt = LEASE_CELL_UPDATED_AT_MS.get(leaseCell);
  row.updated_at = updatedAt;
  if (leaseCell !== LEASE_CELL.UNFENCED) {
    row.lease_expires_at = resolveOperationOwnerLeaseExpiryForPersist(
      {updatedAt},
      holderNodeId,
    );
  }
  return row;
}

/**
 * Build a durable REPLACE row with its lease stamped by the lease record.
 * @param {Object} options
 * @return {Object} replica_operations row
 */
function buildLeaseVerdictReplaceRow(options) {
  const step = options.step;
  const updatedAt = LEASE_CELL_UPDATED_AT_MS.get(options.leaseCell);
  const stepEnteredAtMs = Number.isFinite(options.stepEnteredAtMs) ?
    options.stepEnteredAtMs :
    Math.min(updatedAt, LEASE_VERDICT_NOW_MS - LEASE_VERDICT_SETTLE_OFFSET_MS);
  const row = {
    operation_id: LEASE_VERDICT_OPERATION_ID,
    type: OperationType.REPLACE,
    partition_id: LEASE_VERDICT_PARTITION_ID,
    replica_id: LEASE_VERDICT_REPLICA.TARGET,
    source_node_id: LEASE_VERDICT_NODE.SOURCE,
    target_node_id: LEASE_VERDICT_NODE.OWNER,
    status: REPLACE_PHASE_STATUS.get(step),
    workflow_step: step,
    created_at: stepEnteredAtMs - LEASE_VERDICT_EDGE_MS,
    completed_at: null,
    error_message: null,
    entity_type: LEASE_VERDICT_ENTITY_TYPE,
    entity_id: LEASE_VERDICT_PARTITION_ID,
    steps_history: JSON.stringify([
      {
        step: WORKFLOW_STEP.PENDING,
        timestamp: stepEnteredAtMs - LEASE_VERDICT_EDGE_MS,
        sourceReplicaId: LEASE_VERDICT_REPLICA.SOURCE,
      },
      {step, timestamp: stepEnteredAtMs},
    ]),
  };
  return stampLeaseCell(row, options.leaseCell, LEASE_VERDICT_NODE.OWNER);
}

function buildLeaseVerdictServiceRows(sourceStatus) {
  const rows = [{
    service_id: LEASE_VERDICT_REPLICA.TARGET,
    replica_id: LEASE_VERDICT_REPLICA.TARGET,
    service_type: LEASE_VERDICT_ENTITY_TYPE,
    partition_id: LEASE_VERDICT_PARTITION_ID,
    node_id: LEASE_VERDICT_NODE.OWNER,
    raft_role: LEASE_VERDICT_VOTER_ROLE,
    status: ReplicaStatus.ACTIVE,
    address: `${LEASE_VERDICT_NODE.OWNER}/partition/` +
      LEASE_VERDICT_REPLICA.TARGET,
  }];
  if (sourceStatus !== null) {
    rows.push({
      service_id: LEASE_VERDICT_REPLICA.SOURCE,
      replica_id: LEASE_VERDICT_REPLICA.SOURCE,
      service_type: LEASE_VERDICT_ENTITY_TYPE,
      partition_id: LEASE_VERDICT_PARTITION_ID,
      node_id: LEASE_VERDICT_NODE.SOURCE,
      raft_role: LEASE_VERDICT_VOTER_ROLE,
      status: sourceStatus,
      address: `${LEASE_VERDICT_NODE.SOURCE}/partition/` +
        LEASE_VERDICT_REPLICA.SOURCE,
    });
  }
  return rows;
}

/**
 * The readiness service whose answers ARE the routing heuristic's input.
 * @param {boolean} ownerRoutingReady
 * @return {Object}
 */
function buildLeaseVerdictReadinessService(ownerRoutingReady) {
  return buildPriorityDrainOwnerUnavailableReadinessService(
    LEASE_VERDICT_PARTITION_ID,
    ownerRoutingReady ?
      LEASE_VERDICT_NO_UNAVAILABLE_NODE :
      LEASE_VERDICT_NODE.OWNER,
  );
}

/**
 * A remote (non-owner) coordinator holding one durable REPLACE row, on a
 * controlled owner clock. Deliveries are recorded; the source observation is
 * answered from `sourceObservation` (the source node's authoritative row).
 * @param {Object} cell
 * @return {Object}
 */
function createLeaseVerdictRemoteCoordinator(cell) {
  const deliveries = [];
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
    controlPlaneReadinessService:
      buildLeaseVerdictReadinessService(cell.ownerRoutingReady),
    cacheData: {
      services: buildLeaseVerdictServiceRows(
        REPLACE_PHASE_PRESENT_SOURCE_STATUS.get(cell.step),
      ),
      replicaOperations: [buildLeaseVerdictReplaceRow(cell)],
    },
  });
  coordinator.workflowOwner.timeSource = {now: () => LEASE_VERDICT_NOW_MS};
  if (cell.sourceObservation) {
    coordinator.repository.getActualReplicaObservation =
      async () => cell.sourceObservation;
  } else {
    installActualReplicaObservationResolver(
      coordinator,
      async () => REPLACE_PHASE_PRESENT_SOURCE_STATUS.get(cell.step),
    );
  }
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
  REPLACE_PHASES,
  buildLeaseVerdictReadinessService,
  buildLeaseVerdictReplaceRow,
  buildLeaseVerdictServiceRows,
  createLeaseVerdictRemoteCoordinator,
  resolveContractOwnerAvailability,
  stampLeaseCell,
};
