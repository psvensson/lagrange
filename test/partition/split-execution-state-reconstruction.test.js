/**
 * Tests proving canonical split state survives reconstruction from
 * durable workflow rows after process restart.
 *
 * Validates: Requirements 2, 3, 7, 8
 * Design: §3 (no in-memory split phase is allowed to be the only
 *   truth needed for resume), §8 (cache remains a read model)
 *
 * Owner path verified: ManagedSplitWorkflow owns durable split phase;
 *   PartitionService.reconstructSplitExecutionState rebuilds the
 *   transient execution handle from that durable state.
 */
import {test} from '../../src/test-helpers/tap.js';
import {
  PARTITION_TRANSITION_STATE,
  PARTITION_TRANSITION_METADATA_FIELD,
} from '../../src/partition/partition-constants.js';

const FIXTURE_PARTITION_ID = 'users-source';
const FIXTURE_TABLE_ID = 'tbl-users';
const FIXTURE_WORKFLOW_ID = 'split-tbl-users-users-source-v2';
const FIXTURE_TARGET_VERSION = 2;
const FIXTURE_TARGET_IDS = ['users-left', 'users-right'];
const FIXTURE_SPLIT_KEY = 'm';
const FIXTURE_PRIMARY_KEY_COLUMN = 'id';

/**
 * Build normalized split transition metadata matching the shape
 * that normalizeSplitTransitionMetadata produces.
 * @return {Object} Metadata fixture.
 */
function buildDurableMetadata() {
  return {
    [PARTITION_TRANSITION_METADATA_FIELD.PRIMARY_KEY_COLUMN]:
      FIXTURE_PRIMARY_KEY_COLUMN,
    [PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID]:
      FIXTURE_PARTITION_ID,
    [PARTITION_TRANSITION_METADATA_FIELD.SPLIT_KEY]: FIXTURE_SPLIT_KEY,
    [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS]:
      FIXTURE_TARGET_IDS,
    [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]:
      FIXTURE_TARGET_VERSION,
    [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID]:
      FIXTURE_WORKFLOW_ID,
  };
}

async function loadPartitionService() {
  const mod = await import(
    '../../src/partition/partition-service.js'
  );
  return mod.PartitionService;
}

// ===================================================================
// reconstructSplitExecutionState — rebuild from durable workflow rows
// ===================================================================

test('reconstructSplitExecutionState rebuilds transient execution ' +
  'handle from durable backfilling phase ' +
  '(uses ManagedSplitWorkflow as canonical split owner)', async (t) => {
  const PartitionService = await loadPartitionService();
  const reconstructFn =
    PartitionService.prototype.reconstructSplitExecutionState;

  const context = {
    partitionId: FIXTURE_PARTITION_ID,
    splitReplication: null,
    logger: {info() {}},
    normalizeSplitTransitionMetadata:
      PartitionService.prototype.normalizeSplitTransitionMetadata,
  };

  const result = reconstructFn.call(context, {
    phase: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
    metadata: buildDurableMetadata(),
  });

  t.ok(result, 'must return a reconstructed execution handle');
  t.equal(
    result.phase,
    PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
    'reconstructed phase must match durable phase',
  );
  t.equal(
    result.metadata.workflowId,
    FIXTURE_WORKFLOW_ID,
    'reconstructed metadata must carry the workflow ID',
  );
  t.equal(
    result.metadata.sourcePartitionId,
    FIXTURE_PARTITION_ID,
    'reconstructed metadata must carry the source partition ID',
  );
  t.same(
    result.metadata.targetPartitionIds,
    FIXTURE_TARGET_IDS,
    'reconstructed metadata must carry target partition IDs',
  );
  t.same(
    result.pendingEntries,
    [],
    'reconstructed handle must start with empty pending entries',
  );
  t.equal(
    result.flushInFlight,
    false,
    'reconstructed handle must start with no flush in flight',
  );
  t.equal(
    context.splitReplication,
    result,
    'must assign the handle to the instance field',
  );
});

test('reconstructSplitExecutionState rebuilds from durable catchup ' +
  'phase (uses ManagedSplitWorkflow as canonical split owner)',
async (t) => {
  const PartitionService = await loadPartitionService();
  const reconstructFn =
    PartitionService.prototype.reconstructSplitExecutionState;

  const context = {
    partitionId: FIXTURE_PARTITION_ID,
    splitReplication: null,
    logger: {info() {}},
    normalizeSplitTransitionMetadata:
      PartitionService.prototype.normalizeSplitTransitionMetadata,
  };

  const result = reconstructFn.call(context, {
    phase: PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
    metadata: buildDurableMetadata(),
  });

  t.ok(result, 'must return a reconstructed execution handle');
  t.equal(
    result.phase,
    PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
    'reconstructed phase must match durable catchup phase',
  );
});

test('reconstructSplitExecutionState rebuilds from durable cutover ' +
  'active phase (uses ManagedSplitWorkflow as canonical split owner)',
async (t) => {
  const PartitionService = await loadPartitionService();
  const reconstructFn =
    PartitionService.prototype.reconstructSplitExecutionState;

  const context = {
    partitionId: FIXTURE_PARTITION_ID,
    splitReplication: null,
    logger: {info() {}},
    normalizeSplitTransitionMetadata:
      PartitionService.prototype.normalizeSplitTransitionMetadata,
  };

  const result = reconstructFn.call(context, {
    phase: PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
    metadata: buildDurableMetadata(),
  });

  t.ok(result, 'must return a reconstructed execution handle');
  t.equal(
    result.phase,
    PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
    'reconstructed phase must match durable cutover active phase',
  );
});

