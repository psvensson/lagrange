import {
  NUM,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {MEMBERSHIP_PUBLICATION_PLANNING_SOURCE} from './control-plane-readiness-service.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from './control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_CONVERGENCE_CLASS,
} from './control-plane-error-classification.js';
import {normalizeControlPlanePublicationRow} from './system-row-normalizers.js';
import {publicationRowSatisfiesDesiredState} from './control-plane-publication-merge.js';
import {
  MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL,
  MEMBERSHIP_PUBLICATION_READ_PROFILE,
  MEMBERSHIP_PUBLICATION_STATUS,
  MEMBERSHIP_PUBLICATION_WORKFLOW_STEP,
  PUBLICATION_WORKFLOW_REASON,
  PUBLICATION_WRITE_MAX_ATTEMPTS,
  listEquals,
  normalizeNodeIdList,
  normalizePositiveInteger,
} from './membership-publication-coordinator-stage-1.js';
import {
  buildMembershipPublicationEvidenceSnapshot,
  buildMembershipPublicationRow,
  buildPublicationMetadataRefreshRow,
  buildPublicationReadOptions,
  deriveMembershipPublicationCandidate,
  hasExplicitMembershipPublicationTarget,
  mergePublicationRows,
  serializeMembershipPublicationRow,
  shouldPreferAuthoritativeMembershipState,
} from './membership-publication-coordinator-stage-2.js';
import {acknowledgeMembershipPublication} from './membership-publication-coordinator-stage-3.js';
import {MembershipPublicationCoordinatorClassStage1} from './membership-publication-coordinator-class-stage-1.js';
import {
  ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD,
  ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME,
  readActiveGateMembershipPublicationVisibleRow,
  readActiveGateMembershipPublicationVisibleReconcileRow,
  reconcileActiveGateMembershipPublication,
  shouldRouteActiveGateMembershipPublicationReconcile,
} from './membership-publication-active-gate-reconcile.js';
import {
  CONTROL_PLANE_CONVERGENCE_FIELD,
  CONTROL_PLANE_CRITICAL_CONVERGENCE_OPERATION,
  buildCriticalControlPlaneConvergenceOptions,
} from './membership-publication-control-plane-convergence.js';
import {buildPublicationActiveGateHandoffContract} from './publication-active-gate-handoff-contract.js';
import {
  resolveControlPlanePublicationsLeadership,
} from './control-plane-publications-leadership.js';

// Owner-driven membership liveness (Workstream A). A dedicated always-on interval
// — started UNCONDITIONALLY, independent of metadata-publication readiness so it
// cannot be gated behind the very progress it exists to create — drives the
// membership reconcile on the partition leader. Each drive is timeout-bounded so a
// slow/doomed reconcile can never wedge the in-flight guard.
const OWNER_MEMBERSHIP_DRIVER_INTERVAL_MS = 5000;
const OWNER_MEMBERSHIP_RECONCILE_TIMEOUT_MS = 15000;
const OWNER_MEMBERSHIP_DRIVER_ERROR_MSG =
  'Owner-driven membership reconcile error';
const OWNER_MEMBERSHIP_DRIVER_RAN_MSG =
  'DIAG owner-membership driver ran as leader (predicate true)';
const OWNER_MEMBERSHIP_DRIVER_PREDICATE_MSG =
  'DIAG owner-membership driver predicate (am I the owner?)';
const OWNER_MEMBERSHIP_DRIVER_SNAP_MSG =
  'DIAG owner-membership driver planning snapshot';
// B4 tripwire: owner-driven membership assumes control_plane_publications is a
// single partition (one Raft leader = one authoritative writer = single source of
// truth). B1 enforces non-splittable, but if that ever regressed this surfaces it
// loudly instead of silently splitting the brain across fragments.
const MEMBERSHIP_MULTI_PARTITION_MSG =
  'CRITICAL: control_plane_publications has >1 partition — membership ' +
  'single-source-of-truth assumption violated (see B1 non-split policy)';

const MEMBERSHIP_RECONCILE_DEFERRED_NOT_WRITE_LEADER_MSG =
  'Membership reconcile deferred: not the control_plane_publications write-leader';
const NOT_PUBLICATIONS_WRITE_LEADER_REASON = 'not_publications_write_leader';

// Per-tick convergence decision trace. Console-only + debug-level BY DESIGN (see
// LoggingService.logConsoleOnly): the owner driver fires every
// OWNER_MEMBERSHIP_DRIVER_INTERVAL_MS on the very distributed write path a
// publication stall blocks, so persisting a per-tick trace to the logs table
// would add load to the stall it is meant to observe. It is therefore emitted to
// stdout only (retrieved via the harness full-log capture under --debug-logs) and
// dropped entirely at the default info level. This formalizes the ad-hoc DIAG
// warns: one structured event per tick recording who the node thinks owns the
// publication, by which leadership tier, the deficit, the decision, and outcome.
const CONVERGENCE_DECISION_TRACE_MSG = 'convergence decision trace';
// INFO (not debug) so the trace is captured WITHOUT raising the whole console to
// debug — full --debug-logs emits ~10k lines/sec on a busy leader and PERTURBS the
// timing-sensitive convergence it tries to observe. At info this is ~one line per
// owner-driver tick (low volume), and still console-only (logConsoleOnly never
// persists to the logs table), so it adds no DB/Raft load to the subsystem it
// observes.
const CONVERGENCE_TRACE_LEVEL = 'info';
const CONVERGENCE_DECISION = Object.freeze({
  DRIVE: 'drive',
  SKIP: 'skip',
  DEFER: 'defer',
});
const CONVERGENCE_REASON = Object.freeze({
  NOT_OWNER: 'not-owner',
  NO_SNAPSHOT: 'no-snapshot',
  NO_DEFICIT: 'no-deficit',
  DRIVEN: 'driven',
  IN_FLIGHT: 'reconcile-in-flight',
  ERROR: 'error',
  NOT_WRITE_LEADER: 'not-publications-write-leader',
});
const CONVERGENCE_OUTCOME = Object.freeze({
  RECONCILE_COMMITTED: 'reconcile-committed',
  RECONCILE_TIMED_OUT: 'reconcile-timed-out',
  NONE: 'none',
});

