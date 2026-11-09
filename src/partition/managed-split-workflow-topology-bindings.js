import {
  QUERY_ERROR_MSG,
} from '../query/query-constants.js';
import {
  defaultRoutingWaitPollIntervalMs,
} from './managed-split-workflow-cutover-readiness-methods.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_GETCDCINTEGRATIONSERVICE = 'getCDCIntegrationService';
const LOCAL_STR_GETPARTITIONINFO = 'getPartitionInfo';
const LOCAL_STR_GETTABLEINFO = 'getTableInfo';
const LOCAL_STR_LISTTABLEINFOS = 'listTableInfos';
const LOCAL_STR_PARSEPARTITIONTRANSITION = 'parsePartitionTransition';
const LOCAL_STR_ISLOCALMANAGEDSPLITLEADER = 'isLocalManagedSplitLeader';
const LOCAL_STR_RESOLVEACTIVEPARTITIONVERSION = 'resolveActivePartitionVersion';
const LOCAL_STR_BUILDMANAGEDSPLITPLAN = 'buildManagedSplitPlan';
const LOCAL_STR_RESOLVEPROVISIONTARGETNODEIDS = 'resolveProvisionTargetNodeIds';
const LOCAL_STR_GETROUTABLEPARTITIONSERVICENODEIDS = 'getRoutablePartitionServiceNodeIds';
const LOCAL_STR_ISSYSTEMTABLEPARTITIONID = 'isSystemTablePartitionId';
const LOCAL_STR_CAPTURETOPOLOGYSNAPSHOT = 'captureTopologySnapshot';
const LOCAL_STR_CALCULATEQUORUMREPLICACOUNT = 'calculateQuorumReplicaCount';
const LOCAL_STR_CREATEEXECUTIONTIMEOUTBUDGET = 'createExecutionTimeoutBudget';
const LOCAL_STR_ESTIMATESPLITADMISSIONBYTES = 'estimateSplitAdmissionBytes';
const LOCAL_STR_WAITFORTABLEPARTITIONMETADATA = 'waitForTablePartitionMetadata';
const LOCAL_STR_PROBEINITIALTABLEPARTITIONPROVISIONING = 'probeInitialTablePartitionProvisioning';
const LOCAL_STR_PROVISIONINITIALTABLEPARTITION = 'provisionInitialTablePartition';
const LOCAL_STR_STARTSPLITREPLICATIONONSOURCEPARTITION = 'startSplitReplicationOnSourcePartition';
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

const DEFAULT_QUORUM_REPLICA_COUNT = 1;

const returnsNull = () => () => null;
const returnsEmptyList = () => () => [];
const returnsFalse = () => () => false;
const resolvesVoid = () => async () => {};
const absent = () => null;

/**
 * Topology collaborators the ManagedSplitWorkflow owner observes, in
 * binding order. Each resolves to the topology adapter's method when
 * one is wired, else the explicit option of the same name, else the
 * typed inert default built by `inertBinding(options, workflow)`.
 * @type {ReadonlyArray<{property: string, inertBinding: Function}>}
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
  {property: LOCAL_STR_RESOLVEPROVISIONTARGETNODEIDS, inertBinding: returnsEmptyList},
  {
    property: LOCAL_STR_GETROUTABLEPARTITIONSERVICENODEIDS,
    inertBinding: returnsEmptyList,
  },
  {property: LOCAL_STR_ISSYSTEMTABLEPARTITIONID, inertBinding: returnsFalse},
  {property: LOCAL_STR_CAPTURETOPOLOGYSNAPSHOT, inertBinding: absent},
  {
    property: LOCAL_STR_CALCULATEQUORUMREPLICACOUNT,
    inertBinding: () => () => DEFAULT_QUORUM_REPLICA_COUNT,
  },
  {property: LOCAL_STR_CREATEEXECUTIONTIMEOUTBUDGET, inertBinding: absent},
  {
    property: LOCAL_STR_ESTIMATESPLITADMISSIONBYTES,
    inertBinding: (_options, workflow) =>
      (partitionInfo) => workflow.defaultEstimateSplitAdmissionBytes(partitionInfo),
  },
  {property: LOCAL_STR_WAITFORTABLEPARTITIONMETADATA, inertBinding: resolvesVoid},
  {property: LOCAL_STR_PROBEINITIALTABLEPARTITIONPROVISIONING, inertBinding: absent},
  {property: LOCAL_STR_PROVISIONINITIALTABLEPARTITION, inertBinding: resolvesVoid},
  {
    property: LOCAL_STR_STARTSPLITREPLICATIONONSOURCEPARTITION,
    inertBinding: resolvesVoid,
  },
  {property: LOCAL_STR_LISTTABLEPARTITIONROWS, inertBinding: returnsEmptyList},
  {property: LOCAL_STR_LISTPARTITIONSERVICEROWS, inertBinding: returnsEmptyList},
  {property: LOCAL_STR_DELIVERREPLICAREMOVAL, inertBinding: () => async () => null},
  // No reader: membership unavailable, never "no members".
  {property: LOCAL_STR_READCOMMITTEDGROUPMEMBERS, inertBinding: () => async () => []},
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

function bindTopologyMethod(topologyAdapter, methodName) {
  if (!topologyAdapter ||
      typeof topologyAdapter[methodName] !== LOCAL_STR_FUNCTION) {
    return null;
  }
  return topologyAdapter[methodName].bind(topologyAdapter);
}

/**
 * Bind the workflow's topology collaborators: every observation the
 * ManagedSplitWorkflow owner consumes comes from the topology adapter
 * when one is wired, else from the explicit option, else from a typed
 * inert default. The owner decides; these bindings only observe.
 * @param {ManagedSplitWorkflow} workflow - Workflow instance.
 * @param {Object} options - Constructor options.
 * @return {void}
 */
function applyManagedSplitTopologyBindings(workflow, options) {
  for (const {property, inertBinding} of TOPOLOGY_METHOD_BINDINGS) {
    workflow[property] =
      bindTopologyMethod(workflow.topologyAdapter, property) ||
      options[property] ||
      inertBinding(options, workflow);
  }
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
