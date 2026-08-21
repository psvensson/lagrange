/**
 * Operation progress-store persistence regression tests (verified-audit
 * findings 15 and 18, quest operation-progress-store-persistence).
 *
 * Explicit choice: WIRE REAL PERSISTENCE (the preferred option) — the
 * rebalancer's operation-workflow DurableWorkflowCoordinator no longer
 * runs bare; its persist callback mirrors each transition candidate onto
 * the durable replica_operations row (steps_history), recovery hydrates
 * the transition witness from that row, and the owner ports derive
 * lease/fence freshness from durable evidence instead of hard-coding
 * CURRENT.
 *
 * Receipts:
 *
 * - progress-store-durable-or-honestly-renamed: the persist callback is
 *   durable, never advance-only. Through the PRODUCTION wiring
 *   (RebalanceCoordinator default construction) it rejects a mirrored
 *   transition history that does not extend the durable row, and the
 *   recovered witness survives a "restart" (a fresh coordinator hydrated
 *   from the same durable rows via ensureOperationWorkflow).
 *   Red-on-revert: reverting the persist callback in
 *   rebalance-coordinator-lifecycle.js to the bare no-op default makes
 *   the rejection test accept (no throw) and goes red.
 *
 * - lease-fence-freshness-not-hardcoded: through the PRODUCTION owner
 *   ports an EXPIRED durable lease reads owner_lease_stale (never
 *   hard-coded CURRENT), and a transition-history witness that diverges
 *   from the durable row mirror reads publication_fence_stale
 *   (INCOMPLETE when nothing was ever persisted against a row that
 *   already carries history). Red-on-revert: re-hard-coding CURRENT in
 *   buildOperationWorkflowOwnerPortOwnerLease or
 *   buildOperationWorkflowOwnerPortPublicationFence flips these red.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {
  NUM,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {
  recoverOperationWorkflowsFromDurableRows,
} from '../../src/rebalancer/operation-workflow-persistence.js';
import {
  resolveOperationWorkflowPublicationFenceState,
} from '../../src/rebalancer/operation-workflow-port-freshness.js';
import {
  OPERATION_WORKFLOW_LEASE_FRESHNESS_STATE,
  OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE,
} from '../../src/rebalancer/operation-workflow-owner-constants.js';
import {
  REPLICA_OPERATION_OWNER_LEASE_TTL_MS,
} from '../../src/rebalancer/replica-operation-owner-lease.js';
import {
  RebalanceCoordinator,
} from '../../src/rebalancer/rebalance-coordinator.js';
import {
  OperationType,
  ReplicaStatus,
  createOperation,
} from '../../src/rebalancer/replica-status.js';
import {
  createMockCache,
  createMockCdcService,
  createMockControlPlaneSystemTableGateway,
  createMockMessageRouter,
  createMockPolicyService,
  createMockTransactionCoordinator,
} from './test-helpers.js';

const TEST_NODE_ID = 'progress-store-node-local';
const TEST_TARGET_NODE_ID = 'progress-store-node-target';
const TEST_PARTITION_ID = 'p-progress-store';
const TRANSITION_REASON = 'dispatch_sending';
const LEASE_ANCHOR_MS = 40_000;
const ACTIVE_LEASE_OBSERVED_AT_MS = LEASE_ANCHOR_MS + NUM.ONE;
const EXPIRED_LEASE_OBSERVED_AT_MS =
  LEASE_ANCHOR_MS + REPLICA_OPERATION_OWNER_LEASE_TTL_MS + NUM.ONE;

function initializeConfig() {
  ConfigurationManager.resetInstance();
  ConfigurationManager.getInstance().initialize({
    rebalancer: {
      minimumReplicaBytes: NUM.TEN,
      partitionReplicaOverheadBytes: NUM.FIVE,
    },
  });
}

function buildSyncingOperation(overrides = {}) {
  const operation = createOperation({
    operationId: overrides.operationId || 'op-progress-store',
    type: OperationType.ADD,
    partitionId: TEST_PARTITION_ID,
    replicaId: `${TEST_PARTITION_ID}-r1`,
    sourceNodeId: TEST_NODE_ID,
    targetNodeId: TEST_TARGET_NODE_ID,
  });
  operation.workflowStep = WORKFLOW_STEP.SYNCING;
  operation.status = ReplicaStatus.SYNCING;
  operation.updatedAt = LEASE_ANCHOR_MS;
  operation.stepsHistory = [
    {step: WORKFLOW_STEP.PENDING, timestamp: LEASE_ANCHOR_MS - NUM.ONE},
    {step: WORKFLOW_STEP.SYNCING, timestamp: LEASE_ANCHOR_MS},
  ];
  return Object.assign(operation, overrides);
}

/**
 * Coordinator harness through the REAL RebalanceCoordinator construction
 * path — the default operationWorkflowCoordinator wiring under test (the
 * harness never injects one, so the lifecycle's own persist-callback
 * wiring is what these tests exercise). Mirrors the in-memory harness
 * pattern from operation-ownership-lease-fencing.test.js.
 */
