import t from 'tap';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  WORKFLOW_STEP_TO_STATUS,
  getNextWorkflowStep,
  isTerminalStep,
} from '../../src/rebalancer/replica-operation-progress.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SERVICE_TYPE, SERVICE_STATUS} from '../../src/constants/index.js';
import {createTimeoutTestCoordinator} from '../rebalancer/timeout-test-coordinator.js';

// Quest formation-ledger-quorum-spread-first (P1) — deterministic reproduction of
// the affinity-demo run-22 ledger-write starvation cascade:
//
//   Bootstrap places ALL replicas of the operation ledger (replica_operations-p1)
//   on the seed. The first ledger self-move relocates ONE replica (run-22: the
//   leadership move 59697071), the run-20 interlock releases its sibling hold as
//   soon as that self-move row terminalizes — but the ledger quorum is STILL
//   CONCENTRATED (a majority of its voters cannot be formed without the seed), so
//   every dependent control-plane move that now admits writes its workflow
//   progress into a ledger whose every commit needs the overloaded seed's ack:
//   step transitions ghost, reconciliation freezes, dedupe and the interlock go
//   ledger-blind, and the late second spread move (run-22 ca191926) cannot heal
//   because its own progress rides the wedged ledger.
//
// HONEST SCOPE (what is real vs modeled):
//   - REAL: the full createOperation admission chain on a real
//     RebalanceCoordinator — the run-20 ledger-interlock (self-move exclusivity +
//     sibling hold), priority/critical lanes, budget gates, and the NEW
//     quorum-concentration hold under test, reading ACTUAL placement rows through
//     the coordinator's systemTableCache seam; the real workflow step chains.
//   - MODELED (deterministic drive at the layer where the invariant is produced):
//     workflow progress is folded by a tick driver whose ledger-write
//     availability encodes the run-22 coupling — a progress write fails exactly
//     while the ledger quorum is CONCENTRATED and more than one live operation
//     contends for the ledger (the run-20 fault model with the concentration
//     dimension; run-22's first self-move completed precisely because it ran
//     alone before the storm). Membership/placement effects of completed moves
//     are applied to the shared services rows by the driver (production: CDC).
//
// The wedge is an ORDERING defect at the ledger-placement level: the SAME fault
// model completes everything when dependent admission holds until the ledger
// quorum is no longer concentrated (spread moves run alone, then dependents),
// and it wedges when dependents co-admit into the concentrated window — the
// run-22 release-too-early gap between the first and second ledger spread moves.

const START_MS = 7_000_000;
const TICK_MS = 1_000;
const MAX_CYCLES = 120;
const LEDGER_PARTITION_ID = `${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS}-p1`;
const SEED_NODE_ID = 'node-0';
const NODE_1 = 'node-1';
const NODE_2 = 'node-2';
const NODE_3 = 'node-3';
const NODE_4 = 'node-4';
const ALL_NODE_IDS = Object.freeze([
  SEED_NODE_ID,
  NODE_1,
  NODE_2,
  NODE_3,
  NODE_4,
]);
const QUORUM_CONCENTRATED_REASON = 'operation_ledger_quorum_concentrated';
const RETRYABLE_SKIP_REASONS = new Set([
  'budget_exceeded',
  'deferred_retry_pending',
  'conflicting_operation_in_flight',
]);
const TABLES_SERVICES = 'services';
const TABLES_NODES = 'nodes';
const RAFT_ROLE_ROW = {
  LEADER: 'leader',
  FOLLOWER: 'follower',
};

function buildLedgerServiceRow({replicaId, nodeId, raftRole}) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: LEDGER_PARTITION_ID,
    node_id: nodeId,
    service_type: SERVICE_TYPE.PARTITION,
    status: SERVICE_STATUS.ACTIVE,
    raft_role: raftRole,
  };
}

