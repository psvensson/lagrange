/**
 * Shared user-table topology helpers for scenarios that create an
 * activity-shaped user table, drive a managed split, and observe the
 * settled partition topology: transient-admin retry, cross-node
 * metadata reads, split-policy application with stable read-back,
 * write-readiness and seeding, and the settled-row / fingerprint
 * primitives.
 *
 * This is a helper module, not a runnable scenario: it must never
 * export a `run` function (scenario discovery schedules any module
 * that does).
 */

import assert from 'node:assert/strict';
import {escapeSql, rowsFromResult} from './table-distribution-helpers.js';
import {
  TABLE_DISTRIBUTION_CONTROL_QUERY_HELPERS,
} from './table-distribution-helpers-control-query.js';

// Policy-mutation SQL comes from the canonical owner
// (table-distribution-helpers-control-query.js) — the scenario policy
// SQL guard forbids raw table_policies updates outside that owner.
const {
  DEFAULT_TABLE_SPLIT_POLICIES,
  SQL_UPDATE_TABLE_POLICIES_MID,
  SQL_UPDATE_TABLE_POLICIES_PREFIX,
  SQL_UPDATE_TABLE_POLICIES_SUFFIX,
} = TABLE_DISTRIBUTION_CONTROL_QUERY_HELPERS;

const ZERO = 0;
const ONE = 1;

// Bounded retry for a scenario's own setup traffic: the first admin
// queries after all-active can hit a still-settling write path (typed
// retryable participant/pressure failures). Retrying transients here is
// infra robustness for a scenario's PRECONDITION phase only — measured
// phases must never retry through this.
const TRANSIENT_ADMIN_RETRY_LIMIT = 20;
const TRANSIENT_ADMIN_RETRY_BASE_DELAY_MS = 500;
const TRANSIENT_ADMIN_ERROR_PATTERN =
  /participant failures|pressure|degraded|reconnecting|not ready|service shutdown|shutting down|no active leader|leader.*unavailable|timed out|timeout/i;
const IDEMPOTENT_REPLAY_ERROR_PATTERN =
  /duplicate|unique constraint|already exists/i;

const POLICY_STABLE_READBACKS = 2;
const POLICY_APPLY_MAX_ATTEMPTS = 40;
const POLICY_APPLY_POLL_MS = 500;

// A freshly created table's partition needs replica placement and a raft
// leader before writes land; the first INSERT otherwise fails with
// retryable participant failures for longer than any per-query retry
// should paper over.
const TABLE_WRITE_READY_TIMEOUT_MS = 90000;
const TABLE_WRITE_READY_POLL_MS = 1000;

// A SPLITTING/MERGING parent row survives in the partitions table until
// dissolution; counting it would bake a transient topology into
// downstream gates. Exclude known-transitional states and pass unknown
// vocabularies through.
const TRANSITIONAL_PARTITION_STATES = Object.freeze(new Set([
  'splitting',
  'merging',
]));

/**
 * The activity-shaped user-table SQL surface shared by the public-path
 * baseline and leader-placement scenarios. Scenario-specific statements
 * stay in the scenario; only the shared table lifecycle lives here.
 * @param {string} tableName
 * @return {Object} Frozen SQL statement map for the table.
 */
function buildUserActivityTableSql(tableName) {
  return Object.freeze({
    CREATE_TABLE:
      `CREATE TABLE ${tableName} (id INTEGER PRIMARY KEY, ` +
      'account_id INTEGER, amount_cents INTEGER, flagged INTEGER, ' +
      'pad TEXT)',
    INSERT_ROW:
      `INSERT INTO ${tableName} ` +
      '(id, account_id, amount_cents, flagged, pad) ' +
      'VALUES (?, ?, ?, ?, ?)',
    SELECT_PARTITIONS:
      'SELECT partition_id, leader_node_id, state FROM partitions ' +
      `WHERE table_name = '${tableName}'`,
    SELECT_TABLE_ID:
      `SELECT table_id FROM tables WHERE table_name = '${tableName}'`,
    SELECT_TABLE_POLICIES_PREFIX:
      'SELECT table_policies FROM tables WHERE table_id = \'',
    UPDATE_TABLE_POLICIES_PREFIX: SQL_UPDATE_TABLE_POLICIES_PREFIX,
    UPDATE_TABLE_POLICIES_MID: SQL_UPDATE_TABLE_POLICIES_MID,
    UPDATE_TABLE_POLICIES_SUFFIX: SQL_UPDATE_TABLE_POLICIES_SUFFIX,
    QUOTE_SUFFIX: '\'',
  });
}

async function queryRows(node, sql, params = []) {
  return rowsFromResult(await node.query(sql, params));
}

function isTransientAdminError(error) {
  return error?.deferRetry === true ||
    TRANSIENT_ADMIN_ERROR_PATTERN.test(String(error?.message || error || ''));
}

function selectSettledPartitionRows(partitionRows) {
  return partitionRows.filter((row) =>
    !TRANSITIONAL_PARTITION_STATES.has(
      String(row?.state || '').toLowerCase(),
    ),
  );
}

function topologyFingerprint(partitionRows) {
  return partitionRows
    .map((row) => `${row?.partition_id}|${row?.leader_node_id}`)
    .sort()
    .join(',');
}

function policyReadBackMatches(rows) {
  const raw = rows.find((row) => row?.table_policies)?.table_policies;
  if (typeof raw !== 'string' || raw.length === ZERO) {
    return false;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed?.splitStorageThreshold ===
      DEFAULT_TABLE_SPLIT_POLICIES.splitStorageThreshold;
  } catch (_error) {
    return false;
  }
}

