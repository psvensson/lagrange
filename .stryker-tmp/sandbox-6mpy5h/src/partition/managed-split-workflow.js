// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { TABLES } from '../constants/index.js';
import { QUERY_ERROR_MSG, QUERY_LOG_MSG } from '../query/query-constants.js';
import { PRESSURE_GOVERNOR_ACTION, PRESSURE_WORK_CLASS, PressureGovernor } from '../control-plane/pressure-governor.js';
import { CONTROL_PLANE_MUTATION_OPERATION } from '../control-plane/control-plane-system-table-gateway.js';
import { createControlPlaneRuntimeBundle } from '../control-plane/control-plane-runtime-bundle.js';
import { CONTROL_PLANE_READINESS_DIMENSION, CONTROL_PLANE_READINESS_REASON } from '../control-plane/control-plane-readiness-constants.js';
import { STORAGE_ADMISSION_DECISION_TYPE, STORAGE_ADMISSION_OPERATION_TYPE, STORAGE_ADMISSION_REASON } from '../rebalancer/storage-admission-constants.js';
import { TIMEOUT_BUDGET_DEFAULT } from '../control-plane/timeout-budget.js';
import { DurableWorkflowCoordinator } from '../workflow/durable-workflow-coordinator.js';
import { OperationLane } from '../workflow/operation-lane.js';
import { TimeoutPolicy } from '../workflow/timeout-policy.js';
import { WorkflowStepRunner } from '../workflow/workflow-step-runner.js';
import { PARTITION_TRANSITION_METADATA_FIELD, PARTITION_TRANSITION_STATE, RETRYABLE_PARTITION_TRANSITION_STATES, SPLIT_OWNER_MANAGED_PHASES, SPLIT_MERGE_LOG_MSG } from './partition-constants.js';
import { SPLIT_PARTICIPANT_PREFIX } from './split-ack-constants.js';
import { isRetryableManagedSplitExecutionFailure, isRetryableManagedSplitTransition, resolveRetryableManagedSplitExecutionDecisionType } from './managed-split-retry-policy.js';
const ACTIVE_PARTITION_STATE = stryMutAct_9fa48("97923") ? "" : (stryCov_9fa48("97923"), 'NORMAL');
const DEFAULT_QUORUM_REPLICA_COUNT = 1;
const CRITICAL_SPLIT_MINIMUM_ROUTABLE_SOURCE_COUNT = 1;
const DEFAULT_RETRY_BASE_DELAY_MS = 5000;
const DEFAULT_RETRY_MAX_DELAY_MS = 60000;
const SPLIT_BOOTSTRAP_ROUTING_READINESS_DIMENSION = CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
function bindTopologyMethod(topologyAdapter, methodName) {
  if (stryMutAct_9fa48("97924")) {
    {}
  } else {
    stryCov_9fa48("97924");
    if (stryMutAct_9fa48("97927") ? !topologyAdapter && typeof topologyAdapter[methodName] !== 'function' : stryMutAct_9fa48("97926") ? false : stryMutAct_9fa48("97925") ? true : (stryCov_9fa48("97925", "97926", "97927"), (stryMutAct_9fa48("97928") ? topologyAdapter : (stryCov_9fa48("97928"), !topologyAdapter)) || (stryMutAct_9fa48("97930") ? typeof topologyAdapter[methodName] === 'function' : stryMutAct_9fa48("97929") ? false : (stryCov_9fa48("97929", "97930"), typeof topologyAdapter[methodName] !== (stryMutAct_9fa48("97931") ? "" : (stryCov_9fa48("97931"), 'function')))))) {
      if (stryMutAct_9fa48("97932")) {
        {}
      } else {
        stryCov_9fa48("97932");
        return null;
      }
    }
    return topologyAdapter[methodName].bind(topologyAdapter);
  }
}

/**
 * First-class managed split workflow owner.
 */
