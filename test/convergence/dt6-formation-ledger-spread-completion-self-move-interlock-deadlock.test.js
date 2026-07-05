import t from 'tap';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {createTimeoutTestCoordinator} from '../rebalancer/timeout-test-coordinator.js';

// Quest formation-ledger-spread-completion-self-move-interlock-deadlock (P1) —
// deterministic reproduction of the affinity-demo run-28 ledger spread-completion
// DEADLOCK (the binding wedge).
//
//   After a mid-drain ledger-leadership handoff the new leader's CACHE-FIRST
//   incomplete-operation observation returns a STALE ghost of the prior spread
//   self-move (op-1, frozen at STOPPING on the node that inherited leadership
//   5 ms after the source removal committed and the row terminalized). The
//   disruptive-self-move interlock treats that ghost as a live operation and
//   rejects every subsequent count-neutral spread REPLACE
//   `operation_ledger_self_move_waiting_for_idle_ledger`, so the ledger never
//   de-concentrates and the dependent CREATE TABLE starves. CL-043 staleness
//   would release it only after the 60 s STOPPING timeout — past the demo
//   teardown and past the 30 s CREATE-TABLE budget. The cure is a CACHE-BYPASSING
//   authoritative (owner-RPC) re-verify of a same-ledger-partition self-move
//   blocker: a genuine in-flight reconfiguration reads non-terminal
//   authoritatively (keeps blocking — run-20 serialization preserved); a
//   bookkeeping-lag ghost reads terminal and is dropped so the spread admits.
//
// SCOPE NOTE: the over-target accounting root (op-2, the spurious count-increasing
// ADD minted while op-1's replacement is a not-yet-visible voter) is a SEPARABLE
// defect entangled with the voter-visibility read path — three adversarial
// verifications refuted every count-based move-planner approximation of it. It is
// split to the successor quest
// `formation-ledger-over-target-accounting-drain-phase-replace-blind-spot`. The
// over-target 4th voter is a formation transient the existing over-creation cap
// (activeCount > target) and surplus drain clear once voters settle; the BINDING
// wedge (CREATE TABLE starves) is the deadlock, fixed here.
//
// HONEST SCOPE: this exercises the REAL interlock method
// (ensureOperationLedgerSelfMoveSerialized) on a real RebalanceCoordinator, with
// the cache-first observation seams (queryIncompleteOperations, queryOperationById)
// returning the stale ghost and ONLY the cache-bypassing owner-RPC read
// (queryAuthoritativeOperationVisibilityObservation) returning the terminal truth
// — so a fix that consults a cache-first read is proven INERT (stays RED), and
// only a cache-bypassing fix flips it GREEN.

const LEDGER_PARTITION_ID = `${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS}-p1`;
const OTHER_LEDGER_PARTITION_ID = `${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS}-p2`;
const DEPENDENT_PARTITION_ID = `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`;
const SEED_NODE_ID = 'node-0';
const NEW_LEADER_NODE_ID = 'node-3';
const START_MS = 7_000_000;
const WAITING_REASON = 'operation_ledger_self_move_waiting_for_idle_ledger';

// A stale ghost of a prior ledger self-move: cache-first reads see it
// non-terminal (STOPPING), an authoritative owner-RPC read sees it TERMINAL.
function buildGhostOperation({partitionId, step = WORKFLOW_STEP.STOPPING, opId}) {
  return {
    operationId: opId,
    operation_id: opId,
    type: OperationType.REPLACE,
    partitionId,
    partition_id: partitionId,
    replicaId: `${partitionId}-r1`,
    replica_id: `${partitionId}-r1`,
    sourceNodeId: SEED_NODE_ID,
    source_node_id: SEED_NODE_ID,
    targetNodeId: NEW_LEADER_NODE_ID,
    target_node_id: NEW_LEADER_NODE_ID,
    status: String(step).toLowerCase(),
    workflowStep: step,
    workflow_step: step,
    updatedAt: START_MS,
    updated_at: START_MS,
  };
}

function terminalTwin(operation) {
  return {
    ...operation,
    status: 'removed',
    workflowStep: WORKFLOW_STEP.REMOVED,
    workflow_step: WORKFLOW_STEP.REMOVED,
  };
}