// Bootstrap truth: the whole ledger quorum on the seed.
function buildBootstrapLedgerRows() {
  return [
    buildLedgerServiceRow({
      replicaId: `${LEDGER_PARTITION_ID}-r1`,
      nodeId: SEED_NODE_ID,
      raftRole: RAFT_ROLE_ROW.LEADER,
    }),
    buildLedgerServiceRow({
      replicaId: `${LEDGER_PARTITION_ID}-r2`,
      nodeId: SEED_NODE_ID,
      raftRole: RAFT_ROLE_ROW.FOLLOWER,
    }),
    buildLedgerServiceRow({
      replicaId: `${LEDGER_PARTITION_ID}-r3`,
      nodeId: SEED_NODE_ID,
      raftRole: RAFT_ROLE_ROW.FOLLOWER,
    }),
  ];
}

// The run-22 spread state: one replica relocated, majority still on the seed.
function buildPartiallySpreadLedgerRows() {
  const rows = buildBootstrapLedgerRows();
  rows[0].node_id = NODE_1;
  return rows;
}

// Fully spread: no node hosts a majority.
function buildSpreadLedgerRows() {
  const rows = buildBootstrapLedgerRows();
  rows[0].node_id = NODE_1;
  rows[1].node_id = NODE_2;
  return rows;
}

function buildNodeRows(nodeIds) {
  return nodeIds.map((nodeId) => ({
    node_id: nodeId,
    connection_state: 'ready',
  }));
}

// The coordinator admission chain reads ACTUAL placement through this seam —
// the same live rows the driver updates when moves complete (production: CDC).
function buildPlacementCache({serviceRows, nodeRows}) {
  return {
    get: () => null,
    filter: (tableName, predicate) => {
      if (tableName === TABLES_SERVICES) {
        return serviceRows.filter(predicate);
      }
      if (tableName === TABLES_NODES) {
        return nodeRows.filter(predicate);
      }
      return [];
    },
  };
}

