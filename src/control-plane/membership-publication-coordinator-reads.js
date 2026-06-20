import {
  NUM,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {AuthoritativeControlPlaneView} from './authoritative-control-plane-view.js';
import {normalizeControlPlanePublicationRow} from './system-row-normalizers.js';
import {shouldUseAuthoritativePriorityRecoveryRediscovery} from './priority-recovery-snapshot.js';
import {
  buildPublicationOwnerStreamState,
} from './publication-owner-state.js';
import {DurableWorkflowCoordinator} from '../workflow/durable-workflow-coordinator.js';
import {OwnerKeyReconcileQueue} from '../workflow/owner-key-reconcile-queue.js';
import {OperationLane} from '../workflow/operation-lane.js';
import {isCoordinatorOwnedOperationType} from '../rebalancer/replica-status.js';
import {
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
} from '../rebalancer/replica-operation-repository.js';
import {
  MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL,
  MEMBERSHIP_PUBLICATION_KIND,
  MEMBERSHIP_PUBLICATION_OWNER_KEY,
  MEMBERSHIP_PUBLICATION_STATUS,
} from './membership-publication-row-contract.js';
import {
  buildMembershipPublicationAckRefreshDecision,
  isDispatchRetryOperation,
  listEquals,
  matchesDispatchRetryReadyNode,
  mergeDispatchRetryRowsByOperationId,
  normalizeNodeIdList,
  publicationRowIncludesNode,
  readMembershipPublicationConvergence,
  safelyGetLatestMembershipPublicationRow,
} from './membership-publication-row-helpers.js';
import {
  buildLocalAuthoritativeMembershipReadOptions,
  buildPublicationAcknowledgementReadOptions,
  buildPublicationListReadOptions,
  deriveMembershipPublicationCandidate,
  mergePlanningEvidenceRows,
  normalizeReplicaOperationView,
  normalizeTableRowsResult,
  resolveControlPlanePublicationsOwner,
  serializeMembershipPublicationRow,
  shouldMergePlanningEvidenceRows,
} from './membership-publication-planning-evidence.js';

// Phase 0 single-owner divergence probe log tag (greppable in per-node
// full-logs). Emitted only when the shadow owner rule disagrees with the
// projection-derived published set, and only once per distinct signature.
const MEMBERSHIP_OWNER_DIVERGENCE_MSG = 'MEMBERSHIP_OWNER_DIVERGENCE';

class MembershipPublicationCoordinatorReads {
  constructor(options = {}) {
    this.nodeId = options.nodeId || null;
    this.systemTableCache = options.systemTableCache || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.authoritativeControlPlaneView = options.authoritativeControlPlaneView || null;
    this.membershipPublicationRuntimeOwner = options.membershipPublicationRuntimeOwner || null;
    this.controlPlanePublicationsOwner = resolveControlPlanePublicationsOwner(options);
    // Phase 4 (leader-driven recovery establishment): when enabled, only the
    // control_plane_publications partition WRITE-LEADER drives the cluster-wide
    // membership reconcile (it writes locally + Raft-quorum-commits), so a
    // rejoiner does not drive a doomed synchronous write to the saturated leader.
    // Injectable predicate (default absent => no gating => unchanged behavior).
    // Default off via env until validated against the deterministic reproducer.
    this.membershipLeaderDrivenEnabled =
      options.membershipLeaderDrivenEnabled ??
      process.env.LAGRANGE_MEMBERSHIP_LEADER_DRIVEN === 'true';
    this.resolveIsControlPlanePublicationsWriteLeader =
      typeof options.resolveIsControlPlanePublicationsWriteLeader ===
      TYPEOF.FUNCTION ?
        options.resolveIsControlPlanePublicationsWriteLeader :
        null;
    this.controlPlaneReadinessService = options.controlPlaneReadinessService || null;
    this.replicaOperationRepository = options.replicaOperationRepository || null;
    this.logger = options.logger || this.controlPlaneReadinessService?.logger || console;
    // Phase 0 divergence probe: dedup signatures already emitted so the
    // single-owner shadow diff is logged once per distinct divergence state
    // (bounded volume, non-perturbing) rather than on every derivation tick.
    this._membershipOwnerDivergenceSeen = new Set();
    this.now = typeof options.now === TYPEOF.FUNCTION ? options.now : () => Date.now();
    this.workflowCoordinator =
      options.workflowCoordinator ||
      new DurableWorkflowCoordinator({
        now: this.now,
      });
    this.publicationReconcileLane =
      options.publicationReconcileLane ||
      new OperationLane({
        name: MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.MEMBERSHIP_PUBLICATION_RECONCILE,
        workflowCoordinator: this.workflowCoordinator,
      });
    this.publicationAcknowledgementLane =
      options.publicationAcknowledgementLane ||
      new OperationLane({
        name: MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.MEMBERSHIP_PUBLICATION_ACKNOWLEDGEMENT,
        workflowCoordinator: this.workflowCoordinator,
      });
    this.reconcileQueue =
      options.reconcileQueue ||
      new OwnerKeyReconcileQueue({
        name: MEMBERSHIP_PUBLICATION_OWNER_KEY,
        reconcileFn: async (_ownerKey, _reasons, context) =>
          this.reconcileClusterMembership(context || {}),
      });
  }

  buildOwnerKey(publicationKind = MEMBERSHIP_PUBLICATION_KIND) {
    return `membership-publication:${publicationKind}`;
  }

  getAuthoritativeControlPlaneView() {
    if (this.authoritativeControlPlaneView) {
      return this.authoritativeControlPlaneView;
    }
    this.authoritativeControlPlaneView = new AuthoritativeControlPlaneView({
      nodeId: this.nodeId,
      cdcIntegrationService: this.cdcIntegrationService,
      now: this.now,
    });
    return this.authoritativeControlPlaneView;
  }

  async readTableRows(tableName, options = {}) {
    const preloadedRows = options.preloadedRows;
    if (
      Array.isArray(preloadedRows) &&
      (preloadedRows.length > NUM.ZERO || options.allowEmptyPreloadedRows === true)
    ) {
      return preloadedRows;
    }
    const preferAuthoritativeRead =
      options.preferAuthoritativeRead === true || options.requireAuthoritative === true;
    if (
      tableName === TABLES.CONTROL_PLANE_PUBLICATIONS &&
      preferAuthoritativeRead !== true &&
      this.controlPlanePublicationsOwner &&
      typeof this.controlPlanePublicationsOwner.listPublicationsFromCache === TYPEOF.FUNCTION
    ) {
      const cachedPublicationRows = normalizeTableRowsResult(
        await this.controlPlanePublicationsOwner.listPublicationsFromCache(options),
      );
      if (
        cachedPublicationRows.length > NUM.ZERO ||
        typeof this.controlPlanePublicationsOwner.listPublications !== TYPEOF.FUNCTION
      ) {
        return cachedPublicationRows;
      }
    }
    if (
      tableName === TABLES.CONTROL_PLANE_PUBLICATIONS &&
      this.controlPlanePublicationsOwner &&
      typeof this.controlPlanePublicationsOwner.listPublications === TYPEOF.FUNCTION
    ) {
      const publicationReadOptions = buildPublicationListReadOptions(options);
      return normalizeTableRowsResult(
        await this.controlPlanePublicationsOwner.listPublications(publicationReadOptions),
      );
    }
    const view = this.getAuthoritativeControlPlaneView();
    if (view && typeof view.readRows === TYPEOF.FUNCTION && view.canRead()) {
      const result = await view.readRows(
        tableName,
        `SELECT * FROM ${tableName}`,
        [],
        buildLocalAuthoritativeMembershipReadOptions({
          ...options,
          tableName,
        }),
      );
      if (result?.success === true) {
        const authoritativeRows = normalizeTableRowsResult(result);
        if (
          shouldMergePlanningEvidenceRows(tableName, options) &&
          typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION
        ) {
          return mergePlanningEvidenceRows(
            tableName,
            authoritativeRows,
            this.systemTableCache.getAll(tableName) || [],
          );
        }
        return authoritativeRows;
      }
    }
    if (typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION) {
      return this.systemTableCache.getAll(tableName) || [];
    }
    return [];
  }

  async getLatestPublicationRow(options = {}) {
    const publicationRows = await this.readTableRows(TABLES.CONTROL_PLANE_PUBLICATIONS, {
      ...options,
      preloadedRows: options.publicationRows,
    });
    const normalizedRows = publicationRows
      .map((row) => normalizeControlPlanePublicationRow(row))
      .filter((row) => row.publicationKind === MEMBERSHIP_PUBLICATION_KIND)
      .sort((left, right) => (right.publicationEpoch || 0) - (left.publicationEpoch || 0));
    return normalizedRows[NUM.ZERO] || null;
  }

  getLatestPublicationRowSync(options = {}) {
    const preloadedRows = Array.isArray(options.publicationRows) ? options.publicationRows : null;
    const publicationRows =
      preloadedRows ||
      (typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ?
        this.systemTableCache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS) || [] :
        []);
    const normalizedRows = publicationRows
      .map((row) => normalizeControlPlanePublicationRow(row))
      .filter((row) => row.publicationKind === MEMBERSHIP_PUBLICATION_KIND)
      .sort((left, right) => (right.publicationEpoch || 0) - (left.publicationEpoch || 0));
    return normalizedRows[NUM.ZERO] || null;
  }

  async getLatestClusterPublication(options = {}) {
    return this.getLatestPublicationRow(options);
  }

  getLatestClusterPublicationSync(options = {}) {
    return this.getLatestPublicationRowSync(options);
  }

  async getLatestPublishedPublicationRow(options = {}) {
    const publicationRows = await this.readTableRows(TABLES.CONTROL_PLANE_PUBLICATIONS, {
      ...options,
      preloadedRows: options.publicationRows,
    });
    const normalizedRows = publicationRows
      .map((row) => normalizeControlPlanePublicationRow(row))
      .filter(
        (row) =>
          row.publicationKind === MEMBERSHIP_PUBLICATION_KIND &&
          row.status === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
      )
      .sort((left, right) => (right.publicationEpoch || 0) - (left.publicationEpoch || 0));
    return normalizedRows[NUM.ZERO] || null;
  }

  getLatestPublishedPublicationRowSync(options = {}) {
    const preloadedRows = Array.isArray(options.publicationRows) ? options.publicationRows : null;
    const publicationRows =
      preloadedRows ||
      (typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ?
        this.systemTableCache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS) || [] :
        []);
    const normalizedRows = publicationRows
      .map((row) => normalizeControlPlanePublicationRow(row))
      .filter(
        (row) =>
          row.publicationKind === MEMBERSHIP_PUBLICATION_KIND &&
          row.status === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
      )
      .sort((left, right) => (right.publicationEpoch || 0) - (left.publicationEpoch || 0));
    return normalizedRows[NUM.ZERO] || null;
  }

  async getLatestPublishedClusterPublication(options = {}) {
    return this.getLatestPublishedPublicationRow(options);
  }

  getLatestPublishedClusterPublicationSync(options = {}) {
    return this.getLatestPublishedPublicationRowSync(options);
  }

  async getLatestPublicationForNode(nodeId, options = {}) {
    const latestPublicationRow = await this.getLatestPublicationRow(options);
    return publicationRowIncludesNode(latestPublicationRow, nodeId) ? latestPublicationRow : null;
  }

  getLatestPublicationForNodeSync(nodeId, options = {}) {
    const latestPublicationRow = this.getLatestPublicationRowSync(options);
    return publicationRowIncludesNode(latestPublicationRow, nodeId) ? latestPublicationRow : null;
  }

  async getAcknowledgementCandidateForNode(nodeId, options = {}) {
    const normalizedNodeId = String(nodeId || '').trim();
    if (!normalizedNodeId) {
      return null;
    }
    const hasPreloadedPublicationRows = Array.isArray(options.publicationRows);
    const acknowledgementReadOptions = buildPublicationAcknowledgementReadOptions(
      options,
    );
    const cachedPublicationRow =
      this.getLatestPublicationRowSync({
        ...options,
        preferAuthoritativeRead: false,
      });
    const initialPublicationRow =
      cachedPublicationRow ||
      (await safelyGetLatestMembershipPublicationRow(
        this,
        acknowledgementReadOptions,
      ));
    if (!initialPublicationRow || typeof initialPublicationRow !== TYPEOF.OBJECT) {
      return null;
    }
    const initialPublication = normalizeControlPlanePublicationRow(initialPublicationRow);
    const refreshDecision = buildMembershipPublicationAckRefreshDecision({
      normalizedPublication: initialPublication,
      nodeId: normalizedNodeId,
    });
    const shouldAttemptAuthoritativeRefresh =
      hasPreloadedPublicationRows !== true &&
      cachedPublicationRow &&
      refreshDecision.shouldRefresh;
    const refreshedPublicationRow = shouldAttemptAuthoritativeRefresh ?
      await safelyGetLatestMembershipPublicationRow(
        this,
        acknowledgementReadOptions,
      ) :
      null;
    const candidatePublicationRow =
      refreshedPublicationRow && typeof refreshedPublicationRow === TYPEOF.OBJECT ?
        refreshedPublicationRow :
        initialPublicationRow;
    const normalizedPublication = normalizeControlPlanePublicationRow(candidatePublicationRow);
    const requiredAckNodeIds = normalizeNodeIdList(normalizedPublication.requiredAckNodeIds);
    const acknowledgedNodeIds = normalizeNodeIdList(normalizedPublication.acknowledgedNodeIds);
    const publicationOwnerStream = buildPublicationOwnerStreamState({
      publicationRevision: normalizedPublication.publicationEpoch,
      publicationStatus: normalizedPublication.status,
      requiredAckNodeIds,
      acknowledgedNodeIds,
    });
    return Object.freeze({
      nodeId: normalizedNodeId,
      publicationRow: candidatePublicationRow,
      authoritativeRefreshAttempted: shouldAttemptAuthoritativeRefresh,
      publicationOwnerStream,
      ackState: publicationOwnerStream.ackState,
      terminal: this.isTerminalPublicationStatus(normalizedPublication.status),
      requiresAcknowledgement: requiredAckNodeIds.includes(normalizedNodeId),
      alreadyAcknowledged: acknowledgedNodeIds.includes(normalizedNodeId),
      allRequiredAcknowledged: listEquals(acknowledgedNodeIds, requiredAckNodeIds),
    });
  }

  isLocallyOwnedReplicaOperationRow(operation) {
    const normalizedOperation = normalizeReplicaOperationView(operation);
    if (!normalizedOperation) {
      return false;
    }
    if (
      this.replicaOperationRepository &&
      typeof this.replicaOperationRepository.isOperationLocallyOwned === TYPEOF.FUNCTION
    ) {
      return this.replicaOperationRepository.isOperationLocallyOwned(normalizedOperation);
    }
    return normalizedOperation.sourceNodeId === this.nodeId;
  }

  async getDispatchRetryRowsForNode(nodeId) {
    const normalizedNodeId = String(nodeId || '').trim();
    if (!normalizedNodeId) {
      return [];
    }
    const cacheRows =
      typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ?
        this.systemTableCache.getAll(TABLES.REPLICA_OPERATIONS) || [] :
        [];
    const dispatchRows = cacheRows.filter((row) => {
      const operation = normalizeReplicaOperationView(row);
      return (
        operation &&
        isCoordinatorOwnedOperationType(operation.type) &&
        this.isLocallyOwnedReplicaOperationRow(operation) &&
        matchesDispatchRetryReadyNode(operation, normalizedNodeId) &&
        isDispatchRetryOperation(operation)
      );
    });
    const readinessService = this.controlPlaneReadinessService;
    if (!readinessService || typeof readinessService !== TYPEOF.OBJECT) {
      return dispatchRows;
    }
    let publicationConvergence = null;
    try {
      publicationConvergence = await readMembershipPublicationConvergence(
        readinessService,
        normalizedNodeId,
        this.now(),
      );
    } catch (_error) {
      publicationConvergence = null;
    }
    if (
      !shouldUseAuthoritativePriorityRecoveryRediscovery(normalizedNodeId, {
        cacheVisible: false,
        publicationConvergence,
      })
    ) {
      return dispatchRows;
    }
    const repository = this.replicaOperationRepository;
    if (!repository || typeof repository.queryIncompleteOperations !== TYPEOF.FUNCTION) {
      return dispatchRows;
    }
    try {
      const operations = await repository.queryIncompleteOperations({
        visibilityReadMode: REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
      });
      if (!Array.isArray(operations) || operations.length === NUM.ZERO) {
        return dispatchRows;
      }
      const authoritativeRows = operations
        .filter((operation) => {
          const normalizedOperation = normalizeReplicaOperationView(operation);
          return (
            normalizedOperation &&
            isCoordinatorOwnedOperationType(normalizedOperation.type) &&
            this.isLocallyOwnedReplicaOperationRow(normalizedOperation) &&
            matchesDispatchRetryReadyNode(
              normalizedOperation,
              normalizedNodeId,
            ) &&
            isDispatchRetryOperation(normalizedOperation)
          );
        })
        .map((operation) => this.buildDispatchRetryRowFromOperation(operation));
      return mergeDispatchRetryRowsByOperationId(
        authoritativeRows,
        dispatchRows,
      );
    } catch (_error) {
      return dispatchRows;
    }
  }

  buildDispatchRetryRowFromOperation(operation) {
    const normalizedOperation = normalizeReplicaOperationView(operation);
    if (!normalizedOperation) {
      return null;
    }
    return {
      operation_id: normalizedOperation.operationId,
      type: normalizedOperation.type,
      partition_id: normalizedOperation.partitionId,
      replica_id: normalizedOperation.replicaId,
      source_node_id: normalizedOperation.sourceNodeId,
      target_node_id: normalizedOperation.targetNodeId,
      status: normalizedOperation.status,
      workflow_step: normalizedOperation.workflowStep,
      created_at: normalizedOperation.createdAt,
      updated_at: normalizedOperation.updatedAt,
      completed_at: normalizedOperation.completedAt,
      error_message: normalizedOperation.errorMessage,
      steps_history: JSON.stringify(normalizedOperation.stepsHistory),
      entity_type: normalizedOperation.entityType,
      entity_id: normalizedOperation.entityId,
    };
  }

  isTerminalPublicationStatus(publicationStatus) {
    const normalizedPublicationStatus =
      typeof publicationStatus === TYPEOF.STRING ? publicationStatus.toUpperCase() : null;
    return (
      normalizedPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ||
      normalizedPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.ABANDONED ||
      normalizedPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED
    );
  }

  async acknowledgeMembershipPublicationForNode(nodeId, options = {}) {
    const normalizedNodeId = String(nodeId || '').trim();
    if (!normalizedNodeId) {
      return null;
    }
    const acknowledgementCandidate = await this.getAcknowledgementCandidateForNode(
      normalizedNodeId,
      options,
    );
    if (!acknowledgementCandidate || typeof acknowledgementCandidate !== TYPEOF.OBJECT) {
      return null;
    }
    const candidatePublicationRow = acknowledgementCandidate.publicationRow;
    if (!candidatePublicationRow || typeof candidatePublicationRow !== TYPEOF.OBJECT) {
      return null;
    }
    if (
      acknowledgementCandidate.terminal === true ||
      acknowledgementCandidate.requiresAcknowledgement !== true ||
      (
        acknowledgementCandidate.alreadyAcknowledged === true &&
        acknowledgementCandidate.allRequiredAcknowledged !== true
      )
    ) {
      return serializeMembershipPublicationRow(candidatePublicationRow);
    }
    return this.acknowledgePublication(
      candidatePublicationRow.publication_id || candidatePublicationRow.publicationId,
      normalizedNodeId,
      {
        ...options,
        publicationRow: candidatePublicationRow,
        skipPublicationWriteReadback:
          options.skipPublicationWriteReadback === true,
      },
    );
  }

  async deriveClusterMembershipCandidate(options = {}) {
    const planningSnapshot =
      options.planningSnapshot && typeof options.planningSnapshot === TYPEOF.OBJECT ?
        options.planningSnapshot :
        await this.readPublicationPlanningSnapshot(options);
    const candidate = deriveMembershipPublicationCandidate({
      ...options,
      planningSnapshot,
    });
    this._emitMembershipOwnerDivergence(candidate?.membershipOwnerDivergence);
    return candidate;
  }

  // Phase 0: surface the single-owner divergence into per-node logs, deduped by
  // signature so a stable divergence state logs once. No-op when the shadow flag
  // is off (divergence is null) or when the owner rule agrees with the
  // projection. Never throws — diagnostics must not perturb the publication path.
  _emitMembershipOwnerDivergence(divergence) {
    if (!divergence || divergence.agree !== false) {
      return;
    }
    try {
      const signature =
        `${divergence.onlyInProjection.join(',')}|` +
        `${divergence.onlyInShadow.join(',')}`;
      if (this._membershipOwnerDivergenceSeen.has(signature)) {
        return;
      }
      this._membershipOwnerDivergenceSeen.add(signature);
      this.logger?.info?.(MEMBERSHIP_OWNER_DIVERGENCE_MSG, {
        nodeId: this.nodeId,
        onlyInProjection: divergence.onlyInProjection,
        onlyInShadow: divergence.onlyInShadow,
        projectionCount: divergence.projectionCount,
        shadowCount: divergence.shadowCount,
        divergenceCount: divergence.divergenceCount,
      });
    } catch {
      // diagnostics-only; never disturb the publication path
    }
  }
}

export {MembershipPublicationCoordinatorReads};
