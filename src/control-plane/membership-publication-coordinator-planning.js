import {deepFreeze} from '../utils/deep-freeze.js';
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

const CLUSTER_CANDIDATE_SYNC_ALLOWED_OPTION_KEYS = new Set([
  'deferNestedPriorityRecoveryPlanning',
  'publisherNodeId',
  'nowMs',
]);

function isDefaultClusterCandidateSyncOptions(options) {
  if (!options || typeof options !== 'object' ||
      options.deferNestedPriorityRecoveryPlanning !== true) {
    return false;
  }
  const keys = Object.keys(options);
  for (let index = 0; index < keys.length; index += 1) {
    if (!CLUSTER_CANDIDATE_SYNC_ALLOWED_OPTION_KEYS.has(keys[index])) {
      return false;
    }
  }
  return true;
}

function resolveCoordinatorPublisherNodeId(options, coordinator) {
  if (typeof options?.publisherNodeId === 'string' &&
      options.publisherNodeId.length > 0) {
    return options.publisherNodeId;
  }
  return coordinator.nodeId;
}

function readClusterCandidateSyncMemoKey(coordinator, options) {
  if (!isDefaultClusterCandidateSyncOptions(options)) return null;
  const cache = coordinator.systemTableCache;
  const pubVersion = cache?.getTableMutationVersion?.(
    TABLES.CONTROL_PLANE_PUBLICATIONS,
  );
  if (pubVersion === undefined) return null;
  const readiness = coordinator.controlPlaneReadinessService;
  const owner = readiness?.readinessPlanningSnapshotOwner;
  if (!owner || owner.stopped) return null;
  const publisherNodeId = resolveCoordinatorPublisherNodeId(options, coordinator);
  const nowMs = normalizePositiveInteger(options.nowMs, coordinator.now());
  const identity = readiness.readCurrentPlanningProjectionIdentity?.(
    publisherNodeId,
    nowMs,
  );
  if (!identity) return null;
  const token = owner.captureToken();
  if (!token || token.transportTopologyValid === false) return null;
  return `${identity.globalPlanningGeneration}:` +
    `${owner.recoveryEpochRevision}:` +
    `${owner.readinessSnapshotGeneration}:` +
    `${token.transportTopologyGeneration}:` +
    `${pubVersion}:` +
    `${cache.getTableMutationVersion(TABLES.NODES)}:` +
    `${cache.getTableMutationVersion(TABLES.NODE_ENDPOINTS)}`;
}

class MembershipPublicationCoordinatorPlanning extends
  MembershipPublicationCoordinatorReads {
  deriveClusterMembershipCandidateSync(options = {}) {
    const memoKey = readClusterCandidateSyncMemoKey(this, options);
    const publisherNodeId = resolveCoordinatorPublisherNodeId(options, this);
    if (memoKey !== null && this._clusterCandidateSyncMemo?.key === memoKey) {
      const {candidate, byPublisher} = this._clusterCandidateSyncMemo;
      let published = byPublisher.get(publisherNodeId);
      if (published === undefined) {
        published = Object.freeze({...candidate, publisherNodeId});
        byPublisher.set(publisherNodeId, published);
      }
      return published;
    }
    const planningSnapshot =
      options.planningSnapshot && typeof options.planningSnapshot === 'object' ?
        options.planningSnapshot :
        this.readPublicationPlanningSnapshotSync(options);
    const candidate = deriveMembershipPublicationCandidate({
      ...options,
      planningSnapshot,
    });
    if (memoKey !== null &&
        readClusterCandidateSyncMemoKey(this, options) === memoKey) {
      const frozenCandidate = deepFreeze(candidate);
      this._clusterCandidateSyncMemo = {
        key: memoKey,
        candidate: frozenCandidate,
        byPublisher: new Map([[publisherNodeId, frozenCandidate]]),
      };
      return frozenCandidate;
    }
    return candidate;
  }

  async readPublicationPlanningSnapshot(options = {}) {
    const planningReadOptions = {
      ...options,
      readProfile: MEMBERSHIP_PUBLICATION_READ_PROFILE.PLANNING,
    };
    const latestPublicationRow =
      options.latestPublicationRow || (await this.getLatestPublicationRow(planningReadOptions));
    const latestPublishedPublicationRow =
      options.latestPublishedPublicationRow ||
      (readUpperStateField(latestPublicationRow?.status) ===
      MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ?
        latestPublicationRow :
        await this.getLatestPublishedPublicationRow(planningReadOptions));
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
      preloadedRows: options.nodeRows,
    });
    const nodeEndpointRows = await this.readTableRows(TABLES.NODE_ENDPOINTS, {
      ...planningReadOptions,
      readSource: preferAuthoritativeMembershipState ?
        MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED :
        MEMBERSHIP_PUBLICATION_READ_SOURCE.CACHE_PREFERRED,
      preloadedRows: options.nodeEndpointRows,
    });
    const serviceRows = await this.readTableRows(TABLES.SERVICES, {
      ...planningReadOptions,
      readSource: preferAuthoritativeMembershipState ?
        MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED :
        MEMBERSHIP_PUBLICATION_READ_SOURCE.CACHE_PREFERRED,
      preloadedRows: options.serviceRows,
    });
    const partitionRows = await this.readTableRows(TABLES.PARTITIONS, {
      ...planningReadOptions,
      readSource: preferAuthoritativeMembershipState ?
        MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED :
        MEMBERSHIP_PUBLICATION_READ_SOURCE.CACHE_PREFERRED,
      preloadedRows: options.partitionRows,
    });
    const replicaOperationRows = await this.readTableRows(
      TABLES.REPLICA_OPERATIONS,
      {
        ...planningReadOptions,
        readSource: preferAuthoritativeMembershipState ?
          MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED :
          MEMBERSHIP_PUBLICATION_READ_SOURCE.CACHE_PREFERRED,
        preloadedRows: options.replicaOperationRows,
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
