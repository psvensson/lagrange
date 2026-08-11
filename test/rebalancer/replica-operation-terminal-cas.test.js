// Audit finding 6 (quest replica-operation-terminal-cas): terminal
// replica-operation transitions are first-terminal-wins, never
// last-writer-wins. The terminal UPDATE guards on `completed_at IS NULL`
// (gateway whereClause null-sentinel AND the raw-SQL fallback variant) while
// keeping the deliberate no-expected-step design, and a writer whose guarded
// write changes zero rows ADOPTS the winning terminal outcome instead of
// re-asserting its own.
//
// Red-on-revert: removing the `completed_at IS NULL` predicate (or the
// whereClause null-sentinel) fails the guard tests; removing the
// loser-adopts-winner disposition in resolveZeroChangeOperationUpdate fails
// the adoption tests — while every other mechanism stays in place.

import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  ReplicaOperationRepository,
  SQL as REPOSITORY_SQL,
} from '../../src/rebalancer/replica-operation-repository.js';
import {
  REBALANCE_COORDINATOR_SHARED,
} from '../../src/rebalancer/rebalance-coordinator-shared.js';
import {
  REPLICA_OPERATION_UPDATE_DISPOSITION,
} from '../../src/rebalancer/replica-operation-update-disposition.js';
import {
  armTerminalTransitionRepair,
  runTerminalTransitionRepairAttempt,
} from '../../src/rebalancer/operation-workflow-terminal-transition-repair.js';
import {
  isTerminalTransitionOutcomeSettled,
  shouldReleaseReservationForTerminalOutcome,
} from '../../src/rebalancer/operation-workflow-terminal-reservation-release.js';
import {createTestCoordinator} from './test-helpers.js';

const TEST_NODE_ID = 'node-a';
const TEST_TARGET_NODE_ID = 'node-b';
const TEST_OPERATION_ID = 'op-terminal-cas';
const TEST_PARTITION_ID = 'replica_operations-p1';
const TEST_REPLICA_ID = 'replica_operations-p1-r5';
const TEST_CREATED_AT_MS = 1_000;
const TEST_TERMINAL_AT_MS = 2_000;
const TEST_WINNER_TERMINAL_AT_MS = 3_000;
const TEST_RETRY_DELAY_MS = 1;
const TEST_VISIBILITY_TIMEOUT_MS = 0;

function makeRow(overrides = {}) {
  return {
    operation_id: TEST_OPERATION_ID,
    type: OperationType.ADD,
    partition_id: TEST_PARTITION_ID,
    replica_id: TEST_REPLICA_ID,
    source_node_id: TEST_NODE_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    status: ReplicaStatus.ACTIVE,
    workflow_step: WORKFLOW_STEP.ACTIVE,
    created_at: TEST_CREATED_AT_MS,
    updated_at: TEST_TERMINAL_AT_MS,
    completed_at: TEST_TERMINAL_AT_MS,
    error_message: null,
    steps_history: JSON.stringify([
      {step: WORKFLOW_STEP.ACTIVE, timestamp: TEST_TERMINAL_AT_MS},
    ]),
    entity_type: SERVICE_TYPE.PARTITION,
    entity_id: TEST_PARTITION_ID,
    ...overrides,
  };
}

function makeLosingProjection(repository, overrides = {}) {
  return {
    ...repository.rowToOperation(makeRow()),
    workflowStep: WORKFLOW_STEP.FAILED,
    status: ReplicaStatus.FAILED,
    updatedAt: TEST_TERMINAL_AT_MS,
    completedAt: TEST_TERMINAL_AT_MS,
    errorMessage: 'losing terminal projection',
    ...overrides,
  };
}

