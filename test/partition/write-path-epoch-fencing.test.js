// Regression tests for the write-path-epoch-fencing quest: the QUERY
// payload carries expectedPartitionVersion, handleRemoteQuery rejects a
// stale-epoch write with a typed outcome, and descriptor-epoch evidence
// gaps defer (pre-cutover) or fail closed (post-cutover) instead of
// skipping validation.
//
// Each test was verified red-on-revert against the mechanism it pins.

import {test} from 'node:test';
import assert from 'node:assert/strict';

import {
  QUERY_ERROR_CODE,
} from '../../src/query/query-constants.js';
import {
  createDefaultPartitionRequestBuilder,
} from '../../src/query/query-executor-partition-request-builders.js';
import {
  PartitionService,
} from '../../src/partition/partition-service.js';
import {
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
} from '../../src/partition/partition-service-constants.js';
import {
  assertSplitRoutingDescriptorEpoch,
} from '../../src/partition/partition-split-routing.js';
import {
  assertMergeRoutingDescriptorEpochForService,
} from '../../src/partition/partition-service-merge-replication-state.js';
import {
  RAFT_ROLE,
} from '../../src/raft/constants.js';

const FIXTURE_PARTITION_ID = 'users-p1';

function buildLogger() {
  return {info() {}, warn() {}, error() {}, debug() {}};
}

function buildBoundaryContext(overrides = {}) {
  const proto = PartitionService.prototype;
  return {
    partitionId: FIXTURE_PARTITION_ID,
    tableId: 'tbl-users',
    tableName: 'users',
    role: RAFT_ROLE.LEADER,
    logger: buildLogger(),
    splitReplication: null,
    mergeReplication: null,
    systemTableCache: {
      get: () => ({table_id: 'tbl-users', active_partition_version: 3}),
    },
    isWriteQuery: () => true,
    resolveLeaderAddress: () => null,
    rejectStalePartitionEpochWrite: proto.rejectStalePartitionEpochWrite,
    resolveLocalActivePartitionVersion:
      proto.resolveLocalActivePartitionVersion,
    resolveEpochEvidenceGapOutcome: proto.resolveEpochEvidenceGapOutcome,
    ...overrides,
  };
}

// ── Receipt 1: payload carries the expected partition version ───────

test('the default QUERY request builder carries ' +
  'expectedPartitionVersion from execution options', () => {
  const buildRequest = createDefaultPartitionRequestBuilder({
    executionOptions: {expectedPartitionVersion: 7},
    params: [],
    sql: 'INSERT INTO users VALUES (?)',
  });
  assert.equal(buildRequest().expectedPartitionVersion, 7);

  // Absent/invalid expectations are never fabricated onto the wire.
  const noEpoch = createDefaultPartitionRequestBuilder({
    executionOptions: {},
    params: [],
    sql: 'SELECT 1',
  });
  assert.equal(
    Object.hasOwn(noEpoch(), 'expectedPartitionVersion'),
    false,
  );
});

// ── Receipt 2: stale-epoch write rejected at the boundary ───────────

test('handleRemoteQuery rejects a write whose expected epoch ' +
  'mismatches the locally authoritative epoch with a typed outcome',
async () => {
  const proto = PartitionService.prototype;
  const context = buildBoundaryContext();
  const result = await proto.handleRemoteQuery.call(context, {
    sql: 'INSERT INTO users VALUES (?)',
    params: [1],
    expectedPartitionVersion: 2,
  });
  assert.equal(result.success, false);
  assert.equal(
    result.errorCode,
    QUERY_ERROR_CODE.STALE_PARTITION_EPOCH,
  );
  assert.equal(
    result.error,
    PARTITION_SERVICE_ERROR_MSG.STALE_PARTITION_EPOCH_WRITE,
  );
});

test('handleRemoteQuery admits a write whose expected epoch matches ' +
  'the locally authoritative epoch', async () => {
  const proto = PartitionService.prototype;
  const executed = [];
  const context = buildBoundaryContext({
    async executeQuery(sql) {
      executed.push(sql);
      return {success: true, rows: [], changes: 1};
    },
    buildRemoteReadAuthorityWitness: () => null,
  });
  const result = await proto.handleRemoteQuery.call(context, {
    sql: 'INSERT INTO users VALUES (?)',
    params: [1],
    expectedPartitionVersion: 3,
  });
  assert.equal(result.success, true);
  assert.equal(executed.length, 1, 'the write must execute');
});

