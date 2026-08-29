import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  REBALANCER_DEFAULT,
  REBALANCER_ENTITY_TYPE,
  REBALANCER_SKIP_REASON,
  REBALANCE_COORDINATOR_EVENT,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {isTerminalStep} from '../../src/rebalancer/replica-operation-progress.js';
import {
  deriveMembershipPublicationCandidate,
} from '../../src/control-plane/membership-publication-coordinator.js';
import {
  STARTUP_AUTHORITY_STATE,
  buildStartupAuthoritySnapshotFromPlanningAnswer,
} from '../../src/control-plane/startup-authority-snapshot-owner.js';
import {createTimeoutTestCoordinator} from '../rebalancer/timeout-test-coordinator.js';
import {
  initializeEnvironment,
  resetEnvironment,
} from './formation-barrier-test-fixture.js';

// Deterministic witness for the formation-release-handoff-closure run
// 2026-08-29T19-08-22.423Z (five-node GCP formation, seed 44050525): after the
// replica_operations ledger self-move (replace-op b0b98821, source removal
// 19:11:57.58) the seed's priority-recovery ADDs went out ONE AT A TIME
// (SENDING 19:12:05.1, :23.6, :34.4, :43.1, :48.5) while three joiners sat in
// bootstrap readiness `degraded` / PRIORITY_CONTROL_PLANE_RECOVERY_PENDING for
// ~63 s and missed the 60 s certification budget.
//
// Traced mechanism (see node-0.log 19:11:49-19:12:56):
//   1. Every priority ADD is created through the coordinator's priority_add
//      concurrent-create budget lane (rebalance-coordinator-concurrent-add-budget.js
//      runConcurrentCreateBudgetGate: one serialized admission turn per scope
//      key). createOperationRecordInternal awaits
//      armCoordinatorCreatedOperationProgress INSIDE that turn, and for
//      priority control-plane partitions the arm action is DISPATCH_AFTER_CLAIM
//      (operation-workflow-owner-handoff-state.js). Before the cure the arm
//      awaited the physical dispatch, so the lane was held for the whole
//      create -> claim -> send -> ack round trip and the budget of five
//      concurrent priority ADDs (REBALANCER_DEFAULT.COORDINATOR.MAX_CONCURRENT_ADDS,
//      the ordinary priority add budget) was never reachable: sibling ADDs of
//      DIFFERENT partitions dispatched one per lane hold (~9-13 s on the
//      pressured seed). Cure: the budget turn covers budget check + persist +
//      claim; the dispatch runs after the turn is released
//      (operation-workflow-owner-create-budget-dispatch.js).
//   2. Siblings woken together by the self-move's completion race the held
//      self-move clear (rebalance-coordinator-ledger-interlock-admission.js
//      tryClearHeldOperationLedgerSelfMove): the first waiter clears the hold;
//      before the cure the others observed a changed holder and were refused
//      with operation_ledger_self_move_in_flight although the ledger was
//      authoritatively idle (run: 19:12:01.353, three siblings), falling back
//      to the scheduler's priority retry timer instead of the event wake.
//      Cure: an already-cleared holder (no self-move held) admits; a NEWER
//      holder still refuses (operation-ledger-hold-policy.js
//      resolveHeldOperationLedgerSelfMoveClearOutcome).
//
// The file uses raw node:test (not tap) so each top-level scenario is
// independently selectable with --test-name-pattern by its anchored name;
// scripts/quest-evidence-priority-recovery-add-dispatch-cadence.js re-runs one
// scenario per receipt.
//
// HONEST SCOPE (real vs modeled):
//   - REAL: RebalanceCoordinator + OperationWorkflowOwner (createOperation
//     admission chain, ledger interlock, priority_add budget lane, arm and
//     dispatch through the router, completeOperation and its
//     OPERATION_COMPLETED wake), and the owner-derived startup authority
//     (deriveMembershipPublicationCandidate ->
//     buildStartupAuthoritySnapshotFromPlanningAnswer) evaluated over actual
//     service rows.
//   - MODELED at non-owner boundaries, every number cited from the run: the
//     replica-handler's dispatch acknowledgement latency (transport boundary),
//     the authoritative operation-ledger read latency (SQL gateway boundary),
//     replica activation after acknowledgement, and the per-partition
//     rebalancer loop (attempt / typed-skip retry / completion wake) exactly as
//     the sibling dt6 self-move interlock witness models it.
//
// The run's own numbers, so the witness reproduces the run rather than an
// arbitrary tempo:
//   - self-move remaining after the joiners entered readiness-pending:
//     19:11:41.62 -> 19:11:57.58 (16 s).
//   - authoritative ledger read under control-plane pressure: queryDurationMs
//     1076 / 1606 / 1657 / 1028 ("In-flight operation owner query indicates
//     control-plane pressure").
//   - dispatch acknowledgement (SENDING -> CREATING) of the first sibling ADD
//     d4a4359b: 19:12:05.138 -> 19:12:13.807 (8.7 s).
//   - replica activation (CREATING -> "Operation completed"): 5.4-8.0 s.

const START_MS = 9_000_000;
const CLOCK_STEP_MS = 100;
const MICROTASK_FLUSH_ROUNDS = 40;
const MAX_SIMULATED_MS = 240_000;
const FIRST_INDEX = 0;
const SNAPSHOT_VERSION_INCREMENT = 1;
const NO_REFUSALS = 0;
const NONE_IN_FLIGHT = 0;

const SEED_NODE_ID = 'seed-node';
const READY_JOINER_NODE_ID = 'joiner-ready';
const JOINER_2_NODE_ID = 'joiner-2';
const JOINER_3_NODE_ID = 'joiner-3';
const JOINER_4_NODE_ID = 'joiner-4';
const JOINING_NODE_IDS = Object.freeze([
  READY_JOINER_NODE_ID,
  JOINER_2_NODE_ID,
  JOINER_3_NODE_ID,
  JOINER_4_NODE_ID,
]);
const NODE_ADDRESS_PORT = 9000;
const SEED_READY_LEASE_MS = 60_000;

