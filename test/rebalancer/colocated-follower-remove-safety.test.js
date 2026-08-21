import {test} from '../../src/test-helpers/tap.js';
import {PriorityPublicationHandoff} from '../../src/rebalancer/priority-publication-handoff.js';
import {PriorityRecoverySupersededTarget} from '../../src/rebalancer/priority-recovery-superseded-target.js';
import {
  evaluateRemoveSafety,
} from '../../src/rebalancer/operation-workflow-remove-safety-evaluator.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_5_STAGE_SHARED as SHARED} from '../../src/rebalancer/priority-publication-safety-shared.js';

const {
  OperationType,
  PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE,
  REMOVE_SAFETY_EVALUATION_CLASSIFICATION,
} = SHARED;

const PARTITION_ID = 'replica_operations-p1';
const PUBLICATION_PARTITION_ID = 'control_plane_publications-p1';
const SOURCE_NODE_ID = 'node-seed';
const TARGET_NODE_ID = 'node-target';
const PEER_NODE_ID = 'node-peer';
const SOURCE_REPLICA_ID = `${PARTITION_ID}-r3`;
const LEADER_REPLICA_ID = `${PARTITION_ID}-r1`;
const PEER_REPLICA_ID = `${PARTITION_ID}-r2`;
const TARGET_REPLICA_ID = `${PARTITION_ID}-r4`;

function replicaRow({replicaId, nodeId, raftRole, partitionId = PARTITION_ID}) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    service_type: 'partition',
    partition_id: partitionId,
    node_id: nodeId,
    raft_role: raftRole,
    status: 'active',
    address: `${nodeId}/partition/${replicaId}`,
  };
}

const sourceFollowerRow = replicaRow({
  replicaId: SOURCE_REPLICA_ID,
  nodeId: SOURCE_NODE_ID,
  raftRole: 'follower',
});
const coLocatedLeaderRow = replicaRow({
  replicaId: LEADER_REPLICA_ID,
  nodeId: SOURCE_NODE_ID,
  raftRole: 'leader',
});
const peerFollowerRow = replicaRow({
  replicaId: PEER_REPLICA_ID,
  nodeId: PEER_NODE_ID,
  raftRole: 'follower',
});
const replacementFollowerRow = replicaRow({
  replicaId: TARGET_REPLICA_ID,
  nodeId: TARGET_NODE_ID,
  raftRole: 'follower',
});

function replaceOperation(partitionId = PARTITION_ID) {
  return {
    operationId: 'replace-colocated-follower',
    type: OperationType.REPLACE,
    partitionId,
    entityType: 'partition',
    entityId: partitionId,
    sourceNodeId: SOURCE_NODE_ID,
    sourceReplicaId: SOURCE_REPLICA_ID,
    targetNodeId: TARGET_NODE_ID,
    targetReplicaId: TARGET_REPLICA_ID,
    replicaId: TARGET_REPLICA_ID,
  };
}

function makeHandoff({partitionId = PARTITION_ID, rows = null} = {}) {
  const currentVoterReadyRows = rows || [
    sourceFollowerRow,
    coLocatedLeaderRow,
    peerFollowerRow,
    replacementFollowerRow,
  ];
  const instance = Object.create(PriorityPublicationHandoff.prototype);
  instance.repository = {
    getOperationsByEntity: async () => [],
    getReplaceSourceReplicaId: (operation) =>
      operation?.sourceReplicaId || null,
    getReplaceTargetReplicaId: (operation) =>
      operation?.targetReplicaId || null,
    isOperationTerminal: () => false,
    isReplaceRemovePhase: () => true,
  };
  instance.messageRouter = null;
  instance.isRemoveInitialDispatchPhase = () => false;
  instance.resolveTimeoutCheckNowMs = () => 0;
  instance.isConcurrentOperationTargetUncontactable = async () => false;
  instance.getCriticalReplicaRowsForSafety = async () =>
    currentVoterReadyRows;
  instance.isNodeReadyForRouting = () => true;
  instance.resolvePriorityPublicationReplacementLeaderCandidateRow = async () =>
    replacementFollowerRow;
  instance.hasPriorityPublicationReplacementLeaderRetargetCandidateAfterNotFound =
    () => false;
  instance.isReplaceSourceLeaderHandoffRequiredPartition = () => true;
  instance.evaluatePriorityRecoveryCompletionRemoveSafety = async () =>
    instance.buildSafeRemoveSafetyEvaluation();
  instance.getCriticalMinReplicaCount = async () => 3;
  instance.getCriticalPartitionRowForSafety = async () => ({
    partition_id: partitionId,
    leader_node_id: SOURCE_NODE_ID,
  });
  instance.getPriorityRecoveryPlanningSnapshot = async () => ({
    publicationStatus: 'PUBLISHED',
  });
  instance.buildPriorityRecoveryAssessmentContextForOperation = () => ({});
  instance.resolvePriorityRemoveSafetyMembershipSnapshot = () => ({
    recoveryProjectionNodeIds: [SOURCE_NODE_ID, PEER_NODE_ID, TARGET_NODE_ID],
  });
  instance.getPriorityPublicationLeaderHandoffEvidence = () => null;
  instance.isPriorityPublicationLeaderHandoffRetrySuppressed = () => false;
  instance.getPriorityPublicationReplacementLeaderElectionEvidence = () => null;
  instance.isPriorityActiveReplaceTopologyVoterEvidenceSufficient = () => true;
  instance.normalizePriorityPublicationStatus = () => 'PUBLISHED';
  instance.getPriorityPublicationSourceLeaderHandoffStallMs = () => null;
  instance.buildSafeRemoveSafetyEvaluation =
    PriorityRecoverySupersededTarget.prototype.buildSafeRemoveSafetyEvaluation;
  instance.buildDeferredRemoveSafetyEvaluation =
    PriorityRecoverySupersededTarget.prototype.buildDeferredRemoveSafetyEvaluation;
  instance.buildFailedRemoveSafetyEvaluation =
    PriorityRecoverySupersededTarget.prototype.buildFailedRemoveSafetyEvaluation;
  instance.buildDeferredRemoveSafetyEvaluationForOperation =
    PriorityRecoverySupersededTarget.prototype
      .buildDeferredRemoveSafetyEvaluationForOperation;
  instance.resolveRemoveSafetyDeferredReason =
    PriorityRecoverySupersededTarget.prototype.resolveRemoveSafetyDeferredReason;
  return {instance, currentVoterReadyRows};
}

