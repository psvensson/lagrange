import {test} from '../../src/test-helpers/tap.js';
import {
  MANAGED_SPLIT_LOG_MSG,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {
  SPLIT_ACK_CHECKPOINT_FIELD,
  SPLIT_ACK_STATUS,
  SPLIT_PARTICIPANT_PREFIX,
} from '../../src/partition/split-ack-constants.js';
import {
  PARTICIPANT_ACK_FIELD,
  PARTICIPANT_ACK_RESULT,
} from '../../src/workflow/workflow-constants.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {
  ManagedSplitTopologyAdapter,
} from '../../src/partition/managed-split-topology-adapter.js';
import {
  MEMBERSHIP_PUBLICATION_STATUS,
} from '../../src/control-plane/membership-publication-row-contract.js';
import {buildWorkflow} from './managed-split-workflow-test-helpers.js';

const WORKFLOW_ID = 'split-cutover-handoff-closure';
const SOURCE_PARTITION_ID = 'users-p1';
const TARGET_PARTITION_IDS = ['users-p-left', 'users-p-right'];

function buildWorkflowRecord() {
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
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS]:
        TARGET_PARTITION_IDS,
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]: 2,
    },
    createdAt: 1000,
    updatedAt: 1000,
    participants: new Map(),
  };
}

function buildSourceMetadata(fenceToken) {
  return {
    workflowId: WORKFLOW_ID,
    workflowFenceToken: fenceToken,
    sourcePartitionId: SOURCE_PARTITION_ID,
    targetPartitionIds: TARGET_PARTITION_IDS,
    targetPartitionVersion: 2,
    primaryKeyColumn: 'id',
    splitKey: 'm',
  };
}

test('query cohort capture accepts only a published membership epoch', (t) => {
  let status = MEMBERSHIP_PUBLICATION_STATUS.OPEN;
  const adapter = new ManagedSplitTopologyAdapter({
    sqlQueryEngine: {
      nodeId: 'node-a',
      nowFn: () => 1000,
      controlPlaneReadinessService: {
        getMembershipPublicationDiagnosticsSync() {
          return {
            status,
            publicationEpoch: 7,
            publishedActiveNodeIdsPresent: true,
            publishedActiveNodeIds: ['node-b', 'node-a'],
          };
        },
      },
      systemCache: {
        getAll() {
          return [
            {node_id: 'node-a', boot_incarnation: 3},
            {node_id: 'node-b', boot_incarnation: 5},
          ];
        },
      },
    },
  });
  t.equal(adapter.captureSplitQueryPlaneCohort(), null,
    'an open publication is not cohort authority');
  status = MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED;
  t.same(adapter.captureSplitQueryPlaneCohort(), {
    publicationEpoch: 7,
    nodes: [
      {nodeId: 'node-a', bootIncarnation: 3},
      {nodeId: 'node-b', bootIncarnation: 5},
    ],
  }, 'the published epoch binds sorted node incarnations');
  t.end();
});