const LEDGER_TABLE_ID = SYSTEM_TABLE_NAME.REPLICA_OPERATIONS;
const PRIORITY_TABLE_IDS = Object.freeze([
  SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
  LEDGER_TABLE_ID,
  SYSTEM_TABLE_NAME.SCHEMA_OPERATIONS,
  SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
  SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
  SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
]);
// The run's post-self-move priority ADDs: schema_operations,
// sql_transaction_participants, sql_transactions, sql_write_operations
// (the fifth, control_plane_publications-r5, was a further spread cure not
// required for READY).
const SIBLING_TABLE_IDS = Object.freeze([
  SYSTEM_TABLE_NAME.SCHEMA_OPERATIONS,
  SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
  SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
  SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
]);
const PARTITION_SUFFIX = '-p1';
const LEDGER_PARTITION_ID = `${LEDGER_TABLE_ID}${PARTITION_SUFFIX}`;
const TARGET_REPLICA_COUNT = 3;
const SEED_LEADER_REPLICA_INDEX = 1;
const SEED_FOLLOWER_REPLICA_INDEX = 2;
const READY_JOINER_REPLICA_INDEX = 3;
const SPREAD_REPLICA_INDEX = 4;
const RAFT_ROLE_LEADER = 'leader';
const RAFT_ROLE_FOLLOWER = 'follower';
const SERVICE_STATUS_ACTIVE = 'active';
const NODE_STATUS_ACTIVE = 'active';
const CONNECTION_STATE_READY = 'ready';
const CONNECTION_STATE_CONNECTED = 'connected';
const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const INITIAL_PUBLICATION_EPOCH = 1;
const INITIAL_TOPOLOGY_EPOCH = 1;
const INITIAL_SNAPSHOT_VERSION = 1;
const MOVE_REASON_SPREAD = 'spread_replicas';

// Run-cited latencies (see header).
const SELF_MOVE_REMAINING_MS = 16_000;
const LEDGER_AUTHORITATIVE_READ_LATENCY_MS = 1_100;
const DISPATCH_ACK_LATENCY_MS = 8_700;
const REPLICA_ACTIVATION_MS = 6_000;
// The scheduler's priority retry cadence
// (unified-rebalancer-policy-scheduler-methods.js getPriorityRetryDelayMs ->
// REBALANCER_DEFAULT.UNIFIED.CRITICAL_CHECK_DELAY_MS): the one wake latency the
// contract bound tolerates for a deferred sibling's re-entry.
const PRIORITY_RETRY_DELAY_MS = REBALANCER_DEFAULT.UNIFIED.CRITICAL_CHECK_DELAY_MS;
// Ordinary priority add budget = maxConcurrentAdds
// (priority-recovery-snapshot-workflow.js ordinaryPriorityAddBudgetLimit).
const PRIORITY_ADD_BUDGET_LIMIT = REBALANCER_DEFAULT.COORDINATOR.MAX_CONCURRENT_ADDS;
// The HEAD values the cure must leave untouched (quest constraint
// unchanged-budgets-and-cadence): the budget size and the scheduler cadence.
const HEAD_MAX_CONCURRENT_ADDS = 5;
const HEAD_CRITICAL_CHECK_DELAY_MS = 5_000;
// One attempt on entry plus one per retry cadence until the self-move terminal
// (run: 0 / 5 / 10 / 15 s, terminal at 16 s) — every one of them refused by
// the interlock. Unchanged by the cure.
const EXPECTED_IN_FLIGHT_REFUSAL_INSTANTS_MS = Object.freeze(
  Array.from(
    {length: Math.ceil(SELF_MOVE_REMAINING_MS / PRIORITY_RETRY_DELAY_MS)},
    (_unused, index) => index * PRIORITY_RETRY_DELAY_MS,
  ),
);
// The formation certification budget the joiners missed in the run.
const FORMATION_READINESS_BUDGET_MS = 60_000;
// Lane release proof: at least this many sibling ADDs of different partitions
// dispatched (sent, not yet acknowledged) at the same instant.
const MIN_CONCURRENT_DISPATCHES = 2;

// rebalance-coordinator-ledger-interlock-admission.js
// OPERATION_LEDGER_SELF_MOVE_BLOCKING_REASON_CODE (module-local constant).
const SELF_MOVE_IN_FLIGHT_REASON = 'operation_ledger_self_move_in_flight';
const RETRYABLE_SKIP_REASONS = Object.freeze(new Set([
  REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
  REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
]));
const INCOMPLETE_OPERATIONS_QUERY_MARKER = 'workflow_step IN';
const REPLICA_OPERATIONS_TABLE_MARKER = SYSTEM_TABLE_NAME.REPLICA_OPERATIONS;

const EVENT = Object.freeze({
  SIBLING_REFUSED: 'sibling_refused',
  SIBLING_BUDGET_CHECKED: 'sibling_budget_checked',
  SIBLING_CREATED: 'sibling_created',
  SIBLING_DISPATCH_SENT: 'sibling_dispatch_sent',
  SIBLING_DISPATCH_ACKED: 'sibling_dispatch_acked',
  SIBLING_COMPLETED: 'sibling_completed',
  SELF_MOVE_TERMINAL: 'self_move_terminal',
  STARTUP_AUTHORITY_READY: 'startup_authority_ready',
});

function partitionIdOf(tableId) {
  return `${tableId}${PARTITION_SUFFIX}`;
}

function replicaIdOf(partitionId, index) {
  return `${partitionId}-r${index}`;
}

function addressOf(nodeId) {
  return `${nodeId}:${NODE_ADDRESS_PORT}`;
}

function buildServiceRow({tableId, index, nodeId, raftRole}) {
  const partitionId = partitionIdOf(tableId);
  const replicaId = replicaIdOf(partitionId, index);
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: partitionId,
    table_id: tableId,
    node_id: nodeId,
    service_type: REBALANCER_ENTITY_TYPE.PARTITION,
    status: SERVICE_STATUS_ACTIVE,
    raft_role: raftRole,
    address: addressOf(nodeId),
  };
}