// ── Receipt 3: pre-cutover evidence gap defers ──────────────────────

test('a cold-cache evidence gap during an in-flight pre-cutover ' +
  'mirror defers instead of skipping validation', () => {
  // Split routing assert: defer-tagged throw, never silent null.
  assert.throws(
    () => assertSplitRoutingDescriptorEpoch(
      {targetPartitionVersion: 2},
      {descriptorEpochEvidence: null, evidenceGapDefers: true},
    ),
    (error) => error.deferRetry === true,
    'pre-cutover gap must defer with a typed retry signal',
  );

  // Service wrapper on a backfilling split mirror.
  const splitService = {
    splitReplication: {phase: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING},
    resolveSplitDescriptorEpochEvidence: () => null,
  };
  assert.throws(
    () => assertSplitRoutingDescriptorEpoch(
      {targetPartitionVersion: 2},
      {
        descriptorEpochEvidence:
          splitService.resolveSplitDescriptorEpochEvidence(),
        evidenceGapDefers: Boolean(splitService.splitReplication),
        evidenceGapFailsClosed:
          splitService.splitReplication.phase ===
            PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
      },
    ),
    (error) => error.deferRetry === true,
  );

  // Merge service wrapper on a catching-up merge mirror.
  const mergeService = {
    mergeReplication: {phase: PARTITION_TRANSITION_STATE.MERGE_CATCHUP},
    systemTableCache: {get: () => null},
  };
  assert.throws(
    () => assertMergeRoutingDescriptorEpochForService(
      mergeService,
      {targetPartitionId: 'merged', targetPartitionVersion: 2},
    ),
    (error) => error.deferRetry === true,
    'merge pre-cutover gap must defer',
  );

  // The boundary itself: a write carrying an epoch expectation against
  // a cold cache defers pre-cutover.
  const context = buildBoundaryContext({
    systemTableCache: {get: () => null},
    splitReplication: {phase: PARTITION_TRANSITION_STATE.SPLIT_CATCHUP},
  });
  const outcome = PartitionService.prototype.resolveEpochEvidenceGapOutcome
    .call(context, 3);
  assert.equal(outcome.success, false);
  assert.equal(outcome.deferRetry, true);
  assert.equal(
    outcome.errorCode,
    QUERY_ERROR_CODE.PARTITION_EPOCH_EVIDENCE_DEFERRED,
  );
});

// ── Receipt 4: post-cutover evidence gap fails closed ───────────────

test('a cold-cache evidence gap post-cutover fails closed — never ' +
  'fail-open', () => {
  // Split routing assert: hard throw, no defer tag.
  assert.throws(
    () => assertSplitRoutingDescriptorEpoch(
      {targetPartitionVersion: 2},
      {descriptorEpochEvidence: null, evidenceGapFailsClosed: true},
    ),
    (error) => error.deferRetry !== true,
    'post-cutover gap must fail closed',
  );

  // Merge service wrapper on a cutover-active merge mirror.
  const mergeService = {
    mergeReplication: {
      phase: PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE,
    },
    systemTableCache: {get: () => null},
  };
  assert.throws(
    () => assertMergeRoutingDescriptorEpochForService(
      mergeService,
      {targetPartitionId: 'merged', targetPartitionVersion: 2},
    ),
    (error) => error.deferRetry !== true,
  );

  // The boundary itself: post-cutover the write is rejected, not
  // deferred.
  const context = buildBoundaryContext({
    systemTableCache: {get: () => null},
    splitReplication: {
      phase: PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
    },
  });
  const outcome = PartitionService.prototype.resolveEpochEvidenceGapOutcome
    .call(context, 3);
  assert.equal(outcome.success, false);
  assert.equal(outcome.deferRetry, undefined);
  assert.equal(
    outcome.errorCode,
    QUERY_ERROR_CODE.STALE_PARTITION_EPOCH,
  );

  // No mirror in flight and no expectation: the legacy no-op path is
  // preserved (nothing to fence).
  assert.equal(
    assertSplitRoutingDescriptorEpoch(
      {targetPartitionVersion: 2},
      {descriptorEpochEvidence: null},
    ),
    null,
  );
});