function createTerminalCasHarness({
  winnerRow = null,
  authorityRows = null,
  localRows = null,
  // Optional seam the CAS harnesses use to model the winner landing between
  // the pre-write terminal-conflict guard and the guarded UPDATE: the guard
  // is stubbed to "no rejection", the guarded UPDATE is issued, loses the
  // completed_at-IS-NULL CAS against the already-terminal row, and the real
  // post-write zero-change resolution reads the winner.
  skipPreWriteTerminalGuard = null,
  mutationChanges = 1,
} = {}) {
  const mutations = [];
  const readRows = authorityRows || (winnerRow ? [winnerRow] : []);
  const gateway = {
    readAuthoritativeRows: async (_table, _sql, _params, options = {}) => {
      // OWNER_LOCAL_ONLY serves the lagging local replica view (the pre-write
      // guards run against it); escalated reads serve the authority rows.
      if (
        options.authoritativeReadMode ===
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY
      ) {
        return {success: true, rows: localRows || []};
      }
      return {success: true, rows: readRows};
    },
    executeQuery: async (sql) => {
      // The raw-SQL fallback evaluates the guarded terminal statement against
      // the winning row: `completed_at IS NULL` makes a write against an
      // already-terminal row a zero-change loss.
      if (
        typeof sql === 'string' &&
        sql.includes('completed_at IS NULL') &&
        winnerRow &&
        winnerRow.completed_at !== null &&
        winnerRow.completed_at !== undefined
      ) {
        return {success: true, changes: 0};
      }
      return {success: true, changes: 1};
    },
    async submitMutation(mutation) {
      mutations.push(mutation);
      // Evaluate the guarded whereClause against the winning row exactly the
      // way the gateway SQL plan does: `completed_at IS NULL` makes a write
      // against an already-terminal row a zero-change loss.
      const whereClause = mutation?.whereClause || {};
      if (
        Object.hasOwn(whereClause, 'completed_at') &&
        whereClause.completed_at === null &&
        winnerRow &&
        winnerRow.completed_at !== null &&
        winnerRow.completed_at !== undefined
      ) {
        return {success: true, partitionResult: {affectedRows: 0}};
      }
      return {success: true, partitionResult: {affectedRows: mutationChanges}};
    },
  };
  // Mark the canonical CDC mutation ingress available so submitMutation is
  // the exercised write path (production shape); the executeQuery fallback
  // above covers the raw-SQL statement evaluation.
  gateway.cdcIntegrationService = {
    insertSystemTableRow: async () => ({success: true}),
    updateSystemTableRow: async () => ({success: true}),
  };
  const repository = new ReplicaOperationRepository({
    nodeId: TEST_NODE_ID,
    systemTableCache: {
      get: () => null,
      getAll: () => [],
      filter: () => [],
    },
    cdcIntegrationService: {waitForCacheUpdate: async () => {}},
    controlPlaneSystemTableGateway: gateway,
    authoritativeVisibilityTimeoutMs: TEST_VISIBILITY_TIMEOUT_MS,
    authoritativeVisibilityRetryDelayMs: TEST_RETRY_DELAY_MS,
    logger: {info() {}, warn() {}, error() {}, debug() {}},
  });
  if (typeof skipPreWriteTerminalGuard === 'function') {
    skipPreWriteTerminalGuard(repository);
  }
  return {repository, mutations};
}

test(
  'terminal-transition UPDATE carries the completed_at IS NULL guard in the gateway whereClause',
  async (t) => {
    // A durable NON-terminal row (the common terminal-write case): the guard
    // does not reject and the guarded write lands with the CAS attached.
    const laggingRow = makeRow({
      workflow_step: WORKFLOW_STEP.SYNCING,
      status: ReplicaStatus.SYNCING,
      completed_at: null,
    });
    const {repository, mutations} = createTerminalCasHarness({
      localRows: [laggingRow],
    });
    const projectedOperation = makeLosingProjection(repository);

    const persisted = await repository.persistOperationUpdate(
      projectedOperation,
      {
        terminalTransition: true,
        confirmPersistence: false,
        disableSystemWriteSession: true,
      },
    );

    t.equal(persisted, true, 'the guarded write against a non-terminal row persists');
    t.equal(mutations.length, 1, 'exactly one mutation reached the gateway');
    t.equal(
      mutations[0]?.whereClause?.completed_at,
      null,
      'the terminal whereClause carries the completed_at null-sentinel ' +
        '(rendered as `completed_at IS NULL` by the gateway SQL plan)',
    );
    t.equal(
      Object.hasOwn(mutations[0]?.whereClause || {}, 'workflow_step'),
      false,
      'the terminal write keeps the deliberate no-expected-step design ' +
        '(no workflow_step CAS — lagging non-terminal steps are overwritten)',
    );
  },
);

