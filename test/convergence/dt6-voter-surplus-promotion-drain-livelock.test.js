import t from 'tap';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {
  WORKFLOW_STEP_TO_STATUS,
  getNextWorkflowStep,
  isTerminalStep,
} from '../../src/rebalancer/replica-operation-progress.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  PartitionService,
  RaftRole,
} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SERVICE_TYPE, SERVICE_STATUS} from '../../src/constants/index.js';
import {
  armTerminalTransitionRepair,
  runTerminalTransitionRepairAttempt,
} from '../../src/rebalancer/operation-workflow-terminal-transition-repair.js';
import {createTimeoutTestCoordinator} from '../rebalancer/timeout-test-coordinator.js';

// Quest formation-voter-surplus-promotion-deferral-livelock (P1) — deterministic
// reproduction of the affinity-demo run-21 voter-surplus wedge on
// sql_write_operations-p1 (5 active voters, target 3):
//
//   A surplus-drain REPLACE (source voter -> new learner) pinned SYNCING while the
//   learner's promotion deferred 355x on the replica-count guard
//   (maxAllowedVotersAfterPromotion=4, votersAfter=6). The promotion<->drain circular
//   wait is real but SELF-BREAKING: the executor's 60s voter-ready wait timed out and
//   the coordinator called failOperation. The BINDING defect is what happened next:
//   the FAILED transition's ledger UPDATE was acknowledged but never landed (run-21
//   final row: status=syncing, completed_at NULL), the post-commit visibility
//   confirmation is best-effort (warn-and-drop), and no recovery path repairs a
//   non-terminal durable row whose owner already holds the terminal truth in memory
//   (stale-FAIL settle requires an UNAVAILABLE owner; the in-memory twin is terminal
//   so nothing re-runs failOperation). The immortal SYNCING ghost blocked every
//   same-partition REMOVE at the priority remove-lane admission and every re-planned
//   REPLACE at the critical create lane, so the surplus never drained (9 minutes,
//   then demo teardown).
//
// HONEST SCOPE (what is real vs modeled):
//   - REAL: the full createOperation admission chain (priority/critical lanes,
//     remove-lane serialization, conflicting-REPLACE-for-REMOVE) on a real
//     RebalanceCoordinator; the real failOperation -> executeAtomicTransition ->
//     persist -> confirmCommittedTransitionPersistence chain; the real learner
//     promotion guard (checkLearnerPromotion on a real PartitionService) reading the
//     coordinator's live operation rows through the systemTableCache seam; the real
//     workflow step chains (getNextWorkflowStep / isTerminalStep).
//   - MODELED (deterministic drive at the layer where the invariant is produced):
//     workflow progress is folded by a tick driver; a REPLACE cannot advance past
//     SYNCING until its learner promotes (production couples this through the target
//     replica's observed ACTIVE status, which requires promotion); the executor's
//     60s voter-ready bound reports failure into the REAL failOperation chain;
//     the planner re-mints the surplus-drain REPLACE whenever none is in flight
//     (run-21's re-planning loop); membership effects (services rows) are applied by
//     the driver when operations complete; owner retry timers ride a virtual-timer
//     scheduler injected through the owner's setTimeoutFn seam; the run-21 ledger
//     write loss is injected at the storage gateway seam in BOTH observed loss
//     modes — 'silent' (the UPDATE is acknowledged with no change count; the loss
//     is only detectable by the post-commit visibility confirmation — run-21's two
//     silently-DEFERRED completed ghosts) and 'zero-row' (the UPDATE honestly
//     reports zero changed rows, which the unfixed head SWALLOWS because the
//     terminal persistFns never returned the persist result — run-21's FAILED
//     ghost b94b130a). Each mode drops the first LOST_TERMINAL_WRITE_COUNT
//     terminal writes for the first REPLACE (a transient burst; run-21 lost the
//     only attempt ever made, because nothing retried).
//
// The livelock is a TERMINAL-TRANSITION DURABILITY defect, not a budget-size or
// guard-arithmetic defect: the same composition with the write loss disabled
// completes end-to-end on the CURRENT head (see the self-breaking-cycle control —
// each REPLACE generation times out after 60s, durably fails, frees the remove lane
// for one surplus REMOVE, and the final generation promotes at target voters), and
// the promotion guard's replica-count deferral at 5 voters is correct-by-design
// protection that passes once the surplus drains.

