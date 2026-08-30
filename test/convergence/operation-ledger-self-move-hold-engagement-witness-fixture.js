import {VirtualTimeSource} from '../../src/time/time-source.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {MESSAGE_TYPE} from '../../src/constants/messages.js';
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
import {
  WORKFLOW_STEP_TO_STATUS,
  isTerminalStep,
} from '../../src/rebalancer/replica-operation-progress.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
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

// Deterministic witness for the GCP streak on 675d6b512 (five-node formation,
// 60 s certification window; forensics scratchpad streak-60s-budget.md):
// runs 21-08-21 and 21-22-08 FAILED because the seed's replica_operations
// ledger self-move (count-neutral REPLACE seed -> n1, created by the ledger
// partition's critical planner BEFORE the other priority partitions planned
// their spread ADDs) engaged the run-20 DEFER hold at createOperation time.
// The self-move could not dispatch for 13.7 s (its owner is its TARGET node,
// whose workflow owner claims it only once n1 is READY), yet every dependent
// priority ADD was refused `operation_ledger_self_move_in_flight` for the
// whole self-move lifecycle (57.8 s of the 60 s window in run 21-22-08). Run
// 21-16-04 PASSED at ~45 s only because the ADDs happened to be planned first
// and the self-move's IDLE_ONLY admission made it wait behind them.
//
// Cure under proof: the hold ENGAGES when the self-move becomes
// dispatch-admissible (its target holds a current READY lease and its owner
// is about to claim PENDING -> SENDING and send CREATE_REPLICA), not at
// createOperation. Until then the self-move is a REGISTERED waiter: a second
// self-move still cannot register, dependents are admitted under the normal
// budget, and the self-move's own IDLE_ONLY dispatch check waits for them to
// drain — exactly the ADDs-first order of run 21-16-04.
//
// Scenario `self-move-planned-before-adds` (numbers cited from run 21-22-08
// unless noted; all on the virtual clock):
//   t+0      seed creates REPLACE replica_operations-p1 seed -> n1 (n1
//            connected, not READY; ledger fully concentrated on the seed).
//   t+3.5 s  five priority ADDs planned: control_plane_publications (emergency,
//            exempt) and four dependents (schema_operations,
//            sql_transaction_participants, sql_transactions,
//            sql_write_operations) -> joiner-2.
//   t+14 s   n1 READY (run: 21:24:48.89 -> 21:25:02.55); n1's real workflow
//            owner starts driving the self-move's dispatch.
//   t+23 s   joiner-2 READY (run: 21:25:12.11) — makes the ledger's
//            quorum-spread cure actionable after the self-move terminal.
//   self-move CREATE_REPLICA ack +14.0 s, ACTIVE +9.6 s, terminal +1.5 s;
//   ledger spread ADD -> joiner-2 on the terminal wake, follow-up REMOVE of the
//   seed's surplus replica 3 s after it (run: 42.41 -> 45.81), 5 s long.
//   dependent ADD ack 8.7 s + activation 6 s (run 19-08-22 numbers reused by
//   the sibling cadence witness).
//
// HONEST SCOPE (real vs modeled):
//   - REAL: two RebalanceCoordinator + OperationWorkflowOwner instances (the
//     seed that creates everything and admits the dependents; the target n1
//     that owns and dispatches the self-move) sharing one in-memory
//     replica_operations ledger; the full createOperation admission chain
//     with the ledger interlock; the priority_add budget lane; the owner arm,
//     the remote-owner wake, the dispatch-time ledger idle check, the
//     PENDING -> SENDING claim and the router send; completeOperation and its
//     OPERATION_COMPLETED wake; the ledger quorum-concentration hold over
//     actual cache rows; the owner-derived startup authority.
//   - MODELED at non-owner boundaries: node READY leases (readiness owner),
//     the replica handlers' acknowledgement and activation latencies, the
//     authoritative ledger read latency, and the per-partition rebalancer
//     loop (attempt / typed-skip retry / completion wake) exactly as the
//     sibling dt6 witnesses model it.
//
// This module is the scenario fixture (constants, boundary injections and
// the real-owner drive); the assertions live in
// test/convergence/dt6-operation-ledger-self-move-hold-engagement.test.js
// (raw node:test so each scenario is selectable with --test-name-pattern;
// scripts/quest-evidence-operation-ledger-self-move-hold-engagement.js runs
// one scenario per receipt). The drive accepts a scenario PROFILE (ledger
// placement shape, per-table dispatch latencies, the readiness owner's
// per-node snapshot, extra timed boundary injections and the completion
// condition) so the sibling fairness witness
// (operation-ledger-self-move-hold-fairness-witness-fixture.js) runs the
// same real owners with the GCP-streak shape of 4bc6c1d25 (runs 23-51-32 /
// 23-58-17) instead of duplicating the drive.

const START_MS = 9_000_000;
const CLOCK_STEP_MS = 100;
const MICROTASK_FLUSH_ROUNDS = 40;
const MAX_SIMULATED_MS = 240_000;
const SNAPSHOT_VERSION_INCREMENT = 1;
const SINGLE_OPERATION = 1;
const LOCAL_STR_FUNCTION = 'function';

const SEED_NODE_ID = 'seed-node';
const JOINER_1_NODE_ID = 'joiner-1';
const JOINER_2_NODE_ID = 'joiner-2';
const JOINER_3_NODE_ID = 'joiner-3';
const JOINER_4_NODE_ID = 'joiner-4';
const JOINING_NODE_IDS = Object.freeze([
  JOINER_1_NODE_ID,
  JOINER_2_NODE_ID,
  JOINER_3_NODE_ID,
  JOINER_4_NODE_ID,
]);
const NODE_ADDRESS_PORT = 9000;
const READY_LEASE_MS = 60_000;

const LEDGER_TABLE_ID = SYSTEM_TABLE_NAME.REPLICA_OPERATIONS;
const PRIORITY_TABLE_IDS = Object.freeze([
  SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
  LEDGER_TABLE_ID,
  SYSTEM_TABLE_NAME.SCHEMA_OPERATIONS,
  SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
  SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
  SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
]);
// The exempt fifth ADD (emergency quorum-restore partition) and the four
// dependents of the run.
const EXEMPT_TABLE_ID = SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS;
const DEPENDENT_TABLE_IDS = Object.freeze([
  SYSTEM_TABLE_NAME.SCHEMA_OPERATIONS,
  SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
  SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
  SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
]);
const PARTITION_SUFFIX = '-p1';
const LEDGER_PARTITION_ID = `${LEDGER_TABLE_ID}${PARTITION_SUFFIX}`;
const TARGET_REPLICA_COUNT = 3;
const LEADER_REPLICA_INDEX = 1;
const MOVED_REPLICA_INDEX = 2;
const THIRD_REPLICA_INDEX = 3;
const SPREAD_REPLICA_INDEX = 4;
const SECOND_SPREAD_REPLICA_INDEX = 5;
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
const MOVE_REASON_SURPLUS = 'surplus_replica';

