import {CONTROL_PLANE_READINESS_SERVICE_SHARED} from './control-plane-readiness-service-shared.js';
import {trackSyncSection} from '../diagnostics/event-loop-gap-watchdog.js';
import {ControlPlaneReadinessPublicationDiagnostics} from './control-plane-readiness-publication-diagnostics.js';
import {installControlPlaneReadinessRuntimeAuthorityMethods} from './control-plane-readiness-runtime-authority-methods.js';
import {NODE_LIVENESS_SEMANTIC_STATE} from
  './node-liveness-semantic-projection-owner.js';

const LOCAL_STR_BOOLEAN = 'boolean';

function normalizeOptionalEvidenceValue(value) {
  return value || null;
}

function buildMissingSelfLocalQueryTransportEvidence(localQueryTransport) {
  return {
    localQueryTransportState:
      normalizeOptionalEvidenceValue(localQueryTransport?.state),
    localQueryTransportReady:
      typeof localQueryTransport?.ready === LOCAL_STR_BOOLEAN ?
        localQueryTransport.ready :
        null,
    localQueryTransportReason:
      normalizeOptionalEvidenceValue(localQueryTransport?.reason),
    localQueryTransportReasonCode:
      normalizeOptionalEvidenceValue(localQueryTransport?.reasonCode),
    localQueryTransportErrorCode:
      normalizeOptionalEvidenceValue(localQueryTransport?.errorCode),
    localQueryTransportRetryAfterMs: Number.isFinite(
      localQueryTransport?.retryAfterMs,
    ) ?
      localQueryTransport.retryAfterMs :
      null,
  };
}
import {summarizeProjectionReadinessContractForHistory} from './projection-readiness-state.js';

const {
  AuthoritativeControlPlaneView,
  CONTROL_PLANE_PUBLICATION_MODE,
  CONTROL_PLANE_READINESS_DEFAULT,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_OWNER,
  CONTROL_PLANE_READINESS_REASON,
  MISSING_NODE_READINESS_REASON,
  MISSING_NODE_READINESS_STATE,
  buildProjectionReadinessContract,
  buildReadinessTransitionOwnerState,
  buildReason,
  createEligibilitySnapshot,
  pickProjectionReadinessEvidenceSource,
} = CONTROL_PLANE_READINESS_SERVICE_SHARED;

const PROJECTION_READINESS_REASONS_CONTRACT_BUILD_SECTION =
  'projection_readiness_reasons_contract_build';

const PRIORITY_CONTROL_PLANE_RECOVERY_DIAGNOSTICS_UNAVAILABLE =
  'priority_control_plane_recovery_diagnostics_unavailable';

function recordPriorityRecoveryTransportGrace(service, context, state) {
  const nodeId = context.nodeId || service.nodeId;
  const hasTransportGrace = state?.active === true &&
    typeof service.shouldAllowTransportBackedRecoveryGrace === 'function' &&
    service.shouldAllowTransportBackedRecoveryGrace(context);
  return service.nodeLivenessSemanticProjectionOwner
    ?.recordTransportGraceEvidence(nodeId, {
      eligible: hasTransportGrace,
      startedAtMs: Number(state?.enteredAt),
    }, service.now());
}

function hasActivePriorityRecoveryTransportGrace(state, liveness) {
  return state && typeof state === 'object' && state.active === true &&
    liveness?.transportSemantics?.graceState ===
      NODE_LIVENESS_SEMANTIC_STATE.ACTIVE;
}