const START_MS = 5_000_000;
const TICK_MS = 1_000;
const MAX_CYCLES = 400;
const VOTER_READY_TIMEOUT_MS = 60_000;
const LOST_TERMINAL_WRITE_COUNT = 3;
// Production's level-triggered timeout scan re-reports an executor failure for
// an operation whose terminal transition did not commit; the driver mirrors
// that cadence (it never re-reports once the in-memory twin is terminal —
// exactly the production hole the repair loop covers).
const REFAIL_INTERVAL_TICKS = 5;
const LOSS_MODE = {
  NONE: 'none',
  SILENT: 'silent',
  ZERO_ROW: 'zero_row',
};
const TARGET_REPLICA_COUNT = 3;
const PARTITION_ID = `${SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS}-p1`;
const TABLE_ID = SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS;
const COORDINATOR_NODE_ID = 'node-1';
const LEARNER_NODE_ID = 'node-3';
const SURPLUS_NODE_ID = 'node-2';
const SOURCE_NODE_ID = 'node-0';
const FIRST_LEARNER_GENERATION = 7;
const REPLICA = {
  SOURCE: `${PARTITION_ID}-r2`,
  VOTER_B: `${PARTITION_ID}-r3`,
  VOTER_C: `${PARTITION_ID}-r4`,
  SURPLUS_A: `${PARTITION_ID}-r5`,
  SURPLUS_B: `${PARTITION_ID}-r6`,
};
const RAFT_ROLE_ROW = {
  LEADER: 'leader',
  FOLLOWER: 'follower',
  LEARNER: 'learner',
};
const RETRYABLE_SKIP_REASONS = new Set([
  'budget_exceeded',
  'deferred_retry_pending',
  'conflicting_operation_in_flight',
]);
const TABLES_SERVICES = 'services';
const TABLES_PARTITIONS = 'partitions';
const TABLES_REPLICA_OPERATIONS = 'replica_operations';

t.beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

t.afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function learnerReplicaId(generation) {
  return `${PARTITION_ID}-r${generation}`;
}

function buildServiceRow({replicaId, nodeId, raftRole}) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: PARTITION_ID,
    node_id: nodeId,
    service_type: SERVICE_TYPE.PARTITION,
    status: SERVICE_STATUS.ACTIVE,
    raft_role: raftRole,
  };
}

// The run-21 membership: 5 active voters (r5/r6 the duplicate-emergency-ADD surplus
// on the same node); the REPLACE's learner target row is added per generation.
function buildRun21ServiceRows() {
  return [
    buildServiceRow({
      replicaId: REPLICA.SOURCE,
      nodeId: SOURCE_NODE_ID,
      raftRole: RAFT_ROLE_ROW.LEADER,
    }),
    buildServiceRow({
      replicaId: REPLICA.VOTER_B,
      nodeId: SOURCE_NODE_ID,
      raftRole: RAFT_ROLE_ROW.FOLLOWER,
    }),
    buildServiceRow({
      replicaId: REPLICA.VOTER_C,
      nodeId: COORDINATOR_NODE_ID,
      raftRole: RAFT_ROLE_ROW.FOLLOWER,
    }),
    buildServiceRow({
      replicaId: REPLICA.SURPLUS_A,
      nodeId: SURPLUS_NODE_ID,
      raftRole: RAFT_ROLE_ROW.FOLLOWER,
    }),
    buildServiceRow({
      replicaId: REPLICA.SURPLUS_B,
      nodeId: SURPLUS_NODE_ID,
      raftRole: RAFT_ROLE_ROW.FOLLOWER,
    }),
  ];
}

// The learner-side promotion guard reads membership, the partition target, and the
// coordinator's live operation rows through this cache seam (the genuine
// cross-subsystem composition: the SAME rows the coordinator admission chain sees).
function buildPartitionCache({serviceRows, trackedOperations}) {
  return {
    get: (tableName, key) => {
      if (tableName === TABLES_PARTITIONS && key === PARTITION_ID) {
        return {
          partition_id: PARTITION_ID,
          replica_count: TARGET_REPLICA_COUNT,
        };
      }
      return null;
    },
    filter: (tableName, predicate) => {
      if (tableName === TABLES_SERVICES) {
        return serviceRows.filter(predicate);
      }
      if (tableName === TABLES_REPLICA_OPERATIONS) {
        return Array.from(trackedOperations.values()).filter(predicate);
      }
      if (tableName === TABLES_PARTITIONS) {
        return [
          {partition_id: PARTITION_ID, replica_count: TARGET_REPLICA_COUNT},
        ].filter(predicate);
      }
      return [];
    },
  };
}