test(
  'non-terminal UPDATE keeps the expected-step CAS and no completed_at guard',
  async (t) => {
    const {repository} = createTerminalCasHarness();
    const operation = repository.rowToOperation(
      makeRow({completed_at: null, workflow_step: WORKFLOW_STEP.CREATING}),
    );
    const projectedOperation = {
      ...operation,
      workflowStep: WORKFLOW_STEP.SYNCING,
      updatedAt: TEST_TERMINAL_AT_MS,
    };

    const whereClause = repository.buildReplicaOperationUpdateWhereClause(
      projectedOperation,
      WORKFLOW_STEP.CREATING,
    );

    t.equal(
      whereClause.workflow_step,
      WORKFLOW_STEP.CREATING,
      'the non-terminal where clause keeps the expected-step CAS',
    );
    t.equal(
      Object.hasOwn(whereClause, 'completed_at'),
      false,
      'the non-terminal where clause carries no terminal guard',
    );
  },
);

test(
  'the raw-SQL fallback terminal statement guards on completed_at IS NULL in both SQL blocks',
  async (t) => {
    t.ok(
      REPOSITORY_SQL.UPDATE_OPERATION_TERMINAL.includes(
        'WHERE operation_id = ? AND completed_at IS NULL',
      ),
      'the repository SQL block carries the guarded terminal statement',
    );
    t.ok(
      REBALANCE_COORDINATOR_SHARED.SQL.UPDATE_OPERATION_TERMINAL.includes(
        'WHERE operation_id = ? AND completed_at IS NULL',
      ),
      'the shared.js drift copy carries the same guarded terminal statement',
    );
    t.equal(
      REPOSITORY_SQL.UPDATE_OPERATION_TERMINAL,
      REBALANCE_COORDINATOR_SHARED.SQL.UPDATE_OPERATION_TERMINAL,
      'the two copies cannot drift apart',
    );
  },
);

test(
  'a losing terminal write adopts the winning terminal outcome',
  async (t) => {
    const winnerRow = makeRow({
      workflow_step: WORKFLOW_STEP.ACTIVE,
      status: ReplicaStatus.ACTIVE,
      updated_at: TEST_WINNER_TERMINAL_AT_MS,
      completed_at: TEST_WINNER_TERMINAL_AT_MS,
      error_message: null,
    });
    // The winner lands between the pre-write conflict guard and the guarded
    // UPDATE: the write loses the CAS, and the zero-change resolution reads
    // the winner.
    const {repository} = createTerminalCasHarness({
      winnerRow,
      skipPreWriteTerminalGuard: (repository) => {
        repository.shouldRejectConflictingTerminalTransitionMutation =
          async () => false;
      },
    });
    const losingProjection = makeLosingProjection(repository);

    const result = await repository.persistOperationUpdate(
      losingProjection,
      {
        terminalTransition: true,
        confirmPersistence: false,
        disableSystemWriteSession: true,
        returnDisposition: true,
      },
    );

    t.equal(result.persisted, false, 'the losing terminal write is not a persistence');
    t.equal(
      result.disposition,
      REPLICA_OPERATION_UPDATE_DISPOSITION.TERMINAL_ADOPTED,
      'the typed disposition tells the caller a different terminal won',
    );
    t.ok(result.operation, 'the winning terminal row is surfaced to the caller');
    t.equal(
      losingProjection.workflowStep,
      WORKFLOW_STEP.ACTIVE,
      'the loser adopts the winning workflow step instead of re-asserting its own',
    );
    t.equal(
      losingProjection.status,
      ReplicaStatus.ACTIVE,
      'the loser adopts the winning status',
    );
    t.equal(
      losingProjection.completedAt,
      TEST_WINNER_TERMINAL_AT_MS,
      'the loser adopts the winning completion timestamp',
    );
    t.equal(
      losingProjection.errorMessage,
      null,
      'the loser drops its own terminal error message for the winner outcome',
    );
  },
);

