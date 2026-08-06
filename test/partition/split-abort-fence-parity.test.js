import {test} from '../../src/test-helpers/tap.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {
  SPLIT_PARTICIPANT_PREFIX,
  SPLIT_ACK_STATUS,
} from '../../src/partition/split-ack-constants.js';
import {
  PARTICIPANT_ACK_FIELD,
} from '../../src/workflow/workflow-constants.js';
import {
  buildWorkflow,
} from './managed-split-workflow-test-helpers.js';

const WORKFLOW_ID = 'split-abort-fence-parity';
const SOURCE_PARTITION_ID = 'users-p1';

function buildAbortingRecord() {
  return {
    workflowId: WORKFLOW_ID,
    ownerKey: SOURCE_PARTITION_ID,
    tableId: 'tbl-users',
    tableName: 'users',
    partitionId: SOURCE_PARTITION_ID,
    status: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
    metadata: {
      [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID]: WORKFLOW_ID,
      [PARTITION_TRANSITION_METADATA_FIELD.PRIMARY_KEY_COLUMN]: 'id',
      [PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID]:
        SOURCE_PARTITION_ID,
      [PARTITION_TRANSITION_METADATA_FIELD.SPLIT_KEY]: 'm',
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS]: [
        'users-p-left',
        'users-p-right',
      ],
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]: 2,
    },
    createdAt: 1000,
    updatedAt: 1000,
    participants: new Map(),
  };
}

async function registerClaimedWorkflow(workflow) {
  const record = buildAbortingRecord();
  await workflow.workflowCoordinator.registerWorkflow(record);
  const ownershipClaim = await workflow.claimSplitWorkflowOwnership(
    WORKFLOW_ID,
  );
  workflow.ensureCanonicalSplitParticipants(WORKFLOW_ID, record.metadata);
  return ownershipClaim.workflow.fenceToken;
}

async function driveSourceFailureAck(workflow, fenceToken) {
  await workflow.acknowledgeSourceParticipant(WORKFLOW_ID, {
    [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]:
      SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
    [PARTICIPANT_ACK_FIELD.STATUS]: SPLIT_ACK_STATUS.SNAPSHOT_FAILED,
    [PARTICIPANT_ACK_FIELD.FENCE_TOKEN]: fenceToken,
    [PARTICIPANT_ACK_FIELD.ACKNOWLEDGED_AT]: 1001,
  });
  // The abort is FIFO-serialized on the owner lane (deliberately not
  // awaited by the ack path): flush the lane so the abort lands.
  await workflow.runSerializedOwnerStep(
    SOURCE_PARTITION_ID,
    async () => null,
  );
}

test('abort-transition-fenced: the split abort persists FAILED through ' +
'the fenced transition path — the durable row carries the renewed ' +
'fence/owner triple, not fenceToken: null', async (t) => {
  const {workflow, durableRow} = buildWorkflow({});
  await registerClaimedWorkflow(workflow);

  await driveSourceFailureAck(
    workflow,
    workflow.workflowCoordinator.getWorkflowById(WORKFLOW_ID).fenceToken,
  );

  const abortedWorkflow =
    workflow.workflowCoordinator.getWorkflowById(WORKFLOW_ID);
  t.equal(
    abortedWorkflow.status,
    PARTITION_TRANSITION_STATE.FAILED,
    'the fenced abort persisted the FAILED status',
  );
  t.equal(
    durableRow.partition_transition_state,
    PARTITION_TRANSITION_STATE.FAILED,
    'the durable row carries the FAILED transition',
  );
  t.equal(
    durableRow.pending_partition_version,
    null,
    'the abort withdraws the pending epoch in the same mutation',
  );
  const persisted = JSON.parse(durableRow.partition_transition_metadata);
  t.equal(
    persisted[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_FENCE_TOKEN],
    abortedWorkflow.fenceToken,
    'the durable abort row carries the claim fence token (never null)',
  );
  t.equal(
    persisted[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_OWNER_ID],
    workflow.workflowOwnerId,
    'the durable abort row carries the owner identity',
  );
  const transitionHistory = abortedWorkflow.transitionHistory || [];
  const abortEntry = transitionHistory.find((entry) =>
    entry.nextStep === PARTITION_TRANSITION_STATE.FAILED);
  t.ok(abortEntry, 'the abort transition is recorded in the history');
  t.equal(
    abortEntry.fenceToken,
    abortedWorkflow.fenceToken,
    'the abort history entry is fence-stamped like every other ' +
    'transition',
  );
});