class ControlPlaneReadinessEvidenceReasons extends ControlPlaneReadinessPublicationDiagnostics {
  constructor(...args) {
    super(...args);
    const originalBuild = this.buildPriorityControlPlaneRecoveryUnavailableHealth;
    if (typeof originalBuild === 'function') {
      this.buildPriorityControlPlaneRecoveryUnavailableHealth = function(
        failureReason,
        error = null,
        context = null,
      ) {
        const result = originalBuild.call(this, failureReason, error, context);
        const isWebSocketClosed = error && (
          String(error).includes('WebSocket') ||
          String(error).includes('closed') ||
          String(error).includes('transport')
        );
        const retryAfterMs = isWebSocketClosed ? 15000 : undefined;
        return Object.freeze({
          ...result,
          reasonCode: PRIORITY_CONTROL_PLANE_RECOVERY_DIAGNOSTICS_UNAVAILABLE,
          ...(retryAfterMs !== undefined ? {retryAfterMs} : {}),
          details: {
            ...result.details,
            ...(retryAfterMs !== undefined ? {retryAfterMs} : {}),
          },
        });
      };
    }
    const originalGetState = this.getPriorityControlPlaneRecoveryState;
    if (typeof originalGetState === 'function') {
      this.getPriorityControlPlaneRecoveryState = function(context = {}) {
        const state = originalGetState.call(this, context);
        const liveness = recordPriorityRecoveryTransportGrace(
          this,
          context,
          state,
        );
        if (hasActivePriorityRecoveryTransportGrace(state, liveness)) {
          return Object.freeze({...state, inGracePeriod: true});
        }
        return state;
      };
    }
  }

  shouldAllowTransportBackedRecoveryGrace(context = {}) {
    const nodeId = context.nodeId;
    const nodeEvidence =
      context.nodeEvidence && typeof context.nodeEvidence === 'object' ?
        context.nodeEvidence :
        null;
    const serviceRows = Array.isArray(context.serviceRows) ?
      context.serviceRows :
      [];

    let isTransportActive = nodeEvidence?.transportConnected === true;
    if (!isTransportActive && nodeId && this.messageRouter) {
      const connection = typeof this.messageRouter.nodeConnections?.get === 'function' ?
        this.messageRouter.nodeConnections.get(nodeId) :
        null;
      const isReconnecting = connection && (
        connection.state === 'reconnecting' ||
        (typeof this.messageRouter.hasScheduledReconnect === 'function' &&
         this.messageRouter.hasScheduledReconnect(connection))
      );
      const connectedNodes = typeof this.messageRouter.getConnectedNodes === 'function' ?
        this.messageRouter.getConnectedNodes() :
        [];
      const remoteWitnesses = connectedNodes.filter((id) => id !== this.nodeId);
      const hasAlternativeWitnesses = remoteWitnesses.length > 0;

      if (isReconnecting || hasAlternativeWitnesses) {
        isTransportActive = true;
      }
    }

    if (!isTransportActive) {
      return false;
    }

    return (
      this.hasRoutableService(serviceRows) &&
      this.hasRecoveryGraceControlPlaneService(serviceRows)
    );
  }

