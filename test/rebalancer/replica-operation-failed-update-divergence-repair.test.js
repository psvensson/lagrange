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
import {ReplicaOperationRepository} from '../../src/rebalancer/replica-operation-repository.js';

// Gap (ii), quest formation-ledger-self-move-blocks-cluster-ops: a progress
// UPDATE whose distributed write fails because a diverged/lagging participant
// replica lacked the row (the live "No row found for CDC update" ->
// "Distributed operation failed due to participant failures" shape at
// run-legA-1-2026-07-06 06:36:31) must NOT defer forever. resolveFailedOperationUpdateResult
// (arm 2) previously only recovered through an OWNER_LOCAL_ONLY read; on a genuine
// divergence the local copy also lacks the fresh row, so it threw and re-armed 32x.
// The fix escalates to the owner-RPC authority (reusing Leg A's local-first ->
// owner-RPC read): a write that actually landed on the authority is treated durable;
// a row the authority proves genuinely absent is re-materialised.

const TEST_NODE_ID = 'node-a';
const TEST_TARGET_NODE_ID = 'node-b';
const TEST_OPERATION_ID = 'op-failed-update-divergence';
const TEST_PARTITION_ID = 'sql_write_operations-p1';
const TEST_REPLICA_ID = 'sql_write_operations-p1-r4';
const TEST_CREATED_AT_MS = 1_000;
const TEST_PROGRESS_AT_MS = 2_000;
const TEST_VISIBILITY_TIMEOUT_MS = 0;
const TEST_RETRY_DELAY_MS = 1;

// The retryable participant-failure shape the live gateway returned: a
// distributed write where one participant replica lacked the row. deferRetry
// makes it retryable (isRetryableControlPlaneError) and short-circuits the
// gateway retry loop so the result reaches resolveFailedOperationUpdateResult.
const PARTICIPANT_FAILURE_RESULT = Object.freeze({
  success: false,
  error: 'Distributed operation failed due to participant failures',
  deferRetry: true,
});

function makeRow(overrides = {}) {
  return {
    operation_id: TEST_OPERATION_ID,
    type: OperationType.REPLACE,
    partition_id: TEST_PARTITION_ID,
    replica_id: TEST_REPLICA_ID,
    source_node_id: TEST_NODE_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    status: ReplicaStatus.CREATING,
    workflow_step: WORKFLOW_STEP.CREATING,
    created_at: TEST_CREATED_AT_MS,
    updated_at: TEST_PROGRESS_AT_MS,
    completed_at: null,
    error_message: null,
    steps_history: JSON.stringify([
      {step: WORKFLOW_STEP.PENDING, timestamp: TEST_CREATED_AT_MS},
      {step: WORKFLOW_STEP.CREATING, timestamp: TEST_PROGRESS_AT_MS},
    ]),
    entity_type: SERVICE_TYPE.PARTITION,
    entity_id: TEST_PARTITION_ID,
    ...overrides,
  };
}

// A stale local copy stuck at the PRIOR step (PENDING) — the lagging replica
// that has the INSERT but not the CREATING progress UPDATE. It does NOT satisfy
// the projected CREATING operation, so the OWNER_LOCAL_ONLY recovery read fails
// and the result reaches arm 2 (the fix's escalation point).
function makeStaleLocalRow(overrides = {}) {
  return makeRow({
    status: ReplicaStatus.PENDING,
    workflow_step: WORKFLOW_STEP.PENDING,
    updated_at: TEST_CREATED_AT_MS,
    ...overrides,
  });
}