test('real source CLEANUP_COMPLETED false ack is progress, never source ' +
'dissolution authority', async (t) => {
  const removalRequests = [];
  const deleteRequests = [];
  const {workflow} = buildWorkflow({
    listTablePartitionRows: () => [
      {partition_id: SOURCE_PARTITION_ID, partition_version: 1},
      {partition_id: TARGET_PARTITION_IDS[0], partition_version: 2},
      {partition_id: TARGET_PARTITION_IDS[1], partition_version: 2},
    ],
    listPartitionServiceRows: () => [
      {replica_id: 'users-p1-r1', node_id: 'node-a'},
    ],
    deliverReplicaRemoval: async (request) => {
      removalRequests.push(request);
      return {status: 'initiated'};
    },
    cdcIntegrationService: {
      async updateSystemTableRow() {
        return {success: true, affectedRows: 1};
      },
      async deleteSystemTableRow(tableName, whereClause) {
        deleteRequests.push({tableName, whereClause});
        return {success: true, affectedRows: 1};
      },
    },
  });
  await workflow.workflowCoordinator.registerWorkflow(buildWorkflowRecord());
  const claim = await workflow.claimSplitWorkflowOwnership(WORKFLOW_ID);
  workflow.ensureCanonicalSplitParticipants(
    WORKFLOW_ID,
    buildWorkflowRecord().metadata,
  );
  const metadata = buildSourceMetadata(claim.workflow.fenceToken);
  const sourceContext = {
    partitionId: SOURCE_PARTITION_ID,
    sqlQueryEngine: {managedSplitWorkflow: workflow},
    logger: {info() {}},
  };

  await PartitionService.prototype.emitSplitSourceAck.call(
    sourceContext,
    metadata,
    SPLIT_ACK_STATUS.SNAPSHOT_STARTED,
  );
  const catchup = await PartitionService.prototype.emitSplitSourceAck.call(
    sourceContext,
    metadata,
    SPLIT_ACK_STATUS.CATCHUP_READY,
  );
  t.equal(catchup.splitCutoverApplied, true, 'real ack path applies cutover');

  await PartitionService.prototype.emitSplitSourceAck.call(
    sourceContext,
    metadata,
    SPLIT_ACK_STATUS.CLEANUP_COMPLETED,
    {
      [SPLIT_ACK_CHECKPOINT_FIELD.SOURCE_MIRROR_REMOVED]: false,
      [SPLIT_ACK_CHECKPOINT_FIELD.SNAPSHOT_BARRIER_INDEX]: 40,
      [SPLIT_ACK_CHECKPOINT_FIELD.REPLAY_WATERMARK_INDEX]: 41,
    },
  );

  const retained = workflow.workflowCoordinator.getWorkflowById(WORKFLOW_ID);
  t.equal(
    retained?.status,
    PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
    'false cleanup remains a cutover-progress state',
  );
  t.equal(removalRequests.length, 0, 'source replicas remain routable');
  t.equal(deleteRequests.length, 0, 'source descriptor remains routable');

  const forgedOwnerAck = await workflow.acknowledgeSourceParticipant(
    WORKFLOW_ID,
    {
      [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]:
        SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
      [PARTICIPANT_ACK_FIELD.FENCE_TOKEN]: claim.workflow.fenceToken,
      [PARTICIPANT_ACK_FIELD.STATUS]: SPLIT_ACK_STATUS.HANDOFF_CLOSED,
      [PARTICIPANT_ACK_FIELD.CHECKPOINT]: {
        [SPLIT_ACK_CHECKPOINT_FIELD.SOURCE_MIRROR_REMOVED]: true,
      },
    },
  );
  t.equal(forgedOwnerAck.result, PARTICIPANT_ACK_RESULT.INVALID_TRANSITION,
    'PartitionService cannot mint the workflow-owned handoff boundary');
  t.equal(
    workflow.resolveSplitSourceParticipantStatus(
      workflow.workflowCoordinator.getWorkflowById(WORKFLOW_ID),
    ),
    SPLIT_ACK_STATUS.CLEANUP_COMPLETED,
    'rejected parallel authority cannot advance the source participant',
  );

  let accessorCalls = 0;
  const accessorAck = {
    [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]:
      SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
    [PARTICIPANT_ACK_FIELD.FENCE_TOKEN]: claim.workflow.fenceToken,
  };
  Object.defineProperty(accessorAck, PARTICIPANT_ACK_FIELD.STATUS, {
    enumerable: true,
    get() {
      accessorCalls++;
      return accessorCalls === 1 ?
        SPLIT_ACK_STATUS.CLEANUP_COMPLETED :
        SPLIT_ACK_STATUS.HANDOFF_CLOSED;
    },
  });
  const accessorOutcome = await workflow.acknowledgeSourceParticipant(
    WORKFLOW_ID,
    accessorAck,
  );
  t.equal(accessorOutcome.result, PARTICIPANT_ACK_RESULT.INVALID_TRANSITION,
    'accessor-backed source authority fails closed');
  t.equal(accessorCalls, 0,
    'strict acknowledgement ingestion never invokes an accessor');
  t.equal(
    workflow.resolveSplitSourceParticipantStatus(
      workflow.workflowCoordinator.getWorkflowById(WORKFLOW_ID),
    ),
    SPLIT_ACK_STATUS.CLEANUP_COMPLETED,
    'accessor TOCTOU cannot advance the source participant',
  );
});