  buildReasons(context) {
    const reasons = [];
    const dimensions = context.dimensions;
    const localQueryTransportBlocked = this.isLocalQueryTransportBlockedForNode(
      context.nodeId,
      context.nodeEvidence,
    );

    if (!dimensions.processAlive) {
      reasons.push(
        buildReason(
          CONTROL_PLANE_READINESS_REASON.PROCESS_NOT_ALIVE,
          CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE,
          CONTROL_PLANE_READINESS_OWNER.NODE_LIFECYCLE,
          context.observedAt,
        ),
      );
    }
    if (!dimensions.clusterMemberHealthy) {
      reasons.push(
        buildReason(
          CONTROL_PLANE_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY,
          CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY,
          CONTROL_PLANE_READINESS_OWNER.NODE_LIFECYCLE,
          context.observedAt,
          context.nodeEvidence ||
            this.buildNodeEvidence(context.nodeId, context.nodeRow),
        ),
      );
    }
    if (!dimensions.routingReady) {
      if (localQueryTransportBlocked) {
        reasons.push(
          buildReason(
            CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
            CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY,
            CONTROL_PLANE_READINESS_OWNER.MESSAGE_ROUTER,
            context.observedAt,
            {
              localQueryTransportState:
                context.nodeEvidence?.localQueryTransportState || null,
              localQueryTransportReason:
                context.nodeEvidence?.localQueryTransportReason || null,
              localQueryTransportReasonCode:
                context.nodeEvidence?.localQueryTransportReasonCode || null,
              localQueryTransportErrorCode:
                context.nodeEvidence?.localQueryTransportErrorCode || null,
              localQueryTransportRetryAfterMs: Number.isFinite(
                context.nodeEvidence?.localQueryTransportRetryAfterMs,
              ) ?
                context.nodeEvidence.localQueryTransportRetryAfterMs :
                null,
            },
          ),
        );
      } else {
        reasons.push(
          buildReason(
            CONTROL_PLANE_READINESS_REASON.ROUTING_NOT_READY,
            CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY,
            CONTROL_PLANE_READINESS_OWNER.SYSTEM_TABLE_CACHE,
            context.observedAt,
          ),
        );
      }
    }
    if (!dimensions.loadReady) {
      reasons.push(
        buildReason(
          CONTROL_PLANE_READINESS_REASON.LOAD_NOT_READY,
          CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY,
          CONTROL_PLANE_READINESS_OWNER.SYSTEM_TABLE_CACHE,
          context.observedAt,
        ),
      );
    }
    if (!dimensions.metadataPublicationHealthy) {
      reasons.push(
        buildReason(
          context.publication.currentMode ===
            CONTROL_PLANE_PUBLICATION_MODE.REPAIR_ONLY ?
            CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_REPAIR_ONLY :
            CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_DEGRADED,
          CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY,
          CONTROL_PLANE_READINESS_OWNER.CDC_GROUP_PROPAGATION,
          context.observedAt,
        ),
      );
    }
    if (!dimensions.controlPlaneWritable) {
      reasons.push(
        buildReason(
          CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_WRITE_UNHEALTHY,
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE,
          CONTROL_PLANE_READINESS_OWNER.SYSTEM_TABLE_CACHE,
          context.observedAt,
        ),
      );
    }
    if (!dimensions.controlPlanePublished) {
      reasons.push(
        buildReason(
          CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_PUBLICATION_PENDING,
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED,
          CONTROL_PLANE_READINESS_OWNER.MEMBERSHIP_PUBLICATION,
          context.observedAt,
          context.membershipPublication || null,
        ),
      );
    }
    if (
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] !== true &&
      context.priorityControlPlaneRecovery?.active === true
    ) {
      reasons.push(
        buildReason(
          CONTROL_PLANE_READINESS_REASON
            .PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
          CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
          CONTROL_PLANE_READINESS_OWNER.MEMBERSHIP_PUBLICATION,
          context.observedAt,
          context.priorityControlPlaneRecovery,
        ),
      );
    }
    if (!this.isCapacityPlacementEligible(context.capacity)) {
      const code = this.getCapacityReasonCode(context.capacity);
      if (code) {
        reasons.push(
          buildReason(
            code,
            CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE,
            CONTROL_PLANE_READINESS_OWNER.STORAGE_ACCOUNTING,
            context.observedAt,
          ),
        );
      }
    }