async function evaluateHandoff({
  partitionId = PARTITION_ID,
  sourceRow = sourceFollowerRow,
  rows,
} = {}) {
  const {instance, currentVoterReadyRows} = makeHandoff({partitionId, rows});
  return instance.evaluatePriorityPublicationLeaderRemoveSafety(
    replaceOperation(partitionId),
    sourceRow,
    replacementFollowerRow,
    {
      currentVoterReadyRows,
      priorityRecoveryCompletionSafe: true,
    },
  );
}

test('remove-safety owner: an explicit follower with a distinct same-node leader ' +
  'sibling is removed without promoting the replacement', async (t) => {
  const {instance} = makeHandoff();
  const evaluation = await evaluateRemoveSafety(
    instance,
    replaceOperation(),
  );

  t.equal(
    evaluation.classification,
    REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE,
    'the authoritative leader node plus explicit per-replica roles identify the source as the follower',
  );
  t.equal(
    evaluation.handoffRequest,
    null,
    'safe follower removal does not request a replacement leader election',
  );
  t.end();
});

test('stale-follower safeguard: without a distinct same-node leader sibling, ' +
  'leader_node_id still drives a replacement election', async (t) => {
  const evaluation = await evaluateHandoff({
    rows: [sourceFollowerRow, peerFollowerRow, replacementFollowerRow],
  });

  t.equal(
    evaluation.classification,
    REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
    'a lone follower row cannot overrule the canonical leader node',
  );
  t.ok(
    evaluation.handoffRequest,
    'the existing saturated-node recovery path still drives the replacement election',
  );
  t.end();
});

test('wrong-node leader evidence does not disambiguate the co-located source', async (t) => {
  const offNodeLeader = replicaRow({
    replicaId: LEADER_REPLICA_ID,
    nodeId: PEER_NODE_ID,
    raftRole: 'leader',
  });
  const evaluation = await evaluateHandoff({
    rows: [sourceFollowerRow, offNodeLeader, replacementFollowerRow],
  });

  t.equal(
    evaluation.classification,
    REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
    'only a distinct leader replica on the canonical source node is corroborating evidence',
  );
  t.end();
});

test('an explicit leader source is never released by sibling evidence', async (t) => {
  const sourceLeader = {
    ...sourceFollowerRow,
    raft_role: 'leader',
  };
  const evaluation = await evaluateHandoff({sourceRow: sourceLeader});

  t.equal(
    evaluation.classification,
    REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
    'the source replica itself is explicitly leader, so removal still requires handoff',
  );
  t.end();
});

test('publication partition retains its dedicated owner-handoff exclusion', async (t) => {
  const publicationSource = replicaRow({
    replicaId: `${PUBLICATION_PARTITION_ID}-r3`,
    nodeId: SOURCE_NODE_ID,
    raftRole: 'follower',
    partitionId: PUBLICATION_PARTITION_ID,
  });
  const publicationLeader = replicaRow({
    replicaId: `${PUBLICATION_PARTITION_ID}-r1`,
    nodeId: SOURCE_NODE_ID,
    raftRole: 'leader',
    partitionId: PUBLICATION_PARTITION_ID,
  });
  const evaluation = await evaluateHandoff({
    partitionId: PUBLICATION_PARTITION_ID,
    sourceRow: publicationSource,
    rows: [publicationSource, publicationLeader, replacementFollowerRow],
  });

  t.equal(
    evaluation.classification,
    REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
    'control-plane publication keeps its stricter owner-handoff rule',
  );
  t.end();
});

test('snapshot exposes the existing replacement-election state for the stale-follower control', (t) => {
  const {instance, currentVoterReadyRows} = makeHandoff({
    rows: [sourceFollowerRow, peerFollowerRow, replacementFollowerRow],
  });
  const snapshot = instance.buildPriorityPublicationLeaderRemoveSafetySnapshot(
    replaceOperation(),
    sourceFollowerRow,
    replacementFollowerRow,
    {leader_node_id: SOURCE_NODE_ID},
    {publicationStatus: 'PUBLISHED'},
    {currentVoterReadyRows, priorityRecoveryCompletionSafe: true},
  );

  t.equal(
    snapshot.state,
    PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE.REQUEST_REPLACEMENT_LEADER_ELECTION,
    'negative control remains on the explicit replacement-election branch',
  );
  t.end();
});