// The concentration predicate the driver's fault model uses — deliberately the
// same definition the fix consumes: no majority without the hottest node.
function ledgerQuorumConcentrated(serviceRows) {
  const voters = serviceRows.filter(
    (row) =>
      row.partition_id === LEDGER_PARTITION_ID &&
      row.status === SERVICE_STATUS.ACTIVE,
  );
  if (voters.length === 0) {
    return false;
  }
  const perNode = new Map();
  for (const row of voters) {
    perNode.set(row.node_id, (perNode.get(row.node_id) || 0) + 1);
  }
  const maxPerNode = Math.max(...perNode.values());
  const majority = Math.floor(voters.length / 2) + 1;
  return voters.length - maxPerNode < majority;
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

function nonTerminalOperations(trackedOperations, labels) {
  return Array.from(trackedOperations.values())
    .filter((op) => !isTerminalStep(op.type, op.workflow_step))
    .sort(
      (a, b) =>
        labels.orderOf(a.operation_id) - labels.orderOf(b.operation_id),
    );
}

function buildLedgerSpreadMove({sourceReplicaId, targetNodeId}) {
  return {
    type: OperationType.REPLACE,
    partitionId: LEDGER_PARTITION_ID,
    entityType: 'partition',
    entityId: LEDGER_PARTITION_ID,
    nodeId: targetNodeId,
    replicaId: sourceReplicaId,
    sourceNodeId: SEED_NODE_ID,
    sourceReplicaId,
    enforceConcurrentOperationBudget: true,
  };
}

function buildDependentMove(type, partitionId, targetNodeId) {
  const move = {
    type,
    partitionId,
    entityType: 'partition',
    entityId: partitionId,
    nodeId: targetNodeId,
    replicaId: `${partitionId}-r9`,
    enforceConcurrentOperationBudget: true,
  };
  if (type === OperationType.REPLACE) {
    move.sourceNodeId = SEED_NODE_ID;
  }
  return move;
}

// Dedupe/coalescing can hand back ANOTHER move's in-flight operation —
// including a same-partition sibling (two ledger spread REPLACEs differ
// only by target). Verify identity by target too; a mismatch is a skip.
function isCoalescedOperationReturn(operation, move) {
  return (
    operation?.partitionId !== move.partitionId ||
    operation?.type !== move.type ||
    Boolean(move.nodeId && operation?.targetNodeId !== move.nodeId)
  );
}

function classifyCreateRejection(error) {
  const skipReason = error?.rebalanceSkipReason || null;
  if (!skipReason || !RETRYABLE_SKIP_REASONS.has(skipReason)) {
    return null;
  }
  return {
    skipReason,
    admissionReason: error?.admissionResult?.reason || null,
  };
}

async function attemptCreate({coordinator, move, events, cycle, label, labels}) {
  try {
    const operation = await coordinator.createOperation(move);
    if (isCoalescedOperationReturn(operation, move)) {
      events.push(`${cycle} ${label} coalesced-skip`);
      return {created: false, operation: null, admissionReason: null};
    }
    labels.register(operation.operationId, label);
    events.push(`${cycle} ${label} created`);
    return {created: true, operation, admissionReason: null};
  } catch (error) {
    const rejection = classifyCreateRejection(error);
    if (!rejection) {
      throw error;
    }
    events.push(
      `${cycle} ${label} skipped ` +
        `${rejection.admissionReason || rejection.skipReason}`,
    );
    return {
      created: false,
      operation: null,
      admissionReason: rejection.admissionReason,
    };
  }
}

// The run-22/run-20 fault model with the concentration dimension: a workflow
// progress write into the ledger fails exactly while the ledger quorum is
// concentrated AND more than one live operation contends for the ledger.
function ledgerProgressWriteFails({serviceRows, liveOperationCount}) {
  return ledgerQuorumConcentrated(serviceRows) && liveOperationCount > 1;
}

// Placement effect of a completed ledger spread REPLACE (production: CDC —
// the replacement promotes on the target, the source drains and its row is
// deleted). The source row is tracked BY REFERENCE from creation time: the
// coordinator's canonical replica-id allocator can mint names colliding with
// the synthetic fixture rows, so id-based lookups are ambiguous. The
// replacement's id is derived from the entry label (unique, deterministic).
function applyLedgerSpreadCompletion({serviceRows, entry}) {
  const sourceIndex = serviceRows.indexOf(entry.sourceRow);
  if (sourceIndex >= 0) {
    serviceRows.splice(sourceIndex, 1);
  }
  serviceRows.push(
    buildLedgerServiceRow({
      replicaId: `${LEDGER_PARTITION_ID}-${entry.label}`,
      nodeId: entry.move.nodeId,
      raftRole: RAFT_ROLE_ROW.FOLLOWER,
    }),
  );
}

function driveWorkflowTick({scenario, events, tick}) {
  const {trackedOperations, timeSource, labels, serviceRows, movesByOperationId} =
    scenario;
  timeSource.advance(TICK_MS);
  const live = nonTerminalOperations(trackedOperations, labels);
  for (const op of live) {
    const nextStep = getNextWorkflowStep(op.type, op.workflow_step);
    if (!nextStep) {
      continue;
    }
    if (
      ledgerProgressWriteFails({
        serviceRows,
        liveOperationCount: live.length,
      })
    ) {
      events.push(`${tick} ${labels.labelOf(op.operation_id)} WRITE_FAIL ${op.workflow_step}`);
      continue;
    }
    op.workflow_step = nextStep;
    op.status = WORKFLOW_STEP_TO_STATUS[nextStep] || op.status;
    op.updated_at = timeSource.now();
    if (isTerminalStep(op.type, nextStep)) {
      op.completed_at = timeSource.now();
      const moveEntry = movesByOperationId.get(op.operation_id);
      if (moveEntry?.isLedgerSpread) {
        applyLedgerSpreadCompletion({serviceRows, entry: moveEntry});
        events.push(`${tick} LEDGER_SPREAD_APPLIED ${moveEntry.label}`);
      }
    }
    events.push(`${tick} ${labels.labelOf(op.operation_id)} ${nextStep}`);
  }
}

function buildPendingEntry(move, label, isLedgerSpread) {
  return {
    move,
    label,
    isLedgerSpread,
    created: false,
    operation: null,
    admissionReasons: new Set(),
  };
}

function buildDependentEntries() {
  return [
    buildPendingEntry(
      buildDependentMove(
        OperationType.REPLACE,
        `${SYSTEM_TABLE_NAME.SQL_TRANSACTIONS}-p1`,
        NODE_2,
      ),
      'DEP_REPLACE_SQL_TX',
      false,
    ),
    buildPendingEntry(
      buildDependentMove(
        OperationType.REPLACE,
        `${SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS}-p1`,
        NODE_3,
      ),
      'DEP_REPLACE_SQL_WRITE',
      false,
    ),
    buildPendingEntry(
      buildDependentMove(OperationType.ADD, 'movies-p1', NODE_4),
      'CLIENT_ADD',
      false,
    ),
  ];
}

async function attemptPendingEntry({
  coordinator,
  entry,
  events,
  cycle,
  labels,
  serviceRows,
  movesByOperationId,
  concentratedAtCycleStart,
  dependentHeldWhileConcentrated,
}) {
  const outcome = await attemptCreate({
    coordinator,
    move: entry.move,
    events,
    cycle,
    label: entry.label,
    labels,
  });
  entry.created = outcome.created;
  if (outcome.created) {
    entry.operation = outcome.operation;
    if (entry.isLedgerSpread) {
      entry.sourceRow = serviceRows.find(
        (row) => row.replica_id === entry.move.sourceReplicaId,
      ) || null;
    }
    movesByOperationId.set(outcome.operation.operationId, entry);
    return;
  }
  if (!outcome.admissionReason) {
    return;
  }
  entry.admissionReasons.add(outcome.admissionReason);
  if (
    !entry.isLedgerSpread &&
    concentratedAtCycleStart &&
    outcome.admissionReason === QUORUM_CONCENTRATED_REASON
  ) {
    dependentHeldWhileConcentrated.push(`${cycle} ${entry.label}`);
  }
}

// One scenario: a formation storm attempted in the given planner order every
// cycle. `initialLedgerRows` selects the starting concentration shape;
// `nodeIds` selects spread feasibility; `pending` is the planner's move order.
async function runFormationScenario({
  initialLedgerRows,
  nodeIds = ALL_NODE_IDS,
  pending,
}) {
  const timeSource = new VirtualTimeSource({startMs: START_MS});
  const fixture = createTimeoutTestCoordinator({
    timeSource,
    nodeId: SEED_NODE_ID,
  });
  const {coordinator, trackedOperations} = fixture;
  const events = [];
  const labels = createOperationLabels();
  const serviceRows = initialLedgerRows;
  const nodeRows = buildNodeRows(nodeIds);
  coordinator.systemTableCache = buildPlacementCache({serviceRows, nodeRows});
  const movesByOperationId = new Map();
  const scenario = {
    trackedOperations,
    timeSource,
    labels,
    serviceRows,
    movesByOperationId,
  };

  const dependentHeldWhileConcentrated = [];
  try {
    let tick = 0;
    for (let cycle = 0; cycle < MAX_CYCLES; cycle++) {
      const concentratedAtCycleStart = ledgerQuorumConcentrated(serviceRows);
      for (const entry of pending) {
        if (entry.created) {
          continue;
        }
        await attemptPendingEntry({
          coordinator,
          entry,
          events,
          cycle,
          labels,
          serviceRows,
          movesByOperationId,
          concentratedAtCycleStart,
          dependentHeldWhileConcentrated,
        });
      }
      driveWorkflowTick({scenario, events, tick});
      tick += 1;
      const allCreated = pending.every((entry) => entry.created);
      if (
        allCreated &&
        nonTerminalOperations(trackedOperations, labels).length === 0
      ) {
        break;
      }
    }

    const finalOps = Array.from(trackedOperations.values()).map((op) => ({
      operationId: op.operation_id,
      label: labels.labelOf(op.operation_id),
      type: op.type,
      workflowStep: op.workflow_step,
      terminal: isTerminalStep(op.type, op.workflow_step),
    }));
    return {
      events,
      finalOps,
      pinnedOps: finalOps.filter((op) => !op.terminal),
      completions: finalOps.filter((op) => op.terminal).length,
      allCreated: pending.every((entry) => entry.created),
      pendingByLabel: new Map(
        pending.map((entry) => [
          entry.label,
          {
            created: entry.created,
            admissionReasons: [...entry.admissionReasons],
          },
        ]),
      ),
      dependentHeldWhileConcentrated,
      finalConcentrated: ledgerQuorumConcentrated(serviceRows),
      finalLedgerRows: serviceRows.map((row) => ({
        replicaId: row.replica_id,
        nodeId: row.node_id,
        status: row.status,
        raftRole: row.raft_role,
      })),
      writeFailures: events.filter((line) => line.includes('WRITE_FAIL')).length,
    };
  } finally {
    await coordinator.shutdown();
  }
}

// The run-22 gap: the first ledger spread already completed (leadership on
// NODE_1, both followers still on the seed — concentrated). The planner admits
// dependents NOW; the second spread is planned only later. On the unfixed head
// the dependents co-admit into the concentrated window, wedge on ledger writes,
// and the late spread can never admit into a non-idle ledger.
function buildRun22GapPending() {
  return [
    ...buildDependentEntries(),
    buildPendingEntry(
      buildLedgerSpreadMove({
        sourceReplicaId: `${LEDGER_PARTITION_ID}-r2`,
        targetNodeId: NODE_2,
      }),
      'LEDGER_SPREAD_LATE',
      true,
    ),
  ];
}

t.test(
  'run-22 gap: dependents must hold while the ledger quorum is concentrated, ' +
    'so the LATE spread move can run alone and everything completes ' +
    '(RED on the unfixed head)',
  async (t) => {
    const m = await runFormationScenario({
      initialLedgerRows: buildPartiallySpreadLedgerRows(),
      pending: buildRun22GapPending(),
    });
    t.ok(
      m.dependentHeldWhileConcentrated.length > 0,
      'dependent creates were typed-rejected operation_ledger_quorum_concentrated ' +
        `while concentration persisted (${m.dependentHeldWhileConcentrated.length}x — ` +
        'the run-22 release-too-early gap between spread moves is closed)',
    );
    t.notOk(
      m.finalConcentrated,
      'the ledger quorum ends spread (no node holds a majority)',
    );
    t.ok(
      m.allCreated,
      'every move — the late spread, dependents, and the client ADD — is eventually admitted',
    );
    t.equal(
      m.pinnedOps.length,
      0,
      `no operation stays pinned non-terminal (pinned: ${JSON.stringify(m.pinnedOps)})`,
    );
    t.equal(
      m.completions,
      4,
      'the ledger spread, both dependent REPLACEs, and the client ADD all complete',
    );
  },
);

t.test(
  'bootstrap shape: fully seed-concentrated ledger — both spreads run alone ' +
    'before any dependent admits (RED on the unfixed head)',
  async (t) => {
    const m = await runFormationScenario({
      initialLedgerRows: buildBootstrapLedgerRows(),
      pending: [
        buildPendingEntry(
          buildLedgerSpreadMove({
            sourceReplicaId: `${LEDGER_PARTITION_ID}-r2`,
            targetNodeId: NODE_1,
          }),
          'LEDGER_SPREAD_1',
          true,
        ),
        ...buildDependentEntries(),
        buildPendingEntry(
          buildLedgerSpreadMove({
            sourceReplicaId: `${LEDGER_PARTITION_ID}-r3`,
            targetNodeId: NODE_2,
          }),
          'LEDGER_SPREAD_2',
          true,
        ),
      ],
    });
    t.ok(
      m.dependentHeldWhileConcentrated.length > 0,
      'dependents held during the fully-concentrated bootstrap window',
    );
    t.notOk(m.finalConcentrated, 'the ledger quorum ends spread');
    t.equal(
      m.pinnedOps.length,
      0,
      `nothing stays pinned (pinned: ${JSON.stringify(m.pinnedOps)})`,
    );
    t.equal(m.completions, 5, 'both spreads and all three dependents complete');
  },
);

t.test(
  'control: an already-spread ledger never engages the hold and the same ' +
    'storm completes on any head',
  async (t) => {
    const m = await runFormationScenario({
      initialLedgerRows: buildSpreadLedgerRows(),
      pending: buildDependentEntries(),
    });
    const heldReasons = [...m.pendingByLabel.values()].flatMap(
      (entry) => entry.admissionReasons,
    );
    t.notOk(
      heldReasons.includes(QUORUM_CONCENTRATED_REASON),
      'no dependent was ever rejected for quorum concentration',
    );
    t.equal(m.pinnedOps.length, 0, 'everything completes');
    t.equal(m.writeFailures, 0, 'no ledger write ever failed (fault gated on concentration)');
  },
);

t.test(
  'control: concentration WITHOUT a feasible spread target never holds ' +
    '(single-node-shaped clusters must not deadlock)',
  async (t) => {
    // Only the seed exists: the ledger is fully concentrated but no node could
    // host a spread replica, so the hold must not engage. The fault model is
    // concentration-gated, so this shape would wedge on writes if dependents
    // contend — assert only ADMISSION behavior with a single dependent.
    const m = await runFormationScenario({
      initialLedgerRows: buildBootstrapLedgerRows(),
      nodeIds: [SEED_NODE_ID],
      pending: [buildDependentEntries()[2]],
    });
    const heldReasons = [...m.pendingByLabel.values()].flatMap(
      (entry) => entry.admissionReasons,
    );
    t.notOk(
      heldReasons.includes(QUORUM_CONCENTRATED_REASON),
      'no quorum-concentration rejection when spread is infeasible',
    );
    t.ok(m.allCreated, 'the move admits despite permanent concentration');
    t.equal(m.pinnedOps.length, 0, 'a lone operation completes (no contention)');
  },
);

t.test(
  'planner gate: a concentrated ledger partition requires operation creation ' +
    'even when planning-gate readiness would defer (the verifier-traced ' +
    'permanent-wedge closer)',
  async (t) => {
    const {REBALANCER_PRIORITY_RECOVERY_PLANNING_GATE_METHODS} = await import(
      '../../src/rebalancer/rebalancer-priority-recovery-planning-gate-methods.js'
    );
    const gateRequired =
      REBALANCER_PRIORITY_RECOVERY_PLANNING_GATE_METHODS
        .isPriorityRecoveryOperationCreationRequiredForPlanningGate;
    const stub = (concentrated) => ({
      rebalanceCoordinator: {
        isOperationLedgerQuorumConcentratedForPartition: () => concentrated,
      },
      // With no planning snapshot the legacy path always answers false, so a
      // true here can only come from the concentration evidence.
      getPriorityRecoveryPlanningSnapshotSync: () => null,
    });
    t.equal(
      gateRequired.call(stub(true), LEDGER_PARTITION_ID),
      true,
      'concentration evidence forces operation creation through the gate',
    );
    t.equal(
      gateRequired.call(stub(false), LEDGER_PARTITION_ID),
      false,
      'without concentration the legacy snapshot path decides (false here)',
    );
    t.equal(
      gateRequired.call(stub(true), ''),
      false,
      'an empty partition id never requires creation',
    );
  },
);

t.test('the drive is deterministic across runs', async (t) => {
  const a = await runFormationScenario({
    initialLedgerRows: buildPartiallySpreadLedgerRows(),
    pending: buildRun22GapPending(),
  });
  const b = await runFormationScenario({
    initialLedgerRows: buildPartiallySpreadLedgerRows(),
    pending: buildRun22GapPending(),
  });
  t.same(a.events, b.events, 'identical event sequence across runs');
  const shape = (ops) => ops.map((op) => ({...op, operationId: null}));
  t.same(shape(a.finalOps), shape(b.finalOps), 'identical terminal shape');
});