class ManagedSplitWorkflow {
  /**
   * @param {Object} options - Workflow options.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("97933")) {
      {}
    } else {
      stryCov_9fa48("97933");
      this.nodeId = stryMutAct_9fa48("97936") ? options.nodeId && null : stryMutAct_9fa48("97935") ? false : stryMutAct_9fa48("97934") ? true : (stryCov_9fa48("97934", "97935", "97936"), options.nodeId || null);
      this.topologyAdapter = stryMutAct_9fa48("97939") ? options.topologyAdapter && null : stryMutAct_9fa48("97938") ? false : stryMutAct_9fa48("97937") ? true : (stryCov_9fa48("97937", "97938", "97939"), options.topologyAdapter || null);
      this.getCDCIntegrationService = stryMutAct_9fa48("97942") ? (bindTopologyMethod(this.topologyAdapter, 'getCDCIntegrationService') || options.getCDCIntegrationService) && (() => options.cdcIntegrationService || null) : stryMutAct_9fa48("97941") ? false : stryMutAct_9fa48("97940") ? true : (stryCov_9fa48("97940", "97941", "97942"), (stryMutAct_9fa48("97944") ? bindTopologyMethod(this.topologyAdapter, 'getCDCIntegrationService') && options.getCDCIntegrationService : stryMutAct_9fa48("97943") ? false : (stryCov_9fa48("97943", "97944"), bindTopologyMethod(this.topologyAdapter, stryMutAct_9fa48("97945") ? "" : (stryCov_9fa48("97945"), 'getCDCIntegrationService')) || options.getCDCIntegrationService)) || (stryMutAct_9fa48("97946") ? () => undefined : (stryCov_9fa48("97946"), () => stryMutAct_9fa48("97949") ? options.cdcIntegrationService && null : stryMutAct_9fa48("97948") ? false : stryMutAct_9fa48("97947") ? true : (stryCov_9fa48("97947", "97948", "97949"), options.cdcIntegrationService || null))));
      this.getPartitionInfo = stryMutAct_9fa48("97952") ? (bindTopologyMethod(this.topologyAdapter, 'getPartitionInfo') || options.getPartitionInfo) && (() => null) : stryMutAct_9fa48("97951") ? false : stryMutAct_9fa48("97950") ? true : (stryCov_9fa48("97950", "97951", "97952"), (stryMutAct_9fa48("97954") ? bindTopologyMethod(this.topologyAdapter, 'getPartitionInfo') && options.getPartitionInfo : stryMutAct_9fa48("97953") ? false : (stryCov_9fa48("97953", "97954"), bindTopologyMethod(this.topologyAdapter, stryMutAct_9fa48("97955") ? "" : (stryCov_9fa48("97955"), 'getPartitionInfo')) || options.getPartitionInfo)) || (stryMutAct_9fa48("97956") ? () => undefined : (stryCov_9fa48("97956"), () => null)));
      this.getTableInfo = stryMutAct_9fa48("97959") ? (bindTopologyMethod(this.topologyAdapter, 'getTableInfo') || options.getTableInfo) && (() => null) : stryMutAct_9fa48("97958") ? false : stryMutAct_9fa48("97957") ? true : (stryCov_9fa48("97957", "97958", "97959"), (stryMutAct_9fa48("97961") ? bindTopologyMethod(this.topologyAdapter, 'getTableInfo') && options.getTableInfo : stryMutAct_9fa48("97960") ? false : (stryCov_9fa48("97960", "97961"), bindTopologyMethod(this.topologyAdapter, stryMutAct_9fa48("97962") ? "" : (stryCov_9fa48("97962"), 'getTableInfo')) || options.getTableInfo)) || (stryMutAct_9fa48("97963") ? () => undefined : (stryCov_9fa48("97963"), () => null)));
      this.listTableInfos = stryMutAct_9fa48("97966") ? (bindTopologyMethod(this.topologyAdapter, 'listTableInfos') || options.listTableInfos) && (() => []) : stryMutAct_9fa48("97965") ? false : stryMutAct_9fa48("97964") ? true : (stryCov_9fa48("97964", "97965", "97966"), (stryMutAct_9fa48("97968") ? bindTopologyMethod(this.topologyAdapter, 'listTableInfos') && options.listTableInfos : stryMutAct_9fa48("97967") ? false : (stryCov_9fa48("97967", "97968"), bindTopologyMethod(this.topologyAdapter, stryMutAct_9fa48("97969") ? "" : (stryCov_9fa48("97969"), 'listTableInfos')) || options.listTableInfos)) || (stryMutAct_9fa48("97970") ? () => undefined : (stryCov_9fa48("97970"), () => stryMutAct_9fa48("97971") ? ["Stryker was here"] : (stryCov_9fa48("97971"), []))));
      this.parsePartitionTransition = stryMutAct_9fa48("97974") ? (bindTopologyMethod(this.topologyAdapter, 'parsePartitionTransition') || options.parsePartitionTransition) && (() => null) : stryMutAct_9fa48("97973") ? false : stryMutAct_9fa48("97972") ? true : (stryCov_9fa48("97972", "97973", "97974"), (stryMutAct_9fa48("97976") ? bindTopologyMethod(this.topologyAdapter, 'parsePartitionTransition') && options.parsePartitionTransition : stryMutAct_9fa48("97975") ? false : (stryCov_9fa48("97975", "97976"), bindTopologyMethod(this.topologyAdapter, stryMutAct_9fa48("97977") ? "" : (stryCov_9fa48("97977"), 'parsePartitionTransition')) || options.parsePartitionTransition)) || (stryMutAct_9fa48("97978") ? () => undefined : (stryCov_9fa48("97978"), () => null)));
      this.isLocalManagedSplitLeader = stryMutAct_9fa48("97981") ? (bindTopologyMethod(this.topologyAdapter, 'isLocalManagedSplitLeader') || options.isLocalManagedSplitLeader) && (() => false) : stryMutAct_9fa48("97980") ? false : stryMutAct_9fa48("97979") ? true : (stryCov_9fa48("97979", "97980", "97981"), (stryMutAct_9fa48("97983") ? bindTopologyMethod(this.topologyAdapter, 'isLocalManagedSplitLeader') && options.isLocalManagedSplitLeader : stryMutAct_9fa48("97982") ? false : (stryCov_9fa48("97982", "97983"), bindTopologyMethod(this.topologyAdapter, stryMutAct_9fa48("97984") ? "" : (stryCov_9fa48("97984"), 'isLocalManagedSplitLeader')) || options.isLocalManagedSplitLeader)) || (stryMutAct_9fa48("97985") ? () => undefined : (stryCov_9fa48("97985"), () => stryMutAct_9fa48("97986") ? true : (stryCov_9fa48("97986"), false))));
      this.resolveActivePartitionVersion = stryMutAct_9fa48("97989") ? (bindTopologyMethod(this.topologyAdapter, 'resolveActivePartitionVersion') || options.resolveActivePartitionVersion) && (() => 1) : stryMutAct_9fa48("97988") ? false : stryMutAct_9fa48("97987") ? true : (stryCov_9fa48("97987", "97988", "97989"), (stryMutAct_9fa48("97991") ? bindTopologyMethod(this.topologyAdapter, 'resolveActivePartitionVersion') && options.resolveActivePartitionVersion : stryMutAct_9fa48("97990") ? false : (stryCov_9fa48("97990", "97991"), bindTopologyMethod(this.topologyAdapter, stryMutAct_9fa48("97992") ? "" : (stryCov_9fa48("97992"), 'resolveActivePartitionVersion')) || options.resolveActivePartitionVersion)) || (stryMutAct_9fa48("97993") ? () => undefined : (stryCov_9fa48("97993"), () => 1)));
      this.buildManagedSplitPlan = stryMutAct_9fa48("97996") ? (bindTopologyMethod(this.topologyAdapter, 'buildManagedSplitPlan') || options.buildManagedSplitPlan) && (async () => {
        throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_START_FAILED);
      }) : stryMutAct_9fa48("97995") ? false : stryMutAct_9fa48("97994") ? true : (stryCov_9fa48("97994", "97995", "97996"), (stryMutAct_9fa48("97998") ? bindTopologyMethod(this.topologyAdapter, 'buildManagedSplitPlan') && options.buildManagedSplitPlan : stryMutAct_9fa48("97997") ? false : (stryCov_9fa48("97997", "97998"), bindTopologyMethod(this.topologyAdapter, stryMutAct_9fa48("97999") ? "" : (stryCov_9fa48("97999"), 'buildManagedSplitPlan')) || options.buildManagedSplitPlan)) || (async () => {
        if (stryMutAct_9fa48("98000")) {
          {}
        } else {
          stryCov_9fa48("98000");
          throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_START_FAILED);
        }
      }));
      this.resolveProvisionTargetNodeIds = stryMutAct_9fa48("98003") ? (bindTopologyMethod(this.topologyAdapter, 'resolveProvisionTargetNodeIds') || options.resolveProvisionTargetNodeIds) && (() => []) : stryMutAct_9fa48("98002") ? false : stryMutAct_9fa48("98001") ? true : (stryCov_9fa48("98001", "98002", "98003"), (stryMutAct_9fa48("98005") ? bindTopologyMethod(this.topologyAdapter, 'resolveProvisionTargetNodeIds') && options.resolveProvisionTargetNodeIds : stryMutAct_9fa48("98004") ? false : (stryCov_9fa48("98004", "98005"), bindTopologyMethod(this.topologyAdapter, stryMutAct_9fa48("98006") ? "" : (stryCov_9fa48("98006"), 'resolveProvisionTargetNodeIds')) || options.resolveProvisionTargetNodeIds)) || (stryMutAct_9fa48("98007") ? () => undefined : (stryCov_9fa48("98007"), () => stryMutAct_9fa48("98008") ? ["Stryker was here"] : (stryCov_9fa48("98008"), []))));
      this.getRoutablePartitionServiceNodeIds = stryMutAct_9fa48("98011") ? (bindTopologyMethod(this.topologyAdapter, 'getRoutablePartitionServiceNodeIds') || options.getRoutablePartitionServiceNodeIds) && (() => []) : stryMutAct_9fa48("98010") ? false : stryMutAct_9fa48("98009") ? true : (stryCov_9fa48("98009", "98010", "98011"), (stryMutAct_9fa48("98013") ? bindTopologyMethod(this.topologyAdapter, 'getRoutablePartitionServiceNodeIds') && options.getRoutablePartitionServiceNodeIds : stryMutAct_9fa48("98012") ? false : (stryCov_9fa48("98012", "98013"), bindTopologyMethod(this.topologyAdapter, stryMutAct_9fa48("98014") ? "" : (stryCov_9fa48("98014"), 'getRoutablePartitionServiceNodeIds')) || options.getRoutablePartitionServiceNodeIds)) || (stryMutAct_9fa48("98015") ? () => undefined : (stryCov_9fa48("98015"), () => stryMutAct_9fa48("98016") ? ["Stryker was here"] : (stryCov_9fa48("98016"), []))));
      this.isCriticalSystemPartition = stryMutAct_9fa48("98019") ? (bindTopologyMethod(this.topologyAdapter, 'isCriticalSystemPartition') || options.isCriticalSystemPartition) && (() => false) : stryMutAct_9fa48("98018") ? false : stryMutAct_9fa48("98017") ? true : (stryCov_9fa48("98017", "98018", "98019"), (stryMutAct_9fa48("98021") ? bindTopologyMethod(this.topologyAdapter, 'isCriticalSystemPartition') && options.isCriticalSystemPartition : stryMutAct_9fa48("98020") ? false : (stryCov_9fa48("98020", "98021"), bindTopologyMethod(this.topologyAdapter, stryMutAct_9fa48("98022") ? "" : (stryCov_9fa48("98022"), 'isCriticalSystemPartition')) || options.isCriticalSystemPartition)) || (stryMutAct_9fa48("98023") ? () => undefined : (stryCov_9fa48("98023"), () => stryMutAct_9fa48("98024") ? true : (stryCov_9fa48("98024"), false))));
      this.captureTopologySnapshot = stryMutAct_9fa48("98027") ? (bindTopologyMethod(this.topologyAdapter, 'captureTopologySnapshot') || options.captureTopologySnapshot) && null : stryMutAct_9fa48("98026") ? false : stryMutAct_9fa48("98025") ? true : (stryCov_9fa48("98025", "98026", "98027"), (stryMutAct_9fa48("98029") ? bindTopologyMethod(this.topologyAdapter, 'captureTopologySnapshot') && options.captureTopologySnapshot : stryMutAct_9fa48("98028") ? false : (stryCov_9fa48("98028", "98029"), bindTopologyMethod(this.topologyAdapter, stryMutAct_9fa48("98030") ? "" : (stryCov_9fa48("98030"), 'captureTopologySnapshot')) || options.captureTopologySnapshot)) || null);
      this.calculateQuorumReplicaCount = stryMutAct_9fa48("98033") ? (bindTopologyMethod(this.topologyAdapter, 'calculateQuorumReplicaCount') || options.calculateQuorumReplicaCount) && (() => DEFAULT_QUORUM_REPLICA_COUNT) : stryMutAct_9fa48("98032") ? false : stryMutAct_9fa48("98031") ? true : (stryCov_9fa48("98031", "98032", "98033"), (stryMutAct_9fa48("98035") ? bindTopologyMethod(this.topologyAdapter, 'calculateQuorumReplicaCount') && options.calculateQuorumReplicaCount : stryMutAct_9fa48("98034") ? false : (stryCov_9fa48("98034", "98035"), bindTopologyMethod(this.topologyAdapter, stryMutAct_9fa48("98036") ? "" : (stryCov_9fa48("98036"), 'calculateQuorumReplicaCount')) || options.calculateQuorumReplicaCount)) || (stryMutAct_9fa48("98037") ? () => undefined : (stryCov_9fa48("98037"), () => DEFAULT_QUORUM_REPLICA_COUNT)));
      this.storageAdmissionService = stryMutAct_9fa48("98040") ? (options.storageAdmissionService || this.topologyAdapter?.storageAdmissionService) && null : stryMutAct_9fa48("98039") ? false : stryMutAct_9fa48("98038") ? true : (stryCov_9fa48("98038", "98039", "98040"), (stryMutAct_9fa48("98042") ? options.storageAdmissionService && this.topologyAdapter?.storageAdmissionService : stryMutAct_9fa48("98041") ? false : (stryCov_9fa48("98041", "98042"), options.storageAdmissionService || (stryMutAct_9fa48("98043") ? this.topologyAdapter.storageAdmissionService : (stryCov_9fa48("98043"), this.topologyAdapter?.storageAdmissionService)))) || null);
      this.createExecutionTimeoutBudget = stryMutAct_9fa48("98046") ? (bindTopologyMethod(this.topologyAdapter, 'createExecutionTimeoutBudget') || options.createExecutionTimeoutBudget) && null : stryMutAct_9fa48("98045") ? false : stryMutAct_9fa48("98044") ? true : (stryCov_9fa48("98044", "98045", "98046"), (stryMutAct_9fa48("98048") ? bindTopologyMethod(this.topologyAdapter, 'createExecutionTimeoutBudget') && options.createExecutionTimeoutBudget : stryMutAct_9fa48("98047") ? false : (stryCov_9fa48("98047", "98048"), bindTopologyMethod(this.topologyAdapter, stryMutAct_9fa48("98049") ? "" : (stryCov_9fa48("98049"), 'createExecutionTimeoutBudget')) || options.createExecutionTimeoutBudget)) || null);
      this.messageRouter = stryMutAct_9fa48("98052") ? (options.messageRouter || this.topologyAdapter?.messageRouter) && null : stryMutAct_9fa48("98051") ? false : stryMutAct_9fa48("98050") ? true : (stryCov_9fa48("98050", "98051", "98052"), (stryMutAct_9fa48("98054") ? options.messageRouter && this.topologyAdapter?.messageRouter : stryMutAct_9fa48("98053") ? false : (stryCov_9fa48("98053", "98054"), options.messageRouter || (stryMutAct_9fa48("98055") ? this.topologyAdapter.messageRouter : (stryCov_9fa48("98055"), this.topologyAdapter?.messageRouter)))) || null);
      this.pressureGovernor = stryMutAct_9fa48("98058") ? options.pressureGovernor && null : stryMutAct_9fa48("98057") ? false : stryMutAct_9fa48("98056") ? true : (stryCov_9fa48("98056", "98057", "98058"), options.pressureGovernor || null);
      this.estimateSplitAdmissionBytes = stryMutAct_9fa48("98061") ? (bindTopologyMethod(this.topologyAdapter, 'estimateSplitAdmissionBytes') || options.estimateSplitAdmissionBytes) && (partitionInfo => this.defaultEstimateSplitAdmissionBytes(partitionInfo)) : stryMutAct_9fa48("98060") ? false : stryMutAct_9fa48("98059") ? true : (stryCov_9fa48("98059", "98060", "98061"), (stryMutAct_9fa48("98063") ? bindTopologyMethod(this.topologyAdapter, 'estimateSplitAdmissionBytes') && options.estimateSplitAdmissionBytes : stryMutAct_9fa48("98062") ? false : (stryCov_9fa48("98062", "98063"), bindTopologyMethod(this.topologyAdapter, stryMutAct_9fa48("98064") ? "" : (stryCov_9fa48("98064"), 'estimateSplitAdmissionBytes')) || options.estimateSplitAdmissionBytes)) || (stryMutAct_9fa48("98065") ? () => undefined : (stryCov_9fa48("98065"), partitionInfo => this.defaultEstimateSplitAdmissionBytes(partitionInfo))));
      this.waitForTablePartitionMetadata = stryMutAct_9fa48("98068") ? (bindTopologyMethod(this.topologyAdapter, 'waitForTablePartitionMetadata') || options.waitForTablePartitionMetadata) && (async () => {}) : stryMutAct_9fa48("98067") ? false : stryMutAct_9fa48("98066") ? true : (stryCov_9fa48("98066", "98067", "98068"), (stryMutAct_9fa48("98070") ? bindTopologyMethod(this.topologyAdapter, 'waitForTablePartitionMetadata') && options.waitForTablePartitionMetadata : stryMutAct_9fa48("98069") ? false : (stryCov_9fa48("98069", "98070"), bindTopologyMethod(this.topologyAdapter, stryMutAct_9fa48("98071") ? "" : (stryCov_9fa48("98071"), 'waitForTablePartitionMetadata')) || options.waitForTablePartitionMetadata)) || (async () => {}));
      this.probeInitialTablePartitionProvisioning = stryMutAct_9fa48("98074") ? (bindTopologyMethod(this.topologyAdapter, 'probeInitialTablePartitionProvisioning') || options.probeInitialTablePartitionProvisioning) && null : stryMutAct_9fa48("98073") ? false : stryMutAct_9fa48("98072") ? true : (stryCov_9fa48("98072", "98073", "98074"), (stryMutAct_9fa48("98076") ? bindTopologyMethod(this.topologyAdapter, 'probeInitialTablePartitionProvisioning') && options.probeInitialTablePartitionProvisioning : stryMutAct_9fa48("98075") ? false : (stryCov_9fa48("98075", "98076"), bindTopologyMethod(this.topologyAdapter, stryMutAct_9fa48("98077") ? "" : (stryCov_9fa48("98077"), 'probeInitialTablePartitionProvisioning')) || options.probeInitialTablePartitionProvisioning)) || null);
      this.provisionInitialTablePartition = stryMutAct_9fa48("98080") ? (bindTopologyMethod(this.topologyAdapter, 'provisionInitialTablePartition') || options.provisionInitialTablePartition) && (async () => {}) : stryMutAct_9fa48("98079") ? false : stryMutAct_9fa48("98078") ? true : (stryCov_9fa48("98078", "98079", "98080"), (stryMutAct_9fa48("98082") ? bindTopologyMethod(this.topologyAdapter, 'provisionInitialTablePartition') && options.provisionInitialTablePartition : stryMutAct_9fa48("98081") ? false : (stryCov_9fa48("98081", "98082"), bindTopologyMethod(this.topologyAdapter, stryMutAct_9fa48("98083") ? "" : (stryCov_9fa48("98083"), 'provisionInitialTablePartition')) || options.provisionInitialTablePartition)) || (async () => {}));
      this.startSplitReplicationOnSourcePartition = stryMutAct_9fa48("98086") ? (bindTopologyMethod(this.topologyAdapter, 'startSplitReplicationOnSourcePartition') || options.startSplitReplicationOnSourcePartition) && (async () => {}) : stryMutAct_9fa48("98085") ? false : stryMutAct_9fa48("98084") ? true : (stryCov_9fa48("98084", "98085", "98086"), (stryMutAct_9fa48("98088") ? bindTopologyMethod(this.topologyAdapter, 'startSplitReplicationOnSourcePartition') && options.startSplitReplicationOnSourcePartition : stryMutAct_9fa48("98087") ? false : (stryCov_9fa48("98087", "98088"), bindTopologyMethod(this.topologyAdapter, stryMutAct_9fa48("98089") ? "" : (stryCov_9fa48("98089"), 'startSplitReplicationOnSourcePartition')) || options.startSplitReplicationOnSourcePartition)) || (async () => {}));
      this.logger = stryMutAct_9fa48("98092") ? (options.logger || this.topologyAdapter?.logger) && console : stryMutAct_9fa48("98091") ? false : stryMutAct_9fa48("98090") ? true : (stryCov_9fa48("98090", "98091", "98092"), (stryMutAct_9fa48("98094") ? options.logger && this.topologyAdapter?.logger : stryMutAct_9fa48("98093") ? false : (stryCov_9fa48("98093", "98094"), options.logger || (stryMutAct_9fa48("98095") ? this.topologyAdapter.logger : (stryCov_9fa48("98095"), this.topologyAdapter?.logger)))) || console);
      this.now = stryMutAct_9fa48("98098") ? options.now && (() => Date.now()) : stryMutAct_9fa48("98097") ? false : stryMutAct_9fa48("98096") ? true : (stryCov_9fa48("98096", "98097", "98098"), options.now || (stryMutAct_9fa48("98099") ? () => undefined : (stryCov_9fa48("98099"), () => Date.now())));
      this.retryBaseDelayMs = (stryMutAct_9fa48("98102") ? Number.isFinite(options.retryBaseDelayMs) || options.retryBaseDelayMs > 0 : stryMutAct_9fa48("98101") ? false : stryMutAct_9fa48("98100") ? true : (stryCov_9fa48("98100", "98101", "98102"), Number.isFinite(options.retryBaseDelayMs) && (stryMutAct_9fa48("98105") ? options.retryBaseDelayMs <= 0 : stryMutAct_9fa48("98104") ? options.retryBaseDelayMs >= 0 : stryMutAct_9fa48("98103") ? true : (stryCov_9fa48("98103", "98104", "98105"), options.retryBaseDelayMs > 0)))) ? Math.floor(options.retryBaseDelayMs) : DEFAULT_RETRY_BASE_DELAY_MS;
      this.retryMaxDelayMs = (stryMutAct_9fa48("98108") ? Number.isFinite(options.retryMaxDelayMs) || options.retryMaxDelayMs > 0 : stryMutAct_9fa48("98107") ? false : stryMutAct_9fa48("98106") ? true : (stryCov_9fa48("98106", "98107", "98108"), Number.isFinite(options.retryMaxDelayMs) && (stryMutAct_9fa48("98111") ? options.retryMaxDelayMs <= 0 : stryMutAct_9fa48("98110") ? options.retryMaxDelayMs >= 0 : stryMutAct_9fa48("98109") ? true : (stryCov_9fa48("98109", "98110", "98111"), options.retryMaxDelayMs > 0)))) ? Math.floor(options.retryMaxDelayMs) : DEFAULT_RETRY_MAX_DELAY_MS;
      this.transactionCoordinator = stryMutAct_9fa48("98114") ? (options.transactionCoordinator || this.topologyAdapter?.transactionCoordinator) && null : stryMutAct_9fa48("98113") ? false : stryMutAct_9fa48("98112") ? true : (stryCov_9fa48("98112", "98113", "98114"), (stryMutAct_9fa48("98116") ? options.transactionCoordinator && this.topologyAdapter?.transactionCoordinator : stryMutAct_9fa48("98115") ? false : (stryCov_9fa48("98115", "98116"), options.transactionCoordinator || (stryMutAct_9fa48("98117") ? this.topologyAdapter.transactionCoordinator : (stryCov_9fa48("98117"), this.topologyAdapter?.transactionCoordinator)))) || null);
      this.workflowCoordinator = stryMutAct_9fa48("98120") ? options.workflowCoordinator && new DurableWorkflowCoordinator({
        persistWorkflow: async workflow => this.persistWorkflowTransition(workflow),
        persistParticipant: async participant => this.persistWorkflowParticipantState(participant),
        now: this.now
      }) : stryMutAct_9fa48("98119") ? false : stryMutAct_9fa48("98118") ? true : (stryCov_9fa48("98118", "98119", "98120"), options.workflowCoordinator || new DurableWorkflowCoordinator(stryMutAct_9fa48("98121") ? {} : (stryCov_9fa48("98121"), {
        persistWorkflow: stryMutAct_9fa48("98122") ? () => undefined : (stryCov_9fa48("98122"), async workflow => this.persistWorkflowTransition(workflow)),
        persistParticipant: stryMutAct_9fa48("98123") ? () => undefined : (stryCov_9fa48("98123"), async participant => this.persistWorkflowParticipantState(participant)),
        now: this.now
      })));
      this.executionTimeoutPolicy = stryMutAct_9fa48("98126") ? options.executionTimeoutPolicy && new TimeoutPolicy({
        operationName: 'managed_split',
        configuredBudgetMs: TIMEOUT_BUDGET_DEFAULT.SPLIT_OPERATION_BUDGET_MS,
        now: this.now
      }) : stryMutAct_9fa48("98125") ? false : stryMutAct_9fa48("98124") ? true : (stryCov_9fa48("98124", "98125", "98126"), options.executionTimeoutPolicy || new TimeoutPolicy(stryMutAct_9fa48("98127") ? {} : (stryCov_9fa48("98127"), {
        operationName: stryMutAct_9fa48("98128") ? "" : (stryCov_9fa48("98128"), 'managed_split'),
        configuredBudgetMs: TIMEOUT_BUDGET_DEFAULT.SPLIT_OPERATION_BUDGET_MS,
        now: this.now
      })));
      this.splitOperationLane = stryMutAct_9fa48("98131") ? options.splitOperationLane && new OperationLane({
        name: 'managed-split-workflow',
        workflowCoordinator: this.workflowCoordinator,
        ownerKeyFactory: ({
          partitionId,
          ownerKey
        }) => String(ownerKey || partitionId || '')
      }) : stryMutAct_9fa48("98130") ? false : stryMutAct_9fa48("98129") ? true : (stryCov_9fa48("98129", "98130", "98131"), options.splitOperationLane || new OperationLane(stryMutAct_9fa48("98132") ? {} : (stryCov_9fa48("98132"), {
        name: stryMutAct_9fa48("98133") ? "" : (stryCov_9fa48("98133"), 'managed-split-workflow'),
        workflowCoordinator: this.workflowCoordinator,
        ownerKeyFactory: stryMutAct_9fa48("98134") ? () => undefined : (stryCov_9fa48("98134"), ({
          partitionId,
          ownerKey
        }) => String(stryMutAct_9fa48("98137") ? (ownerKey || partitionId) && '' : stryMutAct_9fa48("98136") ? false : stryMutAct_9fa48("98135") ? true : (stryCov_9fa48("98135", "98136", "98137"), (stryMutAct_9fa48("98139") ? ownerKey && partitionId : stryMutAct_9fa48("98138") ? false : (stryCov_9fa48("98138", "98139"), ownerKey || partitionId)) || (stryMutAct_9fa48("98140") ? "Stryker was here!" : (stryCov_9fa48("98140"), '')))))
      })));
      this.workflowStepRunner = stryMutAct_9fa48("98143") ? options.workflowStepRunner && new WorkflowStepRunner({
        workflowCoordinator: this.workflowCoordinator,
        operationLane: this.splitOperationLane,
        timeoutPolicy: this.executionTimeoutPolicy,
        now: this.now
      }) : stryMutAct_9fa48("98142") ? false : stryMutAct_9fa48("98141") ? true : (stryCov_9fa48("98141", "98142", "98143"), options.workflowStepRunner || new WorkflowStepRunner(stryMutAct_9fa48("98144") ? {} : (stryCov_9fa48("98144"), {
        workflowCoordinator: this.workflowCoordinator,
        operationLane: this.splitOperationLane,
        timeoutPolicy: this.executionTimeoutPolicy,
        now: this.now
      })));
    }
  }

  /**
   * Execute one managed partition split.
   * @param {string} partitionId - Source partition ID.
   * @param {Object} [executionOptions={}] - Optional admission metadata.
   * @return {Promise<Object>} Split orchestration result.
   */
  execute(partitionId, executionOptions = {}) {
    if (stryMutAct_9fa48("98145")) {
      {}
    } else {
      stryCov_9fa48("98145");
      if (stryMutAct_9fa48("98148") ? false : stryMutAct_9fa48("98147") ? true : stryMutAct_9fa48("98146") ? partitionId : (stryCov_9fa48("98146", "98147", "98148"), !partitionId)) {
        if (stryMutAct_9fa48("98149")) {
          {}
        } else {
          stryCov_9fa48("98149");
          throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_PARTITION_NOT_FOUND);
        }
      }
      return this.splitOperationLane.run(stryMutAct_9fa48("98150") ? {} : (stryCov_9fa48("98150"), {
        partitionId,
        ...executionOptions
      }), stryMutAct_9fa48("98151") ? () => undefined : (stryCov_9fa48("98151"), async laneExecution => this.executeInternal(partitionId, stryMutAct_9fa48("98152") ? {} : (stryCov_9fa48("98152"), {
        ...executionOptions,
        timeoutBudget: stryMutAct_9fa48("98155") ? (laneExecution?.timeoutBudget || executionOptions.timeoutBudget) && null : stryMutAct_9fa48("98154") ? false : stryMutAct_9fa48("98153") ? true : (stryCov_9fa48("98153", "98154", "98155"), (stryMutAct_9fa48("98157") ? laneExecution?.timeoutBudget && executionOptions.timeoutBudget : stryMutAct_9fa48("98156") ? false : (stryCov_9fa48("98156", "98157"), (stryMutAct_9fa48("98158") ? laneExecution.timeoutBudget : (stryCov_9fa48("98158"), laneExecution?.timeoutBudget)) || executionOptions.timeoutBudget)) || null)
      }))));
    }
  }

  /**
   * Resolve the shared pressure governor for this node.
   * @return {PressureGovernor}
   * @private
   */
  getPressureGovernor() {
    if (stryMutAct_9fa48("98159")) {
      {}
    } else {
      stryCov_9fa48("98159");
      if (stryMutAct_9fa48("98161") ? false : stryMutAct_9fa48("98160") ? true : (stryCov_9fa48("98160", "98161"), this.pressureGovernor)) {
        if (stryMutAct_9fa48("98162")) {
          {}
        } else {
          stryCov_9fa48("98162");
          stryMutAct_9fa48("98163") ? this.pressureGovernor.configure({
            messageRouter: this.messageRouter
          }) : (stryCov_9fa48("98163"), this.pressureGovernor.configure?.(stryMutAct_9fa48("98164") ? {} : (stryCov_9fa48("98164"), {
            messageRouter: this.messageRouter
          })));
          return this.pressureGovernor;
        }
      }
      this.pressureGovernor = PressureGovernor.getShared(stryMutAct_9fa48("98165") ? {} : (stryCov_9fa48("98165"), {
        nodeId: this.nodeId,
        messageRouter: this.messageRouter
      }));
      return this.pressureGovernor;
    }
  }

  /**
   * Evaluate node-local pressure for split execution.
   * @param {Object} [executionContext={}]
   * @return {Object}
   * @private
   */
  evaluatePressure(executionContext = {}) {
    if (stryMutAct_9fa48("98166")) {
      {}
    } else {
      stryCov_9fa48("98166");
      return this.getPressureGovernor().evaluate(stryMutAct_9fa48("98167") ? {} : (stryCov_9fa48("98167"), {
        workClass: stryMutAct_9fa48("98170") ? executionContext.workClass && PRESSURE_WORK_CLASS.BACKGROUND : stryMutAct_9fa48("98169") ? false : stryMutAct_9fa48("98168") ? true : (stryCov_9fa48("98168", "98169", "98170"), executionContext.workClass || PRESSURE_WORK_CLASS.BACKGROUND),
        resourceKeys: stryMutAct_9fa48("98171") ? [] : (stryCov_9fa48("98171"), [stryMutAct_9fa48("98172") ? "" : (stryCov_9fa48("98172"), 'partition:split:workflow'), stryMutAct_9fa48("98173") ? "" : (stryCov_9fa48("98173"), 'control-plane:write')]),
        allowDegrade: stryMutAct_9fa48("98174") ? true : (stryCov_9fa48("98174"), false),
        allowDefer: stryMutAct_9fa48("98177") ? executionContext.allowPressureDefer === false : stryMutAct_9fa48("98176") ? false : stryMutAct_9fa48("98175") ? true : (stryCov_9fa48("98175", "98176", "98177"), executionContext.allowPressureDefer !== (stryMutAct_9fa48("98178") ? true : (stryCov_9fa48("98178"), false))),
        retryAfterMs: executionContext.pressureRetryAfterMs
      }));
    }
  }

  /**
   * Build a typed split deferral without creating new durable control-plane
   * writes while the local node is already hot.
   * @param {Object} options
   * @return {Object}
   * @private
   */
  buildPressureDeferredResult(options = {}) {
    if (stryMutAct_9fa48("98179")) {
      {}
    } else {
      stryCov_9fa48("98179");
      const retryAfterMs = Number.isFinite(stryMutAct_9fa48("98181") ? options.pressureDecision?.retryAfterMs : stryMutAct_9fa48("98180") ? options?.pressureDecision.retryAfterMs : (stryCov_9fa48("98180", "98181"), options?.pressureDecision?.retryAfterMs)) ? options.pressureDecision.retryAfterMs : DEFAULT_RETRY_BASE_DELAY_MS;
      const nextAttemptAt = new Date(stryMutAct_9fa48("98182") ? this.now() - retryAfterMs : (stryCov_9fa48("98182"), this.now() + retryAfterMs)).toISOString();
      return stryMutAct_9fa48("98183") ? {} : (stryCov_9fa48("98183"), {
        success: stryMutAct_9fa48("98184") ? true : (stryCov_9fa48("98184"), false),
        partitionId: options.partitionId,
        tableId: stryMutAct_9fa48("98187") ? options.tableId && null : stryMutAct_9fa48("98186") ? false : stryMutAct_9fa48("98185") ? true : (stryCov_9fa48("98185", "98186", "98187"), options.tableId || null),
        tableName: stryMutAct_9fa48("98190") ? options.tableName && null : stryMutAct_9fa48("98189") ? false : stryMutAct_9fa48("98188") ? true : (stryCov_9fa48("98188", "98189", "98190"), options.tableName || null),
        workflowId: stryMutAct_9fa48("98193") ? options.workflowId && null : stryMutAct_9fa48("98192") ? false : stryMutAct_9fa48("98191") ? true : (stryCov_9fa48("98191", "98192", "98193"), options.workflowId || null),
        targetVersion: stryMutAct_9fa48("98196") ? options.targetVersion && null : stryMutAct_9fa48("98195") ? false : stryMutAct_9fa48("98194") ? true : (stryCov_9fa48("98194", "98195", "98196"), options.targetVersion || null),
        state: PARTITION_TRANSITION_STATE.DEFERRED,
        error: stryMutAct_9fa48("98197") ? "" : (stryCov_9fa48("98197"), 'control_plane_backpressure'),
        retryScheduled: stryMutAct_9fa48("98198") ? false : (stryCov_9fa48("98198"), true),
        nextAttemptAt,
        retry: stryMutAct_9fa48("98199") ? {} : (stryCov_9fa48("98199"), {
          attemptCount: stryMutAct_9fa48("98202") ? options.retryMetadata?.attemptCount && 1 : stryMutAct_9fa48("98201") ? false : stryMutAct_9fa48("98200") ? true : (stryCov_9fa48("98200", "98201", "98202"), (stryMutAct_9fa48("98203") ? options.retryMetadata.attemptCount : (stryCov_9fa48("98203"), options.retryMetadata?.attemptCount)) || 1),
          lastAttemptAt: stryMutAct_9fa48("98206") ? options.retryMetadata?.lastAttemptAt && new Date(this.now()).toISOString() : stryMutAct_9fa48("98205") ? false : stryMutAct_9fa48("98204") ? true : (stryCov_9fa48("98204", "98205", "98206"), (stryMutAct_9fa48("98207") ? options.retryMetadata.lastAttemptAt : (stryCov_9fa48("98207"), options.retryMetadata?.lastAttemptAt)) || new Date(this.now()).toISOString()),
          nextAttemptAt,
          backoffMs: retryAfterMs,
          scheduledState: PARTITION_TRANSITION_STATE.DEFERRED
        }),
        pressureAction: stryMutAct_9fa48("98210") ? options?.pressureDecision?.action && null : stryMutAct_9fa48("98209") ? false : stryMutAct_9fa48("98208") ? true : (stryCov_9fa48("98208", "98209", "98210"), (stryMutAct_9fa48("98212") ? options.pressureDecision?.action : stryMutAct_9fa48("98211") ? options?.pressureDecision.action : (stryCov_9fa48("98211", "98212"), options?.pressureDecision?.action)) || null),
        pressureSummary: stryMutAct_9fa48("98215") ? options?.pressureDecision?.summary && null : stryMutAct_9fa48("98214") ? false : stryMutAct_9fa48("98213") ? true : (stryCov_9fa48("98213", "98214", "98215"), (stryMutAct_9fa48("98217") ? options.pressureDecision?.summary : stryMutAct_9fa48("98216") ? options?.pressureDecision.summary : (stryCov_9fa48("98216", "98217"), options?.pressureDecision?.summary)) || null)
      });
    }
  }

  /**
   * Advance the durable split phase for a given workflow.
   *
   * This is the ONLY entry point for persisting split lifecycle phase
   * transitions. Execution participants (PartitionService, child
   * partitions) MUST NOT write partition_transition_state directly.
   * They call this method through the workflow owner callback.
   *
   * @param {string} workflowId - Active workflow identifier.
   * @param {string} nextPhase - Target PARTITION_TRANSITION_STATE value.
   * @param {Object} [phaseMetadata] - Additional fields to merge into
   *   the persisted transition metadata (e.g. active_partition_version,
   *   partition_count for cutover).
   * @return {Promise<void>}
   */
  async advanceSplitPhase(workflowId, nextPhase, phaseMetadata = {}) {
    if (stryMutAct_9fa48("98218")) {
      {}
    } else {
      stryCov_9fa48("98218");
      if (stryMutAct_9fa48("98221") ? false : stryMutAct_9fa48("98220") ? true : stryMutAct_9fa48("98219") ? SPLIT_OWNER_MANAGED_PHASES.has(nextPhase) : (stryCov_9fa48("98219", "98220", "98221"), !SPLIT_OWNER_MANAGED_PHASES.has(nextPhase))) {
        if (stryMutAct_9fa48("98222")) {
          {}
        } else {
          stryCov_9fa48("98222");
          throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_INVALID_PHASE_TRANSITION);
        }
      }
      const workflow = this.resolveWorkflowState(workflowId);
      if (stryMutAct_9fa48("98225") ? false : stryMutAct_9fa48("98224") ? true : stryMutAct_9fa48("98223") ? workflow : (stryCov_9fa48("98223", "98224", "98225"), !workflow)) {
        if (stryMutAct_9fa48("98226")) {
          {}
        } else {
          stryCov_9fa48("98226");
          throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_WORKFLOW_NOT_FOUND);
        }
      }
      const updatedMetadata = stryMutAct_9fa48("98227") ? {} : (stryCov_9fa48("98227"), {
        ...(stryMutAct_9fa48("98230") ? workflow.metadata && {} : stryMutAct_9fa48("98229") ? false : stryMutAct_9fa48("98228") ? true : (stryCov_9fa48("98228", "98229", "98230"), workflow.metadata || {})),
        ...phaseMetadata
      });
      await this.workflowStepRunner.runStep(stryMutAct_9fa48("98231") ? {} : (stryCov_9fa48("98231"), {
        workflowId,
        ownerKey: workflow.ownerKey,
        stepName: nextPhase,
        execute: async () => {
          if (stryMutAct_9fa48("98232")) {
            {}
          } else {
            stryCov_9fa48("98232");
            return stryMutAct_9fa48("98233") ? {} : (stryCov_9fa48("98233"), {
              nextStep: nextPhase,
              reason: nextPhase,
              updates: stryMutAct_9fa48("98234") ? {} : (stryCov_9fa48("98234"), {
                status: nextPhase,
                metadata: updatedMetadata
              }),
              result: null
            });
          }
        }
      }));
    }
  }

  /**
   * Accept a typed source-side participant acknowledgement and persist
   * it through the canonical DurableWorkflowCoordinator path.
   *
   * PartitionService calls this at each execution boundary instead of
   * owning split phase transitions directly.
   *
   * @param {string} workflowId - Durable workflow identity.
   * @param {Object} ack - Acknowledgement payload using
   *   PARTICIPANT_ACK_FIELD keys (participantKey, status, fenceToken,
   *   checkpoint, acknowledgedAt).
   * @return {Promise<Object>} acknowledgeParticipant result.
   */
  async acknowledgeSourceParticipant(workflowId, ack) {
    if (stryMutAct_9fa48("98235")) {
      {}
    } else {
      stryCov_9fa48("98235");
      if (stryMutAct_9fa48("98238") ? false : stryMutAct_9fa48("98237") ? true : stryMutAct_9fa48("98236") ? workflowId : (stryCov_9fa48("98236", "98237", "98238"), !workflowId)) {
        if (stryMutAct_9fa48("98239")) {
          {}
        } else {
          stryCov_9fa48("98239");
          throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_WORKFLOW_NOT_FOUND);
        }
      }
      const workflow = this.resolveWorkflowState(workflowId);
      if (stryMutAct_9fa48("98242") ? false : stryMutAct_9fa48("98241") ? true : stryMutAct_9fa48("98240") ? workflow : (stryCov_9fa48("98240", "98241", "98242"), !workflow)) {
        if (stryMutAct_9fa48("98243")) {
          {}
        } else {
          stryCov_9fa48("98243");
          throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_WORKFLOW_NOT_FOUND);
        }
      }
      this.ensureCanonicalSplitParticipants(workflow.workflowId, workflow.metadata);
      return this.workflowCoordinator.acknowledgeParticipant(workflowId, ack);
    }
  }

  /**
   * Build one canonical scheduled-retry gate result.
   * @param {Object} input - Scheduled-retry execution context.
   * @return {Object} Split execution result.
   * @private
   */
  buildScheduledRetryExecutionResult(input) {
    if (stryMutAct_9fa48("98244")) {
      {}
    } else {
      stryCov_9fa48("98244");
      return stryMutAct_9fa48("98245") ? {} : (stryCov_9fa48("98245"), {
        success: stryMutAct_9fa48("98246") ? true : (stryCov_9fa48("98246"), false),
        partitionId: input.partitionId,
        tableId: input.tableId,
        tableName: input.tableName,
        workflowId: input.workflowId,
        targetVersion: input.targetVersion,
        state: input.existingTransition.state,
        retryScheduled: stryMutAct_9fa48("98247") ? false : (stryCov_9fa48("98247"), true),
        nextAttemptAt: input.scheduledRetry.nextAttemptAt,
        retry: input.scheduledRetry
      });
    }
  }

  /**
   * Build one canonical admission-denied execution result.
   * @param {Object} input - Admission-denied execution context.
   * @return {Object} Split execution result.
   * @private
   */
  buildAdmissionDeniedExecutionResult(input) {
    if (stryMutAct_9fa48("98248")) {
      {}
    } else {
      stryCov_9fa48("98248");
      return stryMutAct_9fa48("98249") ? {} : (stryCov_9fa48("98249"), {
        success: stryMutAct_9fa48("98250") ? true : (stryCov_9fa48("98250"), false),
        partitionId: input.partitionId,
        tableId: input.tableId,
        tableName: input.tableName,
        workflowId: input.workflowId,
        targetVersion: input.targetVersion,
        state: input.deniedState,
        admission: input.compactAdmission,
        retry: input.deniedRetryMetadata
      });
    }
  }

  /**
   * Build an open execution-gate outcome.
   * @return {{blocked: boolean}} Open gate outcome.
   * @private
   */
  buildOpenExecutionGateOutcome() {
    if (stryMutAct_9fa48("98251")) {
      {}
    } else {
      stryCov_9fa48("98251");
      return stryMutAct_9fa48("98252") ? {} : (stryCov_9fa48("98252"), {
        blocked: stryMutAct_9fa48("98253") ? true : (stryCov_9fa48("98253"), false)
      });
    }
  }

  /**
   * Build a blocked execution-gate outcome.
   * @param {Object} result - Blocked execution result.
   * @return {{blocked: boolean, result: Object}} Blocked gate outcome.
   * @private
   */
  buildBlockedExecutionGateOutcome(result) {
    if (stryMutAct_9fa48("98254")) {
      {}
    } else {
      stryCov_9fa48("98254");
      return stryMutAct_9fa48("98255") ? {} : (stryCov_9fa48("98255"), {
        blocked: stryMutAct_9fa48("98256") ? false : (stryCov_9fa48("98256"), true),
        result
      });
    }
  }

  /**
   * Resolve one canonical execution-gate outcome.
   * @param {Object} input - Execution-gate evidence.
   * @return {Promise<{blocked: boolean, result?: Object}>} Gate outcome.
   * @private
   */
  async resolveExecutionGateOutcome(input) {
    if (stryMutAct_9fa48("98257")) {
      {}
    } else {
      stryCov_9fa48("98257");
      if (stryMutAct_9fa48("98260") ? input.scheduledRetry || input.scheduledRetry.retryDue === false : stryMutAct_9fa48("98259") ? false : stryMutAct_9fa48("98258") ? true : (stryCov_9fa48("98258", "98259", "98260"), input.scheduledRetry && (stryMutAct_9fa48("98262") ? input.scheduledRetry.retryDue !== false : stryMutAct_9fa48("98261") ? true : (stryCov_9fa48("98261", "98262"), input.scheduledRetry.retryDue === (stryMutAct_9fa48("98263") ? true : (stryCov_9fa48("98263"), false)))))) {
        if (stryMutAct_9fa48("98264")) {
          {}
        } else {
          stryCov_9fa48("98264");
          return this.buildBlockedExecutionGateOutcome(this.buildScheduledRetryExecutionResult(input));
        }
      }
      if (stryMutAct_9fa48("98267") ? input.pressureDecision || input.pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER : stryMutAct_9fa48("98266") ? false : stryMutAct_9fa48("98265") ? true : (stryCov_9fa48("98265", "98266", "98267"), input.pressureDecision && (stryMutAct_9fa48("98269") ? input.pressureDecision.action !== PRESSURE_GOVERNOR_ACTION.DEFER : stryMutAct_9fa48("98268") ? true : (stryCov_9fa48("98268", "98269"), input.pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER)))) {
        if (stryMutAct_9fa48("98270")) {
          {}
        } else {
          stryCov_9fa48("98270");
          return this.buildBlockedExecutionGateOutcome(this.buildPressureDeferredResult(stryMutAct_9fa48("98271") ? {} : (stryCov_9fa48("98271"), {
            partitionId: input.partitionId,
            tableId: input.tableId,
            tableName: input.tableName,
            retryMetadata: input.retryMetadata,
            pressureDecision: input.pressureDecision
          })));
        }
      }
      if (stryMutAct_9fa48("98274") ? input.admissionResult || input.admissionResult.allowed === false : stryMutAct_9fa48("98273") ? false : stryMutAct_9fa48("98272") ? true : (stryCov_9fa48("98272", "98273", "98274"), input.admissionResult && (stryMutAct_9fa48("98276") ? input.admissionResult.allowed !== false : stryMutAct_9fa48("98275") ? true : (stryCov_9fa48("98275", "98276"), input.admissionResult.allowed === (stryMutAct_9fa48("98277") ? true : (stryCov_9fa48("98277"), false)))))) {
        if (stryMutAct_9fa48("98278")) {
          {}
        } else {
          stryCov_9fa48("98278");
          const deniedState = this.resolveAdmissionDeniedState(input.admissionResult.decisionType);
          const deniedRetryMetadata = this.buildScheduledRetryMetadata(input.retryMetadata, deniedState);
          const deniedMetadata = stryMutAct_9fa48("98279") ? {} : (stryCov_9fa48("98279"), {
            ...input.workflowMetadata,
            [PARTITION_TRANSITION_METADATA_FIELD.ADMISSION]: input.compactAdmission,
            [PARTITION_TRANSITION_METADATA_FIELD.RETRY]: deniedRetryMetadata
          });
          await this.workflowCoordinator.updateWorkflow(input.workflowId, stryMutAct_9fa48("98280") ? {} : (stryCov_9fa48("98280"), {
            status: deniedState,
            metadata: deniedMetadata
          }));
          return this.buildBlockedExecutionGateOutcome(this.buildAdmissionDeniedExecutionResult(stryMutAct_9fa48("98281") ? {} : (stryCov_9fa48("98281"), {
            partitionId: input.partitionId,
            tableId: input.tableId,
            tableName: input.tableName,
            workflowId: input.workflowId,
            targetVersion: input.targetVersion,
            deniedState,
            compactAdmission: input.compactAdmission,
            deniedRetryMetadata
          })));
        }
      }
      return this.buildOpenExecutionGateOutcome();
    }
  }

  /**
   * Execute one managed split after single-flight admission.
   * @param {string} partitionId - Source partition ID.
   * @return {Promise<Object>} Split orchestration result.
   * @private
   */
  async executeInternal(partitionId, executionContext = {}) {
    if (stryMutAct_9fa48("98282")) {
      {}
    } else {
      stryCov_9fa48("98282");
      const partitionInfo = this.getPartitionInfo(partitionId);
      if (stryMutAct_9fa48("98285") ? false : stryMutAct_9fa48("98284") ? true : stryMutAct_9fa48("98283") ? partitionInfo : (stryCov_9fa48("98283", "98284", "98285"), !partitionInfo)) {
        if (stryMutAct_9fa48("98286")) {
          {}
        } else {
          stryCov_9fa48("98286");
          throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_PARTITION_NOT_FOUND);
        }
      }
      if (stryMutAct_9fa48("98289") ? false : stryMutAct_9fa48("98288") ? true : stryMutAct_9fa48("98287") ? this.isLocalManagedSplitLeader(partitionInfo) : (stryCov_9fa48("98287", "98288", "98289"), !this.isLocalManagedSplitLeader(partitionInfo))) {
        if (stryMutAct_9fa48("98290")) {
          {}
        } else {
          stryCov_9fa48("98290");
          throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_LEADER_REQUIRED);
        }
      }
      const tableName = stryMutAct_9fa48("98293") ? partitionInfo.table_name && partitionInfo.tableName : stryMutAct_9fa48("98292") ? false : stryMutAct_9fa48("98291") ? true : (stryCov_9fa48("98291", "98292", "98293"), partitionInfo.table_name || partitionInfo.tableName);
      const tableId = stryMutAct_9fa48("98296") ? partitionInfo.table_id && partitionInfo.tableId : stryMutAct_9fa48("98295") ? false : stryMutAct_9fa48("98294") ? true : (stryCov_9fa48("98294", "98295", "98296"), partitionInfo.table_id || partitionInfo.tableId);
      const tableInfo = this.getTableInfo(stryMutAct_9fa48("98299") ? tableName && tableId : stryMutAct_9fa48("98298") ? false : stryMutAct_9fa48("98297") ? true : (stryCov_9fa48("98297", "98298", "98299"), tableName || tableId));
      if (stryMutAct_9fa48("98302") ? false : stryMutAct_9fa48("98301") ? true : stryMutAct_9fa48("98300") ? tableInfo : (stryCov_9fa48("98300", "98301", "98302"), !tableInfo)) {
        if (stryMutAct_9fa48("98303")) {
          {}
        } else {
          stryCov_9fa48("98303");
          throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_TABLE_NOT_FOUND);
        }
      }
      const existingTransition = this.parsePartitionTransition(tableInfo);
      if (stryMutAct_9fa48("98306") ? existingTransition || !this.isRetryableAdmissionState(existingTransition) : stryMutAct_9fa48("98305") ? false : stryMutAct_9fa48("98304") ? true : (stryCov_9fa48("98304", "98305", "98306"), existingTransition && (stryMutAct_9fa48("98307") ? this.isRetryableAdmissionState(existingTransition) : (stryCov_9fa48("98307"), !this.isRetryableAdmissionState(existingTransition))))) {
        if (stryMutAct_9fa48("98308")) {
          {}
        } else {
          stryCov_9fa48("98308");
          throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_ALREADY_IN_PROGRESS);
        }
      }
      const primaryKeyColumn = String(stryMutAct_9fa48("98311") ? (tableInfo.partition_key || tableInfo.partitionKey) && '' : stryMutAct_9fa48("98310") ? false : stryMutAct_9fa48("98309") ? true : (stryCov_9fa48("98309", "98310", "98311"), (stryMutAct_9fa48("98313") ? tableInfo.partition_key && tableInfo.partitionKey : stryMutAct_9fa48("98312") ? false : (stryCov_9fa48("98312", "98313"), tableInfo.partition_key || tableInfo.partitionKey)) || (stryMutAct_9fa48("98314") ? "Stryker was here!" : (stryCov_9fa48("98314"), ''))));
      if (stryMutAct_9fa48("98317") ? !primaryKeyColumn && primaryKeyColumn.includes(',') : stryMutAct_9fa48("98316") ? false : stryMutAct_9fa48("98315") ? true : (stryCov_9fa48("98315", "98316", "98317"), (stryMutAct_9fa48("98318") ? primaryKeyColumn : (stryCov_9fa48("98318"), !primaryKeyColumn)) || primaryKeyColumn.includes(stryMutAct_9fa48("98319") ? "" : (stryCov_9fa48("98319"), ',')))) {
        if (stryMutAct_9fa48("98320")) {
          {}
        } else {
          stryCov_9fa48("98320");
          throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_PRIMARY_KEY_REQUIRED);
        }
      }
      const replicaCount = (stryMutAct_9fa48("98323") ? Number.isInteger(partitionInfo.replica_count) || partitionInfo.replica_count > 0 : stryMutAct_9fa48("98322") ? false : stryMutAct_9fa48("98321") ? true : (stryCov_9fa48("98321", "98322", "98323"), Number.isInteger(partitionInfo.replica_count) && (stryMutAct_9fa48("98326") ? partitionInfo.replica_count <= 0 : stryMutAct_9fa48("98325") ? partitionInfo.replica_count >= 0 : stryMutAct_9fa48("98324") ? true : (stryCov_9fa48("98324", "98325", "98326"), partitionInfo.replica_count > 0)))) ? partitionInfo.replica_count : DEFAULT_QUORUM_REPLICA_COUNT;
      const splitBootstrapReplicaCount = this.calculateQuorumReplicaCount(replicaCount);
      const criticalSystemPartition = stryMutAct_9fa48("98329") ? this.isCriticalSystemPartition(partitionId) !== true : stryMutAct_9fa48("98328") ? false : stryMutAct_9fa48("98327") ? true : (stryCov_9fa48("98327", "98328", "98329"), this.isCriticalSystemPartition(partitionId) === (stryMutAct_9fa48("98330") ? false : (stryCov_9fa48("98330"), true)));
      const sourceRoutableNodeIds = this.getRoutablePartitionServiceNodeIds(partitionId);
      const discoveredTargetNodeIds = this.resolveProvisionTargetNodeIds(Number.MAX_SAFE_INTEGER);
      const candidateTargetNodeIds = this.resolveAdmissionCandidateTargetNodeIds(discoveredTargetNodeIds, sourceRoutableNodeIds, splitBootstrapReplicaCount);
      const targetVersion = this.resolveTargetPartitionVersion(tableInfo, existingTransition);
      const workflowId = this.resolveWorkflowId(tableId, partitionId, targetVersion, existingTransition);
      const retryMetadata = this.resolvePendingRetryMetadata(existingTransition);
      const scheduledRetry = this.resolveScheduledRetry(existingTransition);
      const scheduledRetryOutcome = await this.resolveExecutionGateOutcome(stryMutAct_9fa48("98331") ? {} : (stryCov_9fa48("98331"), {
        partitionId,
        tableId,
        tableName,
        workflowId,
        targetVersion,
        existingTransition,
        scheduledRetry
      }));
      if (stryMutAct_9fa48("98334") ? scheduledRetryOutcome.blocked !== true : stryMutAct_9fa48("98333") ? false : stryMutAct_9fa48("98332") ? true : (stryCov_9fa48("98332", "98333", "98334"), scheduledRetryOutcome.blocked === (stryMutAct_9fa48("98335") ? false : (stryCov_9fa48("98335"), true)))) {
        if (stryMutAct_9fa48("98336")) {
          {}
        } else {
          stryCov_9fa48("98336");
          return scheduledRetryOutcome.result;
        }
      }
      const pressureDecision = this.evaluatePressure(executionContext);
      const pressureGateOutcome = await this.resolveExecutionGateOutcome(stryMutAct_9fa48("98337") ? {} : (stryCov_9fa48("98337"), {
        partitionId,
        tableId,
        tableName,
        retryMetadata,
        pressureDecision
      }));
      if (stryMutAct_9fa48("98340") ? pressureGateOutcome.blocked !== true : stryMutAct_9fa48("98339") ? false : stryMutAct_9fa48("98338") ? true : (stryCov_9fa48("98338", "98339", "98340"), pressureGateOutcome.blocked === (stryMutAct_9fa48("98341") ? false : (stryCov_9fa48("98341"), true)))) {
        if (stryMutAct_9fa48("98342")) {
          {}
        } else {
          stryCov_9fa48("98342");
          return pressureGateOutcome.result;
        }
      }
      this.logger.info(QUERY_LOG_MSG.TABLE_SPLIT_START, stryMutAct_9fa48("98343") ? {} : (stryCov_9fa48("98343"), {
        partitionId,
        tableId,
        tableName,
        primaryKeyColumn
      }));
      const now = this.now();
      const executionTimeoutBudget = stryMutAct_9fa48("98346") ? executionContext.timeoutBudget && (typeof this.createExecutionTimeoutBudget === 'function' ? this.createExecutionTimeoutBudget() : this.executionTimeoutPolicy.createTopLevelBudget({
        configuredBudgetMs: TIMEOUT_BUDGET_DEFAULT.SPLIT_OPERATION_BUDGET_MS
      })) : stryMutAct_9fa48("98345") ? false : stryMutAct_9fa48("98344") ? true : (stryCov_9fa48("98344", "98345", "98346"), executionContext.timeoutBudget || ((stryMutAct_9fa48("98349") ? typeof this.createExecutionTimeoutBudget !== 'function' : stryMutAct_9fa48("98348") ? false : stryMutAct_9fa48("98347") ? true : (stryCov_9fa48("98347", "98348", "98349"), typeof this.createExecutionTimeoutBudget === (stryMutAct_9fa48("98350") ? "" : (stryCov_9fa48("98350"), 'function')))) ? this.createExecutionTimeoutBudget() : this.executionTimeoutPolicy.createTopLevelBudget(stryMutAct_9fa48("98351") ? {} : (stryCov_9fa48("98351"), {
        configuredBudgetMs: TIMEOUT_BUDGET_DEFAULT.SPLIT_OPERATION_BUDGET_MS
      }))));
      const estimatedBytes = this.estimateSplitAdmissionBytes(partitionInfo, tableInfo);
      const topologySnapshot = await this.resolveTopologySnapshot(stryMutAct_9fa48("98352") ? {} : (stryCov_9fa48("98352"), {
        tableId,
        tableName,
        tableInfo,
        partitionId,
        partitionInfo,
        targetVersion,
        requiredReplicaCount: splitBootstrapReplicaCount,
        sourceRoutableNodeIds,
        discoveredTargetNodeIds,
        candidateTargetNodeIds,
        retryMetadata
      }));
      const snapshotSourceRoutableNodeIds = this.normalizeNodeIdList(stryMutAct_9fa48("98353") ? topologySnapshot.sourceRoutableNodeIds : (stryCov_9fa48("98353"), topologySnapshot?.sourceRoutableNodeIds), sourceRoutableNodeIds);
      const snapshotCandidateTargetNodeIds = this.normalizeNodeIdList(stryMutAct_9fa48("98354") ? topologySnapshot.candidateTargetNodeIds : (stryCov_9fa48("98354"), topologySnapshot?.candidateTargetNodeIds), candidateTargetNodeIds);
      const snapshotDiscoveredTargetNodeIds = this.normalizeNodeIdList(stryMutAct_9fa48("98355") ? topologySnapshot.discoveredTargetNodeIds : (stryCov_9fa48("98355"), topologySnapshot?.discoveredTargetNodeIds), discoveredTargetNodeIds);
      const minimumRoutableSourceCount = this.resolveSplitMinimumRoutableSourceCount(stryMutAct_9fa48("98356") ? {} : (stryCov_9fa48("98356"), {
        requiredReplicaCount: splitBootstrapReplicaCount,
        isCriticalSystemPartition: criticalSystemPartition
      }));
      const persistedTopologySnapshot = stryMutAct_9fa48("98357") ? {} : (stryCov_9fa48("98357"), {
        ...topologySnapshot,
        discoveredTargetNodeIds: snapshotDiscoveredTargetNodeIds,
        candidateTargetNodeIds: snapshotCandidateTargetNodeIds,
        sourceRoutableNodeIds: snapshotSourceRoutableNodeIds
      });
      const workflow = await this.workflowCoordinator.registerWorkflow(stryMutAct_9fa48("98358") ? {} : (stryCov_9fa48("98358"), {
        workflowId,
        ownerKey: partitionId,
        tableId,
        tableName,
        partitionId,
        status: PARTITION_TRANSITION_STATE.ADMISSION_PENDING,
        metadata: this.buildPendingTransitionMetadata(stryMutAct_9fa48("98359") ? {} : (stryCov_9fa48("98359"), {
          workflowId,
          partitionId,
          primaryKeyColumn,
          targetVersion,
          requiredReplicaCount: splitBootstrapReplicaCount,
          minimumRoutableSourceCount,
          isCriticalSystemPartition: criticalSystemPartition,
          candidateTargetNodeIds: snapshotCandidateTargetNodeIds,
          sourceRoutableNodeIds: snapshotSourceRoutableNodeIds,
          topologySnapshot: persistedTopologySnapshot,
          retryMetadata,
          estimatedBytes
        })),
        createdAt: now,
        updatedAt: now
      }));
      try {
        if (stryMutAct_9fa48("98360")) {
          {}
        } else {
          stryCov_9fa48("98360");
          const admissionResult = await this.evaluateSplitAdmission(stryMutAct_9fa48("98361") ? {} : (stryCov_9fa48("98361"), {
            candidateTargetNodeIds: snapshotCandidateTargetNodeIds,
            estimatedBytes,
            requiredReplicaCount: splitBootstrapReplicaCount,
            minimumRoutableSourceCount,
            sourceRoutableNodeIds: snapshotSourceRoutableNodeIds,
            isCriticalSystemPartition: criticalSystemPartition
          }));
          const compactAdmission = this.compactAdmissionResult(admissionResult, stryMutAct_9fa48("98362") ? {} : (stryCov_9fa48("98362"), {
            discoveredTargetNodeIds: snapshotDiscoveredTargetNodeIds,
            candidateTargetNodeIds: snapshotCandidateTargetNodeIds,
            minimumRoutableSourceCount,
            estimatedBytes,
            sourceRoutableNodeIds: snapshotSourceRoutableNodeIds,
            isCriticalSystemPartition: criticalSystemPartition
          }));
          const admissionGateOutcome = await this.resolveExecutionGateOutcome(stryMutAct_9fa48("98363") ? {} : (stryCov_9fa48("98363"), {
            partitionId,
            tableId,
            tableName,
            workflowId,
            targetVersion,
            retryMetadata,
            admissionResult,
            compactAdmission,
            workflowMetadata: workflow.metadata
          }));
          if (stryMutAct_9fa48("98366") ? admissionGateOutcome.blocked !== true : stryMutAct_9fa48("98365") ? false : stryMutAct_9fa48("98364") ? true : (stryCov_9fa48("98364", "98365", "98366"), admissionGateOutcome.blocked === (stryMutAct_9fa48("98367") ? false : (stryCov_9fa48("98367"), true)))) {
            if (stryMutAct_9fa48("98368")) {
              {}
            } else {
              stryCov_9fa48("98368");
              return admissionGateOutcome.result;
            }
          }
          let splitPlan = this.resolvePersistedSplitPlan(existingTransition, partitionInfo);
          if (stryMutAct_9fa48("98371") ? false : stryMutAct_9fa48("98370") ? true : stryMutAct_9fa48("98369") ? splitPlan : (stryCov_9fa48("98369", "98370", "98371"), !splitPlan)) {
            if (stryMutAct_9fa48("98372")) {
              {}
            } else {
              stryCov_9fa48("98372");
              try {
                if (stryMutAct_9fa48("98373")) {
                  {}
                } else {
                  stryCov_9fa48("98373");
                  splitPlan = await this.buildManagedSplitPlan(partitionInfo, tableName, tableId, primaryKeyColumn);
                }
              } catch (error) {
                if (stryMutAct_9fa48("98374")) {
                  {}
                } else {
                  stryCov_9fa48("98374");
                  const deferredExecution = await this.handleRetryableSplitPlanningFailure(stryMutAct_9fa48("98375") ? {} : (stryCov_9fa48("98375"), {
                    workflowId,
                    partitionId,
                    tableId,
                    tableName,
                    targetVersion,
                    admission: compactAdmission,
                    retryMetadata,
                    error
                  }));
                  if (stryMutAct_9fa48("98377") ? false : stryMutAct_9fa48("98376") ? true : (stryCov_9fa48("98376", "98377"), deferredExecution)) {
                    if (stryMutAct_9fa48("98378")) {
                      {}
                    } else {
                      stryCov_9fa48("98378");
                      return deferredExecution;
                    }
                  }
                  throw error;
                }
              }
            }
          }
          const childProvisioningTargetNodeIdsByPartitionId = this.planChildProvisioningTargetNodeIds(stryMutAct_9fa48("98379") ? {} : (stryCov_9fa48("98379"), {
            childPartitionIds: stryMutAct_9fa48("98380") ? [] : (stryCov_9fa48("98380"), [splitPlan.leftPartition.partitionId, splitPlan.rightPartition.partitionId]),
            eligibleNodeIds: compactAdmission.eligibleNodeIds,
            candidateTargetNodeIds: snapshotCandidateTargetNodeIds,
            sourceRoutableNodeIds: snapshotSourceRoutableNodeIds,
            replicaCount,
            preferredAnchorNodeId: stryMutAct_9fa48("98383") ? (partitionInfo.leader_node_id || partitionInfo.leaderNodeId) && this.nodeId : stryMutAct_9fa48("98382") ? false : stryMutAct_9fa48("98381") ? true : (stryCov_9fa48("98381", "98382", "98383"), (stryMutAct_9fa48("98385") ? partitionInfo.leader_node_id && partitionInfo.leaderNodeId : stryMutAct_9fa48("98384") ? false : (stryCov_9fa48("98384", "98385"), partitionInfo.leader_node_id || partitionInfo.leaderNodeId)) || this.nodeId)
          }));
          const childProvisioningAdmissionByPartitionId = await this.probeChildProvisioningAdmissions(stryMutAct_9fa48("98386") ? {} : (stryCov_9fa48("98386"), {
            childProvisioningTargetNodeIdsByPartitionId,
            minimumRoutableReplicaCount: splitBootstrapReplicaCount
          }));
          const transitionTopologySnapshot = stryMutAct_9fa48("98387") ? {} : (stryCov_9fa48("98387"), {
            ...persistedTopologySnapshot,
            childProvisioningTargetNodeIdsByPartitionId: JSON.parse(JSON.stringify(childProvisioningTargetNodeIdsByPartitionId)),
            childProvisioningAdmissionByPartitionId: JSON.parse(JSON.stringify(childProvisioningAdmissionByPartitionId))
          });
          const childProvisioningDeferral = await this.handleChildProvisioningPrecheckFailure(stryMutAct_9fa48("98388") ? {} : (stryCov_9fa48("98388"), {
            workflowId,
            partitionId,
            tableId,
            tableName,
            targetVersion,
            admission: compactAdmission,
            topologySnapshot: transitionTopologySnapshot,
            retryMetadata,
            minimumRoutableReplicaCount: splitBootstrapReplicaCount,
            childProvisioningAdmissionByPartitionId
          }));
          if (stryMutAct_9fa48("98390") ? false : stryMutAct_9fa48("98389") ? true : (stryCov_9fa48("98389", "98390"), childProvisioningDeferral)) {
            if (stryMutAct_9fa48("98391")) {
              {}
            } else {
              stryCov_9fa48("98391");
              return childProvisioningDeferral;
            }
          }
          const transitionMetadata = stryMutAct_9fa48("98392") ? {} : (stryCov_9fa48("98392"), {
            ...workflow.metadata,
            [PARTITION_TRANSITION_METADATA_FIELD.ADMISSION]: compactAdmission,
            [PARTITION_TRANSITION_METADATA_FIELD.TOPOLOGY_SNAPSHOT]: transitionTopologySnapshot,
            [PARTITION_TRANSITION_METADATA_FIELD.SPLIT_KEY]: splitPlan.medianKey,
            [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS]: stryMutAct_9fa48("98393") ? [] : (stryCov_9fa48("98393"), [splitPlan.leftPartition.partitionId, splitPlan.rightPartition.partitionId])
          });
          this.ensureCanonicalSplitParticipants(workflowId, transitionMetadata);
          await this.workflowCoordinator.updateWorkflow(workflowId, stryMutAct_9fa48("98394") ? {} : (stryCov_9fa48("98394"), {
            status: PARTITION_TRANSITION_STATE.SPLIT_PREPARING,
            metadata: transitionMetadata
          }));
          const leftPartitionMetadata = stryMutAct_9fa48("98395") ? {} : (stryCov_9fa48("98395"), {
            partition_id: splitPlan.leftPartition.partitionId,
            table_id: tableId,
            table_name: tableName,
            partition_key_start: splitPlan.leftPartition.keyRange.start,
            partition_key_end: splitPlan.leftPartition.keyRange.end,
            partition_version: targetVersion,
            replica_count: replicaCount,
            size_bytes: 0,
            leader_node_id: null,
            state: ACTIVE_PARTITION_STATE,
            created_at: now,
            updated_at: now
          });
          const rightPartitionMetadata = stryMutAct_9fa48("98396") ? {} : (stryCov_9fa48("98396"), {
            partition_id: splitPlan.rightPartition.partitionId,
            table_id: tableId,
            table_name: tableName,
            partition_key_start: splitPlan.rightPartition.keyRange.start,
            partition_key_end: splitPlan.rightPartition.keyRange.end,
            partition_version: targetVersion,
            replica_count: replicaCount,
            size_bytes: 0,
            leader_node_id: null,
            state: ACTIVE_PARTITION_STATE,
            created_at: now,
            updated_at: now
          });
          await this.ensureChildPartitionMetadata(stryMutAct_9fa48("98397") ? {} : (stryCov_9fa48("98397"), {
            leftPartitionMetadata,
            rightPartitionMetadata
          }));
          await Promise.all(stryMutAct_9fa48("98398") ? [] : (stryCov_9fa48("98398"), [this.waitForTablePartitionMetadata(tableId, splitPlan.leftPartition.partitionId, executionTimeoutBudget), this.waitForTablePartitionMetadata(tableId, splitPlan.rightPartition.partitionId, executionTimeoutBudget)]));
          await this.provisionInitialTablePartition(stryMutAct_9fa48("98399") ? {} : (stryCov_9fa48("98399"), {
            tableId,
            tableName,
            tableMetadata: tableInfo,
            partitionId: splitPlan.leftPartition.partitionId,
            partitionMetadata: leftPartitionMetadata,
            replicaCount,
            minimumRoutableReplicaCount: splitBootstrapReplicaCount,
            targetNodeIds: stryMutAct_9fa48("98402") ? childProvisioningTargetNodeIdsByPartitionId[splitPlan.leftPartition.partitionId] && snapshotCandidateTargetNodeIds : stryMutAct_9fa48("98401") ? false : stryMutAct_9fa48("98400") ? true : (stryCov_9fa48("98400", "98401", "98402"), childProvisioningTargetNodeIdsByPartitionId[splitPlan.leftPartition.partitionId] || snapshotCandidateTargetNodeIds),
            admissionConvergence: stryMutAct_9fa48("98405") ? childProvisioningAdmissionByPartitionId[splitPlan.leftPartition.partitionId] && null : stryMutAct_9fa48("98404") ? false : stryMutAct_9fa48("98403") ? true : (stryCov_9fa48("98403", "98404", "98405"), childProvisioningAdmissionByPartitionId[splitPlan.leftPartition.partitionId] || null),
            timeoutBudget: executionTimeoutBudget,
            topologySnapshot: transitionTopologySnapshot,
            routingReadinessDimension: SPLIT_BOOTSTRAP_ROUTING_READINESS_DIMENSION
          }));
          await this.provisionInitialTablePartition(stryMutAct_9fa48("98406") ? {} : (stryCov_9fa48("98406"), {
            tableId,
            tableName,
            tableMetadata: tableInfo,
            partitionId: splitPlan.rightPartition.partitionId,
            partitionMetadata: rightPartitionMetadata,
            replicaCount,
            minimumRoutableReplicaCount: splitBootstrapReplicaCount,
            targetNodeIds: stryMutAct_9fa48("98409") ? childProvisioningTargetNodeIdsByPartitionId[splitPlan.rightPartition.partitionId] && snapshotCandidateTargetNodeIds : stryMutAct_9fa48("98408") ? false : stryMutAct_9fa48("98407") ? true : (stryCov_9fa48("98407", "98408", "98409"), childProvisioningTargetNodeIdsByPartitionId[splitPlan.rightPartition.partitionId] || snapshotCandidateTargetNodeIds),
            admissionConvergence: stryMutAct_9fa48("98412") ? childProvisioningAdmissionByPartitionId[splitPlan.rightPartition.partitionId] && null : stryMutAct_9fa48("98411") ? false : stryMutAct_9fa48("98410") ? true : (stryCov_9fa48("98410", "98411", "98412"), childProvisioningAdmissionByPartitionId[splitPlan.rightPartition.partitionId] || null),
            timeoutBudget: executionTimeoutBudget,
            topologySnapshot: transitionTopologySnapshot,
            routingReadinessDimension: SPLIT_BOOTSTRAP_ROUTING_READINESS_DIMENSION
          }));
          await this.workflowCoordinator.updateWorkflow(workflowId, stryMutAct_9fa48("98413") ? {} : (stryCov_9fa48("98413"), {
            status: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
            metadata: transitionMetadata
          }));
          await this.startSplitReplicationOnSourcePartition(partitionId, tableId, tableName, transitionMetadata);
          this.logger.info(QUERY_LOG_MSG.TABLE_SPLIT_PREPARED, stryMutAct_9fa48("98414") ? {} : (stryCov_9fa48("98414"), {
            partitionId,
            tableId,
            tableName,
            targetVersion,
            targetPartitionIds: transitionMetadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS],
            workflowId
          }));
          return stryMutAct_9fa48("98415") ? {} : (stryCov_9fa48("98415"), {
            success: stryMutAct_9fa48("98416") ? false : (stryCov_9fa48("98416"), true),
            partitionId,
            tableId,
            tableName,
            workflowId,
            targetVersion,
            admission: compactAdmission,
            splitKey: transitionMetadata[PARTITION_TRANSITION_METADATA_FIELD.SPLIT_KEY],
            targetPartitionIds: transitionMetadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS]
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("98417")) {
          {}
        } else {
          stryCov_9fa48("98417");
          const activeWorkflow = this.workflowCoordinator.getWorkflowById(workflowId);
          const deferredExecution = await this.handleRetryablePostAdmissionExecutionFailure(stryMutAct_9fa48("98418") ? {} : (stryCov_9fa48("98418"), {
            workflowId,
            partitionId,
            tableId,
            tableName,
            targetVersion,
            retryMetadata,
            admission: stryMutAct_9fa48("98421") ? activeWorkflow?.metadata?.[PARTITION_TRANSITION_METADATA_FIELD.ADMISSION] && null : stryMutAct_9fa48("98420") ? false : stryMutAct_9fa48("98419") ? true : (stryCov_9fa48("98419", "98420", "98421"), (stryMutAct_9fa48("98423") ? activeWorkflow.metadata?.[PARTITION_TRANSITION_METADATA_FIELD.ADMISSION] : stryMutAct_9fa48("98422") ? activeWorkflow?.metadata[PARTITION_TRANSITION_METADATA_FIELD.ADMISSION] : (stryCov_9fa48("98422", "98423"), activeWorkflow?.metadata?.[PARTITION_TRANSITION_METADATA_FIELD.ADMISSION])) || null),
            error
          }));
          if (stryMutAct_9fa48("98425") ? false : stryMutAct_9fa48("98424") ? true : (stryCov_9fa48("98424", "98425"), deferredExecution)) {
            if (stryMutAct_9fa48("98426")) {
              {}
            } else {
              stryCov_9fa48("98426");
              return deferredExecution;
            }
          }
          await this.persistExecutionFailure(workflowId, error);
          throw error;
        }
      } finally {
        if (stryMutAct_9fa48("98427")) {
          {}
        } else {
          stryCov_9fa48("98427");
          this.workflowCoordinator.removeWorkflow(workflow.workflowId);
        }
      }
    }
  }

  /**
   * Build the initial transition metadata persisted before admission.
   * @param {Object} options
   * @return {Object}
   * @private
   */
  buildPendingTransitionMetadata(options) {
    if (stryMutAct_9fa48("98428")) {
      {}
    } else {
      stryCov_9fa48("98428");
      return stryMutAct_9fa48("98429") ? {} : (stryCov_9fa48("98429"), {
        [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID]: options.workflowId,
        [PARTITION_TRANSITION_METADATA_FIELD.PRIMARY_KEY_COLUMN]: options.primaryKeyColumn,
        [PARTITION_TRANSITION_METADATA_FIELD.RETRY]: JSON.parse(JSON.stringify(options.retryMetadata)),
        [PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID]: options.partitionId,
        [PARTITION_TRANSITION_METADATA_FIELD.TOPOLOGY_SNAPSHOT]: JSON.parse(JSON.stringify(options.topologySnapshot)),
        [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]: options.targetVersion,
        [PARTITION_TRANSITION_METADATA_FIELD.ADMISSION]: stryMutAct_9fa48("98430") ? {} : (stryCov_9fa48("98430"), {
          state: PARTITION_TRANSITION_STATE.ADMISSION_PENDING,
          operationType: STORAGE_ADMISSION_OPERATION_TYPE.PARTITION_SPLIT,
          requiredReplicaCount: options.requiredReplicaCount,
          minimumRoutableSourceCount: options.minimumRoutableSourceCount,
          isCriticalSystemPartition: stryMutAct_9fa48("98433") ? options.isCriticalSystemPartition !== true : stryMutAct_9fa48("98432") ? false : stryMutAct_9fa48("98431") ? true : (stryCov_9fa48("98431", "98432", "98433"), options.isCriticalSystemPartition === (stryMutAct_9fa48("98434") ? false : (stryCov_9fa48("98434"), true))),
          candidateTargetNodeIds: stryMutAct_9fa48("98435") ? [] : (stryCov_9fa48("98435"), [...options.candidateTargetNodeIds]),
          sourceRoutableNodeIds: stryMutAct_9fa48("98436") ? [] : (stryCov_9fa48("98436"), [...options.sourceRoutableNodeIds]),
          estimatedBytes: options.estimatedBytes,
          decisionTimestamp: new Date(this.now()).toISOString()
        })
      });
    }
  }

  /**
   * Persist one participant acknowledgement by flushing the owning workflow
   * through the canonical tables transition row.
   * @param {Object} participant
   * @return {Promise<void>}
   * @private
   */
  async persistWorkflowParticipantState(participant) {
    if (stryMutAct_9fa48("98437")) {
      {}
    } else {
      stryCov_9fa48("98437");
      const workflowId = String(stryMutAct_9fa48("98440") ? participant?.workflowId && '' : stryMutAct_9fa48("98439") ? false : stryMutAct_9fa48("98438") ? true : (stryCov_9fa48("98438", "98439", "98440"), (stryMutAct_9fa48("98441") ? participant.workflowId : (stryCov_9fa48("98441"), participant?.workflowId)) || (stryMutAct_9fa48("98442") ? "Stryker was here!" : (stryCov_9fa48("98442"), ''))));
      if (stryMutAct_9fa48("98445") ? false : stryMutAct_9fa48("98444") ? true : stryMutAct_9fa48("98443") ? workflowId : (stryCov_9fa48("98443", "98444", "98445"), !workflowId)) {
        if (stryMutAct_9fa48("98446")) {
          {}
        } else {
          stryCov_9fa48("98446");
          return;
        }
      }
      const workflow = this.workflowCoordinator.getWorkflowById(workflowId);
      if (stryMutAct_9fa48("98449") ? false : stryMutAct_9fa48("98448") ? true : stryMutAct_9fa48("98447") ? workflow : (stryCov_9fa48("98447", "98448", "98449"), !workflow)) {
        if (stryMutAct_9fa48("98450")) {
          {}
        } else {
          stryCov_9fa48("98450");
          return;
        }
      }
      workflow.updatedAt = Number.isFinite(stryMutAct_9fa48("98451") ? participant.updatedAt : (stryCov_9fa48("98451"), participant?.updatedAt)) ? participant.updatedAt : this.now();
      await this.persistWorkflowTransition(workflow);
    }
  }

  /**
   * Resolve one workflow from memory or recover it from the durable transition
   * row when async source-side execution resumes after execute() returns.
   * @param {string} workflowId
   * @return {Object|null}
   * @private
   */
  resolveWorkflowState(workflowId) {
    if (stryMutAct_9fa48("98452")) {
      {}
    } else {
      stryCov_9fa48("98452");
      const normalizedWorkflowId = String(stryMutAct_9fa48("98455") ? workflowId && '' : stryMutAct_9fa48("98454") ? false : stryMutAct_9fa48("98453") ? true : (stryCov_9fa48("98453", "98454", "98455"), workflowId || (stryMutAct_9fa48("98456") ? "Stryker was here!" : (stryCov_9fa48("98456"), ''))));
      if (stryMutAct_9fa48("98459") ? false : stryMutAct_9fa48("98458") ? true : stryMutAct_9fa48("98457") ? normalizedWorkflowId : (stryCov_9fa48("98457", "98458", "98459"), !normalizedWorkflowId)) {
        if (stryMutAct_9fa48("98460")) {
          {}
        } else {
          stryCov_9fa48("98460");
          return null;
        }
      }
      const existingWorkflow = this.workflowCoordinator.getWorkflowById(normalizedWorkflowId);
      if (stryMutAct_9fa48("98462") ? false : stryMutAct_9fa48("98461") ? true : (stryCov_9fa48("98461", "98462"), existingWorkflow)) {
        if (stryMutAct_9fa48("98463")) {
          {}
        } else {
          stryCov_9fa48("98463");
          return existingWorkflow;
        }
      }
      return this.recoverWorkflowState(normalizedWorkflowId);
    }
  }

  /**
   * Recover one workflow snapshot from the canonical tables transition row.
   * @param {string} workflowId
   * @return {Object|null}
   * @private
   */
  recoverWorkflowState(workflowId) {
    if (stryMutAct_9fa48("98464")) {
      {}
    } else {
      stryCov_9fa48("98464");
      for (const tableInfo of this.listTableInfos()) {
        if (stryMutAct_9fa48("98465")) {
          {}
        } else {
          stryCov_9fa48("98465");
          const transition = this.parsePartitionTransition(tableInfo);
          if (stryMutAct_9fa48("98468") ? !transition && !transition.metadata : stryMutAct_9fa48("98467") ? false : stryMutAct_9fa48("98466") ? true : (stryCov_9fa48("98466", "98467", "98468"), (stryMutAct_9fa48("98469") ? transition : (stryCov_9fa48("98469"), !transition)) || (stryMutAct_9fa48("98470") ? transition.metadata : (stryCov_9fa48("98470"), !transition.metadata)))) {
            if (stryMutAct_9fa48("98471")) {
              {}
            } else {
              stryCov_9fa48("98471");
              continue;
            }
          }
          const persistedWorkflowId = String(stryMutAct_9fa48("98474") ? transition.metadata[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID] && '' : stryMutAct_9fa48("98473") ? false : stryMutAct_9fa48("98472") ? true : (stryCov_9fa48("98472", "98473", "98474"), transition.metadata[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID] || (stryMutAct_9fa48("98475") ? "Stryker was here!" : (stryCov_9fa48("98475"), ''))));
          if (stryMutAct_9fa48("98478") ? persistedWorkflowId === workflowId : stryMutAct_9fa48("98477") ? false : stryMutAct_9fa48("98476") ? true : (stryCov_9fa48("98476", "98477", "98478"), persistedWorkflowId !== workflowId)) {
            if (stryMutAct_9fa48("98479")) {
              {}
            } else {
              stryCov_9fa48("98479");
              continue;
            }
          }
          const partitionId = String(stryMutAct_9fa48("98482") ? transition.metadata[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID] && '' : stryMutAct_9fa48("98481") ? false : stryMutAct_9fa48("98480") ? true : (stryCov_9fa48("98480", "98481", "98482"), transition.metadata[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID] || (stryMutAct_9fa48("98483") ? "Stryker was here!" : (stryCov_9fa48("98483"), ''))));
          if (stryMutAct_9fa48("98486") ? false : stryMutAct_9fa48("98485") ? true : stryMutAct_9fa48("98484") ? partitionId : (stryCov_9fa48("98484", "98485", "98486"), !partitionId)) {
            if (stryMutAct_9fa48("98487")) {
              {}
            } else {
              stryCov_9fa48("98487");
              return null;
            }
          }
          const workflow = this.workflowCoordinator.createWorkflowRecord(stryMutAct_9fa48("98488") ? {} : (stryCov_9fa48("98488"), {
            workflowId,
            ownerKey: partitionId,
            tableId: stryMutAct_9fa48("98491") ? (tableInfo?.table_id || tableInfo?.tableId) && null : stryMutAct_9fa48("98490") ? false : stryMutAct_9fa48("98489") ? true : (stryCov_9fa48("98489", "98490", "98491"), (stryMutAct_9fa48("98493") ? tableInfo?.table_id && tableInfo?.tableId : stryMutAct_9fa48("98492") ? false : (stryCov_9fa48("98492", "98493"), (stryMutAct_9fa48("98494") ? tableInfo.table_id : (stryCov_9fa48("98494"), tableInfo?.table_id)) || (stryMutAct_9fa48("98495") ? tableInfo.tableId : (stryCov_9fa48("98495"), tableInfo?.tableId)))) || null),
            tableName: stryMutAct_9fa48("98498") ? (tableInfo?.table_name || tableInfo?.tableName) && null : stryMutAct_9fa48("98497") ? false : stryMutAct_9fa48("98496") ? true : (stryCov_9fa48("98496", "98497", "98498"), (stryMutAct_9fa48("98500") ? tableInfo?.table_name && tableInfo?.tableName : stryMutAct_9fa48("98499") ? false : (stryCov_9fa48("98499", "98500"), (stryMutAct_9fa48("98501") ? tableInfo.table_name : (stryCov_9fa48("98501"), tableInfo?.table_name)) || (stryMutAct_9fa48("98502") ? tableInfo.tableName : (stryCov_9fa48("98502"), tableInfo?.tableName)))) || null),
            partitionId,
            step: transition.state,
            status: transition.state,
            metadata: this.cloneTransitionValue(transition.metadata),
            participants: this.restoreParticipantsFromMetadata(workflowId, transition.metadata),
            createdAt: Number(stryMutAct_9fa48("98503") ? (tableInfo?.created_at ?? tableInfo?.createdAt ?? tableInfo?.updated_at ?? tableInfo?.updatedAt) && this.now() : (stryCov_9fa48("98503"), (stryMutAct_9fa48("98504") ? (tableInfo?.created_at ?? tableInfo?.createdAt ?? tableInfo?.updated_at) && tableInfo?.updatedAt : (stryCov_9fa48("98504"), (stryMutAct_9fa48("98505") ? (tableInfo?.created_at ?? tableInfo?.createdAt) && tableInfo?.updated_at : (stryCov_9fa48("98505"), (stryMutAct_9fa48("98506") ? tableInfo?.created_at && tableInfo?.createdAt : (stryCov_9fa48("98506"), (stryMutAct_9fa48("98507") ? tableInfo.created_at : (stryCov_9fa48("98507"), tableInfo?.created_at)) ?? (stryMutAct_9fa48("98508") ? tableInfo.createdAt : (stryCov_9fa48("98508"), tableInfo?.createdAt)))) ?? (stryMutAct_9fa48("98509") ? tableInfo.updated_at : (stryCov_9fa48("98509"), tableInfo?.updated_at)))) ?? (stryMutAct_9fa48("98510") ? tableInfo.updatedAt : (stryCov_9fa48("98510"), tableInfo?.updatedAt)))) ?? this.now())),
            updatedAt: Number(stryMutAct_9fa48("98511") ? (tableInfo?.updated_at ?? tableInfo?.updatedAt ?? tableInfo?.created_at ?? tableInfo?.createdAt) && this.now() : (stryCov_9fa48("98511"), (stryMutAct_9fa48("98512") ? (tableInfo?.updated_at ?? tableInfo?.updatedAt ?? tableInfo?.created_at) && tableInfo?.createdAt : (stryCov_9fa48("98512"), (stryMutAct_9fa48("98513") ? (tableInfo?.updated_at ?? tableInfo?.updatedAt) && tableInfo?.created_at : (stryCov_9fa48("98513"), (stryMutAct_9fa48("98514") ? tableInfo?.updated_at && tableInfo?.updatedAt : (stryCov_9fa48("98514"), (stryMutAct_9fa48("98515") ? tableInfo.updated_at : (stryCov_9fa48("98515"), tableInfo?.updated_at)) ?? (stryMutAct_9fa48("98516") ? tableInfo.updatedAt : (stryCov_9fa48("98516"), tableInfo?.updatedAt)))) ?? (stryMutAct_9fa48("98517") ? tableInfo.created_at : (stryCov_9fa48("98517"), tableInfo?.created_at)))) ?? (stryMutAct_9fa48("98518") ? tableInfo.createdAt : (stryCov_9fa48("98518"), tableInfo?.createdAt)))) ?? this.now()))
          }));
          this.workflowCoordinator.setWorkflowState(workflow);
          if (stryMutAct_9fa48("98520") ? false : stryMutAct_9fa48("98519") ? true : (stryCov_9fa48("98519", "98520"), workflow.step)) {
            if (stryMutAct_9fa48("98521")) {
              {}
            } else {
              stryCov_9fa48("98521");
              this.workflowCoordinator.markTransitionCommitted(workflow.workflowId, workflow.step);
            }
          }
          this.ensureCanonicalSplitParticipants(workflow.workflowId, workflow.metadata);
          return workflow;
        }
      }
      return null;
    }
  }

  /**
   * Restore persisted split participants from transition metadata.
   * @param {string} workflowId
   * @param {Object} metadata
   * @return {Map<string, Object>}
   * @private
   */
  restoreParticipantsFromMetadata(workflowId, metadata = {}) {
    if (stryMutAct_9fa48("98522")) {
      {}
    } else {
      stryCov_9fa48("98522");
      const participants = new Map();
      const persistedParticipants = metadata[PARTITION_TRANSITION_METADATA_FIELD.PARTICIPANTS];
      if (stryMutAct_9fa48("98525") ? !persistedParticipants && typeof persistedParticipants !== 'object' : stryMutAct_9fa48("98524") ? false : stryMutAct_9fa48("98523") ? true : (stryCov_9fa48("98523", "98524", "98525"), (stryMutAct_9fa48("98526") ? persistedParticipants : (stryCov_9fa48("98526"), !persistedParticipants)) || (stryMutAct_9fa48("98528") ? typeof persistedParticipants === 'object' : stryMutAct_9fa48("98527") ? false : (stryCov_9fa48("98527", "98528"), typeof persistedParticipants !== (stryMutAct_9fa48("98529") ? "" : (stryCov_9fa48("98529"), 'object')))))) {
        if (stryMutAct_9fa48("98530")) {
          {}
        } else {
          stryCov_9fa48("98530");
          return participants;
        }
      }
      for (const [participantKey, participant] of Object.entries(persistedParticipants)) {
        if (stryMutAct_9fa48("98531")) {
          {}
        } else {
          stryCov_9fa48("98531");
          participants.set(participantKey, stryMutAct_9fa48("98532") ? {} : (stryCov_9fa48("98532"), {
            ...this.cloneTransitionValue(participant),
            workflowId,
            participantId: String(stryMutAct_9fa48("98535") ? participant?.participantId && participantKey : stryMutAct_9fa48("98534") ? false : stryMutAct_9fa48("98533") ? true : (stryCov_9fa48("98533", "98534", "98535"), (stryMutAct_9fa48("98536") ? participant.participantId : (stryCov_9fa48("98536"), participant?.participantId)) || participantKey)),
            participantKey,
            createdAt: Number.isFinite(stryMutAct_9fa48("98537") ? participant.createdAt : (stryCov_9fa48("98537"), participant?.createdAt)) ? participant.createdAt : this.now(),
            updatedAt: Number.isFinite(stryMutAct_9fa48("98538") ? participant.updatedAt : (stryCov_9fa48("98538"), participant?.updatedAt)) ? participant.updatedAt : this.now()
          }));
        }
      }
      return participants;
    }
  }

  /**
   * Ensure the canonical split participants exist on the workflow snapshot.
   * @param {string} workflowId
   * @param {Object} transitionMetadata
   * @return {Object|null}
   * @private
   */
  ensureCanonicalSplitParticipants(workflowId, transitionMetadata = {}) {
    if (stryMutAct_9fa48("98539")) {
      {}
    } else {
      stryCov_9fa48("98539");
      const workflow = this.workflowCoordinator.getWorkflowById(workflowId);
      if (stryMutAct_9fa48("98542") ? false : stryMutAct_9fa48("98541") ? true : stryMutAct_9fa48("98540") ? workflow : (stryCov_9fa48("98540", "98541", "98542"), !workflow)) {
        if (stryMutAct_9fa48("98543")) {
          {}
        } else {
          stryCov_9fa48("98543");
          return null;
        }
      }
      if (stryMutAct_9fa48("98546") ? false : stryMutAct_9fa48("98545") ? true : stryMutAct_9fa48("98544") ? workflow.participants instanceof Map : (stryCov_9fa48("98544", "98545", "98546"), !(workflow.participants instanceof Map))) {
        if (stryMutAct_9fa48("98547")) {
          {}
        } else {
          stryCov_9fa48("98547");
          workflow.participants = new Map();
        }
      }
      const createdAt = Number.isFinite(workflow.createdAt) ? workflow.createdAt : this.now();
      const updatedAt = Number.isFinite(workflow.updatedAt) ? workflow.updatedAt : this.now();
      const sourcePartitionId = String(stryMutAct_9fa48("98550") ? (transitionMetadata?.[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID] || workflow.partitionId) && '' : stryMutAct_9fa48("98549") ? false : stryMutAct_9fa48("98548") ? true : (stryCov_9fa48("98548", "98549", "98550"), (stryMutAct_9fa48("98552") ? transitionMetadata?.[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID] && workflow.partitionId : stryMutAct_9fa48("98551") ? false : (stryCov_9fa48("98551", "98552"), (stryMutAct_9fa48("98553") ? transitionMetadata[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID] : (stryCov_9fa48("98553"), transitionMetadata?.[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID])) || workflow.partitionId)) || (stryMutAct_9fa48("98554") ? "Stryker was here!" : (stryCov_9fa48("98554"), ''))));
      const targetPartitionIds = Array.isArray(stryMutAct_9fa48("98555") ? transitionMetadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS] : (stryCov_9fa48("98555"), transitionMetadata?.[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS])) ? transitionMetadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS] : stryMutAct_9fa48("98556") ? ["Stryker was here"] : (stryCov_9fa48("98556"), []);
      const participantSpecs = stryMutAct_9fa48("98557") ? [] : (stryCov_9fa48("98557"), [stryMutAct_9fa48("98558") ? {} : (stryCov_9fa48("98558"), {
        participantKey: SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
        participantId: SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
        partitionId: stryMutAct_9fa48("98561") ? sourcePartitionId && null : stryMutAct_9fa48("98560") ? false : stryMutAct_9fa48("98559") ? true : (stryCov_9fa48("98559", "98560", "98561"), sourcePartitionId || null)
      })]);
      if (stryMutAct_9fa48("98565") ? targetPartitionIds.length <= 0 : stryMutAct_9fa48("98564") ? targetPartitionIds.length >= 0 : stryMutAct_9fa48("98563") ? false : stryMutAct_9fa48("98562") ? true : (stryCov_9fa48("98562", "98563", "98564", "98565"), targetPartitionIds.length > 0)) {
        if (stryMutAct_9fa48("98566")) {
          {}
        } else {
          stryCov_9fa48("98566");
          participantSpecs.push(stryMutAct_9fa48("98567") ? {} : (stryCov_9fa48("98567"), {
            participantKey: SPLIT_PARTICIPANT_PREFIX.LEFT_CHILD,
            participantId: SPLIT_PARTICIPANT_PREFIX.LEFT_CHILD,
            partitionId: stryMutAct_9fa48("98570") ? targetPartitionIds[0] && null : stryMutAct_9fa48("98569") ? false : stryMutAct_9fa48("98568") ? true : (stryCov_9fa48("98568", "98569", "98570"), targetPartitionIds[0] || null)
          }));
        }
      }
      if (stryMutAct_9fa48("98574") ? targetPartitionIds.length <= 1 : stryMutAct_9fa48("98573") ? targetPartitionIds.length >= 1 : stryMutAct_9fa48("98572") ? false : stryMutAct_9fa48("98571") ? true : (stryCov_9fa48("98571", "98572", "98573", "98574"), targetPartitionIds.length > 1)) {
        if (stryMutAct_9fa48("98575")) {
          {}
        } else {
          stryCov_9fa48("98575");
          participantSpecs.push(stryMutAct_9fa48("98576") ? {} : (stryCov_9fa48("98576"), {
            participantKey: SPLIT_PARTICIPANT_PREFIX.RIGHT_CHILD,
            participantId: SPLIT_PARTICIPANT_PREFIX.RIGHT_CHILD,
            partitionId: stryMutAct_9fa48("98579") ? targetPartitionIds[1] && null : stryMutAct_9fa48("98578") ? false : stryMutAct_9fa48("98577") ? true : (stryCov_9fa48("98577", "98578", "98579"), targetPartitionIds[1] || null)
          }));
        }
      }
      for (const participantSpec of participantSpecs) {
        if (stryMutAct_9fa48("98580")) {
          {}
        } else {
          stryCov_9fa48("98580");
          if (stryMutAct_9fa48("98583") ? !participantSpec.partitionId || participantSpec.participantKey !== SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION : stryMutAct_9fa48("98582") ? false : stryMutAct_9fa48("98581") ? true : (stryCov_9fa48("98581", "98582", "98583"), (stryMutAct_9fa48("98584") ? participantSpec.partitionId : (stryCov_9fa48("98584"), !participantSpec.partitionId)) && (stryMutAct_9fa48("98586") ? participantSpec.participantKey === SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION : stryMutAct_9fa48("98585") ? true : (stryCov_9fa48("98585", "98586"), participantSpec.participantKey !== SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION)))) {
            if (stryMutAct_9fa48("98587")) {
              {}
            } else {
              stryCov_9fa48("98587");
              continue;
            }
          }
          if (stryMutAct_9fa48("98589") ? false : stryMutAct_9fa48("98588") ? true : (stryCov_9fa48("98588", "98589"), workflow.participants.has(participantSpec.participantKey))) {
            if (stryMutAct_9fa48("98590")) {
              {}
            } else {
              stryCov_9fa48("98590");
              continue;
            }
          }
          workflow.participants.set(participantSpec.participantKey, stryMutAct_9fa48("98591") ? {} : (stryCov_9fa48("98591"), {
            workflowId,
            participantId: participantSpec.participantId,
            participantKey: participantSpec.participantKey,
            partitionId: participantSpec.partitionId,
            status: null,
            createdAt,
            updatedAt
          }));
        }
      }
      return workflow;
    }
  }

  /**
   * Clone one transition metadata value through JSON serialization.
   * @param {*} value
   * @return {*}
   * @private
   */
  cloneTransitionValue(value) {
    if (stryMutAct_9fa48("98592")) {
      {}
    } else {
      stryCov_9fa48("98592");
      if (stryMutAct_9fa48("98595") ? value !== undefined : stryMutAct_9fa48("98594") ? false : stryMutAct_9fa48("98593") ? true : (stryCov_9fa48("98593", "98594", "98595"), value === undefined)) {
        if (stryMutAct_9fa48("98596")) {
          {}
        } else {
          stryCov_9fa48("98596");
          return undefined;
        }
      }
      if (stryMutAct_9fa48("98599") ? value !== null : stryMutAct_9fa48("98598") ? false : stryMutAct_9fa48("98597") ? true : (stryCov_9fa48("98597", "98598", "98599"), value === null)) {
        if (stryMutAct_9fa48("98600")) {
          {}
        } else {
          stryCov_9fa48("98600");
          return null;
        }
      }
      return JSON.parse(JSON.stringify(value));
    }
  }

  /**
   * Reduce the admission result to durable workflow diagnostics.
   * @param {Object} result
   * @param {Object} context
   * @return {Object}
   * @private
   */
  compactAdmissionResult(result, context) {
    if (stryMutAct_9fa48("98601")) {
      {}
    } else {
      stryCov_9fa48("98601");
      const compact = stryMutAct_9fa48("98602") ? {} : (stryCov_9fa48("98602"), {
        state: result.decisionType,
        allowed: stryMutAct_9fa48("98605") ? result.allowed !== true : stryMutAct_9fa48("98604") ? false : stryMutAct_9fa48("98603") ? true : (stryCov_9fa48("98603", "98604", "98605"), result.allowed === (stryMutAct_9fa48("98606") ? false : (stryCov_9fa48("98606"), true))),
        decisionType: result.decisionType,
        decision: result.decision,
        reason: result.reason,
        operationType: result.operationType,
        requiredReplicaCount: result.requiredReplicaCount,
        minimumRoutableSourceCount: context.minimumRoutableSourceCount,
        isCriticalSystemPartition: stryMutAct_9fa48("98609") ? context.isCriticalSystemPartition !== true : stryMutAct_9fa48("98608") ? false : stryMutAct_9fa48("98607") ? true : (stryCov_9fa48("98607", "98608", "98609"), context.isCriticalSystemPartition === (stryMutAct_9fa48("98610") ? false : (stryCov_9fa48("98610"), true))),
        discoveredTargetNodeIds: Array.isArray(context.discoveredTargetNodeIds) ? stryMutAct_9fa48("98611") ? [] : (stryCov_9fa48("98611"), [...context.discoveredTargetNodeIds]) : stryMutAct_9fa48("98612") ? ["Stryker was here"] : (stryCov_9fa48("98612"), []),
        candidateTargetNodeIds: stryMutAct_9fa48("98613") ? [] : (stryCov_9fa48("98613"), [...context.candidateTargetNodeIds]),
        sourceRoutableNodeIds: stryMutAct_9fa48("98614") ? [] : (stryCov_9fa48("98614"), [...context.sourceRoutableNodeIds]),
        eligibleNodeIds: Array.isArray(result.eligibleNodeIds) ? stryMutAct_9fa48("98615") ? [] : (stryCov_9fa48("98615"), [...result.eligibleNodeIds]) : stryMutAct_9fa48("98616") ? ["Stryker was here"] : (stryCov_9fa48("98616"), []),
        ineligibleNodes: this.compactIneligibleNodes(result.ineligibleNodes),
        blockingReasons: Array.isArray(result.blockingReasons) ? stryMutAct_9fa48("98617") ? [] : (stryCov_9fa48("98617"), [...result.blockingReasons]) : stryMutAct_9fa48("98618") ? ["Stryker was here"] : (stryCov_9fa48("98618"), []),
        decisionTimestamp: result.decisionTimestamp,
        estimatedBytes: context.estimatedBytes
      });
      if (stryMutAct_9fa48("98621") ? result.projectedUtilizationByNodeId || typeof result.projectedUtilizationByNodeId === 'object' : stryMutAct_9fa48("98620") ? false : stryMutAct_9fa48("98619") ? true : (stryCov_9fa48("98619", "98620", "98621"), result.projectedUtilizationByNodeId && (stryMutAct_9fa48("98623") ? typeof result.projectedUtilizationByNodeId !== 'object' : stryMutAct_9fa48("98622") ? true : (stryCov_9fa48("98622", "98623"), typeof result.projectedUtilizationByNodeId === (stryMutAct_9fa48("98624") ? "" : (stryCov_9fa48("98624"), 'object')))))) {
        if (stryMutAct_9fa48("98625")) {
          {}
        } else {
          stryCov_9fa48("98625");
          compact.projectedUtilizationByNodeId = JSON.parse(JSON.stringify(result.projectedUtilizationByNodeId));
        }
      }
      if (stryMutAct_9fa48("98628") ? result.projectedUtilization || typeof result.projectedUtilization === 'object' : stryMutAct_9fa48("98627") ? false : stryMutAct_9fa48("98626") ? true : (stryCov_9fa48("98626", "98627", "98628"), result.projectedUtilization && (stryMutAct_9fa48("98630") ? typeof result.projectedUtilization !== 'object' : stryMutAct_9fa48("98629") ? true : (stryCov_9fa48("98629", "98630"), typeof result.projectedUtilization === (stryMutAct_9fa48("98631") ? "" : (stryCov_9fa48("98631"), 'object')))))) {
        if (stryMutAct_9fa48("98632")) {
          {}
        } else {
          stryCov_9fa48("98632");
          compact.projectedUtilization = JSON.parse(JSON.stringify(result.projectedUtilization));
        }
      }
      if (stryMutAct_9fa48("98635") ? result.readinessSnapshots || typeof result.readinessSnapshots === 'object' : stryMutAct_9fa48("98634") ? false : stryMutAct_9fa48("98633") ? true : (stryCov_9fa48("98633", "98634", "98635"), result.readinessSnapshots && (stryMutAct_9fa48("98637") ? typeof result.readinessSnapshots !== 'object' : stryMutAct_9fa48("98636") ? true : (stryCov_9fa48("98636", "98637"), typeof result.readinessSnapshots === (stryMutAct_9fa48("98638") ? "" : (stryCov_9fa48("98638"), 'object')))))) {
        if (stryMutAct_9fa48("98639")) {
          {}
        } else {
          stryCov_9fa48("98639");
          compact.readinessSnapshots = JSON.parse(JSON.stringify(result.readinessSnapshots));
        }
      }
      return compact;
    }
  }

  /**
   * Reduce ineligible-node entries to stable diagnostic fields.
   * @param {Object[]} entries
   * @return {Object[]}
   * @private
   */
  compactIneligibleNodes(entries) {
    if (stryMutAct_9fa48("98640")) {
      {}
    } else {
      stryCov_9fa48("98640");
      if (stryMutAct_9fa48("98643") ? false : stryMutAct_9fa48("98642") ? true : stryMutAct_9fa48("98641") ? Array.isArray(entries) : (stryCov_9fa48("98641", "98642", "98643"), !Array.isArray(entries))) {
        if (stryMutAct_9fa48("98644")) {
          {}
        } else {
          stryCov_9fa48("98644");
          return stryMutAct_9fa48("98645") ? ["Stryker was here"] : (stryCov_9fa48("98645"), []);
        }
      }
      return entries.map(entry => {
        if (stryMutAct_9fa48("98646")) {
          {}
        } else {
          stryCov_9fa48("98646");
          return stryMutAct_9fa48("98647") ? {} : (stryCov_9fa48("98647"), {
            nodeId: entry.nodeId,
            failedDimensions: Array.isArray(entry.failedDimensions) ? stryMutAct_9fa48("98648") ? [] : (stryCov_9fa48("98648"), [...entry.failedDimensions]) : stryMutAct_9fa48("98649") ? ["Stryker was here"] : (stryCov_9fa48("98649"), []),
            reasonCodes: Array.isArray(entry.reasonCodes) ? stryMutAct_9fa48("98650") ? [] : (stryCov_9fa48("98650"), [...entry.reasonCodes]) : stryMutAct_9fa48("98651") ? ["Stryker was here"] : (stryCov_9fa48("98651"), []),
            projectedUtilization: (stryMutAct_9fa48("98654") ? entry?.projectedUtilization || typeof entry.projectedUtilization === 'object' : stryMutAct_9fa48("98653") ? false : stryMutAct_9fa48("98652") ? true : (stryCov_9fa48("98652", "98653", "98654"), (stryMutAct_9fa48("98655") ? entry.projectedUtilization : (stryCov_9fa48("98655"), entry?.projectedUtilization)) && (stryMutAct_9fa48("98657") ? typeof entry.projectedUtilization !== 'object' : stryMutAct_9fa48("98656") ? true : (stryCov_9fa48("98656", "98657"), typeof entry.projectedUtilization === (stryMutAct_9fa48("98658") ? "" : (stryCov_9fa48("98658"), 'object')))))) ? JSON.parse(JSON.stringify(entry.projectedUtilization)) : null,
            nodeSummary: (stryMutAct_9fa48("98661") ? entry?.nodeSummary || typeof entry.nodeSummary === 'object' : stryMutAct_9fa48("98660") ? false : stryMutAct_9fa48("98659") ? true : (stryCov_9fa48("98659", "98660", "98661"), (stryMutAct_9fa48("98662") ? entry.nodeSummary : (stryCov_9fa48("98662"), entry?.nodeSummary)) && (stryMutAct_9fa48("98664") ? typeof entry.nodeSummary !== 'object' : stryMutAct_9fa48("98663") ? true : (stryCov_9fa48("98663", "98664"), typeof entry.nodeSummary === (stryMutAct_9fa48("98665") ? "" : (stryCov_9fa48("98665"), 'object')))))) ? JSON.parse(JSON.stringify(entry.nodeSummary)) : null
          });
        }
      });
    }
  }

  /**
   * Probe each planned child cohort before any child partition metadata is
   * inserted so the workflow can defer instead of leaving metadata-only
   * children behind.
   * @param {Object} options
   * @return {Promise<Object<string, Object>>}
   * @private
   */
  async probeChildProvisioningAdmissions(options = {}) {
    if (stryMutAct_9fa48("98666")) {
      {}
    } else {
      stryCov_9fa48("98666");
      const childProvisioningTargetNodeIdsByPartitionId = (stryMutAct_9fa48("98669") ? options.childProvisioningTargetNodeIdsByPartitionId || typeof options.childProvisioningTargetNodeIdsByPartitionId === 'object' : stryMutAct_9fa48("98668") ? false : stryMutAct_9fa48("98667") ? true : (stryCov_9fa48("98667", "98668", "98669"), options.childProvisioningTargetNodeIdsByPartitionId && (stryMutAct_9fa48("98671") ? typeof options.childProvisioningTargetNodeIdsByPartitionId !== 'object' : stryMutAct_9fa48("98670") ? true : (stryCov_9fa48("98670", "98671"), typeof options.childProvisioningTargetNodeIdsByPartitionId === (stryMutAct_9fa48("98672") ? "" : (stryCov_9fa48("98672"), 'object')))))) ? options.childProvisioningTargetNodeIdsByPartitionId : {};
      const minimumRoutableReplicaCount = (stryMutAct_9fa48("98675") ? Number.isInteger(options.minimumRoutableReplicaCount) || options.minimumRoutableReplicaCount > 0 : stryMutAct_9fa48("98674") ? false : stryMutAct_9fa48("98673") ? true : (stryCov_9fa48("98673", "98674", "98675"), Number.isInteger(options.minimumRoutableReplicaCount) && (stryMutAct_9fa48("98678") ? options.minimumRoutableReplicaCount <= 0 : stryMutAct_9fa48("98677") ? options.minimumRoutableReplicaCount >= 0 : stryMutAct_9fa48("98676") ? true : (stryCov_9fa48("98676", "98677", "98678"), options.minimumRoutableReplicaCount > 0)))) ? options.minimumRoutableReplicaCount : 1;
      const childProvisioningAdmissionByPartitionId = {};
      for (const [childPartitionId, targetNodeIdsRaw] of Object.entries(childProvisioningTargetNodeIdsByPartitionId)) {
        if (stryMutAct_9fa48("98679")) {
          {}
        } else {
          stryCov_9fa48("98679");
          const targetNodeIds = this.normalizeNodeIdList(targetNodeIdsRaw);
          const precheck = (stryMutAct_9fa48("98682") ? typeof this.probeInitialTablePartitionProvisioning !== 'function' : stryMutAct_9fa48("98681") ? false : stryMutAct_9fa48("98680") ? true : (stryCov_9fa48("98680", "98681", "98682"), typeof this.probeInitialTablePartitionProvisioning === (stryMutAct_9fa48("98683") ? "" : (stryCov_9fa48("98683"), 'function')))) ? await this.probeInitialTablePartitionProvisioning(stryMutAct_9fa48("98684") ? {} : (stryCov_9fa48("98684"), {
            partitionId: childPartitionId,
            targetNodeIds,
            minimumRoutableReplicaCount
          })) : null;
          const existingRoutableNodeIds = this.normalizeNodeIdList(stryMutAct_9fa48("98685") ? precheck.existingRoutableNodeIds : (stryCov_9fa48("98685"), precheck?.existingRoutableNodeIds));
          const candidateTargetNodeIds = this.normalizeNodeIdList(stryMutAct_9fa48("98686") ? precheck.candidateTargetNodeIds : (stryCov_9fa48("98686"), precheck?.candidateTargetNodeIds), targetNodeIds);
          const admittedTargetNodeIds = this.normalizeNodeIdList(stryMutAct_9fa48("98687") ? precheck.admittedTargetNodeIds : (stryCov_9fa48("98687"), precheck?.admittedTargetNodeIds));
          const rejectedTargetNodePlans = this.compactChildProvisioningRejectedTargetNodePlans(stryMutAct_9fa48("98688") ? precheck.rejectedTargetNodePlans : (stryCov_9fa48("98688"), precheck?.rejectedTargetNodePlans));
          const maximumProvisionableReplicaCount = Number.isInteger(stryMutAct_9fa48("98689") ? precheck.maximumProvisionableReplicaCount : (stryCov_9fa48("98689"), precheck?.maximumProvisionableReplicaCount)) ? precheck.maximumProvisionableReplicaCount : stryMutAct_9fa48("98690") ? existingRoutableNodeIds.length - admittedTargetNodeIds.length : (stryCov_9fa48("98690"), existingRoutableNodeIds.length + admittedTargetNodeIds.length);
          const allowed = stryMutAct_9fa48("98694") ? maximumProvisionableReplicaCount < minimumRoutableReplicaCount : stryMutAct_9fa48("98693") ? maximumProvisionableReplicaCount > minimumRoutableReplicaCount : stryMutAct_9fa48("98692") ? false : stryMutAct_9fa48("98691") ? true : (stryCov_9fa48("98691", "98692", "98693", "98694"), maximumProvisionableReplicaCount >= minimumRoutableReplicaCount);
          childProvisioningAdmissionByPartitionId[childPartitionId] = stryMutAct_9fa48("98695") ? {} : (stryCov_9fa48("98695"), {
            targetNodeIds,
            existingRoutableNodeIds,
            candidateTargetNodeIds,
            admittedTargetNodeIds,
            rejectedTargetNodePlans,
            maximumProvisionableReplicaCount,
            minimumRoutableReplicaCount,
            allowed,
            decisionType: allowed ? STORAGE_ADMISSION_DECISION_TYPE.ADMITTED : this.resolveChildProvisioningDecisionType(rejectedTargetNodePlans)
          });
        }
      }
      return childProvisioningAdmissionByPartitionId;
    }
  }

  /**
   * Reduce child provisioning rejections to stable durable diagnostics.
   * @param {Object[]} entries
   * @return {Object[]}
   * @private
   */
  compactChildProvisioningRejectedTargetNodePlans(entries) {
    if (stryMutAct_9fa48("98696")) {
      {}
    } else {
      stryCov_9fa48("98696");
      if (stryMutAct_9fa48("98699") ? false : stryMutAct_9fa48("98698") ? true : stryMutAct_9fa48("98697") ? Array.isArray(entries) : (stryCov_9fa48("98697", "98698", "98699"), !Array.isArray(entries))) {
        if (stryMutAct_9fa48("98700")) {
          {}
        } else {
          stryCov_9fa48("98700");
          return stryMutAct_9fa48("98701") ? ["Stryker was here"] : (stryCov_9fa48("98701"), []);
        }
      }
      return entries.map(entry => {
        if (stryMutAct_9fa48("98702")) {
          {}
        } else {
          stryCov_9fa48("98702");
          return stryMutAct_9fa48("98703") ? {} : (stryCov_9fa48("98703"), {
            targetNodeId: String(stryMutAct_9fa48("98706") ? entry?.targetNodeId && '' : stryMutAct_9fa48("98705") ? false : stryMutAct_9fa48("98704") ? true : (stryCov_9fa48("98704", "98705", "98706"), (stryMutAct_9fa48("98707") ? entry.targetNodeId : (stryCov_9fa48("98707"), entry?.targetNodeId)) || (stryMutAct_9fa48("98708") ? "Stryker was here!" : (stryCov_9fa48("98708"), '')))),
            decisionType: stryMutAct_9fa48("98711") ? entry?.decisionType && null : stryMutAct_9fa48("98710") ? false : stryMutAct_9fa48("98709") ? true : (stryCov_9fa48("98709", "98710", "98711"), (stryMutAct_9fa48("98712") ? entry.decisionType : (stryCov_9fa48("98712"), entry?.decisionType)) || null),
            blockingReasons: Array.isArray(stryMutAct_9fa48("98713") ? entry.blockingReasons : (stryCov_9fa48("98713"), entry?.blockingReasons)) ? stryMutAct_9fa48("98714") ? [] : (stryCov_9fa48("98714"), [...entry.blockingReasons]) : stryMutAct_9fa48("98715") ? ["Stryker was here"] : (stryCov_9fa48("98715"), []),
            reasonCodes: Array.isArray(stryMutAct_9fa48("98716") ? entry.reasonCodes : (stryCov_9fa48("98716"), entry?.reasonCodes)) ? stryMutAct_9fa48("98717") ? [] : (stryCov_9fa48("98717"), [...entry.reasonCodes]) : stryMutAct_9fa48("98718") ? ["Stryker was here"] : (stryCov_9fa48("98718"), []),
            nodeSummary: (stryMutAct_9fa48("98721") ? entry?.nodeSummary || typeof entry.nodeSummary === 'object' : stryMutAct_9fa48("98720") ? false : stryMutAct_9fa48("98719") ? true : (stryCov_9fa48("98719", "98720", "98721"), (stryMutAct_9fa48("98722") ? entry.nodeSummary : (stryCov_9fa48("98722"), entry?.nodeSummary)) && (stryMutAct_9fa48("98724") ? typeof entry.nodeSummary !== 'object' : stryMutAct_9fa48("98723") ? true : (stryCov_9fa48("98723", "98724"), typeof entry.nodeSummary === (stryMutAct_9fa48("98725") ? "" : (stryCov_9fa48("98725"), 'object')))))) ? JSON.parse(JSON.stringify(entry.nodeSummary)) : null,
            readinessSnapshot: (stryMutAct_9fa48("98728") ? entry?.readinessSnapshot || typeof entry.readinessSnapshot === 'object' : stryMutAct_9fa48("98727") ? false : stryMutAct_9fa48("98726") ? true : (stryCov_9fa48("98726", "98727", "98728"), (stryMutAct_9fa48("98729") ? entry.readinessSnapshot : (stryCov_9fa48("98729"), entry?.readinessSnapshot)) && (stryMutAct_9fa48("98731") ? typeof entry.readinessSnapshot !== 'object' : stryMutAct_9fa48("98730") ? true : (stryCov_9fa48("98730", "98731"), typeof entry.readinessSnapshot === (stryMutAct_9fa48("98732") ? "" : (stryCov_9fa48("98732"), 'object')))))) ? JSON.parse(JSON.stringify(entry.readinessSnapshot)) : null,
            message: stryMutAct_9fa48("98735") ? entry?.message && null : stryMutAct_9fa48("98734") ? false : stryMutAct_9fa48("98733") ? true : (stryCov_9fa48("98733", "98734", "98735"), (stryMutAct_9fa48("98736") ? entry.message : (stryCov_9fa48("98736"), entry?.message)) || null)
          });
        }
      });
    }
  }

  /**
   * Resolve one retryable denial type for child provisioning prechecks.
   * @param {Object[]} rejectedTargetNodePlans
   * @return {string}
   * @private
   */
  resolveChildProvisioningDecisionType(rejectedTargetNodePlans) {
    if (stryMutAct_9fa48("98737")) {
      {}
    } else {
      stryCov_9fa48("98737");
      let sawBlocked = stryMutAct_9fa48("98738") ? true : (stryCov_9fa48("98738"), false);
      let sawDeferred = stryMutAct_9fa48("98739") ? true : (stryCov_9fa48("98739"), false);
      for (const rejection of stryMutAct_9fa48("98742") ? rejectedTargetNodePlans && [] : stryMutAct_9fa48("98741") ? false : stryMutAct_9fa48("98740") ? true : (stryCov_9fa48("98740", "98741", "98742"), rejectedTargetNodePlans || (stryMutAct_9fa48("98743") ? ["Stryker was here"] : (stryCov_9fa48("98743"), [])))) {
        if (stryMutAct_9fa48("98744")) {
          {}
        } else {
          stryCov_9fa48("98744");
          const decisionType = String(stryMutAct_9fa48("98747") ? rejection?.decisionType && '' : stryMutAct_9fa48("98746") ? false : stryMutAct_9fa48("98745") ? true : (stryCov_9fa48("98745", "98746", "98747"), (stryMutAct_9fa48("98748") ? rejection.decisionType : (stryCov_9fa48("98748"), rejection?.decisionType)) || (stryMutAct_9fa48("98749") ? "Stryker was here!" : (stryCov_9fa48("98749"), ''))));
          if (stryMutAct_9fa48("98752") ? decisionType !== STORAGE_ADMISSION_DECISION_TYPE.BLOCKED : stryMutAct_9fa48("98751") ? false : stryMutAct_9fa48("98750") ? true : (stryCov_9fa48("98750", "98751", "98752"), decisionType === STORAGE_ADMISSION_DECISION_TYPE.BLOCKED)) {
            if (stryMutAct_9fa48("98753")) {
              {}
            } else {
              stryCov_9fa48("98753");
              sawBlocked = stryMutAct_9fa48("98754") ? false : (stryCov_9fa48("98754"), true);
            }
          }
          if (stryMutAct_9fa48("98757") ? decisionType !== STORAGE_ADMISSION_DECISION_TYPE.DEFERRED : stryMutAct_9fa48("98756") ? false : stryMutAct_9fa48("98755") ? true : (stryCov_9fa48("98755", "98756", "98757"), decisionType === STORAGE_ADMISSION_DECISION_TYPE.DEFERRED)) {
            if (stryMutAct_9fa48("98758")) {
              {}
            } else {
              stryCov_9fa48("98758");
              sawDeferred = stryMutAct_9fa48("98759") ? false : (stryCov_9fa48("98759"), true);
            }
          }
        }
      }
      if (stryMutAct_9fa48("98762") ? sawBlocked || !sawDeferred : stryMutAct_9fa48("98761") ? false : stryMutAct_9fa48("98760") ? true : (stryCov_9fa48("98760", "98761", "98762"), sawBlocked && (stryMutAct_9fa48("98763") ? sawDeferred : (stryCov_9fa48("98763"), !sawDeferred)))) {
        if (stryMutAct_9fa48("98764")) {
          {}
        } else {
          stryCov_9fa48("98764");
          return STORAGE_ADMISSION_DECISION_TYPE.BLOCKED;
        }
      }
      return STORAGE_ADMISSION_DECISION_TYPE.DEFERRED;
    }
  }

  /**
   * Persist a retryable split deferral when one or more child provisioning
   * cohorts are not viable before child metadata insertion.
   * @param {Object} options
   * @return {Promise<Object|null>}
   * @private
   */
  async handleChildProvisioningPrecheckFailure(options) {
    if (stryMutAct_9fa48("98765")) {
      {}
    } else {
      stryCov_9fa48("98765");
      const childProvisioningAdmissionByPartitionId = (stryMutAct_9fa48("98768") ? options.childProvisioningAdmissionByPartitionId || typeof options.childProvisioningAdmissionByPartitionId === 'object' : stryMutAct_9fa48("98767") ? false : stryMutAct_9fa48("98766") ? true : (stryCov_9fa48("98766", "98767", "98768"), options.childProvisioningAdmissionByPartitionId && (stryMutAct_9fa48("98770") ? typeof options.childProvisioningAdmissionByPartitionId !== 'object' : stryMutAct_9fa48("98769") ? true : (stryCov_9fa48("98769", "98770"), typeof options.childProvisioningAdmissionByPartitionId === (stryMutAct_9fa48("98771") ? "" : (stryCov_9fa48("98771"), 'object')))))) ? options.childProvisioningAdmissionByPartitionId : {};
      const failingChildPartitionIds = stryMutAct_9fa48("98772") ? Object.entries(childProvisioningAdmissionByPartitionId).map(([childPartitionId]) => childPartitionId) : (stryCov_9fa48("98772"), Object.entries(childProvisioningAdmissionByPartitionId).filter(stryMutAct_9fa48("98773") ? () => undefined : (stryCov_9fa48("98773"), ([, admission]) => stryMutAct_9fa48("98776") ? admission?.allowed === true : stryMutAct_9fa48("98775") ? false : stryMutAct_9fa48("98774") ? true : (stryCov_9fa48("98774", "98775", "98776"), (stryMutAct_9fa48("98777") ? admission.allowed : (stryCov_9fa48("98777"), admission?.allowed)) !== (stryMutAct_9fa48("98778") ? false : (stryCov_9fa48("98778"), true))))).map(stryMutAct_9fa48("98779") ? () => undefined : (stryCov_9fa48("98779"), ([childPartitionId]) => childPartitionId)));
      if (stryMutAct_9fa48("98782") ? failingChildPartitionIds.length !== 0 : stryMutAct_9fa48("98781") ? false : stryMutAct_9fa48("98780") ? true : (stryCov_9fa48("98780", "98781", "98782"), failingChildPartitionIds.length === 0)) {
        if (stryMutAct_9fa48("98783")) {
          {}
        } else {
          stryCov_9fa48("98783");
          return null;
        }
      }
      const failedAdmissions = failingChildPartitionIds.map(stryMutAct_9fa48("98784") ? () => undefined : (stryCov_9fa48("98784"), childPartitionId => childProvisioningAdmissionByPartitionId[childPartitionId]));
      const decisionType = (stryMutAct_9fa48("98785") ? failedAdmissions.some(admission => admission?.decisionType === STORAGE_ADMISSION_DECISION_TYPE.BLOCKED) : (stryCov_9fa48("98785"), failedAdmissions.every(stryMutAct_9fa48("98786") ? () => undefined : (stryCov_9fa48("98786"), admission => stryMutAct_9fa48("98789") ? admission?.decisionType !== STORAGE_ADMISSION_DECISION_TYPE.BLOCKED : stryMutAct_9fa48("98788") ? false : stryMutAct_9fa48("98787") ? true : (stryCov_9fa48("98787", "98788", "98789"), (stryMutAct_9fa48("98790") ? admission.decisionType : (stryCov_9fa48("98790"), admission?.decisionType)) === STORAGE_ADMISSION_DECISION_TYPE.BLOCKED))))) ? STORAGE_ADMISSION_DECISION_TYPE.BLOCKED : STORAGE_ADMISSION_DECISION_TYPE.DEFERRED;
      const deniedState = this.resolveAdmissionDeniedState(decisionType);
      const workflow = this.workflowCoordinator.getWorkflowById(options.workflowId);
      const retry = this.buildScheduledRetryMetadata(options.retryMetadata, deniedState);
      const failureMessage = this.buildChildProvisioningPrecheckFailureMessage(failingChildPartitionIds, childProvisioningAdmissionByPartitionId);
      const deniedMetadata = stryMutAct_9fa48("98791") ? {} : (stryCov_9fa48("98791"), {
        ...(stryMutAct_9fa48("98794") ? workflow?.metadata && {} : stryMutAct_9fa48("98793") ? false : stryMutAct_9fa48("98792") ? true : (stryCov_9fa48("98792", "98793", "98794"), (stryMutAct_9fa48("98795") ? workflow.metadata : (stryCov_9fa48("98795"), workflow?.metadata)) || {})),
        [PARTITION_TRANSITION_METADATA_FIELD.ADMISSION]: options.admission,
        [PARTITION_TRANSITION_METADATA_FIELD.TOPOLOGY_SNAPSHOT]: JSON.parse(JSON.stringify(stryMutAct_9fa48("98798") ? options.topologySnapshot && {} : stryMutAct_9fa48("98797") ? false : stryMutAct_9fa48("98796") ? true : (stryCov_9fa48("98796", "98797", "98798"), options.topologySnapshot || {}))),
        [PARTITION_TRANSITION_METADATA_FIELD.RETRY]: retry,
        [PARTITION_TRANSITION_METADATA_FIELD.FAILURE]: stryMutAct_9fa48("98799") ? {} : (stryCov_9fa48("98799"), {
          classification: stryMutAct_9fa48("98800") ? "" : (stryCov_9fa48("98800"), 'split_child_provisioning_precheck_failed'),
          message: failureMessage,
          failedAt: new Date(this.now()).toISOString(),
          retryable: stryMutAct_9fa48("98801") ? false : (stryCov_9fa48("98801"), true),
          decisionType,
          minimumRoutableReplicaCount: options.minimumRoutableReplicaCount,
          childPartitionIds: stryMutAct_9fa48("98802") ? [] : (stryCov_9fa48("98802"), [...failingChildPartitionIds])
        })
      });
      if (stryMutAct_9fa48("98804") ? false : stryMutAct_9fa48("98803") ? true : (stryCov_9fa48("98803", "98804"), workflow)) {
        if (stryMutAct_9fa48("98805")) {
          {}
        } else {
          stryCov_9fa48("98805");
          await this.workflowCoordinator.updateWorkflow(options.workflowId, stryMutAct_9fa48("98806") ? {} : (stryCov_9fa48("98806"), {
            status: deniedState,
            metadata: deniedMetadata
          }));
        }
      }
      return stryMutAct_9fa48("98807") ? {} : (stryCov_9fa48("98807"), {
        success: stryMutAct_9fa48("98808") ? true : (stryCov_9fa48("98808"), false),
        partitionId: options.partitionId,
        tableId: options.tableId,
        tableName: options.tableName,
        workflowId: options.workflowId,
        targetVersion: options.targetVersion,
        state: deniedState,
        admission: options.admission,
        retry,
        error: failureMessage,
        childProvisioningAdmissionByPartitionId: JSON.parse(JSON.stringify(childProvisioningAdmissionByPartitionId))
      });
    }
  }

  /**
   * Build one diagnostic message for insufficient child provisioning cohorts.
   * @param {string[]} failingChildPartitionIds
   * @param {Object<string, Object>} childProvisioningAdmissionByPartitionId
   * @return {string}
   * @private
   */
  buildChildProvisioningPrecheckFailureMessage(failingChildPartitionIds, childProvisioningAdmissionByPartitionId) {
    if (stryMutAct_9fa48("98809")) {
      {}
    } else {
      stryCov_9fa48("98809");
      const details = stryMutAct_9fa48("98810") ? ["Stryker was here"] : (stryCov_9fa48("98810"), []);
      for (const childPartitionId of failingChildPartitionIds) {
        if (stryMutAct_9fa48("98811")) {
          {}
        } else {
          stryCov_9fa48("98811");
          const admission = stryMutAct_9fa48("98814") ? childProvisioningAdmissionByPartitionId?.[childPartitionId] && {} : stryMutAct_9fa48("98813") ? false : stryMutAct_9fa48("98812") ? true : (stryCov_9fa48("98812", "98813", "98814"), (stryMutAct_9fa48("98815") ? childProvisioningAdmissionByPartitionId[childPartitionId] : (stryCov_9fa48("98815"), childProvisioningAdmissionByPartitionId?.[childPartitionId])) || {});
          details.push((stryMutAct_9fa48("98816") ? `` : (stryCov_9fa48("98816"), `${childPartitionId}(required=`)) + (stryMutAct_9fa48("98817") ? `` : (stryCov_9fa48("98817"), `${stryMutAct_9fa48("98820") ? admission.minimumRoutableReplicaCount && 0 : stryMutAct_9fa48("98819") ? false : stryMutAct_9fa48("98818") ? true : (stryCov_9fa48("98818", "98819", "98820"), admission.minimumRoutableReplicaCount || 0)}, `)) + (stryMutAct_9fa48("98821") ? `` : (stryCov_9fa48("98821"), `provisionable=${stryMutAct_9fa48("98824") ? admission.maximumProvisionableReplicaCount && 0 : stryMutAct_9fa48("98823") ? false : stryMutAct_9fa48("98822") ? true : (stryCov_9fa48("98822", "98823", "98824"), admission.maximumProvisionableReplicaCount || 0)}, `)) + (stryMutAct_9fa48("98825") ? `` : (stryCov_9fa48("98825"), `decision=${stryMutAct_9fa48("98828") ? admission.decisionType && 'deferred' : stryMutAct_9fa48("98827") ? false : stryMutAct_9fa48("98826") ? true : (stryCov_9fa48("98826", "98827", "98828"), admission.decisionType || (stryMutAct_9fa48("98829") ? "" : (stryCov_9fa48("98829"), 'deferred')))})`)));
        }
      }
      return (stryMutAct_9fa48("98830") ? "" : (stryCov_9fa48("98830"), 'Managed split child provisioning precheck could not satisfy ')) + (stryMutAct_9fa48("98831") ? "" : (stryCov_9fa48("98831"), 'minimum routable cohorts: ')) + details.join(stryMutAct_9fa48("98832") ? "" : (stryCov_9fa48("98832"), '; '));
    }
  }

  /**
   * Resolve whether an existing transition may be retried through admission.
   * @param {string} state
   * @return {boolean}
   * @private
   */
  isRetryableAdmissionState(transitionOrState) {
    if (stryMutAct_9fa48("98833")) {
      {}
    } else {
      stryCov_9fa48("98833");
      if (stryMutAct_9fa48("98836") ? transitionOrState || typeof transitionOrState === 'object' : stryMutAct_9fa48("98835") ? false : stryMutAct_9fa48("98834") ? true : (stryCov_9fa48("98834", "98835", "98836"), transitionOrState && (stryMutAct_9fa48("98838") ? typeof transitionOrState !== 'object' : stryMutAct_9fa48("98837") ? true : (stryCov_9fa48("98837", "98838"), typeof transitionOrState === (stryMutAct_9fa48("98839") ? "" : (stryCov_9fa48("98839"), 'object')))))) {
        if (stryMutAct_9fa48("98840")) {
          {}
        } else {
          stryCov_9fa48("98840");
          return isRetryableManagedSplitTransition(transitionOrState);
        }
      }
      const state = String(stryMutAct_9fa48("98843") ? transitionOrState && '' : stryMutAct_9fa48("98842") ? false : stryMutAct_9fa48("98841") ? true : (stryCov_9fa48("98841", "98842", "98843"), transitionOrState || (stryMutAct_9fa48("98844") ? "Stryker was here!" : (stryCov_9fa48("98844"), ''))));
      if (stryMutAct_9fa48("98846") ? false : stryMutAct_9fa48("98845") ? true : (stryCov_9fa48("98845", "98846"), RETRYABLE_PARTITION_TRANSITION_STATES.has(state))) {
        if (stryMutAct_9fa48("98847")) {
          {}
        } else {
          stryCov_9fa48("98847");
          return stryMutAct_9fa48("98848") ? false : (stryCov_9fa48("98848"), true);
        }
      }
      return isRetryableManagedSplitTransition(stryMutAct_9fa48("98849") ? {} : (stryCov_9fa48("98849"), {
        state
      }));
    }
  }

  /**
   * Persist a retryable split-planning deferral when the source partition
   * simply has not accumulated enough rows yet.
   * @param {Object} options
   * @return {Promise<Object|null>}
   * @private
   */
  async handleRetryableSplitPlanningFailure(options) {
    if (stryMutAct_9fa48("98850")) {
      {}
    } else {
      stryCov_9fa48("98850");
      if (stryMutAct_9fa48("98853") ? false : stryMutAct_9fa48("98852") ? true : stryMutAct_9fa48("98851") ? this.isRetryableSplitPlanningError(options.error) : (stryCov_9fa48("98851", "98852", "98853"), !this.isRetryableSplitPlanningError(options.error))) {
        if (stryMutAct_9fa48("98854")) {
          {}
        } else {
          stryCov_9fa48("98854");
          return null;
        }
      }
      const workflow = this.workflowCoordinator.getWorkflowById(options.workflowId);
      const deferredMetadata = stryMutAct_9fa48("98855") ? {} : (stryCov_9fa48("98855"), {
        ...(stryMutAct_9fa48("98858") ? workflow?.metadata && {} : stryMutAct_9fa48("98857") ? false : stryMutAct_9fa48("98856") ? true : (stryCov_9fa48("98856", "98857", "98858"), (stryMutAct_9fa48("98859") ? workflow.metadata : (stryCov_9fa48("98859"), workflow?.metadata)) || {})),
        [PARTITION_TRANSITION_METADATA_FIELD.ADMISSION]: options.admission,
        [PARTITION_TRANSITION_METADATA_FIELD.RETRY]: this.buildScheduledRetryMetadata(options.retryMetadata, PARTITION_TRANSITION_STATE.DEFERRED),
        [PARTITION_TRANSITION_METADATA_FIELD.FAILURE]: stryMutAct_9fa48("98860") ? {} : (stryCov_9fa48("98860"), {
          classification: stryMutAct_9fa48("98861") ? "" : (stryCov_9fa48("98861"), 'split_plan_deferred'),
          message: stryMutAct_9fa48("98864") ? options.error?.message && SPLIT_MERGE_LOG_MSG.INSUFFICIENT_ROWS_FOR_SPLIT : stryMutAct_9fa48("98863") ? false : stryMutAct_9fa48("98862") ? true : (stryCov_9fa48("98862", "98863", "98864"), (stryMutAct_9fa48("98865") ? options.error.message : (stryCov_9fa48("98865"), options.error?.message)) || SPLIT_MERGE_LOG_MSG.INSUFFICIENT_ROWS_FOR_SPLIT),
          failedAt: new Date(this.now()).toISOString(),
          retryable: stryMutAct_9fa48("98866") ? false : (stryCov_9fa48("98866"), true)
        })
      });
      if (stryMutAct_9fa48("98868") ? false : stryMutAct_9fa48("98867") ? true : (stryCov_9fa48("98867", "98868"), workflow)) {
        if (stryMutAct_9fa48("98869")) {
          {}
        } else {
          stryCov_9fa48("98869");
          await this.workflowCoordinator.updateWorkflow(options.workflowId, stryMutAct_9fa48("98870") ? {} : (stryCov_9fa48("98870"), {
            status: PARTITION_TRANSITION_STATE.DEFERRED,
            metadata: deferredMetadata
          }));
        }
      }
      return stryMutAct_9fa48("98871") ? {} : (stryCov_9fa48("98871"), {
        success: stryMutAct_9fa48("98872") ? true : (stryCov_9fa48("98872"), false),
        partitionId: options.partitionId,
        tableId: options.tableId,
        tableName: options.tableName,
        workflowId: options.workflowId,
        targetVersion: options.targetVersion,
        state: PARTITION_TRANSITION_STATE.DEFERRED,
        admission: options.admission,
        retry: deferredMetadata[PARTITION_TRANSITION_METADATA_FIELD.RETRY],
        error: stryMutAct_9fa48("98875") ? options.error?.message && SPLIT_MERGE_LOG_MSG.INSUFFICIENT_ROWS_FOR_SPLIT : stryMutAct_9fa48("98874") ? false : stryMutAct_9fa48("98873") ? true : (stryCov_9fa48("98873", "98874", "98875"), (stryMutAct_9fa48("98876") ? options.error.message : (stryCov_9fa48("98876"), options.error?.message)) || SPLIT_MERGE_LOG_MSG.INSUFFICIENT_ROWS_FOR_SPLIT)
      });
    }
  }

  /**
   * Determine whether a split-planning error should be retried later rather
   * than persisted as a terminal workflow failure.
   * @param {Error} error
   * @return {boolean}
   * @private
   */
  isRetryableSplitPlanningError(error) {
    if (stryMutAct_9fa48("98877")) {
      {}
    } else {
      stryCov_9fa48("98877");
      return stryMutAct_9fa48("98880") ? String(error?.message || '') !== SPLIT_MERGE_LOG_MSG.INSUFFICIENT_ROWS_FOR_SPLIT : stryMutAct_9fa48("98879") ? false : stryMutAct_9fa48("98878") ? true : (stryCov_9fa48("98878", "98879", "98880"), String(stryMutAct_9fa48("98883") ? error?.message && '' : stryMutAct_9fa48("98882") ? false : stryMutAct_9fa48("98881") ? true : (stryCov_9fa48("98881", "98882", "98883"), (stryMutAct_9fa48("98884") ? error.message : (stryCov_9fa48("98884"), error?.message)) || (stryMutAct_9fa48("98885") ? "Stryker was here!" : (stryCov_9fa48("98885"), '')))) === SPLIT_MERGE_LOG_MSG.INSUFFICIENT_ROWS_FOR_SPLIT);
    }
  }

  /**
   * Reconstruct one split plan from durable transition metadata so deferred
   * retries can resume with the same split identifiers.
   * @param {Object|null} existingTransition
   * @param {Object} sourcePartitionInfo
   * @return {Object|null}
   * @private
   */
  resolvePersistedSplitPlan(existingTransition, sourcePartitionInfo) {
    if (stryMutAct_9fa48("98886")) {
      {}
    } else {
      stryCov_9fa48("98886");
      if (stryMutAct_9fa48("98889") ? false : stryMutAct_9fa48("98888") ? true : stryMutAct_9fa48("98887") ? this.isRetryableAdmissionState(existingTransition) : (stryCov_9fa48("98887", "98888", "98889"), !this.isRetryableAdmissionState(existingTransition))) {
        if (stryMutAct_9fa48("98890")) {
          {}
        } else {
          stryCov_9fa48("98890");
          return null;
        }
      }
      const splitKey = stryMutAct_9fa48("98892") ? existingTransition.metadata?.[PARTITION_TRANSITION_METADATA_FIELD.SPLIT_KEY] : stryMutAct_9fa48("98891") ? existingTransition?.metadata[PARTITION_TRANSITION_METADATA_FIELD.SPLIT_KEY] : (stryCov_9fa48("98891", "98892"), existingTransition?.metadata?.[PARTITION_TRANSITION_METADATA_FIELD.SPLIT_KEY]);
      const targetPartitionIds = Array.isArray(stryMutAct_9fa48("98894") ? existingTransition.metadata?.[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS] : stryMutAct_9fa48("98893") ? existingTransition?.metadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS] : (stryCov_9fa48("98893", "98894"), existingTransition?.metadata?.[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS])) ? existingTransition.metadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS] : null;
      if (stryMutAct_9fa48("98897") ? (!splitKey || !targetPartitionIds || targetPartitionIds.length !== 2 || !targetPartitionIds[0]) && !targetPartitionIds[1] : stryMutAct_9fa48("98896") ? false : stryMutAct_9fa48("98895") ? true : (stryCov_9fa48("98895", "98896", "98897"), (stryMutAct_9fa48("98899") ? (!splitKey || !targetPartitionIds || targetPartitionIds.length !== 2) && !targetPartitionIds[0] : stryMutAct_9fa48("98898") ? false : (stryCov_9fa48("98898", "98899"), (stryMutAct_9fa48("98901") ? (!splitKey || !targetPartitionIds) && targetPartitionIds.length !== 2 : stryMutAct_9fa48("98900") ? false : (stryCov_9fa48("98900", "98901"), (stryMutAct_9fa48("98903") ? !splitKey && !targetPartitionIds : stryMutAct_9fa48("98902") ? false : (stryCov_9fa48("98902", "98903"), (stryMutAct_9fa48("98904") ? splitKey : (stryCov_9fa48("98904"), !splitKey)) || (stryMutAct_9fa48("98905") ? targetPartitionIds : (stryCov_9fa48("98905"), !targetPartitionIds)))) || (stryMutAct_9fa48("98907") ? targetPartitionIds.length === 2 : stryMutAct_9fa48("98906") ? false : (stryCov_9fa48("98906", "98907"), targetPartitionIds.length !== 2)))) || (stryMutAct_9fa48("98908") ? targetPartitionIds[0] : (stryCov_9fa48("98908"), !targetPartitionIds[0])))) || (stryMutAct_9fa48("98909") ? targetPartitionIds[1] : (stryCov_9fa48("98909"), !targetPartitionIds[1])))) {
        if (stryMutAct_9fa48("98910")) {
          {}
        } else {
          stryCov_9fa48("98910");
          return null;
        }
      }
      const [leftPartitionId, rightPartitionId] = targetPartitionIds;
      const sourceRange = this.resolvePartitionKeyRange(sourcePartitionInfo);
      const leftPartitionInfo = this.getPartitionInfo(leftPartitionId);
      const rightPartitionInfo = this.getPartitionInfo(rightPartitionId);
      const leftRange = this.resolvePartitionKeyRange(leftPartitionInfo, stryMutAct_9fa48("98911") ? {} : (stryCov_9fa48("98911"), {
        start: sourceRange.start,
        end: splitKey
      }));
      const rightRange = this.resolvePartitionKeyRange(rightPartitionInfo, stryMutAct_9fa48("98912") ? {} : (stryCov_9fa48("98912"), {
        start: splitKey,
        end: sourceRange.end
      }));
      return stryMutAct_9fa48("98913") ? {} : (stryCov_9fa48("98913"), {
        medianKey: splitKey,
        leftPartition: stryMutAct_9fa48("98914") ? {} : (stryCov_9fa48("98914"), {
          partitionId: String(leftPartitionId),
          keyRange: leftRange
        }),
        rightPartition: stryMutAct_9fa48("98915") ? {} : (stryCov_9fa48("98915"), {
          partitionId: String(rightPartitionId),
          keyRange: rightRange
        })
      });
    }
  }

  /**
   * Resolve one partition key range with optional fallback defaults.
   * @param {Object|null} partitionInfo
   * @param {Object} fallbackRange
   * @return {{start: *, end: *}}
   * @private
   */
  resolvePartitionKeyRange(partitionInfo, fallbackRange = {}) {
    if (stryMutAct_9fa48("98916")) {
      {}
    } else {
      stryCov_9fa48("98916");
      return stryMutAct_9fa48("98917") ? {} : (stryCov_9fa48("98917"), {
        start: stryMutAct_9fa48("98918") ? (partitionInfo?.partition_key_start ?? partitionInfo?.partitionKeyStart ?? fallbackRange.start) && null : (stryCov_9fa48("98918"), (stryMutAct_9fa48("98919") ? (partitionInfo?.partition_key_start ?? partitionInfo?.partitionKeyStart) && fallbackRange.start : (stryCov_9fa48("98919"), (stryMutAct_9fa48("98920") ? partitionInfo?.partition_key_start && partitionInfo?.partitionKeyStart : (stryCov_9fa48("98920"), (stryMutAct_9fa48("98921") ? partitionInfo.partition_key_start : (stryCov_9fa48("98921"), partitionInfo?.partition_key_start)) ?? (stryMutAct_9fa48("98922") ? partitionInfo.partitionKeyStart : (stryCov_9fa48("98922"), partitionInfo?.partitionKeyStart)))) ?? fallbackRange.start)) ?? null),
        end: stryMutAct_9fa48("98923") ? (partitionInfo?.partition_key_end ?? partitionInfo?.partitionKeyEnd ?? fallbackRange.end) && null : (stryCov_9fa48("98923"), (stryMutAct_9fa48("98924") ? (partitionInfo?.partition_key_end ?? partitionInfo?.partitionKeyEnd) && fallbackRange.end : (stryCov_9fa48("98924"), (stryMutAct_9fa48("98925") ? partitionInfo?.partition_key_end && partitionInfo?.partitionKeyEnd : (stryCov_9fa48("98925"), (stryMutAct_9fa48("98926") ? partitionInfo.partition_key_end : (stryCov_9fa48("98926"), partitionInfo?.partition_key_end)) ?? (stryMutAct_9fa48("98927") ? partitionInfo.partitionKeyEnd : (stryCov_9fa48("98927"), partitionInfo?.partitionKeyEnd)))) ?? fallbackRange.end)) ?? null)
      });
    }
  }

  /**
   * Persist one retryable split deferral for transient child provisioning
   * failures discovered after split admission has already been accepted.
   * @param {Object} options
   * @return {Promise<Object|null>}
   * @private
   */
  async handleRetryablePostAdmissionExecutionFailure(options) {
    if (stryMutAct_9fa48("98928")) {
      {}
    } else {
      stryCov_9fa48("98928");
      if (stryMutAct_9fa48("98931") ? false : stryMutAct_9fa48("98930") ? true : stryMutAct_9fa48("98929") ? this.isRetryablePostAdmissionExecutionError(options.error) : (stryCov_9fa48("98929", "98930", "98931"), !this.isRetryablePostAdmissionExecutionError(options.error))) {
        if (stryMutAct_9fa48("98932")) {
          {}
        } else {
          stryCov_9fa48("98932");
          return null;
        }
      }
      const decisionType = this.resolveRetryableExecutionDecisionType(options.error);
      const deferredState = this.resolveAdmissionDeniedState(decisionType);
      const workflow = this.workflowCoordinator.getWorkflowById(options.workflowId);
      const retry = this.buildScheduledRetryMetadata(options.retryMetadata, deferredState);
      const errorMessage = stryMutAct_9fa48("98935") ? options.error?.message && QUERY_ERROR_MSG.TABLE_SPLIT_START_FAILED : stryMutAct_9fa48("98934") ? false : stryMutAct_9fa48("98933") ? true : (stryCov_9fa48("98933", "98934", "98935"), (stryMutAct_9fa48("98936") ? options.error.message : (stryCov_9fa48("98936"), options.error?.message)) || QUERY_ERROR_MSG.TABLE_SPLIT_START_FAILED);
      const deferredMetadata = stryMutAct_9fa48("98937") ? {} : (stryCov_9fa48("98937"), {
        ...(stryMutAct_9fa48("98940") ? workflow?.metadata && {} : stryMutAct_9fa48("98939") ? false : stryMutAct_9fa48("98938") ? true : (stryCov_9fa48("98938", "98939", "98940"), (stryMutAct_9fa48("98941") ? workflow.metadata : (stryCov_9fa48("98941"), workflow?.metadata)) || {})),
        [PARTITION_TRANSITION_METADATA_FIELD.ADMISSION]: options.admission,
        [PARTITION_TRANSITION_METADATA_FIELD.RETRY]: retry,
        [PARTITION_TRANSITION_METADATA_FIELD.FAILURE]: stryMutAct_9fa48("98942") ? {} : (stryCov_9fa48("98942"), {
          classification: stryMutAct_9fa48("98943") ? "" : (stryCov_9fa48("98943"), 'split_child_provisioning_deferred'),
          message: errorMessage,
          failedAt: new Date(this.now()).toISOString(),
          retryable: stryMutAct_9fa48("98944") ? false : (stryCov_9fa48("98944"), true),
          decisionType
        })
      });
      if (stryMutAct_9fa48("98946") ? false : stryMutAct_9fa48("98945") ? true : (stryCov_9fa48("98945", "98946"), workflow)) {
        if (stryMutAct_9fa48("98947")) {
          {}
        } else {
          stryCov_9fa48("98947");
          await this.workflowCoordinator.updateWorkflow(options.workflowId, stryMutAct_9fa48("98948") ? {} : (stryCov_9fa48("98948"), {
            status: deferredState,
            metadata: deferredMetadata
          }));
        }
      }
      return stryMutAct_9fa48("98949") ? {} : (stryCov_9fa48("98949"), {
        success: stryMutAct_9fa48("98950") ? true : (stryCov_9fa48("98950"), false),
        partitionId: options.partitionId,
        tableId: options.tableId,
        tableName: options.tableName,
        workflowId: options.workflowId,
        targetVersion: options.targetVersion,
        state: deferredState,
        admission: options.admission,
        retry,
        error: errorMessage
      });
    }
  }

  /**
   * Determine whether one split execution failure should be retried.
   * @param {Error} error
   * @return {boolean}
   * @private
   */
  isRetryablePostAdmissionExecutionError(error) {
    if (stryMutAct_9fa48("98951")) {
      {}
    } else {
      stryCov_9fa48("98951");
      return isRetryableManagedSplitExecutionFailure(error);
    }
  }

  /**
   * Resolve one decision type for retryable post-admission failures.
   * @param {Error} error
   * @return {string}
   * @private
   */
  resolveRetryableExecutionDecisionType(error) {
    if (stryMutAct_9fa48("98952")) {
      {}
    } else {
      stryCov_9fa48("98952");
      return resolveRetryableManagedSplitExecutionDecisionType(error);
    }
  }

  /**
   * Resolve admission candidate targets from active discovery first, then
   * source-routable fallbacks when needed to satisfy split quorum.
   * @param {string[]} discoveredTargetNodeIds
   * @param {string[]} sourceRoutableNodeIds
   * @param {number} requiredReplicaCount
   * @return {string[]}
   * @private
   */
  resolveAdmissionCandidateTargetNodeIds(discoveredTargetNodeIds, sourceRoutableNodeIds, requiredReplicaCount) {
    if (stryMutAct_9fa48("98953")) {
      {}
    } else {
      stryCov_9fa48("98953");
      const candidates = stryMutAct_9fa48("98954") ? ["Stryker was here"] : (stryCov_9fa48("98954"), []);
      const seenNodeIds = new Set();
      const appendNodeIds = nodeIds => {
        if (stryMutAct_9fa48("98955")) {
          {}
        } else {
          stryCov_9fa48("98955");
          if (stryMutAct_9fa48("98958") ? false : stryMutAct_9fa48("98957") ? true : stryMutAct_9fa48("98956") ? Array.isArray(nodeIds) : (stryCov_9fa48("98956", "98957", "98958"), !Array.isArray(nodeIds))) {
            if (stryMutAct_9fa48("98959")) {
              {}
            } else {
              stryCov_9fa48("98959");
              return;
            }
          }
          for (const nodeId of nodeIds) {
            if (stryMutAct_9fa48("98960")) {
              {}
            } else {
              stryCov_9fa48("98960");
              const normalizedNodeId = String(stryMutAct_9fa48("98963") ? nodeId && '' : stryMutAct_9fa48("98962") ? false : stryMutAct_9fa48("98961") ? true : (stryCov_9fa48("98961", "98962", "98963"), nodeId || (stryMutAct_9fa48("98964") ? "Stryker was here!" : (stryCov_9fa48("98964"), ''))));
              if (stryMutAct_9fa48("98967") ? !normalizedNodeId && seenNodeIds.has(normalizedNodeId) : stryMutAct_9fa48("98966") ? false : stryMutAct_9fa48("98965") ? true : (stryCov_9fa48("98965", "98966", "98967"), (stryMutAct_9fa48("98968") ? normalizedNodeId : (stryCov_9fa48("98968"), !normalizedNodeId)) || seenNodeIds.has(normalizedNodeId))) {
                if (stryMutAct_9fa48("98969")) {
                  {}
                } else {
                  stryCov_9fa48("98969");
                  continue;
                }
              }
              seenNodeIds.add(normalizedNodeId);
              candidates.push(normalizedNodeId);
            }
          }
        }
      };
      appendNodeIds(discoveredTargetNodeIds);
      if (stryMutAct_9fa48("98973") ? candidates.length >= requiredReplicaCount : stryMutAct_9fa48("98972") ? candidates.length <= requiredReplicaCount : stryMutAct_9fa48("98971") ? false : stryMutAct_9fa48("98970") ? true : (stryCov_9fa48("98970", "98971", "98972", "98973"), candidates.length < requiredReplicaCount)) {
        if (stryMutAct_9fa48("98974")) {
          {}
        } else {
          stryCov_9fa48("98974");
          appendNodeIds(sourceRoutableNodeIds);
        }
      }
      return candidates;
    }
  }

  /**
   * Resolve the denied transition state from an admission result.
   * @param {string} decisionType
   * @return {string}
   * @private
   */
  resolveAdmissionDeniedState(decisionType) {
    if (stryMutAct_9fa48("98975")) {
      {}
    } else {
      stryCov_9fa48("98975");
      return (stryMutAct_9fa48("98978") ? decisionType !== STORAGE_ADMISSION_DECISION_TYPE.DEFERRED : stryMutAct_9fa48("98977") ? false : stryMutAct_9fa48("98976") ? true : (stryCov_9fa48("98976", "98977", "98978"), decisionType === STORAGE_ADMISSION_DECISION_TYPE.DEFERRED)) ? PARTITION_TRANSITION_STATE.DEFERRED : PARTITION_TRANSITION_STATE.BLOCKED;
    }
  }

  /**
   * Resolve the persisted retry metadata for the next workflow attempt.
   * @param {Object|null} existingTransition
   * @return {Object}
   * @private
   */
  resolvePendingRetryMetadata(existingTransition) {
    if (stryMutAct_9fa48("98979")) {
      {}
    } else {
      stryCov_9fa48("98979");
      const previousAttemptCount = Number(stryMutAct_9fa48("98982") ? existingTransition.metadata?.[PARTITION_TRANSITION_METADATA_FIELD.RETRY]?.attemptCount : stryMutAct_9fa48("98981") ? existingTransition?.metadata[PARTITION_TRANSITION_METADATA_FIELD.RETRY]?.attemptCount : stryMutAct_9fa48("98980") ? existingTransition?.metadata?.[PARTITION_TRANSITION_METADATA_FIELD.RETRY].attemptCount : (stryCov_9fa48("98980", "98981", "98982"), existingTransition?.metadata?.[PARTITION_TRANSITION_METADATA_FIELD.RETRY]?.attemptCount));
      const isRetryingExistingWorkflow = this.isRetryableAdmissionState(existingTransition);
      const attemptCount = (stryMutAct_9fa48("98985") ? Number.isInteger(previousAttemptCount) || previousAttemptCount > 0 : stryMutAct_9fa48("98984") ? false : stryMutAct_9fa48("98983") ? true : (stryCov_9fa48("98983", "98984", "98985"), Number.isInteger(previousAttemptCount) && (stryMutAct_9fa48("98988") ? previousAttemptCount <= 0 : stryMutAct_9fa48("98987") ? previousAttemptCount >= 0 : stryMutAct_9fa48("98986") ? true : (stryCov_9fa48("98986", "98987", "98988"), previousAttemptCount > 0)))) ? stryMutAct_9fa48("98989") ? previousAttemptCount - 1 : (stryCov_9fa48("98989"), previousAttemptCount + 1) : isRetryingExistingWorkflow ? 2 : 1;
      return stryMutAct_9fa48("98990") ? {} : (stryCov_9fa48("98990"), {
        attemptCount,
        lastAttemptAt: new Date(this.now()).toISOString(),
        nextAttemptAt: null,
        backoffMs: 0
      });
    }
  }

  /**
   * Resolve one retry schedule from persisted transition metadata.
   * @param {Object|null} existingTransition
   * @return {Object|null}
   * @private
   */
  resolveScheduledRetry(existingTransition) {
    if (stryMutAct_9fa48("98991")) {
      {}
    } else {
      stryCov_9fa48("98991");
      if (stryMutAct_9fa48("98994") ? false : stryMutAct_9fa48("98993") ? true : stryMutAct_9fa48("98992") ? this.isRetryableAdmissionState(existingTransition) : (stryCov_9fa48("98992", "98993", "98994"), !this.isRetryableAdmissionState(existingTransition))) {
        if (stryMutAct_9fa48("98995")) {
          {}
        } else {
          stryCov_9fa48("98995");
          return null;
        }
      }
      const retryMetadata = stryMutAct_9fa48("98997") ? existingTransition.metadata?.[PARTITION_TRANSITION_METADATA_FIELD.RETRY] : stryMutAct_9fa48("98996") ? existingTransition?.metadata[PARTITION_TRANSITION_METADATA_FIELD.RETRY] : (stryCov_9fa48("98996", "98997"), existingTransition?.metadata?.[PARTITION_TRANSITION_METADATA_FIELD.RETRY]);
      if (stryMutAct_9fa48("99000") ? !retryMetadata && typeof retryMetadata !== 'object' : stryMutAct_9fa48("98999") ? false : stryMutAct_9fa48("98998") ? true : (stryCov_9fa48("98998", "98999", "99000"), (stryMutAct_9fa48("99001") ? retryMetadata : (stryCov_9fa48("99001"), !retryMetadata)) || (stryMutAct_9fa48("99003") ? typeof retryMetadata === 'object' : stryMutAct_9fa48("99002") ? false : (stryCov_9fa48("99002", "99003"), typeof retryMetadata !== (stryMutAct_9fa48("99004") ? "" : (stryCov_9fa48("99004"), 'object')))))) {
        if (stryMutAct_9fa48("99005")) {
          {}
        } else {
          stryCov_9fa48("99005");
          return null;
        }
      }
      const nextAttemptAtRaw = retryMetadata.nextAttemptAt;
      if (stryMutAct_9fa48("99008") ? false : stryMutAct_9fa48("99007") ? true : stryMutAct_9fa48("99006") ? nextAttemptAtRaw : (stryCov_9fa48("99006", "99007", "99008"), !nextAttemptAtRaw)) {
        if (stryMutAct_9fa48("99009")) {
          {}
        } else {
          stryCov_9fa48("99009");
          return null;
        }
      }
      const nextAttemptAtMs = Date.parse(nextAttemptAtRaw);
      if (stryMutAct_9fa48("99012") ? false : stryMutAct_9fa48("99011") ? true : stryMutAct_9fa48("99010") ? Number.isFinite(nextAttemptAtMs) : (stryCov_9fa48("99010", "99011", "99012"), !Number.isFinite(nextAttemptAtMs))) {
        if (stryMutAct_9fa48("99013")) {
          {}
        } else {
          stryCov_9fa48("99013");
          return null;
        }
      }
      return stryMutAct_9fa48("99014") ? {} : (stryCov_9fa48("99014"), {
        ...retryMetadata,
        nextAttemptAt: nextAttemptAtRaw,
        retryDue: stryMutAct_9fa48("99018") ? nextAttemptAtMs > this.now() : stryMutAct_9fa48("99017") ? nextAttemptAtMs < this.now() : stryMutAct_9fa48("99016") ? false : stryMutAct_9fa48("99015") ? true : (stryCov_9fa48("99015", "99016", "99017", "99018"), nextAttemptAtMs <= this.now())
      });
    }
  }

  /**
   * Build one scheduled retry window for a retryable split state.
   * @param {Object} retryMetadata
   * @param {string} state
   * @return {Object}
   * @private
   */
  buildScheduledRetryMetadata(retryMetadata, state) {
    if (stryMutAct_9fa48("99019")) {
      {}
    } else {
      stryCov_9fa48("99019");
      const attemptCount = (stryMutAct_9fa48("99022") ? Number.isInteger(retryMetadata?.attemptCount) || retryMetadata.attemptCount > 0 : stryMutAct_9fa48("99021") ? false : stryMutAct_9fa48("99020") ? true : (stryCov_9fa48("99020", "99021", "99022"), Number.isInteger(stryMutAct_9fa48("99023") ? retryMetadata.attemptCount : (stryCov_9fa48("99023"), retryMetadata?.attemptCount)) && (stryMutAct_9fa48("99026") ? retryMetadata.attemptCount <= 0 : stryMutAct_9fa48("99025") ? retryMetadata.attemptCount >= 0 : stryMutAct_9fa48("99024") ? true : (stryCov_9fa48("99024", "99025", "99026"), retryMetadata.attemptCount > 0)))) ? retryMetadata.attemptCount : 1;
      const backoffMs = stryMutAct_9fa48("99027") ? Math.max(this.retryMaxDelayMs, this.retryBaseDelayMs * Math.pow(2, attemptCount - 1)) : (stryCov_9fa48("99027"), Math.min(this.retryMaxDelayMs, stryMutAct_9fa48("99028") ? this.retryBaseDelayMs / Math.pow(2, attemptCount - 1) : (stryCov_9fa48("99028"), this.retryBaseDelayMs * Math.pow(2, stryMutAct_9fa48("99029") ? attemptCount + 1 : (stryCov_9fa48("99029"), attemptCount - 1)))));
      return stryMutAct_9fa48("99030") ? {} : (stryCov_9fa48("99030"), {
        attemptCount,
        lastAttemptAt: stryMutAct_9fa48("99033") ? retryMetadata?.lastAttemptAt && new Date(this.now()).toISOString() : stryMutAct_9fa48("99032") ? false : stryMutAct_9fa48("99031") ? true : (stryCov_9fa48("99031", "99032", "99033"), (stryMutAct_9fa48("99034") ? retryMetadata.lastAttemptAt : (stryCov_9fa48("99034"), retryMetadata?.lastAttemptAt)) || new Date(this.now()).toISOString()),
        nextAttemptAt: new Date(stryMutAct_9fa48("99035") ? this.now() - backoffMs : (stryCov_9fa48("99035"), this.now() + backoffMs)).toISOString(),
        backoffMs,
        scheduledState: state
      });
    }
  }

  /**
   * Capture one authoritative topology snapshot for the current split attempt.
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  async resolveTopologySnapshot(options) {
    if (stryMutAct_9fa48("99036")) {
      {}
    } else {
      stryCov_9fa48("99036");
      const baseSnapshot = stryMutAct_9fa48("99037") ? {} : (stryCov_9fa48("99037"), {
        snapshotVersion: stryMutAct_9fa48("99040") ? options.retryMetadata?.attemptCount && 1 : stryMutAct_9fa48("99039") ? false : stryMutAct_9fa48("99038") ? true : (stryCov_9fa48("99038", "99039", "99040"), (stryMutAct_9fa48("99041") ? options.retryMetadata.attemptCount : (stryCov_9fa48("99041"), options.retryMetadata?.attemptCount)) || 1),
        capturedAt: new Date(this.now()).toISOString(),
        tableId: options.tableId,
        tableName: options.tableName,
        partitionId: options.partitionId,
        sourceLeaderNodeId: stryMutAct_9fa48("99044") ? (options.partitionInfo?.leader_node_id || options.partitionInfo?.leaderNodeId) && null : stryMutAct_9fa48("99043") ? false : stryMutAct_9fa48("99042") ? true : (stryCov_9fa48("99042", "99043", "99044"), (stryMutAct_9fa48("99046") ? options.partitionInfo?.leader_node_id && options.partitionInfo?.leaderNodeId : stryMutAct_9fa48("99045") ? false : (stryCov_9fa48("99045", "99046"), (stryMutAct_9fa48("99047") ? options.partitionInfo.leader_node_id : (stryCov_9fa48("99047"), options.partitionInfo?.leader_node_id)) || (stryMutAct_9fa48("99048") ? options.partitionInfo.leaderNodeId : (stryCov_9fa48("99048"), options.partitionInfo?.leaderNodeId)))) || null),
        sourcePartitionVersion: stryMutAct_9fa48("99051") ? (options.partitionInfo?.partition_version || options.partitionInfo?.partitionVersion) && null : stryMutAct_9fa48("99050") ? false : stryMutAct_9fa48("99049") ? true : (stryCov_9fa48("99049", "99050", "99051"), (stryMutAct_9fa48("99053") ? options.partitionInfo?.partition_version && options.partitionInfo?.partitionVersion : stryMutAct_9fa48("99052") ? false : (stryCov_9fa48("99052", "99053"), (stryMutAct_9fa48("99054") ? options.partitionInfo.partition_version : (stryCov_9fa48("99054"), options.partitionInfo?.partition_version)) || (stryMutAct_9fa48("99055") ? options.partitionInfo.partitionVersion : (stryCov_9fa48("99055"), options.partitionInfo?.partitionVersion)))) || null),
        activePartitionVersion: stryMutAct_9fa48("99058") ? (options.tableInfo?.active_partition_version || options.tableInfo?.activePartitionVersion) && null : stryMutAct_9fa48("99057") ? false : stryMutAct_9fa48("99056") ? true : (stryCov_9fa48("99056", "99057", "99058"), (stryMutAct_9fa48("99060") ? options.tableInfo?.active_partition_version && options.tableInfo?.activePartitionVersion : stryMutAct_9fa48("99059") ? false : (stryCov_9fa48("99059", "99060"), (stryMutAct_9fa48("99061") ? options.tableInfo.active_partition_version : (stryCov_9fa48("99061"), options.tableInfo?.active_partition_version)) || (stryMutAct_9fa48("99062") ? options.tableInfo.activePartitionVersion : (stryCov_9fa48("99062"), options.tableInfo?.activePartitionVersion)))) || null),
        targetPartitionVersion: options.targetVersion,
        requiredReplicaCount: options.requiredReplicaCount,
        minimumRoutableSourceCount: options.minimumRoutableSourceCount,
        isCriticalSystemPartition: stryMutAct_9fa48("99065") ? options.isCriticalSystemPartition !== true : stryMutAct_9fa48("99064") ? false : stryMutAct_9fa48("99063") ? true : (stryCov_9fa48("99063", "99064", "99065"), options.isCriticalSystemPartition === (stryMutAct_9fa48("99066") ? false : (stryCov_9fa48("99066"), true))),
        discoveredTargetNodeIds: stryMutAct_9fa48("99067") ? [] : (stryCov_9fa48("99067"), [...options.discoveredTargetNodeIds]),
        candidateTargetNodeIds: stryMutAct_9fa48("99068") ? [] : (stryCov_9fa48("99068"), [...options.candidateTargetNodeIds]),
        sourceRoutableNodeIds: stryMutAct_9fa48("99069") ? [] : (stryCov_9fa48("99069"), [...options.sourceRoutableNodeIds])
      });
      if (stryMutAct_9fa48("99072") ? typeof this.captureTopologySnapshot === 'function' : stryMutAct_9fa48("99071") ? false : stryMutAct_9fa48("99070") ? true : (stryCov_9fa48("99070", "99071", "99072"), typeof this.captureTopologySnapshot !== (stryMutAct_9fa48("99073") ? "" : (stryCov_9fa48("99073"), 'function')))) {
        if (stryMutAct_9fa48("99074")) {
          {}
        } else {
          stryCov_9fa48("99074");
          return baseSnapshot;
        }
      }
      const capturedSnapshot = await this.captureTopologySnapshot(stryMutAct_9fa48("99075") ? {} : (stryCov_9fa48("99075"), {
        ...options,
        baseSnapshot
      }));
      if (stryMutAct_9fa48("99078") ? !capturedSnapshot && typeof capturedSnapshot !== 'object' : stryMutAct_9fa48("99077") ? false : stryMutAct_9fa48("99076") ? true : (stryCov_9fa48("99076", "99077", "99078"), (stryMutAct_9fa48("99079") ? capturedSnapshot : (stryCov_9fa48("99079"), !capturedSnapshot)) || (stryMutAct_9fa48("99081") ? typeof capturedSnapshot === 'object' : stryMutAct_9fa48("99080") ? false : (stryCov_9fa48("99080", "99081"), typeof capturedSnapshot !== (stryMutAct_9fa48("99082") ? "" : (stryCov_9fa48("99082"), 'object')))))) {
        if (stryMutAct_9fa48("99083")) {
          {}
        } else {
          stryCov_9fa48("99083");
          return baseSnapshot;
        }
      }
      return stryMutAct_9fa48("99084") ? {} : (stryCov_9fa48("99084"), {
        ...baseSnapshot,
        ...JSON.parse(JSON.stringify(capturedSnapshot))
      });
    }
  }

  /**
   * Normalize a node-id list and fall back to one existing cohort.
   * @param {Array<string>} nodeIds
   * @param {Array<string>} fallbackNodeIds
   * @return {string[]}
   * @private
   */
  normalizeNodeIdList(nodeIds, fallbackNodeIds = stryMutAct_9fa48("99085") ? ["Stryker was here"] : (stryCov_9fa48("99085"), [])) {
    if (stryMutAct_9fa48("99086")) {
      {}
    } else {
      stryCov_9fa48("99086");
      const resolvedNodeIds = (stryMutAct_9fa48("99089") ? Array.isArray(nodeIds) || nodeIds.length > 0 : stryMutAct_9fa48("99088") ? false : stryMutAct_9fa48("99087") ? true : (stryCov_9fa48("99087", "99088", "99089"), Array.isArray(nodeIds) && (stryMutAct_9fa48("99092") ? nodeIds.length <= 0 : stryMutAct_9fa48("99091") ? nodeIds.length >= 0 : stryMutAct_9fa48("99090") ? true : (stryCov_9fa48("99090", "99091", "99092"), nodeIds.length > 0)))) ? nodeIds : fallbackNodeIds;
      const normalizedNodeIds = stryMutAct_9fa48("99093") ? ["Stryker was here"] : (stryCov_9fa48("99093"), []);
      const seenNodeIds = new Set();
      for (const nodeId of resolvedNodeIds) {
        if (stryMutAct_9fa48("99094")) {
          {}
        } else {
          stryCov_9fa48("99094");
          const normalizedNodeId = String(stryMutAct_9fa48("99097") ? nodeId && '' : stryMutAct_9fa48("99096") ? false : stryMutAct_9fa48("99095") ? true : (stryCov_9fa48("99095", "99096", "99097"), nodeId || (stryMutAct_9fa48("99098") ? "Stryker was here!" : (stryCov_9fa48("99098"), ''))));
          if (stryMutAct_9fa48("99101") ? !normalizedNodeId && seenNodeIds.has(normalizedNodeId) : stryMutAct_9fa48("99100") ? false : stryMutAct_9fa48("99099") ? true : (stryCov_9fa48("99099", "99100", "99101"), (stryMutAct_9fa48("99102") ? normalizedNodeId : (stryCov_9fa48("99102"), !normalizedNodeId)) || seenNodeIds.has(normalizedNodeId))) {
            if (stryMutAct_9fa48("99103")) {
              {}
            } else {
              stryCov_9fa48("99103");
              continue;
            }
          }
          seenNodeIds.add(normalizedNodeId);
          normalizedNodeIds.push(normalizedNodeId);
        }
      }
      return normalizedNodeIds;
    }
  }

  /**
   * Build stable child bootstrap target lists from the admitted split target
   * pool. The first replicaCount entries form the preferred spread-first
   * cohort; any remaining entries are preserved as ordered fallbacks for later
   * per-node admission checks during child provisioning.
   * @param {Object} options
   * @return {Object<string, string[]>}
   * @private
   */
  planChildProvisioningTargetNodeIds(options = {}) {
    if (stryMutAct_9fa48("99104")) {
      {}
    } else {
      stryCov_9fa48("99104");
      const childPartitionIds = this.normalizeNodeIdList(options.childPartitionIds);
      if (stryMutAct_9fa48("99107") ? childPartitionIds.length !== 0 : stryMutAct_9fa48("99106") ? false : stryMutAct_9fa48("99105") ? true : (stryCov_9fa48("99105", "99106", "99107"), childPartitionIds.length === 0)) {
        if (stryMutAct_9fa48("99108")) {
          {}
        } else {
          stryCov_9fa48("99108");
          return {};
        }
      }
      const replicaCount = (stryMutAct_9fa48("99111") ? Number.isInteger(options.replicaCount) || options.replicaCount > 0 : stryMutAct_9fa48("99110") ? false : stryMutAct_9fa48("99109") ? true : (stryCov_9fa48("99109", "99110", "99111"), Number.isInteger(options.replicaCount) && (stryMutAct_9fa48("99114") ? options.replicaCount <= 0 : stryMutAct_9fa48("99113") ? options.replicaCount >= 0 : stryMutAct_9fa48("99112") ? true : (stryCov_9fa48("99112", "99113", "99114"), options.replicaCount > 0)))) ? options.replicaCount : 1;
      const sourceRoutableNodeIds = this.normalizeNodeIdList(options.sourceRoutableNodeIds);
      const candidateTargetNodeIds = this.normalizeNodeIdList(options.eligibleNodeIds, this.normalizeNodeIdList(options.candidateTargetNodeIds, sourceRoutableNodeIds));
      const anchorNodeId = this.resolveChildProvisioningAnchorNodeId(candidateTargetNodeIds, sourceRoutableNodeIds, options.preferredAnchorNodeId);
      const sourceNodeIdSet = new Set(sourceRoutableNodeIds);
      const candidateOrderByNodeId = new Map();
      for (let index = 0; stryMutAct_9fa48("99117") ? index >= candidateTargetNodeIds.length : stryMutAct_9fa48("99116") ? index <= candidateTargetNodeIds.length : stryMutAct_9fa48("99115") ? false : (stryCov_9fa48("99115", "99116", "99117"), index < candidateTargetNodeIds.length); stryMutAct_9fa48("99118") ? index -= 1 : (stryCov_9fa48("99118"), index += 1)) {
        if (stryMutAct_9fa48("99119")) {
          {}
        } else {
          stryCov_9fa48("99119");
          candidateOrderByNodeId.set(candidateTargetNodeIds[index], index);
        }
      }
      const usageByNodeId = new Map();
      for (const nodeId of sourceRoutableNodeIds) {
        if (stryMutAct_9fa48("99120")) {
          {}
        } else {
          stryCov_9fa48("99120");
          usageByNodeId.set(nodeId, stryMutAct_9fa48("99121") ? (usageByNodeId.get(nodeId) || 0) - 1 : (stryCov_9fa48("99121"), (stryMutAct_9fa48("99124") ? usageByNodeId.get(nodeId) && 0 : stryMutAct_9fa48("99123") ? false : stryMutAct_9fa48("99122") ? true : (stryCov_9fa48("99122", "99123", "99124"), usageByNodeId.get(nodeId) || 0)) + 1));
        }
      }
      const childTargetNodeIdsByPartitionId = {};
      for (const childPartitionId of childPartitionIds) {
        if (stryMutAct_9fa48("99125")) {
          {}
        } else {
          stryCov_9fa48("99125");
          const targetNodeIds = stryMutAct_9fa48("99126") ? ["Stryker was here"] : (stryCov_9fa48("99126"), []);
          if (stryMutAct_9fa48("99128") ? false : stryMutAct_9fa48("99127") ? true : (stryCov_9fa48("99127", "99128"), anchorNodeId)) {
            if (stryMutAct_9fa48("99129")) {
              {}
            } else {
              stryCov_9fa48("99129");
              targetNodeIds.push(anchorNodeId);
              usageByNodeId.set(anchorNodeId, stryMutAct_9fa48("99130") ? (usageByNodeId.get(anchorNodeId) || 0) - 1 : (stryCov_9fa48("99130"), (stryMutAct_9fa48("99133") ? usageByNodeId.get(anchorNodeId) && 0 : stryMutAct_9fa48("99132") ? false : stryMutAct_9fa48("99131") ? true : (stryCov_9fa48("99131", "99132", "99133"), usageByNodeId.get(anchorNodeId) || 0)) + 1));
            }
          }
          while (stryMutAct_9fa48("99136") ? targetNodeIds.length >= replicaCount : stryMutAct_9fa48("99135") ? targetNodeIds.length <= replicaCount : stryMutAct_9fa48("99134") ? false : (stryCov_9fa48("99134", "99135", "99136"), targetNodeIds.length < replicaCount)) {
            if (stryMutAct_9fa48("99137")) {
              {}
            } else {
              stryCov_9fa48("99137");
              const remainingNodeIds = stryMutAct_9fa48("99138") ? candidateTargetNodeIds : (stryCov_9fa48("99138"), candidateTargetNodeIds.filter(stryMutAct_9fa48("99139") ? () => undefined : (stryCov_9fa48("99139"), nodeId => stryMutAct_9fa48("99140") ? targetNodeIds.includes(nodeId) : (stryCov_9fa48("99140"), !targetNodeIds.includes(nodeId)))));
              if (stryMutAct_9fa48("99143") ? remainingNodeIds.length !== 0 : stryMutAct_9fa48("99142") ? false : stryMutAct_9fa48("99141") ? true : (stryCov_9fa48("99141", "99142", "99143"), remainingNodeIds.length === 0)) {
                if (stryMutAct_9fa48("99144")) {
                  {}
                } else {
                  stryCov_9fa48("99144");
                  break;
                }
              }
              stryMutAct_9fa48("99145") ? remainingNodeIds : (stryCov_9fa48("99145"), remainingNodeIds.sort((leftNodeId, rightNodeId) => {
                if (stryMutAct_9fa48("99146")) {
                  {}
                } else {
                  stryCov_9fa48("99146");
                  const leftUsage = stryMutAct_9fa48("99149") ? usageByNodeId.get(leftNodeId) && 0 : stryMutAct_9fa48("99148") ? false : stryMutAct_9fa48("99147") ? true : (stryCov_9fa48("99147", "99148", "99149"), usageByNodeId.get(leftNodeId) || 0);
                  const rightUsage = stryMutAct_9fa48("99152") ? usageByNodeId.get(rightNodeId) && 0 : stryMutAct_9fa48("99151") ? false : stryMutAct_9fa48("99150") ? true : (stryCov_9fa48("99150", "99151", "99152"), usageByNodeId.get(rightNodeId) || 0);
                  if (stryMutAct_9fa48("99155") ? leftUsage === rightUsage : stryMutAct_9fa48("99154") ? false : stryMutAct_9fa48("99153") ? true : (stryCov_9fa48("99153", "99154", "99155"), leftUsage !== rightUsage)) {
                    if (stryMutAct_9fa48("99156")) {
                      {}
                    } else {
                      stryCov_9fa48("99156");
                      return stryMutAct_9fa48("99157") ? leftUsage + rightUsage : (stryCov_9fa48("99157"), leftUsage - rightUsage);
                    }
                  }
                  const leftSourcePenalty = sourceNodeIdSet.has(leftNodeId) ? 1 : 0;
                  const rightSourcePenalty = sourceNodeIdSet.has(rightNodeId) ? 1 : 0;
                  if (stryMutAct_9fa48("99160") ? leftSourcePenalty === rightSourcePenalty : stryMutAct_9fa48("99159") ? false : stryMutAct_9fa48("99158") ? true : (stryCov_9fa48("99158", "99159", "99160"), leftSourcePenalty !== rightSourcePenalty)) {
                    if (stryMutAct_9fa48("99161")) {
                      {}
                    } else {
                      stryCov_9fa48("99161");
                      return stryMutAct_9fa48("99162") ? leftSourcePenalty + rightSourcePenalty : (stryCov_9fa48("99162"), leftSourcePenalty - rightSourcePenalty);
                    }
                  }
                  return stryMutAct_9fa48("99163") ? (candidateOrderByNodeId.get(leftNodeId) || 0) + (candidateOrderByNodeId.get(rightNodeId) || 0) : (stryCov_9fa48("99163"), (stryMutAct_9fa48("99166") ? candidateOrderByNodeId.get(leftNodeId) && 0 : stryMutAct_9fa48("99165") ? false : stryMutAct_9fa48("99164") ? true : (stryCov_9fa48("99164", "99165", "99166"), candidateOrderByNodeId.get(leftNodeId) || 0)) - (stryMutAct_9fa48("99169") ? candidateOrderByNodeId.get(rightNodeId) && 0 : stryMutAct_9fa48("99168") ? false : stryMutAct_9fa48("99167") ? true : (stryCov_9fa48("99167", "99168", "99169"), candidateOrderByNodeId.get(rightNodeId) || 0)));
                }
              }));
              const selectedNodeId = remainingNodeIds[0];
              targetNodeIds.push(selectedNodeId);
              usageByNodeId.set(selectedNodeId, stryMutAct_9fa48("99170") ? (usageByNodeId.get(selectedNodeId) || 0) - 1 : (stryCov_9fa48("99170"), (stryMutAct_9fa48("99173") ? usageByNodeId.get(selectedNodeId) && 0 : stryMutAct_9fa48("99172") ? false : stryMutAct_9fa48("99171") ? true : (stryCov_9fa48("99171", "99172", "99173"), usageByNodeId.get(selectedNodeId) || 0)) + 1));
            }
          }
          const fallbackNodeIds = stryMutAct_9fa48("99174") ? candidateTargetNodeIds : (stryCov_9fa48("99174"), candidateTargetNodeIds.filter(stryMutAct_9fa48("99175") ? () => undefined : (stryCov_9fa48("99175"), nodeId => stryMutAct_9fa48("99176") ? targetNodeIds.includes(nodeId) : (stryCov_9fa48("99176"), !targetNodeIds.includes(nodeId)))));
          stryMutAct_9fa48("99177") ? fallbackNodeIds : (stryCov_9fa48("99177"), fallbackNodeIds.sort((leftNodeId, rightNodeId) => {
            if (stryMutAct_9fa48("99178")) {
              {}
            } else {
              stryCov_9fa48("99178");
              const leftUsage = stryMutAct_9fa48("99181") ? usageByNodeId.get(leftNodeId) && 0 : stryMutAct_9fa48("99180") ? false : stryMutAct_9fa48("99179") ? true : (stryCov_9fa48("99179", "99180", "99181"), usageByNodeId.get(leftNodeId) || 0);
              const rightUsage = stryMutAct_9fa48("99184") ? usageByNodeId.get(rightNodeId) && 0 : stryMutAct_9fa48("99183") ? false : stryMutAct_9fa48("99182") ? true : (stryCov_9fa48("99182", "99183", "99184"), usageByNodeId.get(rightNodeId) || 0);
              if (stryMutAct_9fa48("99187") ? leftUsage === rightUsage : stryMutAct_9fa48("99186") ? false : stryMutAct_9fa48("99185") ? true : (stryCov_9fa48("99185", "99186", "99187"), leftUsage !== rightUsage)) {
                if (stryMutAct_9fa48("99188")) {
                  {}
                } else {
                  stryCov_9fa48("99188");
                  return stryMutAct_9fa48("99189") ? leftUsage + rightUsage : (stryCov_9fa48("99189"), leftUsage - rightUsage);
                }
              }
              const leftSourcePenalty = sourceNodeIdSet.has(leftNodeId) ? 1 : 0;
              const rightSourcePenalty = sourceNodeIdSet.has(rightNodeId) ? 1 : 0;
              if (stryMutAct_9fa48("99192") ? leftSourcePenalty === rightSourcePenalty : stryMutAct_9fa48("99191") ? false : stryMutAct_9fa48("99190") ? true : (stryCov_9fa48("99190", "99191", "99192"), leftSourcePenalty !== rightSourcePenalty)) {
                if (stryMutAct_9fa48("99193")) {
                  {}
                } else {
                  stryCov_9fa48("99193");
                  return stryMutAct_9fa48("99194") ? leftSourcePenalty + rightSourcePenalty : (stryCov_9fa48("99194"), leftSourcePenalty - rightSourcePenalty);
                }
              }
              return stryMutAct_9fa48("99195") ? (candidateOrderByNodeId.get(leftNodeId) || 0) + (candidateOrderByNodeId.get(rightNodeId) || 0) : (stryCov_9fa48("99195"), (stryMutAct_9fa48("99198") ? candidateOrderByNodeId.get(leftNodeId) && 0 : stryMutAct_9fa48("99197") ? false : stryMutAct_9fa48("99196") ? true : (stryCov_9fa48("99196", "99197", "99198"), candidateOrderByNodeId.get(leftNodeId) || 0)) - (stryMutAct_9fa48("99201") ? candidateOrderByNodeId.get(rightNodeId) && 0 : stryMutAct_9fa48("99200") ? false : stryMutAct_9fa48("99199") ? true : (stryCov_9fa48("99199", "99200", "99201"), candidateOrderByNodeId.get(rightNodeId) || 0)));
            }
          }));
          childTargetNodeIdsByPartitionId[childPartitionId] = stryMutAct_9fa48("99202") ? [] : (stryCov_9fa48("99202"), [...targetNodeIds, ...fallbackNodeIds]);
        }
      }
      return childTargetNodeIdsByPartitionId;
    }
  }

  /**
   * Choose one stable anchor node to keep child bootstrap leadership local
   * when possible without forcing every follower back onto the source cohort.
   * @param {string[]} candidateTargetNodeIds
   * @param {string[]} sourceRoutableNodeIds
   * @param {string|null|undefined} preferredAnchorNodeId
   * @return {string|null}
   * @private
   */
  resolveChildProvisioningAnchorNodeId(candidateTargetNodeIds, sourceRoutableNodeIds, preferredAnchorNodeId) {
    if (stryMutAct_9fa48("99203")) {
      {}
    } else {
      stryCov_9fa48("99203");
      const preferredNodeId = String(stryMutAct_9fa48("99206") ? (preferredAnchorNodeId || this.nodeId) && '' : stryMutAct_9fa48("99205") ? false : stryMutAct_9fa48("99204") ? true : (stryCov_9fa48("99204", "99205", "99206"), (stryMutAct_9fa48("99208") ? preferredAnchorNodeId && this.nodeId : stryMutAct_9fa48("99207") ? false : (stryCov_9fa48("99207", "99208"), preferredAnchorNodeId || this.nodeId)) || (stryMutAct_9fa48("99209") ? "Stryker was here!" : (stryCov_9fa48("99209"), ''))));
      if (stryMutAct_9fa48("99212") ? preferredNodeId || candidateTargetNodeIds.includes(preferredNodeId) : stryMutAct_9fa48("99211") ? false : stryMutAct_9fa48("99210") ? true : (stryCov_9fa48("99210", "99211", "99212"), preferredNodeId && candidateTargetNodeIds.includes(preferredNodeId))) {
        if (stryMutAct_9fa48("99213")) {
          {}
        } else {
          stryCov_9fa48("99213");
          return preferredNodeId;
        }
      }
      for (const nodeId of sourceRoutableNodeIds) {
        if (stryMutAct_9fa48("99214")) {
          {}
        } else {
          stryCov_9fa48("99214");
          if (stryMutAct_9fa48("99216") ? false : stryMutAct_9fa48("99215") ? true : (stryCov_9fa48("99215", "99216"), candidateTargetNodeIds.includes(nodeId))) {
            if (stryMutAct_9fa48("99217")) {
              {}
            } else {
              stryCov_9fa48("99217");
              return nodeId;
            }
          }
        }
      }
      return stryMutAct_9fa48("99220") ? candidateTargetNodeIds[0] && null : stryMutAct_9fa48("99219") ? false : stryMutAct_9fa48("99218") ? true : (stryCov_9fa48("99218", "99219", "99220"), candidateTargetNodeIds[0] || null);
    }
  }

  /**
   * Resolve the target version for a new or retried split workflow.
   * @param {Object} tableInfo
   * @param {Object|null} existingTransition
   * @return {number}
   * @private
   */
  resolveTargetPartitionVersion(tableInfo, existingTransition) {
    if (stryMutAct_9fa48("99221")) {
      {}
    } else {
      stryCov_9fa48("99221");
      const persistedVersion = Number(stryMutAct_9fa48("99223") ? existingTransition.metadata?.[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION] : stryMutAct_9fa48("99222") ? existingTransition?.metadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION] : (stryCov_9fa48("99222", "99223"), existingTransition?.metadata?.[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]));
      if (stryMutAct_9fa48("99226") ? Number.isInteger(persistedVersion) || persistedVersion > 0 : stryMutAct_9fa48("99225") ? false : stryMutAct_9fa48("99224") ? true : (stryCov_9fa48("99224", "99225", "99226"), Number.isInteger(persistedVersion) && (stryMutAct_9fa48("99229") ? persistedVersion <= 0 : stryMutAct_9fa48("99228") ? persistedVersion >= 0 : stryMutAct_9fa48("99227") ? true : (stryCov_9fa48("99227", "99228", "99229"), persistedVersion > 0)))) {
        if (stryMutAct_9fa48("99230")) {
          {}
        } else {
          stryCov_9fa48("99230");
          return persistedVersion;
        }
      }
      return stryMutAct_9fa48("99231") ? this.resolveActivePartitionVersion(tableInfo) - 1 : (stryCov_9fa48("99231"), this.resolveActivePartitionVersion(tableInfo) + 1);
    }
  }

  /**
   * Resolve the durable workflow identifier for a new or retried split.
   * @param {string} tableId
   * @param {string} partitionId
   * @param {number} targetVersion
   * @param {Object|null} existingTransition
   * @return {string}
   * @private
   */
  resolveWorkflowId(tableId, partitionId, targetVersion, existingTransition) {
    if (stryMutAct_9fa48("99232")) {
      {}
    } else {
      stryCov_9fa48("99232");
      const persistedWorkflowId = String(stryMutAct_9fa48("99235") ? existingTransition?.metadata?.[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID] && '' : stryMutAct_9fa48("99234") ? false : stryMutAct_9fa48("99233") ? true : (stryCov_9fa48("99233", "99234", "99235"), (stryMutAct_9fa48("99237") ? existingTransition.metadata?.[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID] : stryMutAct_9fa48("99236") ? existingTransition?.metadata[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID] : (stryCov_9fa48("99236", "99237"), existingTransition?.metadata?.[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID])) || (stryMutAct_9fa48("99238") ? "Stryker was here!" : (stryCov_9fa48("99238"), ''))));
      return stryMutAct_9fa48("99241") ? persistedWorkflowId && this.createWorkflowId(tableId, partitionId, targetVersion) : stryMutAct_9fa48("99240") ? false : stryMutAct_9fa48("99239") ? true : (stryCov_9fa48("99239", "99240", "99241"), persistedWorkflowId || this.createWorkflowId(tableId, partitionId, targetVersion));
    }
  }

  /**
   * Obtain a canonical split admission result.
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  resolveSplitMinimumRoutableSourceCount(options = {}) {
    if (stryMutAct_9fa48("99242")) {
      {}
    } else {
      stryCov_9fa48("99242");
      if (stryMutAct_9fa48("99245") ? options.isCriticalSystemPartition !== true : stryMutAct_9fa48("99244") ? false : stryMutAct_9fa48("99243") ? true : (stryCov_9fa48("99243", "99244", "99245"), options.isCriticalSystemPartition === (stryMutAct_9fa48("99246") ? false : (stryCov_9fa48("99246"), true)))) {
        if (stryMutAct_9fa48("99247")) {
          {}
        } else {
          stryCov_9fa48("99247");
          return CRITICAL_SPLIT_MINIMUM_ROUTABLE_SOURCE_COUNT;
        }
      }
      return options.requiredReplicaCount;
    }
  }

  /**
   * Obtain a canonical split admission result.
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  async evaluateSplitAdmission(options) {
    if (stryMutAct_9fa48("99248")) {
      {}
    } else {
      stryCov_9fa48("99248");
      return this.storageAdmissionService.checkSplit(stryMutAct_9fa48("99249") ? {} : (stryCov_9fa48("99249"), {
        targetNodeIds: options.candidateTargetNodeIds,
        estimatedBytes: options.estimatedBytes,
        requiredReplicaCount: options.requiredReplicaCount,
        minimumRoutableSourceCount: options.minimumRoutableSourceCount,
        sourceRoutableNodeIds: options.sourceRoutableNodeIds
      }));
    }
  }

  /**
   * Estimate split-admission bytes when no explicit estimator is injected.
   * @param {Object} partitionInfo
   * @return {number}
   * @private
   */
  defaultEstimateSplitAdmissionBytes(partitionInfo) {
    if (stryMutAct_9fa48("99250")) {
      {}
    } else {
      stryCov_9fa48("99250");
      const sizeBytes = Number(stryMutAct_9fa48("99251") ? partitionInfo?.size_bytes && partitionInfo?.sizeBytes : (stryCov_9fa48("99251"), (stryMutAct_9fa48("99252") ? partitionInfo.size_bytes : (stryCov_9fa48("99252"), partitionInfo?.size_bytes)) ?? (stryMutAct_9fa48("99253") ? partitionInfo.sizeBytes : (stryCov_9fa48("99253"), partitionInfo?.sizeBytes))));
      if (stryMutAct_9fa48("99256") ? Number.isFinite(sizeBytes) || sizeBytes > 0 : stryMutAct_9fa48("99255") ? false : stryMutAct_9fa48("99254") ? true : (stryCov_9fa48("99254", "99255", "99256"), Number.isFinite(sizeBytes) && (stryMutAct_9fa48("99259") ? sizeBytes <= 0 : stryMutAct_9fa48("99258") ? sizeBytes >= 0 : stryMutAct_9fa48("99257") ? true : (stryCov_9fa48("99257", "99258", "99259"), sizeBytes > 0)))) {
        if (stryMutAct_9fa48("99260")) {
          {}
        } else {
          stryCov_9fa48("99260");
          return Math.ceil(sizeBytes);
        }
      }
      return 1;
    }
  }

  /**
   * Persist an execution failure after a split has already been admitted.
   * @param {string} workflowId
   * @param {Error} error
   * @return {Promise<void>}
   * @private
   */
  async persistExecutionFailure(workflowId, error) {
    if (stryMutAct_9fa48("99261")) {
      {}
    } else {
      stryCov_9fa48("99261");
      const workflow = this.workflowCoordinator.getWorkflowById(workflowId);
      if (stryMutAct_9fa48("99264") ? false : stryMutAct_9fa48("99263") ? true : stryMutAct_9fa48("99262") ? workflow : (stryCov_9fa48("99262", "99263", "99264"), !workflow)) {
        if (stryMutAct_9fa48("99265")) {
          {}
        } else {
          stryCov_9fa48("99265");
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("99266")) {
          {}
        } else {
          stryCov_9fa48("99266");
          const timeoutClassification = (stryMutAct_9fa48("99269") ? error?.timeoutClassification || typeof error.timeoutClassification === 'object' : stryMutAct_9fa48("99268") ? false : stryMutAct_9fa48("99267") ? true : (stryCov_9fa48("99267", "99268", "99269"), (stryMutAct_9fa48("99270") ? error.timeoutClassification : (stryCov_9fa48("99270"), error?.timeoutClassification)) && (stryMutAct_9fa48("99272") ? typeof error.timeoutClassification !== 'object' : stryMutAct_9fa48("99271") ? true : (stryCov_9fa48("99271", "99272"), typeof error.timeoutClassification === (stryMutAct_9fa48("99273") ? "" : (stryCov_9fa48("99273"), 'object')))))) ? error.timeoutClassification : null;
          await this.workflowCoordinator.updateWorkflow(workflowId, stryMutAct_9fa48("99274") ? {} : (stryCov_9fa48("99274"), {
            status: PARTITION_TRANSITION_STATE.FAILED,
            metadata: stryMutAct_9fa48("99275") ? {} : (stryCov_9fa48("99275"), {
              ...(stryMutAct_9fa48("99278") ? workflow.metadata && {} : stryMutAct_9fa48("99277") ? false : stryMutAct_9fa48("99276") ? true : (stryCov_9fa48("99276", "99277", "99278"), workflow.metadata || {})),
              [PARTITION_TRANSITION_METADATA_FIELD.FAILURE]: stryMutAct_9fa48("99279") ? {} : (stryCov_9fa48("99279"), {
                classification: stryMutAct_9fa48("99280") ? "" : (stryCov_9fa48("99280"), 'split_execution_failure'),
                message: stryMutAct_9fa48("99283") ? error?.message && QUERY_ERROR_MSG.TABLE_SPLIT_START_FAILED : stryMutAct_9fa48("99282") ? false : stryMutAct_9fa48("99281") ? true : (stryCov_9fa48("99281", "99282", "99283"), (stryMutAct_9fa48("99284") ? error.message : (stryCov_9fa48("99284"), error?.message)) || QUERY_ERROR_MSG.TABLE_SPLIT_START_FAILED),
                failedAt: new Date(this.now()).toISOString(),
                ...(timeoutClassification ? stryMutAct_9fa48("99285") ? {} : (stryCov_9fa48("99285"), {
                  timeoutClassification
                }) : {})
              })
            })
          }));
        }
      } catch (persistError) {
        if (stryMutAct_9fa48("99286")) {
          {}
        } else {
          stryCov_9fa48("99286");
          this.logger.error(stryMutAct_9fa48("99287") ? "" : (stryCov_9fa48("99287"), 'Failed to persist managed split workflow failure'), stryMutAct_9fa48("99288") ? {} : (stryCov_9fa48("99288"), {
            workflowId,
            error: stryMutAct_9fa48("99291") ? persistError?.message && persistError : stryMutAct_9fa48("99290") ? false : stryMutAct_9fa48("99289") ? true : (stryCov_9fa48("99289", "99290", "99291"), (stryMutAct_9fa48("99292") ? persistError.message : (stryCov_9fa48("99292"), persistError?.message)) || persistError)
          }));
        }
      }
    }
  }

  /**
   * Persist workflow state through the canonical tables transition row.
   * @param {Object} workflow - Workflow state.
   * @return {Promise<void>}
   * @private
   */
  async persistWorkflowTransition(workflow) {
    if (stryMutAct_9fa48("99293")) {
      {}
    } else {
      stryCov_9fa48("99293");
      const cdcIntegrationService = this.getCDCIntegrationService();
      if (stryMutAct_9fa48("99296") ? !cdcIntegrationService && typeof cdcIntegrationService.updateSystemTableRow !== 'function' : stryMutAct_9fa48("99295") ? false : stryMutAct_9fa48("99294") ? true : (stryCov_9fa48("99294", "99295", "99296"), (stryMutAct_9fa48("99297") ? cdcIntegrationService : (stryCov_9fa48("99297"), !cdcIntegrationService)) || (stryMutAct_9fa48("99299") ? typeof cdcIntegrationService.updateSystemTableRow === 'function' : stryMutAct_9fa48("99298") ? false : (stryCov_9fa48("99298", "99299"), typeof cdcIntegrationService.updateSystemTableRow !== (stryMutAct_9fa48("99300") ? "" : (stryCov_9fa48("99300"), 'function')))))) {
        if (stryMutAct_9fa48("99301")) {
          {}
        } else {
          stryCov_9fa48("99301");
          return;
        }
      }
      const pendingPartitionVersion = Number(stryMutAct_9fa48("99302") ? workflow.metadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION] : (stryCov_9fa48("99302"), workflow.metadata?.[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]));
      const serializedMetadata = JSON.stringify(this.buildPersistedTransitionMetadata(workflow));
      const updatePayload = stryMutAct_9fa48("99303") ? {} : (stryCov_9fa48("99303"), {
        pending_partition_version: Number.isInteger(pendingPartitionVersion) ? pendingPartitionVersion : null,
        partition_transition_state: workflow.status,
        partition_transition_metadata: serializedMetadata,
        updated_at: workflow.updatedAt
      });

      // Cutover activation promotes the target partition version to active
      // and clears the pending version. These fields were previously written
      // by PartitionService.markSplitCutoverActive() directly — now the
      // workflow owner persists them as part of the canonical transition.
      if (stryMutAct_9fa48("99306") ? workflow.status !== PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE : stryMutAct_9fa48("99305") ? false : stryMutAct_9fa48("99304") ? true : (stryCov_9fa48("99304", "99305", "99306"), workflow.status === PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE)) {
        if (stryMutAct_9fa48("99307")) {
          {}
        } else {
          stryCov_9fa48("99307");
          const targetIds = stryMutAct_9fa48("99308") ? workflow.metadata[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS] : (stryCov_9fa48("99308"), workflow.metadata?.[PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS]);
          if (stryMutAct_9fa48("99310") ? false : stryMutAct_9fa48("99309") ? true : (stryCov_9fa48("99309", "99310"), Number.isInteger(pendingPartitionVersion))) {
            if (stryMutAct_9fa48("99311")) {
              {}
            } else {
              stryCov_9fa48("99311");
              updatePayload.active_partition_version = pendingPartitionVersion;
              updatePayload.pending_partition_version = null;
            }
          }
          if (stryMutAct_9fa48("99314") ? Array.isArray(targetIds) || targetIds.length > 0 : stryMutAct_9fa48("99313") ? false : stryMutAct_9fa48("99312") ? true : (stryCov_9fa48("99312", "99313", "99314"), Array.isArray(targetIds) && (stryMutAct_9fa48("99317") ? targetIds.length <= 0 : stryMutAct_9fa48("99316") ? targetIds.length >= 0 : stryMutAct_9fa48("99315") ? true : (stryCov_9fa48("99315", "99316", "99317"), targetIds.length > 0)))) {
            if (stryMutAct_9fa48("99318")) {
              {}
            } else {
              stryCov_9fa48("99318");
              updatePayload.partition_count = targetIds.length;
            }
          }
        }
      }
      await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("99319") ? {} : (stryCov_9fa48("99319"), {
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName: TABLES.TABLES,
        whereClause: stryMutAct_9fa48("99320") ? {} : (stryCov_9fa48("99320"), {
          table_id: workflow.tableId
        }),
        data: updatePayload
      }), stryMutAct_9fa48("99321") ? {} : (stryCov_9fa48("99321"), {
        expectedCacheFields: stryMutAct_9fa48("99322") ? {} : (stryCov_9fa48("99322"), {
          pending_partition_version: updatePayload.pending_partition_version,
          partition_transition_state: workflow.status,
          partition_transition_metadata: serializedMetadata
        })
      }));
    }
  }

  /**
   * Build the durable transition metadata for one workflow snapshot.
   * @param {Object} workflow - Workflow state.
   * @return {Object}
   * @private
   */
  buildPersistedTransitionMetadata(workflow) {
    if (stryMutAct_9fa48("99323")) {
      {}
    } else {
      stryCov_9fa48("99323");
      const metadata = (stryMutAct_9fa48("99326") ? workflow.metadata || typeof workflow.metadata === 'object' : stryMutAct_9fa48("99325") ? false : stryMutAct_9fa48("99324") ? true : (stryCov_9fa48("99324", "99325", "99326"), workflow.metadata && (stryMutAct_9fa48("99328") ? typeof workflow.metadata !== 'object' : stryMutAct_9fa48("99327") ? true : (stryCov_9fa48("99327", "99328"), typeof workflow.metadata === (stryMutAct_9fa48("99329") ? "" : (stryCov_9fa48("99329"), 'object')))))) ? stryMutAct_9fa48("99330") ? {} : (stryCov_9fa48("99330"), {
        ...workflow.metadata
      }) : {};
      const participants = this.serializeParticipantsForMetadata(workflow);
      if (stryMutAct_9fa48("99332") ? false : stryMutAct_9fa48("99331") ? true : (stryCov_9fa48("99331", "99332"), participants)) {
        if (stryMutAct_9fa48("99333")) {
          {}
        } else {
          stryCov_9fa48("99333");
          metadata[PARTITION_TRANSITION_METADATA_FIELD.PARTICIPANTS] = participants;
        }
      } else {
        if (stryMutAct_9fa48("99334")) {
          {}
        } else {
          stryCov_9fa48("99334");
          delete metadata[PARTITION_TRANSITION_METADATA_FIELD.PARTICIPANTS];
        }
      }
      const sourceCheckpoint = this.resolveSourceCheckpoint(workflow);
      if (stryMutAct_9fa48("99336") ? false : stryMutAct_9fa48("99335") ? true : (stryCov_9fa48("99335", "99336"), sourceCheckpoint)) {
        if (stryMutAct_9fa48("99337")) {
          {}
        } else {
          stryCov_9fa48("99337");
          metadata[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_CHECKPOINT] = sourceCheckpoint;
        }
      } else {
        if (stryMutAct_9fa48("99338")) {
          {}
        } else {
          stryCov_9fa48("99338");
          delete metadata[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_CHECKPOINT];
        }
      }
      return metadata;
    }
  }

  /**
   * Serialize workflow participants into durable metadata.
   * @param {Object} workflow - Workflow state.
   * @return {Object|null}
   * @private
   */
  serializeParticipantsForMetadata(workflow) {
    if (stryMutAct_9fa48("99339")) {
      {}
    } else {
      stryCov_9fa48("99339");
      if (stryMutAct_9fa48("99342") ? !(workflow.participants instanceof Map) && workflow.participants.size === 0 : stryMutAct_9fa48("99341") ? false : stryMutAct_9fa48("99340") ? true : (stryCov_9fa48("99340", "99341", "99342"), (stryMutAct_9fa48("99343") ? workflow.participants instanceof Map : (stryCov_9fa48("99343"), !(workflow.participants instanceof Map))) || (stryMutAct_9fa48("99345") ? workflow.participants.size !== 0 : stryMutAct_9fa48("99344") ? false : (stryCov_9fa48("99344", "99345"), workflow.participants.size === 0)))) {
        if (stryMutAct_9fa48("99346")) {
          {}
        } else {
          stryCov_9fa48("99346");
          return null;
        }
      }
      const serialized = {};
      for (const [participantKey, participant] of workflow.participants.entries()) {
        if (stryMutAct_9fa48("99347")) {
          {}
        } else {
          stryCov_9fa48("99347");
          serialized[participantKey] = JSON.parse(JSON.stringify(participant));
        }
      }
      return serialized;
    }
  }

  /**
   * Extract the source participant checkpoint for durable recovery.
   * @param {Object} workflow - Workflow state.
   * @return {Object|null}
   * @private
   */
  resolveSourceCheckpoint(workflow) {
    if (stryMutAct_9fa48("99348")) {
      {}
    } else {
      stryCov_9fa48("99348");
      if (stryMutAct_9fa48("99351") ? !(workflow.participants instanceof Map) && workflow.participants.size === 0 : stryMutAct_9fa48("99350") ? false : stryMutAct_9fa48("99349") ? true : (stryCov_9fa48("99349", "99350", "99351"), (stryMutAct_9fa48("99352") ? workflow.participants instanceof Map : (stryCov_9fa48("99352"), !(workflow.participants instanceof Map))) || (stryMutAct_9fa48("99354") ? workflow.participants.size !== 0 : stryMutAct_9fa48("99353") ? false : (stryCov_9fa48("99353", "99354"), workflow.participants.size === 0)))) {
        if (stryMutAct_9fa48("99355")) {
          {}
        } else {
          stryCov_9fa48("99355");
          return null;
        }
      }
      for (const [participantKey, participant] of workflow.participants.entries()) {
        if (stryMutAct_9fa48("99356")) {
          {}
        } else {
          stryCov_9fa48("99356");
          if (stryMutAct_9fa48("99359") ? false : stryMutAct_9fa48("99358") ? true : stryMutAct_9fa48("99357") ? String(participantKey).startsWith(SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION) : (stryCov_9fa48("99357", "99358", "99359"), !(stryMutAct_9fa48("99360") ? String(participantKey).endsWith(SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION) : (stryCov_9fa48("99360"), String(participantKey).startsWith(SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION))))) {
            if (stryMutAct_9fa48("99361")) {
              {}
            } else {
              stryCov_9fa48("99361");
              continue;
            }
          }
          if (stryMutAct_9fa48("99364") ? participant?.checkpoint === undefined && participant?.checkpoint === null : stryMutAct_9fa48("99363") ? false : stryMutAct_9fa48("99362") ? true : (stryCov_9fa48("99362", "99363", "99364"), (stryMutAct_9fa48("99366") ? participant?.checkpoint !== undefined : stryMutAct_9fa48("99365") ? false : (stryCov_9fa48("99365", "99366"), (stryMutAct_9fa48("99367") ? participant.checkpoint : (stryCov_9fa48("99367"), participant?.checkpoint)) === undefined)) || (stryMutAct_9fa48("99369") ? participant?.checkpoint !== null : stryMutAct_9fa48("99368") ? false : (stryCov_9fa48("99368", "99369"), (stryMutAct_9fa48("99370") ? participant.checkpoint : (stryCov_9fa48("99370"), participant?.checkpoint)) === null)))) {
            if (stryMutAct_9fa48("99371")) {
              {}
            } else {
              stryCov_9fa48("99371");
              return null;
            }
          }
          return JSON.parse(JSON.stringify(participant.checkpoint));
        }
      }
      return null;
    }
  }

  /**
   * Ensure child partition metadata rows exist with the expected identity.
   * Retries after deferred execution reuse existing rows instead of reinserting.
   * @param {Object} options
   * @return {Promise<void>}
   * @private
   */
  async ensureChildPartitionMetadata(options = {}) {
    if (stryMutAct_9fa48("99372")) {
      {}
    } else {
      stryCov_9fa48("99372");
      const leftPartitionMetadata = options.leftPartitionMetadata;
      const rightPartitionMetadata = options.rightPartitionMetadata;
      const leftPartitionId = String(stryMutAct_9fa48("99375") ? leftPartitionMetadata?.partition_id && '' : stryMutAct_9fa48("99374") ? false : stryMutAct_9fa48("99373") ? true : (stryCov_9fa48("99373", "99374", "99375"), (stryMutAct_9fa48("99376") ? leftPartitionMetadata.partition_id : (stryCov_9fa48("99376"), leftPartitionMetadata?.partition_id)) || (stryMutAct_9fa48("99377") ? "Stryker was here!" : (stryCov_9fa48("99377"), ''))));
      const rightPartitionId = String(stryMutAct_9fa48("99380") ? rightPartitionMetadata?.partition_id && '' : stryMutAct_9fa48("99379") ? false : stryMutAct_9fa48("99378") ? true : (stryCov_9fa48("99378", "99379", "99380"), (stryMutAct_9fa48("99381") ? rightPartitionMetadata.partition_id : (stryCov_9fa48("99381"), rightPartitionMetadata?.partition_id)) || (stryMutAct_9fa48("99382") ? "Stryker was here!" : (stryCov_9fa48("99382"), ''))));
      const leftExistingPartition = this.resolveChildPartitionMetadataRow(leftPartitionId);
      const rightExistingPartition = this.resolveChildPartitionMetadataRow(rightPartitionId);
      const leftExists = stryMutAct_9fa48("99383") ? !leftExistingPartition : (stryCov_9fa48("99383"), !(stryMutAct_9fa48("99384") ? leftExistingPartition : (stryCov_9fa48("99384"), !leftExistingPartition)));
      const rightExists = stryMutAct_9fa48("99385") ? !rightExistingPartition : (stryCov_9fa48("99385"), !(stryMutAct_9fa48("99386") ? rightExistingPartition : (stryCov_9fa48("99386"), !rightExistingPartition)));
      if (stryMutAct_9fa48("99389") ? !leftExists || !rightExists : stryMutAct_9fa48("99388") ? false : stryMutAct_9fa48("99387") ? true : (stryCov_9fa48("99387", "99388", "99389"), (stryMutAct_9fa48("99390") ? leftExists : (stryCov_9fa48("99390"), !leftExists)) && (stryMutAct_9fa48("99391") ? rightExists : (stryCov_9fa48("99391"), !rightExists)))) {
        if (stryMutAct_9fa48("99392")) {
          {}
        } else {
          stryCov_9fa48("99392");
          await this.insertPartitionMetadataAtomically(leftPartitionMetadata, rightPartitionMetadata);
          return;
        }
      }
      if (stryMutAct_9fa48("99395") ? leftExists === rightExists : stryMutAct_9fa48("99394") ? false : stryMutAct_9fa48("99393") ? true : (stryCov_9fa48("99393", "99394", "99395"), leftExists !== rightExists)) {
        if (stryMutAct_9fa48("99396")) {
          {}
        } else {
          stryCov_9fa48("99396");
          throw new Error((stryMutAct_9fa48("99397") ? "" : (stryCov_9fa48("99397"), 'Managed split child partition metadata is inconsistent: exactly one ')) + (stryMutAct_9fa48("99398") ? "" : (stryCov_9fa48("99398"), 'child row exists')));
        }
      }
      this.assertExistingChildPartitionMetadataMatches(leftPartitionMetadata, leftExistingPartition);
      this.assertExistingChildPartitionMetadataMatches(rightPartitionMetadata, rightExistingPartition);
    }
  }

  /**
   * Resolve one existing child metadata row by partition identity.
   * @param {string} partitionId
   * @return {Object|null}
   * @private
   */
  resolveChildPartitionMetadataRow(partitionId) {
    if (stryMutAct_9fa48("99399")) {
      {}
    } else {
      stryCov_9fa48("99399");
      if (stryMutAct_9fa48("99402") ? false : stryMutAct_9fa48("99401") ? true : stryMutAct_9fa48("99400") ? partitionId : (stryCov_9fa48("99400", "99401", "99402"), !partitionId)) {
        if (stryMutAct_9fa48("99403")) {
          {}
        } else {
          stryCov_9fa48("99403");
          return null;
        }
      }
      const partition = this.getPartitionInfo(partitionId);
      const resolvedPartitionId = String(stryMutAct_9fa48("99404") ? (partition?.partition_id ?? partition?.partitionId) && '' : (stryCov_9fa48("99404"), (stryMutAct_9fa48("99405") ? partition?.partition_id && partition?.partitionId : (stryCov_9fa48("99405"), (stryMutAct_9fa48("99406") ? partition.partition_id : (stryCov_9fa48("99406"), partition?.partition_id)) ?? (stryMutAct_9fa48("99407") ? partition.partitionId : (stryCov_9fa48("99407"), partition?.partitionId)))) ?? (stryMutAct_9fa48("99408") ? "Stryker was here!" : (stryCov_9fa48("99408"), ''))));
      if (stryMutAct_9fa48("99411") ? !resolvedPartitionId && resolvedPartitionId !== partitionId : stryMutAct_9fa48("99410") ? false : stryMutAct_9fa48("99409") ? true : (stryCov_9fa48("99409", "99410", "99411"), (stryMutAct_9fa48("99412") ? resolvedPartitionId : (stryCov_9fa48("99412"), !resolvedPartitionId)) || (stryMutAct_9fa48("99414") ? resolvedPartitionId === partitionId : stryMutAct_9fa48("99413") ? false : (stryCov_9fa48("99413", "99414"), resolvedPartitionId !== partitionId)))) {
        if (stryMutAct_9fa48("99415")) {
          {}
        } else {
          stryCov_9fa48("99415");
          return null;
        }
      }
      return partition;
    }
  }

  /**
   * Assert an existing child row matches expected split metadata fields.
   * @param {Object} expected
   * @param {Object} existing
   * @return {void}
   * @private
   */
  assertExistingChildPartitionMetadataMatches(expected, existing) {
    if (stryMutAct_9fa48("99416")) {
      {}
    } else {
      stryCov_9fa48("99416");
      const mismatches = stryMutAct_9fa48("99417") ? ["Stryker was here"] : (stryCov_9fa48("99417"), []);
      const compareField = (label, expectedValue, existingValue) => {
        if (stryMutAct_9fa48("99418")) {
          {}
        } else {
          stryCov_9fa48("99418");
          if (stryMutAct_9fa48("99421") ? expectedValue === existingValue : stryMutAct_9fa48("99420") ? false : stryMutAct_9fa48("99419") ? true : (stryCov_9fa48("99419", "99420", "99421"), expectedValue !== existingValue)) {
            if (stryMutAct_9fa48("99422")) {
              {}
            } else {
              stryCov_9fa48("99422");
              mismatches.push(stryMutAct_9fa48("99423") ? {} : (stryCov_9fa48("99423"), {
                field: label,
                expected: expectedValue,
                actual: existingValue
              }));
            }
          }
        }
      };
      compareField(stryMutAct_9fa48("99424") ? "" : (stryCov_9fa48("99424"), 'partition_id'), expected.partition_id, stryMutAct_9fa48("99425") ? (existing.partition_id ?? existing.partitionId) && null : (stryCov_9fa48("99425"), (stryMutAct_9fa48("99426") ? existing.partition_id && existing.partitionId : (stryCov_9fa48("99426"), existing.partition_id ?? existing.partitionId)) ?? null));
      compareField(stryMutAct_9fa48("99427") ? "" : (stryCov_9fa48("99427"), 'table_id'), expected.table_id, stryMutAct_9fa48("99428") ? (existing.table_id ?? existing.tableId) && null : (stryCov_9fa48("99428"), (stryMutAct_9fa48("99429") ? existing.table_id && existing.tableId : (stryCov_9fa48("99429"), existing.table_id ?? existing.tableId)) ?? null));
      compareField(stryMutAct_9fa48("99430") ? "" : (stryCov_9fa48("99430"), 'table_name'), expected.table_name, stryMutAct_9fa48("99431") ? (existing.table_name ?? existing.tableName) && null : (stryCov_9fa48("99431"), (stryMutAct_9fa48("99432") ? existing.table_name && existing.tableName : (stryCov_9fa48("99432"), existing.table_name ?? existing.tableName)) ?? null));
      compareField(stryMutAct_9fa48("99433") ? "" : (stryCov_9fa48("99433"), 'partition_key_start'), expected.partition_key_start, stryMutAct_9fa48("99434") ? (existing.partition_key_start ?? existing.partitionKeyStart) && null : (stryCov_9fa48("99434"), (stryMutAct_9fa48("99435") ? existing.partition_key_start && existing.partitionKeyStart : (stryCov_9fa48("99435"), existing.partition_key_start ?? existing.partitionKeyStart)) ?? null));
      compareField(stryMutAct_9fa48("99436") ? "" : (stryCov_9fa48("99436"), 'partition_key_end'), expected.partition_key_end, stryMutAct_9fa48("99437") ? (existing.partition_key_end ?? existing.partitionKeyEnd) && null : (stryCov_9fa48("99437"), (stryMutAct_9fa48("99438") ? existing.partition_key_end && existing.partitionKeyEnd : (stryCov_9fa48("99438"), existing.partition_key_end ?? existing.partitionKeyEnd)) ?? null));
      compareField(stryMutAct_9fa48("99439") ? "" : (stryCov_9fa48("99439"), 'partition_version'), expected.partition_version, stryMutAct_9fa48("99440") ? (existing.partition_version ?? existing.partitionVersion) && null : (stryCov_9fa48("99440"), (stryMutAct_9fa48("99441") ? existing.partition_version && existing.partitionVersion : (stryCov_9fa48("99441"), existing.partition_version ?? existing.partitionVersion)) ?? null));
      if (stryMutAct_9fa48("99445") ? mismatches.length <= 0 : stryMutAct_9fa48("99444") ? mismatches.length >= 0 : stryMutAct_9fa48("99443") ? false : stryMutAct_9fa48("99442") ? true : (stryCov_9fa48("99442", "99443", "99444", "99445"), mismatches.length > 0)) {
        if (stryMutAct_9fa48("99446")) {
          {}
        } else {
          stryCov_9fa48("99446");
          throw new Error((stryMutAct_9fa48("99447") ? "" : (stryCov_9fa48("99447"), 'Managed split child partition metadata mismatch for ')) + (stryMutAct_9fa48("99448") ? `` : (stryCov_9fa48("99448"), `${expected.partition_id}: ${JSON.stringify(mismatches)}`)));
        }
      }
    }
  }

  /**
   * Insert one child partition row without a per-row cache wait.
   * @param {Object} partitionMetadata - Partition row payload.
   * @return {Promise<void>}
   * @private
   */
  async insertPartitionMetadata(partitionMetadata) {
    if (stryMutAct_9fa48("99449")) {
      {}
    } else {
      stryCov_9fa48("99449");
      const cdcIntegrationService = this.getCDCIntegrationService();
      if (stryMutAct_9fa48("99452") ? !cdcIntegrationService || !this.controlPlaneSystemTableGateway : stryMutAct_9fa48("99451") ? false : stryMutAct_9fa48("99450") ? true : (stryCov_9fa48("99450", "99451", "99452"), (stryMutAct_9fa48("99453") ? cdcIntegrationService : (stryCov_9fa48("99453"), !cdcIntegrationService)) && (stryMutAct_9fa48("99454") ? this.controlPlaneSystemTableGateway : (stryCov_9fa48("99454"), !this.controlPlaneSystemTableGateway)))) {
        if (stryMutAct_9fa48("99455")) {
          {}
        } else {
          stryCov_9fa48("99455");
          return;
        }
      }
      await this.getControlPlaneSystemTableGateway().submitMutation(stryMutAct_9fa48("99456") ? {} : (stryCov_9fa48("99456"), {
        operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
        tableName: TABLES.PARTITIONS,
        row: partitionMetadata
      }), stryMutAct_9fa48("99457") ? {} : (stryCov_9fa48("99457"), {
        skipCacheWait: stryMutAct_9fa48("99458") ? false : (stryCov_9fa48("99458"), true)
      }));
    }
  }

  /**
   * Insert two partition metadata rows atomically using the
   * distributed transaction coordinator when available.
   *
   * @param {Object} leftMetadata - Left partition metadata.
   * @param {Object} rightMetadata - Right partition metadata.
   * @return {Promise<void>}
   * @private
   */
  async insertPartitionMetadataAtomically(leftMetadata, rightMetadata) {
    if (stryMutAct_9fa48("99459")) {
      {}
    } else {
      stryCov_9fa48("99459");
      const txCoordinator = this.transactionCoordinator;
      if (stryMutAct_9fa48("99462") ? (!txCoordinator || typeof txCoordinator.begin !== 'function' || typeof txCoordinator.commit !== 'function') && typeof txCoordinator.rollback !== 'function' : stryMutAct_9fa48("99461") ? false : stryMutAct_9fa48("99460") ? true : (stryCov_9fa48("99460", "99461", "99462"), (stryMutAct_9fa48("99464") ? (!txCoordinator || typeof txCoordinator.begin !== 'function') && typeof txCoordinator.commit !== 'function' : stryMutAct_9fa48("99463") ? false : (stryCov_9fa48("99463", "99464"), (stryMutAct_9fa48("99466") ? !txCoordinator && typeof txCoordinator.begin !== 'function' : stryMutAct_9fa48("99465") ? false : (stryCov_9fa48("99465", "99466"), (stryMutAct_9fa48("99467") ? txCoordinator : (stryCov_9fa48("99467"), !txCoordinator)) || (stryMutAct_9fa48("99469") ? typeof txCoordinator.begin === 'function' : stryMutAct_9fa48("99468") ? false : (stryCov_9fa48("99468", "99469"), typeof txCoordinator.begin !== (stryMutAct_9fa48("99470") ? "" : (stryCov_9fa48("99470"), 'function')))))) || (stryMutAct_9fa48("99472") ? typeof txCoordinator.commit === 'function' : stryMutAct_9fa48("99471") ? false : (stryCov_9fa48("99471", "99472"), typeof txCoordinator.commit !== (stryMutAct_9fa48("99473") ? "" : (stryCov_9fa48("99473"), 'function')))))) || (stryMutAct_9fa48("99475") ? typeof txCoordinator.rollback === 'function' : stryMutAct_9fa48("99474") ? false : (stryCov_9fa48("99474", "99475"), typeof txCoordinator.rollback !== (stryMutAct_9fa48("99476") ? "" : (stryCov_9fa48("99476"), 'function')))))) {
        if (stryMutAct_9fa48("99477")) {
          {}
        } else {
          stryCov_9fa48("99477");
          throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_TRANSACTION_COORDINATOR_REQUIRED);
        }
      }
      const sessionId = (stryMutAct_9fa48("99478") ? `` : (stryCov_9fa48("99478"), `split-${leftMetadata.partition_id}:`)) + (stryMutAct_9fa48("99479") ? `` : (stryCov_9fa48("99479"), `${rightMetadata.partition_id}`));
      const beginResult = await txCoordinator.begin(sessionId);
      if (stryMutAct_9fa48("99482") ? false : stryMutAct_9fa48("99481") ? true : stryMutAct_9fa48("99480") ? beginResult.success : (stryCov_9fa48("99480", "99481", "99482"), !beginResult.success)) {
        if (stryMutAct_9fa48("99483")) {
          {}
        } else {
          stryCov_9fa48("99483");
          throw new Error(beginResult.error);
        }
      }
      try {
        if (stryMutAct_9fa48("99484")) {
          {}
        } else {
          stryCov_9fa48("99484");
          await Promise.all(stryMutAct_9fa48("99485") ? [] : (stryCov_9fa48("99485"), [this.insertPartitionMetadata(leftMetadata), this.insertPartitionMetadata(rightMetadata)]));
          const commitResult = await txCoordinator.commit(sessionId);
          if (stryMutAct_9fa48("99488") ? false : stryMutAct_9fa48("99487") ? true : stryMutAct_9fa48("99486") ? commitResult.success : (stryCov_9fa48("99486", "99487", "99488"), !commitResult.success)) {
            if (stryMutAct_9fa48("99489")) {
              {}
            } else {
              stryCov_9fa48("99489");
              throw new Error(commitResult.error);
            }
          }
        }
      } catch (error) {
        if (stryMutAct_9fa48("99490")) {
          {}
        } else {
          stryCov_9fa48("99490");
          await txCoordinator.rollback(sessionId);
          throw error;
        }
      }
    }
  }

  /**
   * Build a deterministic workflow ID for one split transition.
   * @param {string} tableId - Table ID.
   * @param {string} partitionId - Source partition ID.
   * @param {number} targetVersion - Target partition version.
   * @return {string} Workflow ID.
   * @private
   */
  createWorkflowId(tableId, partitionId, targetVersion) {
    if (stryMutAct_9fa48("99491")) {
      {}
    } else {
      stryCov_9fa48("99491");
      return stryMutAct_9fa48("99492") ? `` : (stryCov_9fa48("99492"), `split-${tableId}-${partitionId}-v${targetVersion}`);
    }
  }
  getControlPlaneSystemTableGateway() {
    if (stryMutAct_9fa48("99493")) {
      {}
    } else {
      stryCov_9fa48("99493");
      if (stryMutAct_9fa48("99495") ? false : stryMutAct_9fa48("99494") ? true : (stryCov_9fa48("99494", "99495"), this.controlPlaneSystemTableGateway)) {
        if (stryMutAct_9fa48("99496")) {
          {}
        } else {
          stryCov_9fa48("99496");
          return this.controlPlaneSystemTableGateway;
        }
      }
      this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle(stryMutAct_9fa48("99497") ? {} : (stryCov_9fa48("99497"), {
        nodeId: this.nodeId,
        getCdcIntegrationService: stryMutAct_9fa48("99498") ? () => undefined : (stryCov_9fa48("99498"), () => this.getCDCIntegrationService()),
        getMessageRouter: stryMutAct_9fa48("99499") ? () => undefined : (stryCov_9fa48("99499"), () => this.messageRouter)
      })).controlPlaneSystemTableGateway;
      return this.controlPlaneSystemTableGateway;
    }
  }
}
export { ManagedSplitWorkflow };
// placeholder