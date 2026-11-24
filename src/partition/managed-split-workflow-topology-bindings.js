import {
  QUERY_ERROR_MSG,
} from '../query/query-constants.js';
import {
  defaultRoutingWaitPollIntervalMs,
} from './managed-split-workflow-cutover-readiness-methods.js';
import {
  applyWorkflowTopologyBindings,
} from './managed-workflow-topology-binding-contract.js';

const WORKFLOW_NAME = 'ManagedSplitWorkflow';
const LOCAL_STR_GETCDCINTEGRATIONSERVICE = 'getCDCIntegrationService';
const LOCAL_STR_GETPARTITIONINFO = 'getPartitionInfo';
const LOCAL_STR_GETTABLEINFO = 'getTableInfo';
const LOCAL_STR_LISTTABLEINFOS = 'listTableInfos';
const LOCAL_STR_PARSEPARTITIONTRANSITION = 'parsePartitionTransition';
const LOCAL_STR_ISLOCALMANAGEDSPLITLEADER = 'isLocalManagedSplitLeader';
const LOCAL_STR_RESOLVEACTIVEPARTITIONVERSION = 'resolveActivePartitionVersion';
const LOCAL_STR_BUILDMANAGEDSPLITPLAN = 'buildManagedSplitPlan';
const LOCAL_STR_RESOLVEPROVISIONTARGETNODEIDS = 'resolveProvisionTargetNodeIds';
const LOCAL_STR_GETROUTABLEPARTITIONSERVICENODEIDS =
  'getRoutablePartitionServiceNodeIds';
const LOCAL_STR_ISSYSTEMTABLEPARTITIONID = 'isSystemTablePartitionId';
const LOCAL_STR_CAPTURETOPOLOGYSNAPSHOT = 'captureTopologySnapshot';
const LOCAL_STR_CALCULATEQUORUMREPLICACOUNT = 'calculateQuorumReplicaCount';
const LOCAL_STR_CREATEEXECUTIONTIMEOUTBUDGET = 'createExecutionTimeoutBudget';
const LOCAL_STR_ESTIMATESPLITADMISSIONBYTES = 'estimateSplitAdmissionBytes';
const LOCAL_STR_WAITFORTABLEPARTITIONMETADATA = 'waitForTablePartitionMetadata';
const LOCAL_STR_PROBEINITIALTABLEPARTITIONPROVISIONING =
  'probeInitialTablePartitionProvisioning';
const LOCAL_STR_PROVISIONINITIALTABLEPARTITION =
  'provisionInitialTablePartition';
const LOCAL_STR_STARTSPLITREPLICATIONONSOURCEPARTITION =
  'startSplitReplicationOnSourcePartition';
const LOCAL_STR_LISTTABLEPARTITIONROWS = 'listTablePartitionRows';
const LOCAL_STR_LISTPARTITIONSERVICEROWS = 'listPartitionServiceRows';
const LOCAL_STR_DELIVERREPLICAREMOVAL = 'deliverReplicaRemoval';
const LOCAL_STR_READCOMMITTEDGROUPMEMBERS = 'readCommittedGroupMembers';
const LOCAL_STR_OBSERVESYSTEMROWS = 'observeSystemRows';
const LOCAL_STR_RESOLVESPLITCHILDLEADERROUTINGEVIDENCE =
  'resolveSplitChildLeaderRoutingEvidence';
const LOCAL_STR_REPAIRSPLITCHILDLEADERROUTINGEVIDENCE =
  'repairSplitChildLeaderRoutingEvidence';
const LOCAL_STR_RESOLVEROUTINGWAITPOLLINTERVALMS =
  'resolveRoutingWaitPollIntervalMs';
const LOCAL_STR_DELAY = 'delay';

const returnsNull = () => () => null;
const returnsEmptyList = () => () => [];
const returnsFalse = () => () => false;
const absent = () => null;

/**
 * Topology collaborators the ManagedSplitWorkflow owner consumes, in
 * binding order. Each resolves to the topology adapter's method when one is
 * wired, else the explicit option of the same name. Required effect, quorum,
 * and membership collaborators are validated at binding time; optional read
 * and hook collaborators use their typed default.
 * @type {ReadonlyArray<{property: string, required?: boolean, inertBinding?: Function}>}
 */
