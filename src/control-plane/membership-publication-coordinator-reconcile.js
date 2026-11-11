import {readUpperStateField} from '../utils/state-field-read.js';
import {CDC_CATCHUP_TRIGGER} from '../cdc/cdc-integration-service-authoritative-catchup.js';
import {
  TABLES,
} from '../constants/index.js';
import {resolveTimeSource} from '../time/time-source.js';
import {
  CONTROL_PLANE_CONVERGENCE_CLASS,
} from './control-plane-error-classification.js';
import {normalizeControlPlanePublicationRow} from './system-row-normalizers.js';
import {
  MEMBERSHIP_PUBLICATION_STATUS,
  MEMBERSHIP_PUBLICATION_READ_SOURCE,
  MEMBERSHIP_PUBLICATION_WORKFLOW_STEP,
  PUBLICATION_WORKFLOW_REASON,
} from './membership-publication-row-contract.js';
import {
  normalizeNodeIdList,
} from './membership-publication-row-helpers.js';
import {
  buildMembershipPublicationRow,
} from './membership-publication-planning-evidence.js';
import {isPublicationWriteLanded} from
  './owners/control-plane-publication-change.js';
import {
  buildReconcilePublicationWriteAnswer,
  requeueHeldPublicationWrite,
} from './membership-publication-reconcile-write.js';
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
import {buildPublicationActiveGateMembershipConvergence} from
  './publication-active-gate-handoff-contract-helpers.js';
