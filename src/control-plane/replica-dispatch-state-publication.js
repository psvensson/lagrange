import {REPLICA_DISPATCH_SERVICE_SHARED} from './replica-dispatch-service-shared.js';

const {
  COLUMN,
  CONTROL_PLANE_ALLOWED_STATES,
  ControlPlaneField,
  DISPATCH_LOG_MSG,
  DISPATCH_READINESS_ERROR_REASON,
  RECONCILE_REASON,
  REPLICA_DISPATCH_SERVICE_LITERAL,
  SERVICE_STATUS,
  STATE,
  STRING,
  SYSTEM_TABLE_NAME,
  getNodeHeartbeatWatermark,
  isRetryableControlPlaneError,
  wasNodeRecordReadyWhenWritten,
} = REPLICA_DISPATCH_SERVICE_SHARED;

const REPLICA_DISPATCH_STATE_PUBLICATION_METHODS = Object.freeze({
  enqueueNodeStateUpdate(payload) {
    const nodeId = payload?.[ControlPlaneField.NODE_ID];
    const state = payload?.[ControlPlaneField.STATE];
    if (!nodeId || !state) {
      return false;
    }
    if (!CONTROL_PLANE_ALLOWED_STATES.includes(state)) {
      return false;
    }

    const nextWatermark = this.getNodeStateUpdateWatermark(payload);
    const previousWatermark =
      this.nodeStateUpdateWatermarks.get(nodeId) || null;
    if (
      !this.isNodeStateUpdateWatermarkNewer(previousWatermark, nextWatermark)
    ) {
      this.logger.debug(DISPATCH_LOG_MSG.NODE_STATE_UPDATE_SKIPPED, {
        nodeId,
        reason: REPLICA_DISPATCH_SERVICE_LITERAL.STALE_OR_DUPLICATE_ENQUEUE,
      });
      return false;
    }

    if (nextWatermark) {
      this.nodeStateUpdateWatermarks.set(nodeId, nextWatermark);
    }

    if (this.replaceDeferredNodeStateUpdatePayload(nodeId, payload)) {
      this.logger.debug(DISPATCH_LOG_MSG.NODE_STATE_UPDATE_DEFERRED, {
        nodeId,
        reason: REPLICA_DISPATCH_SERVICE_LITERAL.DEFERRED_RETRY_PENDING,
      });
      return false;
    }

    const nodeStateUpdateQueue = this.resolveNodeStateUpdateQueue(nodeId);
    const enqueued = nodeStateUpdateQueue.enqueue(
      nodeId,
      RECONCILE_REASON.NODE_STATE_UPDATE_MESSAGE,
      {payload},
    );
    this.logger.debug(DISPATCH_LOG_MSG.ENQUEUE_NODE_STATE_UPDATE, {
      nodeId,
      enqueued,
    });
    return enqueued;
  },

  async handleNodeStateUpdate(payload) {
    const nodeId = payload[ControlPlaneField.NODE_ID];
    const state = payload[ControlPlaneField.STATE];
    const payloadNodeRow = payload[ControlPlaneField.NODE_ROW];
    const isHeartbeatOnly = this.isHeartbeatOnlyNodeStateUpdate(payload);
    const nodeRow =
      payloadNodeRow && typeof payloadNodeRow === 'object' ?
        payloadNodeRow :
        null;

    if (!nodeId || !state) {
      return;
    }

    if (!CONTROL_PLANE_ALLOWED_STATES.includes(state)) {
      return;
    }

    const existing = await this.getNodeRow(nodeId);
    const payloadWatermark = this.getNodeStateUpdateWatermark(payload);
    const now = Date.now();
    const existingConnectionState = String(
      existing?.[COLUMN.CONNECTION_STATE] || '',
    ).toLowerCase();
    const existingReadyLeaseExpiresAt = Number(
      existing?.[COLUMN.READY_LEASE_EXPIRES_AT],
    );
    const requestedHeartbeatAt = Number(
      payload[ControlPlaneField.HEARTBEAT_AT],
    );
    const heartbeatAt = Number.isFinite(requestedHeartbeatAt) ?
      Math.max(requestedHeartbeatAt, now) :
      now;
    const requestedLeaseExpiry =
      payload[ControlPlaneField.READY_LEASE_EXPIRES_AT];
    const promotedToReadyFromConnected =
      state === STATE.CONNECTED &&
      existingConnectionState === STATE.READY &&
      Number.isFinite(existingReadyLeaseExpiresAt) &&
      existingReadyLeaseExpiresAt > now;
    const nextState = promotedToReadyFromConnected ? STATE.READY : state;
    const readyLeaseExpiresAt =
      nextState === STATE.READY ?
        Number.isFinite(requestedLeaseExpiry) &&
          requestedLeaseExpiry > heartbeatAt ?
          requestedLeaseExpiry :
          heartbeatAt + this.readyLeaseMs :
        null;
    const existingWatermark = getNodeHeartbeatWatermark(existing);
    const effectiveReadyWatermark = {
      lastHeartbeat: heartbeatAt,
      readyLeaseExpiresAt,
      connectionState: nextState,
    };
    const staleCheckWatermark =
      state === STATE.READY ? effectiveReadyWatermark : payloadWatermark;
    if (
      !this.isNodeStateUpdateWatermarkNewer(
        existingWatermark,
        staleCheckWatermark,
      )
    ) {
      if (
        state === STATE.READY &&
        isHeartbeatOnly === true &&
        wasNodeRecordReadyWhenWritten(existing, {
          requireActiveStatus: true,
        })
      ) {
        await this.maybeAdvanceReadyNodeMembershipPublication(nodeId, existing);
      }
      if (
        state === STATE.READY &&
        !isHeartbeatOnly &&
        wasNodeRecordReadyWhenWritten(existing, {
          requireActiveStatus: true,
        })
      ) {
        const publicationAdvancement =
          typeof this.resolveReadyNodePublicationAdvancement ===
            'function' ?
            this.resolveReadyNodePublicationAdvancement(nodeId) :
            null;
        const publicationReconcileContext =
          typeof this.buildReadyNodePublicationReconcileContext ===
            'function' ?
            this.buildReadyNodePublicationReconcileContext(
              nodeId,
              existing,
              publicationAdvancement,
            ) :
            {
              nodeId,
              state: STATE.READY,
              nodeRow: existing,
            };
        this.enqueueMembershipPublicationReconcile(
          RECONCILE_REASON.NODE_STATE_UPDATE_READY,
          publicationReconcileContext,
        );
        this.nodeReadyRetryQueue.enqueue(
          nodeId,
          RECONCILE_REASON.NODE_STATE_UPDATE_READY,
          {nodeRow: existing},
        );
        await this.acknowledgeMembershipPublicationForNode(nodeId);
      }
      this.logger.debug(DISPATCH_LOG_MSG.NODE_STATE_UPDATE_SKIPPED, {
        nodeId,
        reason: REPLICA_DISPATCH_SERVICE_LITERAL.STALE_AGAINST_EXISTING_ROW,
      });
      return;
    }
    const baseRow = this.buildNodeStateUpdateRow({
      nodeId,
      nodeRow,
      existing,
      nextState,
      heartbeatAt,
      readyLeaseExpiresAt,
      payloadNodeAddress: payload[ControlPlaneField.NODE_ADDRESS],
      payload,
      isHeartbeatOnly,
    });

    const updateResult =
      await this.getControlPlaneSystemTableGateway().updateSystemTableRow(
        SYSTEM_TABLE_NAME.NODES,
        {[COLUMN.NODE_ID]: nodeId},
        baseRow,
        this.buildNodeStateUpdateWriteOptions(
          nodeId,
          nextState,
          isHeartbeatOnly,
          payload,
        ),
      );
    const updateAffectedRows = Number(
      updateResult?.partitionResult?.affectedRows,
    );
    if (updateAffectedRows === 0) {
      const bootstrapped = await this.tryBootstrapMissingNodeStateUpdateRow(
        nodeId,
        nextState,
        baseRow,
        existing,
        isHeartbeatOnly,
        payload,
      );
      if (!bootstrapped) {
        throw await this.resolveMissingNodeRowUpdateError(nodeId, existing);
      }
    }

    if (nextState === STATE.READY && !isHeartbeatOnly) {
      const publicationNodeRow = {
        ...existing,
        [COLUMN.NODE_ID]: nodeId,
        ...baseRow,
      };
      const publicationAdvancement =
        typeof this.resolveReadyNodePublicationAdvancement ===
          'function' ?
          this.resolveReadyNodePublicationAdvancement(nodeId) :
          null;
      const publicationReconcileContext =
        typeof this.buildReadyNodePublicationReconcileContext ===
          'function' ?
          this.buildReadyNodePublicationReconcileContext(
            nodeId,
            publicationNodeRow,
            publicationAdvancement,
          ) :
          {
            nodeId,
            state: nextState,
            nodeRow: publicationNodeRow,
          };
      this.enqueueMembershipPublicationReconcile(
        RECONCILE_REASON.NODE_STATE_UPDATE_READY,
        publicationReconcileContext,
      );
      this.nodeReadyRetryQueue.enqueue(
        nodeId,
        RECONCILE_REASON.NODE_STATE_UPDATE_READY,
        {
          nodeRow: publicationNodeRow,
        },
      );
      await this.acknowledgeMembershipPublicationForNode(nodeId);
      return;
    }

    if (nextState === STATE.READY && isHeartbeatOnly) {
      await this.maybeAdvanceReadyNodeMembershipPublication(nodeId, {
        ...existing,
        [COLUMN.NODE_ID]: nodeId,
        ...baseRow,
      });
    }

    this.clearNodeReadyRetryWatermark(nodeId);
  },

  buildNodeStateUpdateRow(options) {
    const {
      nodeId,
      nodeRow,
      existing,
      nextState,
      heartbeatAt,
      readyLeaseExpiresAt,
      payloadNodeAddress,
      payload,
      isHeartbeatOnly,
    } = options || {};

    const baseNodeAddress =
      payloadNodeAddress ||
      nodeRow?.[COLUMN.NODE_ADDRESS] ||
      existing?.[COLUMN.NODE_ADDRESS] ||
      STRING.UNKNOWN;

    if (isHeartbeatOnly === true) {
      const payloadCapabilities = payload?.[ControlPlaneField.CAPABILITIES];
      const capabilities = Array.isArray(payloadCapabilities) ?
        JSON.stringify(payloadCapabilities) :
        typeof payloadCapabilities === 'string' ?
          payloadCapabilities :
          existing?.[COLUMN.CAPABILITIES] || STRING.EMPTY_JSON_ARRAY;
      const heartbeatOnlyRow = {
        [COLUMN.NODE_ID]: nodeId,
        [COLUMN.NODE_ADDRESS]: baseNodeAddress,
        [COLUMN.CONNECTION_STATE]: nextState,
        [COLUMN.LAST_HEARTBEAT]: heartbeatAt,
        [COLUMN.READY_LEASE_EXPIRES_AT]: readyLeaseExpiresAt,
      };
      if (
        nextState === STATE.READY &&
        capabilities !== STRING.EMPTY_JSON_ARRAY
      ) {
        heartbeatOnlyRow[COLUMN.CAPABILITIES] = capabilities;
      }
      if (
        this.shouldReviveHeartbeatOnlyNodeStatus({
          existing,
          isHeartbeatOnly,
          nextState,
        })
      ) {
        heartbeatOnlyRow[COLUMN.STATUS] = SERVICE_STATUS.ACTIVE;
      }
      return heartbeatOnlyRow;
    }

    const payloadCapabilities = payload?.[ControlPlaneField.CAPABILITIES];
    const capabilities = Array.isArray(payloadCapabilities) ?
      JSON.stringify(payloadCapabilities) :
      typeof payloadCapabilities === 'string' ?
        payloadCapabilities :
        existing?.[COLUMN.CAPABILITIES] || STRING.EMPTY_JSON_ARRAY;

    return {
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.NODE_ADDRESS]: baseNodeAddress,
      [COLUMN.CPU_CORES]: Number.isFinite(nodeRow?.[COLUMN.CPU_CORES]) ?
        nodeRow[COLUMN.CPU_CORES] :
        existing?.[COLUMN.CPU_CORES] || 0,
      [COLUMN.MEMORY_MB]: Number.isFinite(nodeRow?.[COLUMN.MEMORY_MB]) ?
        nodeRow[COLUMN.MEMORY_MB] :
        existing?.[COLUMN.MEMORY_MB] || 0,
      [COLUMN.DISK_GB]: Number.isFinite(nodeRow?.[COLUMN.DISK_GB]) ?
        nodeRow[COLUMN.DISK_GB] :
        existing?.[COLUMN.DISK_GB] || 0,
      [COLUMN.CPU_USAGE_PERCENT]: Number.isFinite(
        nodeRow?.[COLUMN.CPU_USAGE_PERCENT],
      ) ?
        nodeRow[COLUMN.CPU_USAGE_PERCENT] :
        existing?.[COLUMN.CPU_USAGE_PERCENT] || 0,
      [COLUMN.MEMORY_USAGE_PERCENT]: Number.isFinite(
        nodeRow?.[COLUMN.MEMORY_USAGE_PERCENT],
      ) ?
        nodeRow[COLUMN.MEMORY_USAGE_PERCENT] :
        existing?.[COLUMN.MEMORY_USAGE_PERCENT] || 0,
      [COLUMN.DISK_USAGE_PERCENT]: Number.isFinite(
        nodeRow?.[COLUMN.DISK_USAGE_PERCENT],
      ) ?
        nodeRow[COLUMN.DISK_USAGE_PERCENT] :
        existing?.[COLUMN.DISK_USAGE_PERCENT] || 0,
      [COLUMN.STATUS]:
        nextState === STATE.READY ?
          SERVICE_STATUS.ACTIVE :
          typeof nodeRow?.[COLUMN.STATUS] === 'string' &&
              nodeRow[COLUMN.STATUS].length > 0 ?
            nodeRow[COLUMN.STATUS] :
            existing?.[COLUMN.STATUS] || SERVICE_STATUS.ACTIVE,
      [COLUMN.CONNECTION_STATE]: nextState,
      [COLUMN.CAPABILITIES]: capabilities,
      [COLUMN.LAST_HEARTBEAT]: heartbeatAt,
      [COLUMN.READY_LEASE_EXPIRES_AT]: readyLeaseExpiresAt,
      ...this.resolveNodeStateUpdateBudgetFields(nodeRow),
    };
  },

  isHeartbeatOnlyNodeStateUpdate(payload) {
    return payload?.[ControlPlaneField.HEARTBEAT_ONLY] === true;
  },

  shouldReviveHeartbeatOnlyNodeStatus(options = {}) {
    if (
      options.isHeartbeatOnly !== true ||
      options.nextState !== STATE.READY
    ) {
      return false;
    }
    const existingStatus =
      typeof options.existing?.[COLUMN.STATUS] === 'string' ?
        options.existing[COLUMN.STATUS].toLowerCase() :
        options.existing?.[COLUMN.STATUS];
    return existingStatus !== SERVICE_STATUS.ACTIVE;
  },

  async tryBootstrapMissingNodeStateUpdateRow(
    nodeId,
    nextState,
    baseRow,
    existing,
    isHeartbeatOnly,
    payload = null,
  ) {
    if (!baseRow || typeof baseRow !== 'object') {
      return false;
    }
    if (existing?.[COLUMN.NODE_ID]) {
      return false;
    }
    if (nextState !== STATE.CONNECTED && nextState !== STATE.READY) {
      return false;
    }
    const nodeAddress = String(baseRow?.[COLUMN.NODE_ADDRESS] || '').trim();
    if (nodeAddress.length === 0 || nodeAddress === STRING.UNKNOWN) {
      return false;
    }

    const gateway = this.getControlPlaneSystemTableGateway();
    if (typeof gateway.upsertSystemTableRow !== 'function') {
      return false;
    }

    try {
      const upsertResult = await gateway.upsertSystemTableRow(
        SYSTEM_TABLE_NAME.NODES,
        baseRow,
        this.buildNodeStateUpdateWriteOptions(
          nodeId,
          nextState,
          isHeartbeatOnly,
          payload,
        ),
      );
      if (upsertResult?.success === false) {
        const upsertError = new Error(
          'Failed to bootstrap missing node row from NODE_STATE_UPDATE: ' +
            String(
              upsertResult.error || DISPATCH_READINESS_ERROR_REASON.UNKNOWN,
            ),
        );
        upsertError.code =
          upsertResult.error ||
          REPLICA_DISPATCH_SERVICE_LITERAL.NODE_STATE_UPDATE_BOOTSTRAP_UPSERT_FAILED;
        if (upsertResult.deferRetry === true) {
          upsertError.deferRetry = true;
          upsertError.retryAfterMs = Number.isFinite(upsertResult.retryAfterMs) ?
            upsertResult.retryAfterMs :
            this.nodeStateUpdateRetryAfterMs;
        }
        throw upsertError;
      }
      this.logger.info(DISPATCH_LOG_MSG.NODE_STATE_UPDATE_BOOTSTRAP_UPSERTED, {
        nodeId,
        state: nextState,
      });
      return true;
    } catch (error) {
      if (error?.deferRetry === true || isRetryableControlPlaneError(error)) {
        error.deferRetry = true;
        error.retryAfterMs = Number.isFinite(error?.retryAfterMs) ?
          error.retryAfterMs :
          this.nodeStateUpdateRetryAfterMs;
      }
      throw error;
    }
  },
});

export {REPLICA_DISPATCH_STATE_PUBLICATION_METHODS};
