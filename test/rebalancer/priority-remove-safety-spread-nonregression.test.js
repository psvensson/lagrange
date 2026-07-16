import {test} from '../../src/test-helpers/tap.js';
import {PriorityRecoverySupersededTarget} from '../../src/rebalancer/priority-recovery-superseded-target.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from '../../src/rebalancer/operation-workflow-owner-shared.js';
import {renderMarkdown} from '../../scripts/analyze-replace-safety-blocks.js';

const {REMOVE_SAFETY_EVALUATION_CLASSIFICATION} =
  OPERATION_WORKFLOW_OWNER_SHARED;

const PARTITION_ID = 'replica_operations-p1';

function rowsOnNodes(nodeIds) {
  return nodeIds.map((nodeId, index) => ({
    service_id: `${PARTITION_ID}-r${index + 1}`,
    replica_id: `${PARTITION_ID}-r${index + 1}`,
    partition_id: PARTITION_ID,
    service_type: 'partition',
    node_id: nodeId,
    status: 'active',
    raft_role: index === 0 ? 'leader' : 'follower',
  }));
}

function makeRemoveSafetyOwner() {
  const owner = Object.create(PriorityRecoverySupersededTarget.prototype);
  owner.repository = {
    isReplaceRemovePhase: () => true,
  };
  owner.getPriorityRecoveryPlanningSnapshot = async () => ({
    publishedActiveNodeIdsPresent: true,
    publishedActiveNodeIds: ['node-seed', 'node-target'],
    recoveryActiveNodeIds: ['node-seed', 'node-target'],
    projectedServingNodeIds: ['node-seed', 'node-target'],
    locallyEligibleNodeIds: ['node-seed', 'node-target'],
  });
  owner.buildPriorityRecoveryAssessmentContextForOperation = () => ({
    completion: {state: 'spread_pending'},
    priorityPartitionSummary: {
      satisfied: false,
      requiredDistinctNodeCount: 3,
    },
  });
  owner.isPriorityRecoveryRemoveSafetySatisfied = () => false;
  owner.getPriorityRecoverySupersededTargetErrorFromContext = () => null;
  owner.resolvePriorityRemoveSafetyMembershipSnapshot = (
    _planningSnapshot,
    _priorityRecoveryContext,
    projectedVoterReadyRows,
  ) => ({
    publishedActiveNodeIdsPresent: true,
    recoveryProjectionNodeIds: ['node-seed', 'node-target'],
    projectedVoterReadyNodeIds: [
      ...new Set(projectedVoterReadyRows.map((row) => row.node_id)),
    ],
    membershipSource: 'recovery projection membership',
    missingMembershipNodeIds: [],
    useRecoveryProjectionMembership: true,
  });
  return owner;
}

function replaceOperation() {
  return {
    operationId: 'replace-spread-1-to-2',
    type: 'REPLACE',
    partitionId: PARTITION_ID,
    sourceNodeId: 'node-seed',
    targetNodeId: 'node-target',
  };
}

test('priority remove-safety owner releases a 2 -> 2 intermediate REPLACE ' +
  'while the final published spread target remains 3', async (t) => {
  const owner = makeRemoveSafetyOwner();
  const currentVoterReadyRows = rowsOnNodes([
    'node-seed',
    'node-seed',
    'node-seed',
    'node-target',
  ]);
  const projectedVoterReadyRows = rowsOnNodes([
    'node-seed',
    'node-seed',
    'node-target',
  ]);

  const evaluation =
    await owner.evaluatePriorityPublishedMembershipRemoveSafety(
      replaceOperation(),
      projectedVoterReadyRows,
      currentVoterReadyRows,
    );

  t.equal(
    evaluation.classification,
    REMOVE_SAFETY_EVALUATION_CLASSIFICATION.SAFE,
    'the current and projected authoritative row sets prove spread is preserved, so the serialized next move retains an owner',
  );
  t.equal(evaluation.error, null);
  t.end();
});

test('priority remove-safety owner still blocks 2 -> 1 spread regression',
  async (t) => {
    const owner = makeRemoveSafetyOwner();
    const evaluation =
      await owner.evaluatePriorityPublishedMembershipRemoveSafety(
        replaceOperation(),
        rowsOnNodes(['node-seed', 'node-seed', 'node-seed']),
        rowsOnNodes([
          'node-seed',
          'node-seed',
          'node-seed',
          'node-target',
        ]),
      );

    t.equal(
      evaluation.classification,
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
    );
    t.match(
      evaluation.error,
      /protected per-operation requirement \(1\/2\)$/,
      'the diagnostic exposes the protected local floor, not the final target',
    );
    t.end();
  });

test('missing current-row evidence fails closed on the final published target',
  async (t) => {
    const owner = makeRemoveSafetyOwner();
    const evaluation =
      await owner.evaluatePriorityPublishedMembershipRemoveSafety(
        replaceOperation(),
        rowsOnNodes(['node-seed', 'node-seed', 'node-target']),
        null,
      );

    t.equal(
      evaluation.classification,
      REMOVE_SAFETY_EVALUATION_CLASSIFICATION.DEFER,
    );
    t.match(evaluation.error, /\(2\/3\)$/);
    t.end();
  });

test('spread-floor analyzer prose follows the protected local floor semantics',
  async (t) => {
    const markdown = renderMarkdown([]);
    t.match(
      markdown,
      /spread_floor.*protected per-operation floor/u,
      'operator prose follows the local safety-floor semantics',
    );
    t.notMatch(
      markdown,
      /spread_floor.*below 2\/3/u,
      'operator prose does not misstate the final target as the per-step floor',
    );
    t.end();
  });