// The run's formation shape: every priority partition has its three replicas
// on TWO distinct nodes (seed twice, the already-ready joiner once), so each
// needs one more distinct node before the priority spread is satisfied. The
// exception is control_plane_publications, whose spread ADD (06d66104) had
// already completed at 19:11:49.7, before the self-move terminal.
function buildFormationServiceRows() {
  return PRIORITY_TABLE_IDS.flatMap((tableId) => [
    buildServiceRow({
      tableId,
      index: SEED_LEADER_REPLICA_INDEX,
      nodeId: SEED_NODE_ID,
      raftRole: RAFT_ROLE_LEADER,
    }),
    buildServiceRow({
      tableId,
      index: SEED_FOLLOWER_REPLICA_INDEX,
      nodeId:
        tableId === SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS ?
          JOINER_3_NODE_ID :
          SEED_NODE_ID,
      raftRole: RAFT_ROLE_FOLLOWER,
    }),
    buildServiceRow({
      tableId,
      index: READY_JOINER_REPLICA_INDEX,
      nodeId: READY_JOINER_NODE_ID,
      raftRole: RAFT_ROLE_FOLLOWER,
    }),
  ]);
}

function buildPartitionRows() {
  return PRIORITY_TABLE_IDS.map((tableId) => ({
    partition_id: partitionIdOf(tableId),
    table_id: tableId,
    replica_count: TARGET_REPLICA_COUNT,
  }));
}

function buildNodeRows(nowMs) {
  return [
    {
      node_id: SEED_NODE_ID,
      status: NODE_STATUS_ACTIVE,
      connection_state: CONNECTION_STATE_READY,
      last_heartbeat: nowMs,
      ready_lease_expires_at: nowMs + SEED_READY_LEASE_MS,
    },
    ...JOINING_NODE_IDS.map((nodeId) => ({
      node_id: nodeId,
      status: NODE_STATUS_ACTIVE,
      connection_state: CONNECTION_STATE_CONNECTED,
      last_heartbeat: nowMs,
      ready_lease_expires_at: null,
    })),
  ];
}

function buildInitialPublicationRow() {
  return {
    publication_epoch: INITIAL_PUBLICATION_EPOCH,
    status: PUBLICATION_STATUS_PUBLISHED,
    published_active_node_ids: [SEED_NODE_ID, READY_JOINER_NODE_ID],
    required_ack_node_ids: [SEED_NODE_ID],
    acknowledged_node_ids: [SEED_NODE_ID],
    priority_partition_summary: {
      satisfied: false,
      missingPartitionIds: PRIORITY_TABLE_IDS.map(partitionIdOf),
    },
  };
}

function buildMove({type, tableId, targetNodeId, emitOperationCreated}) {
  const partitionId = partitionIdOf(tableId);
  const move = {
    type,
    partitionId,
    entityType: REBALANCER_ENTITY_TYPE.PARTITION,
    entityId: partitionId,
    nodeId: targetNodeId,
    moveReason: MOVE_REASON_SPREAD,
    enforceConcurrentOperationBudget: true,
    emitOperationCreated,
    membershipPublicationEpoch: INITIAL_PUBLICATION_EPOCH,
  };
  if (type === OperationType.REPLACE) {
    move.sourceNodeId = SEED_NODE_ID;
    move.replicaId = replicaIdOf(partitionId, SEED_FOLLOWER_REPLICA_INDEX);
  }
  return move;
}

// The joiners' startup authority, derived by the production owners from the
// actual placement rows: the seed re-derives its membership publication
// candidate; once the priority spread is satisfied it publishes that
// candidate and the cohort acknowledges it (modeled as immediate — the run
// flipped READY within a second of the last required ADD).
function deriveStartupAuthority({serviceRows, nowMs, publicationRow}) {
  const planningInputs = {
    publisherNodeId: SEED_NODE_ID,
    sourceTopologyEpoch: INITIAL_TOPOLOGY_EPOCH,
    sourceSnapshotVersion: INITIAL_SNAPSHOT_VERSION,
    nowMs,
    nodeRows: buildNodeRows(nowMs),
    readinessEntries: [],
    connectedNodeIds: [...JOINING_NODE_IDS],
    serviceRows,
    partitionRows: buildPartitionRows(),
  };
  const candidate = deriveMembershipPublicationCandidate({
    ...planningInputs,
    latestPublicationRow: publicationRow,
  });
  if (candidate.priorityPartitionSummary?.satisfied !== true) {
    return {
      startupAuthority: buildStartupAuthoritySnapshotFromPlanningAnswer(candidate),
      publicationRow,
    };
  }
  const publishedRow = {
    publication_epoch: candidate.publicationEpoch,
    status: PUBLICATION_STATUS_PUBLISHED,
    published_active_node_ids: candidate.publishedActiveNodeIds,
    required_ack_node_ids: candidate.requiredAckNodeIds,
    acknowledged_node_ids: candidate.requiredAckNodeIds,
    priority_partition_summary: candidate.priorityPartitionSummary,
  };
  const publishedCandidate = deriveMembershipPublicationCandidate({
    ...planningInputs,
    sourceSnapshotVersion: INITIAL_SNAPSHOT_VERSION + SNAPSHOT_VERSION_INCREMENT,
    latestPublicationRow: publishedRow,
  });
  return {
    startupAuthority:
      buildStartupAuthoritySnapshotFromPlanningAnswer(publishedCandidate),
    publicationRow: publishedRow,
  };
}

function skipReasonOf(error) {
  return error?.admissionResult?.reason || error?.rebalanceSkipReason || null;
}

function isTypedRetryableSkip(error) {
  return RETRYABLE_SKIP_REASONS.has(error?.rebalanceSkipReason || '');
}

