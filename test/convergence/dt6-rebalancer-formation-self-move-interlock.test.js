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
import {createTimeoutTestCoordinator} from '../rebalancer/timeout-test-coordinator.js';

// Quest formation-control-plane-move-interlock (P1) — deterministic reproduction of the
// affinity-demo run-20 formation interlock:
//
//   The replica_operations (operation-ledger) partition's OWN REPLACE was co-scheduled with
//   sibling control-plane moves (control_plane_publications REPLACE, sql_transaction_participants
//   ADD, sql_write_operations REPLACE). Every in-flight operation persists its workflow progress
//   INTO replica_operations-p1; with that partition's raft group itself mid-move AND siblings
//   contending, the progress writes failed (run-20 archive: 61x "participant failures", 32 on
//   replica_operations-p1; 14x 30s raft-commit timeouts) -> every op pinned non-terminal, ZERO
//   completions for 120s+, client CREATE TABLE starved behind the storm. CL-017 fixed the
//   self-write mechanics; the CO-SCHEDULING that composes them into a storm was never addressed.
//
// HONEST SCOPE (what is real vs modeled):
//   - REAL: the full createOperation admission chain (dedupe, priority/critical lanes,
//     concurrent-op budget gates) on a real RebalanceCoordinator, and the real operation
//     state machine (getNextWorkflowStep / isTerminalStep / WORKFLOW_STEP_TO_STATUS chains).
//   - MODELED (fault injection at the layer where the invariant is produced): the workflow
//     owner's per-step progress persistence is driven by a deterministic tick driver whose
//     ledger-write availability encodes the run-20/CL-017 coupling — a progress UPDATE into
//     replica_operations fails exactly while a disruptive (REPLACE/REMOVE) self-move of the
//     ledger partition is non-terminal AND at least one other non-terminal operation contends
//     for the same ledger. Operation-row INSERTs are exempt (run-20 op rows all landed; the
//     storm pinned progress, not creation).
//
// The interlock is an ORDERING defect, not a budget-size or safety-gate defect: the same fault
// model completes every operation when the ledger self-move is serialized against sibling moves
// (see the serialized-dispatch test), and the co-scheduled freeze occurs with in-flight counts
// well below every concurrent-op limit.

const START_MS = 1_000_000;
const TICK_MS = 1_000;
const TICKS_PER_CYCLE = 8;
const MAX_CYCLES = 30;
const LEDGER_PARTITION_ID = `${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS}-p1`;
const COORDINATOR_NODE_ID = 'node-1';
const REPLACE_TARGET_NODE_ID = 'node-2';
const CLIENT_TABLE_PARTITION_ID = 'movies-p1';
const RETRYABLE_SKIP_REASONS = new Set([
  'budget_exceeded',
  'deferred_retry_pending',
  'conflicting_operation_in_flight',
]);

// The run-20 formation storm: the ledger self-move plus the sibling control-plane moves
// from the archived stuck set (control_plane_publications REPLACE ACTIVE,
// sql_transaction_participants ADD CREATING, sql_write_operations REPLACE PENDING).
function buildFormationStormMoves() {
  return [
    buildMove(OperationType.REPLACE, LEDGER_PARTITION_ID),
    buildMove(
      OperationType.REPLACE,
      `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`,
    ),
    buildMove(
      OperationType.ADD,
      `${SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS}-p1`,
    ),
    buildMove(
      OperationType.REPLACE,
      `${SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS}-p1`,
    ),
  ];
}

function buildMove(type, partitionId) {
  const move = {
    type,
    partitionId,
    entityType: 'partition',
    entityId: partitionId,
    nodeId: REPLACE_TARGET_NODE_ID,
    replicaId: `${partitionId}-r4`,
    enforceConcurrentOperationBudget: true,
  };
  if (type === OperationType.REPLACE) {
    move.sourceNodeId = COORDINATOR_NODE_ID;
  }
  return move;
}

// A PENDING self-move row has not yet touched the ledger partition's raft group; the
// disruption window opens once the move is actually dispatched (SENDING onward).
function isDisruptiveLedgerSelfMove(op) {
  return (
    (op.type === OperationType.REPLACE || op.type === OperationType.REMOVE) &&
    op.workflow_step !== WORKFLOW_STEP.PENDING &&
    String(op.partition_id).startsWith(
      `${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS}-`,
    )
  );
}

// Run-20/CL-017 coupling, deterministically encoded: the ledger accepts progress writes
// unless its own disruptive move is in flight while other operations contend.
function ledgerProgressWriteFails(nonTerminalOps) {
  return (
    nonTerminalOps.some(isDisruptiveLedgerSelfMove) && nonTerminalOps.length > 1
  );
}

// Coordinator operation ids are randomly minted; drive and event order must instead follow
// deterministic creation order (stable labels) so runs are comparable.
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
        byOperationId.set(operationId, {
          label,
          order: byOperationId.size,
        });
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