    return Object.freeze(reasons);
  }

  /**
   * Return whether one node remains eligible for routed control-plane reads
   * given locally observable query/data-plane transport evidence.
   * Only the self node has direct local transport evidence.
   * @param {string} nodeId
   * @param {Object|null} nodeEvidence
   * @return {boolean}
   * @private
   */
  isLocalQueryTransportRoutableForNode(nodeId, nodeEvidence = null) {
    if (nodeId !== this.nodeId) {
      return true;
    }
    return nodeEvidence?.localQueryTransportReady !== false;
  }

  /**
   * Return true when one node's routed-read eligibility is blocked by the
   * canonical local query/data-plane transport owner.
   * @param {string} nodeId
   * @param {Object|null} nodeEvidence
   * @return {boolean}
   * @private
   */
  isLocalQueryTransportBlockedForNode(nodeId, nodeEvidence = null) {
    return (
      nodeId === this.nodeId && nodeEvidence?.localQueryTransportReady === false
    );
  }

  buildProjectionReadinessContract(context = {}) {
    // Only the fields the evidence builder reads may reach the sealed
    // whole-source own-data validation — any non-plain value in a
    // never-read context field otherwise fails the whole contract closed
    // (round-13 lone-seed serve-lane collapse).
    // Sync-section attribution (instrumentation-only, projection-readiness
    // re-measurement): this is a full-normalize build path NOT routed
    // through ProjectionReadinessEvidenceOwner (transition-state and
    // runtime-authority callers).
    return trackSyncSection(
      PROJECTION_READINESS_REASONS_CONTRACT_BUILD_SECTION,
      () => buildProjectionReadinessContract(
        pickProjectionReadinessEvidenceSource(context),
      ),
    );
  }

  buildEvaluatedNodeReadinessSnapshot(context = {}) {
    const persistSnapshot = context.persistSnapshot !== false;
    const runtimeAuthority = this.buildRuntimeAuthoritySnapshot(context);
    const {
      dimensions,
      priorityControlPlaneRecovery,
      projectionReadinessContract,
    } = this.buildDimensionsEvaluation({
      ...context,
      runtimeAuthority,
    });
    const reasons = this.buildReasons({
      ...context,
      dimensions,
      priorityControlPlaneRecovery,
    });
    const recentTransitions = persistSnapshot ?
      this.recordReadinessTransition({
        nodeId: context.nodeId,
        observedAt: context.observedAt,
        publication: context.publication,
        membershipPublication: context.membershipPublication,
        nodeEvidence: context.nodeEvidence,
        dimensions,
        reasons,
        priorityControlPlaneRecovery,
        runtimeAuthority,
        projectionReadinessContract,
      }) :
      this.getReadinessTransitionHistory(context.nodeId);

    // Per-evaluation ENVELOPE seam (quest
    // projection-readiness-evidence-amplification-v4): this snapshot is the
    // owned composition of (a) the immutable semantic-core contract — which
    // the evidence owner may return by reference across evaluations while
    // the semantic generation is unchanged — with (b) THIS call's
    // observation-time metadata (`observedAt`, `buildStartedAtMs`, reasons
    // stamped with this evaluation's time). Evaluation freshness is read from
    // the envelope, never from timestamps embedded inside the reusable core;
    // a cached core is never mutated to refresh a timestamp.
    const snapshot = Object.freeze({
      ...createEligibilitySnapshot({
        nodeId: context.nodeId,
        lifecycleState: context.lifecycleState,
        publication: context.publication,
        membershipPublication: context.membershipPublication,
        priorityControlPlaneRecovery,
        capacity: context.capacity,
        nodeEvidence: context.nodeEvidence,
        observedAt: context.observedAt,
        dimensions,
        reasons,
      }, {projectionReadinessContract}),
      projectionReadinessContract,
      runtimeAuthority,
      recentTransitions,
    });
    if (persistSnapshot) {
      this.storeReadinessSnapshot(
        context.nodeId,
        snapshot,
        Number.isFinite(context.buildStartedAtMs) ?
          context.buildStartedAtMs :
          null,
        {
          readinessPlanningOwnerBuild:
            context.readinessPlanningOwnerBuild === true,
          readinessPlanningColdBootstrapBuild:
            context.readinessPlanningColdBootstrapBuild === true,
        },
      );
    }
    return snapshot;
  }

  resolveMissingNodeReadinessState(context = {}) {
    const nodeId = context?.nodeId || null;
    const lifecycleState =
      typeof context?.lifecycleState === 'string' ?
        context.lifecycleState :
        null;
    const serviceRows = Array.isArray(context?.serviceRows) ?
      context.serviceRows :
      [];
    if (nodeId !== this.nodeId) {
      return Object.freeze({
        state: MISSING_NODE_READINESS_STATE.FAIL_CLOSED,
        reason: MISSING_NODE_READINESS_REASON.REMOTE_NODE,
      });
    }
    const processAlive =
      !CONTROL_PLANE_READINESS_DEFAULT.NON_RUNNING_PROCESS_STATES.includes(
        String(lifecycleState || ''),
      );
    if (!processAlive) {
      return Object.freeze({
        state: MISSING_NODE_READINESS_STATE.FAIL_CLOSED,
        reason: MISSING_NODE_READINESS_REASON.PROCESS_NOT_ALIVE,
      });
    }
    // Missing-row self grace must admit the same local control-plane service
    // evidence shapes that the canonical serveEligible model already treats as
    // cache-lag-safe. Otherwise a temporary cache gap on both the node row and
    // service rows synthesizes node_row_missing before the dimension model can
    // classify the live local runtime state.
    if (!this.hasServeEligibleControlPlaneService(serviceRows)) {
      return Object.freeze({
        state: MISSING_NODE_READINESS_STATE.FAIL_CLOSED,
        reason: MISSING_NODE_READINESS_REASON.CONTROL_PLANE_SERVICE_UNAVAILABLE,
      });
    }
    return Object.freeze({
      state: MISSING_NODE_READINESS_STATE.SELF_RUNTIME_GRACE,
      reason: MISSING_NODE_READINESS_REASON.SELF_RUNTIME_GRACE,
    });
  }

  /**
   * Resolve the shared authoritative control-plane read view.
   * @return {AuthoritativeControlPlaneView|null}
   * @private
   */
  getAuthoritativeControlPlaneView() {
    if (this.authoritativeControlPlaneView) {
      return this.authoritativeControlPlaneView;
    }
    if (!this.cdcIntegrationService) {
      return null;
    }
    this.authoritativeControlPlaneView = new AuthoritativeControlPlaneView({
      nodeId: this.nodeId,
      cdcIntegrationService: this.cdcIntegrationService,
      messageRouter: this.messageRouter,
      now: this.now,
      queryTimeoutMs: this.authoritativeReadinessRepairQueryTimeoutMs,
    });
    return this.authoritativeControlPlaneView;
  }

  /**
   * Build node-row liveness evidence used by readiness diagnostics.
   * @param {string} nodeId
   * @param {Object|null} nodeRow
   * @return {Object|null}
   * @private
   */
  buildNodeEvidence(nodeId, nodeRow) {
    if (!nodeRow || typeof nodeRow !== 'object') {
      return null;
    }
    return this.buildClusterMemberHealthDetails(nodeId, nodeRow);
  }

  buildMissingSelfNodeEvidence(nodeId) {
    if (nodeId !== this.nodeId) {
      return null;
    }
    const transportState = this.getNodeTransportState(nodeId, null);
    const localQueryTransport = this.getLocalQueryTransportEvidence(nodeId);
    return Object.freeze({
      rowConnectionState: transportState.rowState,
      routerConnectionState: transportState.routerState,
      transportConnected: transportState.connected,
      ...buildMissingSelfLocalQueryTransportEvidence(localQueryTransport),
    });
  }

  /**
   * Record one readiness transition when repair/serve eligibility flips.
   * @param {Object} context
   * @return {Object[]}
   * @private
   */
  recordReadinessTransition(context) {
    const currentState = this.buildReadinessTransitionState(context);
    const previousState =
      this.lastReadinessEvaluationByNodeId.get(context.nodeId) || null;
    this.lastReadinessEvaluationByNodeId.set(context.nodeId, currentState);

    if (!previousState) {
      return this.getReadinessTransitionHistory(context.nodeId);
    }

    const flippedDimensions = [];
    if (previousState.serveEligible !== currentState.serveEligible) {
      flippedDimensions.push(CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE);
    }
    if (previousState.repairEligible !== currentState.repairEligible) {
      flippedDimensions.push(CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE);
    }
    if (flippedDimensions.length === 0) {
      return this.getReadinessTransitionHistory(context.nodeId);
    }

    const entry = Object.freeze({
      nodeId: context.nodeId,
      observedAt: currentState.observedAt,
      observedAtMs: currentState.observedAtMs,
      previousServeEligible: previousState.serveEligible,
      serveEligible: currentState.serveEligible,
      previousRepairEligible: previousState.repairEligible,
      repairEligible: currentState.repairEligible,
      // CL-031(d): history entries carry the bounded contract SUMMARY —
      // the full contract (~0.5MB of embedded evidence) made each entry
      // ~1MB and the served snapshot grew past the websocket limit until
      // nodes OOM-died. The live readiness entry keeps the full contract.
      previousProjectionReadinessContract:
        summarizeProjectionReadinessContractForHistory(
          previousState.projectionReadinessContract,
        ),
      projectionReadinessContract:
        summarizeProjectionReadinessContractForHistory(
          currentState.projectionReadinessContract,
        ),
      previousReasonCodes: Object.freeze([...previousState.reasonCodes]),
      reasonCodes: Object.freeze([...currentState.reasonCodes]),
      flippedDimensions: Object.freeze(flippedDimensions),
      rawInputs: Object.freeze({...currentState.rawInputs}),
    });
    const history =
      this.readinessTransitionHistoryByNodeId.get(context.nodeId) || [];
    const nextHistory = [...history, entry];
    while (nextHistory.length > this.readinessTransitionHistoryLimit) {
      nextHistory.shift();
    }
    this.readinessTransitionHistoryByNodeId.set(context.nodeId, nextHistory);
    this.readinessTransitionHistoryViewByNodeId.delete(context.nodeId);
    return this.getReadinessTransitionHistory(context.nodeId);
  }

  /**
   * Return one defensive copy of readiness transition history. The frozen
   * view is memoized per node (CL-019): this sits on the snapshot-reuse hot
   * path via getFresherStoredReadinessSnapshot, and the history mutates only
   * in recordReadinessTransition (which drops the memo), so rebuilding the
   * deep-frozen view per call was pure allocation churn.
   * @param {string} nodeId
   * @return {Object[]}
   */
  getReadinessTransitionHistory(nodeId) {
    const memoizedView = this.readinessTransitionHistoryViewByNodeId.get(
      nodeId,
    );
    if (memoizedView) {
      return memoizedView;
    }
    const history = this.readinessTransitionHistoryByNodeId.get(nodeId);
    if (!Array.isArray(history) || history.length === 0) {
      return Object.freeze([]);
    }
    const view = Object.freeze(
      history.map((entry) =>
        Object.freeze({
          ...entry,
          previousReasonCodes: Array.isArray(entry.previousReasonCodes) ?
            Object.freeze([...entry.previousReasonCodes]) :
            Object.freeze([]),
          reasonCodes: Array.isArray(entry.reasonCodes) ?
            Object.freeze([...entry.reasonCodes]) :
            Object.freeze([]),
          flippedDimensions: Array.isArray(entry.flippedDimensions) ?
            Object.freeze([...entry.flippedDimensions]) :
            Object.freeze([]),
          previousProjectionReadinessContract:
            entry.previousProjectionReadinessContract &&
            typeof entry.previousProjectionReadinessContract === 'object' ?
              Object.freeze({...entry.previousProjectionReadinessContract}) :
              null,
          projectionReadinessContract:
            entry.projectionReadinessContract &&
            typeof entry.projectionReadinessContract === 'object' ?
              Object.freeze({...entry.projectionReadinessContract}) :
              null,
          rawInputs:
            entry.rawInputs && typeof entry.rawInputs === 'object' ?
              Object.freeze({...entry.rawInputs}) :
              Object.freeze({}),
        }),
      ),
    );
    this.readinessTransitionHistoryViewByNodeId.set(nodeId, view);
    return view;
  }

  /**
   * Return transition history for every tracked node.
   * @return {Object}
   */
  getReadinessTransitionHistoryByNodeId() {
    const entries = {};
    for (const nodeId of this.readinessTransitionHistoryByNodeId.keys()) {
      entries[nodeId] = this.getReadinessTransitionHistory(nodeId);
    }
    return Object.freeze(entries);
  }

  /**
   * Normalize one readiness state for transition tracking.
   * @param {Object} context
   * @return {Object}
   * @private
   */
  buildReadinessTransitionState(context) {
    const ownerState = buildReadinessTransitionOwnerState(context, this.now());
    const projectionReadinessContract =
      context.projectionReadinessContract &&
      typeof context.projectionReadinessContract === 'object' ?
        context.projectionReadinessContract :
        this.buildProjectionReadinessContract(context);
    return Object.freeze({
      ...ownerState,
      projectionReadinessContract,
      rawInputs: Object.freeze({
        ...ownerState.rawInputs,
        projectionReadinessState: projectionReadinessContract.state,
        projectionPublicationReady:
          projectionReadinessContract.publication.ready === true,
        projectionPriorityRecoveryActive:
          projectionReadinessContract.priorityRecovery.active === true,
        projectionActiveGateState:
          projectionReadinessContract.activeGate.state,
      }),
    });
  }
}

installControlPlaneReadinessRuntimeAuthorityMethods(
  ControlPlaneReadinessEvidenceReasons.prototype,
);

export {ControlPlaneReadinessEvidenceReasons};
