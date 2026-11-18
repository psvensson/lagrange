/**
 * A child-founding target whose admission did not settle defers the split or
 * merge; it is never dropped from the cohort.
 *
 * Failure this pins (review of the founding settle path): the managed split
 * probe passed no budget and kept only admittedTargetNodeIds and
 * rejectedTargetNodePlans. A target the settle path answered UNSETTLED was
 * neither admitted, rejected nor carried, was never re-checked, and the
 * child was founded below the request with the wrong reason
 * founding_candidate_nodes_short. The merge consumer of the same probe did
 * the same, and failed the merge non-retryably when the shortfall made the
 * cohort not viable.
 */
import {test} from '../../src/test-helpers/tap.js';
import {ManagedSplitWorkflow} from
  '../../src/partition/managed-split-workflow.js';
import {ManagedMergeWorkflow} from
  '../../src/partition/managed-merge-workflow.js';
import {MANAGED_MERGE_ERROR_MSG} from
  '../../src/partition/partition-constants.js';
import {isRetryableManagedSplitExecutionFailure} from
  '../../src/partition/managed-split-retry-policy.js';

const CHILD_PARTITION_ID = 'users-p1-v2-left';
const BUDGET = Object.freeze({budget: 'split-execution'});

function unsettledPlan(targetNodeId) {
  return {targetNodeId, decisionType: 'deferred',
    blockingReasons: ['readiness_planning_identity_unavailable'],
    reasonCodes: [], admissionState: 'unsettled'};
}

function probeAnswer() {
  return {
    existingRoutableNodeIds: [],
    candidateTargetNodeIds: ['node-a', 'node-b', 'node-c'],
    admittedTargetNodeIds: ['node-a', 'node-b'],
    rejectedTargetNodePlans: [],
    unsettledTargetNodePlans: [unsettledPlan('node-c')],
    maximumProvisionableReplicaCount: 2,
  };
}

function probingWorkflow(prototype, probes) {
  const workflow = Object.create(prototype);
  workflow.probeInitialTablePartitionProvisioning = async (options) => {
    probes.push(options);
    return probeAnswer();
  };
  return workflow;
}

test('the split probe passes the execution budget and an unsettled target ' +
  'defers the child (retryable), never founds it short', async (t) => {
  const probes = [];
  const workflow = probingWorkflow(ManagedSplitWorkflow.prototype, probes);
  const admissions = await workflow.probeChildProvisioningAdmissions({
    childProvisioningTargetNodeIdsByPartitionId: {
      [CHILD_PARTITION_ID]: ['node-a', 'node-b', 'node-c'],
    },
    minimumRoutableReplicaCount: 2,
    timeoutBudget: BUDGET,
  });
  t.equal(probes[0].timeoutBudget, BUDGET,
    'the probe settles within the execution budget');
  const admission = admissions[CHILD_PARTITION_ID];
  t.same(admission.unsettledTargetNodePlans.map((plan) => plan.targetNodeId),
    ['node-c'], 'the unsettled target is carried');
  t.equal(admission.allowed, false,
    'quorum of admitted targets does not allow a short founding');
  t.equal(admission.decisionType, 'deferred', 'it is a deferral, not a block');
});

test('the merge consumer of the probe defers retryably on an unsettled ' +
  'target', async (t) => {
  const probes = [];
  const workflow = probingWorkflow(ManagedMergeWorkflow.prototype, probes);
  workflow.planChildProvisioningTargetNodeIds = () => ({
    [CHILD_PARTITION_ID]: ['node-a', 'node-b', 'node-c'],
  });
  workflow.nodeId = 'node-a';
  let error = null;
  try {
    await workflow.planMergeTargetProvisioning({
      mergedPartitionId: CHILD_PARTITION_ID,
      candidateTargetNodeIds: ['node-a', 'node-b', 'node-c'],
      sourceRoutableNodeIds: ['node-a'],
      replicaCount: 3,
      mergeBootstrapReplicaCount: 2,
      leftInfo: {},
      executionTimeoutBudget: BUDGET,
    }, {eligibleNodeIds: ['node-a', 'node-b', 'node-c']});
  } catch (thrown) {
    error = thrown;
  }
  t.equal(probes[0].timeoutBudget, BUDGET, 'the merge probe is budgeted');
  t.equal(error?.message, MANAGED_MERGE_ERROR_MSG.TARGET_PROVISIONING_NOT_VIABLE,
    'the target is not provisioned short');
  t.equal(isRetryableManagedSplitExecutionFailure(error), true,
    'the merge is deferred retryably, not failed');
});