// Drive the disruptive-self-move interlock directly with controlled read seams.
// `authoritative` = what a CACHE-BYPASSING owner-RPC read resolves for the ghost:
//   'terminal'      -> the run-28 ghost (row lag; must be dropped -> admit)
//   'nonTerminal'   -> a genuine in-flight reconfiguration (must keep blocking)
async function runInterlock({blockerPartitionId, authoritative}) {
  const timeSource = new VirtualTimeSource({startMs: START_MS});
  const fixture = createTimeoutTestCoordinator({
    timeSource,
    nodeId: NEW_LEADER_NODE_ID,
  });
  const {coordinator} = fixture;
  const ghost = buildGhostOperation({
    partitionId: blockerPartitionId,
    opId: 'prior-self-move',
  });
  let ownerRpcRequested = false;
  // Cache-first seams: BOTH return the stale non-terminal ghost (run-28 H1).
  coordinator.queryIncompleteOperations = async () => [ghost];
  coordinator.queryOperationById = async () => ghost;
  // The ONLY cache-bypassing truth source.
  coordinator.queryAuthoritativeOperationVisibilityObservation = async (
    _operationId,
    options = {},
  ) => {
    if (options.requireOwnerRpcRead === true) {
      ownerRpcRequested = true;
    }
    return {
      operation: authoritative === 'terminal' ? terminalTwin(ghost) : ghost,
      deferredOutcome: null,
    };
  };
  let verdict;
  try {
    await coordinator.ensureOperationLedgerSelfMoveSerialized({
      normalizedMoveType: OperationType.REPLACE,
      partitionId: LEDGER_PARTITION_ID,
      entityType: 'partition',
      entityId: LEDGER_PARTITION_ID,
      move: {operationId: 'new-spread-move'},
    });
    verdict = 'ADMITTED';
  } catch (error) {
    verdict = error?.admissionResult?.reason || error?.rebalanceSkipReason || 'ERROR';
  } finally {
    await coordinator.shutdown();
  }
  return {verdict, ownerRpcRequested};
}

t.test(
  'a same-ledger-partition self-move blocker that is cache-stale but ' +
    'AUTHORITATIVELY terminal must be dropped so the spread REPLACE admits ' +
    '(RED on head: interlock blocks on the cache-first ghost)',
  async (t) => {
    const {verdict, ownerRpcRequested} = await runInterlock({
      blockerPartitionId: LEDGER_PARTITION_ID,
      authoritative: 'terminal',
    });
    t.equal(
      verdict,
      'ADMITTED',
      'the count-neutral spread self-move admits once the stale ghost is ' +
        'authoritatively confirmed terminal (was ' + WAITING_REASON + ' on head)',
    );
    t.ok(
      ownerRpcRequested,
      'the re-verify used a CACHE-BYPASSING owner-RPC read (a cache-first ' +
        'read would be inert against the frozen-cache ghost)',
    );
  },
);

t.test(
  'run-20 preserved: a genuine same-partition self-move that is ' +
    'AUTHORITATIVELY non-terminal still blocks (no two concurrent config changes)',
  async (t) => {
    const {verdict} = await runInterlock({
      blockerPartitionId: LEDGER_PARTITION_ID,
      authoritative: 'nonTerminal',
    });
    t.equal(
      verdict,
      WAITING_REASON,
      'a genuinely in-flight ledger reconfiguration keeps the self-move deferred',
    );
  },
);

t.test(
  'scope: a DIFFERENT ledger partition self-move blocker still blocks ' +
    '(the re-verify is scoped to the SAME raft group)',
  async (t) => {
    const {verdict} = await runInterlock({
      blockerPartitionId: OTHER_LEDGER_PARTITION_ID,
      authoritative: 'terminal',
    });
    t.equal(
      verdict,
      WAITING_REASON,
      'a self-move of a different ledger partition is not re-verified/dropped',
    );
  },
);

t.test(
  'scope: a dependent (non-ledger) blocker still blocks (a genuine ' +
    'ledger-write contender must serialize — run-20)',
  async (t) => {
    const {verdict} = await runInterlock({
      blockerPartitionId: DEPENDENT_PARTITION_ID,
      authoritative: 'terminal',
    });
    t.equal(
      verdict,
      WAITING_REASON,
      'a dependent operation on another partition is never dropped by the re-verify',
    );
  },
);
