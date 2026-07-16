import t from 'tap';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {createTimeoutTestCoordinator} from '../rebalancer/timeout-test-coordinator.js';

// Quest movielens-operation-ledger-terminal-hold — deterministic reproduction
// of the Wave-4 live overlap. The locally created replica_operations REPLACE
// is still owned by an armed transition-retry lane, but its durable workflow
// row cannot refresh while that same ledger partition is under surgery. Once
// the durable SENDING step crosses its timeout, admission must NOT reinterpret
// age as terminality and release the exclusive run-20 hold. Only authoritative
// terminal evidence (including a terminal transition applied by the timeout
// reaper) releases it.

const START_MS = 9_000_000;
const STEP_TIMEOUT_MS = 10;
const LEDGER_PARTITION_ID = `${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS}-p1`;
const NEXT_LEDGER_PARTITION_ID =
  `${SYSTEM_TABLE_NAME.REPLICA_OPERATIONS}-p2`;
const DEPENDENT_PARTITION_ID =
  `${SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS}-p1`;
const SOURCE_NODE_ID = 'node-1';
const TARGET_NODE_ID = 'node-2';
const HOLD_REASON = 'operation_ledger_self_move_in_flight';

function buildReplace(partitionId) {
  return {
    type: OperationType.REPLACE,
    partitionId,
    entityType: 'partition',
    entityId: partitionId,
    replicaId: `${partitionId}-r4`,
    sourceNodeId: SOURCE_NODE_ID,
    nodeId: TARGET_NODE_ID,
    enforceConcurrentOperationBudget: true,
  };
}

function moveDurableRowToSending(row) {
  const history = JSON.parse(row.steps_history);
  history.push({step: WORKFLOW_STEP.SENDING, timestamp: START_MS});
  row.status = 'sending';
  row.workflow_step = WORKFLOW_STEP.SENDING;
  row.updated_at = START_MS;
  row.steps_history = JSON.stringify(history);
}

async function attemptCreate(coordinator, move) {
  try {
    return {
      admitted: true,
      operation: await coordinator.createOperation(move),
      reason: null,
    };
  } catch (error) {
    return {
      admitted: false,
      operation: null,
      reason:
        error?.admissionResult?.reason ||
        error?.rebalanceSkipReason ||
        error?.message ||
        'unknown',
    };
  }
}