// Boundary injection: the seed's authoritative operation-ledger reads under
// control-plane pressure (run: 1.0-1.7 s per in-flight owner query). Only the
// incomplete-operations authoritative query is delayed; row point reads and
// writes stay immediate.
function injectLedgerReadLatency({coordinator, timeSource}) {
  const gateway = coordinator.controlPlaneSystemTableGateway;
  const isIncompleteOperationsRead = (sql) =>
    String(sql).includes(REPLICA_OPERATIONS_TABLE_MARKER) &&
    String(sql).includes(INCOMPLETE_OPERATIONS_QUERY_MARKER);
  const delay = () =>
    new Promise((resolve) =>
      timeSource.setTimeout(resolve, LEDGER_AUTHORITATIVE_READ_LATENCY_MS),
    );
  for (const [method, sqlIndex] of [
    ['readAuthoritativeRows', 1],
    ['readRows', 1],
    ['executeQuery', 0],
  ]) {
    const original = gateway[method].bind(gateway);
    gateway[method] = async (...args) => {
      if (isIncompleteOperationsRead(args[sqlIndex])) {
        await delay();
      }
      return original(...args);
    };
  }
}

// Boundary injection: the replica handler acknowledges CREATE_REPLICA after the
// run's observed dispatch round trip; an acknowledged INITIATED response is
// what the owner maps to CREATING
// (operation-workflow-dispatch-response-reconcile.js _handleDispatchResponse).
function injectDispatchAckLatency({coordinator, timeSource, onSent, onAcked}) {
  const router = coordinator.workflowOwner.messageRouter;
  router.deliver = (target, request) => {
    const operationId = request?.operationId || null;
    onSent(operationId, target);
    return new Promise((resolve) =>
      timeSource.setTimeout(() => {
        onAcked(operationId);
        resolve({
          acknowledged: true,
          status: ReplicaOperationResponseStatus.INITIATED,
        });
      }, DISPATCH_ACK_LATENCY_MS),
    );
  };
}

// Real-owner observation: every serialized create-budget admission turn
// (rebalance-coordinator-concurrent-budget-gate.js
// ensureConcurrentOperationBudgetAllowed runs INSIDE runConcurrentCreateBudgetGate)
// is recorded with the caller's partition so the witness can prove WHEN the
// lane admitted each sibling relative to the others' dispatch round trips.
function observeBudgetAdmissions({coordinator, onBudgetChecked}) {
  const original =
    coordinator.ensureConcurrentOperationBudgetAllowed.bind(coordinator);
  coordinator.ensureConcurrentOperationBudgetAllowed = async (
    normalizedMoveType,
    options = {},
  ) => {
    onBudgetChecked({
      normalizedMoveType,
      partitionId: options.partitionId || null,
    });
    return original(normalizedMoveType, options);
  };
}