const TOPOLOGY_METHOD_BINDINGS = Object.freeze([
  {
    property: LOCAL_STR_GETCDCINTEGRATIONSERVICE,
    inertBinding: (options) => () => options.cdcIntegrationService || null,
  },
  {property: LOCAL_STR_GETPARTITIONINFO, inertBinding: returnsNull},
  {property: LOCAL_STR_GETTABLEINFO, inertBinding: returnsNull},
  {property: LOCAL_STR_LISTTABLEINFOS, inertBinding: returnsEmptyList},
  {property: LOCAL_STR_PARSEPARTITIONTRANSITION, inertBinding: returnsNull},
  {property: LOCAL_STR_ISLOCALMANAGEDSPLITLEADER, inertBinding: returnsFalse},
  {property: LOCAL_STR_RESOLVEACTIVEPARTITIONVERSION, inertBinding: () => () => 1},
  {
    property: LOCAL_STR_BUILDMANAGEDSPLITPLAN,
    inertBinding: () => async () => {
      throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_START_FAILED);
    },
  },
  {property: LOCAL_STR_RESOLVEPROVISIONTARGETNODEIDS, required: true},
  {property: LOCAL_STR_GETROUTABLEPARTITIONSERVICENODEIDS, required: true},
  {property: LOCAL_STR_ISSYSTEMTABLEPARTITIONID, inertBinding: returnsFalse},
  {property: LOCAL_STR_CAPTURETOPOLOGYSNAPSHOT, inertBinding: absent},
  {property: LOCAL_STR_CALCULATEQUORUMREPLICACOUNT, required: true},
  {property: LOCAL_STR_CREATEEXECUTIONTIMEOUTBUDGET, inertBinding: absent},
  {
    property: LOCAL_STR_ESTIMATESPLITADMISSIONBYTES,
    inertBinding: (_options, workflow) =>
      (partitionInfo) => workflow.defaultEstimateSplitAdmissionBytes(partitionInfo),
  },
  {property: LOCAL_STR_WAITFORTABLEPARTITIONMETADATA, required: true},
  {property: LOCAL_STR_PROBEINITIALTABLEPARTITIONPROVISIONING, inertBinding: absent},
  {property: LOCAL_STR_PROVISIONINITIALTABLEPARTITION, required: true},
  {property: LOCAL_STR_STARTSPLITREPLICATIONONSOURCEPARTITION, required: true},
  {property: LOCAL_STR_LISTTABLEPARTITIONROWS, required: true},
  {property: LOCAL_STR_LISTPARTITIONSERVICEROWS, required: true},
  {property: LOCAL_STR_DELIVERREPLICAREMOVAL, required: true},
  {property: LOCAL_STR_READCOMMITTEDGROUPMEMBERS, required: true},
  {property: LOCAL_STR_OBSERVESYSTEMROWS, inertBinding: () => () => null},
  // Cutover readiness evidence (child canonical leader + serve-routable
  // node ids) is observed from the query plane; the owner decides.
  {
    property: LOCAL_STR_RESOLVESPLITCHILDLEADERROUTINGEVIDENCE,
    inertBinding: () => () => ({leaderNodeId: '', routableNodeIds: []}),
  },
  {
    property: LOCAL_STR_REPAIRSPLITCHILDLEADERROUTINGEVIDENCE,
    inertBinding: () => async () => false,
  },
  {
    property: LOCAL_STR_RESOLVEROUTINGWAITPOLLINTERVALMS,
    inertBinding: () => defaultRoutingWaitPollIntervalMs,
  },
  {
    property: LOCAL_STR_DELAY,
    inertBinding: () =>
      (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  },
]);

/**
 * Bind the workflow's topology collaborators and validate required adapter
 * methods at binding time.
 * @param {ManagedSplitWorkflow} workflow - Workflow instance.
 * @param {Object} options - Constructor options.
 * @return {void}
 */
function applyManagedSplitTopologyBindings(workflow, options) {
  applyWorkflowTopologyBindings(
    workflow,
    options,
    TOPOLOGY_METHOD_BINDINGS,
    WORKFLOW_NAME,
  );
  workflow.storageAdmissionService =
    options.storageAdmissionService ||
    workflow.topologyAdapter?.storageAdmissionService || null;
  workflow.messageRouter =
    options.messageRouter || workflow.topologyAdapter?.messageRouter || null;
  workflow.pressureGovernor = options.pressureGovernor || null;
}

export {
  applyManagedSplitTopologyBindings,
};