t.test(
  'durable step timeout cannot release a locally held ledger self-move while ' +
    'owner progress remains active; authoritative terminal evidence can',
  async (t) => {
    const timeSource = new VirtualTimeSource({startMs: START_MS});
    const fixture = createTimeoutTestCoordinator({
      timeSource,
      nodeId: SOURCE_NODE_ID,
      pendingTimeoutMs: STEP_TIMEOUT_MS,
    });
    const {coordinator, trackedOperations} = fixture;
    try {
      const selfMove = await coordinator.createOperation(
        buildReplace(LEDGER_PARTITION_ID),
      );
      const durableRow = trackedOperations.get(selfMove.operationId);
      moveDurableRowToSending(durableRow);

      // Owner-side retry/progress remains explicitly armed even though the
      // self-hosted durable row is no longer refreshing. This is the live
      // target/source-progress vs durable-ledger-lag split in one virtual turn.
      coordinator.workflowOwner.transitionRetryTimerByOperationId.set(
        selfMove.operationId,
        'active-owner-progress',
      );
      timeSource.advance(STEP_TIMEOUT_MS + 1);

      const staleOperation = await coordinator.queryOperationById(
        selfMove.operationId,
      );
      t.ok(
        coordinator.workflowOwner.isConcurrentOperationStalePastStepTimeout(
          staleOperation,
          timeSource.now(),
        ),
        'the durable SENDING row has crossed the workflow timeout',
      );
      t.ok(
        coordinator.workflowOwner.transitionRetryTimerByOperationId.has(
          selfMove.operationId,
        ),
        'the operation owner still has active progress/retry responsibility',
      );

      let ownerRpcReads = 0;
      coordinator.queryAuthoritativeOperationVisibilityObservation = async (
        operationId,
        options = {},
      ) => {
        if (options.requireOwnerRpcRead === true) {
          ownerRpcReads += 1;
        }
        return {
          operation: await coordinator.queryOperationById(operationId),
          deferredOutcome: null,
        };
      };

      const whileNonTerminal = await attemptCreate(
        coordinator,
        buildReplace(DEPENDENT_PARTITION_ID),
      );
      t.equal(
        whileNonTerminal.reason,
        HOLD_REASON,
        'a stale-but-authoritatively-nonterminal self-move keeps dependent ' +
          'operation creation deferred',
      );
      t.equal(
        whileNonTerminal.admitted,
        false,
        'the dependent batch cannot overlap the ledger self-move',
      );
      t.equal(
        ownerRpcReads,
        1,
        'hold release is decided from the cache-bypassing lifecycle owner read',
      );

      durableRow.status = 'removed';
      durableRow.workflow_step = WORKFLOW_STEP.REMOVED;
      durableRow.updated_at = timeSource.now();
      durableRow.completed_at = timeSource.now();

      const afterTerminal = await attemptCreate(
        coordinator,
        buildReplace(DEPENDENT_PARTITION_ID),
      );
      t.ok(
        afterTerminal.admitted,
        'authoritative terminal evidence releases the hold and admits the dependent',
      );
      t.equal(
        ownerRpcReads,
        2,
        'the terminal release uses the same authoritative lifecycle owner read',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

t.test(
  'a delayed terminal read for an old holder cannot clear a newer ledger ' +
    'self-move (compare-and-clear TOCTOU)',
  async (t) => {
    const timeSource = new VirtualTimeSource({startMs: START_MS});
    const fixture = createTimeoutTestCoordinator({
      timeSource,
      nodeId: SOURCE_NODE_ID,
    });
    const {coordinator, trackedOperations} = fixture;
    try {
      const oldSelfMove = await coordinator.createOperation(
        buildReplace(LEDGER_PARTITION_ID),
      );
      const oldRow = trackedOperations.get(oldSelfMove.operationId);
      oldRow.status = 'removed';
      oldRow.workflow_step = WORKFLOW_STEP.REMOVED;
      oldRow.updated_at = timeSource.now();
      oldRow.completed_at = timeSource.now();
      const oldTerminalOperation = await coordinator.queryOperationById(
        oldSelfMove.operationId,
      );

      // Model the local/cache visibility gap that makes the synchronous holder
      // accounting necessary: the newer row is not yet visible to the async
      // incomplete-operation scan.
      coordinator.queryIncompleteOperations = async () => [];

      let oldReadCount = 0;
      let releaseDelayedOldRead;
      let markDelayedReadStarted;
      const delayedReadStarted = new Promise((resolve) => {
        markDelayedReadStarted = resolve;
      });
      coordinator.queryAuthoritativeOperationVisibilityObservation = async (
        operationId,
      ) => {
        if (operationId === oldSelfMove.operationId) {
          oldReadCount += 1;
          if (oldReadCount === 1) {
            markDelayedReadStarted();
            return new Promise((resolve) => {
              releaseDelayedOldRead = () => resolve({
                operation: oldTerminalOperation,
                deferredOutcome: null,
              });
            });
          }
          return {
            operation: oldTerminalOperation,
            deferredOutcome: null,
          };
        }
        return {
          operation: await coordinator.queryOperationById(operationId),
          deferredOutcome: null,
        };
      };

      const delayedDependent = attemptCreate(
        coordinator,
        buildReplace(DEPENDENT_PARTITION_ID),
      );
      await delayedReadStarted;

      // A second waiter gets the same old terminal truth first, clears the old
      // holder, and installs a genuinely live new self-move.
      const newSelfMove = await coordinator.createOperation(
        buildReplace(NEXT_LEDGER_PARTITION_ID),
      );
      const state = coordinator.getOperationLedgerInterlockAdmissionState();
      t.equal(
        state.heldSelfMoveOperationId,
        newSelfMove.operationId,
        'the newer ledger self-move owns the hold before the delayed response',
      );

      releaseDelayedOldRead();
      const delayedOutcome = await delayedDependent;
      t.equal(
        delayedOutcome.reason,
        HOLD_REASON,
        'the old response cannot admit a dependent across the newer holder',
      );
      t.equal(delayedOutcome.admitted, false);
      t.equal(
        state.heldSelfMoveOperationId,
        newSelfMove.operationId,
        'compare-and-clear retains the holder installed after the read began',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);