// Phase 4: defer the membership reconcile when leader-driven mode is enabled and
// this node is NOT the control_plane_publications write-leader. Fail OPEN — never
// block a reconcile on a missing/throwing predicate or when the flag is off, so
// default behavior is unchanged.
function shouldDeferMembershipReconcileToWriteLeader(coordinator) {
  if (coordinator.membershipLeaderDrivenEnabled !== true) {
    return false;
  }
  if (
    typeof coordinator.resolveIsControlPlanePublicationsWriteLeader !==
    TYPEOF.FUNCTION
  ) {
    return false;
  }
  try {
    return coordinator.resolveIsControlPlanePublicationsWriteLeader() !== true;
  } catch {
    return false;
  }
}

function hasCandidateAcknowledgementRefresh(latestPublicationRow, candidate = {}) {
  const normalizedLatestPublication =
    normalizeControlPlanePublicationRow(latestPublicationRow);
  return Array.isArray(candidate.acknowledgedNodeIds) &&
    !listEquals(
      normalizedLatestPublication.acknowledgedNodeIds,
      candidate.acknowledgedNodeIds,
    );
}

function hasCandidateStatusRefresh(latestPublicationRow, candidate = {}) {
  const normalizedLatestPublication =
    normalizeControlPlanePublicationRow(latestPublicationRow);
  const candidateStatus =
    typeof candidate.publicationStatus === TYPEOF.STRING ?
      candidate.publicationStatus.toUpperCase() :
      MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY;
  return candidateStatus.length > NUM.ZERO &&
    candidateStatus !== normalizedLatestPublication.status;
}

// CL-001 variant A: the owner-driver's drive/skip gate keys only on
// missingPublishedCount, so once a published epoch covers every active node the
// driver SKIPS forever (decision=skip reason=no-deficit) and never re-runs the
// reconcile that would CLOSE a still-OPEN publication awaiting acks. After a
// rolling-restart rejoin the owner re-includes the rejoined node into an OPEN
// publication that then never closes because no stable (publicationChanged===
// false) reconcile tick ever runs to carry its recovery-eligible ack. This
// surfaces the pending acks the owner SHOULD still re-drive on.
//
// Never-break / thrash guard: only return pending acks when EVERY pending-ack
// node is one the close lane will actually CARRY into the acknowledged set on a
// stable (publicationChanged===false) re-drive, so the publication transitions to
// PUBLISHED rather than the driver spinning every tick. Two classes qualify, both
// carried by the close lane's RECOVERY_ELIGIBLE_ACK rule (publishableRecoveryActive):
//   1. recovery-eligible nodes — carried via the close lane's RECOVERY_ELIGIBLE
//      readiness rule (controlPlaneRecoveryEligible);
//   2. cluster-member-healthy, process-alive nodes that are NOT recovery-eligible
//      (e.g. a rejoined-then-graduated node still pending its ack on an OPEN row) —
//      these skip the recovery-eligibility readiness gate in the close lane and
//      default to ELIGIBLE, so they too are carried (verified: a published-baseline
//      node is in recoveryActiveNodeIds and defaults publishable). CL-001 GATE
//      20260613T075853Z showed the recovering wedge is THIS class, not recovery-
//      eligible, so the narrow guard was inert; this broadening makes it engage.
// A pending node that is neither (e.g. process-not-alive / draining / genuinely
// dead) yields [] here so the driver does NOT spin every tick; it is left to the
// steady-trim disposition instead. The qualifying set is a strict SUBSET of what
// the close lane carries, so a re-drive on this path always closes (modulo the
// pre-existing, bounded, timeout-paced admission-blocked-cohort residual).
function resolveOwnerAckCompletionPendingNodeIds(planningSnapshot) {
  const latestRow = normalizeControlPlanePublicationRow(
    planningSnapshot?.latestPublicationRow,
  );
  if (!latestRow || latestRow.status !== MEMBERSHIP_PUBLICATION_STATUS.OPEN) {
    return [];
  }
  const requiredAckNodeIds = normalizeNodeIdList(latestRow.requiredAckNodeIds);
  if (requiredAckNodeIds.length === NUM.ZERO) {
    return [];
  }
  const acknowledgedNodeIds = new Set(
    normalizeNodeIdList(latestRow.acknowledgedNodeIds),
  );
  const pendingAckNodeIds = requiredAckNodeIds.filter(
    (nodeId) => !acknowledgedNodeIds.has(nodeId),
  );
  if (pendingAckNodeIds.length === NUM.ZERO) {
    return [];
  }
  const readinessByNodeId =
    planningSnapshot?.readinessByNodeId &&
    typeof planningSnapshot.readinessByNodeId === TYPEOF.OBJECT ?
      planningSnapshot.readinessByNodeId :
      {};
  const isOwnerAckCompletionEligible = (nodeId) => {
    const dimensions = readinessByNodeId[nodeId]?.dimensions ?? {};
    if (
      dimensions[
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
      ] === true
    ) {
      return true;
    }
    // Cluster-member-healthy + (not explicitly) process-not-alive: the close lane
    // defaults such a node to ELIGIBLE (it skips the recovery-eligibility readiness
    // gate) and carries it, so re-driving closes the OPEN publication. processAlive
    // is checked with !== false to match the close lane's PROCESS_NOT_ALIVE defer
    // rule (only an explicit false defers); clusterMemberHealthy must be truthy so
    // draining/unhealthy required-ack nodes fall to steady-trim, not a spin.
    return (
      dimensions[
        CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY
      ] === true &&
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] !== false
    );
  };
  if (!pendingAckNodeIds.every(isOwnerAckCompletionEligible)) {
    return [];
  }
  return pendingAckNodeIds;
}