test(
  'an idempotent terminal replay still resolves as a persistence',
  async (t) => {
    // The durable row already matches the writer's own terminal projection:
    // the guarded write changes zero rows but the visibility comparison is
    // satisfied, so this is an idempotent replay, not a lost CAS.
    const ownTerminalRow = makeRow();
    const {repository} = createTerminalCasHarness({
      winnerRow: ownTerminalRow,
      localRows: [ownTerminalRow],
    });
    const projectedOperation = repository.rowToOperation(ownTerminalRow);

    const result = await repository.persistOperationUpdate(
      projectedOperation,
      {
        terminalTransition: true,
        confirmPersistence: false,
        disableSystemWriteSession: true,
        returnDisposition: true,
      },
    );

    t.equal(result.persisted, true, 'an idempotent replay persists');
    t.equal(
      result.disposition,
      REPLICA_OPERATION_UPDATE_DISPOSITION.IDEMPOTENT_REPLAY,
      'the disposition distinguishes an own-terminal replay from a lost CAS',
    );
  },
);

test(
  'the default boolean contract for a lost terminal write stays false',
  async (t) => {
    const winnerRow = makeRow({
      workflow_step: WORKFLOW_STEP.ACTIVE,
      updated_at: TEST_WINNER_TERMINAL_AT_MS,
      completed_at: TEST_WINNER_TERMINAL_AT_MS,
    });
    const {repository} = createTerminalCasHarness({
      winnerRow,
      skipPreWriteTerminalGuard: (repository) => {
        repository.shouldRejectConflictingTerminalTransitionMutation =
          async () => false;
      },
    });
    const losingProjection = makeLosingProjection(repository);

    const persisted = await repository.persistOperationUpdate(
      losingProjection,
      {
        terminalTransition: true,
        confirmPersistence: false,
        disableSystemWriteSession: true,
      },
    );

    t.equal(
      persisted,
      false,
      'callers without the typed opt-in observe the legacy boolean contract',
    );
    t.equal(
      losingProjection.workflowStep,
      WORKFLOW_STEP.ACTIVE,
      'the loser still adopts the winner even without the typed opt-in',
    );
  },
);

test(
  'a terminal write against a lagging non-terminal row still overwrites it',
  async (t) => {
    // The deliberate no-expected-step design: a durable row stuck at a
    // non-terminal step (completed_at NULL) must be overwritten by the
    // terminal truth — the guard only yields to a DIFFERENT terminal.
    const laggingRow = makeRow({
      workflow_step: WORKFLOW_STEP.SYNCING,
      status: ReplicaStatus.SYNCING,
      completed_at: null,
    });
    const {repository, mutations} = createTerminalCasHarness({
      localRows: [laggingRow],
    });
    const projectedOperation = makeLosingProjection(repository, {
      workflowStep: WORKFLOW_STEP.ACTIVE,
      status: ReplicaStatus.ACTIVE,
      errorMessage: null,
    });

    const result = await repository.persistOperationUpdate(
      projectedOperation,
      {
        terminalTransition: true,
        confirmPersistence: false,
        disableSystemWriteSession: true,
        returnDisposition: true,
      },
    );

    t.equal(result.persisted, true, 'the terminal write overwrites the lagging step');
    t.equal(
      result.disposition,
      REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED,
      'the write is an ordinary update, not an adoption',
    );
    t.equal(
      mutations.length,
      1,
      'exactly one guarded mutation was issued (no refusal short-circuit)',
    );
  },
);

// ---------------------------------------------------------------------------
// dueling-terminal-converges: two owners project terminal truth for the same
// operation (run-21's FAILED ghost vs the winner's completed projection).
// Exactly one terminal write wins the completed_at-IS-NULL CAS; the loser's
// armed terminal-transition repair adopts the winner and stands down instead
// of oscillating. Red-on-revert: removing the guard (last-writer-wins) or
// the repair stand-down leaves a repair armed against the winner.
// ---------------------------------------------------------------------------

const DUEL_OPERATION_ID = 'op-dueling-terminal';
const DUEL_PARTITION_ID = 'replica_operations-p1';
const DUEL_REPLICA_ID = 'replica_operations-p1-r5';

