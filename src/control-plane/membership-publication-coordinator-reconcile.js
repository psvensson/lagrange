import {
  TABLES,
} from '../constants/index.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from './control-plane-readiness-constants.js';
import {resolveTimeSource} from '../time/time-source.js';
import {
  CONTROL_PLANE_CONVERGENCE_CLASS,
} from './control-plane-error-classification.js';
import {normalizeControlPlanePublicationRow} from './system-row-normalizers.js';
import {
  MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL,
  MEMBERSHIP_PUBLICATION_STATUS,
  MEMBERSHIP_PUBLICATION_READ_SOURCE,
  MEMBERSHIP_PUBLICATION_WORKFLOW_STEP,
  PUBLICATION_WORKFLOW_REASON,
} from './membership-publication-row-contract.js';
import {
  listEquals,
  normalizeNodeIdList,
} from './membership-publication-row-helpers.js';
import {
  buildMembershipPublicationRow,
  buildPublicationMetadataRefreshRow,
} from './membership-publication-planning-evidence.js';
import {MembershipPublicationCoordinatorPersist} from './membership-publication-coordinator-persist.js';
import {
  ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_CONTEXT_FIELD,
  ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME,
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
import {buildControlPlaneReadAuthority} from
  './control-plane-system-table-gateway-read-contracts.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
} from
  './control-plane-system-table-gateway-constants.js';

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

// CL-001 variant D: a non-write-leader's control_plane_publications cache is fed
// ONLY by the leader's point-in-time CDC fan-out (leader-gated emission, no replay
// — see closure-ledger CL-014). A node that missed the fan-out window (e.g. a
// former owner that shed leadership mid-epoch-advance, or a replica still wiring
// CDC) stays PERMANENTLY stale: getLatestPublicationRowSync freezes at a stale
// epoch while the cluster advances, and the harness consistency oracle reports
// `publication_epochs_disagree`. The only authoritative re-read
// (hydrateCdcPropagatedTablesFromAuthority) was previously one-shot at join. A
// deferring non-write-leader must pull its publications cache forward — but at most
// once per this cooldown so it does NOT issue an owner read on every reconcile tick.
const MEMBERSHIP_DEFERRED_PUBLICATIONS_CATCHUP_FAILED_MSG =
  'Deferred non-write-leader publications cache catch-up failed';
const DEFERRED_PUBLICATIONS_CATCHUP_COOLDOWN_MS = 5000;

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

