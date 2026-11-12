import {REPLICA_DISPATCH_SERVICE_SHARED} from './replica-dispatch-service-shared.js';
import {ReplicaDispatchOperationExecution} from './replica-dispatch-operation-execution.js';
import {resolvePublishedActiveNodeIds} from './active-node-publication-snapshots.js';
import {
  DISPATCH_PENDING_WORKFLOW_STEPS,
  isActiveReplaceSourceRemovalPhase,
} from '../rebalancer/replica-operation-step-policy.js';
import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';
import {isPublicationWriteObligationRetained} from
  './owners/control-plane-publication-change.js';
import {
  armDeferredMembershipPublicationAckRetry,
  deferMembershipPublicationAckRetry,
  resolveMembershipPublicationAckRetryAfterMs,
  retainMembershipPublicationAck,
} from './replica-dispatch-membership-publication-ack-retention.js';

const {
  COLUMN,
  DISPATCH_DEFAULT,
  DISPATCH_LOG_MSG,
  MEMBERSHIP_PUBLICATION_STATUS,
  READY_NODE_PUBLICATION_ADVANCEMENT_STATE,
  RECONCILE_REASON,
  REPLICA_DISPATCH_SERVICE_LITERAL,
  STATE,
  isCoordinatorOwnedOperationType,
  resolveReadyNodePublicationAdvancementState,
} = REPLICA_DISPATCH_SERVICE_SHARED;

const DISPATCH_READINESS_REFRESH_WAIT = Object.freeze({
  wait: 'OPERATION_DISPATCH_READINESS_REFRESH_TIMEOUT_MS',
  awaited: 'authoritative readiness refresh for the dispatch target node',
});

// The race only knows the refresh had not settled; the caller then falls back
// to the sync snapshot or defers (unchanged).
function reportDispatchReadinessRefreshSpent(service, spent) {
  reportWaitBoundSpent(service.logger, {
    ...DISPATCH_READINESS_REFRESH_WAIT,
    boundMs: spent.timeoutMs,
    startedAtMs: spent.startedAtMs,
    lastObserved: {
      refreshSettled: false,
      decisionDimension: spent.decisionDimension ?? null,
      requestedMaxCachedAgeMs: spent.maxCachedAgeMs,
    },
    scope: {nodeId: service.nodeId, targetNodeId: spent.nodeId ?? null},
    subject: spent.nodeId,
  });
}

const READY_NODE_PUBLICATION_ADVANCEMENT_EMPTY_OPTIONS = Object.freeze({});
const READY_NODE_PUBLICATION_ADVANCEMENT_NODE_ROW_UNAVAILABLE = null;
const READY_NODE_PUBLICATION_RECONCILE_EMPTY_LIST = Object.freeze([]);
const READY_NODE_PUBLICATION_ADVANCEMENT_OPTION = Object.freeze({
  PUBLICATION_ROWS: 'publicationRows',
});
const READY_NODE_PUBLICATION_RECONCILE_FIELD = Object.freeze({
  ACKNOWLEDGED_NODE_IDS: 'acknowledgedNodeIds',
  LATEST_PUBLICATION_ROW: 'latestPublicationRow',
  PUBLISHED_ACTIVE_NODE_IDS: 'publishedActiveNodeIds',
  REQUIRED_ACK_NODE_IDS: 'requiredAckNodeIds',
});