async function flushMicrotasks() {
  for (let round = 0; round < MICROTASK_FLUSH_ROUNDS; round += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

// Drive the virtual clock in fixed steps until the condition holds or the
// simulated horizon is reached; every injected latency lives on this clock.
async function driveClockUntil({timeSource, elapsed, isDone}) {
  while (!isDone() && elapsed() < MAX_SIMULATED_MS) {
    await flushMicrotasks();
    if (isDone()) {
      break;
    }
    timeSource.advance(CLOCK_STEP_MS);
    await flushMicrotasks();
  }
  await flushMicrotasks();
}

async function awaitUnderClock({timeSource, elapsed, promise}) {
  let settled = false;
  const tracked = promise.finally(() => {
    settled = true;
  });
  await driveClockUntil({timeSource, elapsed, isDone: () => settled});
  return tracked;
}

async function runFormationCadenceScenario() {
  initializeEnvironment();
  const timeSource = new VirtualTimeSource({startMs: START_MS});
  const fixture = createTimeoutTestCoordinator({
    timeSource,
    nodeId: SEED_NODE_ID,
    pendingTimeoutMs: REBALANCER_DEFAULT.COORDINATOR.PENDING_TIMEOUT_MS,
    creatingTimeoutMs: REBALANCER_DEFAULT.COORDINATOR.CREATING_TIMEOUT_MS,
    syncingTimeoutMs: REBALANCER_DEFAULT.COORDINATOR.SYNCING_TIMEOUT_MS,
    removingTimeoutMs: REBALANCER_DEFAULT.COORDINATOR.REMOVING_TIMEOUT_MS,
  });
  const {coordinator, trackedOperations} = fixture;
  // Witness time is anchored where the joiners enter readiness-pending (after
  // the already-dispatched ledger self-move exists); re-anchored below.
  let anchorMs = START_MS;
  const elapsed = () => timeSource.now() - anchorMs;
  const events = [];
  const record = (type, detail) => {
    events.push({atMs: elapsed(), type, ...detail});
  };

  let publicationRow = buildInitialPublicationRow();
  const readinessService = coordinator.controlPlaneReadinessService;
  readinessService.getCurrentPublishedMembershipEpochSync = () =>
    publicationRow.publication_epoch;
  readinessService.membershipPublicationService = {
    getLatestClusterPublicationSync: () => publicationRow,
  };

  const serviceRows = buildFormationServiceRows();
  const siblings = new Map(
    SIBLING_TABLE_IDS.map((tableId) => [
      tableId,
      {
        tableId,
        partitionId: partitionIdOf(tableId),
        operation: null,
        attemptInFlight: false,
        retryTimer: null,
        refusals: [],
        budgetChecks: [],
        attemptedAtMs: null,
        createdAtMs: null,
        sentAtMs: null,
        siblingsAwaitingAckAtSend: null,
        inFlightSiblingAddRowsAtSend: null,
        ackedAtMs: null,
        completedAtMs: null,
      },
    ]),
  );
  const siblingByPartitionId = new Map(
    [...siblings.values()].map((sibling) => [sibling.partitionId, sibling]),
  );
  const siblingOfOperation = (operationId) =>
    siblingByPartitionId.get(
      trackedOperations.get(operationId)?.partition_id || null,
    ) || null;
  // The ledger truth the budget lane counts: sibling ADD rows persisted and
  // not yet terminal (SENDING / CREATING / ...).
  const countInFlightSiblingAddRows = () =>
    [...trackedOperations.values()].filter(
      (row) =>
        siblingByPartitionId.has(row.partition_id) &&
        row.type === OperationType.ADD &&
        !isTerminalStep(row.type, row.workflow_step),
    ).length;
  const countSiblingsAwaitingAck = (exceptSibling) =>
    [...siblings.values()].filter(
      (sibling) =>
        sibling !== exceptSibling &&
        sibling.sentAtMs !== null &&
        sibling.ackedAtMs === null,
    ).length;
  const state = {
    selfMoveTerminalAtMs: null,
    startupAuthorityReadyAtMs: null,
    startupAuthority: null,
  };

  const refreshStartupAuthority = () => {
    const derived = deriveStartupAuthority({
      serviceRows,
      nowMs: timeSource.now(),
      publicationRow,
    });
    publicationRow = derived.publicationRow;
    state.startupAuthority = derived.startupAuthority;
    if (
      state.startupAuthorityReadyAtMs === null &&
      derived.startupAuthority.state === STARTUP_AUTHORITY_STATE.READY
    ) {
      state.startupAuthorityReadyAtMs = elapsed();
      record(EVENT.STARTUP_AUTHORITY_READY, {});
    }
  };

  const completeSibling = async (sibling) => {
    await coordinator.completeOperation({
      ...sibling.operation,
      workflowStep:
        trackedOperations.get(sibling.operation.operationId)?.workflow_step ||
        sibling.operation.workflowStep,
    });
    sibling.completedAtMs = elapsed();
    record(EVENT.SIBLING_COMPLETED, {tableId: sibling.tableId});
    serviceRows.push(
      buildServiceRow({
        tableId: sibling.tableId,
        index: SPREAD_REPLICA_INDEX,
        nodeId: sibling.operation.targetNodeId,
        raftRole: RAFT_ROLE_FOLLOWER,
      }),
    );
    refreshStartupAuthority();
  };

  injectLedgerReadLatency({coordinator, timeSource});
  observeBudgetAdmissions({
    coordinator,
    onBudgetChecked: ({partitionId}) => {
      const sibling = siblingByPartitionId.get(partitionId) || null;
      if (!sibling) {
        return;
      }
      const check = {
        atMs: elapsed(),
        siblingsAwaitingAck: countSiblingsAwaitingAck(sibling),
        inFlightSiblingAddRows: countInFlightSiblingAddRows(),
      };
      sibling.budgetChecks.push(check);
      record(EVENT.SIBLING_BUDGET_CHECKED, {tableId: sibling.tableId, ...check});
    },
  });
  injectDispatchAckLatency({
    coordinator,
    timeSource,
    onSent: (operationId) => {
      const sibling = siblingOfOperation(operationId);
      if (!sibling || sibling.sentAtMs !== null) {
        return;
      }
      sibling.sentAtMs = elapsed();
      sibling.siblingsAwaitingAckAtSend = countSiblingsAwaitingAck(sibling);
      sibling.inFlightSiblingAddRowsAtSend = countInFlightSiblingAddRows();
      record(EVENT.SIBLING_DISPATCH_SENT, {
        tableId: sibling.tableId,
        siblingsAwaitingAck: sibling.siblingsAwaitingAckAtSend,
        inFlightSiblingAddRows: sibling.inFlightSiblingAddRowsAtSend,
      });
    },
    onAcked: (operationId) => {
      const sibling = siblingOfOperation(operationId);
      if (!sibling || sibling.ackedAtMs !== null) {
        return;
      }
      sibling.ackedAtMs = elapsed();
      record(EVENT.SIBLING_DISPATCH_ACKED, {tableId: sibling.tableId});
      // Modeled replica activation: the target reaches ACTIVE and the owner
      // records the completion through its real terminal transition.
      timeSource.setTimeout(() => {
        completeSibling(sibling).catch((error) => {
          record(EVENT.SIBLING_COMPLETED, {
            tableId: sibling.tableId,
            error: error.message,
          });
        });
      }, REPLICA_ACTIVATION_MS);
    },
  });

  // Per-partition rebalancer loop analogue: one attempt per wake, a typed
  // retryable skip re-arms the priority retry cadence, any completion wakes
  // every still-pending sibling (bindCoordinatorProgressListeners ->
  // handleCoordinatorProgressEvent).
  const attemptSibling = async (sibling) => {
    if (sibling.operation || sibling.attemptInFlight) {
      return;
    }
    sibling.attemptInFlight = true;
    if (sibling.retryTimer !== null) {
      timeSource.clearTimeout(sibling.retryTimer);
      sibling.retryTimer = null;
    }
    const attemptedAtMs = elapsed();
    try {
      const operation = await coordinator.createOperation(
        buildMove({
          type: OperationType.ADD,
          tableId: sibling.tableId,
          targetNodeId: JOINER_2_NODE_ID,
          emitOperationCreated: true,
        }),
      );
      sibling.operation = operation;
      sibling.attemptedAtMs = attemptedAtMs;
      sibling.createdAtMs = elapsed();
      record(EVENT.SIBLING_CREATED, {
        tableId: sibling.tableId,
        attemptedAtMs,
      });
    } catch (error) {
      if (!isTypedRetryableSkip(error)) {
        throw error;
      }
      const reason = skipReasonOf(error);
      sibling.refusals.push({
        atMs: attemptedAtMs,
        reason,
        selfMoveTerminal: state.selfMoveTerminalAtMs !== null,
      });
      record(EVENT.SIBLING_REFUSED, {tableId: sibling.tableId, reason});
      sibling.retryTimer = timeSource.setTimeout(() => {
        sibling.retryTimer = null;
        attemptSibling(sibling).catch((attemptError) => {
          record(EVENT.SIBLING_REFUSED, {
            tableId: sibling.tableId,
            reason: attemptError.message,
          });
        });
      }, PRIORITY_RETRY_DELAY_MS);
    } finally {
      sibling.attemptInFlight = false;
    }
  };
  const wakeSiblings = () => {
    for (const sibling of siblings.values()) {
      attemptSibling(sibling).catch((error) => {
        record(EVENT.SIBLING_REFUSED, {
          tableId: sibling.tableId,
          reason: error.message,
        });
      });
    }
  };
  coordinator.on(REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED, () => {
    wakeSiblings();
  });

  try {
    // The ledger self-move is already dispatched when the joiners enter
    // readiness-pending (run: replace-op b0b98821 in flight, STOPPING).
    const selfMove = await awaitUnderClock({
      timeSource,
      elapsed,
      promise: coordinator.createOperation(
        buildMove({
          type: OperationType.REPLACE,
          tableId: LEDGER_TABLE_ID,
          targetNodeId: JOINER_2_NODE_ID,
          emitOperationCreated: false,
        }),
      ),
    });
    anchorMs = timeSource.now();
    const selfMoveRow = trackedOperations.get(selfMove.operationId);
    selfMoveRow.workflow_step = WORKFLOW_STEP.STOPPING;
    selfMoveRow.status = WORKFLOW_STEP.STOPPING.toLowerCase();
    refreshStartupAuthority();

    timeSource.setTimeout(() => {
      coordinator
        .completeOperation({...selfMove, workflowStep: WORKFLOW_STEP.STOPPING})
        .then(() => {
          state.selfMoveTerminalAtMs = elapsed();
          const movedReplica = serviceRows.find(
            (row) =>
              row.replica_id ===
              replicaIdOf(LEDGER_PARTITION_ID, SEED_FOLLOWER_REPLICA_INDEX),
          );
          movedReplica.node_id = JOINER_2_NODE_ID;
          movedReplica.address = addressOf(JOINER_2_NODE_ID);
          record(EVENT.SELF_MOVE_TERMINAL, {});
          refreshStartupAuthority();
        });
    }, SELF_MOVE_REMAINING_MS);

    wakeSiblings();
    await driveClockUntil({
      timeSource,
      elapsed,
      isDone: () => state.startupAuthorityReadyAtMs !== null,
    });
  } finally {
    for (const sibling of siblings.values()) {
      if (sibling.retryTimer !== null) {
        timeSource.clearTimeout(sibling.retryTimer);
      }
    }
    await coordinator.shutdown();
    resetEnvironment();
  }

  return {
    events,
    siblings: [...siblings.values()].map((sibling) => ({
      tableId: sibling.tableId,
      refusals: sibling.refusals,
      budgetChecks: sibling.budgetChecks,
      attemptedAtMs: sibling.attemptedAtMs,
      createdAtMs: sibling.createdAtMs,
      sentAtMs: sibling.sentAtMs,
      siblingsAwaitingAckAtSend: sibling.siblingsAwaitingAckAtSend,
      inFlightSiblingAddRowsAtSend: sibling.inFlightSiblingAddRowsAtSend,
      ackedAtMs: sibling.ackedAtMs,
      completedAtMs: sibling.completedAtMs,
    })),
    selfMoveTerminalAtMs: state.selfMoveTerminalAtMs,
    startupAuthorityReadyAtMs: state.startupAuthorityReadyAtMs,
    startupAuthority: state.startupAuthority,
    budget: {
      maxConcurrentAdds: coordinator.config.maxConcurrentAdds,
    },
  };
}

function describeSiblings(siblings) {
  return siblings
    .map((sibling) =>
      `${sibling.tableId}: attempted=${sibling.attemptedAtMs} ` +
        `sent=${sibling.sentAtMs} acked=${sibling.ackedAtMs} ` +
        `createReturned=${sibling.createdAtMs} ` +
        `completed=${sibling.completedAtMs} ` +
        `refusals=${sibling.refusals.length}`,
    )
    .join('; ');
}

function refusalsAfterSelfMoveTerminal(siblings) {
  return siblings.flatMap((sibling) =>
    sibling.refusals
      .filter((refusal) => refusal.selfMoveTerminal)
      .map((refusal) => ({tableId: sibling.tableId, ...refusal})),
  );
}

function ackedSiblingsOf(m) {
  return m.siblings.filter((sibling) => sibling.ackedAtMs !== null);
}

function firstAckMsOf(m) {
  return Math.min(...ackedSiblingsOf(m).map((sibling) => sibling.ackedAtMs));
}

test(
  'self-move-exclusion-preserved: while the ledger self-move is in flight ' +
    'every sibling priority ADD is excluded by the interlock',
  async () => {
    const m = await runFormationCadenceScenario();
    assert.ok(
      m.selfMoveTerminalAtMs !== null &&
        m.selfMoveTerminalAtMs >= SELF_MOVE_REMAINING_MS,
      'the ledger self-move reaches its terminal step through the real owner ' +
        `transition (terminal at ${m.selfMoveTerminalAtMs} ms)`,
    );
    for (const sibling of m.siblings) {
      const beforeTerminal = sibling.refusals.filter(
        (refusal) => !refusal.selfMoveTerminal,
      );
      assert.ok(
        beforeTerminal.length > NO_REFUSALS,
        `${sibling.tableId} attempted admission while the self-move was in flight`,
      );
      assert.deepEqual(
        [...new Set(beforeTerminal.map((refusal) => refusal.reason))],
        [SELF_MOVE_IN_FLIGHT_REASON],
        `${sibling.tableId} was refused only with ${SELF_MOVE_IN_FLIGHT_REASON} ` +
          'while the self-move was in flight',
      );
      assert.ok(
        sibling.attemptedAtMs === null ||
          sibling.attemptedAtMs >= m.selfMoveTerminalAtMs,
        `${sibling.tableId} was not admitted before the self-move terminal`,
      );
    }
  },
);

test(
  'no-spurious-refusal-after-terminal: siblings woken by the self-move ' +
    'completion are never refused against an authoritatively idle ledger',
  async () => {
    const m = await runFormationCadenceScenario();
    const spuriousRefusals = refusalsAfterSelfMoveTerminal(m.siblings).filter(
      (refusal) => refusal.reason === SELF_MOVE_IN_FLIGHT_REASON,
    );
    assert.deepEqual(
      spuriousRefusals,
      [],
      'no sibling is refused with ' +
        `${SELF_MOVE_IN_FLIGHT_REASON} after the self-move is terminal ` +
        `(observed: ${JSON.stringify(spuriousRefusals)})`,
    );
  },
);

test(
  'priority-adds-acked-within-contract-bound: after the self-move completes, ' +
    'sibling priority ADDs within the budget are acknowledged within one wake ' +
    'latency plus one operation latency',
  async () => {
    const m = await runFormationCadenceScenario();
    assert.ok(
      m.siblings.length <= PRIORITY_ADD_BUDGET_LIMIT,
      `${m.siblings.length} sibling ADDs fit the priority add budget of ` +
        `${PRIORITY_ADD_BUDGET_LIMIT}`,
    );
    const acked = ackedSiblingsOf(m);
    assert.equal(
      acked.length,
      m.siblings.length,
      `every sibling ADD is dispatched and acknowledged (${describeSiblings(
        m.siblings,
      )})`,
    );
    const ackedAt = acked
      .map((sibling) => sibling.ackedAtMs)
      .sort((left, right) => left - right);
    const firstAckMs = ackedAt[FIRST_INDEX];
    const lastAckMs = ackedAt[ackedAt.length - 1];
    // Contract bound: the budget admits every sibling concurrently and a
    // deferred sibling re-enters within one wake latency, so the last
    // acknowledgement lands within one operation's own admission+dispatch
    // latency (measured on the first admitted sibling in this same run) plus
    // one priority retry cadence after the self-move terminal.
    const singleOperationLatencyMs = firstAckMs - m.selfMoveTerminalAtMs;
    const boundMs =
      m.selfMoveTerminalAtMs + PRIORITY_RETRY_DELAY_MS + singleOperationLatencyMs;
    assert.ok(
      lastAckMs <= boundMs,
      'the last sibling ADD is acknowledged within one wake latency plus one ' +
        `operation latency of the self-move terminal (bound ${boundMs} ms, ` +
        `observed last ack ${lastAckMs} ms; self-move terminal ` +
        `${m.selfMoveTerminalAtMs} ms, first ack ${firstAckMs} ms; ` +
        `${describeSiblings(m.siblings)})`,
    );
  },
);

test(
  'joiners-ready-within-60s-budget: the joiners\' startup authority reaches ' +
    'READY within the formation certification budget',
  async () => {
    const m = await runFormationCadenceScenario();
    assert.ok(
      m.startupAuthorityReadyAtMs !== null,
      'the owner-derived startup authority eventually reaches READY ' +
        `(state ${m.startupAuthority?.state}, reasons ${JSON.stringify(
          m.startupAuthority?.priorityRecoveryReasonCodes,
        )})`,
    );
    assert.ok(
      m.startupAuthorityReadyAtMs !== null &&
        m.startupAuthorityReadyAtMs <= FORMATION_READINESS_BUDGET_MS,
      `startup authority READY within ${FORMATION_READINESS_BUDGET_MS} ms of ` +
        'the joiners entering readiness-pending (observed READY at ' +
        `${m.startupAuthorityReadyAtMs} ms; ${describeSiblings(m.siblings)})`,
    );
    // The same contract bound as the dispatch witness, carried through replica
    // activation: every sibling within the budget runs concurrently, so READY
    // follows one wake latency + one operation latency + one activation after
    // the self-move terminal.
    const firstAckMs = firstAckMsOf(m);
    const readyBoundMs =
      m.selfMoveTerminalAtMs +
      PRIORITY_RETRY_DELAY_MS +
      (firstAckMs - m.selfMoveTerminalAtMs) +
      REPLICA_ACTIVATION_MS;
    assert.ok(
      m.startupAuthorityReadyAtMs !== null &&
        m.startupAuthorityReadyAtMs <= readyBoundMs,
      'startup authority READY within one wake latency plus one operation ' +
        'latency plus one activation of the self-move terminal (bound ' +
        `${readyBoundMs} ms, observed ${m.startupAuthorityReadyAtMs} ms)`,
    );
  },
);

test(
  'budget-lane-released-after-claim: the priority_add create-budget turn is ' +
    'released after persist and claim, so sibling ADDs of different partitions ' +
    'are dispatched concurrently while the budget counts both',
  async () => {
    const m = await runFormationCadenceScenario();
    const acked = ackedSiblingsOf(m);
    assert.equal(
      acked.length,
      m.siblings.length,
      `every sibling ADD is dispatched and acknowledged (${describeSiblings(
        m.siblings,
      )})`,
    );
    // (1) Lane release: some sibling's serialized budget-admission turn ran
    // while an earlier sibling's dispatch was already sent and still awaiting
    // its acknowledgement — impossible while the turn is held through the
    // transport round trip.
    const admittedDuringAnotherDispatch = m.siblings.flatMap((sibling) =>
      sibling.budgetChecks
        .filter((check) => check.siblingsAwaitingAck >= 1)
        .map((check) => ({tableId: sibling.tableId, ...check})),
    );
    assert.ok(
      admittedDuringAnotherDispatch.length >= 1,
      'at least one sibling was admitted by the create-budget turn while ' +
        'another sibling\'s dispatch was still awaiting acknowledgement ' +
        `(budget checks: ${JSON.stringify(
          m.siblings.map((sibling) => ({
            tableId: sibling.tableId,
            budgetChecks: sibling.budgetChecks,
          })),
        )})`,
    );
    // (2) Concurrent dispatch: at some send instant at least one other sibling
    // of a different partition was already sent and not yet acknowledged, i.e.
    // >= MIN_CONCURRENT_DISPATCHES ADDs in dispatched state at once ...
    const concurrentSends = m.siblings.filter(
      (sibling) =>
        sibling.siblingsAwaitingAckAtSend !== null &&
        sibling.siblingsAwaitingAckAtSend + 1 >= MIN_CONCURRENT_DISPATCHES,
    );
    assert.ok(
      concurrentSends.length >= 1,
      `at least ${MIN_CONCURRENT_DISPATCHES} sibling ADDs of different ` +
        'partitions were in dispatched (sent, unacknowledged) state at the ' +
        `same instant (${describeSiblings(m.siblings)})`,
    );
    // ... (3) while the ledger rows the budget counts covered both of them.
    for (const sibling of concurrentSends) {
      assert.ok(
        sibling.inFlightSiblingAddRowsAtSend >= MIN_CONCURRENT_DISPATCHES,
        `${sibling.tableId}: at its send instant the budget counted ` +
          `${sibling.inFlightSiblingAddRowsAtSend} in-flight sibling ADD rows ` +
          `(expected >= ${MIN_CONCURRENT_DISPATCHES})`,
      );
    }
    // (4) The budget itself stays the bound: never more in flight than it
    // allows.
    for (const sibling of m.siblings) {
      assert.ok(
        sibling.inFlightSiblingAddRowsAtSend <= m.budget.maxConcurrentAdds,
        `${sibling.tableId}: in-flight sibling ADD rows at send ` +
          `(${sibling.inFlightSiblingAddRowsAtSend}) within maxConcurrentAdds ` +
          `${m.budget.maxConcurrentAdds}`,
      );
    }
  },
);

test(
  'interlock-race-admits-racing-siblings: every sibling woken together by ' +
    'the self-move terminal is admitted on that same wake (compare-and-clear ' +
    'race against an already-cleared holder)',
  async () => {
    const m = await runFormationCadenceScenario();
    assert.ok(m.selfMoveTerminalAtMs !== null, 'the self-move reached terminal');
    const admittedOnTerminalWake = m.siblings.filter(
      (sibling) => sibling.attemptedAtMs === m.selfMoveTerminalAtMs,
    );
    assert.ok(
      admittedOnTerminalWake.length >= MIN_CONCURRENT_DISPATCHES,
      'at least two siblings raced the held self-move clear on the terminal ' +
        `wake and were both admitted (${describeSiblings(m.siblings)})`,
    );
    assert.equal(
      admittedOnTerminalWake.length,
      m.siblings.length,
      'every sibling woken by the self-move terminal was admitted on that ' +
        `wake instead of being refused and re-timed (${describeSiblings(
          m.siblings,
        )})`,
    );
    assert.deepEqual(
      refusalsAfterSelfMoveTerminal(m.siblings),
      [],
      'no sibling was refused for any reason after the self-move terminal',
    );
  },
);

test(
  'budgets-and-cadence-unchanged: maxConcurrentAdds, CRITICAL_CHECK_DELAY_MS ' +
    'and the in-flight interlock refusal cadence are the HEAD values',
  async () => {
    assert.equal(
      REBALANCER_DEFAULT.COORDINATOR.MAX_CONCURRENT_ADDS,
      HEAD_MAX_CONCURRENT_ADDS,
      'REBALANCER_DEFAULT.COORDINATOR.MAX_CONCURRENT_ADDS is unchanged',
    );
    assert.equal(
      REBALANCER_DEFAULT.UNIFIED.CRITICAL_CHECK_DELAY_MS,
      HEAD_CRITICAL_CHECK_DELAY_MS,
      'REBALANCER_DEFAULT.UNIFIED.CRITICAL_CHECK_DELAY_MS is unchanged',
    );
    const m = await runFormationCadenceScenario();
    assert.equal(
      m.budget.maxConcurrentAdds,
      HEAD_MAX_CONCURRENT_ADDS,
      'the real coordinator runs with the unchanged maxConcurrentAdds budget',
    );
    assert.equal(
      m.selfMoveTerminalAtMs,
      SELF_MOVE_REMAINING_MS,
      'the self-move exclusion lasts exactly as long as the self-move is in ' +
        'flight (no shortening, no sleeping)',
    );
    for (const sibling of m.siblings) {
      const inFlightRefusalInstants = sibling.refusals
        .filter((refusal) => !refusal.selfMoveTerminal)
        .map((refusal) => refusal.atMs);
      assert.deepEqual(
        inFlightRefusalInstants,
        [...EXPECTED_IN_FLIGHT_REFUSAL_INSTANTS_MS],
        `${sibling.tableId}: one interlock refusal per unchanged priority ` +
          `retry cadence while the self-move is in flight (observed ${JSON.stringify(
            inFlightRefusalInstants,
          )})`,
      );
      assert.equal(
        sibling.refusals.filter((refusal) => !refusal.selfMoveTerminal).length,
        EXPECTED_IN_FLIGHT_REFUSAL_INSTANTS_MS.length,
        `${sibling.tableId}: the per-attempt in-flight refusal count is unchanged`,
      );
    }
    assert.ok(
      m.siblings.every(
        (sibling) =>
          sibling.siblingsAwaitingAckAtSend === null ||
          sibling.siblingsAwaitingAckAtSend >= NONE_IN_FLIGHT,
      ),
      'dispatch observations are well-formed',
    );
  },
);

test(
  'witness-deterministic: the formation cadence drive is deterministic ' +
    'across runs',
  async () => {
    const a = await runFormationCadenceScenario();
    const b = await runFormationCadenceScenario();
    assert.deepEqual(
      a.events,
      b.events,
      'identical virtual drive -> identical admission/dispatch event sequence',
    );
    assert.equal(
      a.startupAuthorityReadyAtMs,
      b.startupAuthorityReadyAtMs,
      'identical READY instant across runs',
    );
  },
);
