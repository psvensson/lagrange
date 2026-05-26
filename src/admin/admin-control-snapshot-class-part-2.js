/**
 * Control snapshot repair orchestration for the admin WebSocket API.
 *
 * The parent AdminWebSocketAPI instantiates one AdminControlSnapshot and
 * delegates all control-snapshot-related calls to it. Cohesive repair and
 * publication handoff helpers live in semantic sibling modules.
 */
import {NUM, TYPEOF} from '../constants/index.js';
import {AUTHORITATIVE_REPAIR_TRIGGER} from './admin-authoritative-repair-policy.js';
import {
  ADMIN_CACHE_DUMP,
  ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE,
} from './admin-constants.js';
import {
  hasAuthoritativeRepairTrigger,
  isReplicaOperationsOnlyRepairScope,
  isReplicaOperationsOnlyTableSet,
  shouldAttemptAuthoritativeRepair,
} from './admin-authoritative-repair-evaluation.js';
import {
  hasPublicationActiveGateOwnerReconcileSignal,
  selectPublicationActiveGateHandoffContract,
} from '../control-plane/publication-active-gate-handoff-contract.js';
import {AdminControlSnapshotPart1} from './admin-control-snapshot-class-part-1.js';
import {
  ADMIN_CONTROL_SNAPSHOT_LITERAL,
  CONTROL_SNAPSHOT_ABSENT_DEFERRED_SNAPSHOT,
  CONTROL_SNAPSHOT_AUTHORITATIVE_REPAIR_METHOD,
  CONTROL_SNAPSHOT_LOCAL_TRANSPORT_FIELD,
  CONTROL_SNAPSHOT_REFRESH_OPTION_FIELD,
  CONTROL_SNAPSHOT_REPAIR_REASON,
  CONTROL_SNAPSHOT_REPAIR_TIMEOUT_OPTION,
  appendControlSnapshotRepairEvaluationTriggerCode,
  attachAuthoritativeRepairDiagnostics,
  buildAuthoritativeControlSnapshotRepairFailure,
  buildRepairFailureLocalSnapshotOptions,
  hasDeferredRepairLocalControlSnapshotCoverage,
  hasForcedRepairDeferredFailureCause,
  hasOnlyLeaderResolutionGapRepairCause,
  hasPressureOrTimeoutRepairCause,
  isRecoverableControlSnapshotPublicationReadError,
  isReadyLocalTransportDiagnostic,
  resolveAuthoritativeRepairTimeoutMs,
  resolveControlSnapshotDeferredRepairTriggerCode,
  resolveControlSnapshotRepairFailureDetail,
  selectDeferredRepairLocalControlSnapshot,
  shouldAttemptForcedRepairFailureLocalFallback,
} from './admin-control-snapshot-repair-diagnostics.js';
import {
  CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD,
  attachMembershipPublicationHandoffOutcome,
  attachOrdinaryRepairDeferralDiagnostics,
  buildControlSnapshotHandoffDeferredOptions,
  buildControlSnapshotHandoffProgressOptions,
  buildControlSnapshotHandoffRefreshDecision,
  buildControlSnapshotHandoffRefreshResult,
  buildControlSnapshotHandoffRetryOptions,
  isVisibleMembershipPublicationHandoffOutcome,
  selectMembershipPublicationHandoffOutcome,
} from './admin-control-snapshot-publication-handoff.js';
// ── AdminControlSnapshot class ──────────────────────────────────────────────
/**
 * Control snapshot builder.
 * Receives all required dependencies via constructor injection.
 * Cross-module callbacks (partition services resolution) are injected
 * as functions so this module has no back-reference to AdminWebSocketAPI.
 */
class AdminControlSnapshotPart2 extends AdminControlSnapshotPart1 {
  async buildForcedRepairFailureLocalFallbackSnapshot(options = {}) {
    try {
      return await this.buildLocalControlSnapshot(
        buildRepairFailureLocalSnapshotOptions(options),
      );
    } catch (_error) {
      return CONTROL_SNAPSHOT_ABSENT_DEFERRED_SNAPSHOT;
    }
  }