// Scenario instants and run-cited latencies (see header).
const DEPENDENTS_PLANNED_AT_MS = 3_500;
const TARGET_READY_AT_MS = 14_000;
const JOINER_2_READY_AT_MS = 23_000;
const SELF_MOVE_CREATE_ACK_MS = 14_000;
const SELF_MOVE_ACTIVE_AFTER_ACK_MS = 9_600;
const SELF_MOVE_TERMINAL_AFTER_ACTIVE_MS = 1_500;
const LEDGER_REMOVE_PLANNED_AFTER_ADD_MS = 3_000;
const LEDGER_REMOVE_ACK_MS = 1_500;
const LEDGER_REMOVE_TERMINAL_AFTER_ACK_MS = 3_500;
// Run 21-22-08's seed ledger reads: sub-second until the self-move terminal
// (the slow-read warning, threshold 1 s, throttle 10 s, first fires at
// 21:25:33 = +44 s, 1178 ms; then 21:25:45, 1413 ms) — so the latency is
// injected only from the terminal on, during the ledger cure phase.
const LEDGER_AUTHORITATIVE_READ_LATENCY_MS = 1_178;
const DISPATCH_ACK_LATENCY_MS = 8_700;
const REPLICA_ACTIVATION_MS = 6_000;
// The scheduler's priority retry cadence
// (unified-rebalancer-policy-scheduler-methods.js getPriorityRetryDelayMs ->
// REBALANCER_DEFAULT.UNIFIED.CRITICAL_CHECK_DELAY_MS).
const PRIORITY_RETRY_DELAY_MS = REBALANCER_DEFAULT.UNIFIED.CRITICAL_CHECK_DELAY_MS;
const PRIORITY_ADD_BUDGET_LIMIT = REBALANCER_DEFAULT.COORDINATOR.MAX_CONCURRENT_ADDS;
// The HEAD values the cure must leave untouched.
const HEAD_MAX_CONCURRENT_ADDS = 5;
const HEAD_CRITICAL_CHECK_DELAY_MS = 5_000;
const FORMATION_READINESS_BUDGET_MS = 60_000;

// rebalance-coordinator-ledger-interlock-admission.js module-local reason
// codes and operation-workflow-dispatch-execution.js park reason.
const SELF_MOVE_IN_FLIGHT_REASON = 'operation_ledger_self_move_in_flight';
const SELF_MOVE_WAITING_REASON =
  'operation_ledger_self_move_waiting_for_idle_ledger';
const QUORUM_CONCENTRATED_REASON = 'operation_ledger_quorum_concentrated';
const RETRYABLE_SKIP_REASONS = Object.freeze(new Set([
  REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
  REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
]));
const INCOMPLETE_OPERATIONS_QUERY_MARKER = 'workflow_step IN';
const REPLICA_OPERATIONS_TABLE_MARKER = SYSTEM_TABLE_NAME.REPLICA_OPERATIONS;
const DELIVERY_ACKNOWLEDGED_STATUS = 'completed';
// cdc-integration-service-shared-constants.js AUTHORITATIVE_READ_SOURCE
// .OWNER_RPC_LANE: the source the surplus REMOVE placement fence requires.
const AUTHORITATIVE_READ_SOURCE_OWNER_RPC_LANE = 'owner_rpc_lane';

const ROUND = Object.freeze({
  FIRST_SPREAD: 0,
  SECOND_SPREAD: 1,
});
const ROUND_TARGET_NODE_ID = Object.freeze({
  [ROUND.FIRST_SPREAD]: JOINER_2_NODE_ID,
  [ROUND.SECOND_SPREAD]: JOINER_3_NODE_ID,
});
const ROUND_REPLICA_INDEX = Object.freeze({
  [ROUND.FIRST_SPREAD]: SPREAD_REPLICA_INDEX,
  [ROUND.SECOND_SPREAD]: SECOND_SPREAD_REPLICA_INDEX,
});

