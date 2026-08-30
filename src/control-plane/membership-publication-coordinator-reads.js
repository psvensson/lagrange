import {
  TABLES,
} from '../constants/index.js';
import {AuthoritativeControlPlaneView} from './authoritative-control-plane-view.js';
import {readAllSharedRows} from '../cache/shared-row-read.js';
import {buildMembershipOwnerDivergence} from './membership-owner-shadow.js';
import {
  normalizeControlPlanePublicationRow,
  readInteger,
  readLowerText,
} from './system-row-normalizers.js';
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
  MEMBERSHIP_PUBLICATION_READ_SOURCE,
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

// FD-upgrade (cutover §5 step 3): SWIM divergence probe that diffs the SWIM
// detector's active set against the projection's published set. Emitted only when
// a SWIM runtime is wired in (production bootstrap always wires one);
// diagnostics-only. The shared divergence constants below (agree/kind/interval)
// back this probe.
const MEMBERSHIP_SWIM_DIVERGENCE_MSG = 'MEMBERSHIP_SWIM_DIVERGENCE';
const MEMBERSHIP_OWNER_DIVERGENCE_AGREE_STATE = 'agree';
const MEMBERSHIP_OWNER_DIVERGENCE_KIND_TRANSITION = 'transition';
const MEMBERSHIP_OWNER_DIVERGENCE_KIND_SNAPSHOT = 'snapshot';
// v4 quiescence anchor: re-emit a stable (deduped) state at least this often so
// the last log entry reflects the true final state, not just the last change.
const MEMBERSHIP_OWNER_DIVERGENCE_SNAPSHOT_INTERVAL_MS = 30000;

class MembershipPublicationCoordinatorReads {
  constructor(options = {}) {
    this.nodeId = options.nodeId || null;
    this.systemTableCache = options.systemTableCache || null;
    this.cdcIntegrationService = options.cdcIntegrationService || null;
    this.authoritativeControlPlaneView = options.authoritativeControlPlaneView || null;
    this.membershipPublicationRuntimeOwner = options.membershipPublicationRuntimeOwner || null;
    this.controlPlanePublicationsOwner = resolveControlPlanePublicationsOwner(options);
    // Phase 4 (leader-driven recovery establishment): only the
    // control_plane_publications partition WRITE-LEADER drives the cluster-wide
    // membership reconcile (it writes locally + Raft-quorum-commits), so a
    // rejoiner does not drive a doomed synchronous write to the saturated leader.
    // Unconditional since 2026-07-02 (no-flag policy): validated by the dt4
    // full-chain and dt6 publication failback/ack-recovery/quorum-failback
    // deterministic reproducers. The deferral fails OPEN on a missing/throwing
    // write-leader predicate (see shouldDeferMembershipReconcileToWriteLeader).
    this.resolveIsControlPlanePublicationsWriteLeader =
      typeof options.resolveIsControlPlanePublicationsWriteLeader ===
      'function' ?
        options.resolveIsControlPlanePublicationsWriteLeader :
        null;
    this.controlPlaneReadinessService = options.controlPlaneReadinessService || null;
    this.replicaOperationRepository = options.replicaOperationRepository || null;
    this.logger = options.logger || this.controlPlaneReadinessService?.logger || console;
    // FD-upgrade SWIM divergence probe: production bootstrap always wires a
    // runtime (default-on since the N=8 gate, commit b1434fe0; opt-out flag
    // retired 2026-07-02); null only when a caller constructs the coordinator
    // without one, in which case this whole probe is inert.
    this.membershipSwimRuntime = options.membershipSwimRuntime || null;
    this._membershipSwimDivergenceLastState = null;
    this._membershipSwimDivergenceLastSnapshotMs = null;
    this.now = typeof options.now === 'function' ? options.now : () => Date.now();
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
      (preloadedRows.length > 0 || options.allowEmptyPreloadedRows === true)
    ) {
      return preloadedRows;
    }
    const authoritativeReadRequested =
      options.readSource ===
        MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED;
    if (
      tableName === TABLES.CONTROL_PLANE_PUBLICATIONS &&
      authoritativeReadRequested !== true &&
      this.controlPlanePublicationsOwner &&
      typeof this.controlPlanePublicationsOwner.listPublicationsFromCache === 'function'
    ) {
      const cachedPublicationRows = normalizeTableRowsResult(
        await this.controlPlanePublicationsOwner.listPublicationsFromCache(options),
      );
      if (
        cachedPublicationRows.length > 0 ||
        typeof this.controlPlanePublicationsOwner.listPublications !== 'function'
      ) {
        return cachedPublicationRows;
      }
    }
    if (
      tableName === TABLES.CONTROL_PLANE_PUBLICATIONS &&
      this.controlPlanePublicationsOwner &&
      typeof this.controlPlanePublicationsOwner.listPublications === 'function'
    ) {
      const publicationReadOptions = buildPublicationListReadOptions(options);
      return normalizeTableRowsResult(
        await this.controlPlanePublicationsOwner.listPublications(publicationReadOptions),
      );
    }
    const view = this.getAuthoritativeControlPlaneView();
    if (view && typeof view.readRows === 'function' && view.canRead()) {
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
          typeof this.systemTableCache?.getAll === 'function'
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
    if (typeof this.systemTableCache?.getAll === 'function') {
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
    return normalizedRows[0] || null;
  }

  getLatestPublicationRowSync(options = {}) {
    const preloadedRows = Array.isArray(options.publicationRows) ? options.publicationRows : null;
    const publicationRows =
      preloadedRows ||
      (typeof this.systemTableCache?.getAll === 'function' ?
        this.systemTableCache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS) || [] :
        []);
    const normalizedRows = publicationRows
      .map((row) => normalizeControlPlanePublicationRow(row))
      .filter((row) => row.publicationKind === MEMBERSHIP_PUBLICATION_KIND)
      .sort((left, right) => (right.publicationEpoch || 0) - (left.publicationEpoch || 0));
    return normalizedRows[0] || null;
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
    return normalizedRows[0] || null;
  }

