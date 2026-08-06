import {test} from '../../src/test-helpers/tap.js';
import {TABLES} from '../../src/constants/index.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {
  PARTICIPANT_ACK_FIELD,
  PARTICIPANT_ACK_RESULT,
} from '../../src/workflow/workflow-constants.js';
import {
  SPLIT_ACK_STATUS,
  SPLIT_PARTICIPANT_PREFIX,
} from '../../src/partition/split-ack-constants.js';
import {
  buildWorkflow,
} from './managed-split-workflow-test-helpers.js';

function buildFencedRecord(workflowId) {
  return {
    workflowId,
    ownerKey: 'users-p1',
    tableId: 'tbl-users',
    tableName: 'users',
    partitionId: 'users-p1',
    status: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
    metadata: {
      [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID]: workflowId,
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]: 2,
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS]: [
        'users-p-left',
        'users-p-right',
      ],
    },
    createdAt: 1000,
    updatedAt: 1000,
    participants: new Map(),
  };
}

test('split coordinator claims durable ownership through the claim ' +
  'machinery (coordinator-claim-wiring)', async (t) => {
  const {workflow, durableRow} = buildWorkflow({});
  const record = buildFencedRecord('split-claim-wiring');
  await workflow.workflowCoordinator.registerWorkflow(record);

  const claim = await workflow.claimSplitWorkflowOwnership(
    record.workflowId,
  );
  t.equal(claim.accepted, true, 'the claim must be accepted');
  t.ok(
    Number.isInteger(claim.workflow.fenceToken),
    'the claim mints a fence epoch',
  );
  t.equal(
    claim.workflow.workflowOwnerId,
    workflow.workflowOwnerId,
    'the claim records this owner identity',
  );

  // The claim is DURABLE: the tables transition row metadata carries the
  // fencing triple, so a recovering node observes owner + epoch + lease.
  const persisted = JSON.parse(
    durableRow.partition_transition_metadata,
  );
  t.equal(
    persisted[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_FENCE_TOKEN],
    claim.workflow.fenceToken,
    'the durable row carries the fence epoch',
  );
  t.equal(
    persisted[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_OWNER_ID],
    workflow.workflowOwnerId,
    'the durable row carries the owner identity',
  );
  t.ok(
    Number.isFinite(
      persisted[
        PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_LEASE_EXPIRES_AT
      ],
    ),
    'the durable row carries the lease expiry',
  );
});

test('split source ack carries the workflow fence token ' +
  '(fenced-source-ack)', async (t) => {
  const {workflow} = buildWorkflow({});
  const record = buildFencedRecord('split-fenced-ack');
  await workflow.workflowCoordinator.registerWorkflow(record);
  const claim = await workflow.claimSplitWorkflowOwnership(
    record.workflowId,
  );
  workflow.ensureCanonicalSplitParticipants(
    record.workflowId,
    record.metadata,
  );
  const fenceToken = claim.workflow.fenceToken;

  const ackResult = await workflow.acknowledgeSourceParticipant(
    record.workflowId,
    {
      [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]:
        SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
      [PARTICIPANT_ACK_FIELD.STATUS]: SPLIT_ACK_STATUS.SNAPSHOT_STARTED,
      [PARTICIPANT_ACK_FIELD.FENCE_TOKEN]: fenceToken,
      [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: 1000,
    },
  );
  t.equal(
    ackResult.result,
    PARTICIPANT_ACK_RESULT.ACCEPTED,
    'an ack stamped with the current fence epoch is accepted',
  );
  const participant = workflow.workflowCoordinator
    .getWorkflowById(record.workflowId)
    .participants.get(SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION);
  t.equal(
    participant.fenceToken,
    fenceToken,
    'the participant record advances to the acknowledged fence epoch',
  );
});

test('split stale-fenced source ack is rejected with a typed outcome ' +
  'and never drives a cutover (stale-fence-ack-rejected)', async (t) => {
  const {workflow, updateCalls} = buildWorkflow({});
  const record = buildFencedRecord('split-stale-fence');
  await workflow.workflowCoordinator.registerWorkflow(record);
  const claim = await workflow.claimSplitWorkflowOwnership(
    record.workflowId,
  );
  workflow.ensureCanonicalSplitParticipants(
    record.workflowId,
    record.metadata,
  );
  const fenceToken = claim.workflow.fenceToken;

  // Advance the source to catchup_ready at the current epoch.
  for (const status of [
    SPLIT_ACK_STATUS.SNAPSHOT_STARTED,
    SPLIT_ACK_STATUS.CATCHUP_READY,
  ]) {
    await workflow.acknowledgeSourceParticipant(record.workflowId, {
      [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]:
        SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
      [PARTICIPANT_ACK_FIELD.STATUS]: status,
      [PARTICIPANT_ACK_FIELD.FENCE_TOKEN]: fenceToken,
      [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: 1000,
    });
  }

  // A superseded owner epoch's ack (older fence) must be rejected typed,
  // and must NOT drive another cutover/abort reaction.
  const staleResult = await workflow.acknowledgeSourceParticipant(
    record.workflowId,
    {
      [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]:
        SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
      [PARTICIPANT_ACK_FIELD.STATUS]: SPLIT_ACK_STATUS.CATCHUP_READY,
      [PARTICIPANT_ACK_FIELD.FENCE_TOKEN]: fenceToken - 1,
      [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: 1001,
    },
  );
  t.equal(
    staleResult.result,
    PARTICIPANT_ACK_RESULT.STALE_FENCE,
    'a stale-fenced ack is rejected with the typed STALE_FENCE outcome',
  );
  t.equal(
    staleResult.splitCutoverApplied,
    false,
    'a stale ack never drives a cutover reaction',
  );
  const cutoverWrites = updateCalls.filter((entry) =>
    entry.tableName === TABLES.TABLES &&
    entry.data.partition_transition_state ===
      PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
  );
  t.equal(
    cutoverWrites.length,
    1,
    'only the legitimate fenced cutover landed — the stale ack added none',
  );
});

test('split out-of-graph source ack transition is rejected typed ' +
  '(participant-transition-graph)', async (t) => {
  const {workflow} = buildWorkflow({});
  const record = buildFencedRecord('split-graph');
  await workflow.workflowCoordinator.registerWorkflow(record);
  const claim = await workflow.claimSplitWorkflowOwnership(
    record.workflowId,
  );
  workflow.ensureCanonicalSplitParticipants(
    record.workflowId,
    record.metadata,
  );

  // cleanup_completed from the initial (null) state is not a declared
  // graph edge — the source must start before it can clean up.
  const invalidResult = await workflow.acknowledgeSourceParticipant(
    record.workflowId,
    {
      [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]:
        SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
      [PARTICIPANT_ACK_FIELD.STATUS]: SPLIT_ACK_STATUS.CLEANUP_COMPLETED,
      [PARTICIPANT_ACK_FIELD.FENCE_TOKEN]: claim.workflow.fenceToken,
      [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: 1000,
    },
  );
  t.equal(
    invalidResult.result,
    PARTICIPANT_ACK_RESULT.INVALID_TRANSITION,
    'an out-of-graph transition is rejected with the typed ' +
    'INVALID_TRANSITION outcome',
  );
  const participant = workflow.workflowCoordinator
    .getWorkflowById(record.workflowId)
    .participants.get(SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION);
  t.equal(
    participant.status,
    null,
    'the out-of-graph ack never mutated the participant status',
  );
});