function createRepository({executeQuery, readRouter}) {
  const gateway = {
    readAuthoritativeRows: readRouter,
    executeQuery,
  };
  return new ReplicaOperationRepository({
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
}

// Routes reads by authoritativeReadMode: OWNER_LOCAL_ONLY -> localRows,
// OWNER_RPC_PREFERRED_SQL_FALLBACK -> authorityRows. rowsFn lets tests return
// state that changes after a re-insert.
function makeReadRouter({local, authority, readModes}) {
  return async (_tableName, _sql, _params, options = {}) => {
    readModes.push(options.authoritativeReadMode);
    if (
      options.authoritativeReadMode ===
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY
    ) {
      return {success: true, rows: typeof local === 'function' ? local() : local};
    }
    if (
      options.authoritativeReadMode ===
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED_SQL_FALLBACK
    ) {
      return {
        success: true,
        rows: typeof authority === 'function' ? authority() : authority,
      };
    }
    return {success: true, rows: []};
  };
}

test(
  'a diverged participant-failure recovers through the owner-RPC authority when ' +
    'the write actually landed (minority replica lagged)',
  async (t) => {
    const readModes = [];
    const durableRow = makeRow();
    const repository = createRepository({
      // The distributed progress UPDATE fails: a participant replica lacked the row.
      executeQuery: async () => PARTICIPANT_FAILURE_RESULT,
      // Local copy is stale (PENDING), but the owner-RPC authority holds the
      // durable CREATING row — the write committed on the majority.
      readRouter: makeReadRouter({
        local: [makeStaleLocalRow()],
        authority: [durableRow],
        readModes,
      }),
    });
    const projectedOperation = repository.rowToOperation(durableRow);

    const persisted = await repository.persistOperationUpdate(projectedOperation, {});

    t.equal(
      persisted,
      true,
      'the write that landed on the authority must resolve as durable, not throw',
    );
    t.ok(
      readModes.includes(
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED_SQL_FALLBACK,
      ),
      'the failed-update arm must escalate past the stale local copy to the ledger authority',
    );
  },
);

test(
  'a diverged participant-failure re-materialises the owner row when the ' +
    'authority proves it genuinely missing',
  async (t) => {
    const readModes = [];
    let reinserted = false;
    const durableRow = makeRow({operation_id: 'op-failed-update-reinsert'});
    const projectedOperation = createRepository({
      executeQuery: async () => ({success: true}),
      readRouter: () => ({success: true, rows: []}),
    }).rowToOperation(durableRow);

    const repository = createRepository({
      // UPDATE fails (participant lacked row); the later INSERT (re-insert) succeeds
      // and materialises the row, which subsequent authority reads then observe.
      executeQuery: async (sql) => {
        if (typeof sql === 'string' && sql.toUpperCase().includes('INSERT')) {
          reinserted = true;
          return {success: true, changes: 1};
        }
        return PARTICIPANT_FAILURE_RESULT;
      },
      readRouter: makeReadRouter({
        local: () => (reinserted ? [durableRow] : []),
        authority: () => (reinserted ? [durableRow] : []),
        readModes,
      }),
    });

    const persisted = await repository.persistOperationUpdate(projectedOperation, {});

    t.equal(reinserted, true, 'the genuinely-missing row must be re-inserted');
    t.equal(
      persisted,
      true,
      're-materialising the owner copy must terminalize the transition, not defer forever',
    );
  },
);

test(
  'a re-insert that no-ops onto the still-diverged replica must NOT falsely ' +
    'succeed while the authority cannot confirm the row',
  async (t) => {
    const readModes = [];
    const durableRow = makeRow({operation_id: 'op-failed-update-reinsert-noop'});
    const projectedOperation = createRepository({
      executeQuery: async () => ({success: true}),
      readRouter: () => ({success: true, rows: []}),
    }).rowToOperation(durableRow);

    const repository = createRepository({
      // UPDATE fails; the re-insert routes to the SAME diverged replica and
      // no-ops (OR-IGNORE collision → changes:0), and the authority still
      // cannot see the row. The repair must judge success by the authority,
      // not the write result, so it must NOT claim success here.
      executeQuery: async (sql) => {
        if (typeof sql === 'string' && sql.toUpperCase().includes('INSERT')) {
          return {success: true, changes: 0};
        }
        return PARTICIPANT_FAILURE_RESULT;
      },
      // Authority never observes the row (genuinely lost on the diverged copy).
      readRouter: makeReadRouter({local: [], authority: [], readModes}),
    });

    await t.rejects(
      repository.persistOperationUpdate(projectedOperation, {}),
      /participant failures/,
      'a no-op re-insert onto a diverged replica must surface as a deferral, ' +
        'not a false durable success',
    );
  },
);

test(
  'a non-retryable hard failure still throws — the repair must not mask a genuine loss',
  async (t) => {
    const readModes = [];
    const durableRow = makeRow({operation_id: 'op-failed-update-hard-failure'});
    const repository = createRepository({
      // A non-retryable failure (no deferRetry, not a retryable class).
      executeQuery: async () => ({
        success: false,
        error: 'constraint violation: duplicate primary key',
      }),
      readRouter: makeReadRouter({
        local: [durableRow],
        authority: [durableRow],
        readModes,
      }),
    });
    const projectedOperation = repository.rowToOperation(durableRow);

    await t.rejects(
      repository.persistOperationUpdate(projectedOperation, {}),
      /constraint violation/,
      'a non-retryable hard failure must surface, not be swallowed by the divergence repair',
    );
  },
);