import {
  CONVERGENCE_DECISION,
  CONVERGENCE_DECISION_TRACE_MSG,
  CONVERGENCE_OUTCOME,
  CONVERGENCE_REASON,
  CONVERGENCE_TRACE_LEVEL,
  DEFERRED_PROPAGATED_CATCHUP_MAX_ATTEMPTS_PER_TABLE,
  DEFERRED_PROPAGATED_CATCHUP_OUTCOME,
  DEFERRED_PROPAGATED_CATCHUP_TABLES,
  DEFERRED_PROPAGATED_CATCHUP_COOLDOWN_MS,
  DEFERRED_PUBLICATIONS_CATCHUP_COOLDOWN_MS,
  EMPTY_PUBLICATION_CANDIDATE_REASON,
  MEMBERSHIP_DEFERRED_PROPAGATED_CATCHUP_FAILED_MSG,
  MEMBERSHIP_DEFERRED_PUBLICATIONS_CATCHUP_FAILED_MSG,
  MEMBERSHIP_MULTI_PARTITION_MSG,
  MEMBERSHIP_RECONCILE_DEFERRED_NOT_WRITE_LEADER_MSG,
  NOT_PUBLICATIONS_WRITE_LEADER_REASON,
  OWNER_MEMBERSHIP_DRIVER_ERROR_MSG,
  OWNER_MEMBERSHIP_DRIVER_INTERVAL_MS,
  OWNER_MEMBERSHIP_DRIVER_PREDICATE_MSG,
  OWNER_MEMBERSHIP_DRIVER_RAN_MSG,
  OWNER_MEMBERSHIP_DRIVER_SNAP_MSG,
  OWNER_MEMBERSHIP_RECONCILE_TIMEOUT_MS,
  PRIORITY_SUMMARY_REFRESHED_REASON,
  buildPublicationReadinessTraceFields,
  hasPrioritySummaryRefreshClearedGap,
  reportOwnerMembershipReconcileSpent,
  requestOwedPriorityCensus,
  resolveDeferredPropagatedCatchupCooldownMs,
  resolveOwnerAckCompletionPendingNodeIds,
  shouldDeferMembershipReconcileToWriteLeader,
  shouldRefreshPublicationRow,
} from './membership-publication-coordinator-reconcile-helpers.js';

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
    if (this.deferredPublicationsCatchupInFlight) {
      return this.deferredPublicationsCatchupInFlight;
    }
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
    const runPromise = (async () => {
      try {
        return await service.hydrateCdcPropagatedTablesFromAuthority({
          tables: [TABLES.CONTROL_PLANE_PUBLICATIONS],
          trigger: CDC_CATCHUP_TRIGGER.PUBLICATIONS_SWEEP,
          readAuthority: buildControlPlaneReadAuthority({
            authoritativeReadMode:
              CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED,
            leaderMode: CONTROL_PLANE_READ_LEADER_MODE.PREFERRED,
          }),
        });
      } catch (error) {
        this.logger?.warn?.(
          MEMBERSHIP_DEFERRED_PUBLICATIONS_CATCHUP_FAILED_MSG,
          {
            nodeId: this.nodeId,
            error: error?.message || String(error),
          },
        );
        return null;
      } finally {
        if (this.deferredPublicationsCatchupInFlight === runPromise) {
          this.deferredPublicationsCatchupInFlight = null;
        }
      }
    })();
    this.deferredPublicationsCatchupInFlight = runPromise;
    return runPromise;
  }

  // The sibling sweep for the routing-relevant CDC-propagated system tables (the
  // six in DEFERRED_PROPAGATED_CATCHUP_TABLES). Same deferral tick, own cooldown
  // (30s, vs 5s for the single publications row), one attempt per table,
  // leader-preferred owner read, best-effort: a row this node missed in the
  // leader's point-in-time fan-out converges within one cooldown instead of
  // never, and a leader-witnessed complete read may also sweep a missed DELETE.
  // Never throws; returns a typed outcome.
  async refreshDeferredPropagatedCachesFromAuthority() {
    if (this.deferredPropagatedCatchupInFlight) {
      return this.deferredPropagatedCatchupInFlight;
    }
    const service = this.cdcIntegrationService;
    if (
      !service ||
      typeof service.hydrateCdcPropagatedTablesFromAuthority !== 'function' ||
      DEFERRED_PROPAGATED_CATCHUP_TABLES.length === 0
    ) {
      return DEFERRED_PROPAGATED_CATCHUP_OUTCOME.CATCHUP_UNAVAILABLE;
    }
    const nowMs = typeof this.now === 'function' ? this.now() : Date.now();
    const lastMs = this._lastDeferredPropagatedCatchupAtMs;
    const cooldownMs = resolveDeferredPropagatedCatchupCooldownMs(
      this.systemTableCache,
      service,
    );
    if (
      Number.isFinite(lastMs) &&
      nowMs - lastMs < cooldownMs
    ) {
      return DEFERRED_PROPAGATED_CATCHUP_OUTCOME.COOLDOWN_ACTIVE;
    }
    this._lastDeferredPropagatedCatchupAtMs = nowMs;
    const runPromise = (async () => {
      try {
        return await service.hydrateCdcPropagatedTablesFromAuthority({
          tables: DEFERRED_PROPAGATED_CATCHUP_TABLES,
          trigger: cooldownMs === DEFERRED_PROPAGATED_CATCHUP_COOLDOWN_MS ?
            CDC_CATCHUP_TRIGGER.PROPAGATED_SWEEP : CDC_CATCHUP_TRIGGER.PROPAGATED_SWEEP_FAST,
          maxAttemptsPerTable:
            DEFERRED_PROPAGATED_CATCHUP_MAX_ATTEMPTS_PER_TABLE,
          readAuthority: buildControlPlaneReadAuthority({
            authoritativeReadMode:
              CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED,
            leaderMode: CONTROL_PLANE_READ_LEADER_MODE.PREFERRED,
          }),
        });
      } catch (error) {
        this.logger?.warn?.(MEMBERSHIP_DEFERRED_PROPAGATED_CATCHUP_FAILED_MSG, {
          nodeId: this.nodeId,
          error: error?.message || String(error),
        });
        return DEFERRED_PROPAGATED_CATCHUP_OUTCOME.READ_FAILED;
      } finally {
        if (this.deferredPropagatedCatchupInFlight === runPromise) {
          this.deferredPropagatedCatchupInFlight = null;
        }
      }
    })();
    this.deferredPropagatedCatchupInFlight = runPromise;
    return runPromise;
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
      await this.refreshDeferredPropagatedCachesFromAuthority();
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
            (readUpperStateField(latestPublicationRow?.status) ===
            MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ?
              latestPublicationRow :
              await this.getLatestPublishedPublicationRow(convergenceOptions));
          const candidate = await this.deriveClusterMembershipCandidate({
            ...convergenceOptions,
            latestPublicationRow,
            latestPublishedPublicationRow,
          });
          if (
            normalizeNodeIdList(candidate.publishedActiveNodeIds).length === 0
          ) {
            this._emitConvergenceDecisionTrace({
              decision: CONVERGENCE_DECISION.DEFER,
              reason: CONVERGENCE_REASON.EMPTY_CANDIDATE,
              ownerKey,
            });
            return {
              deferred: true,
              reason: EMPTY_PUBLICATION_CANDIDATE_REASON,
              ownerKey,
            };
          }
          const workflow = await this.ensureWorkflow(ownerKey, candidate);
          if (latestPublicationRow && candidate.changed !== true) {
            if (shouldRefreshPublicationRow(latestPublicationRow, candidate)) {
              const answer = buildReconcilePublicationWriteAnswer({
                publicationWrite: await this.refreshPublicationRow(
                  normalizeControlPlanePublicationRow(latestPublicationRow)
                    .publicationId,
                  {
                    priorityPartitionSummary:
                      candidate.priorityPartitionSummary,
                    membershipLifecycleSummary:
                      candidate.membershipLifecycleSummary,
                    acknowledgedNodeIds: candidate.acknowledgedNodeIds,
                  },
                  convergenceOptions,
                ),
                candidate,
                workflow,
              });
              if (
                answer.publicationRow &&
                hasPrioritySummaryRefreshClearedGap(
                  latestPublicationRow,
                  candidate,
                )
              ) {
                this.enqueueClusterMembershipReconcile(
                  PRIORITY_SUMMARY_REFRESHED_REASON,
                  {latestPublicationRow: answer.publicationRow},
                  {selfRequeue: {changed: PRIORITY_SUMMARY_REFRESHED_REASON}},
                );
              }
              return requeueHeldPublicationWrite(this, answer);
            }
            return {
              candidate,
              publicationRow:
                String(latestPublicationRow.status).toUpperCase() ===
                  MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ||
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
          const answer = buildReconcilePublicationWriteAnswer({
            publicationWrite: await this.admitPublicationRow(
              row,
              convergenceOptions,
            ),
            candidate,
            workflow,
          });
          if (!isPublicationWriteLanded(answer.publicationWrite)) {
            // No landed admission, no OPEN: the workflow stays DERIVING and
            // a write still owed is re-asked after the declared delay.
            return requeueHeldPublicationWrite(this, answer);
          }
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
          return answer;
        }),
    );
  }

  _emitConvergenceDecisionTrace(fields) {
    this.logger?.logConsoleOnly?.(
      CONVERGENCE_TRACE_LEVEL,
      CONVERGENCE_DECISION_TRACE_MSG,
      {nodeId: this.nodeId, ...fields},
    );
  }

  // The latest durable row still states its census NOT_DERIVED: ask for
  // the full reconcile that derives it, from the durable owner.
  _requestOwedPriorityCensus(latestPublicationRow, traceFields) {
    if (requestOwedPriorityCensus(
      this,
      latestPublicationRow,
      {readSource: MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED},
    )) {
      this._emitConvergenceDecisionTrace({
        decision: CONVERGENCE_DECISION.DRIVE,
        reason: CONVERGENCE_REASON.CENSUS_NOT_DERIVED,
        ...traceFields,
      });
    }
  }

  _buildPublicationReadinessTraceFields(handoffContract, planningSnapshot) {
    return buildPublicationReadinessTraceFields(handoffContract, planningSnapshot);
  }

  /**
   * Owner-driven membership reconcile (Workstream A). When this node is the
   * control_plane_publications write-leader and active nodes are unpublished,
   * drive the authoritative reconcile locally (Raft-quorum-committed). Timeout-
   * bounded so a slow/doomed reconcile can never wedge the in-flight guard.
   * @return {Promise<boolean>} whether a reconcile was driven.
   */
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
      await this.refreshDeferredPublicationsCacheFromAuthority();
      await this.refreshDeferredPropagatedCachesFromAuthority();
      return false;
    }
    this.assertSingleMembershipPartition();
    this.ownerMembershipReconcileInFlight = true;
    try {
      const planningSnapshot = await this.readPublicationPlanningSnapshot({
        readSource:
          MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED,
      });
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
      const publicationConvergence =
        buildPublicationActiveGateMembershipConvergence(planningSnapshot);
      const publicationEpoch = publicationConvergence.publicationEpoch;
      const ownerAckCompletionPendingNodeIds =
        resolveOwnerAckCompletionPendingNodeIds(planningSnapshot);
      const handoffContract = buildPublicationActiveGateHandoffContract({
        nodeRows: planningSnapshot.nodeRows,
        readinessByNodeId: planningSnapshot.readinessByNodeId,
        publicationConvergence,
        ownerAckCompletionPendingNodeIds,
      });
      const missingCount = handoffContract?.missingPublishedCount ?? 0;
      this._requestOwedPriorityCensus(planningSnapshot.latestPublicationRow, {
        leadershipTier: leadership.tier,
        publicationEpoch,
      });
      if (
        missingCount <= 0 &&
        ownerAckCompletionPendingNodeIds.length === 0
      ) {
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
      const reconcileStartedAtMs = Date.now();
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
      if (timedOut) {
        reportOwnerMembershipReconcileSpent(this, reconcileStartedAtMs, {
          missingCount,
          ownerAckCompletionPendingCount:
            ownerAckCompletionPendingNodeIds.length,
          publicationEpoch,
          leadershipTier: leadership.tier,
        });
      }
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
      await this.refreshDeferredPropagatedCachesFromAuthority();
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
    if (typeof this.membershipSwimRuntime?.stop === 'function') {
      this.membershipSwimRuntime.stop();
    }
    if (typeof this.reconcileQueue?.shutdown === 'function') {
      this.reconcileQueue.shutdown();
    }
  }
}

export {
  ACTIVE_GATE_MEMBERSHIP_PUBLICATION_RECONCILE_OUTCOME,
  EMPTY_PUBLICATION_CANDIDATE_REASON,
  MembershipPublicationCoordinatorReconcile,
  NOT_PUBLICATIONS_WRITE_LEADER_REASON,
  shouldDeferMembershipReconcileToWriteLeader,
};
