import {REPLICA_DISPATCH_SERVICE_SHARED} from './replica-dispatch-service-shared.js';
import {ReplicaDispatchOperationExecution} from './replica-dispatch-operation-execution.js';

const {
  COLUMN,
  CONTROL_PLANE_NODE_STATE_REPLAY_CONTEXT,
  ControlPlaneField,
  DISPATCH_DEFAULT,
  DISPATCH_LOG_MSG,
  MEMBERSHIP_PUBLICATION_STATUS,
  NUM,
  OperationType,
  READY_NODE_PUBLICATION_ADVANCEMENT_STATE,
  RECONCILE_REASON,
  REPLICA_DISPATCH_SERVICE_LITERAL,
  STATE,
  TYPEOF,
  WORKFLOW_STEP,
  compareNodeHeartbeatWatermarks,
  getControlPlaneErrorMessage,
  getControlPlaneNodeStatePublicationProfile,
  getControlPlaneRetryAfterMs,
  getNodeHeartbeatWatermark,
  isCoordinatorOwnedOperationType,
  isRetryableControlPlaneError,
  resolveControlPlaneNodeStatePublicationMode,
  resolveReadyNodePublicationAdvancementState,
  resolveReplayControlPlaneNodeStatePublicationMode,
} = REPLICA_DISPATCH_SERVICE_SHARED;