function createProgressStoreCoordinatorHarness({
  nowMs = ACTIVE_LEASE_OBSERVED_AT_MS,
} = {}) {
  const sqlQueryEngine = {
    async executeQuery() {
      return {success: true, rows: []};
    },
  };
  const coordinator = new RebalanceCoordinator({
    nodeId: TEST_NODE_ID,
    systemTableCache: createMockCache(),
    cdcIntegrationService: createMockCdcService(),
    controlPlaneSystemTableGateway:
      createMockControlPlaneSystemTableGateway(sqlQueryEngine),
    tablePolicyService: createMockPolicyService(),
    messageRouter: createMockMessageRouter(),
    sqlQueryEngine,
    transactionCoordinator: createMockTransactionCoordinator(),
    enableTimeouts: false,
    nowFn: () => nowMs,
  });
  coordinator.initialize();
  return {coordinator};
}

function buildExtendingTransitionCandidate(operation) {
  return {
    workflowId: operation.operationId,
    ownerKey: operation.operationId,
    step: WORKFLOW_STEP.ACTIVE,
    transitionHistory: [
      ...operation.stepsHistory.map((entry) => ({
        previousStep: entry.previousStep ?? null,
        nextStep: entry.step,
        reason: entry.reason ?? TRANSITION_REASON,
        timestamp: entry.timestamp,
        ownerKey: operation.operationId,
      })),
      {
        previousStep: WORKFLOW_STEP.SYNCING,
        nextStep: WORKFLOW_STEP.ACTIVE,
        reason: TRANSITION_REASON,
        timestamp: LEASE_ANCHOR_MS + NUM.ONE,
        ownerKey: operation.operationId,
      },
    ],
    // The durable basis the candidate was recovered from: the two steps
    // the durable row already mirrors.
    durableBasisStepCount: NUM.TWO,
    durableOperation: {
      ...operation,
      stepsHistory: [...operation.stepsHistory],
    },
  };
}

// ---------------------------------------------------------------------------
// progress-store-durable-or-honestly-renamed
// ---------------------------------------------------------------------------