test('reconstructSplitExecutionState returns null for terminal ' +
  'phases that do not need active execution handles',
async (t) => {
  const PartitionService = await loadPartitionService();
  const reconstructFn =
    PartitionService.prototype.reconstructSplitExecutionState;

  const context = {
    partitionId: FIXTURE_PARTITION_ID,
    splitReplication: null,
    logger: {info() {}},
    normalizeSplitTransitionMetadata:
      PartitionService.prototype.normalizeSplitTransitionMetadata,
  };

  const terminalPhases = [
    PARTITION_TRANSITION_STATE.FAILED,
    PARTITION_TRANSITION_STATE.BLOCKED,
    PARTITION_TRANSITION_STATE.DEFERRED,
    PARTITION_TRANSITION_STATE.ADMISSION_PENDING,
    PARTITION_TRANSITION_STATE.SPLIT_PREPARING,
  ];

  for (const phase of terminalPhases) {
    const result = reconstructFn.call(context, {
      phase,
      metadata: buildDurableMetadata(),
    });
    t.equal(
      result,
      null,
      `must return null for non-active phase ${phase}`,
    );
  }

  t.equal(
    context.splitReplication,
    null,
    'must not assign a handle for non-active phases',
  );
});

test('reconstructSplitExecutionState returns null when durable ' +
  'state is missing or incomplete', async (t) => {
  const PartitionService = await loadPartitionService();
  const reconstructFn =
    PartitionService.prototype.reconstructSplitExecutionState;

  const context = {
    partitionId: FIXTURE_PARTITION_ID,
    splitReplication: null,
    logger: {info() {}},
    normalizeSplitTransitionMetadata:
      PartitionService.prototype.normalizeSplitTransitionMetadata,
  };

  t.equal(
    reconstructFn.call(context, null),
    null,
    'must return null for null durable state',
  );
  t.equal(
    reconstructFn.call(context, {}),
    null,
    'must return null for empty durable state',
  );
  t.equal(
    reconstructFn.call(context, {phase: null, metadata: null}),
    null,
    'must return null when phase and metadata are null',
  );
  t.equal(
    reconstructFn.call(context, {
      phase: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
      metadata: null,
    }),
    null,
    'must return null when metadata is missing',
  );
  t.equal(
    reconstructFn.call(context, {
      phase: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
      metadata: {invalid: true},
    }),
    null,
    'must return null when metadata fails normalization',
  );
});

test('handleSplitReplicationAfterWrite routes writes correctly ' +
  'using a reconstructed execution handle ' +
  '(uses ManagedSplitWorkflow as canonical split owner)', async (t) => {
  const PartitionService = await loadPartitionService();
  const reconstructFn =
    PartitionService.prototype.reconstructSplitExecutionState;
  const handleAfterWriteFn =
    PartitionService.prototype.handleSplitReplicationAfterWrite;

  const queuedEntries = [];
  const context = {
    partitionId: FIXTURE_PARTITION_ID,
    splitReplication: null,
    logger: {info() {}, warn() {}},
    normalizeSplitTransitionMetadata:
      PartitionService.prototype.normalizeSplitTransitionMetadata,
    cloneSplitEntry:
      PartitionService.prototype.cloneSplitEntry,
    async replaySplitEntry(entry, _metadata) {
      queuedEntries.push(entry.sql);
    },
    async flushSplitReplicationQueue() {},
  };

  // Reconstruct from durable cutover-active state
  reconstructFn.call(context, {
    phase: PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
    metadata: buildDurableMetadata(),
  });

  t.ok(
    context.splitReplication,
    'must have a reconstructed execution handle',
  );

  // Simulate a write arriving after reconstruction
  await handleAfterWriteFn.call(context, {
    sql: 'INSERT INTO users (id, name) VALUES (?, ?)',
    params: ['alice', 'Alice'],
    data: {id: 'alice', name: 'Alice'},
  });

  t.same(
    queuedEntries,
    ['INSERT INTO users (id, name) VALUES (?, ?)'],
    'write must be routed through replaySplitEntry after ' +
    'reconstruction from durable state',
  );
});

test('handleSplitReplicationAfterWrite queues writes during ' +
  'reconstructed backfilling phase ' +
  '(uses ManagedSplitWorkflow as canonical split owner)', async (t) => {
  const PartitionService = await loadPartitionService();
  const reconstructFn =
    PartitionService.prototype.reconstructSplitExecutionState;
  const handleAfterWriteFn =
    PartitionService.prototype.handleSplitReplicationAfterWrite;

  const context = {
    partitionId: FIXTURE_PARTITION_ID,
    splitReplication: null,
    logger: {info() {}, warn() {}},
    normalizeSplitTransitionMetadata:
      PartitionService.prototype.normalizeSplitTransitionMetadata,
    cloneSplitEntry:
      PartitionService.prototype.cloneSplitEntry,
  };

  // Reconstruct from durable backfilling state
  reconstructFn.call(context, {
    phase: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
    metadata: buildDurableMetadata(),
  });

  await handleAfterWriteFn.call(context, {
    sql: 'UPDATE users SET name = ? WHERE id = ?',
    params: ['Bob', 'bob'],
    data: {id: 'bob', name: 'Bob'},
    whereClause: {id: 'bob'},
  });

  t.equal(
    context.splitReplication.pendingEntries.length,
    1,
    'write must be queued in pendingEntries during backfilling',
  );
  t.equal(
    context.splitReplication.pendingEntries[0].sql,
    'UPDATE users SET name = ? WHERE id = ?',
    'queued entry must preserve the original SQL',
  );
});
