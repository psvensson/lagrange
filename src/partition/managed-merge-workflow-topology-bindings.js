import {
  applyWorkflowTopologyBindings,
} from './managed-workflow-topology-binding-contract.js';

const WORKFLOW_NAME = 'ManagedMergeWorkflow';

const returnsNull = () => () => null;
const returnsEmptyList = () => () => [];
const returnsFalse = () => () => false;
const absent = () => null;

/**
 * Topology collaborators the ManagedMergeWorkflow owner consumes, in
 * binding order. Required effect, quorum, and membership collaborators fail
 * closed at binding time when omitted; optional read and hook collaborators
 * use their typed default.
 * @type {ReadonlyArray<{property: string, required?: boolean, inertBinding?: Function}>}
 */
const TOPOLOGY_METHOD_BINDINGS = Object.freeze([
  {
    property: 'getCDCIntegrationService',
    inertBinding: (options) => () => options.cdcIntegrationService || null,
  },
  {property: 'getPartitionInfo', inertBinding: returnsNull},
  {property: 'getTableInfo', inertBinding: returnsNull},
  {property: 'listTableInfos', inertBinding: returnsEmptyList},
  {property: 'parsePartitionTransition', inertBinding: returnsNull},
  {property: 'isLocalManagedMergeLeader', inertBinding: returnsFalse},
  {property: 'resolveActivePartitionVersion', inertBinding: () => () => 1},
  {property: 'resolveProvisionTargetNodeIds', required: true},
  {property: 'getRoutablePartitionServiceNodeIds', required: true},
  {property: 'isSystemTablePartitionId', inertBinding: returnsFalse},
  {property: 'calculateQuorumReplicaCount', required: true},
  {property: 'createExecutionTimeoutBudget', inertBinding: absent},
  {property: 'waitForTablePartitionMetadata', required: true},
  {property: 'probeInitialTablePartitionProvisioning', inertBinding: absent},
  {property: 'provisionInitialTablePartition', required: true},
  {property: 'startMergeReplicationOnSourcePartition', required: true},
  {property: 'listTablePartitionRows', required: true},
  {property: 'listPartitionServiceRows', required: true},
  {property: 'deliverReplicaRemoval', required: true},
  {property: 'readCommittedGroupMembers', required: true},
  {property: 'observeSystemRows', inertBinding: () => () => null},
]);

/**
 * Bind the merge workflow's topology collaborators and validate required
 * adapter methods at binding time.
 * @param {ManagedMergeWorkflow} workflow - Workflow instance.
 * @param {Object} options - Constructor options.
 * @return {void}
 */
function applyManagedMergeTopologyBindings(workflow, options) {
  applyWorkflowTopologyBindings(
    workflow,
    options,
    TOPOLOGY_METHOD_BINDINGS,
    WORKFLOW_NAME,
  );
}

export {
  applyManagedMergeTopologyBindings,
};
