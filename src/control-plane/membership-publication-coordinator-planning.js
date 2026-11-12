import {readUpperStateField} from '../utils/state-field-read.js';
import {
  TABLES,
} from '../constants/index.js';
import {MEMBERSHIP_PUBLICATION_PLANNING_SOURCE} from './control-plane-readiness-service.js';
import {readAllSharedRows} from '../cache/shared-row-read.js';
import {
  MEMBERSHIP_PUBLICATION_READ_PROFILE,
  MEMBERSHIP_PUBLICATION_READ_SOURCE,
  MEMBERSHIP_PUBLICATION_STATUS,
} from './membership-publication-row-contract.js';
import {
  normalizePositiveInteger,
} from './membership-publication-row-helpers.js';
import {
  buildMembershipPublicationEvidenceSnapshot,
  deriveMembershipPublicationCandidate,
  hasExplicitMembershipPublicationTarget,
  shouldPreferAuthoritativeMembershipState,
} from './membership-publication-planning-evidence.js';
import {MembershipPublicationCoordinatorReads} from './membership-publication-coordinator-reads.js';
import {statePriorityPartitionSummary} from
  './membership-publication-priority-partition-summary.js';

function resolvePlanningLivenessContext(coordinator, options, nodeRows) {
  const recoveryEpochsByNodeId =
    options.recoveryEpochsByNodeId ||
    (coordinator.controlPlaneReadinessService &&
    typeof coordinator.controlPlaneReadinessService
      .getRecoveryEpochHistoryByNodeId === 'function' ?
      coordinator.controlPlaneReadinessService.getRecoveryEpochHistoryByNodeId() :
      null);
  const connectedNodeIds =
    coordinator.controlPlaneReadinessService?.messageRouter &&
    typeof coordinator.controlPlaneReadinessService.messageRouter
      .getConnectedNodes === 'function' ?
      coordinator.controlPlaneReadinessService.messageRouter.getConnectedNodes() :
      [];
  const nowMs = normalizePositiveInteger(options.nowMs, coordinator.now());
  const nodeLivenessByNodeId = options.nodeLivenessByNodeId ||
    (typeof coordinator.controlPlaneReadinessService
      ?.getNodeLivenessProjectionsSync === 'function' ?
      coordinator.controlPlaneReadinessService.getNodeLivenessProjectionsSync(
        nodeRows,
        nowMs,
      ) :
      null);
  return {recoveryEpochsByNodeId, connectedNodeIds, nowMs,
    nodeLivenessByNodeId};
}

