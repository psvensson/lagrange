import {buildPublicationRecoveryProtocolSnapshot} from '../../control-plane/recovery-protocol-snapshot.js';
import {buildBootstrapReadinessStage} from '../bootstrap-readiness-ladder.js';
import {
  BOOTSTRAP_API_LOG_MSG,
  BOOTSTRAP_API_PROBE_SCOPE,
  BOOTSTRAP_API_READINESS_FIELD,
} from '../bootstrap-api-constants.js';
import {LIFECYCLE_PHASE} from '../lifecycle-controller-constants.js';
import {
  isLocalQueryTransportReady,
} from '../shared/local-query-transport-readiness.js';

const BOOTSTRAP_READINESS_PROBE_DETAIL_METHODS = Object.freeze({
  buildReadinessProbeResponse(snapshot, options = {}) {
    const response = {
      ready: snapshot.ready === true,
      phase:
        typeof snapshot.phase === 'string' ?
          snapshot.phase :
          LIFECYCLE_PHASE.INIT,
      state: snapshot.state,
      reasons: Array.isArray(snapshot.reasons) ? snapshot.reasons : [],
      timestamp: snapshot.timestamp,
    };
    if (snapshot.draining === true) {
      response.draining = true;
    }
    if (Number.isFinite(snapshot.drainDeadlineMs)) {
      response.drainDeadlineMs = Math.floor(snapshot.drainDeadlineMs);
    }
    if (Number.isFinite(snapshot.retryAfterMs)) {
      response.retryAfterMs = snapshot.retryAfterMs;
    }
    this.appendReadinessProgressFields(response, snapshot);
    this.appendStartupRecoveryFields(response, snapshot, options);
    this.appendMembershipPublicationFields(response, snapshot);
    this.appendReadinessStageFields(response);
    if (
      typeof options.scope === 'string' &&
      options.scope.length > 0
    ) {
      response.scope = options.scope;
    }
    this.appendBootstrapJoinProjectionFields(response, options);
    return response;
  },
  appendBootstrapJoinProjectionFields(response, options = {}) {
    if (
      options.scope !== BOOTSTRAP_API_PROBE_SCOPE.BOOTSTRAP_JOIN ||
      !response ||
      typeof response !== 'object' ||
      !this.lastBootstrapJoinProjectionEvaluation ||
      typeof this.lastBootstrapJoinProjectionEvaluation !== 'object'
    ) {
      return response;
    }
    response[BOOTSTRAP_API_READINESS_FIELD.BOOTSTRAP_JOIN_PROJECTION] =
      this.lastBootstrapJoinProjectionEvaluation;
    return response;
  },
  appendReadinessProgressFields(response, snapshot) {
    if (
      !response ||
      typeof response !== 'object' ||
      !snapshot ||
      typeof snapshot !== 'object'
    ) {
      return response;
    }
    if (Number.isFinite(snapshot.phaseRank)) {
      response.phaseRank = Math.max(0, Math.floor(snapshot.phaseRank));
    }
    if (Number.isFinite(snapshot.transitionCount)) {
      response.readinessEpoch = Math.max(
        0,
        Math.floor(snapshot.transitionCount),
      );
    }
    if (Number.isFinite(snapshot.stableWindowMs)) {
      response.stableWindowMs = Math.max(
        0,
        Math.floor(snapshot.stableWindowMs),
      );
    }
    if (Number.isFinite(snapshot.stableElapsedMs)) {
      response.stableElapsedMs = Math.max(
        0,
        Math.floor(snapshot.stableElapsedMs),
      );
    }
    if (Number.isFinite(snapshot.stableSinceMs)) {
      response.stableSinceMs = Math.floor(snapshot.stableSinceMs);
    }
    return response;
  },
  appendStartupRecoveryFields(response, snapshot, options = {}) {
    if (
      !response ||
      typeof response !== 'object' ||
      !snapshot ||
      typeof snapshot !== 'object'
    ) {
      return response;
    }
    const startupAuthority = this.getStartupAuthoritySnapshot(
      response?.timestamp,
    );
    const priorityRecoveryHealth = this.getPriorityControlPlaneRecoveryHealth();
    const priorityRecoveryDetails =
      priorityRecoveryHealth?.details &&
      typeof priorityRecoveryHealth.details === 'object' ?
        priorityRecoveryHealth.details :
        null;
    const startupRecoverySnapshot =
      this.resolveStartupRecoveryEvaluationSnapshot(snapshot, options);
    const startupRecovery = this.evaluateStartupRecovery({
      snapshot: startupRecoverySnapshot,
      priorityRecoveryHealth,
      startupAuthority,
      allowBootstrapInitPriorityBypass:
        options.scope === BOOTSTRAP_API_PROBE_SCOPE.BOOTSTRAP_JOIN,
    });
    if (!startupRecovery) {
      this.appendPriorityRecoveryProtocolFields(
        response,
        priorityRecoveryDetails,
      );
      return response;
    }
    this.appendStartupRecoverySnapshotFields(response, startupRecovery);
    this.appendPriorityRecoveryProtocolFields(
      response,
      this.resolvePriorityRecoveryProtocolDetails(
        startupRecovery,
        priorityRecoveryDetails,
      ),
    );
    return response;
  },
  resolveStartupRecoveryEvaluationSnapshot(snapshot, options = {}) {
    if (
      options.scope !== BOOTSTRAP_API_PROBE_SCOPE.BOOTSTRAP_JOIN ||
      !this.lastBootstrapJoinProjectionEvaluation ||
      typeof this.lastBootstrapJoinProjectionEvaluation !== 'object' ||
      this.lastBootstrapJoinProjectionEvaluation.canProjectReady !== true ||
      !Array.isArray(this.lastBootstrapJoinProjectionEvaluation.reasons) ||
      this.lastBootstrapJoinProjectionEvaluation.reasons.length === 0
    ) {
      return snapshot;
    }
    return {
      ...snapshot,
      reasons: this.lastBootstrapJoinProjectionEvaluation.reasons,
    };
  },
  evaluateStartupRecovery(options) {
    const coordinator = this.getStartupRecoveryCoordinator();
    if (!coordinator || typeof coordinator.evaluate !== 'function') {
      return null;
    }
    const startupRecovery = coordinator.evaluate(options);
    return startupRecovery && typeof startupRecovery === 'object' ?
      startupRecovery :
      null;
  },
  appendStartupRecoverySnapshotFields(response, startupRecovery) {
    if (
      typeof startupRecovery.recoveryStage === 'string' &&
      startupRecovery.recoveryStage.length > 0
    ) {
      response.recoveryStage = startupRecovery.recoveryStage;
    }
    if (Number.isFinite(startupRecovery.recoveryStageRank)) {
      response.recoveryStageRank = Math.max(
        0,
        Math.floor(startupRecovery.recoveryStageRank),
      );
    }
    if (typeof startupRecovery.controlPlaneRecoveryReady === 'boolean') {
      response.controlPlaneRecoveryReady =
        startupRecovery.controlPlaneRecoveryReady;
    }
    if (typeof startupRecovery.metadataPublicationReady === 'boolean') {
      response.metadataPublicationReady =
        startupRecovery.metadataPublicationReady;
    }
    if (typeof startupRecovery.backgroundWorkReady === 'boolean') {
      response.backgroundWorkReady = startupRecovery.backgroundWorkReady;
    }
    if (typeof startupRecovery.recoveryBlocked === 'boolean') {
      response.recoveryBlocked = startupRecovery.recoveryBlocked;
    }
    if (
      typeof startupRecovery.startupAuthorityState === 'string' &&
      startupRecovery.startupAuthorityState.length > 0
    ) {
      response.startupAuthorityState = startupRecovery.startupAuthorityState;
    }
    if (typeof startupRecovery.startupAuthorityAvailable === 'boolean') {
      response.startupAuthorityAvailable =
        startupRecovery.startupAuthorityAvailable;
    }
    if (
      startupRecovery.startupAuthorityFailure &&
      typeof startupRecovery.startupAuthorityFailure === 'object'
    ) {
      response.startupAuthorityFailure =
        startupRecovery.startupAuthorityFailure;
    }
    if (
      typeof startupRecovery.startupAuthorityFailureReason === 'string' &&
      startupRecovery.startupAuthorityFailureReason.length > 0
    ) {
      response.startupAuthorityFailureReason =
        startupRecovery.startupAuthorityFailureReason;
    }
    if (
      startupRecovery.startupAuthorityPublication &&
      typeof startupRecovery.startupAuthorityPublication === 'object'
    ) {
      response.startupAuthorityPublication =
        startupRecovery.startupAuthorityPublication;
    }
    if (
      typeof startupRecovery.publicationObservationState === 'string' &&
      startupRecovery.publicationObservationState.length > 0
    ) {
      response.startupAuthorityPublicationObservationState =
        startupRecovery.publicationObservationState;
    }
  },
  resolvePriorityRecoveryProtocolDetails(
    startupRecovery,
    priorityRecoveryDetails,
  ) {
    const hasPriorityRecoveryProtocolDetails =
      startupRecovery.targetParticipation ||
      startupRecovery.recoveryProtocolState ||
      (Array.isArray(startupRecovery.priorityRecoveryReasonCodes) &&
        startupRecovery.priorityRecoveryReasonCodes.length > 0);
    if (!hasPriorityRecoveryProtocolDetails) {
      return priorityRecoveryDetails;
    }
    return {
      recoveryProtocolState: startupRecovery.recoveryProtocolState || null,
      priorityRecoveryReasonCodes:
        startupRecovery.priorityRecoveryReasonCodes || [],
      targetParticipation: startupRecovery.targetParticipation || null,
    };
  },
  appendPriorityRecoveryProtocolFields(response, details) {
    if (
      !response ||
      typeof response !== 'object' ||
      !details ||
      typeof details !== 'object'
    ) {
      return response;
    }
    if (
      typeof details.recoveryProtocolState === 'string' &&
      details.recoveryProtocolState.length > 0
    ) {
      response.recoveryProtocolState = details.recoveryProtocolState;
    }
    if (
      Array.isArray(details.priorityRecoveryReasonCodes) &&
      details.priorityRecoveryReasonCodes.length > 0
    ) {
      response.priorityRecoveryReasonCodes = Object.freeze([
        ...details.priorityRecoveryReasonCodes,
      ]);
    }
    if (
      details.targetParticipation &&
      typeof details.targetParticipation === 'object'
    ) {
      response.targetParticipation = details.targetParticipation;
    }
    return response;
  },
  appendMembershipPublicationFields(response, snapshot) {
    if (!response || typeof response !== 'object') {
      return response;
    }
    const membershipPublication = this.getMembershipPublicationDiagnostics(
      snapshot?.timestamp,
    );
    if (!membershipPublication) {
      return response;
    }
    if (Number.isFinite(membershipPublication.publicationEpoch)) {
      response.publishedControlPlaneEpoch = Math.max(
        0,
        Math.floor(membershipPublication.publicationEpoch),
      );
    }
    if (
      typeof membershipPublication.status === 'string' &&
      membershipPublication.status.length > 0
    ) {
      response.publishedControlPlaneStatus = membershipPublication.status;
    }
    if (
      typeof membershipPublication.publicationObservationState ===
        'string' &&
      membershipPublication.publicationObservationState.length > 0
    ) {
      response.publishedControlPlaneObservationState =
        membershipPublication.publicationObservationState;
    }
    const publicationRecoveryGate =
      membershipPublication.publicationRecoveryGate &&
      typeof membershipPublication.publicationRecoveryGate === 'object' ?
        membershipPublication.publicationRecoveryGate :
        null;
    if (publicationRecoveryGate) {
      this.appendPublicationRecoveryGateFields(
        response,
        publicationRecoveryGate,
      );
      return response;
    }
    this.appendPublicationAckFields(response, membershipPublication);
    return response;
  },
  appendPublicationRecoveryGateFields(response, publicationRecoveryGate) {
    if (
      typeof publicationRecoveryGate.state === 'string' &&
      publicationRecoveryGate.state.length > 0
    ) {
      response.publishedControlPlaneGateState = publicationRecoveryGate.state;
    }
    if (typeof publicationRecoveryGate.ready === 'boolean') {
      response.publishedControlPlaneGateReady = publicationRecoveryGate.ready;
    }
    if (Number.isFinite(publicationRecoveryGate.pendingAckCount)) {
      response.publishedControlPlanePendingAckCount = Math.max(
        0,
        Math.floor(publicationRecoveryGate.pendingAckCount),
      );
    }
  },
  appendPublicationAckFields(response, membershipPublication) {
    if (Array.isArray(membershipPublication.requiredAckNodeIds)) {
      response.publishedControlPlaneRequiredAckCount = Math.max(
        0,
        membershipPublication.requiredAckNodeIds.length,
      );
    }
    if (Array.isArray(membershipPublication.acknowledgedNodeIds)) {
      response.publishedControlPlaneAcknowledgedCount = Math.max(
        0,
        membershipPublication.acknowledgedNodeIds.length,
      );
    }
    if (
      Number.isFinite(response.publishedControlPlaneRequiredAckCount) &&
      Number.isFinite(response.publishedControlPlaneAcknowledgedCount)
    ) {
      response.publishedControlPlanePendingAckCount = Math.max(
        0,
        response.publishedControlPlaneRequiredAckCount -
          response.publishedControlPlaneAcknowledgedCount,
      );
    }
  },
  appendReadinessStageFields(response) {
    if (!response || typeof response !== 'object') {
      return response;
    }
    const readinessStage = buildBootstrapReadinessStage({
      ready: response.ready === true,
      controlPlaneRecoveryReady: response.controlPlaneRecoveryReady === true,
      backgroundWorkReady: response.backgroundWorkReady === true,
      publishedControlPlaneEpoch: response.publishedControlPlaneEpoch,
      publishedControlPlaneStatus: response.publishedControlPlaneStatus,
      publishedControlPlaneObservationState:
        response.publishedControlPlaneObservationState,
      publishedControlPlanePendingAckCount:
        response.publishedControlPlanePendingAckCount,
    });
    response.readinessStage = readinessStage.stage;
    response.readinessStageRank = readinessStage.stageRank;
    return response;
  },
  getControlPlanePublicationStory(observedAt) {
    const service = this.getControlPlaneReadinessService();
    if (!service || typeof service !== 'object') {
      return null;
    }
    try {
      if (
        typeof service.getControlPlanePublicationStorySync === 'function'
      ) {
        return service.getControlPlanePublicationStorySync(
          this.getSeedNodeId(),
          observedAt,
        );
      }
      if (typeof service.getControlPlanePublicationStory !== 'function') {
        return null;
      }
      const story = service.getControlPlanePublicationStory(
        this.getSeedNodeId(),
        observedAt,
      );
      if (story && typeof story.then === 'function') {
        return null;
      }
      return story;
    } catch (_error) {
      return null;
    }
  },
  getMembershipPublicationDiagnostics(observedAt) {
    const publicationStory = this.getControlPlanePublicationStory(observedAt);
    if (
      publicationStory?.membershipPublication &&
      typeof publicationStory.membershipPublication === 'object'
    ) {
      return publicationStory.membershipPublication;
    }
    const service = this.getControlPlaneReadinessService();
    if (!service || typeof service !== 'object') {
      return null;
    }
    try {
      if (
        typeof service.getMembershipPublicationDiagnosticsSync ===
        'function'
      ) {
        return service.getMembershipPublicationDiagnosticsSync(
          this.getSeedNodeId(),
          observedAt,
        );
      }
      if (
        typeof service.getMembershipPublicationDiagnostics !== 'function'
      ) {
        return null;
      }
      const diagnostics = service.getMembershipPublicationDiagnostics(
        this.getSeedNodeId(),
        observedAt,
      );
      if (diagnostics && typeof diagnostics.then === 'function') {
        return null;
      }
      return diagnostics;
    } catch (_error) {
      return null;
    }
  },
  buildMembershipPublicationPlanningSnapshot(
    membershipPublication,
    observedAt = Date.now(),
  ) {
    const service = this.getControlPlaneReadinessService();
    if (
      service &&
      typeof service.buildMembershipPublicationPlanningSnapshot ===
        'function'
    ) {
      try {
        return service.buildMembershipPublicationPlanningSnapshot({
          nodeId: this.getSeedNodeId(),
          observedAt,
          membershipPublication,
        });
      } catch (_error) {
        // Fall back to local normalization when the readiness service does not
        // expose the shared helper contract cleanly.
      }
    }
    return buildPublicationRecoveryProtocolSnapshot(membershipPublication, {
      targetNodeId: this.getSeedNodeId(),
    });
  },
  logBootstrapJoinReadinessProjection(snapshot, response) {
    const logger = this.getLogger();
    if (!logger || typeof logger.info !== 'function') {
      return;
    }
    if (snapshot?.ready === true) {
      this.lastBootstrapJoinBlockedSignature = null;
      this.lastBootstrapJoinProjectionEvaluation = null;
      return;
    }
    const bootstrapService = this.getBootstrapService();
    const leaderStatus = this.getLeaderReadinessStatusForProbe();
    const localQueryTransportReadiness = this.getLocalQueryTransportReadiness();
    const controlPlaneWriteHealth = this.getControlPlaneWriteHealth();
    const membershipPublication = this.getMembershipPublicationDiagnostics(
      response?.timestamp,
    );
    const projectionEvaluation =
      this.lastBootstrapJoinProjectionEvaluation &&
      typeof this.lastBootstrapJoinProjectionEvaluation === 'object' ?
        {
          canProjectReady:
              this.lastBootstrapJoinProjectionEvaluation.canProjectReady ===
              true,
          projectionRule:
              this.lastBootstrapJoinProjectionEvaluation.projectionRule || null,
          blockerReason:
              this.lastBootstrapJoinProjectionEvaluation.blockerReason || null,
          normalizedPhase:
              this.lastBootstrapJoinProjectionEvaluation.normalizedPhase ||
              null,
          reasons: Array.isArray(
            this.lastBootstrapJoinProjectionEvaluation.reasons,
          ) ?
            this.lastBootstrapJoinProjectionEvaluation.reasons :
            [],
          blockingReasons: Array.isArray(
            this.lastBootstrapJoinProjectionEvaluation.blockingReasons,
          ) ?
            this.lastBootstrapJoinProjectionEvaluation.blockingReasons :
            [],
        } :
        null;
    const messageRouter =
      this.getMessageRouter() || bootstrapService?.messageRouter || null;
    const logPayload = {
      nodeId: this.getSeedNodeId(),
      phase: response?.phase || null,
      state: response?.state || null,
      reasons: Array.isArray(response?.reasons) ? response.reasons : [],
      bootstrapServicePhase: bootstrapService?.phase || null,
      hasSqlQueryEngine: Boolean(this.getSqlQueryEngine()),
      hasMessageRouter: Boolean(messageRouter),
      leaderStatus,
      localQueryTransportReadiness,
      controlPlaneWriteHealth,
      publishedControlPlaneEpoch:
        membershipPublication?.publicationEpoch ?? null,
      publishedControlPlaneStatus: membershipPublication?.status ?? null,
      projectionEvaluation,
    };
    const signature = JSON.stringify({
      phase: logPayload.phase,
      state: logPayload.state,
      reasons: logPayload.reasons,
      bootstrapServicePhase: logPayload.bootstrapServicePhase,
      hasSqlQueryEngine: logPayload.hasSqlQueryEngine,
      hasMessageRouter: logPayload.hasMessageRouter,
      leaderReady: leaderStatus?.ready === true,
      localQueryTransportReady: isLocalQueryTransportReady(
        localQueryTransportReadiness,
      ),
      controlPlaneWriteHealthy: controlPlaneWriteHealth?.healthy === true,
      publishedControlPlaneEpoch: logPayload.publishedControlPlaneEpoch,
      publishedControlPlaneStatus: logPayload.publishedControlPlaneStatus,
      projectionEvaluation,
    });
    if (signature === this.lastBootstrapJoinBlockedSignature) {
      return;
    }
    this.lastBootstrapJoinBlockedSignature = signature;
    logger.info(
      BOOTSTRAP_API_LOG_MSG.BOOTSTRAP_JOIN_READINESS_BLOCKED,
      logPayload,
    );
  },
});

function applyBootstrapReadinessProbeDetailMethods(ownerClass) {
  Object.defineProperties(
    ownerClass.prototype,
    Object.fromEntries(
      Object.entries(BOOTSTRAP_READINESS_PROBE_DETAIL_METHODS).map(
        ([name, value]) => [
          name,
          {
            configurable: true,
            value,
            writable: true,
          },
        ],
      ),
    ),
  );
}

export {applyBootstrapReadinessProbeDetailMethods};