// One deterministic driver tick: every non-terminal operation attempts to persist its next
// workflow step into the ledger (the modeled workflow-owner progress write).
function driveTick({trackedOperations, timeSource, events, tick, labels}) {
  timeSource.advance(TICK_MS);
  for (const op of nonTerminalOperations(trackedOperations, labels)) {
    const nextStep = getNextWorkflowStep(op.type, op.workflow_step);
    if (!nextStep) {
      continue;
    }
    const contenders = nonTerminalOperations(trackedOperations, labels);
    if (ledgerProgressWriteFails(contenders)) {
      events.push(
        `${tick} ${labels.labelOf(op.operation_id)} WRITE_FAIL ${op.workflow_step}`,
      );
      continue;
    }
    op.workflow_step = nextStep;
    op.status = WORKFLOW_STEP_TO_STATUS[nextStep] || op.status;
    op.updated_at = timeSource.now();
    if (isTerminalStep(op.type, nextStep)) {
      op.completed_at = timeSource.now();
    }
    events.push(`${tick} ${labels.labelOf(op.operation_id)} ${nextStep}`);
  }
}

async function attemptCreate({coordinator, move, events, cycle, label, labels}) {
  try {
    const operation = await coordinator.createOperation(move);
    // Pre-existing budget-lane coalescing: concurrent same-lane creates can
    // return ANOTHER move's in-flight operation (runExclusive coalesces on the
    // per-lane budget key). The live planner recovers because it re-plans from
    // observed reality each cycle — model that: a mismatched return is a skip,
    // not a success.
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

// The rebalance-loop analogue: every cycle re-attempts the not-yet-created moves (the real
// loop re-plans and re-dispatches skipped moves each pass), then drives progress ticks.
async function runFormationScenario({moveOrder}) {
  const timeSource = new VirtualTimeSource({startMs: START_MS});
  const fixture = createTimeoutTestCoordinator({
    timeSource,
    nodeId: COORDINATOR_NODE_ID,
  });
  const {coordinator, trackedOperations} = fixture;
  const events = [];
  const labels = createOperationLabels();
  const pendingMoves = moveOrder.map((move, index) => ({
    move,
    label: `${move.type}:${move.partitionId}`,
    index,
    created: false,
  }));
  const clientMove = {
    entry: {
      move: buildMove(OperationType.ADD, CLIENT_TABLE_PARTITION_ID),
      label: `${OperationType.ADD}:${CLIENT_TABLE_PARTITION_ID}`,
      created: false,
    },
  };

  try {
    let tick = 0;
    for (let cycle = 0; cycle < MAX_CYCLES; cycle++) {
      for (const entry of pendingMoves) {
        if (entry.created) {
          continue;
        }
        const outcome = await attemptCreate({
          coordinator,
          move: entry.move,
          events,
          cycle,
          label: entry.label,
          labels,
        });
        entry.created = outcome.created;
      }
      // The client DDL arrives after the storm has been dispatched once (cycle 1),
      // mirroring the demo's CREATE TABLE landing mid-formation.
      if (cycle >= 1 && !clientMove.entry.created) {
        const outcome = await attemptCreate({
          coordinator,
          move: clientMove.entry.move,
          events,
          cycle,
          label: clientMove.entry.label,
          labels,
        });
        clientMove.entry.created = outcome.created;
      }
      for (let i = 0; i < TICKS_PER_CYCLE; i++) {
        driveTick({trackedOperations, timeSource, events, tick, labels});
        tick += 1;
      }
      const allCreated =
        pendingMoves.every((entry) => entry.created) &&
        clientMove.entry.created;
      if (
        allCreated &&
        nonTerminalOperations(trackedOperations, labels).length === 0
      ) {
        break;
      }
    }

    const finalOps = Array.from(trackedOperations.values()).map((op) => ({
      partitionId: op.partition_id,
      type: op.type,
      workflowStep: op.workflow_step,
      terminal: isTerminalStep(op.type, op.workflow_step),
    }));
    return {
      events,
      finalOps,
      stormCreated: pendingMoves.every((entry) => entry.created),
      clientCreated: clientMove.entry.created,
      pinnedOps: finalOps.filter((op) => !op.terminal),
      completions: finalOps.filter((op) => op.terminal).length,
      writeFailures: events.filter((line) => line.includes('WRITE_FAIL')).length,
    };
  } finally {
    await coordinator.shutdown();
  }
}

// The live system dispatches moves from PARALLEL per-entity rebalancer loops — the
// createOperation calls race each other, and an async-only admission read cannot see rows
// still mid-persist. This scenario models that: every cycle re-attempts all outstanding
// creations CONCURRENTLY (Promise.all). The synchronous coordinator interlock must keep the
// self-move exclusive even against in-flight sibling creates.
async function runConcurrentStormScenario() {
  const timeSource = new VirtualTimeSource({startMs: START_MS});
  const fixture = createTimeoutTestCoordinator({
    timeSource,
    nodeId: COORDINATOR_NODE_ID,
  });
  const {coordinator, trackedOperations} = fixture;
  const events = [];
  const labels = createOperationLabels();
  const pendingMoves = [
    ...buildFormationStormMoves(),
    buildMove(OperationType.ADD, CLIENT_TABLE_PARTITION_ID),
  ].map((move) => ({
    move,
    label: `${move.type}:${move.partitionId}`,
    created: false,
  }));

  try {
    let tick = 0;
    for (let cycle = 0; cycle < MAX_CYCLES; cycle++) {
      await Promise.all(
        pendingMoves
          .filter((entry) => !entry.created)
          .map(async (entry) => {
            const outcome = await attemptCreate({
              coordinator,
              move: entry.move,
              events,
              cycle,
              label: entry.label,
              labels,
            });
            entry.created = outcome.created;
          }),
      );
      for (let i = 0; i < TICKS_PER_CYCLE; i++) {
        driveTick({trackedOperations, timeSource, events, tick, labels});
        tick += 1;
      }
      if (
        pendingMoves.every((entry) => entry.created) &&
        nonTerminalOperations(trackedOperations, labels).length === 0
      ) {
        break;
      }
    }
    const finalOps = Array.from(trackedOperations.values()).map((op) => ({
      partitionId: op.partition_id,
      type: op.type,
      workflowStep: op.workflow_step,
      terminal: isTerminalStep(op.type, op.workflow_step),
    }));
    return {
      finalOps,
      pinnedOps: finalOps.filter((op) => !op.terminal),
      completions: finalOps.filter((op) => op.terminal).length,
      allCreated: pendingMoves.every((entry) => entry.created),
    };
  } finally {
    await coordinator.shutdown();
  }
}

// Serialized-dispatch control: the SAME fault model, but the harness orders the ledger
// self-move to run alone (siblings dispatched only after it completes). Everything finishes —
// proving the wedge is the co-scheduling (dispatch ordering), not the fault model, the budget
// arithmetic, or a safety gate.
async function runSerializedScenario() {
  const timeSource = new VirtualTimeSource({startMs: START_MS});
  const fixture = createTimeoutTestCoordinator({
    timeSource,
    nodeId: COORDINATOR_NODE_ID,
  });
  const {coordinator, trackedOperations} = fixture;
  const events = [];
  const labels = createOperationLabels();
  try {
    const [selfMove, ...siblings] = buildFormationStormMoves();
    const created = await coordinator.createOperation(selfMove);
    labels.register(created.operationId, `${selfMove.type}:${selfMove.partitionId}`);
    let tick = 0;
    while (nonTerminalOperations(trackedOperations, labels).length > 0 &&
      tick < MAX_CYCLES * TICKS_PER_CYCLE) {
      driveTick({trackedOperations, timeSource, events, tick, labels});
      tick += 1;
    }
    const selfMoveDone =
      nonTerminalOperations(trackedOperations, labels).length === 0;

    for (const move of siblings) {
      const sibling = await coordinator.createOperation(move);
      labels.register(sibling.operationId, `${move.type}:${move.partitionId}`);
    }
    const clientAdd = buildMove(OperationType.ADD, CLIENT_TABLE_PARTITION_ID);
    const clientOperation = await coordinator.createOperation(clientAdd);
    labels.register(
      clientOperation.operationId,
      `${clientAdd.type}:${clientAdd.partitionId}`,
    );
    while (nonTerminalOperations(trackedOperations, labels).length > 0 &&
      tick < MAX_CYCLES * TICKS_PER_CYCLE) {
      driveTick({trackedOperations, timeSource, events, tick, labels});
      tick += 1;
    }
    return {
      selfMoveDone,
      allDone: nonTerminalOperations(trackedOperations, labels).length === 0,
      completions: Array.from(trackedOperations.values())
        .filter((op) => isTerminalStep(op.type, op.workflow_step)).length,
      events,
    };
  } finally {
    await coordinator.shutdown();
  }
}

t.test(
  'formation storm with the ledger self-move completes without the run-20 interlock',
  async (t) => {
    const m = await runFormationScenario({
      moveOrder: buildFormationStormMoves(),
    });
    t.equal(
      m.pinnedOps.length,
      0,
      'no operation stays pinned non-terminal after the formation window ' +
        `(run-20 interlock shape: ${JSON.stringify(m.pinnedOps)})`,
    );
    t.equal(
      m.completions,
      buildFormationStormMoves().length + 1,
      'every control-plane move AND the client DDL ADD reach a terminal step',
    );
    t.ok(
      m.clientCreated,
      'the client CREATE TABLE ADD is eventually admitted (no permanent starvation)',
    );
  },
);

t.test(
  'formation storm dispatched with the ledger self-move LAST also completes',
  async (t) => {
    const [selfMove, ...siblings] = buildFormationStormMoves();
    const m = await runFormationScenario({moveOrder: [...siblings, selfMove]});
    t.equal(
      m.pinnedOps.length,
      0,
      'self-move-last dispatch order must not wedge either ' +
        `(pinned: ${JSON.stringify(m.pinnedOps)})`,
    );
    t.equal(
      m.completions,
      buildFormationStormMoves().length + 1,
      'every operation reaches a terminal step regardless of dispatch order',
    );
  },
);

t.test(
  'CONCURRENT dispatch (parallel per-entity loops racing createOperation) also completes',
  async (t) => {
    const m = await runConcurrentStormScenario();
    t.equal(
      m.pinnedOps.length,
      0,
      'racing creates must not co-admit the self-move with siblings ' +
        `(pinned: ${JSON.stringify(m.pinnedOps)})`,
    );
    t.equal(
      m.completions,
      buildFormationStormMoves().length + 1,
      'every operation completes despite fully concurrent dispatch',
    );
    t.ok(m.allCreated, 'every move is eventually admitted');
  },
);

t.test(
  'serialized dispatch completes under the SAME fault model (ordering is the wedged edge)',
  async (t) => {
    const m = await runSerializedScenario();
    t.ok(
      m.selfMoveDone,
      'the ledger self-move run ALONE completes (no circular deferral; CL-013 stands)',
    );
    t.ok(
      m.allDone,
      'siblings + client DDL all complete once the self-move no longer overlaps them',
    );
    t.equal(m.completions, buildFormationStormMoves().length + 1,
      'serialization yields full completion under the identical ledger fault model');
  },
);

t.test(
  'TOCTOU: a sibling create racing a SECOND ledger self-move across the held-clear ' +
    'await must not co-admit (verifier finding F1)',
  async (t) => {
    const timeSource = new VirtualTimeSource({startMs: START_MS});
    const fixture = createTimeoutTestCoordinator({
      timeSource,
      nodeId: COORDINATOR_NODE_ID,
    });
    const {coordinator, trackedOperations} = fixture;
    try {
      // A completed-but-still-held first self-move forces every subsequent
      // create through the async point-read window (the TOCTOU surface).
      const firstSelfMove = await coordinator.createOperation(
        buildMove(OperationType.REPLACE, LEDGER_PARTITION_ID),
      );
      const heldRow = trackedOperations.get(firstSelfMove.operationId);
      heldRow.workflow_step = WORKFLOW_STEP.REMOVED;
      heldRow.completed_at = timeSource.now();

      const secondLedgerPartitionId =
        `${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS}-p2`;
      const outcomes = await Promise.allSettled([
        coordinator.createOperation(
          buildMove(OperationType.ADD, CLIENT_TABLE_PARTITION_ID),
        ),
        coordinator.createOperation(
          buildMove(OperationType.REPLACE, secondLedgerPartitionId),
        ),
      ]);
      const [siblingOutcome, selfMoveOutcome] = outcomes;
      t.notOk(
        siblingOutcome.status === 'fulfilled' &&
          selfMoveOutcome.status === 'fulfilled',
        'a sibling create and a live ledger self-move must never co-admit ' +
          `(sibling: ${siblingOutcome.status}, self-move: ${selfMoveOutcome.status})`,
      );
      for (const outcome of outcomes) {
        if (outcome.status === 'rejected') {
          t.ok(
            RETRYABLE_SKIP_REASONS.has(
              outcome.reason?.rebalanceSkipReason || '',
            ),
            'the deferred side is a typed retryable skip, not a hard error',
          );
        }
      }
    } finally {
      await coordinator.shutdown();
    }
  },
);

t.test('the formation drive is deterministic across runs', async (t) => {
  const a = await runFormationScenario({moveOrder: buildFormationStormMoves()});
  const b = await runFormationScenario({moveOrder: buildFormationStormMoves()});
  t.same(a.events, b.events,
    'identical virtual drive -> identical admission/progress event sequence');
  t.same(a.finalOps, b.finalOps, 'identical terminal shape across runs');
});

t.test('WORKFLOW_STEP sanity: the modeled driver rides the real chains', async (t) => {
  t.equal(
    getNextWorkflowStep(OperationType.REPLACE, WORKFLOW_STEP.ACTIVE),
    WORKFLOW_STEP.STOPPING,
    'REPLACE advances ACTIVE -> STOPPING (the run-20 self-move wedge step) in the real chain',
  );
  t.ok(
    isTerminalStep(OperationType.ADD, WORKFLOW_STEP.ACTIVE),
    'ADD terminates at ACTIVE in the real chain',
  );
});