class MembershipPublicationCoordinatorPlanning extends
  MembershipPublicationCoordinatorReads {
  deriveClusterMembershipCandidateSync(options = {}) {
    const planningSnapshot =
      options.planningSnapshot && typeof options.planningSnapshot === 'object' ?
        options.planningSnapshot :
        this.readPublicationPlanningSnapshotSync(options);
    return deriveMembershipPublicationCandidate({
      ...options,
      planningSnapshot,
    });
  }

  async readPublicationPlanningSnapshot(options = {}) {
    const planningReadOptions = {
      ...options,
      readProfile: MEMBERSHIP_PUBLICATION_READ_PROFILE.PLANNING,
    };
    const latestPublicationRow =
      await this.getLatestPublicationRow(planningReadOptions);
    const latestPublishedPublicationRow =
      readUpperStateField(latestPublicationRow?.status) ===
      MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ?
        latestPublicationRow :
        await this.getLatestPublishedPublicationRow(planningReadOptions);
    if (hasExplicitMembershipPublicationTarget(options) &&
        options.deferNestedPriorityRecoveryPlanning === true) {
      // This existing handoff intent admits desired membership before a full
      // census. These SQL inputs are not requested, never answered as empty.
      // The admitted row must hold serving until the ordinary owner reconcile
      // derives its census from actual rows. Caller rows/summaries cannot do so.
      return buildMembershipPublicationEvidenceSnapshot({
        ...options,
        latestPublicationRow,
        latestPublishedPublicationRow,
        nodeRows: undefined,
        nodeEndpointRows: undefined,
        serviceRows: undefined,
        partitionRows: undefined,
        replicaOperationRows: undefined,
        priorityPartitionSummary: statePriorityPartitionSummary(null),
        membershipLifecycleSummary: null,
        priorityRecoveryPlanningSnapshot: null,
        publisherNodeId: options.publisherNodeId || this.nodeId,
        localNodeId: this.nodeId,
        localNodeResponsive: true,
        nowMs: normalizePositiveInteger(options.nowMs, this.now()),
      });
    }
    const preferAuthoritativeMembershipState =
      hasExplicitMembershipPublicationTarget(options) !== true &&
      shouldPreferAuthoritativeMembershipState({
        ...options,
        latestPublicationRow,
        latestPublishedPublicationRow,
      });
    const nodeRows = await this.readTableRows(TABLES.NODES, {
      ...planningReadOptions,
      readSource: preferAuthoritativeMembershipState ?
        MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED :
        MEMBERSHIP_PUBLICATION_READ_SOURCE.CACHE_PREFERRED,
    });
    const nodeEndpointRows = await this.readTableRows(TABLES.NODE_ENDPOINTS, {
      ...planningReadOptions,
      readSource: preferAuthoritativeMembershipState ?
        MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED :
        MEMBERSHIP_PUBLICATION_READ_SOURCE.CACHE_PREFERRED,
    });
    const serviceRows = await this.readTableRows(TABLES.SERVICES, {
      ...planningReadOptions,
      readSource: preferAuthoritativeMembershipState ?
        MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED :
        MEMBERSHIP_PUBLICATION_READ_SOURCE.CACHE_PREFERRED,
    });
    const partitionRows = await this.readTableRows(TABLES.PARTITIONS, {
      ...planningReadOptions,
      readSource: preferAuthoritativeMembershipState ?
        MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED :
        MEMBERSHIP_PUBLICATION_READ_SOURCE.CACHE_PREFERRED,
    });
    const replicaOperationRows = await this.readTableRows(
      TABLES.REPLICA_OPERATIONS,
      {
        ...planningReadOptions,
        readSource: preferAuthoritativeMembershipState ?
          MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED :
          MEMBERSHIP_PUBLICATION_READ_SOURCE.CACHE_PREFERRED,
      },
    );
    const readinessEntries = Array.isArray(options.readinessEntries) ?
      options.readinessEntries :
      this.controlPlaneReadinessService &&
          typeof this.controlPlaneReadinessService.getAllNodeReadiness === 'function' ?
        await this.controlPlaneReadinessService.getAllNodeReadiness({
          allowAuthoritativeRefresh: preferAuthoritativeMembershipState,
          membershipPublicationPlanningSource:
              MEMBERSHIP_PUBLICATION_PLANNING_SOURCE.DIRECT_PUBLICATION_ROW,
        }) :
        [];
    const {recoveryEpochsByNodeId, connectedNodeIds, nowMs,
      nodeLivenessByNodeId} = resolvePlanningLivenessContext(
      this,
      options,
      nodeRows,
    );
    // The candidate this path derives carries the PLANNER's recovery
    // evidence - the AVAILABLE planning answer - not the owner read. The
    // owner read composes the durable publication row, which can report a
    // steady, satisfied publication while the planner still holds the
    // priority partitions unspread; a candidate built on it told readiness
    // that priority recovery was inactive, and under degraded publication
    // the source quorum lost its transport-backed recovery grace and its
    // routability. The AVAILABLE surface is synchronous now, so nothing here
    // depends on which answer arrived first. The nested case keeps its
    // existing recursion-breaking contract and derives no planning evidence
    // at all, which is what deferNestedPriorityRecoveryPlanning already means.
    const priorityRecoveryPlanningSnapshot =
      options.deferNestedPriorityRecoveryPlanning === true ?
        null :
        this.controlPlaneReadinessService &&
            typeof this.controlPlaneReadinessService
              .getPriorityRecoveryPlanningSnapshotBestEffort === 'function' ?
          await this.controlPlaneReadinessService
            .getPriorityRecoveryPlanningSnapshotBestEffort(
              options.publisherNodeId || this.nodeId,
              normalizePositiveInteger(options.nowMs, this.now()),
            ) :
          null;
    return buildMembershipPublicationEvidenceSnapshot({
      ...options,
      latestPublicationRow,
      latestPublishedPublicationRow,
      nodeRows,
      nodeEndpointRows,
      serviceRows,
      partitionRows,
      replicaOperationRows,
      readinessEntries,
      recoveryEpochsByNodeId,
      connectedNodeIds,
      nodeLivenessByNodeId,
      priorityPartitionSummary: null,
      membershipLifecycleSummary: null,
      priorityRecoveryPlanningSnapshot,
      publisherNodeId: options.publisherNodeId || this.nodeId,
      localNodeId: this.nodeId,
      localNodeResponsive: true,
      nowMs,
    });
  }

  readPublicationPlanningSnapshotSync(options = {}) {
    const latestPublicationRow =
      options.latestPublicationRow || this.getLatestPublicationRowSync(options);
    const latestPublishedPublicationRow =
      options.latestPublishedPublicationRow ||
      (readUpperStateField(latestPublicationRow?.status) ===
      MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ?
        latestPublicationRow :
        this.getLatestPublishedPublicationRowSync(options));
    const nodeRows = Array.isArray(options.nodeRows) ?
      options.nodeRows :
      typeof this.systemTableCache?.getAll === 'function' ?
        this.systemTableCache.getAll(TABLES.NODES) || [] :
        [];
    const nodeEndpointRows = Array.isArray(options.nodeEndpointRows) ?
      options.nodeEndpointRows :
      typeof this.systemTableCache?.getAll === 'function' ?
        this.systemTableCache.getAll(TABLES.NODE_ENDPOINTS) || [] :
        [];
    const serviceRows = Array.isArray(options.serviceRows) ?
      options.serviceRows :
      typeof this.systemTableCache?.getAll === 'function' ?
        readAllSharedRows(this.systemTableCache, TABLES.SERVICES) :
        [];
    const partitionRows = Array.isArray(options.partitionRows) ?
      options.partitionRows :
      typeof this.systemTableCache?.getAll === 'function' ?
        this.systemTableCache.getAll(TABLES.PARTITIONS) || [] :
        [];
    const replicaOperationRows = Array.isArray(options.replicaOperationRows) ?
      options.replicaOperationRows :
      typeof this.systemTableCache?.getAll === 'function' ?
        readAllSharedRows(this.systemTableCache, TABLES.REPLICA_OPERATIONS) :
        [];
    const readinessEntries = Array.isArray(options.readinessEntries) ?
      options.readinessEntries :
      this.controlPlaneReadinessService &&
          typeof this.controlPlaneReadinessService.getAllNodeReadinessSync === 'function' ?
        this.controlPlaneReadinessService.getAllNodeReadinessSync({
          membershipPublicationPlanningSource:
              MEMBERSHIP_PUBLICATION_PLANNING_SOURCE.DIRECT_PUBLICATION_ROW,
        }) :
        [];
    const {recoveryEpochsByNodeId, connectedNodeIds, nowMs,
      nodeLivenessByNodeId} = resolvePlanningLivenessContext(
      this,
      options,
      nodeRows,
    );
    return buildMembershipPublicationEvidenceSnapshot({
      ...options,
      latestPublicationRow,
      latestPublishedPublicationRow,
      nodeRows,
      nodeEndpointRows,
      serviceRows,
      partitionRows,
      replicaOperationRows,
      readinessEntries,
      recoveryEpochsByNodeId,
      connectedNodeIds,
      nodeLivenessByNodeId,
      priorityRecoveryPlanningSnapshot: null,
      publisherNodeId: options.publisherNodeId || this.nodeId,
      localNodeId: this.nodeId,
      localNodeResponsive: true,
      nowMs,
    });
  }
}

export {MembershipPublicationCoordinatorPlanning};