test('abort-dissolution-acks-fenced: the post-abort owner-recorded ' +
'teardown path runs under the same claim fence (abort children torn ' +
'down fence-stamped through F14 dissolution acks)', async (t) => {
  const removedReplicas = [];
  const {workflow} = buildWorkflow({
    listPartitionServiceRows: (partitionId) => ([
      {replica_id: `${partitionId}-r1`, node_id: 'node-a'},
    ]),
    deliverReplicaRemoval: async (request) => {
      removedReplicas.push(request.message);
      return {status: 'initiated'};
    },
  });
  const fenceToken = await registerClaimedWorkflow(workflow);

  await driveSourceFailureAck(workflow, fenceToken);

  t.equal(
    removedReplicas.length,
    2,
    'the abort tears down both never-authoritative children',
  );
  const abortedWorkflow =
    workflow.workflowCoordinator.getWorkflowById(WORKFLOW_ID);
  t.equal(
    abortedWorkflow.fenceToken,
    fenceToken,
    'the workflow fence is unchanged by the abort+teardown lane — the ' +
    'teardown acks stamp against the same claim fence',
  );
});

test('cross-process-abort-cutover-exclusion: a stale-fenced abort ' +
'transition write is rejected by the storage-backed fence assert — a ' +
'superseded owner cannot interleave an abort with a fenced cutover',
async (t) => {
  const {workflow, durableRow} = buildWorkflow({});
  const record = buildAbortingRecord();
  await workflow.workflowCoordinator.registerWorkflow(record);
  const claim = await workflow.claimSplitWorkflowOwnership(WORKFLOW_ID);
  const supersededFence = claim.workflow.fenceToken;

  // The fence advances (a renewed claim by the current owner mints the
  // next epoch), leaving the old fence superseded.
  const renewedClaim = await workflow.claimSplitWorkflowOwnership(
    WORKFLOW_ID,
  );
  t.equal(
    renewedClaim.workflow.fenceToken,
    supersededFence + 1,
    'the renewed claim advances the fence epoch',
  );

  // An abort transition stamped with the superseded fence must be
  // rejected by the storage-backed assertTransitionFence: the live
  // workflow and the durable row stay at the pre-abort phase.
  let fenceError = null;
  try {
    await workflow.workflowCoordinator.transitionStep(
      WORKFLOW_ID,
      {
        nextStep: PARTITION_TRANSITION_STATE.FAILED,
        reason: PARTITION_TRANSITION_STATE.FAILED,
        fenceToken: supersededFence,
        ownerId: workflow.workflowOwnerId,
      },
      {status: PARTITION_TRANSITION_STATE.FAILED},
    );
  } catch (error) {
    fenceError = error;
  }
  t.ok(
    fenceError,
    'the stale-fenced abort transition write is rejected',
  );
  const liveWorkflow =
    workflow.workflowCoordinator.getWorkflowById(WORKFLOW_ID);
  t.equal(
    liveWorkflow.status,
    PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
    'the rejected abort never mutated the live workflow',
  );
  t.equal(
    durableRow.partition_transition_state,
    PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
    'the rejected abort never persisted to the durable row',
  );
  t.equal(
    liveWorkflow.fenceToken,
    supersededFence + 1,
    'the fence epoch is untouched by the rejected write',
  );
});

test('cross-process-abort-cutover-exclusion: the abort step carries the ' +
'renewed fence through buildSplitAbortStepResult, so a queued abort ' +
'executing after a fence advance is fence-rejected at persist',
async (t) => {
  const {workflow} = buildWorkflow({});
  const record = buildAbortingRecord();
  await workflow.workflowCoordinator.registerWorkflow(record);
  const claim = await workflow.claimSplitWorkflowOwnership(WORKFLOW_ID);
  const supersededFence = claim.workflow.fenceToken;

  // The abort step result built with the superseded ownership stamps
  // the transition exactly like the phase-advance path (nextStep +
  // fenceToken + ownerId): handing it to the coordinator AFTER the
  // fence advanced must reject — this is the abort/cutover interleave
  // the F18 residual closes.
  const abortStepResult = workflow.buildSplitAbortStepResult(
    WORKFLOW_ID,
    SPLIT_ACK_STATUS.SNAPSHOT_FAILED,
    workflow.workflowCoordinator.getWorkflowById(WORKFLOW_ID),
    {ownership: {fenceToken: supersededFence,
      ownerId: workflow.workflowOwnerId}},
  );
  t.equal(
    abortStepResult.nextStep,
    PARTITION_TRANSITION_STATE.FAILED,
    'the abort step result drives the FAILED transition',
  );
  t.equal(
    abortStepResult.fenceToken,
    supersededFence,
    'the abort step result carries the claim fence token',
  );
  t.equal(
    abortStepResult.ownerId,
    workflow.workflowOwnerId,
    'the abort step result carries the owner identity',
  );

  await workflow.claimSplitWorkflowOwnership(WORKFLOW_ID);
  let fenceError = null;
  try {
    await workflow.workflowCoordinator.transitionStep(
      WORKFLOW_ID,
      {
        nextStep: abortStepResult.nextStep,
        reason: abortStepResult.reason,
        fenceToken: abortStepResult.fenceToken,
        ownerId: abortStepResult.ownerId,
      },
      abortStepResult.updates,
    );
  } catch (error) {
    fenceError = error;
  }
  t.ok(
    fenceError,
    'the queued abort is fence-rejected once the fence has advanced',
  );
  t.equal(
    workflow.workflowCoordinator.getWorkflowById(WORKFLOW_ID).status,
    PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
    'the rejected abort never landed',
  );
});