function buildDuelOperationRow(overrides = {}) {
  return {
    operation_id: DUEL_OPERATION_ID,
    type: OperationType.REPLACE,
    partition_id: DUEL_PARTITION_ID,
    replica_id: DUEL_REPLICA_ID,
    source_node_id: TEST_NODE_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    status: ReplicaStatus.SYNCING,
    workflow_step: WORKFLOW_STEP.SYNCING,
    created_at: TEST_CREATED_AT_MS,
    updated_at: TEST_CREATED_AT_MS,
    completed_at: null,
    error_message: null,
    steps_history: JSON.stringify([]),
    entity_type: SERVICE_TYPE.PARTITION,
    entity_id: DUEL_PARTITION_ID,
    ...overrides,
  };
}

function buildDuelProjection(repository, overrides = {}) {
  return {
    ...repository.rowToOperation(buildDuelOperationRow()),
    ...overrides,
  };
}

function buildWinnerProjection(repository, now) {
  return buildDuelProjection(repository, {
    workflowStep: WORKFLOW_STEP.REMOVED,
    status: 'removed',
    updatedAt: now,
    completedAt: now,
    errorMessage: null,
  });
}

function buildLoserProjection(repository, now) {
  return buildDuelProjection(repository, {
    workflowStep: WORKFLOW_STEP.FAILED,
    status: ReplicaStatus.FAILED,
    updatedAt: now,
    completedAt: now,
    errorMessage: 'voter-ready timeout (dueling terminal)',
  });
}