function createLearnerPartitionService({
  replicaId,
  partitionCache,
  leaderReplicaId,
  deferrals,
}) {
  const partition = new PartitionService({
    partitionId: PARTITION_ID,
    tableId: TABLE_ID,
    tableName: TABLE_ID,
    replicaId,
    replicaIds: [replicaId],
    nodeId: LEARNER_NODE_ID,
    dbPath: ':memory:',
    isJoiningExistingGroup: true,
    systemTableCache: partitionCache,
  });
  partition.role = RaftRole.LEARNER;
  partition.leaderId = leaderReplicaId;
  // Per-instance log recorder: capture the guard's structured deferral payloads
  // without depending on log transport (the message text is shared across causes).
  partition.logger = {
    info: (message, payload) => {
      if (payload && payload.replicaId === replicaId) {
        deferrals.push({
          reason: payload.reason,
          activeVoterCount: payload.activeVoterCount,
          maxAllowedVotersAfterPromotion:
            payload.maxAllowedVotersAfterPromotion,
        });
      }
    },
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
  return partition;
}

// One promotion-loop iteration (production: a 1s self-rescheduling native timer the
// virtual clock cannot drive — plan limits row f — so the driver calls the REAL
// guard once per tick and disarms the rescheduled timer).
function drivePromotionCheck(partition) {
  partition.checkLearnerPromotion();
  if (partition.learnerPromotionTimer) {
    clearTimeout(partition.learnerPromotionTimer);
    partition.learnerPromotionTimer = null;
  }
  return partition.role === RaftRole.FOLLOWER;
}

function nonTerminalOperations(trackedOperations, labels) {
  return Array.from(trackedOperations.values())
    .filter((op) => !isTerminalStep(op.type, op.workflow_step))
    .sort(
      (a, b) =>
        labels.orderOf(a.operation_id) - labels.orderOf(b.operation_id),
    );
}

function createOperationLabels() {
  const byOperationId = new Map();
  return {
    register(operationId, label) {
      if (!byOperationId.has(operationId)) {
        byOperationId.set(operationId, {label, order: byOperationId.size});
      }
    },
    labelOf(operationId) {
      return byOperationId.get(operationId)?.label || operationId;
    },
    orderOf(operationId) {
      const entry = byOperationId.get(operationId);
      return entry ? entry.order : Number.MAX_SAFE_INTEGER;
    },
  };
}

// The run-21 ledger write loss, injected at the storage gateway seam the
// repository actually writes through. The terminal-transition UPDATE for the
// designated operation is dropped (the row never changes) for the first
// LOST_TERMINAL_WRITE_COUNT attempts; the acknowledgement shape is the loss
// mode under test: SILENT acks with no change count (loss detectable only by
// the visibility confirmation), ZERO_ROW honestly reports changes: 0 (which
// the unfixed head swallows). Creation INSERTs and progress UPDATEs are exempt
// (run-21 lost exactly the terminal transitions).
// UPDATE_OPERATION params: [status, workflow_step, updated_at, completed_at,
// error_message, steps_history, replica_id, operation_id].
const UPDATE_PARAM_INDEX_WORKFLOW_STEP = 1;
const UPDATE_PARAM_INDEX_OPERATION_ID = 7;
function armGatewayTerminalWriteLoss({coordinator, state, events}) {
  const gateway = coordinator.repository.controlPlaneSystemTableGateway;
  const originalExecuteQuery = gateway.executeQuery.bind(gateway);
  gateway.executeQuery = async (sql, params = [], queryOptions = {}) => {
    const isTerminalUpdateForLostOperation =
      typeof sql === 'string' &&
      sql.includes('UPDATE replica_operations') &&
      Array.isArray(params) &&
      params[UPDATE_PARAM_INDEX_OPERATION_ID] ===
        state.lostWriteOperationId &&
      isTerminalStep(
        OperationType.REPLACE,
        params[UPDATE_PARAM_INDEX_WORKFLOW_STEP],
      );
    if (
      isTerminalUpdateForLostOperation &&
      state.lossMode !== LOSS_MODE.NONE &&
      state.lostWrites < LOST_TERMINAL_WRITE_COUNT
    ) {
      state.lostWrites += 1;
      events.push(
        `LEDGER_TERMINAL_WRITE_LOST ${state.lostWrites} ${state.lossMode}`,
      );
      return state.lossMode === LOSS_MODE.ZERO_ROW ?
        {success: true, changes: 0} :
        {success: true};
    }
    return originalExecuteQuery(sql, params, queryOptions);
  };
}

// The priority-surplus REMOVE placement fence (d708b3db) revalidates every
// standalone priority REMOVE against the authoritative services owner
// (owner-RPC required, no SQL fallback) before persisting it. The fixture has
// no owner RPC lane, so a healthy services owner is modeled at the same
// gateway seam: the fence's owner-required read is answered from the LIVE
// serviceRows (the same rows the promotion guard reads), every other read
// passes through untouched.
function armAuthoritativeServicesOwnerRead({coordinator, serviceRows}) {
  const gateway = coordinator.repository.controlPlaneSystemTableGateway;
  const originalReadAuthoritativeRows =
    gateway.readAuthoritativeRows.bind(gateway);
  gateway.readAuthoritativeRows = async (
    tableName,
    sql,
    params = [],
    queryOptions = {},
  ) => {
    if (
      tableName === SYSTEM_TABLE_NAME.SERVICES &&
      queryOptions?.authoritativeReadMode ===
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED
    ) {
      return {
        success: true,
        source: 'owner_rpc_lane',
        rows: serviceRows.map((row) => ({...row})),
      };
    }
    return originalReadAuthoritativeRows(tableName, sql, params, queryOptions);
  };
}

// Owner retry timers (the terminal-transition repair backoff) ride the virtual
// clock: the owner's setTimeoutFn/clearTimeoutFn seam is redirected into this
// scheduler and due timers fire from the workflow tick after the clock
// advances — deterministic, no wall-clock waits.
function armVirtualOwnerTimers({coordinator, timeSource}) {
  const timers = [];
  coordinator.workflowOwner.setTimeoutFn = (fn, delayMs) => {
    const handle = {
      fireAtMs: timeSource.now() + Math.max(1, Number(delayMs) || 1),
      fn,
      cleared: false,
      fired: false,
    };
    timers.push(handle);
    return handle;
  };
  coordinator.workflowOwner.clearTimeoutFn = (handle) => {
    if (handle && typeof handle === 'object') {
      handle.cleared = true;
    }
  };
  return {
    async fireDueTimers(nowMs) {
      for (const handle of timers) {
        if (!handle.cleared && !handle.fired && handle.fireAtMs <= nowMs) {
          handle.fired = true;
          // Awaiting the callback keeps the drive deterministic: the repair
          // attempt (and its visibility confirmation) completes before the
          // tick proceeds, instead of racing the loop on the platform clock.
          await handle.fn();
        }
      }
    },
  };
}

function buildReplaceMove(replicaId) {
  return {
    type: OperationType.REPLACE,
    partitionId: PARTITION_ID,
    entityType: 'partition',
    entityId: PARTITION_ID,
    nodeId: LEARNER_NODE_ID,
    replicaId,
    sourceNodeId: SOURCE_NODE_ID,
    enforceConcurrentOperationBudget: true,
  };
}

function buildSurplusRemoveMove(replicaId) {
  return {
    type: OperationType.REMOVE,
    partitionId: PARTITION_ID,
    entityType: 'partition',
    entityId: PARTITION_ID,
    nodeId: SURPLUS_NODE_ID,
    replicaId,
    enforceConcurrentOperationBudget: true,
  };
}

async function attemptCreate({coordinator, move, events, cycle, label, labels}) {
  try {
    const operation = await coordinator.createOperation(move);
    if (
      operation?.partitionId !== move.partitionId ||
      operation?.type !== move.type
    ) {
      events.push(`${cycle} ${label} coalesced-skip`);
      return {created: false, operation: null, skipReason: null};
    }
    labels.register(operation.operationId, label);
    events.push(`${cycle} ${label} created`);
    return {created: true, operation, skipReason: null};
  } catch (error) {
    const skipReason = error?.rebalanceSkipReason || null;
    if (skipReason && RETRYABLE_SKIP_REASONS.has(skipReason)) {
      events.push(`${cycle} ${label} skipped ${skipReason}`);
      return {created: false, operation: null, skipReason};
    }
    throw error;
  }
}

function countActiveVoterRows(serviceRows) {
  return serviceRows.filter(
    (row) =>
      row.status === SERVICE_STATUS.ACTIVE &&
      (row.raft_role === RAFT_ROLE_ROW.LEADER ||
        row.raft_role === RAFT_ROLE_ROW.FOLLOWER),
  ).length;
}

function removeServiceRow(serviceRows, replicaId) {
  const index = serviceRows.findIndex((row) => row.replica_id === replicaId);
  if (index >= 0) {
    serviceRows.splice(index, 1);
  }
}

function promoteServiceRow(serviceRows, replicaId) {
  const row = serviceRows.find((entry) => entry.replica_id === replicaId);
  if (row) {
    row.raft_role = RAFT_ROLE_ROW.FOLLOWER;
  }
}

// One deterministic driver tick over the coordinator's operation rows, riding the
// REAL workflow step chains. Coupling rules (the layer production produces through
// the target replica's observed status and executor completion callbacks):
//   - a REPLACE advances SYNCING -> ACTIVE only when its learner has PROMOTED;
//   - completing steps apply their membership effect to the shared services rows
//     (REPLACE STOPPING removes the source voter; REMOVE terminal removes the
//     drained voter; promotion flips the learner's row to follower).
async function driveWorkflowTick({scenario, events, tick}) {
  const {
    trackedOperations,
    timeSource,
    labels,
    serviceRows,
    promotedByReplicaId,
    virtualTimers,
  } = scenario;
  timeSource.advance(TICK_MS);
  await virtualTimers.fireDueTimers(timeSource.now());
  for (const op of nonTerminalOperations(trackedOperations, labels)) {
    const nextStep = getNextWorkflowStep(op.type, op.workflow_step);
    if (!nextStep) {
      continue;
    }
    if (
      op.type === OperationType.REPLACE &&
      op.workflow_step === WORKFLOW_STEP.SYNCING &&
      !promotedByReplicaId.has(op.replica_id)
    ) {
      continue;
    }
    const previousStep = op.workflow_step;
    op.workflow_step = nextStep;
    op.status = WORKFLOW_STEP_TO_STATUS[nextStep] || op.status;
    op.updated_at = timeSource.now();
    if (isTerminalStep(op.type, nextStep)) {
      op.completed_at = timeSource.now();
    }
    if (
      op.type === OperationType.REPLACE &&
      previousStep === WORKFLOW_STEP.STOPPING
    ) {
      removeServiceRow(serviceRows, REPLICA.SOURCE);
    }
    if (op.type === OperationType.REMOVE && isTerminalStep(op.type, nextStep)) {
      removeServiceRow(serviceRows, op.replica_id);
    }
    events.push(`${tick} ${labels.labelOf(op.operation_id)} ${nextStep}`);
  }
}

function syncInMemoryOperationFromRow(operation, trackedOperations) {
  const row = trackedOperations.get(operation.operationId);
  if (row) {
    operation.workflowStep = row.workflow_step;
    operation.status = row.status;
  }
}

// Planner analogue, in the move planner's own calculation order: excess
// REMOVEs are computed BEFORE replacement moves, so the surplus drain gets
// the admission window first when the remove lane frees up.
async function attemptSurplusRemoves(ctx, cycle) {
  for (const entry of ctx.surplusRemoves) {
    if (entry.created) {
      continue;
    }
    const outcome = await attemptCreate({
      coordinator: ctx.coordinator,
      move: entry.move,
      events: ctx.events,
      cycle,
      label: entry.label,
      labels: ctx.labels,
    });
    entry.created = outcome.created;
  }
}

// The planner analogue re-mints the surplus-drain REPLACE (a fresh learner
// replica each generation) whenever none is in flight and the source voter
// still needs draining.
async function attemptReplanGeneration(ctx, cycle) {
  const replaceInFlight = ctx.replaceGenerations.some(
    (generation) =>
      generation.operation &&
      !isTerminalStep(
        OperationType.REPLACE,
        ctx.trackedOperations.get(generation.operation.operationId)
          ?.workflow_step || WORKFLOW_STEP.PENDING,
      ),
  );
  const sourceStillPresent = ctx.serviceRows.some(
    (row) => row.replica_id === REPLICA.SOURCE,
  );
  if (replaceInFlight || !sourceStillPresent) {
    return;
  }
  const outcome = await attemptCreate({
    coordinator: ctx.coordinator,
    move: buildReplaceMove(learnerReplicaId(ctx.learnerGeneration)),
    events: ctx.events,
    cycle,
    label: `REPLACE:gen${ctx.learnerGeneration}`,
    labels: ctx.labels,
  });
  if (!outcome.created) {
    return;
  }
  if (ctx.lossState.lostWriteOperationId === null) {
    ctx.lossState.lostWriteOperationId = outcome.operation.operationId;
  }
  // The coordinator allocates the canonical learner replica id itself; the
  // learner replica and its services row must carry THAT id or the guard's
  // op-owned allowance and the workflow coupling never engage.
  const replicaId = outcome.operation.replicaId;
  ctx.serviceRows.push(
    buildServiceRow({
      replicaId,
      nodeId: LEARNER_NODE_ID,
      raftRole: RAFT_ROLE_ROW.LEARNER,
    }),
  );
  ctx.replaceGenerations.push({
    replicaId,
    operation: outcome.operation,
    learner: createLearnerPartitionService({
      replicaId,
      partitionCache: ctx.partitionCache,
      leaderReplicaId: REPLICA.SOURCE,
      deferrals:
        ctx.learnerGeneration === FIRST_LEARNER_GENERATION ?
          ctx.firstGenerationDeferrals :
          [],
    }),
    syncingSinceMs: null,
    failReported: false,
    failReportedAtTick: null,
  });
  ctx.learnerGeneration += 1;
}

// The learner promotion loop (REAL guard, 1 Hz in production).
function drivePromotionLoop(ctx, tick) {
  for (const generation of ctx.replaceGenerations) {
    if (generation.learner.role !== RaftRole.LEARNER) {
      continue;
    }
    if (drivePromotionCheck(generation.learner)) {
      ctx.promotedByReplicaId.add(generation.replicaId);
      promoteServiceRow(ctx.serviceRows, generation.replicaId);
      ctx.events.push(`${tick} PROMOTED ${generation.replicaId}`);
    }
  }
}

// The executor's voter-ready wait (REAL 60s bound, virtual clock): a REPLACE
// still SYNCING with an unpromoted learner past the bound reports failure, and
// the coordinator runs the REAL failOperation persistence chain. Applies to
// EVERY generation. Level-triggered like production's timeout scan: while the
// durable row stays SYNCING and the in-memory twin has NOT terminalized (an
// honest uncommitted transition), the failure is re-reported each interval.
// Once the in-memory twin is terminal, nothing re-reports — that ghost class
// is exactly what the terminal-transition repair must cover.
function isVoterReadyFailureReportDue(ctx, generation, tick) {
  const inMemoryTerminal =
    generation.operation.workflowStep === WORKFLOW_STEP.FAILED &&
    generation.operation.completedAt !== null &&
    generation.operation.completedAt !== undefined;
  const refailDue =
    generation.failReportedAtTick === null ||
    tick - generation.failReportedAtTick >= REFAIL_INTERVAL_TICKS;
  const syncingElapsedMs = ctx.timeSource.now() - generation.syncingSinceMs;
  return (
    syncingElapsedMs >= VOTER_READY_TIMEOUT_MS &&
    !ctx.promotedByReplicaId.has(generation.replicaId) &&
    !inMemoryTerminal &&
    refailDue
  );
}

async function reportVoterReadyTimeouts(ctx, tick) {
  for (const generation of ctx.replaceGenerations) {
    const row = ctx.trackedOperations.get(generation.operation.operationId);
    if (!row || row.workflow_step !== WORKFLOW_STEP.SYNCING) {
      continue;
    }
    if (generation.syncingSinceMs === null) {
      generation.syncingSinceMs = ctx.timeSource.now();
    }
    if (!isVoterReadyFailureReportDue(ctx, generation, tick)) {
      continue;
    }
    if (generation.failReportedAtTick === null) {
      syncInMemoryOperationFromRow(generation.operation, ctx.trackedOperations);
    }
    await ctx.coordinator.failOperation(
      generation.operation,
      `Replica ${generation.replicaId} did not become voter-ready ` +
        `within ${VOTER_READY_TIMEOUT_MS}ms`,
    );
    generation.failReportedAtTick = tick;
    generation.failReported = true;
    removeServiceRow(ctx.serviceRows, generation.replicaId);
    ctx.events.push(`${tick} REPLACE_FAIL_REPORTED gen:${generation.replicaId}`);
  }
}

function isVoterSurplusScenarioSettled(ctx) {
  const drained =
    countActiveVoterRows(ctx.serviceRows) === TARGET_REPLICA_COUNT &&
    ctx.surplusRemoves.every((entry) => entry.created);
  const sourceDrained = !ctx.serviceRows.some(
    (row) => row.replica_id === REPLICA.SOURCE,
  );
  const nothingInFlight =
    nonTerminalOperations(ctx.trackedOperations, ctx.labels).length === 0;
  return drained && sourceDrained && nothingInFlight;
}

// The run-21 composition, end to end. Returns the measured shape; assertions live
// in the tests so the same scenario serves the livelock proof, the no-loss control,
// and the determinism check.
async function runVoterSurplusScenario({lossMode}) {
  const timeSource = new VirtualTimeSource({startMs: START_MS});
  const fixture = createTimeoutTestCoordinator({
    timeSource,
    nodeId: COORDINATOR_NODE_ID,
  });
  const {coordinator, trackedOperations} = fixture;
  // Keep the (real) post-commit visibility confirmation loop fast: its deadline
  // rides the platform clock, not the virtual clock.
  coordinator.repository.replicaOperationAuthoritativeVisibilityTimeoutMs = 100;
  coordinator.repository.replicaOperationAuthoritativeVisibilityRetryDelayMs = 5;
  const virtualTimers = armVirtualOwnerTimers({coordinator, timeSource});

  const events = [];
  const labels = createOperationLabels();
  const serviceRows = buildRun21ServiceRows();
  const lossState = {
    lossMode,
    lostWriteOperationId: null,
    lostWrites: 0,
  };
  armGatewayTerminalWriteLoss({coordinator, state: lossState, events});
  armAuthoritativeServicesOwnerRead({coordinator, serviceRows});
  const partitionCache = buildPartitionCache({serviceRows, trackedOperations});
  const promotedByReplicaId = new Set();
  const scenario = {
    trackedOperations,
    timeSource,
    labels,
    serviceRows,
    promotedByReplicaId,
    virtualTimers,
  };

  const ctx = {
    coordinator,
    trackedOperations,
    timeSource,
    events,
    labels,
    serviceRows,
    lossState,
    partitionCache,
    promotedByReplicaId,
    surplusRemoves: [
      {
        move: buildSurplusRemoveMove(REPLICA.SURPLUS_A),
        label: `REMOVE:${REPLICA.SURPLUS_A}`,
        created: false,
      },
      {
        move: buildSurplusRemoveMove(REPLICA.SURPLUS_B),
        label: `REMOVE:${REPLICA.SURPLUS_B}`,
        created: false,
      },
    ],
    replaceGenerations: [],
    firstGenerationDeferrals: [],
    learnerGeneration: FIRST_LEARNER_GENERATION,
  };
  const {surplusRemoves, replaceGenerations, firstGenerationDeferrals} = ctx;

  const openLearnerTimers = () =>
    replaceGenerations
      .map((generation) => generation.learner)
      .filter((learner) => learner?.learnerPromotionTimer);

  try {
    let tick = 0;
    for (let cycle = 0; cycle < MAX_CYCLES; cycle++) {
      await attemptSurplusRemoves(ctx, cycle);
      await attemptReplanGeneration(ctx, cycle);
      drivePromotionLoop(ctx, tick);
      await driveWorkflowTick({scenario, events, tick});
      tick += 1;
      await reportVoterReadyTimeouts(ctx, tick);
      if (isVoterSurplusScenarioSettled(ctx)) {
        break;
      }
    }

    const finalOps = Array.from(trackedOperations.values()).map((op) => ({
      operationId: op.operation_id,
      label: labels.labelOf(op.operation_id),
      type: op.type,
      workflowStep: op.workflow_step,
      terminal: isTerminalStep(op.type, op.workflow_step),
      completedAt: op.completed_at,
    }));
    const firstGeneration = replaceGenerations[0] || null;
    const firstReplaceRow = firstGeneration ?
      trackedOperations.get(firstGeneration.operation.operationId) :
      null;
    const completedReplaces = replaceGenerations.filter((generation) => {
      const row = trackedOperations.get(generation.operation.operationId);
      return (
        row &&
        row.workflow_step === WORKFLOW_STEP.REMOVED &&
        isTerminalStep(OperationType.REPLACE, row.workflow_step)
      );
    }).length;
    return {
      events,
      finalOps,
      deferrals: firstGenerationDeferrals,
      lostWrites: lossState.lostWrites,
      firstReplaceStep: firstReplaceRow?.workflow_step || null,
      firstReplaceTerminal: firstReplaceRow ?
        isTerminalStep(firstReplaceRow.type, firstReplaceRow.workflow_step) :
        false,
      firstReplaceFailReported: Boolean(firstGeneration?.failReported),
      firstLearnerReplicaId: firstGeneration?.replicaId || null,
      surplusRemovesCreated: surplusRemoves.filter((e) => e.created).length,
      replaceGenerationCount: replaceGenerations.length,
      completedReplaces,
      finalActiveVoterCount: countActiveVoterRows(serviceRows),
      sourceDrained: !serviceRows.some(
        (row) => row.replica_id === REPLICA.SOURCE,
      ),
      pinnedOps: finalOps.filter((op) => !op.terminal),
      promotedReplicaIds: [...promotedByReplicaId],
    };
  } finally {
    for (const learner of openLearnerTimers()) {
      clearTimeout(learner.learnerPromotionTimer);
      learner.learnerPromotionTimer = null;
    }
    await coordinator.shutdown();
  }
}

function assertSurplusDrainsToTarget(t, m) {
  t.ok(
    m.firstReplaceFailReported,
    'the executor voter-ready timeout fires and failOperation runs (cycle self-breaks by design)',
  );
  t.ok(
    m.lostWrites > 0,
    `the injected loss actually swallowed terminal writes (${m.lostWrites})`,
  );
  t.ok(
    m.firstReplaceTerminal,
    'the wedged REPLACE row reaches a durable terminal step despite the write loss ' +
      `(run-21 ghost shape: step=${m.firstReplaceStep}, lostWrites=${m.lostWrites})`,
  );
  t.equal(
    m.surplusRemovesCreated,
    2,
    'both surplus-voter REMOVEs are eventually admitted through the real remove lane',
  );
  t.equal(
    m.finalActiveVoterCount,
    TARGET_REPLICA_COUNT,
    'active voters drain 5 -> 3 (the sealed statement: surplus drains to target)',
  );
  t.ok(
    m.sourceDrained,
    'the REPLACE source voter is drained (a replacement generation completed)',
  );
  t.ok(
    m.completedReplaces >= 1,
    'a re-planned REPLACE generation completes with its learner promoted ' +
      `(promoted: ${JSON.stringify(m.promotedReplicaIds)})`,
  );
  t.equal(
    m.pinnedOps.length,
    0,
    `no operation stays pinned non-terminal (pinned: ${JSON.stringify(m.pinnedOps)})`,
  );
}

t.test(
  'run-21 shape, SILENT loss (acked, no change count — the two completed ghosts): ' +
    'the terminal-transition repair must drain the surplus to target (RED on the unfixed head)',
  async (t) => {
    const m = await runVoterSurplusScenario({lossMode: LOSS_MODE.SILENT});
    assertSurplusDrainsToTarget(t, m);
  },
);

t.test(
  'run-21 shape, ZERO-ROW loss (honest changes:0 the unfixed head swallows — ' +
    'the FAILED ghost b94b130a): the honest persist result + level-triggered ' +
    're-report must drain the surplus to target (RED on the unfixed head)',
  async (t) => {
    const m = await runVoterSurplusScenario({lossMode: LOSS_MODE.ZERO_ROW});
    assertSurplusDrainsToTarget(t, m);
  },
);

t.test(
  'guard composition sanity: promotion defers on the replica-count ceiling at 5 ' +
    'voters with a structured reason (the guard is correct-by-design)',
  async (t) => {
    const m = await runVoterSurplusScenario({lossMode: LOSS_MODE.SILENT});
    t.ok(
      m.deferrals.length > 0,
      `the real guard deferred the first-generation learner (${m.deferrals.length}x)`,
    );
    t.equal(
      m.deferrals[0]?.activeVoterCount,
      5,
      'the guard observed the run-21 voter count',
    );
    t.equal(
      m.deferrals[0]?.maxAllowedVotersAfterPromotion,
      4,
      'the guard computed the run-21 ceiling (target 3 + 1 op-owned replacement)',
    );
    t.equal(
      m.deferrals[0]?.reason,
      'would_exceed_target_replica_count',
      'the deferral carries its structured reason (run-21 logged reason:undefined — ' +
        'the guard referenced literals that were never defined)',
    );
    t.ok(
      m.deferrals.every(
        (deferral) => deferral.activeVoterCount > TARGET_REPLICA_COUNT,
      ),
      'every deferral was recorded while over target — the ceiling held for as ' +
        'long as the surplus existed (promotion proceeds only after the drain)',
    );
  },
);

t.test(
  'self-breaking-cycle control: the SAME composition with no write loss completes ' +
    'end-to-end on the current head (the cycle is not the durable defect)',
  async (t) => {
    const m = await runVoterSurplusScenario({lossMode: LOSS_MODE.NONE});
    t.ok(
      m.firstReplaceFailReported,
      'the voter-ready timeout still fires (promotion correctly deferred at 5 voters)',
    );
    t.ok(
      m.firstReplaceTerminal,
      'the first REPLACE terminalizes durably when the write lands',
    );
    t.equal(
      m.surplusRemovesCreated,
      2,
      'both surplus REMOVEs admit as the timeout churn frees the remove lane',
    );
    t.equal(
      m.finalActiveVoterCount,
      TARGET_REPLICA_COUNT,
      'the surplus drains 5 -> 3 without any fix when terminal writes land',
    );
    t.ok(
      m.sourceDrained,
      'the source voter drains once a generation promotes at target voters',
    );
    t.ok(
      m.completedReplaces >= 1,
      `a REPLACE generation completes (generations: ${m.replaceGenerationCount})`,
    );
    t.equal(
      m.pinnedOps.length,
      0,
      `nothing stays pinned (pinned: ${JSON.stringify(m.pinnedOps)})`,
    );
  },
);

t.test(
  'repair refusal discrimination: a refused persist REARMS against a stale ' +
    'non-terminal row and ABANDONS only when a different durable terminal won',
  async (t) => {
    const timeSource = new VirtualTimeSource({startMs: START_MS});
    const fixture = createTimeoutTestCoordinator({
      timeSource,
      nodeId: COORDINATOR_NODE_ID,
    });
    const {coordinator, trackedOperations} = fixture;
    coordinator.repository.replicaOperationAuthoritativeVisibilityTimeoutMs = 20;
    coordinator.repository.replicaOperationAuthoritativeVisibilityRetryDelayMs = 1;
    armVirtualOwnerTimers({coordinator, timeSource});
    const owner = coordinator.workflowOwner;
    try {
      const operation = await coordinator.createOperation(
        buildReplaceMove(learnerReplicaId(FIRST_LEARNER_GENERATION)),
      );
      const row = trackedOperations.get(operation.operationId);
      row.workflow_step = WORKFLOW_STEP.SYNCING;
      row.status = WORKFLOW_STEP_TO_STATUS[WORKFLOW_STEP.SYNCING] || row.status;
      const failedProjection = {
        ...operation,
        workflowStep: WORKFLOW_STEP.FAILED,
        status: 'failed',
        updatedAt: timeSource.now(),
        completedAt: timeSource.now(),
        errorMessage: 'voter-ready timeout (repair discrimination subtest)',
        stepsHistory: [],
      };

      // Refuse every persist for this operation with an honest zero-change
      // while the durable row stays readable and NON-terminal (the CL-017
      // read/apply divergence family).
      const gateway = coordinator.repository.controlPlaneSystemTableGateway;
      const passthroughExecuteQuery = gateway.executeQuery.bind(gateway);
      let refuseUpdates = true;
      gateway.executeQuery = async (sql, params = [], queryOptions = {}) => {
        if (
          refuseUpdates &&
          typeof sql === 'string' &&
          sql.includes('UPDATE replica_operations') &&
          Array.isArray(params) &&
          params[UPDATE_PARAM_INDEX_OPERATION_ID] === operation.operationId
        ) {
          return {success: true, changes: 0};
        }
        return passthroughExecuteQuery(sql, params, queryOptions);
      };

      armTerminalTransitionRepair(
        owner,
        failedProjection,
        'confirmation_failed',
      );
      t.ok(
        owner.terminalTransitionRepairStateByOperationId.has(
          operation.operationId,
        ),
        'the repair state is armed for the unconfirmed terminal transition',
      );
      await runTerminalTransitionRepairAttempt(owner, operation.operationId);
      t.ok(
        owner.terminalTransitionRepairStateByOperationId.has(
          operation.operationId,
        ),
        'a refused persist against a stale NON-terminal row keeps the repair ' +
          'held (the ghost still exists — abandoning here would recreate it)',
      );
      t.ok(
        owner.terminalTransitionRepairTimerByOperationId.has(
          operation.operationId,
        ),
        'the repair re-armed its retry timer instead of abandoning',
      );

      // A DIFFERENT durable terminal state wins: the row completes as REMOVED
      // while the retained projection says FAILED. The repair must yield.
      row.workflow_step = WORKFLOW_STEP.REMOVED;
      row.status = WORKFLOW_STEP_TO_STATUS[WORKFLOW_STEP.REMOVED] || row.status;
      row.completed_at = timeSource.now();
      await runTerminalTransitionRepairAttempt(owner, operation.operationId);
      t.notOk(
        owner.terminalTransitionRepairStateByOperationId.has(
          operation.operationId,
        ),
        'the repair abandons when a different durable terminal state won ' +
          '(any terminal frees the budget and admission lanes)',
      );
      refuseUpdates = false;
    } finally {
      await coordinator.shutdown();
    }
  },
);

t.test('the drive is deterministic across runs', async (t) => {
  const a = await runVoterSurplusScenario({lossMode: LOSS_MODE.SILENT});
  const b = await runVoterSurplusScenario({lossMode: LOSS_MODE.SILENT});
  t.same(
    a.events,
    b.events,
    'identical virtual drive -> identical admission/promotion/progress event sequence',
  );
  // Operation ids are minted randomly and the REAL failOperation stamps
  // wall-clock completion times into the repaired row; both are identity, not
  // shape.
  const terminalShape = (ops) =>
    ops.map((op) => ({
      ...op,
      operationId: null,
      completedAt: op.completedAt !== null && op.completedAt !== undefined,
    }));
  t.same(
    terminalShape(a.finalOps),
    terminalShape(b.finalOps),
    'identical terminal shape across runs',
  );
});