function normalizeReadyNodePublicationReconcileNodeIds(values = []) {
  return [
    ...new Set(
      (Array.isArray(values) ?
        values :
        READY_NODE_PUBLICATION_RECONCILE_EMPTY_LIST)
        .map((value) =>
          String(value || REPLICA_DISPATCH_SERVICE_LITERAL.EMPTY_STRING).trim(),
        )
        .filter((value) => value.length > 0),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

class ReplicaDispatchReplayHealthReadiness extends ReplicaDispatchOperationExecution {
  enqueueReplicaOperationRow(row, reasons) {
    if (!row || !row.operation_id) {
      return false;
    }
    if (
      !isCoordinatorOwnedOperationType(row.type) ||
      !this.isReplicaOperationLocallyOwned(row) ||
      this.isBootstrapTopologyDispatchDeferred(row)
    ) {
      return false;
    }

    if (isActiveReplaceSourceRemovalPhase(row.type, row.workflow_step)) {
      this.operationDispatchQueue.enqueue(
        row.operation_id,
        reasons.replaceActiveReason,
        {row},
      );
      return true;
    }

    if (this.isDispatchReplayCreateTargetRearmOperation(row)) {
      this.operationDispatchQueue.enqueue(
        row.operation_id,
        reasons.pendingReason,
        {row},
      );
      return true;
    }

    if (!DISPATCH_PENDING_WORKFLOW_STEPS.has(row.workflow_step)) {
      return false;
    }

    this.operationDispatchQueue.enqueue(
      row.operation_id,
      reasons.pendingReason,
      {row},
    );
    return true;
  }

  replayReplicaOperationRow(row, reasons) {
    if (!row || !row.operation_id) {
      return false;
    }
    if (!isCoordinatorOwnedOperationType(row.type)) {
      return false;
    }
    if (this.isBootstrapTopologyDispatchDeferred(row)) {
      return false;
    }
    if (this.enqueueReplicaOperationRow(row, reasons)) {
      return true;
    }

    const workflowStep = row.workflow_step;
    const remoteReplayable =
      DISPATCH_PENDING_WORKFLOW_STEPS.has(workflowStep) ||
      this.isDispatchReplayCreateTargetRearmOperation(row) ||
      isActiveReplaceSourceRemovalPhase(row.type, workflowStep);
    if (!remoteReplayable || this.isReplicaOperationLocallyOwned(row)) {
      return false;
    }

    this.sendDirectDispatchWakeup(this.buildOperationFromRow(row)).catch(
      () => {},
    );
    return true;
  }

  getNodeIdFromRecord(record) {
    return record?.[COLUMN.NODE_ID] || record?.node_id || record?.id || null;
  }

  clearNodeReadyRetryWatermark(nodeId) {
    if (!nodeId) {
      return;
    }
    this.nodeReadyRetryWatermarks.delete(nodeId);
  }

  getNodeReadyRetryWatermark(nodeRow) {
    const heartbeatAt = Number(
      nodeRow?.[COLUMN.LAST_HEARTBEAT] || nodeRow?.last_heartbeat,
    );
    const readyLeaseExpiresAt = Number(
      nodeRow?.[COLUMN.READY_LEASE_EXPIRES_AT] ||
        nodeRow?.ready_lease_expires_at,
    );
    if (
      !Number.isFinite(heartbeatAt) ||
      !Number.isFinite(readyLeaseExpiresAt)
    ) {
      return null;
    }
    return {heartbeatAt, readyLeaseExpiresAt};
  }

  isNodeReadyRetryWatermarkNewer(previous, next) {
    if (!previous) {
      return true;
    }
    if (!next) {
      return true;
    }

    if (next.readyLeaseExpiresAt > previous.readyLeaseExpiresAt) {
      return true;
    }
    if (next.readyLeaseExpiresAt < previous.readyLeaseExpiresAt) {
      return false;
    }

    if (next.heartbeatAt > previous.heartbeatAt) {
      return true;
    }
    if (next.heartbeatAt < previous.heartbeatAt) {
      return false;
    }

    return false;
  }

  /**
   * Check and record ready-trigger watermark for deduped retry scheduling.
   * @param {string} nodeId - Node ID.
   * @param {Object} nodeRow - Nodes row candidate.
   * @return {boolean} True when retry should run for this trigger.
   * @private
   */
  shouldRetryNodeReadyWatermark(nodeId, nodeRow) {
    const next = this.getNodeReadyRetryWatermark(nodeRow);
    const previous = this.nodeReadyRetryWatermarks.get(nodeId) || null;
    if (!this.isNodeReadyRetryWatermarkNewer(previous, next)) {
      return false;
    }
    this.nodeReadyRetryWatermarks.set(nodeId, next);
    return true;
  }

  /**
   * Keep dispatch readiness refresh bounded so one slow authoritative read
   * cannot head-of-line block the owner queue while sync recovery evidence is
   * already available locally.
   *
   * @param {*} value
   * @return {number}
   * @private
   */
  normalizeDispatchReadinessRefreshTimeoutMs(value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.max(1, Math.floor(numeric));
    }
    return Math.max(
      this.operationDispatchRetryAfterMs,
      DISPATCH_DEFAULT.OPERATION_DISPATCH_READINESS_REFRESH_TIMEOUT_MS,
    );
  }

  /**
   * @param {string} nodeId
   * @param {number} timeoutMs
   * @return {Error}
   * @private
   */
  buildDispatchReadinessRefreshTimeoutError(nodeId, timeoutMs) {
    const error = new Error(
      'Message timeout while refreshing readiness for dispatch target ' +
        String(nodeId || 'unknown') +
        ' after ' +
        String(timeoutMs) +
        'ms',
    );
    error.code =
      REPLICA_DISPATCH_SERVICE_LITERAL.CONTROL_PLANE_READINESS_REFRESH_TIMEOUT;
    error.retryAfterMs = this.operationDispatchRetryAfterMs;
    error.deferRetry = true;
    error.targetNodeId = nodeId || null;
    return error;
  }

  /**
   * Bound one authoritative readiness refresh so dispatch progression can fall
   * back to the already-visible sync snapshot instead of stalling indefinitely.
   *
   * @param {string} nodeId
   * @param {string} decisionDimension
   * @return {Promise<Object|null>}
   * @private
   */
  async getBoundedDispatchReadiness(nodeId, decisionDimension) {
    if (
      typeof this.controlPlaneReadinessService.getNodeReadiness !==
      'function'
    ) {
      return null;
    }

    const timeoutMs = this.dispatchReadinessRefreshTimeoutMs;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return this.controlPlaneReadinessService.getNodeReadiness(nodeId, {
        allowAuthoritativeRefresh: true,
        decisionDimension,
        maxCachedAgeMs: 0,
      });
    }

    let timeoutHandle = null;
    const startedAtMs = Date.now();
    try {
      return await Promise.race([
        this.controlPlaneReadinessService.getNodeReadiness(nodeId, {
          allowAuthoritativeRefresh: true,
          decisionDimension,
          maxCachedAgeMs: 0,
        }),
        new Promise((_resolve, reject) => {
          timeoutHandle = this.setTimeoutFn(() => {
            reportDispatchReadinessRefreshSpent(this, {
              nodeId,
              decisionDimension,
              timeoutMs,
              startedAtMs,
              maxCachedAgeMs: 0,
            });
            reject(
              this.buildDispatchReadinessRefreshTimeoutError(nodeId, timeoutMs),
            );
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutHandle) {
        this.clearTimeoutFn(timeoutHandle);
      }
    }
  }

  resolveMembershipPublicationService() {
    const readinessService = this.controlPlaneReadinessService;
    if (!readinessService || typeof readinessService !== 'object') {
      return null;
    }
    const membershipPublicationService =
      readinessService.membershipPublicationService;
    return membershipPublicationService &&
      typeof membershipPublicationService === 'object' ?
      membershipPublicationService :
      null;
  }

  normalizeMembershipPublicationStatus(status) {
    return typeof status === 'string' ? status.toUpperCase() : null;
  }

  buildReadyNodePublicationAdvancementOptions(publicationRow) {
    if (!publicationRow || typeof publicationRow !== 'object') {
      return READY_NODE_PUBLICATION_ADVANCEMENT_EMPTY_OPTIONS;
    }
    return Object.freeze({
      [READY_NODE_PUBLICATION_ADVANCEMENT_OPTION.PUBLICATION_ROWS]:
        Object.freeze([publicationRow]),
    });
  }

  resolveReadyNodePublicationAdvancement(
    nodeId,
    options = READY_NODE_PUBLICATION_ADVANCEMENT_EMPTY_OPTIONS,
  ) {
    const membershipPublicationService =
      this.resolveMembershipPublicationService();
    if (
      !membershipPublicationService ||
      typeof membershipPublicationService.getLatestPublicationRowSync !==
        'function' ||
      typeof membershipPublicationService.getLatestPublicationForNodeSync !==
        'function'
    ) {
      return Object.freeze({
        latestPublicationStatus: null,
        nodePublicationStatus: null,
        needsAcknowledgement: false,
        needsReconcile: false,
      });
    }
    const latestPublicationRow =
      membershipPublicationService.getLatestPublicationRowSync(options);
    const latestPublicationForNode =
      membershipPublicationService.getLatestPublicationForNodeSync(
        nodeId,
        options,
      );
    const latestPublicationStatus = this.normalizeMembershipPublicationStatus(
      latestPublicationRow?.status,
    );
    const nodePublicationStatus = this.normalizeMembershipPublicationStatus(
      latestPublicationForNode?.status,
    );
    const nodeIncluded = Boolean(latestPublicationForNode);
    const advancementState = resolveReadyNodePublicationAdvancementState({
      latestPublicationStatus,
      nodeIncluded,
    });
    const needsAcknowledgement =
      advancementState ===
        READY_NODE_PUBLICATION_ADVANCEMENT_STATE.IN_FLIGHT_NODE_VISIBLE ||
      advancementState ===
        READY_NODE_PUBLICATION_ADVANCEMENT_STATE.IN_FLIGHT_NODE_UNRESOLVED ||
      (
        advancementState ===
          READY_NODE_PUBLICATION_ADVANCEMENT_STATE.PUBLISHED_NODE_MISSING &&
        latestPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED
      );
    const needsReconcile =
      advancementState !==
        READY_NODE_PUBLICATION_ADVANCEMENT_STATE.PUBLISHED_NODE_VISIBLE ||
      nodePublicationStatus !== MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED;
    return Object.freeze({
      latestPublicationRow,
      latestPublicationForNode,
      latestPublicationStatus,
      nodePublicationStatus,
      advancementState,
      // What the row's member list means is the snapshot owner's answer
      // (null: no published membership to extend).
      publishedActiveNodeIds: resolvePublishedActiveNodeIds({
        latestPublicationRow,
      }),
      needsAcknowledgement,
      needsReconcile,
    });
  }

  buildReadyNodePublicationReconcileContext(
    nodeId,
    nodeRow,
    publicationAdvancement = {},
  ) {
    const context = {
      nodeId,
      state: STATE.READY,
      nodeRow,
    };
    if (
      publicationAdvancement.advancementState !==
        READY_NODE_PUBLICATION_ADVANCEMENT_STATE.PUBLISHED_NODE_MISSING ||
      publicationAdvancement.latestPublicationStatus !==
        MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ||
      !Array.isArray(publicationAdvancement.publishedActiveNodeIds)
    ) {
      return context;
    }
    const publishedActiveNodeIds = normalizeReadyNodePublicationReconcileNodeIds([
      ...normalizeReadyNodePublicationReconcileNodeIds(
        publicationAdvancement.publishedActiveNodeIds,
      ),
      nodeId,
    ]);
    if (publishedActiveNodeIds.length === 0) {
      return context;
    }
    return {
      ...context,
      [READY_NODE_PUBLICATION_RECONCILE_FIELD.LATEST_PUBLICATION_ROW]:
        publicationAdvancement.latestPublicationRow,
      [READY_NODE_PUBLICATION_RECONCILE_FIELD.PUBLISHED_ACTIVE_NODE_IDS]:
        publishedActiveNodeIds,
      [READY_NODE_PUBLICATION_RECONCILE_FIELD.REQUIRED_ACK_NODE_IDS]:
        publishedActiveNodeIds,
      [READY_NODE_PUBLICATION_RECONCILE_FIELD.ACKNOWLEDGED_NODE_IDS]:
        publishedActiveNodeIds,
    };
  }

  async maybeAdvanceReadyNodeMembershipPublication(
    nodeId,
    nodeRow,
    reason = RECONCILE_REASON.NODE_STATE_UPDATE_READY,
    options = READY_NODE_PUBLICATION_ADVANCEMENT_EMPTY_OPTIONS,
  ) {
    const publicationAdvancement =
      this.resolveReadyNodePublicationAdvancement(nodeId, options);
    if (publicationAdvancement.needsReconcile !== true) {
      return false;
    }
    this.enqueueMembershipPublicationReconcile(
      reason,
      this.buildReadyNodePublicationReconcileContext(
        nodeId,
        nodeRow,
        publicationAdvancement,
      ),
    );
    // A node acknowledges only for itself: another node's READY row is the
    // publication owner's reason to reconcile (above), never this node's
    // reason to acknowledge on that node's behalf.
    if (
      publicationAdvancement.needsAcknowledgement === true &&
      nodeId === this.nodeId
    ) {
      await this.acknowledgeMembershipPublicationForNode(nodeId, options);
    }
    return true;
  }

  scheduleReadyNodeMembershipPublicationAdvance(
    nodeId,
    nodeRow,
    reason = RECONCILE_REASON.NODE_STATE_UPDATE_READY,
    options = READY_NODE_PUBLICATION_ADVANCEMENT_EMPTY_OPTIONS,
  ) {
    Promise.resolve()
      .then(() =>
        this.maybeAdvanceReadyNodeMembershipPublication(
          nodeId,
          nodeRow,
          reason,
          options,
        ),
      )
      .catch((error) => {
        this.logger.warn(DISPATCH_LOG_MSG.MEMBERSHIP_PUBLICATION_ACK_FAILED, {
          nodeId,
          error: error?.message || String(error),
        });
      });
  }

  scheduleLocalReadyNodeMembershipPublicationAdvance(
    reason = RECONCILE_REASON.CONTROL_PLANE_PUBLICATION_CACHE_UPDATE,
    publicationRow = READY_NODE_PUBLICATION_ADVANCEMENT_NODE_ROW_UNAVAILABLE,
  ) {
    const nodeId = this.nodeId;
    if (!nodeId) {
      return false;
    }
    this.membershipPublicationAdvanceQueue.enqueue(
      nodeId,
      reason,
      {publicationRow, reason},
    );
    return true;
  }

  async reconcileLocalReadyNodeMembershipPublicationAdvance(
    nodeId,
    context = {},
  ) {
    if (!nodeId || nodeId !== this.nodeId || !this.isNodeReady(nodeId)) {
      return false;
    }
    return this.maybeAdvanceReadyNodeMembershipPublication(
      nodeId,
      READY_NODE_PUBLICATION_ADVANCEMENT_NODE_ROW_UNAVAILABLE,
      context.reason ||
        RECONCILE_REASON.CONTROL_PLANE_PUBLICATION_CACHE_UPDATE,
      this.buildReadyNodePublicationAdvancementOptions(
        context.publicationRow,
      ),
    );
  }

  resolveMembershipPublicationAckRetryAfterMs(error) {
    return resolveMembershipPublicationAckRetryAfterMs(this, error);
  }

  armDeferredMembershipPublicationAckRetry(nodeId, retryAfterMs) {
    return armDeferredMembershipPublicationAckRetry(this, nodeId,
      retryAfterMs);
  }

  deferMembershipPublicationAckRetry(nodeId, error) {
    return deferMembershipPublicationAckRetry(this, nodeId, error);
  }

  retainMembershipPublicationAck(nodeId, retained) {
    return retainMembershipPublicationAck(this, nodeId, retained);
  }

  /**
   * READY node-state updates must re-enter the canonical publication owner
   * queue so cluster publication convergence advances through the durable
   * control-plane writer rather than only via later read-time repair.
   *
   * @param {string} reason
   * @param {Object} [context={}]
   * @return {boolean}
   * @private
   */
  enqueueMembershipPublicationReconcile(reason, context = {}) {
    const membershipPublicationService =
      this.resolveMembershipPublicationService();
    if (
      !membershipPublicationService ||
      typeof membershipPublicationService.enqueueClusterMembershipReconcile !==
        'function'
    ) {
      return false;
    }
    membershipPublicationService.enqueueClusterMembershipReconcile(
      reason,
      context,
    );
    return true;
  }

  async acknowledgeMembershipPublicationForNode(
    nodeId,
    options = READY_NODE_PUBLICATION_ADVANCEMENT_EMPTY_OPTIONS,
  ) {
    const membershipPublicationService =
      this.resolveMembershipPublicationService();
    if (
      !membershipPublicationService ||
      typeof membershipPublicationService.acknowledgeMembershipPublicationForNode !==
        'function'
    ) {
      return null;
    }

    try {
      const acknowledgement =
        options === READY_NODE_PUBLICATION_ADVANCEMENT_EMPTY_OPTIONS ?
          await membershipPublicationService
            .acknowledgeMembershipPublicationForNode(nodeId) :
          await membershipPublicationService
            .acknowledgeMembershipPublicationForNode(nodeId, options);
      if (isPublicationWriteObligationRetained(acknowledgement)) {
        // Not settled (unknown, or refused for a reason that says nothing
        // about the row): the obligation is kept, never released.
        this.retainMembershipPublicationAck(nodeId, {
          retryAfterMs: this.nodeStateUpdateRetryAfterMs,
          error: acknowledgement.reason,
          publicationId: acknowledgement.publicationId,
        });
      }
      return acknowledgement;
    } catch (error) {
      this.logger.warn(DISPATCH_LOG_MSG.MEMBERSHIP_PUBLICATION_ACK_FAILED, {
        nodeId,
        error: error?.message || String(error),
      });
      this.deferMembershipPublicationAckRetry(nodeId, error);
      return null;
    }
  }
}
export {ReplicaDispatchReplayHealthReadiness};