test(
  'dueling terminal projections converge: one winner, the loser repair stands down',
  async (t) => {
    const coordinator = createTestCoordinator({nodeId: TEST_NODE_ID});
    const repository = coordinator.repository;
    repository.replicaOperationAuthoritativeVisibilityTimeoutMs = 20;
    repository.replicaOperationAuthoritativeVisibilityRetryDelayMs = 1;
    const now = Date.now();
    try {
      // Seed the operation at a non-terminal step (both owners progressed it).
      await repository.persistNewOperation(
        buildDuelProjection(repository),
        {confirmPersistence: false},
      );

      // The winner's terminal write lands first through the REAL guarded
      // terminal statement.
      const winnerProjection = buildWinnerProjection(repository, now);
      const winnerResult = await repository.persistOperationUpdate(
        winnerProjection,
        {
          terminalTransition: true,
          confirmPersistence: false,
          disableSystemWriteSession: true,
          returnDisposition: true,
        },
      );
      t.equal(
        winnerResult.persisted,
        true,
        'the first terminal write wins the completed_at-IS-NULL CAS',
      );
      t.equal(
        winnerResult.disposition,
        REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED,
        'the winning write is an ordinary terminal update',
      );

      // The loser's terminal write for the SAME operation arrives after the
      // winner: the guard must refuse to clobber the winner (zero rows) and
      // the loser adopts the winning terminal outcome.
      const loserProjection = buildLoserProjection(repository, now + 1);
      const loserResult = await repository.persistOperationUpdate(
        loserProjection,
        {
          terminalTransition: true,
          confirmPersistence: false,
          disableSystemWriteSession: true,
          returnDisposition: true,
        },
      );
      t.equal(
        loserResult.persisted,
        false,
        'the losing terminal write changes zero rows (the winner is never clobbered)',
      );
      t.equal(
        loserResult.disposition,
        REPLICA_OPERATION_UPDATE_DISPOSITION.TERMINAL_ADOPTED,
        'the loser learns a different terminal won',
      );
      t.equal(
        loserProjection.workflowStep,
        WORKFLOW_STEP.REMOVED,
        'the loser projection adopts the winning terminal step',
      );
      t.equal(
        loserProjection.errorMessage,
        null,
        'the loser projection drops its own error for the winner outcome',
      );

      // The loser's post-commit visibility confirmation failed/deferred
      // before it learned it lost (run-21's ghost shape): the repair was
      // armed with the losing projection. One repair attempt must observe
      // the winner, adopt it, and STAND DOWN — never re-assert the loser.
      const owner = coordinator.workflowOwner;
      armTerminalTransitionRepair(owner, loserProjection, 'confirmation_failed');
      t.ok(
        owner.terminalTransitionRepairStateByOperationId.has(DUEL_OPERATION_ID),
        'the loser repair is armed against the winning terminal (the dueling shape)',
      );

      await runTerminalTransitionRepairAttempt(owner, DUEL_OPERATION_ID);

      t.notOk(
        owner.terminalTransitionRepairStateByOperationId.has(DUEL_OPERATION_ID),
        'the loser repair stands down against the confirmed winner',
      );
      t.notOk(
        owner.terminalTransitionRepairTimerByOperationId.has(DUEL_OPERATION_ID),
        'no repair timer remains armed (no oscillation)',
      );

      // The durable row still carries exactly the winner's terminal state.
      const durable = await repository.queryReplicaOperationPersistenceAuthorityOperation(
        {operationId: DUEL_OPERATION_ID},
      );
      t.equal(
        durable?.workflowStep,
        WORKFLOW_STEP.REMOVED,
        'the durable terminal state is exactly the winner outcome',
      );
      t.equal(
        durable?.status,
        'removed',
        'the durable terminal status is the winner status',
      );
      t.ok(
        durable?.workflowStep !== WORKFLOW_STEP.FAILED,
        'the loser never re-asserts its own terminal state',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

// Quest terminal-write-refusal-retry-ownership: the residual zero-change
// arm — a visible-but-unsatisfied NON-terminal authority row — REFUSES the
// terminal write, and the caller-side gates must treat that refusal as
// "still live, still owned": no reservation release, no drain progress.
test(
  'a refused terminal write (zero changes against a visible non-terminal ' +
    'authority row) reports the typed REFUSED disposition and the ' +
    'caller-side gates keep the operation owned',
  async (t) => {
    const nonTerminalRow = makeRow({
      status: ReplicaStatus.SYNCING,
      workflow_step: WORKFLOW_STEP.SYNCING,
      completed_at: null,
      updated_at: TEST_CREATED_AT_MS,
      steps_history: JSON.stringify([
        {step: WORKFLOW_STEP.SYNCING, timestamp: TEST_CREATED_AT_MS},
      ]),
    });
    const {repository, mutations} = createTerminalCasHarness({
      authorityRows: [nonTerminalRow],
      mutationChanges: 0,
    });
    const losingProjection = makeLosingProjection(repository);

    const result = await repository.persistOperationUpdate(
      losingProjection,
      {terminalTransition: true, returnDisposition: true},
    );

    t.same(
      {persisted: result?.persisted, disposition: result?.disposition},
      {
        persisted: false,
        disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED,
      },
      'the zero-change terminal write against a live non-terminal row is ' +
        'the typed REFUSED disposition',
    );
    t.equal(mutations.length, 1, 'exactly one guarded mutation was issued');

    // Caller-side consequence: REFUSED is unresolved divergence.
    const refusedOutcome = {
      committed: false,
      disposition: result?.disposition,
    };
    t.equal(
      shouldReleaseReservationForTerminalOutcome(refusedOutcome),
      false,
      'REFUSED never releases the storage reservation',
    );
    t.equal(
      isTerminalTransitionOutcomeSettled(refusedOutcome),
      false,
      'REFUSED is not drain progress — the termination did not settle',
    );

    // Release-gated floor (fail-closed): the proven-terminal outcomes
    // keep today's behavior exactly.
    t.same(
      [
        REPLICA_OPERATION_UPDATE_DISPOSITION.TERMINAL_ADOPTED,
        REPLICA_OPERATION_UPDATE_DISPOSITION.IDEMPOTENT_REPLAY,
      ].map((disposition) =>
        isTerminalTransitionOutcomeSettled({committed: false, disposition}),
      ),
      [true, true],
      'TERMINAL_ADOPTED and IDEMPOTENT_REPLAY settle (a durable terminal ' +
        'is proven)',
    );
    t.equal(
      isTerminalTransitionOutcomeSettled({
        committed: true,
        disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED,
      }),
      true,
      'a committed terminal settles',
    );
    t.equal(
      isTerminalTransitionOutcomeSettled({
        committed: false,
        disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.REINSERTED,
      }),
      false,
      'REINSERTED is unresolved divergence, not settled progress',
    );
  },
);
