import {test} from '../../src/test-helpers/tap.js';
import {
  MANAGED_SPLIT_LOG_MSG,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {
  SPLIT_ACK_CHECKPOINT_FIELD,
  SPLIT_PARTICIPANT_PREFIX,
  SPLIT_ACK_STATUS,
} from '../../src/partition/split-ack-constants.js';
import {
  buildWorkflow,
} from './managed-split-workflow-test-helpers.js';

const WORKFLOW_ID = 'split-dissolution-durable-proof';
const SOURCE_PARTITION_ID = 'users-p1';

function buildDissolutionWorkflow(options = {}) {
  return buildWorkflow({
    listTablePartitionRows: () => [
      {partition_id: SOURCE_PARTITION_ID, partition_version: 1,
        state: 'NORMAL'},
      {partition_id: 'users-p-left', partition_version: 2, state: 'NORMAL'},
      {partition_id: 'users-p-right', partition_version: 2, state: 'NORMAL'},
    ],
    listPartitionServiceRows: (partitionId) => ([
      {replica_id: `${partitionId}-r1`, node_id: 'node-a'},
    ]),
    deliverReplicaRemoval: async () => ({status: 'initiated'}),
    ...options,
  });
}

function buildDissolvingRecord(fenceToken) {
  return {
    workflowId: WORKFLOW_ID,
    ownerKey: SOURCE_PARTITION_ID,
    tableId: 'tbl-users',
    tableName: 'users',
    partitionId: SOURCE_PARTITION_ID,
    status: PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
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
    participants: new Map([
      [SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION, {
        status: SPLIT_ACK_STATUS.CLEANUP_COMPLETED,
        acknowledgedAt: 999,
        updatedAt: 999,
      }],
    ]),
    fenceToken,
  };
}

async function registerClaimedDissolvingWorkflow(workflow) {
  await workflow.workflowCoordinator.registerWorkflow(
    buildDissolvingRecord(null),
  );
  const ownershipClaim = await workflow.claimSplitWorkflowOwnership(
    WORKFLOW_ID,
  );
  return ownershipClaim.workflow.fenceToken;
}

function sourceParticipant(workflow) {
  return workflow.workflowCoordinator
    .getWorkflowById(WORKFLOW_ID)
    ?.participants.get(SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION) ?? null;
}

test('dissolution-witness-persisted: SOURCE_DISSOLVED is recorded only ' +
'against the partitions-row removal witness (affectedRows === 1)',
async (t) => {
  const {workflow} = buildDissolutionWorkflow({
    cdcIntegrationService: {
      async updateSystemTableRow() {
        return {success: true, affectedRows: 1};
      },
      async deleteSystemTableRow() {
        return {success: true, affectedRows: 1};
      },
    },
  });
  await registerClaimedDissolvingWorkflow(workflow);

  await workflow.dissolveSplitSourcePartition(WORKFLOW_ID);

  const participant = sourceParticipant(workflow);
  t.equal(
    participant?.status,
    SPLIT_ACK_STATUS.SOURCE_DISSOLVED,
    'a persisted partitions-row removal admits SOURCE_DISSOLVED',
  );
  t.ok(
    Array.isArray(
      participant?.checkpoint?.[
        SPLIT_ACK_CHECKPOINT_FIELD.DISSOLVED_REPLICA_IDS
      ],
    ),
    'the dissolved replica ids ride the ack checkpoint',
  );
});

test('dissolution-witness-persisted: a zero-affected-rows removal never ' +
'becomes SOURCE_DISSOLVED — the owner cannot believe a source dissolved ' +
'while its durable row survives', async (t) => {
  const errorLogs = [];
  const {workflow} = buildDissolutionWorkflow({
    logger: {
      info() {},
      warn() {},
      error(message, payload) {
        errorLogs.push({message, payload});
      },
    },
    cdcIntegrationService: {
      async updateSystemTableRow() {
        return {success: true, affectedRows: 1};
      },
      async deleteSystemTableRow() {
        // The durable row survives: nothing was removed.
        return {success: true, affectedRows: 0};
      },
    },
  });
  await registerClaimedDissolvingWorkflow(workflow);

  await workflow.dissolveSplitSourcePartition(WORKFLOW_ID);

  const participant = sourceParticipant(workflow);
  t.equal(
    participant?.status,
    SPLIT_ACK_STATUS.DISSOLUTION_FAILED,
    'no durable witness means DISSOLUTION_FAILED, never a fake success',
  );
  t.ok(
    errorLogs.some((entry) =>
      entry.message === MANAGED_SPLIT_LOG_MSG.DISSOLUTION_FAILED &&
      entry.payload?.error ===
        MANAGED_SPLIT_LOG_MSG.DISSOLUTION_WITNESS_MISSING),
    'the witness-missing refusal is the recorded failure cause',
  );
});

test('failed-dissolution-reattemptable: a witness-backed retry after ' +
'DISSOLUTION_FAILED reaches SOURCE_DISSOLVED', async (t) => {
  let deletionWitness = {success: true, affectedRows: 0};
  const {workflow} = buildDissolutionWorkflow({
    logger: {info() {}, warn() {}, error() {}},
    cdcIntegrationService: {
      async updateSystemTableRow() {
        return {success: true, affectedRows: 1};
      },
      async deleteSystemTableRow() {
        return deletionWitness;
      },
    },
  });
  await registerClaimedDissolvingWorkflow(workflow);

  await workflow.dissolveSplitSourcePartition(WORKFLOW_ID);
  t.equal(
    sourceParticipant(workflow)?.status,
    SPLIT_ACK_STATUS.DISSOLUTION_FAILED,
    'the first attempt fails against the missing witness',
  );

  deletionWitness = {success: true, affectedRows: 1};
  await workflow.dissolveSplitSourcePartition(WORKFLOW_ID);
  t.equal(
    sourceParticipant(workflow)?.status,
    SPLIT_ACK_STATUS.SOURCE_DISSOLVED,
    'the retried dissolution succeeds against the persisted witness',
  );
});

test('fence-validated-dissolution-acks: owner-recorded SOURCE_DISSOLVED ' +
'and DISSOLUTION_FAILED carry the claim fence token like every other ack',
async (t) => {
  const {workflow} = buildDissolutionWorkflow({
    cdcIntegrationService: {
      async updateSystemTableRow() {
        return {success: true, affectedRows: 1};
      },
      async deleteSystemTableRow() {
        return {success: true, affectedRows: 1};
      },
    },
  });
  const fenceToken = await registerClaimedDissolvingWorkflow(workflow);
  t.ok(
    Number.isInteger(fenceToken),
    'the ownership claim mints the fence token the acks must carry',
  );

  await workflow.dissolveSplitSourcePartition(WORKFLOW_ID);

  const participant = sourceParticipant(workflow);
  t.equal(
    participant?.fenceToken,
    fenceToken,
    'SOURCE_DISSOLVED is persisted at the workflow claim fence',
  );
  t.equal(
    participant?.status,
    SPLIT_ACK_STATUS.SOURCE_DISSOLVED,
    'the fence-stamped ack is accepted by participant-fence validation',
  );
});

test('fence-validated-dissolution-acks: DISSOLUTION_FAILED is stamped at ' +
'the same claim fence', async (t) => {
  const {workflow} = buildDissolutionWorkflow({
    logger: {info() {}, warn() {}, error() {}},
    cdcIntegrationService: {
      async updateSystemTableRow() {
        return {success: true, affectedRows: 1};
      },
      async deleteSystemTableRow() {
        throw new Error('delete path unavailable');
      },
    },
  });
  const fenceToken = await registerClaimedDissolvingWorkflow(workflow);

  await workflow.dissolveSplitSourcePartition(WORKFLOW_ID);

  const participant = sourceParticipant(workflow);
  t.equal(
    participant?.status,
    SPLIT_ACK_STATUS.DISSOLUTION_FAILED,
    'a throwing delete path records DISSOLUTION_FAILED',
  );
  t.equal(
    participant?.fenceToken,
    fenceToken,
    'DISSOLUTION_FAILED is persisted at the workflow claim fence',
  );
});