  async resolveForcedRepairFailureDeferredSnapshot(
    localSnapshot = null,
    options = {},
  ) {
    if (
      shouldAttemptForcedRepairFailureLocalFallback({
        forceAuthoritativeRepair: options.forceAuthoritativeRepair,
        repair: options.repair,
      }) !== true
    ) {
      return CONTROL_SNAPSHOT_ABSENT_DEFERRED_SNAPSHOT;
    }
    let deferredSnapshot = selectDeferredRepairLocalControlSnapshot(
      localSnapshot,
      options.repairEvaluation,
    );
    if (!deferredSnapshot) {
      const fallbackSnapshot =
        await this.buildForcedRepairFailureLocalFallbackSnapshot(options);
      const fallbackEvaluation =
        this.evaluateAuthoritativeControlSnapshotRepair(fallbackSnapshot, options);
      deferredSnapshot =
        selectDeferredRepairLocalControlSnapshot(
          fallbackSnapshot,
          fallbackEvaluation,
        );
    }
    if (!deferredSnapshot) {
      return CONTROL_SNAPSHOT_ABSENT_DEFERRED_SNAPSHOT;
    }
    const deferredEvaluation =
      this.evaluateAuthoritativeControlSnapshotRepair(deferredSnapshot, options);
    const finalEvaluation =
      appendControlSnapshotRepairEvaluationTriggerCode(
        deferredEvaluation,
        resolveControlSnapshotDeferredRepairTriggerCode(options.repair),
      );
    const triggeredSnapshot =
      await this.triggerMembershipPublicationHandoffOwnerCommand(
        attachOrdinaryRepairDeferralDiagnostics(
          deferredSnapshot,
          true,
        ),
        options,
      );
    const handoffRefresh =
      await this.prepareVisibleMembershipPublicationHandoffRefresh(
        triggeredSnapshot,
        options,
      );
    return this.resolveSharedControlSnapshot(
      handoffRefresh.refreshed === true ?
        handoffRefresh.snapshot :
        attachOrdinaryRepairDeferralDiagnostics(
          handoffRefresh.snapshot,
          true,
        ),
      handoffRefresh.refreshed === true ?
        buildControlSnapshotHandoffProgressOptions(options) :
        buildControlSnapshotHandoffRetryOptions(
          handoffRefresh.snapshot,
          {
            ...options,
            observationMode:
              ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
            repairEvaluation: finalEvaluation,
            repairAttempted: true,
            repairDeferred: true,
            retryAfterMs: options.repair?.retryAfterMs,
          },
        ),
    );
  }

  async prepareVisibleMembershipPublicationHandoffRefresh(
    snapshot = null,
    options = {},
  ) {
    const outcome = selectMembershipPublicationHandoffOutcome(snapshot);
    if (isVisibleMembershipPublicationHandoffOutcome(outcome) !== true) {
      return buildControlSnapshotHandoffRefreshResult(snapshot, false);
    }
    const controlPlaneDiagnostics =
      snapshot?.[CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD];
    const publicationActiveGateHandoff =
      selectPublicationActiveGateHandoffContract(controlPlaneDiagnostics) ||
      options[
        CONTROL_SNAPSHOT_REFRESH_OPTION_FIELD.PUBLICATION_ACTIVE_GATE_HANDOFF
      ];
    let refreshedSnapshot = null;
    try {
      refreshedSnapshot = await this.buildLocalControlSnapshot({
        ...options,
        [CONTROL_SNAPSHOT_REFRESH_OPTION_FIELD
          .PREFER_AUTHORITATIVE_PUBLICATION_READ]: true,
        [CONTROL_SNAPSHOT_REFRESH_OPTION_FIELD
          .ALLOW_AUTHORITATIVE_READINESS_REFRESH]: false,
        [CONTROL_SNAPSHOT_REFRESH_OPTION_FIELD
          .RECONCILE_AUTHORITATIVE_MEMBERSHIP_PUBLICATION]: false,
        ...(publicationActiveGateHandoff ?
          {
            [CONTROL_SNAPSHOT_REFRESH_OPTION_FIELD
              .PUBLICATION_ACTIVE_GATE_HANDOFF]: publicationActiveGateHandoff,
          } :
          {}),
      });
    } catch (_error) {
      return buildControlSnapshotHandoffRefreshResult(snapshot, false);
    }
    const refreshedWithOutcome =
      attachMembershipPublicationHandoffOutcome(refreshedSnapshot, outcome);
    const refreshDecision = buildControlSnapshotHandoffRefreshDecision(
      snapshot,
      refreshedWithOutcome,
    );
    return buildControlSnapshotHandoffRefreshResult(
      refreshDecision.refreshed === true ? refreshedWithOutcome : snapshot,
      refreshDecision.refreshed,
    );
  }