// Phase 4: defer the membership reconcile when this node is NOT the
// control_plane_publications write-leader (leader-driven mode, unconditional
// since 2026-07-02 — validated by the dt4 full-chain and dt6 publication
// failback/ack-recovery/quorum-failback reproducers). Fail OPEN — never block a
// reconcile on a missing/throwing predicate, so a coordinator wired without the
// predicate reconciles as before.
function shouldDeferMembershipReconcileToWriteLeader(coordinator) {
  if (
    typeof coordinator.resolveIsControlPlanePublicationsWriteLeader !==
    'function'
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
    typeof candidate.publicationStatus === 'string' ?
      candidate.publicationStatus.toUpperCase() :
      MEMBERSHIP_PUBLICATION_COORDINATOR_LITERAL.EMPTY;
  return candidateStatus.length > 0 &&
    candidateStatus !== normalizedLatestPublication.status;
}

const OWNER_ACK_COMPLETION_REDRIVE_STATUSES = Object.freeze([
  MEMBERSHIP_PUBLICATION_STATUS.OPEN,
  MEMBERSHIP_PUBLICATION_STATUS.ACK_PENDING,
]);

// CL-001 variant A: the owner-driver's drive/skip gate keys only on
// missingPublishedCount, so once a published epoch covers every active node the
// driver SKIPS forever (decision=skip reason=no-deficit) and never re-runs the
// reconcile that would CLOSE a still-open publication awaiting acks. After a
// rolling-restart rejoin the owner re-includes the rejoined node into an OPEN or
// ACK_PENDING publication that then never closes because no stable
// (publicationChanged===false) reconcile tick ever runs to carry its recovery-
// eligible ack. This surfaces the pending acks the owner SHOULD still re-drive
// on.
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
  if (
    !latestRow ||
    !OWNER_ACK_COMPLETION_REDRIVE_STATUSES.includes(latestRow.status)
  ) {
    return [];
  }
  const requiredAckNodeIds = normalizeNodeIdList(latestRow.requiredAckNodeIds);
  if (requiredAckNodeIds.length === 0) {
    return [];
  }
  const acknowledgedNodeIds = new Set(
    normalizeNodeIdList(latestRow.acknowledgedNodeIds),
  );
  const pendingAckNodeIds = requiredAckNodeIds.filter(
    (nodeId) => !acknowledgedNodeIds.has(nodeId),
  );
  if (pendingAckNodeIds.length === 0) {
    return [];
  }
  const readinessByNodeId =
    planningSnapshot?.readinessByNodeId &&
    typeof planningSnapshot.readinessByNodeId === 'object' ?
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

class MembershipPublicationCoordinatorReconcile extends
  MembershipPublicationCoordinatorPersist {
  // CL-001 variant D: pull this node's CDC-propagated control_plane_publications
  // cache forward from the authoritative owner so a non-write-leader that missed
  // the leader's point-in-time CDC fan-out does not stay permanently stale. Reuses
  // the CL-014 catch-up (hydrateCdcPropagatedTablesFromAuthority), scoped to the
  // publications table, best-effort, and rate-limited to one owner read per cooldown
  // (a deferring non-leader runs this on every reconcile tick). Never throws; a
  // partitioned node's read fails-soft inside hydrate (recorded, skipped).
  async refreshDeferredPublicationsCacheFromAuthority() {
    const service = this.cdcIntegrationService;
    if (
      !service ||
      typeof service.hydrateCdcPropagatedTablesFromAuthority !== 'function'
    ) {
      return null;
    }
    const nowMs = typeof this.now === 'function' ? this.now() : Date.now();
    const lastMs = this._lastDeferredPublicationsCatchupAtMs;
    if (
      Number.isFinite(lastMs) &&
      nowMs - lastMs < DEFERRED_PUBLICATIONS_CATCHUP_COOLDOWN_MS
    ) {
      return null;
    }
    this._lastDeferredPublicationsCatchupAtMs = nowMs;
    try {
      return await service.hydrateCdcPropagatedTablesFromAuthority({
        tables: [TABLES.CONTROL_PLANE_PUBLICATIONS],
        // Route the catch-up read through the authoritative owner, not this
        // node's own (possibly stale) local publications replica. A rejoined
        // follower whose local replica stopped applying committed entries would
        // otherwise re-read its own frozen epoch forever (the variant-D
        // recurrence). Local fallback is preserved (prefer, not require), so a
        // partitioned node still fails soft. See CL-001 "VARIANT D DEEPER LAYER".
        // The owner-preferred mode alone can route to any owner replica, so the
        // frozen node could still self-serve stale publications. The same token
        // therefore pins the read to the publications leader, which holds the
        // authoritative epoch (it serves on
        // the CONTROL_PLANE_RECOVERY_ELIGIBLE dimension even while recovery is
        // pending). This is the variant-D frozen-follower fix.
        readAuthority: buildControlPlaneReadAuthority({
          authoritativeReadMode:
            CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED,
          leaderMode: CONTROL_PLANE_READ_LEADER_MODE.PREFERRED,
        }),
      });
    } catch (error) {
      this.logger?.warn?.(MEMBERSHIP_DEFERRED_PUBLICATIONS_CATCHUP_FAILED_MSG, {
        nodeId: this.nodeId,
        error: error?.message || String(error),
      });
      return null;
    }
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
      await this.refreshDeferredPublicationsCacheFromAuthority();
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
                typeof candidate.priorityPartitionSummary === 'object') ||
              (candidate.membershipLifecycleSummary &&
                typeof candidate.membershipLifecycleSummary === 'object'));
            const shouldRefreshMembershipLifecycleMetadata =
              candidate.membershipLifecycleSummaryChanged === true &&
              candidate.membershipLifecycleSummary &&
              typeof candidate.membershipLifecycleSummary === 'object';
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
      // CL-001 variant D (re-diagnosis 2026-06-18): the variant-D catch-up lives in
      // reconcileClusterMembership's not-write-leader defer branch, but that branch is
      // reached on a follower ONLY on demand (reconcileQueue). This periodic driver is
      // the ONLY loop that ticks every node every interval, yet it returned here without
      // ever reaching the catch-up — so a follower that missed the leader's point-in-time
      // CDC fan-out and settled at `steady_published` (nothing left to enqueue a reconcile
      // reason) stayed FROZEN at a stale committed epoch to teardown, surfacing as the
      // `publication_epochs_disagree` consistency mismatch. The catch-up's 5s cooldown ==
      // this driver's 5s interval: it was designed to be driven from here. Read-only +
      // local-cache-only + rate-limited + best-effort (never throws) → B4 single-writer
      // gate intact; a non-leader never writes/promotes/trims via this path.
      await this.refreshDeferredPublicationsCacheFromAuthority();
      return false;
    }
    this.assertSingleMembershipPartition();
    this.ownerMembershipReconcileInFlight = true;
    try {
      const planningSnapshot = await this.readPublicationPlanningSnapshot({
        readSource:
          MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED,
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
        ownerAckCompletionPendingNodeIds.length === 0
      ) {
        // CL-001 OWNER FACE (2026-06-19): the follower branches above catch up from
        // authority, but the owner path did NOT — so a rejoined node that re-acquired
        // publications leadership with a STALE cache reads its own frozen epoch, sees
        // missing=0, and SKIPs here forever (desired=committed=observed all equal-but-
        // stale: it BELIEVES it is steady). It then serves that stale epoch to the
        // consistency probe as `publication_epochs_disagree`. Before trusting no-deficit,
        // re-validate the local view against authority. refreshDeferredPublicationsCache
        // FromAuthority routes through the real partition leader (preferred
        // leader mode,
        // belief-independent) and only HYDRATES the local cache — it never writes/
        // promotes/trims, so the B4 single-writer gate is intact; any genuine deficit it
        // reveals is reconciled on a LATER tick AFTER leadership is re-resolved from the
        // freshened cache (a node that only wrongly believed it led steps back to the
        // follower path). Cooldown-gated, best-effort (never throws).
        await this.refreshDeferredPublicationsCacheFromAuthority();
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
   * gated behind the very progress it exists to create. No-op only when
   * explicitly disabled; each tick gates on the publications write-leader
   * predicate before doing work.
   */
  startOwnerMembershipDriver(options = {}) {
    if (this.ownerMembershipDriverTimer) {
      return;
    }
    const enabled = options.enabled ?? true;
    if (!enabled) {
      return;
    }
    const intervalMs =
      options.intervalMs || OWNER_MEMBERSHIP_DRIVER_INTERVAL_MS;
    // DT4 seam: the owner-driver interval runs on a TimeSource (default
    // RealTimeSource = the platform setInterval/clearInterval, byte-identical) so the
    // convergence harness can advance it deterministically. Store the matching clear
    // so stopOwnerMembershipDriver tears down a virtual timer too. Explicit
    // setIntervalFn/clearIntervalFn options keep precedence.
    const timeSource = resolveTimeSource(options);
    const setIntervalFn =
      typeof options.setIntervalFn === 'function' ?
        options.setIntervalFn :
        (fn, ms) => timeSource.setInterval(fn, ms);
    this.ownerMembershipDriverClearInterval =
      typeof options.clearIntervalFn === 'function' ?
        options.clearIntervalFn :
        (handle) => timeSource.clearInterval(handle);
    this.ownerMembershipDriverTimer = setIntervalFn(() => {
      this.driveOwnerMembershipReconcile().catch(() => {});
    }, intervalMs);
    if (typeof this.ownerMembershipDriverTimer?.unref === 'function') {
      this.ownerMembershipDriverTimer.unref();
    }
  }

  stopOwnerMembershipDriver() {
    if (this.ownerMembershipDriverTimer) {
      const clearIntervalFn =
        typeof this.ownerMembershipDriverClearInterval === 'function' ?
          this.ownerMembershipDriverClearInterval :
          clearInterval;
      clearIntervalFn(this.ownerMembershipDriverTimer);
      this.ownerMembershipDriverTimer = null;
    }
    // Stop the SWIM probe loop alongside the owner driver (inert if no runtime
    // was wired in).
    if (typeof this.membershipSwimRuntime?.stop === 'function') {
      this.membershipSwimRuntime.stop();
    }
    // Clearing the 5s interval alone does not stop the reconcile queue: it
    // self-perpetuates via its own retry-drain (OwnerKeyReconcileQueue
    // _scheduleRetryDrain), and an in-flight persistPublicationRow keeps
    // re-driving a ref'd retryable-control-plane-write backoff timer that holds
    // the event loop open long after teardown. Shut the queue down so drain()
    // bails (stopped=true) and pending retry timers are cleared. This method is
    // teardown-only (seed stopAndClearControlPlaneServices + JoinCleanupHandler).
    if (typeof this.reconcileQueue?.shutdown === 'function') {
      this.reconcileQueue.shutdown();
    }
  }
}

export {
  ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME,
  MembershipPublicationCoordinatorReconcile,
  shouldDeferMembershipReconcileToWriteLeader,
  NOT_PUBLICATIONS_WRITE_LEADER_REASON,
};