  getLatestPublishedPublicationRowSync(options = {}) {
    const preloadedRows = Array.isArray(options.publicationRows) ? options.publicationRows : null;
    const publicationRows =
      preloadedRows ||
      (typeof this.systemTableCache?.getAll === 'function' ?
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
    return normalizedRows[0] || null;
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

  // Saturation-relief (rolling-restart drain residual): the readiness planning
  // memo's per-tick version key
  // (readMembershipPublicationPlanningMemoVersionKey) needs only the
  // (epoch, status) of the highest-epoch membership publication that includes the
  // node — yet getLatestPublicationForNodeSync re-normalizes EVERY publications
  // cache row (JSON.parse of the array/object columns) on every routing call. The
  // V8 profiler pinned normalizeControlPlanePublicationRow as a top self-time
  // frame on the CPU-pegged rejoiner. This probe selects the winning row by CHEAP
  // scalar reads (kind + epoch, the SAME readLowerText/readInteger coercion the
  // full normalize uses) and full-normalizes ONLY that one row — byte-identical
  // (epoch, status, node-inclusion) to getLatestPublicationForNodeSync, but N→1
  // normalizes. Returns the bare {publicationEpoch, status} the recheck consumes,
  // or null when no highest-epoch membership row includes the node.
  getLatestMembershipPublicationEpochStatusForNodeSync(nodeId, options = {}) {
    const preloadedRows = Array.isArray(options.publicationRows) ? options.publicationRows : null;
    const publicationRows =
      preloadedRows ||
      (typeof this.systemTableCache?.getAll === 'function' ?
        this.systemTableCache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS) || [] :
        []);
    let winningRow = null;
    let winningEpochSortValue = -Infinity;
    for (const row of publicationRows) {
      // Mirror the normalized filter (publicationKind === MEMBERSHIP_PUBLICATION_KIND)
      // and sort key ((publicationEpoch || 0) desc, stable → first row wins ties)
      // using only scalar coercion — no JSON.parse of the array/object columns.
      const publicationKind = readLowerText(row?.publication_kind, row?.publicationKind);
      if (publicationKind !== MEMBERSHIP_PUBLICATION_KIND) {
        continue;
      }
      const epochSortValue =
        readInteger(row?.publication_epoch, row?.publicationEpoch) || 0;
      if (epochSortValue > winningEpochSortValue) {
        winningEpochSortValue = epochSortValue;
        winningRow = row;
      }
    }
    if (!winningRow) {
      return null;
    }
    // Full-normalize ONLY the winner to reuse exact inclusion + status semantics.
    const normalizedWinner = normalizeControlPlanePublicationRow(winningRow);
    // requireNodeInclusion=false serves the readiness-memo staleness probe: it
    // compares the WINNER row's epoch/status against a cached projection that
    // stored the cluster winner's epoch regardless of inclusion, so filtering
    // by inclusion here would null the probe for excluded (joining/recovering)
    // nodes and mis-read as permanently stale. Inclusion-list changes are
    // covered by the planning source-revision bump, not this probe.
    if (options.requireNodeInclusion !== false &&
        !publicationRowIncludesNode(normalizedWinner, nodeId)) {
      return null;
    }
    return {
      publicationEpoch: normalizedWinner.publicationEpoch,
      status: normalizedWinner.status,
    };
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
        readSource: MEMBERSHIP_PUBLICATION_READ_SOURCE.CACHE_PREFERRED,
      });
    const initialPublicationRow =
      cachedPublicationRow ||
      (await safelyGetLatestMembershipPublicationRow(
        this,
        acknowledgementReadOptions,
      ));
    if (!initialPublicationRow || typeof initialPublicationRow !== 'object') {
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
      refreshedPublicationRow && typeof refreshedPublicationRow === 'object' ?
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
      typeof this.replicaOperationRepository.isOperationLocallyOwned === 'function'
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
    const cacheRows = readAllSharedRows(
      this.systemTableCache,
      TABLES.REPLICA_OPERATIONS,
    );
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
    if (!readinessService || typeof readinessService !== 'object') {
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
    if (!repository || typeof repository.queryIncompleteOperations !== 'function') {
      return dispatchRows;
    }
    try {
      const operations = await repository.queryIncompleteOperations({
        visibilityReadMode: REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
      });
      if (!Array.isArray(operations) || operations.length === 0) {
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
      typeof publicationStatus === 'string' ? publicationStatus.toUpperCase() : null;
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
    if (!acknowledgementCandidate || typeof acknowledgementCandidate !== 'object') {
      return null;
    }
    const candidatePublicationRow = acknowledgementCandidate.publicationRow;
    if (!candidatePublicationRow || typeof candidatePublicationRow !== 'object') {
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
      options.planningSnapshot && typeof options.planningSnapshot === 'object' ?
        options.planningSnapshot :
        await this.readPublicationPlanningSnapshot(options);
    // Increment 4: feed the SWIM verdict into the projection whenever a runtime
    // is wired (consumption is unconditional; the opt-out flag was retired
    // 2026-07-02). Asymmetric: `alive` protects a node from a false
    // readiness-grace trim; no-runtime => the probe is inert.
    const membershipSwimConsumeEnabled = this.membershipSwimRuntime !== null;
    const swimVerdictByNodeId =
      membershipSwimConsumeEnabled &&
      typeof this.membershipSwimRuntime.verdictByNodeId === 'function' ?
        this.membershipSwimRuntime.verdictByNodeId() :
        null;
    const candidate = deriveMembershipPublicationCandidate({
      ...options,
      planningSnapshot,
      // Phase 1 reconciliation: feed the owner rule this node's identity so the
      // shadow set can include self-knowledge (the node is alive and computing
      // the candidate), matching the projection's self-node fast path.
      localNodeId: this.nodeId,
      membershipSwimConsumeEnabled,
      swimVerdictByNodeId,
    });
    this._emitMembershipSwimDivergence(candidate?.membershipSwimInputs);
    return candidate;
  }

  // FD-upgrade (cutover §5 step 3): diff the SWIM detector's active set against the
  // projection's published set, the SWIM analog of the owner-divergence probe. Reads
  // the live verdict from the wired-in runtime and the projection inputs the pure
  // derivation exposed. Inert (returns early) unless a runtime is wired in.
  // Diagnostics-only; never disturbs the publication path.
  _emitMembershipSwimDivergence(swimInputs) {
    if (!this.membershipSwimRuntime || !swimInputs) {
      return;
    }
    try {
      const swimActiveNodeIds = this.membershipSwimRuntime.activeMemberSet({
        publishedBaselineNodeIds: swimInputs.publishedBaselineNodeIds,
        memberStatesByNodeId: swimInputs.memberStatesByNodeId,
        membershipFreezeActive: swimInputs.membershipFreezeActive,
      });
      const divergence = buildMembershipOwnerDivergence({
        projectionNodeIds: swimInputs.projectionNodeIds,
        shadowNodeIds: swimActiveNodeIds,
      });
      const nowMs = this.now();
      const divergenceState = divergence.agree === true ?
        MEMBERSHIP_OWNER_DIVERGENCE_AGREE_STATE :
        `${divergence.onlyInProjection.join(',')}|` +
          `${divergence.onlyInShadow.join(',')}`;
      const transitioned =
        divergenceState !== this._membershipSwimDivergenceLastState;
      const snapshotDue =
        this._membershipSwimDivergenceLastSnapshotMs === null ||
        (nowMs - this._membershipSwimDivergenceLastSnapshotMs) >=
          MEMBERSHIP_OWNER_DIVERGENCE_SNAPSHOT_INTERVAL_MS;
      if (!transitioned && !snapshotDue) {
        return;
      }
      this._membershipSwimDivergenceLastState = divergenceState;
      this._membershipSwimDivergenceLastSnapshotMs = nowMs;
      this.logger?.info?.(MEMBERSHIP_SWIM_DIVERGENCE_MSG, {
        nodeId: this.nodeId,
        emitKind: transitioned ?
          MEMBERSHIP_OWNER_DIVERGENCE_KIND_TRANSITION :
          MEMBERSHIP_OWNER_DIVERGENCE_KIND_SNAPSHOT,
        agree: divergence.agree,
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