test(
  'progress store: the production-wired persist callback mirrors only ' +
    'histories that extend the durable row (red-on-revert: a no-op ' +
    'revert accepts the non-extending mirror silently)',
  async (t) => {
    initializeConfig();
    const {coordinator} = createProgressStoreCoordinatorHarness();
    try {
      const operation = buildSyncingOperation();
      const workflowCoordinator = coordinator.operationWorkflowCoordinator;
      const candidate = buildExtendingTransitionCandidate(operation);

      const accepted = await workflowCoordinator.persistWorkflow(candidate);
      t.equal(
        accepted,
        candidate,
        'the wired persist callback accepts a candidate that extends ' +
          'the durable row mirror',
      );

      // The mirror is durable, never advance-only: a candidate whose
      // history does NOT extend the durable basis the record was
      // recovered from is rejected so the coordinator can roll the
      // in-memory record back. Reverting the lifecycle wiring to the
      // bare no-op default (async () => {}) accepts this silently — this
      // assertion goes red on that revert.
      let rejected = false;
      try {
        await workflowCoordinator.persistWorkflow({
          ...candidate,
          transitionHistory: candidate.transitionHistory.slice(
            NUM.ZERO,
            NUM.TWO,
          ),
        });
      } catch (error) {
        rejected = true;
        t.match(
          error.message,
          /does not extend the durable/u,
          'the rejection names the durable-row mirror contract',
        );
      }
      t.equal(
        rejected,
        true,
        'a mirror that cannot extend the durable row throws through the ' +
          'production wiring — the no-op revert signature',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'progress store: the transition witness survives a restart through ' +
    'recovery from the durable rows',
  async (t) => {
    initializeConfig();
    const operation = buildSyncingOperation();

    // Boot A: ensure the workflow on a coordinator whose store starts
    // empty — the production ensure path hydrates from the durable row.
    const bootA = createProgressStoreCoordinatorHarness();
    try {
      bootA.coordinator.workflowOwner.ensureOperationWorkflow(operation);
      const recoveredA = bootA.coordinator.operationWorkflowCoordinator
        .getWorkflowById(operation.operationId);
      t.ok(recoveredA, 'boot A restores the workflow from the durable row');
      t.equal(
        recoveredA.transitionHistory.length,
        NUM.TWO,
        'boot A recovers the durable transition witness from the row',
      );
      t.equal(
        bootA.coordinator.operationWorkflowCoordinator.isTransitionIdempotent(
          operation.operationId,
          WORKFLOW_STEP.SYNCING,
        ),
        true,
        'the recovered witness re-marks the durable steps as committed',
      );
    } finally {
      await bootA.coordinator.shutdown();
    }

    // Boot B (the restart): a fresh coordinator with an empty in-memory
    // Map recovers the same witness from the same durable row.
    const bootB = createProgressStoreCoordinatorHarness();
    try {
      bootB.coordinator.workflowOwner.ensureOperationWorkflow(operation);
      const recoveredB = bootB.coordinator.operationWorkflowCoordinator
        .getWorkflowById(operation.operationId);
      t.equal(
        recoveredB?.step,
        WORKFLOW_STEP.SYNCING,
        'boot B restores the current step from the durable row',
      );
      t.equal(
        recoveredB?.transitionHistory.length,
        NUM.TWO,
        'boot B restores the full transition history — the witness ' +
          'survives the restart because the row mirror is durable',
      );
      t.equal(
        bootB.coordinator.operationWorkflowCoordinator.workflowsByOwnerKey
          .get(operation.operationId),
        recoveredB,
        'the owner-key registry is restored too',
      );
    } finally {
      await bootB.coordinator.shutdown();
    }
  },
);

test(
  'progress store: the recovery loader maps raw replica_operations rows ' +
    'and terminal records stay immutable',
  async (t) => {
    const operation = buildSyncingOperation();
    const rawRow = {
      operation_id: operation.operationId,
      workflow_step: operation.workflowStep,
      steps_history: JSON.stringify(operation.stepsHistory),
      completed_at: null,
    };
    const terminalRow = {
      ...rawRow,
      operation_id: 'op-progress-store-terminal',
      completed_at: LEASE_ANCHOR_MS,
    };
    // Minimal recover() host: the real DurableWorkflowCoordinator is
    // exercised through the production harness everywhere else; this shim
    // keeps the loader mapping test focused on row translation.
    const restoredWorkflowIds = new Set();
    const recoverHost = {
      recover({workflows, loadWorkflow, isTerminalWorkflow}) {
        for (const row of workflows) {
          const record = loadWorkflow(row);
          if (record && !isTerminalWorkflow(record)) {
            restoredWorkflowIds.add(record.workflowId);
          }
        }
        return {restoredWorkflowIds};
      },
    };
    recoverOperationWorkflowsFromDurableRows(
      recoverHost,
      [rawRow, terminalRow],
    );
    t.equal(
      restoredWorkflowIds.has(operation.operationId),
      true,
      'the live raw row restores into the store',
    );
    t.equal(
      restoredWorkflowIds.has(terminalRow.operation_id),
      false,
      'the terminal row is skipped by recovery (terminal records are ' +
        'immutable in the store too)',
    );
  },
);

// ---------------------------------------------------------------------------
// lease-fence-freshness-not-hardcoded
// ---------------------------------------------------------------------------

test(
  'lease freshness: through the production owner port an expired ' +
    'durable lease reads STALE, an active lease CURRENT, an unstamped ' +
    'row UNAVAILABLE (red-on-revert: re-hard-coding CURRENT flips red)',
  async (t) => {
    initializeConfig();
    const {coordinator} = createProgressStoreCoordinatorHarness();
    try {
      // The port observes the lease at the owner's clock (owner.nowFn,
      // falling back to the wall clock); the test pins the observation
      // instant on the owner itself so the lease state is deterministic.
      const ports = coordinator.workflowOwner.operationWorkflowOwnerPorts;
      const activeLeaseOperation = buildSyncingOperation({
        ownerLeaseExpiresAt:
          LEASE_ANCHOR_MS + REPLICA_OPERATION_OWNER_LEASE_TTL_MS,
      });

      coordinator.workflowOwner.nowFn = () => ACTIVE_LEASE_OBSERVED_AT_MS;
      t.equal(
        ports.readOwnerLease(activeLeaseOperation).freshnessState,
        OPERATION_WORKFLOW_LEASE_FRESHNESS_STATE.CURRENT,
        'a live durable lease reads CURRENT through the port',
      );

      coordinator.workflowOwner.nowFn = () => EXPIRED_LEASE_OBSERVED_AT_MS;
      t.equal(
        ports.readOwnerLease(activeLeaseOperation).freshnessState,
        OPERATION_WORKFLOW_LEASE_FRESHNESS_STATE.STALE,
        'the same lease observed after expiry reads STALE — never a ' +
          'hard-coded CURRENT',
      );
      t.equal(
        ports.readOwnerLease(buildSyncingOperation()).freshnessState,
        OPERATION_WORKFLOW_LEASE_FRESHNESS_STATE.UNAVAILABLE,
        'an unfenced row with no lease stamp reads UNAVAILABLE (freshness ' +
          'is not claimed without evidence)',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'publication fence: through the production owner port the persisted ' +
    'witness is compared against the durable row mirror — divergence is ' +
    'STALE, absence INCOMPLETE (red-on-revert: re-hard-coding CURRENT ' +
    'flips red)',
  async (t) => {
    initializeConfig();
    const {coordinator} = createProgressStoreCoordinatorHarness();
    try {
      const operation = buildSyncingOperation();
      const ports = coordinator.workflowOwner.operationWorkflowOwnerPorts;

      t.equal(
        ports.readPublicationFence(operation).fenceState,
        OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE.CURRENT,
        'a first observation hydrates the witness from the durable row ' +
          'mirror through the port: CURRENT, never a bare INCOMPLETE',
      );

      const workflowCoordinator = coordinator.operationWorkflowCoordinator;
      const workflow =
        workflowCoordinator.getWorkflowById(operation.operationId);
      t.ok(
        workflow,
        'the port hydrated the workflow record from the durable row',
      );

      // A divergent durable basis: the persisted witness prefix no
      // longer matches the durable row mirror prefix.
      workflow.transitionHistory = workflow.transitionHistory.map(
        (entry, index) =>
          index === NUM.ZERO ?
            {...entry, nextStep: WORKFLOW_STEP.ACTIVE} :
            entry,
      );
      t.equal(
        ports.readPublicationFence(operation).fenceState,
        OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE.STALE,
        'a durable basis that diverges from the durable row mirror ' +
          'reads STALE — never a hard-coded CURRENT',
      );

      // Pure-resolution shapes the production port never fabricates:
      // no witness at all against a row carrying history (INCOMPLETE)
      // and a witness rewound below its own durable basis (STALE).
      t.equal(
        resolveOperationWorkflowPublicationFenceState(
          operation,
          {
            ...workflow,
            durableBasisStepCount: NUM.ZERO,
            transitionHistory: [],
          },
        ),
        OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE.INCOMPLETE,
        'no persisted witness against a row that already carries ' +
          'history reads INCOMPLETE',
      );
      t.equal(
        resolveOperationWorkflowPublicationFenceState(
          operation,
          {
            ...workflow,
            transitionHistory: workflow.transitionHistory.slice(
              NUM.ZERO,
              NUM.ONE,
            ),
          },
        ),
        OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE.STALE,
        'a witness rewound below its own durable basis reads STALE',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);