  async triggerMembershipPublicationHandoffOwnerCommand(
    snapshot = null,
    options = {},
  ) {
    const controlPlaneDiagnostics =
      snapshot?.[CONTROL_SNAPSHOT_CONTROL_PLANE_DIAGNOSTICS_FIELD];
    if (
      hasPublicationActiveGateOwnerReconcileSignal(
        controlPlaneDiagnostics,
      ) !== true ||
      typeof this.reconcileAuthoritativeMembershipPublicationFromHandoff !==
        TYPEOF.FUNCTION
    ) {
      return snapshot;
    }
    const publicationActiveGateHandoff =
      selectPublicationActiveGateHandoffContract(controlPlaneDiagnostics) ||
      controlPlaneDiagnostics;
    try {
      const outcome =
        await this.reconcileAuthoritativeMembershipPublicationFromHandoff(
          publicationActiveGateHandoff,
          {
            ...options,
            reconcileAuthoritativeMembershipPublication: true,
          },
        );
      return attachMembershipPublicationHandoffOutcome(snapshot, outcome);
    } catch (_error) {
      const failureOutcome =
        typeof this.buildMembershipPublicationHandoffOwnerCommandErrorOutcome ===
          TYPEOF.FUNCTION ?
          this.buildMembershipPublicationHandoffOwnerCommandErrorOutcome(
            _error,
            publicationActiveGateHandoff,
          ) :
          null;
      return attachMembershipPublicationHandoffOutcome(
        snapshot,
        failureOutcome,
      );
    }
  }