/**
 * Bind the shared table-lifecycle helpers to one scenario's identity.
 * @param {Object} options
 * @param {string} options.scenarioName Used in every failure message.
 * @param {string} options.tableName
 * @param {Object} options.sql Statement map from buildUserActivityTableSql.
 * @return {Object} The bound helper functions.
 */
function createTableTopologyHelpers({scenarioName, tableName, sql}) {
  async function retryTransientAdminQuery(deps, label, attemptFn) {
    let lastError = null;
    for (let attempt = 0; attempt < TRANSIENT_ADMIN_RETRY_LIMIT;
      attempt += 1) {
      try {
        return await attemptFn();
      } catch (error) {
        if (attempt > ZERO &&
          IDEMPOTENT_REPLAY_ERROR_PATTERN.test(
            String(error?.message || ''))) {
          // A retried idempotent write whose first attempt landed
          // ambiguously replays as a duplicate — that is success.
          return null;
        }
        if (!isTransientAdminError(error)) {
          throw error;
        }
        lastError = error;
        await deps.sleep(
          TRANSIENT_ADMIN_RETRY_BASE_DELAY_MS * (attempt + 1),
        );
      }
    }
    throw new Error(
      `${scenarioName}: ${label} still failing after ` +
      `${TRANSIENT_ADMIN_RETRY_LIMIT} transient retries: ` +
      `${lastError?.message || lastError}`,
    );
  }

  // First node that answers wins; partition metadata is control-plane
  // replicated so any live node can serve it.
  async function queryRowsAcrossNodes(nodes, sqlText) {
    let lastError = null;
    for (const node of nodes) {
      try {
        return await queryRows(node, sqlText);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError ||
      new Error(`${scenarioName}: no node answered: ${sqlText}`);
  }

  async function resolveTableId(seedNode) {
    const rows = await queryRows(seedNode, sql.SELECT_TABLE_ID);
    const tableId = rows.find((row) =>
      typeof row?.table_id === 'string' && row.table_id.length > ZERO,
    )?.table_id;
    assert.ok(tableId, `${scenarioName}: ${tableName} table_id missing`);
    return tableId;
  }

  // Split-friendly table policies with merge disabled (thresholds of 1),
  // re-applied until the read-back is stable — the benchmark
  // partitioning precedent.
  async function applySplitPolicies(seedNode, tableId, deps) {
    const updateSql = sql.UPDATE_TABLE_POLICIES_PREFIX +
      escapeSql(JSON.stringify(DEFAULT_TABLE_SPLIT_POLICIES)) +
      sql.UPDATE_TABLE_POLICIES_MID +
      escapeSql(tableId) +
      sql.UPDATE_TABLE_POLICIES_SUFFIX;
    const readBackSql = sql.SELECT_TABLE_POLICIES_PREFIX +
      escapeSql(tableId) + sql.QUOTE_SUFFIX;
    let stableCount = ZERO;
    for (let attempt = ZERO; attempt < POLICY_APPLY_MAX_ATTEMPTS;
      attempt += ONE) {
      await retryTransientAdminQuery(deps, 'apply-split-policies',
        () => seedNode.query(updateSql));
      const rows = await retryTransientAdminQuery(deps, 'read-back-policies',
        () => queryRows(seedNode, readBackSql));
      stableCount = policyReadBackMatches(rows) ? stableCount + ONE : ZERO;
      if (stableCount >= POLICY_STABLE_READBACKS) {
        return;
      }
      await deps.sleep(POLICY_APPLY_POLL_MS);
    }
    throw new Error(
      `${scenarioName}: split policies never became stable on ` +
      tableName,
    );
  }

  // Wait for at least one settled partition row with a live leader
  // before seeding.
  async function waitForTableWriteReadiness(nodes, deps) {
    const deadline = Date.now() + TABLE_WRITE_READY_TIMEOUT_MS;
    let lastRows = [];
    while (Date.now() < deadline) {
      lastRows = selectSettledPartitionRows(
        await queryRowsAcrossNodes(nodes, sql.SELECT_PARTITIONS));
      const led = lastRows.filter((row) =>
        typeof row?.leader_node_id === 'string' &&
        row.leader_node_id.length > ZERO);
      if (led.length > ZERO) {
        return led;
      }
      await deps.sleep(TABLE_WRITE_READY_POLL_MS);
    }
    throw new Error(
      `${scenarioName}: ${tableName} never became write-ready ` +
      `(settled+led partitions: ${lastRows.length})`,
    );
  }

  async function seedDataset(seedNode, rows, deps) {
    for (const row of rows) {
      // Per-row retry keeps a mid-seed transient from replaying earlier
      // rows: a duplicate on retry is the row's own ambiguous first
      // attempt having landed, and seeding continues with the next row.
      await retryTransientAdminQuery(deps, `seed-row-${row.id}`,
        () => seedNode.query(sql.INSERT_ROW, [
          row.id, row.accountId, row.amountCents, row.flagged, row.pad,
        ]));
    }
  }

  return {
    applySplitPolicies,
    queryRowsAcrossNodes,
    resolveTableId,
    retryTransientAdminQuery,
    seedDataset,
    waitForTableWriteReadiness,
  };
}

export {
  buildUserActivityTableSql,
  createTableTopologyHelpers,
  queryRows,
  selectSettledPartitionRows,
  topologyFingerprint,
};