class MembershipPublicationCoordinatorClassStage2 extends
  MembershipPublicationCoordinatorClassStage1 {
  deriveClusterMembershipCandidateSync(options = {}) {
    const planningSnapshot =
      options.planningSnapshot && typeof options.planningSnapshot === TYPEOF.OBJECT ?
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
      options.latestPublicationRow || (await this.getLatestPublicationRow(planningReadOptions));
    const latestPublishedPublicationRow =
      options.latestPublishedPublicationRow ||
      (String(latestPublicationRow?.status || '').toUpperCase() ===
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
      preferAuthoritativeRead: preferAuthoritativeMembershipState,
      preloadedRows: options.nodeRows,
    });
    const nodeEndpointRows = await this.readTableRows(TABLES.NODE_ENDPOINTS, {
      ...planningReadOptions,
      preferAuthoritativeRead: preferAuthoritativeMembershipState,
      preloadedRows: options.nodeEndpointRows,
    });
    const serviceRows = await this.readTableRows(TABLES.SERVICES, {
      ...planningReadOptions,
      preferAuthoritativeRead: preferAuthoritativeMembershipState,
      preloadedRows: options.serviceRows,
    });
    const partitionRows = await this.readTableRows(TABLES.PARTITIONS, {
      ...planningReadOptions,
      preferAuthoritativeRead: preferAuthoritativeMembershipState,
      preloadedRows: options.partitionRows,
    });
    const replicaOperationRows = await this.readTableRows(
      TABLES.REPLICA_OPERATIONS,
      {
        ...planningReadOptions,
        preferAuthoritativeRead: preferAuthoritativeMembershipState,
        preloadedRows: options.replicaOperationRows,
      },
    );
    const readinessEntries = Array.isArray(options.readinessEntries) ?
      options.readinessEntries :
      this.controlPlaneReadinessService &&
          typeof this.controlPlaneReadinessService.getAllNodeReadiness === TYPEOF.FUNCTION ?
        await this.controlPlaneReadinessService.getAllNodeReadiness({
          allowAuthoritativeRefresh: preferAuthoritativeMembershipState,
          membershipPublicationPlanningSource:
              MEMBERSHIP_PUBLICATION_PLANNING_SOURCE.DIRECT_PUBLICATION_ROW,
        }) :
        [];
    const recoveryEpochsByNodeId =
      options.recoveryEpochsByNodeId ||
      (this.controlPlaneReadinessService &&
      typeof this.controlPlaneReadinessService.getRecoveryEpochHistoryByNodeId === TYPEOF.FUNCTION ?
        this.controlPlaneReadinessService.getRecoveryEpochHistoryByNodeId() :
        null);
    const connectedNodeIds =
      this.controlPlaneReadinessService?.messageRouter &&
      typeof this.controlPlaneReadinessService.messageRouter.getConnectedNodes === TYPEOF.FUNCTION ?
        this.controlPlaneReadinessService.messageRouter.getConnectedNodes() :
        [];
    const priorityRecoveryPlanningSnapshot =
      options.deferNestedPriorityRecoveryPlanning === true ?
        null :
        this.controlPlaneReadinessService &&
            typeof this.controlPlaneReadinessService
              .getMembershipPublicationPlanningSnapshotBestEffort === TYPEOF.FUNCTION ?
          await this.controlPlaneReadinessService.getMembershipPublicationPlanningSnapshotBestEffort(
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
      priorityRecoveryPlanningSnapshot,
      publisherNodeId: options.publisherNodeId || this.nodeId,
      localNodeId: this.nodeId,
      localNodeResponsive: true,
      nowMs: normalizePositiveInteger(options.nowMs, this.now()),
    });
  }

  readPublicationPlanningSnapshotSync(options = {}) {
    const latestPublicationRow =
      options.latestPublicationRow || this.getLatestPublicationRowSync(options);
    const latestPublishedPublicationRow =
      options.latestPublishedPublicationRow ||
      (String(latestPublicationRow?.status || '').toUpperCase() ===
      MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ?
        latestPublicationRow :
        this.getLatestPublishedPublicationRowSync(options));
    const nodeRows = Array.isArray(options.nodeRows) ?
      options.nodeRows :
      typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ?
        this.systemTableCache.getAll(TABLES.NODES) || [] :
        [];
    const nodeEndpointRows = Array.isArray(options.nodeEndpointRows) ?
      options.nodeEndpointRows :
      typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ?
        this.systemTableCache.getAll(TABLES.NODE_ENDPOINTS) || [] :
        [];
    const serviceRows = Array.isArray(options.serviceRows) ?
      options.serviceRows :
      typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ?
        this.systemTableCache.getAll(TABLES.SERVICES) || [] :
        [];
    const partitionRows = Array.isArray(options.partitionRows) ?
      options.partitionRows :
      typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ?
        this.systemTableCache.getAll(TABLES.PARTITIONS) || [] :
        [];
    const replicaOperationRows = Array.isArray(options.replicaOperationRows) ?
      options.replicaOperationRows :
      typeof this.systemTableCache?.getAll === TYPEOF.FUNCTION ?
        this.systemTableCache.getAll(TABLES.REPLICA_OPERATIONS) || [] :
        [];
    const readinessEntries = Array.isArray(options.readinessEntries) ?
      options.readinessEntries :
      this.controlPlaneReadinessService &&
          typeof this.controlPlaneReadinessService.getAllNodeReadinessSync === TYPEOF.FUNCTION ?
        this.controlPlaneReadinessService.getAllNodeReadinessSync({
          allowStaleOnCacheChange: true,
          membershipPublicationPlanningSource:
              MEMBERSHIP_PUBLICATION_PLANNING_SOURCE.DIRECT_PUBLICATION_ROW,
        }) :
        [];
    const recoveryEpochsByNodeId =
      options.recoveryEpochsByNodeId ||
      (this.controlPlaneReadinessService &&
      typeof this.controlPlaneReadinessService.getRecoveryEpochHistoryByNodeId === TYPEOF.FUNCTION ?
        this.controlPlaneReadinessService.getRecoveryEpochHistoryByNodeId() :
        null);
    const connectedNodeIds =
      this.controlPlaneReadinessService?.messageRouter &&
      typeof this.controlPlaneReadinessService.messageRouter.getConnectedNodes === TYPEOF.FUNCTION ?
        this.controlPlaneReadinessService.messageRouter.getConnectedNodes() :
        [];
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
      priorityRecoveryPlanningSnapshot: null,
      publisherNodeId: options.publisherNodeId || this.nodeId,
      localNodeId: this.nodeId,
      localNodeResponsive: true,
      nowMs: normalizePositiveInteger(options.nowMs, this.now()),
    });
  }

  async ensureWorkflow(ownerKey, candidate) {
    const existingWorkflow = this.workflowCoordinator.getWorkflowByOwnerKey(ownerKey);
    if (existingWorkflow) {
      return existingWorkflow;
    }
    return this.workflowCoordinator.registerWorkflow({
      workflowId: `membership-publication:${candidate.publicationEpoch}`,
      ownerKey,
      step: MEMBERSHIP_PUBLICATION_WORKFLOW_STEP.IDLE,
      metadata: {
        publicationKind: candidate.publicationKind,
      },
      transitionHistory: [],
    });
  }

  async persistPublicationRow(row, options = {}) {
    const ownerKey =
      options[CONTROL_PLANE_CONVERGENCE_FIELD
        .CONTROL_PLANE_CONVERGENCE_OWNER_KEY] || this.buildOwnerKey();
    const publicationOptions = buildCriticalControlPlaneConvergenceOptions(
      options,
      {
        ownerKey,
        operation:
          options[CONTROL_PLANE_CONVERGENCE_FIELD
            .CONTROL_PLANE_CONVERGENCE_OPERATION] ||
          CONTROL_PLANE_CRITICAL_CONVERGENCE_OPERATION.MEMBERSHIP_PUBLICATION,
      },
    );
    let persistedRow = serializeMembershipPublicationRow(row);
    if (
      this.controlPlanePublicationsOwner &&
      typeof this.controlPlanePublicationsOwner.upsertPublication === TYPEOF.FUNCTION
    ) {
      const publicationId = persistedRow.publication_id || null;
      const canVerifyPersistedRow =
        publicationId &&
        options.skipPublicationWriteReadback !== true &&
        typeof this.controlPlanePublicationsOwner.getPublication === TYPEOF.FUNCTION;
      const maxAttempts = normalizePositiveInteger(
        options.publicationWriteMaxAttempts,
        PUBLICATION_WRITE_MAX_ATTEMPTS,
      );
      for (let attempt = NUM.ZERO; attempt < maxAttempts; attempt += NUM.ONE) {
        if (canVerifyPersistedRow) {
          const currentRow = await this.controlPlanePublicationsOwner.getPublication(
            publicationId,
            buildPublicationReadOptions(publicationOptions),
          );
          persistedRow = serializeMembershipPublicationRow(
            mergePublicationRows(persistedRow, currentRow),
          );
        }
        try {
          await this.controlPlanePublicationsOwner.upsertPublication(
            persistedRow,
            publicationOptions,
          );
        } catch (error) {
          if (!canVerifyPersistedRow || attempt + NUM.ONE >= maxAttempts) {
            throw error;
          }
          const durableRow = await this.controlPlanePublicationsOwner.getPublication(
            publicationId,
            buildPublicationReadOptions(publicationOptions),
          );
          if (publicationRowSatisfiesDesiredState(durableRow, persistedRow)) {
            return serializeMembershipPublicationRow(
              mergePublicationRows(durableRow, persistedRow),
            );
          }
          persistedRow = serializeMembershipPublicationRow(
            mergePublicationRows(durableRow, persistedRow),
          );
          continue;
        }
        if (!canVerifyPersistedRow) {
          return persistedRow;
        }
        if (options.skipPublicationWriteReadback === true) {
          return persistedRow;
        }
        const durableRow = await this.controlPlanePublicationsOwner.getPublication(
          publicationId,
          buildPublicationReadOptions(publicationOptions),
        );
        if (publicationRowSatisfiesDesiredState(durableRow, persistedRow)) {
          return serializeMembershipPublicationRow(mergePublicationRows(durableRow, persistedRow));
        }
        persistedRow = serializeMembershipPublicationRow(
          mergePublicationRows(durableRow, persistedRow),
        );
      }
    }
    return persistedRow;
  }

  async acknowledgePublication(publicationId, nodeId, options = {}) {
    const acknowledgementOwnerKey = `${this.buildOwnerKey()}:ack:${publicationId}`;
    const acknowledgementOptions = buildCriticalControlPlaneConvergenceOptions(
      options,
      {
        ownerKey: acknowledgementOwnerKey,
        operation: CONTROL_PLANE_CRITICAL_CONVERGENCE_OPERATION.PUBLICATION_ACK,
      },
    );
    return this.publicationAcknowledgementLane.run(
      {
        ownerKey: acknowledgementOwnerKey,
        [CONTROL_PLANE_CONVERGENCE_FIELD.CONTROL_PLANE_CONVERGENCE_CLASS]:
          CONTROL_PLANE_CONVERGENCE_CLASS.CRITICAL,
      },
      async () => {
        let existingRow = null;
        if (
          this.controlPlanePublicationsOwner &&
          typeof this.controlPlanePublicationsOwner.getPublication === TYPEOF.FUNCTION
        ) {
          existingRow = await this.controlPlanePublicationsOwner.getPublication(
            publicationId,
            buildPublicationReadOptions(acknowledgementOptions),
          );
        }
        const baseRow = mergePublicationRows(
          existingRow,
          acknowledgementOptions.publicationRow || null,
        );
        if (!baseRow) {
          return null;
        }
        const normalizedBaseRow = normalizeControlPlanePublicationRow(baseRow);
        const acknowledgedRow = acknowledgeMembershipPublication({
          publicationRow: baseRow,
          nodeId,
          nowMs: this.now(),
          timeoutMs: acknowledgementOptions.timeoutMs,
          timeoutReasonCode: acknowledgementOptions.timeoutReasonCode,
        });
        const normalizedAcknowledgedRow = normalizeControlPlanePublicationRow(acknowledgedRow);
        const acknowledgementChanged =
          normalizedAcknowledgedRow.status !== normalizedBaseRow.status ||
          !listEquals(
            normalizedAcknowledgedRow.acknowledgedNodeIds,
            normalizedBaseRow.acknowledgedNodeIds,
          );
        if (!acknowledgementChanged) {
          return acknowledgedRow;
        }
        return this.persistPublicationRow(acknowledgedRow, acknowledgementOptions);
      },
    );
  }

  async reconcileClusterMembership(options = {}) {
    const ownerKey = this.buildOwnerKey();
    if (shouldDeferMembershipReconcileToWriteLeader(this)) {
      this.logger?.info?.(
        MEMBERSHIP_RECONCILE_DEFERRED_NOT_WRITE_LEADER_MSG,
        {nodeId: this.nodeId, ownerKey},
      );
      this._emitConvergenceDecisionTrace({
        decision: CONVERGENCE_DECISION.DEFER,
        reason: CONVERGENCE_REASON.NOT_WRITE_LEADER,
        ownerKey,
      });
      return {
        deferred: true,
        reason: NOT_PUBLICATIONS_WRITE_LEADER_REASON,
        ownerKey,
      };
    }
    const convergenceOptions = buildCriticalControlPlaneConvergenceOptions(
      options,
      {
        ownerKey,
        operation:
          CONTROL_PLANE_CRITICAL_CONVERGENCE_OPERATION.MEMBERSHIP_PUBLICATION,
      },
    );
    if (shouldRouteActiveGateMembershipPublicationReconcile(
      convergenceOptions,
    )) {
      return this.reconcileActiveGateMembershipPublication(
        convergenceOptions[
          ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD
            .PUBLICATION_ACTIVE_GATE_HANDOFF
        ],
        convergenceOptions,
      );
    }
    return this.publicationReconcileLane.run(
      {
        ownerKey,
        [CONTROL_PLANE_CONVERGENCE_FIELD.CONTROL_PLANE_CONVERGENCE_CLASS]:
          CONTROL_PLANE_CONVERGENCE_CLASS.CRITICAL,
      },
      async () =>
        this.workflowCoordinator.runExclusive(ownerKey, async () => {
          const latestPublicationRow =
            convergenceOptions.latestPublicationRow ||
            (await this.getLatestPublicationRow(convergenceOptions));
          const latestPublishedPublicationRow =
            convergenceOptions.latestPublishedPublicationRow ||
            (String(latestPublicationRow?.status || '').toUpperCase() ===
            MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ?
              latestPublicationRow :
              await this.getLatestPublishedPublicationRow(convergenceOptions));
          const candidate = await this.deriveClusterMembershipCandidate({
            ...convergenceOptions,
            latestPublicationRow,
            latestPublishedPublicationRow,
          });
          const workflow = await this.ensureWorkflow(ownerKey, candidate);
          if (latestPublicationRow && candidate.changed !== true) {
            const shouldRefreshPriorityMetadata =
              candidate.priorityPartitionSummaryChanged === true &&
              ((candidate.priorityPartitionSummary &&
                typeof candidate.priorityPartitionSummary === TYPEOF.OBJECT) ||
              (candidate.membershipLifecycleSummary &&
                typeof candidate.membershipLifecycleSummary === TYPEOF.OBJECT));
            const shouldRefreshMembershipLifecycleMetadata =
              candidate.membershipLifecycleSummaryChanged === true &&
              candidate.membershipLifecycleSummary &&
              typeof candidate.membershipLifecycleSummary === TYPEOF.OBJECT;
            const shouldRefreshAcknowledgements =
              hasCandidateAcknowledgementRefresh(latestPublicationRow, candidate);
            const shouldRefreshStatus =
              hasCandidateStatusRefresh(latestPublicationRow, candidate);
            if (
              shouldRefreshPriorityMetadata ||
              shouldRefreshMembershipLifecycleMetadata ||
              shouldRefreshAcknowledgements ||
              shouldRefreshStatus
            ) {
              const refreshedRow = buildPublicationMetadataRefreshRow({
                publicationRow: latestPublicationRow,
                priorityPartitionSummary: candidate.priorityPartitionSummary,
                membershipLifecycleSummary: candidate.membershipLifecycleSummary,
                acknowledgedNodeIds: candidate.acknowledgedNodeIds,
                nowMs: this.now(),
              });
              const persistedRow = await this.persistPublicationRow(
                refreshedRow,
                convergenceOptions,
              );
              return {
                candidate,
                publicationRow: normalizeControlPlanePublicationRow(persistedRow),
                workflow,
              };
            }
            return {
              candidate,
              publicationRow:
                String(
                  latestPublicationRow.status || MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY,
                ).toUpperCase() === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ||
                !latestPublishedPublicationRow ?
                  latestPublicationRow :
                  latestPublishedPublicationRow,
              workflow,
            };
          }
          await this.workflowCoordinator.transitionStep(workflow.workflowId, {
            nextStep: MEMBERSHIP_PUBLICATION_WORKFLOW_STEP.DERIVING,
            reason: PUBLICATION_WORKFLOW_REASON.DERIVE_MEMBERSHIP_PUBLICATION,
            metadata: {
              publicationEpoch: candidate.publicationEpoch,
            },
          });
          const row = buildMembershipPublicationRow({
            publicationId: options.publicationId,
            candidate,
            nowMs: this.now(),
          });
          const persistedRow = await this.persistPublicationRow(
            row,
            convergenceOptions,
          );
          await this.workflowCoordinator.transitionStep(
            workflow.workflowId,
            {
              nextStep: MEMBERSHIP_PUBLICATION_WORKFLOW_STEP.OPEN,
              reason: PUBLICATION_WORKFLOW_REASON.PERSIST_OPEN_PUBLICATION,
              metadata: {
                publicationId: row.publication_id,
                publicationEpoch: row.publication_epoch,
              },
            },
            {
              metadata: {
                publicationId: row.publication_id,
                publicationEpoch: row.publication_epoch,
              },
            },
          );
          return {
            candidate,
            publicationRow: normalizeControlPlanePublicationRow(persistedRow),
            workflow,
          };
        }),
    );
  }

  async readActiveGateMembershipPublicationVisibleRow(
    publicationRow,
    target,
    context,
  ) {
    return readActiveGateMembershipPublicationVisibleRow(
      this,
      publicationRow,
      target,
      context,
    );
  }

  async readActiveGateMembershipPublicationVisibleReconcileRow(
    reconcileOutcome,
    target,
    context,
  ) {
    return readActiveGateMembershipPublicationVisibleReconcileRow(
      this,
      reconcileOutcome,
      target,
      context,
    );
  }

  async reconcileActiveGateMembershipPublication(
    publicationActiveGateHandoff,
    options = {},
  ) {
    return reconcileActiveGateMembershipPublication(
      this,
      publicationActiveGateHandoff,
      options,
    );
  }

  getControlPlaneOwnerQueueDepth() {
    const ownerKey = this.buildOwnerKey();
    const queueDiagnostics =
      typeof this.reconcileQueue?.getDiagnostics === TYPEOF.FUNCTION ?
        this.reconcileQueue.getDiagnostics() :
        null;
    const pendingKeys = Array.isArray(queueDiagnostics?.pendingKeys) ?
      queueDiagnostics.pendingKeys.map(String) :
      (
        this.reconcileQueue?.pending instanceof Map ?
          [...this.reconcileQueue.pending.keys()].map(String) :
          []
      );
    const retryingKeys = Array.isArray(queueDiagnostics?.retryingKeys) ?
      queueDiagnostics.retryingKeys.map(String) :
      (
        this.reconcileQueue?.retryWorkItems instanceof Map ?
          [...this.reconcileQueue.retryWorkItems.keys()].map(String) :
          []
      );
    const inFlightKeys = Array.isArray(queueDiagnostics?.inFlightKeys) ?
      queueDiagnostics.inFlightKeys.map(String) :
      (
        this.reconcileQueue?.inFlight instanceof Set ?
          [...this.reconcileQueue.inFlight].map(String) :
          []
      );
    const pendingWrites = [
      pendingKeys.includes(ownerKey),
      retryingKeys.includes(ownerKey),
      inFlightKeys.includes(ownerKey),
    ].filter(Boolean).length;
    const retryableDrainFailureCount = Number.isFinite(
      queueDiagnostics?.retryableDrainFailureCount,
    ) ?
      Math.max(NUM.ZERO, Math.floor(
        queueDiagnostics.retryableDrainFailureCount,
      )) :
      NUM.ZERO;
    return Object.freeze({
      pendingWrites,
      pendingWriteGrowthCount: NUM.ZERO,
      retainedBacklogGrowthCount:
        retryingKeys.includes(ownerKey) ? NUM.ONE : NUM.ZERO,
      sharedPressureBackpressured: false,
      transportPressureBackpressured: false,
      queryPressureBackpressured: false,
      ownerKey,
      pendingKeys,
      retryingKeys,
      inFlightKeys,
      retryableDrainFailureCount,
    });
  }

  getLaneDiagnostics() {
    const inFlightExecutions =
      this.workflowCoordinator?.inFlightExecutionsByOwnerKey instanceof Map ?
        this.workflowCoordinator.inFlightExecutionsByOwnerKey :
        new Map();
    return Object.freeze({
      reconcileLane: Object.freeze({
        name: this.publicationReconcileLane?.name || null,
        activeExecutionCount: inFlightExecutions.has(this.buildOwnerKey()) ? NUM.ONE : NUM.ZERO,
      }),
      acknowledgementLane: Object.freeze({
        name: this.publicationAcknowledgementLane?.name || null,
        activeExecutionCount: [...inFlightExecutions.keys()].filter((ownerKey) =>
          String(ownerKey).startsWith(`${this.buildOwnerKey()}:ack:`),
        ).length,
      }),
    });
  }

  /**
   * Owner-driven membership reconcile (Workstream A). When this node is the
   * control_plane_publications write-leader and active nodes are unpublished,
   * drive the authoritative reconcile locally (Raft-quorum-committed). Timeout-
   * bounded so a slow/doomed reconcile can never wedge the in-flight guard.
   * @return {Promise<boolean>} whether a reconcile was driven.
   */
  // Emit one structured per-tick convergence decision-trace event. Console-only
  // + debug-level (never persisted) — see CONVERGENCE_DECISION_TRACE_MSG. Guarded
  // with optional chaining so a mock/legacy logger without logConsoleOnly is a
  // no-op rather than a crash.
  _emitConvergenceDecisionTrace(fields) {
    this.logger?.logConsoleOnly?.(
      CONVERGENCE_TRACE_LEVEL,
      CONVERGENCE_DECISION_TRACE_MSG,
      {nodeId: this.nodeId, ...fields},
    );
  }

  // Formation-blocker diagnostic fields for the convergence decision trace: WHY
  // the publication-active gate / priority-control-plane spread is (not) ready.
  // Pulled from the handoff contract (known fields) + the priority-recovery
  // planning snapshot (best-effort, optional-chained so a missing/changed shape is
  // null, never a throw). Surfaces the exact unmet sub-condition that blocks
  // initial formation (priority_control_plane_spread_pending / missing-active /
  // pending-recovery) so it can be read from a low-volume --capture-logs run.
  _buildPublicationReadinessTraceFields(handoffContract, planningSnapshot) {
    const prs = planningSnapshot?.priorityRecoveryPlanningSnapshot || null;
    // CL-021: the contract reasonCode ALIASES catchup-fence denial as
    // published_active_coverage_incomplete even when missing=0 (the
    // promotionDeniedByFence path in the handoff contract), so the fence's
    // own evidence must be observable here — otherwise sub-mode (B), where
    // the fence denies while everything the owner sees is green, cannot be
    // attributed from a captured run.
    const fence = handoffContract?.activeGateCatchupFence || null;
    return {
      contractState: handoffContract?.state ?? null,
      contractReason: handoffContract?.reasonCode ?? null,
      contractNextAction: handoffContract?.nextAction ?? null,
      expectedNodeCount: handoffContract?.expectedNodeCount ?? null,
      publishedActiveNodeCount: handoffContract?.publishedActiveNodeCount ?? null,
      pendingRecoveryCount: handoffContract?.pendingRecoveryCount ?? null,
      pendingReconcileCount: handoffContract?.pendingReconcileCount ?? null,
      fenceState: fence?.state ?? null,
      fencePromotionAllowed: fence?.promotionAllowed ?? null,
      fenceMissingProofReasons: Array.isArray(fence?.missingProofReasons) ?
        fence.missingProofReasons :
        null,
      fenceDurablePublicationState: fence?.durablePublication?.state ?? null,
      fenceDurablePublicationMissingCount:
        fence?.durablePublication?.missingNodeCount ?? null,
      fenceSnapshotCoverageState: fence?.snapshotCoverage?.state ?? null,
      fenceSnapshotCoverageMissingCount:
        fence?.snapshotCoverage?.missingNodeCount ?? null,
      fencePresenceComplete: fence?.presence?.complete ?? null,
      fencePresenceMissingCount: fence?.presence?.missingNodeCount ?? null,
      // The priority-recovery projection nests the gate snapshot under
      // publicationRecoveryGate; prioritySpreadPending (the formation blocker) +
      // reasonCodes live THERE, not at the top level. Top level exposes the
      // renamed priorityRecoveryReasonCodes. (Verified field paths.)
      prioritySpreadPending:
        prs?.publicationRecoveryGate?.prioritySpreadPending ?? null,
      priorityRecoveryReasonCodes: Array.isArray(
        prs?.priorityRecoveryReasonCodes,
      ) ?
        prs.priorityRecoveryReasonCodes :
        (prs?.publicationRecoveryGate?.reasonCodes ?? null),
      recoveryProtocolState: prs?.recoveryProtocolState ?? null,
    };
  }

  async driveOwnerMembershipReconcile() {
    if (this.ownerMembershipReconcileInFlight === true) {
      this._emitConvergenceDecisionTrace({
        decision: CONVERGENCE_DECISION.SKIP,
        reason: CONVERGENCE_REASON.IN_FLIGHT,
      });
      return false;
    }
    const leadership = resolveControlPlanePublicationsLeadership(
      this.systemTableCache,
      this.nodeId,
      this.cdcIntegrationService,
    );
    const isLeader = leadership.isLeader;
    // DIAG: the interval IS firing; log the predicate result on transition so we
    // can see whether this node ever resolves as the owner at all.
    if (this.ownerDriverPredicateSnapshot !== isLeader) {
      this.ownerDriverPredicateSnapshot = isLeader;
      this.logger?.warn?.(OWNER_MEMBERSHIP_DRIVER_PREDICATE_MSG, {
        nodeId: this.nodeId,
        isLeader,
      });
    }
    if (!isLeader) {
      this._emitConvergenceDecisionTrace({
        decision: CONVERGENCE_DECISION.SKIP,
        reason: CONVERGENCE_REASON.NOT_OWNER,
        leadershipTier: leadership.tier,
      });
      return false;
    }
    this.assertSingleMembershipPartition();
    this.ownerMembershipReconcileInFlight = true;
    try {
      const planningSnapshot = await this.readPublicationPlanningSnapshot({
        preferAuthoritativeRead: true,
      });
      // DIAG: on the owner — does the planning snapshot exist and what is its
      // own missingPublishedCount view (vs the harness convergence check)?
      const snapMissing =
        planningSnapshot ?
          (planningSnapshot.latestPublishedPublicationRow?.publishedActiveNodeIds
            ?.length ?? 'n/a') :
          'no-snapshot';
      if (this.ownerDriverSnapSnapshot !== String(snapMissing)) {
        this.ownerDriverSnapSnapshot = String(snapMissing);
        this.logger?.warn?.(OWNER_MEMBERSHIP_DRIVER_SNAP_MSG, {
          nodeId: this.nodeId,
          hasSnapshot: !!planningSnapshot,
          publishedCount: snapMissing,
        });
      }
      if (!planningSnapshot) {
        this._emitConvergenceDecisionTrace({
          decision: CONVERGENCE_DECISION.SKIP,
          reason: CONVERGENCE_REASON.NO_SNAPSHOT,
          leadershipTier: leadership.tier,
        });
        return false;
      }
      const latestPublishedRow = planningSnapshot.latestPublishedPublicationRow;
      const latestRow = planningSnapshot.latestPublicationRow;
      const publicationEpoch =
        latestPublishedRow?.publicationEpoch ??
        latestRow?.publicationEpoch ??
        0;
      const publishedActiveNodeIds =
        latestPublishedRow?.publishedActiveNodeIds ??
        latestRow?.publishedActiveNodeIds ??
        [];
      // CL-001 variant A: surface still-pending recovery-eligible acks on an
      // OPEN publication so the contract requests a reconcile even when the
      // published set has no deficit; without this the owner skips forever and
      // the OPEN publication never closes (see resolveOwnerAckCompletionPendingNodeIds).
      const ownerAckCompletionPendingNodeIds =
        resolveOwnerAckCompletionPendingNodeIds(planningSnapshot);
      const handoffContract = buildPublicationActiveGateHandoffContract({
        nodeRows: planningSnapshot.nodeRows,
        readinessByNodeId: planningSnapshot.readinessByNodeId,
        publicationConvergence: {publicationEpoch, publishedActiveNodeIds},
        ownerAckCompletionPendingNodeIds,
      });
      const missingCount = handoffContract?.missingPublishedCount ?? 0;
      if (
        missingCount <= 0 &&
        ownerAckCompletionPendingNodeIds.length === NUM.ZERO
      ) {
        this._emitConvergenceDecisionTrace({
          decision: CONVERGENCE_DECISION.SKIP,
          reason: CONVERGENCE_REASON.NO_DEFICIT,
          leadershipTier: leadership.tier,
          missingPublishedCount: missingCount,
          publicationEpoch,
          ...this._buildPublicationReadinessTraceFields(
            handoffContract,
            planningSnapshot,
          ),
        });
        return false;
      }
      let timer = null;
      let timedOut = true;
      await Promise.race([
        this.reconcileActiveGateMembershipPublication(handoffContract, {
          reconcileAuthoritativeMembershipPublication: true,
        }).then(() => {
          timedOut = false;
        }),
        new Promise((resolve) => {
          timer = setTimeout(resolve, OWNER_MEMBERSHIP_RECONCILE_TIMEOUT_MS);
        }),
      ]);
      if (timer) {
        clearTimeout(timer);
      }
      // Diagnostic: the driver IS acting as owner (Tier-0 fired) with a deficit.
      // timedOut distinguishes "predicate fixed but write can't commit (quorum)"
      // from "write commits". Transition-logged at warn.
      const ownerDriverDiag = `missing=${missingCount} timedOut=${timedOut}`;
      if (this.ownerDriverDiagSnapshot !== ownerDriverDiag) {
        this.ownerDriverDiagSnapshot = ownerDriverDiag;
        this.logger?.warn?.(OWNER_MEMBERSHIP_DRIVER_RAN_MSG, {
          nodeId: this.nodeId,
          missingCount,
          reconcileTimedOut: timedOut,
        });
      }
      this._emitConvergenceDecisionTrace({
        decision: CONVERGENCE_DECISION.DRIVE,
        reason: CONVERGENCE_REASON.DRIVEN,
        leadershipTier: leadership.tier,
        missingPublishedCount: missingCount,
        ownerAckCompletionPendingCount:
          ownerAckCompletionPendingNodeIds.length,
        publicationEpoch,
        outcome: timedOut ?
          CONVERGENCE_OUTCOME.RECONCILE_TIMED_OUT :
          CONVERGENCE_OUTCOME.RECONCILE_COMMITTED,
        ...this._buildPublicationReadinessTraceFields(
          handoffContract,
          planningSnapshot,
        ),
      });
      return true;
    } catch (error) {
      this.logger?.error?.(OWNER_MEMBERSHIP_DRIVER_ERROR_MSG, {
        nodeId: this.nodeId,
        message: error?.message,
      });
      this._emitConvergenceDecisionTrace({
        decision: CONVERGENCE_DECISION.DRIVE,
        reason: CONVERGENCE_REASON.ERROR,
        leadershipTier: leadership.tier,
        outcome: CONVERGENCE_OUTCOME.NONE,
        error: error?.message,
      });
      return false;
    } finally {
      this.ownerMembershipReconcileInFlight = false;
    }
  }

  /**
   * B4 tripwire: assert control_plane_publications resolves to a single partition.
   * One-time (until violated). Never throws / never affects behavior.
   * @private
   */
  assertSingleMembershipPartition() {
    if (this.membershipSinglePartitionAsserted === true) {
      return;
    }
    try {
      const partitions = this.systemTableCache?.getAll?.(TABLES.PARTITIONS) || [];
      const pubPartitions = partitions.filter(
        (p) =>
          p.table_id === TABLES.CONTROL_PLANE_PUBLICATIONS ||
          p.table_name === TABLES.CONTROL_PLANE_PUBLICATIONS,
      );
      if (pubPartitions.length > 1) {
        this.logger?.error?.(MEMBERSHIP_MULTI_PARTITION_MSG, {
          nodeId: this.nodeId,
          partitionCount: pubPartitions.length,
          partitionIds: pubPartitions.map((p) => p.partition_id),
        });
        return;
      }
      if (pubPartitions.length === 1) {
        this.membershipSinglePartitionAsserted = true;
      }
    } catch {
      // tripwire must never affect behavior
    }
  }

  /**
   * Start the always-on owner-membership driver. MUST be called UNCONDITIONALLY
   * at node startup — never behind metadata-publication readiness, or it can be
   * gated behind the very progress it exists to create. No-op unless leader-driven
   * mode is enabled.
   */
  startOwnerMembershipDriver(options = {}) {
    if (this.ownerMembershipDriverTimer) {
      return;
    }
    const enabled =
      options.enabled ??
      process.env.LAGRANGE_MEMBERSHIP_LEADER_DRIVEN === 'true';
    this.logger?.warn?.('DIAG startOwnerMembershipDriver called', {
      nodeId: this.nodeId,
      enabled,
      flag: process.env.LAGRANGE_MEMBERSHIP_LEADER_DRIVEN,
    });
    if (!enabled) {
      return;
    }
    const intervalMs =
      options.intervalMs || OWNER_MEMBERSHIP_DRIVER_INTERVAL_MS;
    const setIntervalFn =
      typeof options.setIntervalFn === TYPEOF.FUNCTION ?
        options.setIntervalFn :
        setInterval;
    this.ownerMembershipDriverTimer = setIntervalFn(() => {
      this.driveOwnerMembershipReconcile().catch(() => {});
    }, intervalMs);
    if (typeof this.ownerMembershipDriverTimer?.unref === TYPEOF.FUNCTION) {
      this.ownerMembershipDriverTimer.unref();
    }
  }

  stopOwnerMembershipDriver() {
    if (this.ownerMembershipDriverTimer) {
      clearInterval(this.ownerMembershipDriverTimer);
      this.ownerMembershipDriverTimer = null;
    }
  }
}

export {
  ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME,
  MembershipPublicationCoordinatorClassStage2,
  shouldDeferMembershipReconcileToWriteLeader,
  NOT_PUBLICATIONS_WRITE_LEADER_REASON,
};