const READY_NODE_PUBLICATION_ADVANCEMENT_EMPTY_OPTIONS = Object.freeze({});
const READY_NODE_PUBLICATION_ADVANCEMENT_NODE_ROW_UNAVAILABLE = null;
const READY_NODE_PUBLICATION_RECONCILE_ALLOW_PENDING_VISIBILITY = true;
const READY_NODE_PUBLICATION_RECONCILE_ALLOW_PRESSURE_DEFER = false;
const READY_NODE_PUBLICATION_RECONCILE_SKIP_WRITE_READBACK = true;
const READY_NODE_PUBLICATION_RECONCILE_EMPTY_LIST = Object.freeze([]);
const READY_NODE_PUBLICATION_ADVANCEMENT_OPTION = Object.freeze({
  PUBLICATION_ROWS: 'publicationRows',
});
const READY_NODE_PUBLICATION_RECONCILE_FIELD = Object.freeze({
  ACKNOWLEDGED_NODE_IDS: 'acknowledgedNodeIds',
  ALLOW_PENDING_VISIBILITY: 'allowPendingVisibility',
  ALLOW_PRESSURE_DEFER: 'allowPressureDefer',
  LATEST_PUBLICATION_ROW: 'latestPublicationRow',
  PUBLISHED_ACTIVE_NODE_IDS: 'publishedActiveNodeIds',
  PUBLISHED_ACTIVE_NODE_IDS_SNAKE: 'published_active_node_ids',
  REQUIRED_ACK_NODE_IDS: 'requiredAckNodeIds',
  SKIP_PUBLICATION_WRITE_READBACK: 'skipPublicationWriteReadback',
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
        .filter((value) => value.length > NUM.ZERO),
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
      !this.isReplicaOperationLocallyOwned(row)
    ) {
      return false;
    }

    if (
      row.type === OperationType.REPLACE &&
      row.workflow_step === WORKFLOW_STEP.ACTIVE
    ) {
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

    if (
      row.workflow_step !== WORKFLOW_STEP.PENDING &&
      row.workflow_step !== WORKFLOW_STEP.SENDING
    ) {
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
    if (this.enqueueReplicaOperationRow(row, reasons)) {
      return true;
    }

    const workflowStep = row.workflow_step;
    const remoteReplayable =
      workflowStep === WORKFLOW_STEP.PENDING ||
      workflowStep === WORKFLOW_STEP.SENDING ||
      this.isDispatchReplayCreateTargetRearmOperation(row) ||
      (row.type === OperationType.REPLACE &&
        workflowStep === WORKFLOW_STEP.ACTIVE);
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
   * Build a comparable watermark from one NODE_STATE_UPDATE payload.
   * @param {Object} payload - Control-plane node-state payload.
   * @return {Object|null}
   * @private
   */
  getNodeStateUpdateWatermark(payload) {
    if (!payload || typeof payload !== TYPEOF.OBJECT) {
      return null;
    }

    const payloadNodeRow = payload[ControlPlaneField.NODE_ROW];
    const watermarkRow =
      payloadNodeRow && typeof payloadNodeRow === TYPEOF.OBJECT ?
        {...payloadNodeRow} :
        {};
    const heartbeatAt = Number(payload[ControlPlaneField.HEARTBEAT_AT]);
    const readyLeaseExpiresAt = Number(
      payload[ControlPlaneField.READY_LEASE_EXPIRES_AT],
    );
    if (Number.isFinite(heartbeatAt)) {
      watermarkRow[COLUMN.LAST_HEARTBEAT] = heartbeatAt;
    }
    if (Number.isFinite(readyLeaseExpiresAt)) {
      watermarkRow[COLUMN.READY_LEASE_EXPIRES_AT] = readyLeaseExpiresAt;
    }
    if (typeof payload[ControlPlaneField.STATE] === TYPEOF.STRING) {
      watermarkRow[COLUMN.CONNECTION_STATE] = payload[ControlPlaneField.STATE];
    }
    const watermark = getNodeHeartbeatWatermark(watermarkRow);
    if (!watermark) {
      return null;
    }
    if (
      watermark.lastHeartbeat === null &&
      watermark.readyLeaseExpiresAt === null &&
      watermark.connectionState === null
    ) {
      return null;
    }
    return watermark;
  }

  /**
   * Accept only forward node-state watermark progression.
   * @param {Object|null} previous - Previous watermark.
   * @param {Object|null} next - Candidate watermark.
   * @return {boolean}
   * @private
   */
  isNodeStateUpdateWatermarkNewer(previous, next) {
    if (!previous) {
      return true;
    }
    if (!next) {
      return true;
    }
    if (previous.lastHeartbeat === null && next.lastHeartbeat !== null) {
      return true;
    }
    if (previous.lastHeartbeat !== null && next.lastHeartbeat === null) {
      return false;
    }
    if (
      previous.readyLeaseExpiresAt === null &&
      next.readyLeaseExpiresAt !== null
    ) {
      return true;
    }
    if (
      previous.readyLeaseExpiresAt !== null &&
      next.readyLeaseExpiresAt === null
    ) {
      return false;
    }
    return (
      compareNodeHeartbeatWatermarks(previous, next) >
      REPLICA_DISPATCH_SERVICE_LITERAL.ZERO
    );
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
    if (Number.isFinite(numeric) && numeric > NUM.ZERO) {
      return Math.max(NUM.ONE, Math.floor(numeric));
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
      TYPEOF.FUNCTION
    ) {
      return null;
    }

    const timeoutMs = this.dispatchReadinessRefreshTimeoutMs;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= NUM.ZERO) {
      return this.controlPlaneReadinessService.getNodeReadiness(nodeId, {
        allowAuthoritativeRefresh: true,
        decisionDimension,
        maxCachedAgeMs: NUM.ZERO,
      });
    }

    let timeoutHandle = null;
    try {
      return await Promise.race([
        this.controlPlaneReadinessService.getNodeReadiness(nodeId, {
          allowAuthoritativeRefresh: true,
          decisionDimension,
          maxCachedAgeMs: NUM.ZERO,
        }),
        new Promise((_resolve, reject) => {
          timeoutHandle = this.setTimeoutFn(() => {
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

  /**
   * Build canonical write options for NODE_STATE_UPDATE persistence.
   * @param {string} nodeId
   * @param {string} nextState
   * @param {boolean} [isHeartbeatOnly=false]
   * @return {Object}
   * @private
   */
  resolveNodeStateUpdatePublicationMode(
    nextState,
    isHeartbeatOnly = false,
    payload = null,
  ) {
    return resolveControlPlaneNodeStatePublicationMode({
      publicationMode: payload?.[ControlPlaneField.NODE_STATE_PUBLICATION_MODE],
      heartbeatOnly: isHeartbeatOnly === true,
      state: nextState,
    });
  }

  buildDeferredNodeStateUpdatePayload(payload) {
    if (!payload || typeof payload !== TYPEOF.OBJECT) {
      return payload;
    }
    const isHeartbeatOnly = this.isHeartbeatOnlyNodeStateUpdate(payload);
    if (isHeartbeatOnly !== true) {
      return payload;
    }
    const nextPublicationMode =
      resolveReplayControlPlaneNodeStatePublicationMode({
        publicationMode:
          payload?.[ControlPlaneField.NODE_STATE_PUBLICATION_MODE],
        heartbeatOnly: isHeartbeatOnly,
        replayContext: CONTROL_PLANE_NODE_STATE_REPLAY_CONTEXT.DEFERRED_PENDING,
        state: payload?.[ControlPlaneField.STATE],
      });
    if (
      payload?.[ControlPlaneField.NODE_STATE_PUBLICATION_MODE] ===
      nextPublicationMode
    ) {
      return payload;
    }
    return {
      ...payload,
      [ControlPlaneField.NODE_STATE_PUBLICATION_MODE]: nextPublicationMode,
    };
  }

  buildNodeStateUpdateWriteOptions(
    nodeId,
    nextState,
    isHeartbeatOnly = false,
    payload = null,
  ) {
    const publicationMode = this.resolveNodeStateUpdatePublicationMode(
      nextState,
      isHeartbeatOnly,
      payload,
    );
    const publicationProfile = getControlPlaneNodeStatePublicationProfile({
      publicationMode,
    });
    return {
      allowCoalescing: true,
      allowPressureDefer: publicationProfile.allowPressureDefer,
      coalescingKey: `node-state:${nodeId}`,
      deliveryPriority: publicationProfile.deliveryPriority,
      pressureRetryAfterMs: this.nodeStateUpdateRetryAfterMs,
      queryTimeoutMs: this.nodeStateUpdateQueryTimeoutMs,
      skipCacheWait: true,
      workloadClass: publicationProfile.workloadClass,
      workClass: publicationProfile.workClass,
    };
  }

  resolveMembershipPublicationService() {
    const readinessService = this.controlPlaneReadinessService;
    if (!readinessService || typeof readinessService !== TYPEOF.OBJECT) {
      return null;
    }
    const membershipPublicationService =
      readinessService.membershipPublicationService;
    return membershipPublicationService &&
      typeof membershipPublicationService === TYPEOF.OBJECT ?
      membershipPublicationService :
      null;
  }

  normalizeMembershipPublicationStatus(status) {
    return typeof status === TYPEOF.STRING ? status.toUpperCase() : null;
  }

  buildReadyNodePublicationAdvancementOptions(publicationRow) {
    if (!publicationRow || typeof publicationRow !== TYPEOF.OBJECT) {
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
        TYPEOF.FUNCTION ||
      typeof membershipPublicationService.getLatestPublicationForNodeSync !==
        TYPEOF.FUNCTION
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
      publishedActiveNodeIds: normalizeReadyNodePublicationReconcileNodeIds(
        latestPublicationRow?.[
          READY_NODE_PUBLICATION_RECONCILE_FIELD.PUBLISHED_ACTIVE_NODE_IDS
        ] ||
          latestPublicationRow?.[
            READY_NODE_PUBLICATION_RECONCILE_FIELD
              .PUBLISHED_ACTIVE_NODE_IDS_SNAKE
          ],
      ),
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
        MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED
    ) {
      return context;
    }
    const publishedActiveNodeIds = normalizeReadyNodePublicationReconcileNodeIds([
      ...normalizeReadyNodePublicationReconcileNodeIds(
        publicationAdvancement.publishedActiveNodeIds,
      ),
      nodeId,
    ]);
    if (publishedActiveNodeIds.length === NUM.ZERO) {
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
      [READY_NODE_PUBLICATION_RECONCILE_FIELD.ALLOW_PENDING_VISIBILITY]:
        READY_NODE_PUBLICATION_RECONCILE_ALLOW_PENDING_VISIBILITY,
      [READY_NODE_PUBLICATION_RECONCILE_FIELD.ALLOW_PRESSURE_DEFER]:
        READY_NODE_PUBLICATION_RECONCILE_ALLOW_PRESSURE_DEFER,
      [READY_NODE_PUBLICATION_RECONCILE_FIELD.SKIP_PUBLICATION_WRITE_READBACK]:
        READY_NODE_PUBLICATION_RECONCILE_SKIP_WRITE_READBACK,
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
    if (publicationAdvancement.needsAcknowledgement === true) {
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
    if (!nodeId || !this.isNodeReady(nodeId)) {
      return false;
    }
    this.scheduleReadyNodeMembershipPublicationAdvance(
      nodeId,
      READY_NODE_PUBLICATION_ADVANCEMENT_NODE_ROW_UNAVAILABLE,
      reason,
      this.buildReadyNodePublicationAdvancementOptions(publicationRow),
    );
    return true;
  }

  resolveMembershipPublicationAckRetryAfterMs(error) {
    const retryAfterMs = getControlPlaneRetryAfterMs(error);
    if (Number.isFinite(retryAfterMs) && retryAfterMs > NUM.ZERO) {
      return Math.max(NUM.ONE, Math.floor(retryAfterMs));
    }
    return this.nodeStateUpdateRetryAfterMs;
  }

  armDeferredMembershipPublicationAckRetry(nodeId, retryAfterMs) {
    return this.setTimeoutFn(() => {
      this.membershipPublicationAckDeferredRetries.delete(nodeId);
      if (!this.isNodeReady(nodeId)) {
        return;
      }
      this.scheduleReadyNodeMembershipPublicationAdvance(
        nodeId,
        READY_NODE_PUBLICATION_ADVANCEMENT_NODE_ROW_UNAVAILABLE,
        RECONCILE_REASON.CONTROL_PLANE_PUBLICATION_ACK_RETRY,
      );
    }, retryAfterMs);
  }

  deferMembershipPublicationAckRetry(nodeId, error) {
    if (!nodeId || !isRetryableControlPlaneError(error)) {
      return false;
    }
    const retryAfterMs =
      this.resolveMembershipPublicationAckRetryAfterMs(error);
    const desiredAttemptAt = Date.now() + retryAfterMs;
    const existing =
      this.membershipPublicationAckDeferredRetries.get(nodeId);
    if (existing) {
      existing.error = getControlPlaneErrorMessage(error);
      if (desiredAttemptAt < existing.nextAttemptAt) {
        if (existing.timeoutHandle) {
          this.clearTimeoutFn(existing.timeoutHandle);
        }
        existing.nextAttemptAt = desiredAttemptAt;
        existing.timeoutHandle = this.armDeferredMembershipPublicationAckRetry(
          nodeId,
          retryAfterMs,
        );
      }
      return true;
    }

    this.membershipPublicationAckDeferredRetries.set(nodeId, {
      error: getControlPlaneErrorMessage(error),
      nextAttemptAt: desiredAttemptAt,
      timeoutHandle: this.armDeferredMembershipPublicationAckRetry(
        nodeId,
        retryAfterMs,
      ),
    });
    this.logger.info(DISPATCH_LOG_MSG.MEMBERSHIP_PUBLICATION_ACK_DEFERRED, {
      nodeId,
      retryAfterMs,
      error: getControlPlaneErrorMessage(error),
    });
    return true;
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
        TYPEOF.FUNCTION
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
        TYPEOF.FUNCTION
    ) {
      return null;
    }

    try {
      if (options === READY_NODE_PUBLICATION_ADVANCEMENT_EMPTY_OPTIONS) {
        return await membershipPublicationService.acknowledgeMembershipPublicationForNode(
          nodeId,
        );
      }
      return await membershipPublicationService.acknowledgeMembershipPublicationForNode(
        nodeId,
        options,
      );
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
