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
const LOCAL_STR_RESOLVESPLITCHILDLEADERROUTINGEVIDENCE =
  'resolveSplitChildLeaderRoutingEvidence';
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
 * typed inert default built by `fallback(options, workflow)`.
 * @type {ReadonlyArray<{property: string, fallback: Function}>}
 */
const TOPOLOGY_METHOD_BINDINGS = Object.freeze([
  {
    property: LOCAL_STR_GETCDCINTEGRATIONSERVICE,
    fallback: (options) => () => options.cdcIntegrationService || null,
  },
  {property: LOCAL_STR_GETPARTITIONINFO, fallback: returnsNull},
  {property: LOCAL_STR_GETTABLEINFO, fallback: returnsNull},
  {property: LOCAL_STR_LISTTABLEINFOS, fallback: returnsEmptyList},
  {property: LOCAL_STR_PARSEPARTITIONTRANSITION, fallback: returnsNull},
  {property: LOCAL_STR_ISLOCALMANAGEDSPLITLEADER, fallback: returnsFalse},
  {property: LOCAL_STR_RESOLVEACTIVEPARTITIONVERSION, fallback: () => () => 1},
  {
    property: LOCAL_STR_BUILDMANAGEDSPLITPLAN,
    fallback: () => async () => {
      throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_START_FAILED);
    },
  },
  {property: LOCAL_STR_RESOLVEPROVISIONTARGETNODEIDS, fallback: returnsEmptyList},
  {
    property: LOCAL_STR_GETROUTABLEPARTITIONSERVICENODEIDS,
    fallback: returnsEmptyList,
  },
  {property: LOCAL_STR_ISSYSTEMTABLEPARTITIONID, fallback: returnsFalse},
  {property: LOCAL_STR_CAPTURETOPOLOGYSNAPSHOT, fallback: absent},
  {
    property: LOCAL_STR_CALCULATEQUORUMREPLICACOUNT,
    fallback: () => () => DEFAULT_QUORUM_REPLICA_COUNT,
  },
  {property: LOCAL_STR_CREATEEXECUTIONTIMEOUTBUDGET, fallback: absent},
  {
    property: LOCAL_STR_ESTIMATESPLITADMISSIONBYTES,
    fallback: (_options, workflow) =>
      (partitionInfo) => workflow.defaultEstimateSplitAdmissionBytes(partitionInfo),
  },
  {property: LOCAL_STR_WAITFORTABLEPARTITIONMETADATA, fallback: resolvesVoid},
  {property: LOCAL_STR_PROBEINITIALTABLEPARTITIONPROVISIONING, fallback: absent},
  {property: LOCAL_STR_PROVISIONINITIALTABLEPARTITION, fallback: resolvesVoid},
  {
    property: LOCAL_STR_STARTSPLITREPLICATIONONSOURCEPARTITION,
    fallback: resolvesVoid,
  },
  {property: LOCAL_STR_LISTTABLEPARTITIONROWS, fallback: returnsEmptyList},
  {property: LOCAL_STR_LISTPARTITIONSERVICEROWS, fallback: returnsEmptyList},
  {property: LOCAL_STR_DELIVERREPLICAREMOVAL, fallback: () => async () => null},
  // Cutover readiness evidence (child canonical leader + serve-routable
  // node ids) is observed from the query plane; the owner decides.
  {
    property: LOCAL_STR_RESOLVESPLITCHILDLEADERROUTINGEVIDENCE,
    fallback: () => () => ({leaderNodeId: '', routableNodeIds: []}),
  },
  {
    property: LOCAL_STR_RESOLVEROUTINGWAITPOLLINTERVALMS,
    fallback: () => defaultRoutingWaitPollIntervalMs,
  },
  {
    property: LOCAL_STR_DELAY,
    fallback: () =>
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
  for (const {property, fallback} of TOPOLOGY_METHOD_BINDINGS) {
    workflow[property] =
      bindTopologyMethod(workflow.topologyAdapter, property) ||
      options[property] ||
      fallback(options, workflow);
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