test('captured query cohort cannot silently shrink; a retired incarnation ' +
'proof rotates the generation before dissolution', async (t) => {
  const removals = [];
  const deletions = [];
  const lifecycleLogs = [];
  let captureCount = 0;
  let nodeBRetired = false;
  let nodeBReachable = true;
  const initialCohort = {
    publicationEpoch: 7,
    nodes: [
      {nodeId: 'node-a', bootIncarnation: 3},
      {nodeId: 'node-b', bootIncarnation: 5},
    ],
  };
  const reducedCohort = {
    publicationEpoch: 8,
    nodes: [{nodeId: 'node-a', bootIncarnation: 3}],
  };
  const {workflow} = buildWorkflow({
    logger: {
      info(message, payload) {
        lifecycleLogs.push({message, payload});
      },
      warn() {},
      error() {},
    },
    listTablePartitionRows: () => [
      {partition_id: SOURCE_PARTITION_ID, partition_version: 1},
      {partition_id: TARGET_PARTITION_IDS[0], partition_version: 2},
      {partition_id: TARGET_PARTITION_IDS[1], partition_version: 2},
    ],
    listPartitionServiceRows: () => [
      {replica_id: 'users-p1-r1', node_id: 'node-a'},
    ],
    deliverReplicaRemoval: async (request) => {
      removals.push(request);
      return {status: 'initiated'};
    },
    cdcIntegrationService: {
      async updateSystemTableRow() {
        return {success: true, affectedRows: 1};
      },
      async deleteSystemTableRow(tableName, whereClause) {
        deletions.push({tableName, whereClause});
        return {success: true, affectedRows: 1};
      },
    },
  });
  workflow.topologyAdapter = {
    captureSplitQueryPlaneCohort() {
      captureCount++;
      return captureCount === 1 ? initialCohort : reducedCohort;
    },
    isSplitQueryPlaneIncarnationRetired(requiredNode) {
      return requiredNode.nodeId === 'node-b' && nodeBRetired;
    },
    async deliverSplitCutoverHandoff(nodeId, message) {
      if (nodeId === 'node-b' && !nodeBReachable) return null;
      const bootIncarnation = nodeId === 'node-a' ? 3 : 5;
      return {
        acknowledged: true,
        state: 'ready',
        generation: message.generation,
        workflowId: message.workflowId,
        nodeId,
        bootIncarnation,
        targetPartitionVersion: message.targetPartitionVersion,
      };
    },
  };
  await workflow.workflowCoordinator.registerWorkflow(buildWorkflowRecord());
  const claim = await workflow.claimSplitWorkflowOwnership(WORKFLOW_ID);
  workflow.ensureCanonicalSplitParticipants(
    WORKFLOW_ID,
    buildWorkflowRecord().metadata,
  );
  const ack = (status, checkpoint = undefined) =>
    workflow.acknowledgeSourceParticipant(WORKFLOW_ID, {
      [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]:
        SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
      [PARTICIPANT_ACK_FIELD.FENCE_TOKEN]: claim.workflow.fenceToken,
      [PARTICIPANT_ACK_FIELD.STATUS]: status,
      ...(checkpoint ? {[PARTICIPANT_ACK_FIELD.CHECKPOINT]: checkpoint} : {}),
    });
  await ack(SPLIT_ACK_STATUS.SNAPSHOT_STARTED);
  await ack(SPLIT_ACK_STATUS.CATCHUP_READY);
  await ack(SPLIT_ACK_STATUS.CLEANUP_COMPLETED, {
    [SPLIT_ACK_CHECKPOINT_FIELD.SOURCE_MIRROR_REMOVED]: false,
    [SPLIT_ACK_CHECKPOINT_FIELD.SNAPSHOT_BARRIER_INDEX]: 40,
    [SPLIT_ACK_CHECKPOINT_FIELD.REPLAY_WATERMARK_INDEX]: 41,
  });
  t.equal(removals.length, 0,
    'publication change during acknowledgement cannot dissolve the source');

  nodeBReachable = false;
  await workflow.finalizeSplitDissolutionIfReady(WORKFLOW_ID);
  const retained = workflow.resolveWorkflowState(WORKFLOW_ID);
  const retainedClosure = retained.metadata[
    PARTITION_TRANSITION_METADATA_FIELD.HANDOFF_CLOSURE
  ];
  t.same(retainedClosure.requiredNodes.map((node) => node.nodeId),
    ['node-a', 'node-b'],
    'an unreachable but unretired query incarnation remains required');
  t.equal(deletions.length, 0,
    'membership omission alone is not process-death authority');

  nodeBRetired = true;
  await Promise.all([
    workflow.finalizeSplitDissolutionIfReady(WORKFLOW_ID),
    workflow.finalizeSplitDissolutionIfReady(WORKFLOW_ID),
  ]);
  t.equal(removals.length, 1,
    'retirement proof rotates generation and single-flights dissolution');
  t.equal(deletions.length, 1,
    'source deletion follows the rotated generation, never leads it');
  const closedIndex = lifecycleLogs.findIndex((entry) =>
    entry.message === MANAGED_SPLIT_LOG_MSG.HANDOFF_CLOSED);
  const finalGeneration = lifecycleLogs[closedIndex]?.payload?.generation;
  const closingIndex = lifecycleLogs.findIndex((entry) =>
    entry.message === MANAGED_SPLIT_LOG_MSG.HANDOFF_CLOSING &&
    entry.payload?.generation === finalGeneration);
  const queryReadyIndex = lifecycleLogs.findIndex((entry) =>
    entry.message === MANAGED_SPLIT_LOG_MSG.HANDOFF_QUERY_PLANE_READY &&
    entry.payload?.generation === finalGeneration);
  const dissolutionIndex = lifecycleLogs.findIndex((entry) =>
    entry.message === MANAGED_SPLIT_LOG_MSG.DISSOLUTION_DISPATCHED);
  t.ok(closingIndex >= 0 && closingIndex < queryReadyIndex,
    'the final generation is durably published before its query acks');
  t.ok(queryReadyIndex < closedIndex,
    'query-plane readiness precedes the owner-minted closure boundary');
  t.ok(closedIndex < dissolutionIndex,
    'handoff closure strictly precedes source dissolution dispatch');
  t.equal(lifecycleLogs.filter((entry) =>
    entry.message === MANAGED_SPLIT_LOG_MSG.HANDOFF_CLOSED).length, 1,
  'the concurrent terminal attempts mint one closure event');
  t.equal(lifecycleLogs.filter((entry) =>
    entry.message === MANAGED_SPLIT_LOG_MSG.DISSOLUTION_DISPATCHED).length, 1,
  'the concurrent terminal attempts dispatch one dissolution event');
});