const EVENT = Object.freeze({
  DEPENDENT_REFUSED: 'dependent_refused',
  DEPENDENT_ADMITTED: 'dependent_admitted',
  DEPENDENT_CREATED: 'dependent_created',
  DEPENDENT_DISPATCH_SENT: 'dependent_dispatch_sent',
  DEPENDENT_DISPATCH_ACKED: 'dependent_dispatch_acked',
  DEPENDENT_COMPLETED: 'dependent_completed',
  EXEMPT_CREATED: 'exempt_created',
  EXEMPT_DISPATCH_SENT: 'exempt_dispatch_sent',
  EXEMPT_DISPATCH_ACKED: 'exempt_dispatch_acked',
  EXEMPT_COMPLETED: 'exempt_completed',
  EXEMPT_SECOND_ROUND_ADMITTED: 'exempt_second_round_admitted',
  EXEMPT_SECOND_ROUND_REFUSED: 'exempt_second_round_refused',
  EXEMPT_SECOND_ROUND_SENT: 'exempt_second_round_sent',
  EXEMPT_SECOND_ROUND_ACKED: 'exempt_second_round_acked',
  EXEMPT_SECOND_ROUND_COMPLETED: 'exempt_second_round_completed',
  NODE_READY: 'node_ready',
  SELF_MOVE_DISPATCH_PARKED: 'self_move_dispatch_parked',
  SELF_MOVE_SENT: 'self_move_sent',
  SELF_MOVE_ACKED: 'self_move_acked',
  SELF_MOVE_ACTIVE: 'self_move_active',
  SELF_MOVE_TERMINAL: 'self_move_terminal',
  LEDGER_ADD_CREATED: 'ledger_add_created',
  LEDGER_ADD_COMPLETED: 'ledger_add_completed',
  LEDGER_REMOVE_CREATED: 'ledger_remove_created',
  LEDGER_REMOVE_REFUSED: 'ledger_remove_refused',
  LEDGER_REMOVE_COMPLETED: 'ledger_remove_completed',
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

// The run's formation shape: every priority partition has three replicas on
// two distinct nodes (the seed twice, joiner-1 once) except the ledger, whose
// three voters are ALL on the seed (fully concentrated: the count-neutral
// REPLACE is the only admissible cure), and control_plane_publications, whose
// earlier spread ADD already reached joiner-3.
function buildFormationServiceRows(ledgerThirdReplicaNodeId = SEED_NODE_ID) {
  return PRIORITY_TABLE_IDS.flatMap((tableId) => {
    const isLedger = tableId === LEDGER_TABLE_ID;
    return [
      buildServiceRow({
        tableId,
        index: LEADER_REPLICA_INDEX,
        nodeId: SEED_NODE_ID,
        raftRole: RAFT_ROLE_LEADER,
      }),
      buildServiceRow({
        tableId,
        index: MOVED_REPLICA_INDEX,
        nodeId:
          tableId === EXEMPT_TABLE_ID ? JOINER_3_NODE_ID : SEED_NODE_ID,
        raftRole: RAFT_ROLE_FOLLOWER,
      }),
      buildServiceRow({
        tableId,
        index: THIRD_REPLICA_INDEX,
        nodeId: isLedger ? ledgerThirdReplicaNodeId : JOINER_1_NODE_ID,
        raftRole: RAFT_ROLE_FOLLOWER,
      }),
    ];
  });
}

function buildPartitionRows() {
  return PRIORITY_TABLE_IDS.map((tableId) => ({
    partition_id: partitionIdOf(tableId),
    table_id: tableId,
    replica_count: TARGET_REPLICA_COUNT,
  }));
}

function buildNodeRow(nodeId, nowMs, ready) {
  return {
    node_id: nodeId,
    status: NODE_STATUS_ACTIVE,
    connection_state: ready ? CONNECTION_STATE_READY : CONNECTION_STATE_CONNECTED,
    last_heartbeat: nowMs,
    ready_lease_expires_at: ready ? nowMs + READY_LEASE_MS : null,
  };
}

function buildInitialPublicationRow() {
  return {
    publication_epoch: INITIAL_PUBLICATION_EPOCH,
    status: PUBLICATION_STATUS_PUBLISHED,
    published_active_node_ids: [SEED_NODE_ID],
    required_ack_node_ids: [SEED_NODE_ID],
    acknowledged_node_ids: [SEED_NODE_ID],
    priority_partition_summary: {
      satisfied: false,
      missingPartitionIds: PRIORITY_TABLE_IDS.map(partitionIdOf),
    },
  };
}

// A planner move carries the membership publication epoch it was planned
// against (the dispatch epoch fence refuses stale plans).
function buildMove({
  type,
  tableId,
  targetNodeId,
  replicaIndex,
  moveReason,
  publicationEpoch,
}) {
  const partitionId = partitionIdOf(tableId);
  const move = {
    type,
    partitionId,
    entityType: REBALANCER_ENTITY_TYPE.PARTITION,
    entityId: partitionId,
    nodeId: targetNodeId,
    moveReason: moveReason || MOVE_REASON_SPREAD,
    enforceConcurrentOperationBudget: true,
    emitOperationCreated: true,
    membershipPublicationEpoch: publicationEpoch,
  };
  if (type !== OperationType.ADD) {
    move.sourceNodeId = SEED_NODE_ID;
    move.replicaId = replicaIdOf(partitionId, replicaIndex);
  }
  return move;
}

// The joiners' startup authority, derived by the production owners from the
// actual placement rows (modeled publication/ack as immediate, as in the
// sibling cadence witness).
function deriveStartupAuthority({serviceRows, nodeRows, nowMs, publicationRow}) {
  const planningInputs = {
    publisherNodeId: SEED_NODE_ID,
    sourceTopologyEpoch: INITIAL_TOPOLOGY_EPOCH,
    sourceSnapshotVersion: INITIAL_SNAPSHOT_VERSION,
    nowMs,
    nodeRows,
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
      planningAnswer: candidate,
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
    planningAnswer: publishedCandidate,
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
// the ledger cure phase's control-plane pressure (run 21-22-08: slow reads
// only after the self-move terminal, see LEDGER_AUTHORITATIVE_READ_LATENCY_MS).
function injectLedgerReadLatency({coordinator, timeSource, isPressured}) {
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
      if (isPressured() && isIncompleteOperationsRead(args[sqlIndex])) {
        await delay();
      }
      return original(...args);
    };
  }
}

// Boundary injection: the ledger partition's authoritative placement rows
// (owner-RPC lane of the control-plane gateway), read by the surplus REMOVE
// placement fence and the quorum-spread re-verification.
function injectAuthoritativeServiceRows({coordinator, getServiceRows}) {
  const gateway = coordinator.controlPlaneSystemTableGateway;
  const original = gateway.readAuthoritativeRows.bind(gateway);
  gateway.readAuthoritativeRows = async (tableName, sql, params, options) => {
    if (tableName !== SYSTEM_TABLE_NAME.SERVICES) {
      return original(tableName, sql, params, options);
    }
    // entity-service-row-read.js: params are [service_type, partition_id].
    // Only the ledger partition's placement is answered: the fence and the
    // quorum-spread re-verification read it; the other priority partitions
    // keep the fixture's empty authoritative answer (as in the sibling
    // cadence witness), so their spread ADDs stay admissible.
    const [, partitionId] = params;
    if (partitionId !== LEDGER_PARTITION_ID) {
      return original(tableName, sql, params, options);
    }
    return {
      success: true,
      rows: getServiceRows().filter((row) => row.partition_id === partitionId),
      source: AUTHORITATIVE_READ_SOURCE_OWNER_RPC_LANE,
    };
  };
}

// Boundary injection: the readiness owner's per-node READY lease, read by the
// real owners through controlPlaneReadinessService.getNodeReadinessSync (the
// same surface the dispatch readiness capture and the interlock consult).
function buildUniformNodeReadiness(nodeId, ready) {
  const dimensions = {};
  for (const dimensionName of Object.values(CONTROL_PLANE_READINESS_DIMENSION)) {
    dimensions[dimensionName] = ready;
  }
  return {nodeId, dimensions};
}

function injectNodeReadiness({coordinator, isNodeReady, buildNodeReadiness}) {
  const readinessService = coordinator.controlPlaneReadinessService;
  readinessService.getNodeReadinessSync = (nodeId) =>
    buildNodeReadiness(nodeId, isNodeReady(nodeId));
}

// The default scenario profile: run 21-22-08's shape (ledger fully
// concentrated on the seed, uniform run-cited dispatch latency, a READY node
// satisfies every readiness dimension, placement follows the self-move's
// terminal, no extra injections).
const DEFAULT_SCENARIO_PROFILE = Object.freeze({
  ledgerThirdReplicaNodeId: SEED_NODE_ID,
  dispatchAckLatencyMsByTableId: Object.freeze({}),
  buildNodeReadiness: buildUniformNodeReadiness,
  exemptSecondRound: null,
  placementFollowsSelfMoveActive: false,
  ledgerSpreadAddOnTerminal: true,
  scheduleExtras: null,
  isDone: null,
});

// The owner's deferred-retry lanes (dispatch park re-drives, remote handoff
// follow-ups) must ride the virtual clock like every other latency here.
function bindOwnerTimersToClock({coordinator, timeSource}) {
  const owner = coordinator.workflowOwner;
  owner.setTimeoutFn = (callback, delayMs) =>
    timeSource.setTimeout(callback, delayMs);
  owner.clearTimeoutFn = (handle) => timeSource.clearTimeout(handle);
}

// The owner-derived startup authority, planning answer and publication row,
// read by the real owners through the readiness service (the surplus REMOVE
// placement fence and published-membership safety, and the dispatch epoch
// gate consult them).
function bindStartupAuthority({
  coordinator,
  getPublicationRow,
  getStartupAuthority,
  getPlanningAnswer,
}) {
  const readinessService = coordinator.controlPlaneReadinessService;
  readinessService.getCurrentPublishedMembershipEpochSync = () =>
    getPublicationRow().publication_epoch;
  readinessService.membershipPublicationService = {
    getLatestClusterPublicationSync: () => getPublicationRow(),
  };
  readinessService.getStartupAuthoritySnapshotSync = () =>
    getStartupAuthority();
  readinessService.getMembershipPublicationPlanningSnapshotBestEffort =
    async () => getPlanningAnswer();
}

async function flushMicrotasks() {
  for (let round = 0; round < MICROTASK_FLUSH_ROUNDS; round += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

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

function buildCoordinator({timeSource, nodeId, trackedOperations}) {
  return createTimeoutTestCoordinator({
    timeSource,
    nodeId,
    trackedOperations,
    pendingTimeoutMs: REBALANCER_DEFAULT.COORDINATOR.PENDING_TIMEOUT_MS,
    creatingTimeoutMs: REBALANCER_DEFAULT.COORDINATOR.CREATING_TIMEOUT_MS,
    syncingTimeoutMs: REBALANCER_DEFAULT.COORDINATOR.SYNCING_TIMEOUT_MS,
    removingTimeoutMs: REBALANCER_DEFAULT.COORDINATOR.REMOVING_TIMEOUT_MS,
  });
}

async function runSelfMovePlannedBeforeAddsScenario(
  profile = DEFAULT_SCENARIO_PROFILE,
) {
  initializeEnvironment();
  const timeSource = new VirtualTimeSource({startMs: START_MS});
  const trackedOperations = new Map();
  const seedFixture = buildCoordinator({
    timeSource,
    nodeId: SEED_NODE_ID,
    trackedOperations,
  });
  const targetFixture = buildCoordinator({
    timeSource,
    nodeId: JOINER_1_NODE_ID,
    trackedOperations,
  });
  const seed = seedFixture.coordinator;
  const target = targetFixture.coordinator;
  let anchorMs = START_MS;
  const elapsed = () => timeSource.now() - anchorMs;
  const events = [];
  const record = (type, detail = {}) => {
    events.push({atMs: elapsed(), type, ...detail});
  };

  // Witness truth for the readiness owner and the placement rows; the seed's
  // system table cache mirrors the ledger placement + node rows so the real
  // quorum-concentration hold evaluates actuals.
  const readyNodeIds = new Set([SEED_NODE_ID]);
  const serviceRows = buildFormationServiceRows(
    profile.ledgerThirdReplicaNodeId,
  );
  let publicationRow = buildInitialPublicationRow();
  const nodeRows = () =>
    [SEED_NODE_ID, ...JOINING_NODE_IDS].map((nodeId) =>
      buildNodeRow(nodeId, timeSource.now(), readyNodeIds.has(nodeId)),
    );
  const cache = seed.systemTableCache;
  const syncSeedCache = () => {
    for (const row of nodeRows()) {
      cache.upsert(SYSTEM_TABLE_NAME.NODES, row);
    }
    for (const row of buildPartitionRows()) {
      cache.upsert(SYSTEM_TABLE_NAME.PARTITIONS, row);
    }
    const ledgerRows = serviceRows.filter(
      (row) => row.partition_id === LEDGER_PARTITION_ID,
    );
    const liveServiceIds = new Set(ledgerRows.map((row) => row.service_id));
    for (const row of cache.getAll(SYSTEM_TABLE_NAME.SERVICES)) {
      if (!liveServiceIds.has(row.service_id)) {
        cache.delete(SYSTEM_TABLE_NAME.SERVICES, row.service_id);
      }
    }
    for (const row of ledgerRows) {
      cache.upsert(SYSTEM_TABLE_NAME.SERVICES, {...row});
    }
  };
  syncSeedCache();

  const state = {
    selfMove: null,
    selfMoveDispatchAdmissibleAtMs: null,
    selfMoveFirstDispatchAttemptAtMs: null,
    selfMoveParks: [],
    selfMoveSentAtMs: null,
    dependentsInFlightAtSelfMoveSend: null,
    selfMoveAckedAtMs: null,
    selfMoveTerminalAtMs: null,
    ledgerAdd: null,
    ledgerAddCreatedAtMs: null,
    ledgerAddCompletedAtMs: null,
    ledgerRemove: null,
    ledgerRemoveCreatedAtMs: null,
    ledgerRemoveCompletedAtMs: null,
    ledgerRemoveRefusals: [],
    ledgerRemoveTimer: null,
    startupAuthorityReadyAtMs: null,
    startupAuthority: null,
    planningAnswer: null,
    // A successor ledger self-move a profile registers after the t+0 REPLACE
    // (holder-release witness): the target transport witnesses its
    // CREATE_REPLICA with the same run-cited lifecycle.
    successorSelfMoveId: null,
    // Profile-owned observations (the fairness fixture records its census
    // attempts, reconcile outcome and second self-move attempt here).
    extras: {},
  };

  const dependents = new Map(
    DEPENDENT_TABLE_IDS.map((tableId) => [
      tableId,
      {
        tableId,
        partitionId: partitionIdOf(tableId),
        round: ROUND.FIRST_SPREAD,
        attemptInFlight: false,
        retryTimer: null,
        refusals: [],
        rounds: Object.fromEntries(
          Object.values(ROUND).map((round) => [
            round,
            {operation: null, admittedAtMs: null, createdAtMs: null,
              sentAtMs: null, ackedAtMs: null, completedAtMs: null},
          ]),
        ),
      },
    ]),
  );
  const exempt = {
    tableId: EXEMPT_TABLE_ID,
    partitionId: partitionIdOf(EXEMPT_TABLE_ID),
    operation: null,
    createdAtMs: null,
    sentAtMs: null,
    ackedAtMs: null,
    completedAtMs: null,
    refusals: [],
    // The first exempt ADD row handed to the transport (its createOperation
    // resolves only after the retained dispatch acknowledges, so the row id
    // is learned at send time).
    dispatchedOperationId: null,
    secondRound: null,
  };
  const dependentByPartitionId = new Map(
    [...dependents.values()].map((dependent) => [dependent.partitionId, dependent]),
  );
  const roundByTargetNodeId = new Map(
    Object.entries(ROUND_TARGET_NODE_ID).map(([round, nodeId]) => [
      nodeId,
      Number(round),
    ]),
  );
  // The transport boundary observes the persisted ledger row (the created
  // operation object is handed back only after the arm/dispatch ran).
  const rowOf = (operationId) => trackedOperations.get(operationId) || null;
  // The seed's synchronous hold phase (rebalance-coordinator-ledger-
  // interlock-hold-state.js), observed on every admission probe.
  const holderPhase = () =>
    seed.getOperationLedgerInterlockAdmissionState().heldSelfMovePhase;
  const tableIdOf = (operationId) =>
    PRIORITY_TABLE_IDS.find(
      (tableId) => partitionIdOf(tableId) === rowOf(operationId)?.partition_id,
    ) || null;
  const ackLatencyMsOf = (operationId) =>
    profile.dispatchAckLatencyMsByTableId[tableIdOf(operationId)] ??
    DISPATCH_ACK_LATENCY_MS;
  const operationOf = (operationId) =>
    seed.repository.rowToOperation(rowOf(operationId));
  const roundOfOperation = (operationId) => {
    const row = rowOf(operationId);
    const dependent = dependentByPartitionId.get(row?.partition_id) || null;
    const round = roundByTargetNodeId.get(row?.target_node_id);
    if (!dependent || row?.type !== OperationType.ADD || round === undefined) {
      return null;
    }
    return {dependent, round};
  };
  const isExemptAddRow = (operationId) => {
    const row = rowOf(operationId);
    return row?.partition_id === exempt.partitionId &&
      row?.type === OperationType.ADD;
  };
  const isExemptSecondRoundRow = (operationId) =>
    isExemptAddRow(operationId) &&
    exempt.dispatchedOperationId !== null &&
    exempt.dispatchedOperationId !== operationId;
  const isLedgerAddRow = (operationId) => {
    const row = rowOf(operationId);
    return row?.partition_id === LEDGER_PARTITION_ID &&
      row?.type === OperationType.ADD;
  };
  const isLedgerRemoveRow = (operationId) => {
    const row = rowOf(operationId);
    return row?.partition_id === LEDGER_PARTITION_ID &&
      row?.type === OperationType.REMOVE;
  };
  const countDependentAddRowsInFlight = () =>
    [...trackedOperations.values()].filter(
      (row) =>
        DEPENDENT_TABLE_IDS.some(
          (tableId) => partitionIdOf(tableId) === row.partition_id,
        ) &&
        row.type === OperationType.ADD &&
        !isTerminalStep(row.type, row.workflow_step),
    ).length;

  const refreshStartupAuthority = () => {
    const derived = deriveStartupAuthority({
      serviceRows,
      nodeRows: nodeRows(),
      nowMs: timeSource.now(),
      publicationRow,
    });
    publicationRow = derived.publicationRow;
    state.startupAuthority = derived.startupAuthority;
    state.planningAnswer = derived.planningAnswer;
    if (
      state.startupAuthorityReadyAtMs === null &&
      derived.startupAuthority.state === STARTUP_AUTHORITY_STATE.READY
    ) {
      state.startupAuthorityReadyAtMs = elapsed();
      record(EVENT.STARTUP_AUTHORITY_READY);
    }
  };
  const markNodeReady = (nodeId) => {
    readyNodeIds.add(nodeId);
    syncSeedCache();
    record(EVENT.NODE_READY, {nodeId});
    refreshStartupAuthority();
  };

  for (const coordinator of [seed, target]) {
    injectNodeReadiness({
      coordinator,
      isNodeReady: (nodeId) => readyNodeIds.has(nodeId),
      buildNodeReadiness: (nodeId, ready) =>
        profile.buildNodeReadiness(nodeId, ready, {
          spreadSatisfied: state.startupAuthorityReadyAtMs !== null,
        }),
    });
    bindOwnerTimersToClock({coordinator, timeSource});
    bindStartupAuthority({
      coordinator,
      getPublicationRow: () => publicationRow,
      getStartupAuthority: () => state.startupAuthority,
      getPlanningAnswer: () => state.planningAnswer,
    });
  }
  injectLedgerReadLatency({
    coordinator: seed,
    timeSource,
    isPressured: () => state.selfMoveTerminalAtMs !== null,
  });
  injectAuthoritativeServiceRows({
    coordinator: seed,
    getServiceRows: () => serviceRows,
  });

  const completeOnSeed = async (operation) =>
    seed.completeOperation({
      ...operation,
      workflowStep:
        trackedOperations.get(operation.operationId)?.workflow_step ||
        operation.workflowStep,
    });

  // Modeled replica activation of an acknowledged ADD, recorded through the
  // owner's real terminal transition and reflected in the placement rows.
  const activateAdd = ({operation, tableId, replicaIndex, onCompleted}) => {
    timeSource.setTimeout(() => {
      completeOnSeed(operation)
        .then(() => {
          serviceRows.push(
            buildServiceRow({
              tableId,
              index: replicaIndex,
              nodeId: operation.targetNodeId,
              raftRole: RAFT_ROLE_FOLLOWER,
            }),
          );
          syncSeedCache();
          onCompleted();
          refreshStartupAuthority();
        })
        .catch((error) => {
          record(EVENT.DEPENDENT_COMPLETED, {
            tableId,
            error: error.message,
          });
        });
    }, REPLICA_ACTIVATION_MS);
  };

  // Per-partition rebalancer loop analogue on the seed: one attempt per wake,
  // a typed retryable skip re-arms the priority retry cadence, any completion
  // wakes every pending lane. Each dependent spreads in two rounds (its first
  // ADD to joiner-2, then the follow-up ADD to joiner-3, run 21-08-21's
  // cpp -> n3), so dependent admission keeps being probed across the whole
  // self-move lifecycle.
  const attemptDependent = async (dependent) => {
    const roundState = dependent.rounds[dependent.round];
    if (roundState.operation || dependent.attemptInFlight) {
      return;
    }
    dependent.attemptInFlight = true;
    if (dependent.retryTimer !== null) {
      timeSource.clearTimeout(dependent.retryTimer);
      dependent.retryTimer = null;
    }
    const attemptedAtMs = elapsed();
    try {
      const operation = await seed.createOperation(
        buildMove({
          publicationEpoch: publicationRow.publication_epoch,
          type: OperationType.ADD,
          tableId: dependent.tableId,
          targetNodeId: ROUND_TARGET_NODE_ID[dependent.round],
        }),
      );
      roundState.operation = operation;
      roundState.createdAtMs = elapsed();
      record(EVENT.DEPENDENT_CREATED, {
        tableId: dependent.tableId,
        round: dependent.round,
        attemptedAtMs,
        holderPhase: holderPhase(),
      });
    } catch (error) {
      if (!isTypedRetryableSkip(error)) {
        throw error;
      }
      const reason = skipReasonOf(error);
      dependent.refusals.push({
        atMs: attemptedAtMs,
        resolvedAtMs: elapsed(),
        reason,
        round: dependent.round,
        holderPhase: holderPhase(),
      });
      record(EVENT.DEPENDENT_REFUSED, {
        tableId: dependent.tableId,
        round: dependent.round,
        reason,
        holderPhase: holderPhase(),
      });
      dependent.retryTimer = timeSource.setTimeout(() => {
        dependent.retryTimer = null;
        attemptDependent(dependent).catch((attemptError) => {
          record(EVENT.DEPENDENT_REFUSED, {
            tableId: dependent.tableId,
            reason: attemptError.message,
          });
        });
      }, PRIORITY_RETRY_DELAY_MS);
    } finally {
      dependent.attemptInFlight = false;
    }
  };
  const attemptExempt = async () => {
    if (exempt.operation) {
      return;
    }
    try {
      exempt.operation = await seed.createOperation(
        buildMove({
          publicationEpoch: publicationRow.publication_epoch,
          type: OperationType.ADD,
          tableId: exempt.tableId,
          targetNodeId: JOINER_2_NODE_ID,
        }),
      );
      exempt.createdAtMs = elapsed();
      record(EVENT.EXEMPT_CREATED);
    } catch (error) {
      if (!isTypedRetryableSkip(error)) {
        throw error;
      }
      exempt.refusals.push({atMs: elapsed(), reason: skipReasonOf(error)});
    }
  };
  // The exempt partition's follow-up spread ADD (fairness profile: run
  // 23-58-17's control_plane_publications re-plan 0.5-1.1 s after each
  // completion, 00:01:39.16 -> n1), admitted under the EXEMPT row of the
  // hold relation whatever the hold phase.
  const attemptExemptSecondRound = async () => {
    const secondRound = exempt.secondRound;
    secondRound.attemptedAtMs = elapsed();
    try {
      secondRound.operation = await seed.createOperation(
        buildMove({
          publicationEpoch: publicationRow.publication_epoch,
          type: OperationType.ADD,
          tableId: exempt.tableId,
          targetNodeId: profile.exemptSecondRound.targetNodeId,
        }),
      );
      secondRound.admittedAtMs = elapsed();
      record(EVENT.EXEMPT_SECOND_ROUND_ADMITTED, {holderPhase: holderPhase()});
    } catch (error) {
      if (!isTypedRetryableSkip(error)) {
        throw error;
      }
      secondRound.refusals.push({atMs: elapsed(), reason: skipReasonOf(error)});
      record(EVENT.EXEMPT_SECOND_ROUND_REFUSED, {
        reason: skipReasonOf(error),
        holderPhase: holderPhase(),
      });
    }
  };
  const scheduleExemptSecondRound = () => {
    if (!profile.exemptSecondRound) {
      return;
    }
    exempt.secondRound = {
      attemptedAtMs: null,
      admittedAtMs: null,
      operation: null,
      ackedAtMs: null,
      completedAtMs: null,
      refusals: [],
    };
    timeSource.setTimeout(() => {
      attemptExemptSecondRound().catch((error) => {
        record(EVENT.EXEMPT_SECOND_ROUND_REFUSED, {reason: error.message});
      });
    }, profile.exemptSecondRound.plannedAfterCompletionMs);
  };
  const wakeDependents = () => {
    for (const dependent of dependents.values()) {
      attemptDependent(dependent).catch((error) => {
        record(EVENT.DEPENDENT_REFUSED, {
          tableId: dependent.tableId,
          reason: error.message,
        });
      });
    }
  };
  // Ledger partition loop analogue: the spread ADD (the exempt quorum-spread
  // cure) on the self-move terminal, the surplus REMOVE after it.
  const attemptLedgerAdd = async () => {
    if (state.ledgerAdd) {
      return;
    }
    state.ledgerAdd = await seed.createOperation(
      buildMove({
        publicationEpoch: publicationRow.publication_epoch,
        type: OperationType.ADD,
        tableId: LEDGER_TABLE_ID,
        targetNodeId: JOINER_2_NODE_ID,
      }),
    );
    state.ledgerAddCreatedAtMs = elapsed();
    record(EVENT.LEDGER_ADD_CREATED);
  };
  const attemptLedgerRemove = () => {
    if (state.ledgerRemove) {
      return;
    }
    seed
      .createOperation(
        buildMove({
          publicationEpoch: publicationRow.publication_epoch,
          type: OperationType.REMOVE,
          tableId: LEDGER_TABLE_ID,
          targetNodeId: SEED_NODE_ID,
          replicaIndex: THIRD_REPLICA_INDEX,
          moveReason: MOVE_REASON_SURPLUS,
        }),
      )
      .then((operation) => {
        state.ledgerRemove = operation;
        state.ledgerRemoveCreatedAtMs = elapsed();
        record(EVENT.LEDGER_REMOVE_CREATED);
      })
      .catch((error) => {
        const reason = isTypedRetryableSkip(error) ?
          skipReasonOf(error) :
          error.message;
        state.ledgerRemoveRefusals.push({atMs: elapsed(), reason});
        record(EVENT.LEDGER_REMOVE_REFUSED, {reason});
        if (isTypedRetryableSkip(error)) {
          state.ledgerRemoveTimer = timeSource.setTimeout(() => {
            state.ledgerRemoveTimer = null;
            attemptLedgerRemove();
          }, PRIORITY_RETRY_DELAY_MS);
        }
      });
  };
  // Seed transport boundary: CREATE_REPLICA acknowledgements after the run's
  // dispatch round trip; remote-owner wakes are acknowledged as delivered
  // (the target's own row-driven dispatch is the canonical path, driven
  // below once n1 is READY); the ledger REMOVE_REPLICA acknowledges and
  // terminates on the run's follow-up REMOVE cadence.
  seed.workflowOwner.messageRouter.deliver = (targetAddress, request) => {
    const operationId = request?.operationId || null;
    if (request?.type === MESSAGE_TYPE.CREATE_REPLICA) {
      const dependentRound = roundOfOperation(operationId);
      if (dependentRound) {
        const roundState = dependentRound.dependent.rounds[dependentRound.round];
        roundState.sentAtMs = elapsed();
        record(EVENT.DEPENDENT_DISPATCH_SENT, {
          tableId: dependentRound.dependent.tableId,
          round: dependentRound.round,
        });
      } else if (isExemptSecondRoundRow(operationId)) {
        record(EVENT.EXEMPT_SECOND_ROUND_SENT);
      } else if (isExemptAddRow(operationId)) {
        exempt.dispatchedOperationId = operationId;
        exempt.sentAtMs = elapsed();
        record(EVENT.EXEMPT_DISPATCH_SENT);
      }
      return new Promise((resolve) =>
        timeSource.setTimeout(() => {
          if (dependentRound) {
            const roundState =
              dependentRound.dependent.rounds[dependentRound.round];
            roundState.ackedAtMs = elapsed();
            record(EVENT.DEPENDENT_DISPATCH_ACKED, {
              tableId: dependentRound.dependent.tableId,
              round: dependentRound.round,
            });
            activateAdd({
              operation: operationOf(operationId),
              tableId: dependentRound.dependent.tableId,
              replicaIndex: ROUND_REPLICA_INDEX[dependentRound.round],
              onCompleted: () => {
                roundState.completedAtMs = elapsed();
                record(EVENT.DEPENDENT_COMPLETED, {
                  tableId: dependentRound.dependent.tableId,
                  round: dependentRound.round,
                });
                if (dependentRound.round === ROUND.FIRST_SPREAD) {
                  dependentRound.dependent.round = ROUND.SECOND_SPREAD;
                  attemptDependent(dependentRound.dependent).catch((error) => {
                    record(EVENT.DEPENDENT_REFUSED, {
                      tableId: dependentRound.dependent.tableId,
                      reason: error.message,
                    });
                  });
                }
              },
            });
          } else if (isExemptSecondRoundRow(operationId)) {
            exempt.secondRound.ackedAtMs = elapsed();
            record(EVENT.EXEMPT_SECOND_ROUND_ACKED);
            activateAdd({
              operation: operationOf(operationId),
              tableId: exempt.tableId,
              replicaIndex: SECOND_SPREAD_REPLICA_INDEX,
              onCompleted: () => {
                exempt.secondRound.completedAtMs = elapsed();
                record(EVENT.EXEMPT_SECOND_ROUND_COMPLETED);
              },
            });
          } else if (isExemptAddRow(operationId)) {
            exempt.ackedAtMs = elapsed();
            record(EVENT.EXEMPT_DISPATCH_ACKED);
            activateAdd({
              operation: operationOf(operationId),
              tableId: exempt.tableId,
              replicaIndex: SPREAD_REPLICA_INDEX,
              onCompleted: () => {
                exempt.completedAtMs = elapsed();
                record(EVENT.EXEMPT_COMPLETED);
                scheduleExemptSecondRound();
              },
            });
          } else if (isLedgerAddRow(operationId)) {
            activateAdd({
              operation: operationOf(operationId),
              tableId: LEDGER_TABLE_ID,
              replicaIndex: SPREAD_REPLICA_INDEX,
              onCompleted: () => {
                state.ledgerAddCompletedAtMs = elapsed();
                record(EVENT.LEDGER_ADD_COMPLETED);
                state.ledgerRemoveTimer = timeSource.setTimeout(() => {
                  state.ledgerRemoveTimer = null;
                  attemptLedgerRemove();
                }, LEDGER_REMOVE_PLANNED_AFTER_ADD_MS);
              },
            });
          }
          resolve({
            acknowledged: true,
            status: ReplicaOperationResponseStatus.INITIATED,
          });
        }, ackLatencyMsOf(operationId)),
      );
    }
    if (
      request?.type === MESSAGE_TYPE.REMOVE_REPLICA &&
      isLedgerRemoveRow(operationId)
    ) {
      return new Promise((resolve) =>
        timeSource.setTimeout(() => {
          timeSource.setTimeout(() => {
            completeOnSeed(operationOf(operationId)).then(() => {
              const removedIndex = serviceRows.findIndex(
                (row) =>
                  row.replica_id ===
                  replicaIdOf(LEDGER_PARTITION_ID, THIRD_REPLICA_INDEX),
              );
              serviceRows.splice(removedIndex, SINGLE_OPERATION);
              syncSeedCache();
              state.ledgerRemoveCompletedAtMs = elapsed();
              record(EVENT.LEDGER_REMOVE_COMPLETED);
              refreshStartupAuthority();
            });
          }, LEDGER_REMOVE_TERMINAL_AFTER_ACK_MS);
          resolve({
            acknowledged: true,
            status: ReplicaOperationResponseStatus.INITIATED,
          });
        }, LEDGER_REMOVE_ACK_MS),
      );
    }
    return Promise.resolve({
      acknowledged: true,
      status: DELIVERY_ACKNOWLEDGED_STATUS,
    });
  };

  // Placement actuals of the REPLACE. Default profile: the moved replica row
  // changes node at the terminal (run 21-22-08's source removal). A profile
  // with placementFollowsSelfMoveActive observes the replacement replica on
  // n1 from the REPLACE's ACTIVE step (a fourth row until the source retires
  // at the terminal — run 23-58-17: the spread was satisfied at the REPLACE's
  // ACTIVE 02:01.79, the source REMOVE followed).
  const movedReplicaRow = () =>
    serviceRows.find(
      (serviceRow) =>
        serviceRow.replica_id ===
        replicaIdOf(LEDGER_PARTITION_ID, MOVED_REPLICA_INDEX),
    );
  const applySelfMoveActivePlacement = (row) => {
    if (!profile.placementFollowsSelfMoveActive) {
      return;
    }
    serviceRows.push({
      ...buildServiceRow({
        tableId: LEDGER_TABLE_ID,
        index: MOVED_REPLICA_INDEX,
        nodeId: JOINER_1_NODE_ID,
        raftRole: RAFT_ROLE_FOLLOWER,
      }),
      service_id: row.replica_id,
      replica_id: row.replica_id,
    });
    syncSeedCache();
    refreshStartupAuthority();
  };
  const applySelfMoveTerminalPlacement = () => {
    const movedReplica = movedReplicaRow();
    if (profile.placementFollowsSelfMoveActive) {
      serviceRows.splice(serviceRows.indexOf(movedReplica), SINGLE_OPERATION);
      return;
    }
    movedReplica.node_id = JOINER_1_NODE_ID;
    movedReplica.address = addressOf(JOINER_1_NODE_ID);
  };

  // Target (n1) transport boundary: the self-move's CREATE_REPLICA is
  // acknowledged after the run's 14 s creation, reaches ACTIVE 9.6 s later
  // and its source removal terminal 1.5 s after that.
  const isWitnessedLedgerSelfMove = (operationId) =>
    operationId === state.selfMove?.operationId ||
    (state.successorSelfMoveId !== null &&
      operationId === state.successorSelfMoveId);
  target.workflowOwner.messageRouter.deliver = (targetAddress, request) => {
    const operationId = request?.operationId || null;
    if (
      request?.type !== MESSAGE_TYPE.CREATE_REPLICA ||
      !isWitnessedLedgerSelfMove(operationId)
    ) {
      return Promise.resolve({
        acknowledged: true,
        status: DELIVERY_ACKNOWLEDGED_STATUS,
      });
    }
    if (state.selfMoveSentAtMs === null) {
      state.selfMoveSentAtMs = elapsed();
      state.dependentsInFlightAtSelfMoveSend = countDependentAddRowsInFlight();
      record(EVENT.SELF_MOVE_SENT, {
        dependentsInFlight: state.dependentsInFlightAtSelfMoveSend,
      });
    }
    return new Promise((resolve) =>
      timeSource.setTimeout(() => {
        state.selfMoveAckedAtMs = elapsed();
        record(EVENT.SELF_MOVE_ACKED);
        timeSource.setTimeout(() => {
          const row = trackedOperations.get(operationId);
          row.workflow_step = WORKFLOW_STEP.ACTIVE;
          row.status = WORKFLOW_STEP_TO_STATUS[WORKFLOW_STEP.ACTIVE];
          record(EVENT.SELF_MOVE_ACTIVE);
          applySelfMoveActivePlacement(row);
          timeSource.setTimeout(() => {
            row.workflow_step = WORKFLOW_STEP.STOPPING;
            row.status = WORKFLOW_STEP_TO_STATUS[WORKFLOW_STEP.STOPPING];
            completeOnSeed(operationOf(operationId)).then(() => {
              applySelfMoveTerminalPlacement();
              syncSeedCache();
              state.selfMoveTerminalAtMs = elapsed();
              record(EVENT.SELF_MOVE_TERMINAL);
              refreshStartupAuthority();
            });
          }, SELF_MOVE_TERMINAL_AFTER_ACTIVE_MS);
        }, SELF_MOVE_ACTIVE_AFTER_ACK_MS);
        resolve({
          acknowledged: true,
          status: ReplicaOperationResponseStatus.INITIATED,
        });
      }, SELF_MOVE_CREATE_ACK_MS),
    );
  };

  // Real-owner observation: every park of a ledger self-move's dispatch by an
  // owner's ledger idle check (n1 for the REPLACE, the seed for the surplus
  // REMOVE), with the dependents live at that instant.
  for (const coordinator of [target, seed]) {
    const owner = coordinator.workflowOwner;
    const originalPark = owner.parkOperationLedgerSelfMoveDispatch.bind(owner);
    owner.parkOperationLedgerSelfMoveDispatch = (operation, reason, ...rest) => {
      const park = {
        atMs: elapsed(),
        nodeId: coordinator.nodeId,
        operationType: operation?.type || null,
        reason,
        dependentsInFlight: countDependentAddRowsInFlight(),
      };
      if (operation?.operationId === state.selfMove?.operationId) {
        state.selfMoveParks.push(park);
      }
      record(EVENT.SELF_MOVE_DISPATCH_PARKED, park);
      return originalPark(operation, reason, ...rest);
    };
  }

  // Admission instant = the persisted row (the coordinator's OPERATION_CREATED
  // event); createOperation itself returns only after the retained dispatch.
  seed.on(REBALANCE_COORDINATOR_EVENT.OPERATION_CREATED, ({operation}) => {
    const dependentRound = roundOfOperation(operation?.operationId);
    if (!dependentRound) {
      return;
    }
    const roundState = dependentRound.dependent.rounds[dependentRound.round];
    if (roundState.admittedAtMs === null) {
      roundState.admittedAtMs = elapsed();
      record(EVENT.DEPENDENT_ADMITTED, {
        tableId: dependentRound.dependent.tableId,
        round: dependentRound.round,
      });
    }
  });
  seed.on(REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED, ({operation}) => {
    if (
      operation?.operationId === state.selfMove?.operationId &&
      profile.ledgerSpreadAddOnTerminal
    ) {
      attemptLedgerAdd().catch((error) => {
        record(EVENT.LEDGER_ADD_CREATED, {error: error.message});
      });
    }
    wakeDependents();
  });

  // n1's row-driven dispatch of the self-move once n1 is READY (the replica
  // dispatch service's readiness capture admits the row to the owner's
  // dispatchOperation; the owner's own retry lanes re-drive every park).
  const driveTargetDispatch = () => {
    const row = trackedOperations.get(state.selfMove.operationId);
    state.selfMoveFirstDispatchAttemptAtMs = elapsed();
    target
      .dispatchOperation(target.repository.rowToOperation(row))
      .catch((error) => {
        record(EVENT.SELF_MOVE_DISPATCH_PARKED, {error: error.message});
      });
  };

  try {
    // t+0: the ledger partition's critical planner creates the count-neutral
    // REPLACE first (run 21-22-08: 21:24:48.89, 3.6 s before the ADDs).
    state.selfMove = await awaitUnderClock({
      timeSource,
      elapsed,
      promise: seed.createOperation(
        buildMove({
          publicationEpoch: publicationRow.publication_epoch,
          type: OperationType.REPLACE,
          tableId: LEDGER_TABLE_ID,
          targetNodeId: JOINER_1_NODE_ID,
          replicaIndex: MOVED_REPLICA_INDEX,
        }),
      ),
    });
    anchorMs = timeSource.now();
    refreshStartupAuthority();

    timeSource.setTimeout(() => {
      attemptExempt().catch((error) => {
        record(EVENT.EXEMPT_CREATED, {error: error.message});
      });
      wakeDependents();
    }, DEPENDENTS_PLANNED_AT_MS);
    timeSource.setTimeout(() => {
      markNodeReady(JOINER_1_NODE_ID);
      state.selfMoveDispatchAdmissibleAtMs = elapsed();
      driveTargetDispatch();
    }, TARGET_READY_AT_MS);
    timeSource.setTimeout(() => {
      markNodeReady(JOINER_2_NODE_ID);
    }, JOINER_2_READY_AT_MS);
    if (typeof profile.scheduleExtras === LOCAL_STR_FUNCTION) {
      profile.scheduleExtras({
        timeSource,
        elapsed,
        record,
        seed,
        target,
        state,
        exempt,
        trackedOperations,
        publicationRow: () => publicationRow,
        holderPhase,
      });
    }

    const dependentsSpread = () =>
      [...dependents.values()].every(
        (dependent) =>
          dependent.rounds[ROUND.SECOND_SPREAD].operation !== null,
      );
    await driveClockUntil({
      timeSource,
      elapsed,
      isDone: () =>
        typeof profile.isDone === LOCAL_STR_FUNCTION ?
          profile.isDone({state, exempt, dependentsSpread, elapsed}) :
          state.startupAuthorityReadyAtMs !== null &&
            state.ledgerRemoveCompletedAtMs !== null &&
            dependentsSpread(),
    });
  } finally {
    for (const dependent of dependents.values()) {
      if (dependent.retryTimer !== null) {
        timeSource.clearTimeout(dependent.retryTimer);
      }
    }
    if (state.ledgerRemoveTimer !== null) {
      timeSource.clearTimeout(state.ledgerRemoveTimer);
    }
    await target.shutdown();
    await seed.shutdown();
    resetEnvironment();
  }

  return {
    events,
    dependents: [...dependents.values()].map((dependent) => ({
      tableId: dependent.tableId,
      refusals: dependent.refusals,
      firstRound: dependent.rounds[ROUND.FIRST_SPREAD],
      secondRound: dependent.rounds[ROUND.SECOND_SPREAD],
    })),
    exempt: {
      createdAtMs: exempt.createdAtMs,
      sentAtMs: exempt.sentAtMs,
      ackedAtMs: exempt.ackedAtMs,
      completedAtMs: exempt.completedAtMs,
      refusals: exempt.refusals,
      secondRound: exempt.secondRound,
    },
    extras: state.extras,
    selfMove: {
      dispatchAdmissibleAtMs: state.selfMoveDispatchAdmissibleAtMs,
      firstDispatchAttemptAtMs: state.selfMoveFirstDispatchAttemptAtMs,
      parks: state.selfMoveParks,
      sentAtMs: state.selfMoveSentAtMs,
      dependentsInFlightAtSend: state.dependentsInFlightAtSelfMoveSend,
      ackedAtMs: state.selfMoveAckedAtMs,
      terminalAtMs: state.selfMoveTerminalAtMs,
    },
    ledger: {
      addCreatedAtMs: state.ledgerAddCreatedAtMs,
      addCompletedAtMs: state.ledgerAddCompletedAtMs,
      removeCreatedAtMs: state.ledgerRemoveCreatedAtMs,
      removeCompletedAtMs: state.ledgerRemoveCompletedAtMs,
      removeRefusals: state.ledgerRemoveRefusals,
    },
    startupAuthorityReadyAtMs: state.startupAuthorityReadyAtMs,
    startupAuthority: state.startupAuthority,
    budget: {maxConcurrentAdds: seed.config.maxConcurrentAdds},
  };
}

export {
  DEFAULT_SCENARIO_PROFILE,
  DEPENDENTS_PLANNED_AT_MS,
  EXEMPT_TABLE_ID,
  FORMATION_READINESS_BUDGET_MS,
  JOINER_1_NODE_ID,
  JOINER_3_NODE_ID,
  JOINER_4_NODE_ID,
  LEADER_REPLICA_INDEX,
  LEDGER_PARTITION_ID,
  LEDGER_TABLE_ID,
  MOVED_REPLICA_INDEX,
  TARGET_READY_AT_MS,
  buildMove,
  buildUniformNodeReadiness,
  isTypedRetryableSkip,
  skipReasonOf,
  HEAD_CRITICAL_CHECK_DELAY_MS,
  HEAD_MAX_CONCURRENT_ADDS,
  PRIORITY_ADD_BUDGET_LIMIT,
  PRIORITY_RETRY_DELAY_MS,
  QUORUM_CONCENTRATED_REASON,
  SELF_MOVE_ACTIVE_AFTER_ACK_MS,
  SELF_MOVE_CREATE_ACK_MS,
  SELF_MOVE_IN_FLIGHT_REASON,
  SELF_MOVE_TERMINAL_AFTER_ACTIVE_MS,
  SELF_MOVE_WAITING_REASON,
  runSelfMovePlannedBeforeAddsScenario,
};
