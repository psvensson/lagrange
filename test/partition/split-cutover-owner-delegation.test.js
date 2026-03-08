/**
 * Tests proving PartitionService.markSplitCutoverActive delegates the
 * durable cutover transition to ManagedSplitWorkflow instead of writing
 * the tables system table directly.
 *
 * Validates: Requirements 2 (single split lifecycle owner)
 * Design: §3 (ManagedSplitWorkflow owns admission through cleanup)
 *
 * Owner path verified: PartitionService → sqlQueryEngine
 *   .managedSplitWorkflow.advanceSplitPhase()
 */
import {test} from '../../src/test-helpers/tap.js';
import {EventEmitter} from 'events';
import {
  PARTITION_TRANSITION_STATE,
  PARTITION_TRANSITION_METADATA_FIELD,
} from '../../src/partition/partition-constants.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
} from '../../src/partition/partition-service-constants.js';
import {QUERY_ERROR_MSG} from '../../src/query/query-constants.js';

/**
 * Minimal PartitionService-like object that exposes only the methods
 * needed to test markSplitCutoverActive delegation. Reuses the real
 * method from the production class to avoid reimplementation.
 */
async function loadMarkSplitCutoverActive() {
  const mod = await import(
    '../../src/partition/partition-service.js'
  );
  return mod.PartitionService.prototype.markSplitCutoverActive;
}

const FIXTURE_PARTITION_ID = 'users-p1';
const FIXTURE_TABLE_ID = 'tbl-users';
const FIXTURE_WORKFLOW_ID = 'split-tbl-users-users-p1-v2';
const FIXTURE_TARGET_VERSION = 2;
const FIXTURE_TARGET_IDS = ['users-p-left', 'users-p-right'];

function buildMetadata() {
  return {
    workflowId: FIXTURE_WORKFLOW_ID,
    targetPartitionVersion: FIXTURE_TARGET_VERSION,
    targetPartitionIds: FIXTURE_TARGET_IDS,
    sourcePartitionId: FIXTURE_PARTITION_ID,
    primaryKeyColumn: 'id',
    splitKey: 'm',
  };
}

test('markSplitCutoverActive delegates to ' +
  'ManagedSplitWorkflow.advanceSplitPhase instead of writing the ' +
  'system table directly (uses ManagedSplitWorkflow as canonical ' +
  'split owner)', async (t) => {
  const markSplitCutoverActive = await loadMarkSplitCutoverActive();
  const advanceCalls = [];

  const context = {
    partitionId: FIXTURE_PARTITION_ID,
    tableId: FIXTURE_TABLE_ID,
    sqlQueryEngine: {
      managedSplitWorkflow: {
        async advanceSplitPhase(workflowId, nextPhase, phaseMetadata) {
          advanceCalls.push({workflowId, nextPhase, phaseMetadata});
        },
      },
    },
    logger: {info() {}},
  };

  await markSplitCutoverActive.call(context, buildMetadata());

  t.equal(advanceCalls.length, 1, 'must delegate exactly once');
  t.equal(
    advanceCalls[0].workflowId,
    FIXTURE_WORKFLOW_ID,
    'must pass the workflow ID from transition metadata',
  );
  t.equal(
    advanceCalls[0].nextPhase,
    PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
    'must request SPLIT_CUTOVER_ACTIVE phase',
  );
  t.ok(
    advanceCalls[0].phaseMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.CUTOVER_APPLIED_AT
    ],
    'must include cutoverAppliedAt in phase metadata',
  );
});

test('markSplitCutoverActive fails when workflow owner is not wired ' +
  '(uses ManagedSplitWorkflow as canonical split owner)', async (t) => {
  const markSplitCutoverActive = await loadMarkSplitCutoverActive();

  const context = {
    partitionId: FIXTURE_PARTITION_ID,
    tableId: FIXTURE_TABLE_ID,
    sqlQueryEngine: null,
    logger: {info() {}},
  };

  try {
    await markSplitCutoverActive.call(context, buildMetadata());
    t.fail('must throw when workflow owner is not wired');
  } catch (error) {
    t.equal(
      error.message,
      PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_STATE_REQUIRED,
      'error must indicate missing split replication state',
    );
  }
});

test('markSplitCutoverActive fails when workflowId is missing from ' +
  'metadata (uses ManagedSplitWorkflow as canonical split owner)',
async (t) => {
  const markSplitCutoverActive = await loadMarkSplitCutoverActive();

  const context = {
    partitionId: FIXTURE_PARTITION_ID,
    tableId: FIXTURE_TABLE_ID,
    sqlQueryEngine: {
      managedSplitWorkflow: {
        async advanceSplitPhase() {
          t.fail('must not call advanceSplitPhase without workflowId');
        },
      },
    },
    logger: {info() {}},
  };

  const metadataWithoutWorkflowId = {
    ...buildMetadata(),
    workflowId: null,
  };

  try {
    await markSplitCutoverActive.call(
      context,
      metadataWithoutWorkflowId,
    );
    t.fail('must throw when workflowId is missing');
  } catch (error) {
    t.equal(
      error.message,
      PARTITION_SERVICE_ERROR_MSG.SPLIT_REPLICATION_STATE_REQUIRED,
      'error must indicate missing split replication state',
    );
  }
});

test('markSplitCutoverActive does NOT write the tables system table ' +
  'directly — cdcIntegrationService.updateSystemTableRow must not be ' +
  'called (uses ManagedSplitWorkflow as canonical split owner)',
async (t) => {
  const markSplitCutoverActive = await loadMarkSplitCutoverActive();

  const context = {
    partitionId: FIXTURE_PARTITION_ID,
    tableId: FIXTURE_TABLE_ID,
    cdcIntegrationService: {
      async updateSystemTableRow() {
        t.fail(
          'PartitionService must NOT write the tables system table ' +
          'directly for cutover — this violates single-owner ' +
          '(Req 2, System Guidelines §1.4.2)',
        );
      },
    },
    sqlQueryEngine: {
      managedSplitWorkflow: {
        async advanceSplitPhase() {
          // Expected delegation path.
        },
      },
    },
    logger: {info() {}},
  };

  await markSplitCutoverActive.call(context, buildMetadata());
  t.pass(
    'cutover transition delegated to workflow owner without ' +
    'direct system table write',
  );
});
