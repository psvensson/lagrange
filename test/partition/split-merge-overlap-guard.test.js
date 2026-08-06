/**
 * Durable split/merge overlap guard regression tests (F23).
 *
 * A split and a merge can never be in flight on overlapping key
 * ranges: the workflow owners refuse registration when the candidate
 * source/target key ranges overlap an already-PERSISTED in-flight
 * transition's ranges — validated through the durable tables
 * transition rows (listTableInfos + parsePartitionTransition) and the
 * authoritative partitions rows, never the process-local
 * splitReplication/mergeReplication handle check that dies with a
 * restart.
 *
 * Receipts:
 *   - overlap-refused-at-registration
 *   - durable-overlap-validation
 *   - restart-surviving-guard
 */
import {test} from '../../src/test-helpers/tap.js';
import {
  MANAGED_MERGE_ERROR_MSG,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {
  QUERY_ERROR_MSG,
} from '../../src/query/query-constants.js';
import {
  buildWorkflow,
} from './managed-split-workflow-test-helpers.js';
import {
  buildMergeWorkflow,
  createThreePartitionInfos,
  FIXTURE_LEFT_PARTITION_ID,
  FIXTURE_RIGHT_PARTITION_ID,
  FIXTURE_TABLE_ID,
  FIXTURE_TABLE_NAME,
} from './managed-merge-workflow-test-helpers.js';

// The overlap refusal is the same durable-transition refusal surface
// as the pre-existing already-in-progress check, qualified by the
// overlap suffix so the refusal reason is distinguishable in logs and
// tests.
const SPLIT_OVERLAP_ERROR =
  QUERY_ERROR_MSG.TABLE_SPLIT_ALREADY_IN_PROGRESS +
  QUERY_ERROR_MSG.TABLE_SPLIT_OVERLAPPING_TRANSITION_SUFFIX;
const MERGE_OVERLAP_ERROR =
  MANAGED_MERGE_ERROR_MSG.ALREADY_IN_PROGRESS +
  MANAGED_MERGE_ERROR_MSG.OVERLAPPING_TRANSITION_SUFFIX;

/**
 * Parse the durable table row's transition columns the way the SQL
 * query engine's parsePartitionTransition does, so the guard reads the
 * recorded durable row exactly like production.
 * @param {Object|null} tableInfo - Table metadata row.
 * @return {Object|null} Parsed transition metadata.
 */
function parseDurableTransition(tableInfo) {
  const state = tableInfo?.partition_transition_state || null;
  const rawMetadata = tableInfo?.partition_transition_metadata || null;
  if (!state || !rawMetadata) {
    return null;
  }
  const metadata = typeof rawMetadata === 'string' ?
    JSON.parse(rawMetadata) :
    rawMetadata;
  return {state, metadata};
}

/**
 * Build one durable tables row (transition columns clean).
 * @param {string} tableId - Table id.
 * @param {string} tableName - Table name.
 * @return {Object} Durable tables row.
 */
function createDurableTableRow(tableId, tableName) {
  return {
    table_id: tableId,
    table_name: tableName,
    partition_key: 'id',
    active_partition_version: 1,
    partition_transition_state: null,
    partition_transition_metadata: null,
  };
}

/**
 * Persist a FOREIGN in-flight split transition (another node owns the
 * workflow — no local process-local handle ever saw it) directly into
 * the durable rows the guard consults: the tables transition columns
 * plus the topology-snapshot source key range it covers.
 * @param {Object} options
 * @param {Object} options.durableTableRow - Durable tables row.
 * @param {string} options.sourcePartitionId - Split source partition.
 * @param {Object} options.sourceRange - Source key range.
 * @param {string} [options.splitKey] - Persisted split key.
 * @param {string} [options.state] - PARTITION_TRANSITION_STATE value.
 */
function persistForeignInFlightSplit(options) {
  const state = options.state ||
    PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING;
  const metadata = {
    [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID]:
      `split-foreign-${options.sourcePartitionId}-v2`,
    [PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID]:
      options.sourcePartitionId,
    [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]: 2,
    [PARTITION_TRANSITION_METADATA_FIELD.SPLIT_KEY]:
      options.splitKey || 'q',
    [PARTITION_TRANSITION_METADATA_FIELD.TOPOLOGY_SNAPSHOT]: {
      sourcePartitionKeyRanges: {
        [options.sourcePartitionId]: {...options.sourceRange},
      },
    },
  };
  options.durableTableRow.partition_transition_state = state;
  options.durableTableRow.partition_transition_metadata =
    JSON.stringify(metadata);
}

/**
 * Build a split workflow wired to the shared durable world: the given
 * tables rows are the durable store (getTableInfo/listTableInfos read
 * them), partition rows come from the merged partition map, and the
 * workflow's own durable writes land on its table's row through the
 * helper's recording CDC seam.
 * @param {Object} options
 * @param {Object} options.tableRow - This workflow's table row.
 * @param {Array<Object>} options.allTableRows - Durable store.
 * @param {Object} options.partitionById - Partition rows by id.
 * @param {string} options.tableId - Table the workflow registers on.
 * @return {Object} buildWorkflow result.
 */
function buildGuardedSplitWorkflow(options) {
  return buildWorkflow({
    durableTableRows: [options.tableRow],
    getTableInfo: () => options.tableRow,
    listTableInfos: () => options.allTableRows,
    parsePartitionTransition: parseDurableTransition,
    getPartitionInfo: (partitionId) =>
      options.partitionById[partitionId] || null,
    listTablePartitionRows: (tableId) =>
      Object.values(options.partitionById).filter(
        (row) => row.table_id === tableId,
      ),
    buildManagedSplitPlan: async (partitionInfo) => ({
      medianKey: 'k',
      leftPartition: {
        partitionId: `${partitionInfo.partition_id}-left`,
        keyRange: {
          start: partitionInfo.partition_key_start,
          end: 'k',
        },
      },
      rightPartition: {
        partitionId: `${partitionInfo.partition_id}-right`,
        keyRange: {
          start: 'k',
          end: partitionInfo.partition_key_end,
        },
      },
    }),
  });
}

test('overlap-refused-at-registration: a split whose source key range ' +
  'overlaps a persisted in-flight transition is refused with the ' +
  'typed outcome; non-overlapping registrations pass', async (t) => {
  const usersTableRow = createDurableTableRow(
    FIXTURE_TABLE_ID,
    FIXTURE_TABLE_NAME,
  );
  const ordersTableRow = createDurableTableRow('tbl-orders', 'orders');
  const allTableRows = [usersTableRow, ordersTableRow];
  const partitionById = {
    ...createThreePartitionInfos(),
    'orders-p1': {
      partition_id: 'orders-p1',
      table_id: 'tbl-orders',
      table_name: 'orders',
      partition_key_start: null,
      partition_key_end: 'n',
      partition_version: 1,
      replica_count: 2,
      leader_node_id: 'node-a',
      size_bytes: 64,
      state: 'NORMAL',
    },
    'orders-p2': {
      partition_id: 'orders-p2',
      table_id: 'tbl-orders',
      table_name: 'orders',
      // Disjoint from every persisted range of the foreign in-flight
      // split on users-p2 (source ['m','t'), children ['m','q') and
      // ['q','t')).
      partition_key_start: 'u',
      partition_key_end: null,
      partition_version: 1,
      replica_count: 2,
      leader_node_id: 'node-a',
      size_bytes: 64,
      state: 'NORMAL',
    },
  };
  // A foreign in-flight split persisted on users-p2 ['m','t') — this
  // node never saw it (no process-local handle), only the durable
  // store carries it.
  persistForeignInFlightSplit({
    durableTableRow: usersTableRow,
    sourcePartitionId: FIXTURE_RIGHT_PARTITION_ID,
    sourceRange: {start: 'm', end: 't'},
    splitKey: 'q',
  });

  // Overlapping candidate: splitting orders-p1 [null,'n') touches the
  // persisted split's target child range ['q','t') ('q' < 'n').
  const overlapping = buildGuardedSplitWorkflow({
    tableRow: ordersTableRow,
    allTableRows,
    partitionById,
    tableId: 'tbl-orders',
  });
  let thrown = null;
  try {
    await overlapping.workflow.execute('orders-p1');
  } catch (error) {
    thrown = error;
  }
  t.equal(thrown?.message, SPLIT_OVERLAP_ERROR,
    'overlapping split registration is refused with the typed outcome');

  // Non-overlapping candidate: splitting orders-p2 ['u',null) is
  // disjoint from every persisted range and must register cleanly.
  const nonOverlapping = buildGuardedSplitWorkflow({
    tableRow: ordersTableRow,
    allTableRows,
    partitionById,
    tableId: 'tbl-orders',
  });
  let unexpected = null;
  let result = null;
  try {
    result = await nonOverlapping.workflow.execute('orders-p2');
  } catch (error) {
    unexpected = error;
  }
  t.equal(unexpected, null,
    'non-overlapping split registration is not refused');
  t.equal(result?.success, true,
    'non-overlapping split registration passes');
});

test('durable-overlap-validation: the refusal is driven by the ' +
  'durable transition rows alone — no process-local handle sees the ' +
  'in-flight transition', async (t) => {
  const durableTableRow = createDurableTableRow(
    FIXTURE_TABLE_ID,
    FIXTURE_TABLE_NAME,
  );
  const partitionInfos = createThreePartitionInfos();
  persistForeignInFlightSplit({
    durableTableRow,
    sourcePartitionId: FIXTURE_RIGHT_PARTITION_ID,
    sourceRange: {start: 'm', end: 't'},
    splitKey: 'q',
  });

  // A merge candidate [users-p1, users-p2] overlaps the persisted
  // split's source range ['m','t') at users-p2. This merge workflow
  // instance has NO process-local replication handle for that split —
  // only the durable rows prove it is in flight.
  const {workflow} = buildMergeWorkflow({
    durableTableRow,
    partitionInfos,
    parsePartitionTransition: parseDurableTransition,
  });
  t.equal(workflow.mergeReplication || null, null,
    'no process-local merge replication handle exists');
  const overlappingMerge = () => workflow.execute({
    leftPartitionId: FIXTURE_LEFT_PARTITION_ID,
    rightPartitionId: FIXTURE_RIGHT_PARTITION_ID,
  });
  let thrown = null;
  try {
    await overlappingMerge();
  } catch (error) {
    thrown = error;
  }
  t.equal(thrown?.message, MERGE_OVERLAP_ERROR,
    'merge overlapping a persisted in-flight split is refused durably');

  // Red-on-revert witness: with the guard reverted the same-table
  // already-in-progress check still refuses, but with the UNQUALIFIED
  // legacy message — the durable overlap guard owns the overlap
  // suffix on the typed refusal.
  t.ok(
    String(thrown?.message || '').endsWith(
      MANAGED_MERGE_ERROR_MSG.OVERLAPPING_TRANSITION_SUFFIX,
    ),
    'the refusal carries the overlap qualification',
  );

  // Clearing the durable rows (the transition completed elsewhere)
  // lets the same registration through — proof the durable rows, not
  // any process-local state, drive the refusal.
  durableTableRow.partition_transition_state = null;
  durableTableRow.partition_transition_metadata = null;
  const result = await workflow.execute({
    leftPartitionId: FIXTURE_LEFT_PARTITION_ID,
    rightPartitionId: FIXTURE_RIGHT_PARTITION_ID,
  });
  t.equal(result.success, true,
    'clearing the durable row admits the same registration');
});

test('restart-surviving-guard: a fresh workflow instance over the ' +
  'same durable store still refuses the overlapping registration',
async (t) => {
  const durableTableRow = createDurableTableRow(
    FIXTURE_TABLE_ID,
    FIXTURE_TABLE_NAME,
  );
  const partitionInfos = createThreePartitionInfos();
  persistForeignInFlightSplit({
    durableTableRow,
    sourcePartitionId: FIXTURE_RIGHT_PARTITION_ID,
    sourceRange: {start: 'm', end: 't'},
    splitKey: 'q',
  });

  // First process: the overlapping merge registration is refused.
  const first = buildMergeWorkflow({
    durableTableRow,
    partitionInfos,
    parsePartitionTransition: parseDurableTransition,
  });
  let firstThrown = null;
  try {
    await first.workflow.execute({
      leftPartitionId: FIXTURE_LEFT_PARTITION_ID,
      rightPartitionId: FIXTURE_RIGHT_PARTITION_ID,
    });
  } catch (error) {
    firstThrown = error;
  }
  t.equal(firstThrown?.message, MERGE_OVERLAP_ERROR,
    'first process refuses the overlapping merge');

  // Simulated restart: a FRESH workflow instance (new process-local
  // state, the same durable rows) still refuses — the guard survived
  // the restart because it consults durable transition rows.
  const restarted = buildMergeWorkflow({
    durableTableRow,
    partitionInfos,
    parsePartitionTransition: parseDurableTransition,
  });
  let restartedThrown = null;
  try {
    await restarted.workflow.execute({
      leftPartitionId: FIXTURE_LEFT_PARTITION_ID,
      rightPartitionId: FIXTURE_RIGHT_PARTITION_ID,
    });
  } catch (error) {
    restartedThrown = error;
  }
  t.equal(restartedThrown?.message, MERGE_OVERLAP_ERROR,
    'fresh instance over the same durable store still refuses');
});

test('restart-surviving-guard (split): a fresh split workflow ' +
  'instance over the same durable store still refuses a split whose ' +
  'range overlaps a persisted in-flight merge', async (t) => {
  const ordersTableRow = createDurableTableRow('tbl-orders', 'orders');
  // A foreign in-flight MERGE persisted on the orders table covering
  // ['a','n') + ['n','z') = ['a','z'); this node never drove it.
  ordersTableRow.partition_transition_state =
    PARTITION_TRANSITION_STATE.MERGE_BACKFILLING;
  ordersTableRow.partition_transition_metadata = JSON.stringify({
    [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID]:
      'merge-tbl-orders-orders-p1-orders-p2-v2',
    [PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_IDS]: [
      'orders-p1',
      'orders-p2',
    ],
    [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]: 2,
    [PARTITION_TRANSITION_METADATA_FIELD.TOPOLOGY_SNAPSHOT]: {
      sourcePartitionKeyRanges: {
        'orders-p1': {start: 'a', end: 'n'},
        'orders-p2': {start: 'n', end: 'z'},
      },
    },
  });
  const candidatePartition = {
    partition_id: 'orders-p9',
    table_id: 'tbl-orders',
    table_name: 'orders',
    partition_key_start: 'k',
    partition_key_end: 'z',
    replica_count: 2,
    leader_node_id: 'node-a',
    size_bytes: 64,
    state: 'NORMAL',
  };
  const buildFreshSplitWorkflow = () => buildWorkflow({
    durableTableRows: [ordersTableRow],
    getTableInfo: () => ordersTableRow,
    listTableInfos: () => [ordersTableRow],
    parsePartitionTransition: parseDurableTransition,
    getPartitionInfo: (partitionId) =>
      partitionId === candidatePartition.partition_id ?
        candidatePartition :
        null,
  });

  let firstThrown = null;
  try {
    await buildFreshSplitWorkflow().workflow.execute(
      candidatePartition.partition_id,
    );
  } catch (error) {
    firstThrown = error;
  }
  t.equal(firstThrown?.message, SPLIT_OVERLAP_ERROR,
    'split overlapping a persisted in-flight merge is refused');

  let restartedThrown = null;
  try {
    await buildFreshSplitWorkflow().workflow.execute(
      candidatePartition.partition_id,
    );
  } catch (error) {
    restartedThrown = error;
  }
  t.equal(restartedThrown?.message, SPLIT_OVERLAP_ERROR,
    'fresh split instance still refuses after simulated restart');
});

test('terminal durable transitions do not block registration ' +
  '(retryable states are skipped by the guard)', async (t) => {
  const usersTableRow = createDurableTableRow(
    FIXTURE_TABLE_ID,
    FIXTURE_TABLE_NAME,
  );
  const ordersTableRow = createDurableTableRow('tbl-orders', 'orders');
  const allTableRows = [usersTableRow, ordersTableRow];
  const partitionById = {
    ...createThreePartitionInfos(),
    'orders-p1': {
      partition_id: 'orders-p1',
      table_id: 'tbl-orders',
      table_name: 'orders',
      partition_key_start: null,
      partition_key_end: 'n',
      partition_version: 1,
      replica_count: 2,
      leader_node_id: 'node-a',
      size_bytes: 64,
      state: 'NORMAL',
    },
  };
  // A DEFERRED (retryable) foreign split overlaps the candidate's
  // range; the guard must skip it — a retryable row is not an
  // in-flight transition.
  persistForeignInFlightSplit({
    durableTableRow: usersTableRow,
    sourcePartitionId: FIXTURE_RIGHT_PARTITION_ID,
    sourceRange: {start: 'm', end: 't'},
    splitKey: 'q',
    state: PARTITION_TRANSITION_STATE.DEFERRED,
  });
  const {workflow} = buildGuardedSplitWorkflow({
    tableRow: ordersTableRow,
    allTableRows,
    partitionById,
    tableId: 'tbl-orders',
  });
  const result = await workflow.execute('orders-p1');
  t.equal(result.success, true,
    'retryable durable rows are skipped by the overlap guard');
});