  /**
   * Resolve one local control snapshot with optional authoritative
   * cache repair when partition topology appears incomplete.
   * @return {Promise<Object>}
   */
  async resolveLocalControlSnapshot(options = {}) {
    const forceAuthoritativeRepair = options.forceAuthoritativeRepair === true;
    const allowAuthoritativeRepair = options.allowAuthoritativeRepair === true;
    let snapshot = null;
    try {
      snapshot = await this.buildLocalControlSnapshot(options);
    } catch (error) {
      if (
        !forceAuthoritativeRepair ||
        !this.canRunAuthoritativeControlSnapshotRepair() ||
        !isRecoverableControlSnapshotPublicationReadError(error)
      ) {
        throw error;
      }
      let repair = null;
      try {
        repair = await this[CONTROL_SNAPSHOT_AUTHORITATIVE_REPAIR_METHOD]({
          reason: CONTROL_SNAPSHOT_REPAIR_REASON,
          bypassReuse: true,
          [CONTROL_SNAPSHOT_REPAIR_TIMEOUT_OPTION]: resolveAuthoritativeRepairTimeoutMs({
            forceAuthoritativeRepair,
            [CONTROL_SNAPSHOT_REPAIR_TIMEOUT_OPTION]:
              options[CONTROL_SNAPSHOT_REPAIR_TIMEOUT_OPTION],
          }),
        });
      } catch (repairError) {
        const forcedRepairDeferredSnapshot =
          await this.resolveForcedRepairFailureDeferredSnapshot(null, {
            ...options,
            forceAuthoritativeRepair,
            repair: repairError,
          });
        if (forcedRepairDeferredSnapshot) {
          return forcedRepairDeferredSnapshot;
        }
        throw buildAuthoritativeControlSnapshotRepairFailure(
          repairError?.message || repairError,
          repairError,
        );
      }
      if (repair?.applied !== true) {
        const forcedRepairDeferredSnapshot =
          await this.resolveForcedRepairFailureDeferredSnapshot(null, {
            ...options,
            forceAuthoritativeRepair,
            repair,
          });
        if (forcedRepairDeferredSnapshot) {
          return forcedRepairDeferredSnapshot;
        }
        throw buildAuthoritativeControlSnapshotRepairFailure(
          resolveControlSnapshotRepairFailureDetail(repair),
          repair,
        );
      }
      const repairedSnapshot = await this.buildLocalControlSnapshot({
        ...options,
        preferAuthoritativePublicationRead: true,
        reconcileAuthoritativeMembershipPublication: true,
      });
      const repairedEvaluation =
        this.evaluateAuthoritativeControlSnapshotRepair(repairedSnapshot, options);
      return this.resolveSharedControlSnapshot(
        attachAuthoritativeRepairDiagnostics(repairedSnapshot, {
          repair,
          repairEvaluation: repairedEvaluation,
          forceAuthoritativeRepair,
        }),
        {
          ...options,
          observationMode:
            ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.FORCED_REPAIR,
          repair,
          repairEvaluation: repairedEvaluation,
        },
      );
    }
    const repairEvaluation =
      this.evaluateAuthoritativeControlSnapshotRepair(snapshot, options);
    if (!this.canRunAuthoritativeControlSnapshotRepair()) {
      const triggeredSnapshot =
        await this.triggerMembershipPublicationHandoffOwnerCommand(
          snapshot,
          options,
        );
      const handoffRefresh =
        await this.prepareVisibleMembershipPublicationHandoffRefresh(
          triggeredSnapshot,
          options,
        );
      const deferredHandoffOptions =
        buildControlSnapshotHandoffDeferredOptions(
          handoffRefresh.snapshot,
          options,
        );
      return this.resolveSharedControlSnapshot(
        handoffRefresh.snapshot,
        deferredHandoffOptions,
      );
    }
    if (
      forceAuthoritativeRepair !== true &&
      !shouldAttemptAuthoritativeRepair({
        repairEvaluation,
        forceAuthoritativeRepair,
        allowAuthoritativeRepair,
      })
    ) {
      const triggeredSnapshot =
        await this.triggerMembershipPublicationHandoffOwnerCommand(
          snapshot,
          options,
        );
      const handoffRefresh =
        await this.prepareVisibleMembershipPublicationHandoffRefresh(
          triggeredSnapshot,
          options,
        );
      const deferredHandoffOptions =
        buildControlSnapshotHandoffDeferredOptions(
          handoffRefresh.snapshot,
          options,
        );
      const shouldEmitDeferredObservation =
        deferredHandoffOptions !== options ||
        repairEvaluation?.shouldRepair === true;
      const sharedSnapshotOptions = handoffRefresh.refreshed === true ?
        options :
        (shouldEmitDeferredObservation ?
          {
            ...deferredHandoffOptions,
            repairEvaluation,
            repairDeferred: true,
            observationMode:
              ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
          } :
          options);
      return this.resolveSharedControlSnapshot(
        handoffRefresh.refreshed === true ?
          handoffRefresh.snapshot :
          attachOrdinaryRepairDeferralDiagnostics(
            handoffRefresh.snapshot,
            repairEvaluation?.shouldRepair === true,
          ),
        sharedSnapshotOptions,
      );
    }
    const canDegradeRepairFailure =
      this.canDegradeAuthoritativeControlSnapshotRepairFailure({
        forceAuthoritativeRepair,
        repairEvaluation,
      });
    let repair = null;
    try {
      repair = await this[CONTROL_SNAPSHOT_AUTHORITATIVE_REPAIR_METHOD]({
        reason: CONTROL_SNAPSHOT_REPAIR_REASON,
        bypassReuse: forceAuthoritativeRepair,
        [CONTROL_SNAPSHOT_REPAIR_TIMEOUT_OPTION]: resolveAuthoritativeRepairTimeoutMs({
          forceAuthoritativeRepair,
          [CONTROL_SNAPSHOT_REPAIR_TIMEOUT_OPTION]:
            options[CONTROL_SNAPSHOT_REPAIR_TIMEOUT_OPTION],
        }),
        triggerCodes: repairEvaluation?.triggerCodes,
      });
    } catch (error) {
      const canDegradeThrownRepairFailure =
        canDegradeRepairFailure === true ||
        this.canDegradeAuthoritativeControlSnapshotRepairFailure({
          forceAuthoritativeRepair,
          localSnapshot: snapshot,
          repair: error,
          repairEvaluation,
        });
      const forcedRepairDeferredSnapshot =
        await this.resolveForcedRepairFailureDeferredSnapshot(snapshot, {
          ...options,
          forceAuthoritativeRepair,
          repair: error,
          repairEvaluation,
        });
      if (forcedRepairDeferredSnapshot) {
        return forcedRepairDeferredSnapshot;
      }
      if (canDegradeThrownRepairFailure) {
        const triggeredSnapshot =
          await this.triggerMembershipPublicationHandoffOwnerCommand(
            snapshot,
            options,
          );
        const handoffRefresh =
          await this.prepareVisibleMembershipPublicationHandoffRefresh(
            triggeredSnapshot,
            options,
          );
        return this.resolveSharedControlSnapshot(
          handoffRefresh.refreshed === true ?
            handoffRefresh.snapshot :
            attachOrdinaryRepairDeferralDiagnostics(
              handoffRefresh.snapshot,
              true,
            ),
          handoffRefresh.refreshed === true ?
            buildControlSnapshotHandoffProgressOptions(options) :
            buildControlSnapshotHandoffRetryOptions(
              handoffRefresh.snapshot,
              {
                ...options,
                observationMode:
                  ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
                repairEvaluation,
                repairAttempted: true,
                repairDeferred: true,
                retryAfterMs: error?.retryAfterMs,
              },
            ),
        );
      }
      throw buildAuthoritativeControlSnapshotRepairFailure(
        error?.message || error || ADMIN_CONTROL_SNAPSHOT_LITERAL.UNKNOWN_ERROR,
        error,
      );
    }
    if (repair?.applied !== true) {
      const forcedRepairDeferredSnapshot =
        await this.resolveForcedRepairFailureDeferredSnapshot(snapshot, {
          ...options,
          forceAuthoritativeRepair,
          repair,
          repairEvaluation,
        });
      if (forcedRepairDeferredSnapshot) {
        return forcedRepairDeferredSnapshot;
      }
      const canDegradeUnappliedRepair =
        canDegradeRepairFailure === true ||
        this.canDegradeAuthoritativeControlSnapshotRepairFailure({
          forceAuthoritativeRepair,
          localSnapshot: snapshot,
          repairEvaluation,
          repair,
        });
      if (canDegradeUnappliedRepair) {
        const triggeredSnapshot =
          await this.triggerMembershipPublicationHandoffOwnerCommand(
            snapshot,
            options,
          );
        const handoffRefresh =
          await this.prepareVisibleMembershipPublicationHandoffRefresh(
            triggeredSnapshot,
            options,
          );
        return this.resolveSharedControlSnapshot(
          handoffRefresh.refreshed === true ?
            handoffRefresh.snapshot :
            attachOrdinaryRepairDeferralDiagnostics(
              handoffRefresh.snapshot,
              true,
            ),
          handoffRefresh.refreshed === true ?
            buildControlSnapshotHandoffProgressOptions(options) :
            buildControlSnapshotHandoffRetryOptions(
              handoffRefresh.snapshot,
              {
                ...options,
                observationMode:
                  ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.REPAIR_DEFERRED,
                repair,
                repairEvaluation,
                repairAttempted: true,
                repairDeferred: true,
              },
            ),
        );
      }
      throw buildAuthoritativeControlSnapshotRepairFailure(
        resolveControlSnapshotRepairFailureDetail(repair),
        repair,
      );
    }
    const repairedSnapshot = await this.buildLocalControlSnapshot({
      ...options,
      preferAuthoritativePublicationRead: true,
      reconcileAuthoritativeMembershipPublication: true,
    });
    const repairedEvaluation =
      this.evaluateAuthoritativeControlSnapshotRepair(repairedSnapshot, options);
    return this.resolveSharedControlSnapshot(
      attachAuthoritativeRepairDiagnostics(repairedSnapshot, {
        repair,
        repairEvaluation: repairedEvaluation,
        forceAuthoritativeRepair,
      }),
      {
        ...options,
        observationMode: forceAuthoritativeRepair ?
          ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.FORCED_REPAIR :
          ADMIN_CONTROL_SNAPSHOT_OBSERVATION_MODE.SCHEDULED_REPAIR,
        repair,
        repairEvaluation: repairedEvaluation,
      },
    );
  }
  canDegradeAuthoritativeControlSnapshotRepairFailure(options = {}) {
    if (
      options.forceAuthoritativeRepair === true &&
      hasForcedRepairDeferredFailureCause(options.repair) &&
      (hasDeferredRepairLocalControlSnapshotCoverage(
        options.localSnapshot,
        options.repairEvaluation,
      ) || isReadyLocalTransportDiagnostic(
        options.repair?.[CONTROL_SNAPSHOT_LOCAL_TRANSPORT_FIELD],
      ))
    ) {
      return true;
    }
    if (
      options.forceAuthoritativeRepair !== true &&
      hasOnlyLeaderResolutionGapRepairCause(options.repair) &&
      isReadyLocalTransportDiagnostic(
        options.repair?.[CONTROL_SNAPSHOT_LOCAL_TRANSPORT_FIELD],
      )
    ) {
      return true;
    }
    if (
      options.forceAuthoritativeRepair !== true &&
      hasForcedRepairDeferredFailureCause(options.repair) &&
      isReadyLocalTransportDiagnostic(
        options.repair?.[CONTROL_SNAPSHOT_LOCAL_TRANSPORT_FIELD],
      )
    ) {
      return true;
    }
    if (
      hasAuthoritativeRepairTrigger(
        options.repairEvaluation,
        AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_NODE_COVERAGE_GAP,
      ) ||
      options.repairEvaluation?.nodeCoverage?.activeProjection
        ?.hasCoverageGap === true
    ) {
      return false;
    }
    if (isReplicaOperationsOnlyRepairScope(options.repairEvaluation)) {
      return true;
    }
    const failedTables = Array.isArray(options.repair?.failedTables) ?
      options.repair.failedTables.filter(
        (value) => typeof value === TYPEOF.STRING && value.length > NUM.ZERO,
      ) :
      ADMIN_CACHE_DUMP.EMPTY;
    return isReplicaOperationsOnlyTableSet(failedTables);
  }
  resolveControlSnapshotActiveNodeIds(
    nodeRows = [],
    serviceRows = [],
    nodeEndpointRows = [],
    controlPlaneDiagnostics = null,
    publicationRows = [],
  ) {
    return this.resolveControlSnapshotNodeViews(
      nodeRows,
      serviceRows,
      nodeEndpointRows,
      controlPlaneDiagnostics,
      publicationRows,
    ).authoritativeActiveNodeIds;
  }
}
export {AdminControlSnapshotPart2};
