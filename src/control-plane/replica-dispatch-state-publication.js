import {REPLICA_DISPATCH_SERVICE_SHARED} from './replica-dispatch-service-shared.js';

const {
  COLUMN,
  CONTROL_PLANE_ALLOWED_STATES,
  CONTROL_PLANE_MESSAGE_COMPLETION_FIELD,
  ControlPlaneField,
  DISPATCH_LOG_MSG,
  NODE_STATE,
  RECONCILE_REASON,
  REPLICA_DISPATCH_SERVICE_LITERAL,
  SERVICE_STATUS,
  STATE,
  STRING,
  SYSTEM_TABLE_NAME,
  buildStaleNodeIncarnationError,
  getControlPlaneMessageCompletionKind,
  getNodeHeartbeatWatermark,
  isRetryableControlPlaneError,
  normalizeKnownNodeBootIncarnation,
  wasNodeRecordReadyWhenWritten,
} = REPLICA_DISPATCH_SERVICE_SHARED;

const arrayPrototypeIncludes = Function.call.bind(Array.prototype.includes);
const arrayIsArray = Array.isArray;
const mapPrototypeGet = Function.call.bind(Map.prototype.get);
const mapPrototypeSet = Function.call.bind(Map.prototype.set);
const mathMax = Math.max;
const numberIsFinite = Number.isFinite;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const stringConstructor = String;

const OWN_DATA_VALUE_FIELD = 'value';
const NO_NODE_STATE_UPDATE_COMPLETION_ROW = Object.freeze({});

function readOwnData(source, field) {
  if (!source || typeof source !== 'object') return undefined;
  const descriptor = objectGetOwnPropertyDescriptor(source, field);
  return descriptor && objectHasOwn(descriptor, OWN_DATA_VALUE_FIELD) ?
    descriptor.value : undefined;
}

// The boot-incarnation fence, resolved against the receiver's best-known
// incarnation for one nodeId (the durable row's boot_incarnation column when
// visible, and always the retained per-node high-water map). A writer whose
// incarnation is LOWER is a zombie and the fence throws the terminal stale
// error before any heartbeat clamp can lift it. UNKNOWN on either side
// (0 / pre-incarnation) never fences, matching the clusterId UNKNOWN policy.
function resolveNodeBootIncarnationFence(nodeId, payload, watermarks, existingRow) {
  const payloadBootIncarnation = normalizeKnownNodeBootIncarnation(
    readOwnData(payload, ControlPlaneField.BOOT_INCARNATION),
  );
  const knownBootIncarnation = mathMax(
    normalizeKnownNodeBootIncarnation(
      readOwnData(existingRow, COLUMN.BOOT_INCARNATION),
    ),
    normalizeKnownNodeBootIncarnation(mapPrototypeGet(watermarks, nodeId)),
  );
  if (
    payloadBootIncarnation > 0 &&
    knownBootIncarnation > 0 &&
    payloadBootIncarnation < knownBootIncarnation
  ) {
    throw buildStaleNodeIncarnationError({
      nodeId,
      receivedIncarnation: payloadBootIncarnation,
      knownIncarnation: knownBootIncarnation,
    });
  }
  return {payloadBootIncarnation, knownBootIncarnation};
}

// Accepted update: retain the freshest known boot incarnation so the fence
// keeps working while the durable row is not yet visible.
function retainNodeBootIncarnationWatermark(watermarks, nodeId, fence) {
  if (fence.payloadBootIncarnation > 0) {
    mapPrototypeSet(
      watermarks,
      nodeId,
      mathMax(fence.payloadBootIncarnation, fence.knownBootIncarnation),
    );
  }
}

function buildNodeStateUpdateCompletionRow(expectedRow, updateResult) {
  const originHlc = updateResult?.partitionResult?.originHlc;
  if (typeof originHlc !== 'string' || originHlc.length === 0) {
    return NO_NODE_STATE_UPDATE_COMPLETION_ROW;
  }
  return {
    ...expectedRow,
    [COLUMN.UPDATED_AT_HLC]: originHlc,
  };
}

function nodeStateUpdateCompletionRowMatches(nodeId, row, expectedRow) {
  return row?.[COLUMN.NODE_ID] === nodeId &&
    row?.[COLUMN.STATUS] === expectedRow?.[COLUMN.STATUS] &&
    row?.[COLUMN.CONNECTION_STATE] ===
      expectedRow?.[COLUMN.CONNECTION_STATE] &&
    Number(row?.[COLUMN.LAST_HEARTBEAT]) >=
      Number(expectedRow?.[COLUMN.LAST_HEARTBEAT]);
}

function buildNodeStateUpdateWhereClause(existing, payloadBootIncarnation) {
  return {
    [COLUMN.NODE_ID]: existing[COLUMN.NODE_ID],
    [COLUMN.BOOT_INCARNATION]: payloadBootIncarnation,
    [COLUMN.STATUS]: existing[COLUMN.STATUS],
    [COLUMN.CONNECTION_STATE]: existing[COLUMN.CONNECTION_STATE],
    [COLUMN.LAST_HEARTBEAT]: existing[COLUMN.LAST_HEARTBEAT],
    [COLUMN.CREATED_AT]: existing[COLUMN.CREATED_AT],
  };
}

function nodeStateDestinationMatches(row, expectedRow, payloadBootIncarnation) {
  return row?.[COLUMN.NODE_ID] === expectedRow?.[COLUMN.NODE_ID] &&
    normalizeKnownNodeBootIncarnation(row?.[COLUMN.BOOT_INCARNATION]) ===
      payloadBootIncarnation &&
    row?.[COLUMN.STATUS] === expectedRow?.[COLUMN.STATUS] &&
    row?.[COLUMN.CONNECTION_STATE] ===
      expectedRow?.[COLUMN.CONNECTION_STATE] &&
    Number(row?.[COLUMN.LAST_HEARTBEAT]) >=
      Number(expectedRow?.[COLUMN.LAST_HEARTBEAT]);
}

function nodeStateRegistrationAlreadyActivated(
  row,
  source,
  payloadBootIncarnation,
) {
  return source?.[COLUMN.STATUS] === NODE_STATE.JOINING &&
    normalizeKnownNodeBootIncarnation(
      row?.[COLUMN.BOOT_INCARNATION],
    ) === payloadBootIncarnation &&
    row?.[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE &&
    row?.[COLUMN.CONNECTION_STATE] === STATE.READY;
}

function nodeStateSourceLifecycleMatches(observed, source) {
  return observed?.[COLUMN.NODE_ID] === source?.[COLUMN.NODE_ID] &&
    observed?.[COLUMN.BOOT_INCARNATION] ===
      source?.[COLUMN.BOOT_INCARNATION] &&
    observed?.[COLUMN.STATUS] === source?.[COLUMN.STATUS] &&
    observed?.[COLUMN.CONNECTION_STATE] ===
      source?.[COLUMN.CONNECTION_STATE] &&
    observed?.[COLUMN.CREATED_AT] === source?.[COLUMN.CREATED_AT];
}

function buildNodeStatePublicationError(code, options = {}) {
  const error = new Error(code);
  error.code = code;
  error.nodeId = options.nodeId || null;
  error.receivedIncarnation = options.receivedIncarnation || null;
  error.knownIncarnation = options.knownIncarnation || null;
  if (options.deferRetry === true) {
    error.deferRetry = true;
    error.retryAfterMs = options.retryAfterMs;
  }
  if (options.cause) error.cause = options.cause;
  return error;
}

const REPLICA_DISPATCH_STATE_PUBLICATION_METHODS = objectFreeze({
  enqueueNodeStateUpdate(payload, options = {}) {
    const nodeId = payload?.[ControlPlaneField.NODE_ID];
    const state = payload?.[ControlPlaneField.STATE];
    if (!nodeId || !state) {
      return false;
    }
    if (!arrayPrototypeIncludes(CONTROL_PLANE_ALLOWED_STATES, state)) {
      return false;
    }

    const nextWatermark = this.getNodeStateUpdateWatermark(payload);
    const previousWatermark =
      mapPrototypeGet(this.nodeStateUpdateWatermarks, nodeId) || null;
    const awaitCompletion = options.awaitCompletion === true;
    if (
      !this.isNodeStateUpdateWatermarkNewer(previousWatermark, nextWatermark)
    ) {
      if (awaitCompletion) {
        return this.enqueueNodeStateUpdateWork(nodeId, payload, true);
      }
      this.logger.debug(DISPATCH_LOG_MSG.NODE_STATE_UPDATE_SKIPPED, {
        nodeId,
        reason: REPLICA_DISPATCH_SERVICE_LITERAL.STALE_OR_DUPLICATE_ENQUEUE,
      });
      return false;
    }

    if (nextWatermark) {
      mapPrototypeSet(this.nodeStateUpdateWatermarks, nodeId, nextWatermark);
    }

    if (this.replaceDeferredNodeStateUpdatePayload(nodeId, payload)) {
      this.logger.debug(DISPATCH_LOG_MSG.NODE_STATE_UPDATE_DEFERRED, {
        nodeId,
        reason: REPLICA_DISPATCH_SERVICE_LITERAL.DEFERRED_RETRY_PENDING,
      });
      return false;
    }

    const enqueued = this.enqueueNodeStateUpdateWork(
      nodeId,
      payload,
      awaitCompletion,
    );
    this.logger.debug(DISPATCH_LOG_MSG.ENQUEUE_NODE_STATE_UPDATE, {
      nodeId,
      enqueued,
    });
    return enqueued;
  },

  enqueueNodeStateUpdateWork(nodeId, payload, awaitCompletion) {
    const nodeStateUpdateQueue = this.resolveNodeStateUpdateQueue(nodeId);
    const context = {
      payload,
      requireDurableCompletion: awaitCompletion,
    };
    if (awaitCompletion) {
      return nodeStateUpdateQueue.enqueueAndWait(
        nodeId,
        RECONCILE_REASON.NODE_STATE_UPDATE_MESSAGE,
        context,
      );
    }
    return nodeStateUpdateQueue.enqueue(
      nodeId,
      RECONCILE_REASON.NODE_STATE_UPDATE_MESSAGE,
      context,
    );
  },

  enqueueNodeStateUpdateAndWait(payload) {
    return this.enqueueNodeStateUpdate(payload, {awaitCompletion: true});
  },

  async publishNodeStateUpdateAndWait(payload) {
    const authoritativeRow = await this.enqueueNodeStateUpdateAndWait(payload);
    return {
      completionKind: getControlPlaneMessageCompletionKind(payload?.type),
      completionCompleted: true,
      [CONTROL_PLANE_MESSAGE_COMPLETION_FIELD.AUTHORITATIVE_ROW]:
        authoritativeRow,
      [CONTROL_PLANE_MESSAGE_COMPLETION_FIELD.AUTHORITATIVE_OBSERVED_AT_MS]:
        Date.now(),
    };
  },

  async handleNodeStateUpdate(payload, options = {}) {
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

    if (!arrayPrototypeIncludes(CONTROL_PLANE_ALLOWED_STATES, state)) {
      return;
    }

    const existing = await this.readAuthoritativeNodeStateSource(nodeId);
    const payloadBootIncarnation = normalizeKnownNodeBootIncarnation(
      readOwnData(payload, ControlPlaneField.BOOT_INCARNATION),
    );
    if (payloadBootIncarnation === 0) {
      throw buildNodeStatePublicationError(
        REPLICA_DISPATCH_SERVICE_LITERAL.NODE_STATE_UPDATE_INCARNATION_REQUIRED,
        {nodeId},
      );
    }
    const incarnationFence = resolveNodeBootIncarnationFence(
      nodeId,
      payload,
      this.nodeBootIncarnationWatermarks,
      existing,
    );
    const payloadWatermark = this.getNodeStateUpdateWatermark(payload);
    const now = Date.now();
    const existingConnectionState = stringConstructor(
      existing?.[COLUMN.CONNECTION_STATE] || '',
    ).toLowerCase();
    const existingReadyLeaseExpiresAt = Number(
      existing?.[COLUMN.READY_LEASE_EXPIRES_AT],
    );
    const requestedHeartbeatAt = Number(
      payload[ControlPlaneField.HEARTBEAT_AT],
    );
    const heartbeatAt = numberIsFinite(requestedHeartbeatAt) ?
      mathMax(requestedHeartbeatAt, now) :
      now;
    const promotedToReadyFromConnected =
      state === STATE.CONNECTED &&
      existingConnectionState === STATE.READY &&
      numberIsFinite(existingReadyLeaseExpiresAt) &&
      existingReadyLeaseExpiresAt > now;
    const nextState = promotedToReadyFromConnected ? STATE.READY : state;
    const existingStatus = existing?.[COLUMN.STATUS];
    if (
      nextState === STATE.READY &&
      existingStatus !== NODE_STATE.JOINING &&
      existingStatus !== SERVICE_STATUS.ACTIVE
    ) {
      throw buildNodeStatePublicationError(
        REPLICA_DISPATCH_SERVICE_LITERAL.NODE_STATE_UPDATE_SOURCE_CHANGED,
        {nodeId},
      );
    }
    // The canonical write owner grants the lease. Forwarding latency must not
    // consume a sender-stamped lease before the nodes row becomes durable.
    const readyLeaseExpiresAt =
      nextState === STATE.READY ?
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
      return existing;
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
      incarnationFence,
    });

    const expectedRow = {
      ...existing,
      [COLUMN.NODE_ID]: nodeId,
      ...baseRow,
    };
    const whereClause = buildNodeStateUpdateWhereClause(
      existing,
      payloadBootIncarnation,
    );
    let updateResult = null;
    let writeError = null;
    try {
      updateResult =
        await this.getControlPlaneSystemTableGateway().updateSystemTableRow(
          SYSTEM_TABLE_NAME.NODES,
          whereClause,
          baseRow,
          this.buildNodeStateUpdateWriteOptions(
            nodeId,
            nextState,
            isHeartbeatOnly,
            payload,
          ),
        );
      if (updateResult?.success === false) {
        writeError = buildNodeStatePublicationError(
          updateResult.error ||
            REPLICA_DISPATCH_SERVICE_LITERAL
              .NODE_STATE_UPDATE_DESTINATION_NOT_OBSERVED,
          {nodeId},
        );
      }
    } catch (error) {
      writeError = error;
    }

    const updateAffectedRows = Number(
      updateResult?.partitionResult?.affectedRows,
    );
    const mustObserveDestination = writeError !== null ||
      updateAffectedRows === 0 ||
      (
        options.requireDurableCompletion === true &&
        typeof updateResult?.partitionResult?.originHlc !== 'string'
      );

    const publicationNodeRow = await this.resolveNodeStatePublicationRow({
      mustObserveDestination,
      requireDurableCompletion: options.requireDurableCompletion === true,
      nodeId,
      payloadBootIncarnation,
      expectedRow,
      sourceRow: existing,
      writeError,
      updateResult,
    });

    retainNodeBootIncarnationWatermark(
      this.nodeBootIncarnationWatermarks,
      nodeId,
      incarnationFence,
    );

    if (nextState === STATE.READY && !isHeartbeatOnly) {
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
      return publicationNodeRow;
    }

    if (nextState === STATE.READY && isHeartbeatOnly) {
      await this.maybeAdvanceReadyNodeMembershipPublication(
        nodeId,
        publicationNodeRow,
      );
    }

    this.clearNodeReadyRetryWatermark(nodeId);
    return publicationNodeRow;
  },

  async resolveNodeStatePublicationRow(options = {}) {
    if (options.mustObserveDestination) {
      return this.observeNodeStateMutationOutcome({
        nodeId: options.nodeId,
        payloadBootIncarnation: options.payloadBootIncarnation,
        expectedRow: options.expectedRow,
        sourceRow: options.sourceRow,
        writeError: options.writeError,
      });
    }
    if (options.requireDurableCompletion) {
      return this.resolveNodeStateUpdateCompletionRow(
        options.nodeId,
        options.expectedRow,
        options.updateResult,
      );
    }
    return options.expectedRow;
  },

  async readAuthoritativeNodeStateSource(nodeId) {
    const observation = await this.getAuthoritativeNodeRow(nodeId);
    if (observation?.success !== true) {
      throw buildNodeStatePublicationError(
        observation?.error ||
          REPLICA_DISPATCH_SERVICE_LITERAL
            .NODE_STATE_UPDATE_DESTINATION_NOT_OBSERVED,
        {
          nodeId,
          deferRetry: true,
          retryAfterMs:
            observation?.retryAfterMs || this.nodeStateUpdateRetryAfterMs,
        },
      );
    }
    if (!observation.row?.[COLUMN.NODE_ID]) {
      throw this.buildMissingNodeRowError(nodeId);
    }
    return observation.row;
  },

  async observeNodeStateMutationOutcome(options = {}) {
    const {
      nodeId,
      payloadBootIncarnation,
      expectedRow,
      sourceRow,
      writeError,
    } = options;
    const observed = await this.readAuthoritativeNodeStateSource(nodeId);
    const knownBootIncarnation = normalizeKnownNodeBootIncarnation(
      observed?.[COLUMN.BOOT_INCARNATION],
    );
    if (knownBootIncarnation > payloadBootIncarnation) {
      throw buildStaleNodeIncarnationError({
        nodeId,
        receivedIncarnation: payloadBootIncarnation,
        knownIncarnation: knownBootIncarnation,
      });
    }
    if (knownBootIncarnation !== payloadBootIncarnation) {
      throw buildNodeStatePublicationError(
        REPLICA_DISPATCH_SERVICE_LITERAL.NODE_STATE_UPDATE_SOURCE_CHANGED,
        {
          nodeId,
          receivedIncarnation: payloadBootIncarnation,
          knownIncarnation: knownBootIncarnation,
          cause: writeError,
        },
      );
    }
    if (
      nodeStateDestinationMatches(
        observed,
        expectedRow,
        payloadBootIncarnation,
      ) ||
      nodeStateRegistrationAlreadyActivated(
        observed,
        sourceRow,
        payloadBootIncarnation,
      )
    ) {
      return observed;
    }
    if (nodeStateSourceLifecycleMatches(observed, sourceRow)) {
      if (isRetryableControlPlaneError(writeError)) {
        throw writeError;
      }
      throw buildNodeStatePublicationError(
        REPLICA_DISPATCH_SERVICE_LITERAL
          .NODE_STATE_UPDATE_DESTINATION_NOT_OBSERVED,
        {
          nodeId,
          deferRetry: true,
          retryAfterMs: this.nodeStateUpdateRetryAfterMs,
          cause: writeError,
        },
      );
    }
    throw buildNodeStatePublicationError(
      REPLICA_DISPATCH_SERVICE_LITERAL.NODE_STATE_UPDATE_SOURCE_CHANGED,
      {nodeId, cause: writeError},
    );
  },

  resolveNodeStateUpdateCompletionRow(nodeId, expectedRow, updateResult) {
    const row = buildNodeStateUpdateCompletionRow(expectedRow, updateResult);
    if (nodeStateUpdateCompletionRowMatches(nodeId, row, expectedRow)) {
      return row;
    }
    const error = new Error(
      REPLICA_DISPATCH_SERVICE_LITERAL
        .NODE_STATE_UPDATE_DESTINATION_NOT_OBSERVED,
    );
    error.code = REPLICA_DISPATCH_SERVICE_LITERAL
      .NODE_STATE_UPDATE_DESTINATION_NOT_OBSERVED;
    error.deferRetry = true;
    error.retryAfterMs = this.nodeStateUpdateRetryAfterMs;
    throw error;
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
      incarnationFence,
    } = options || {};

    const baseNodeAddress =
      payloadNodeAddress ||
      nodeRow?.[COLUMN.NODE_ADDRESS] ||
      existing?.[COLUMN.NODE_ADDRESS] ||
      STRING.UNKNOWN;
    const durableBootIncarnation = mathMax(
      normalizeKnownNodeBootIncarnation(
        readOwnData(incarnationFence, 'payloadBootIncarnation'),
      ),
      normalizeKnownNodeBootIncarnation(
        readOwnData(incarnationFence, 'knownBootIncarnation'),
      ),
    );

    if (isHeartbeatOnly === true) {
      const payloadCapabilities = payload?.[ControlPlaneField.CAPABILITIES];
      const capabilities = arrayIsArray(payloadCapabilities) ?
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
        ...(durableBootIncarnation > 0 ? {
          [COLUMN.BOOT_INCARNATION]: durableBootIncarnation,
        } : {}),
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
    const capabilities = arrayIsArray(payloadCapabilities) ?
      JSON.stringify(payloadCapabilities) :
      typeof payloadCapabilities === 'string' ?
        payloadCapabilities :
        existing?.[COLUMN.CAPABILITIES] || STRING.EMPTY_JSON_ARRAY;

    return {
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.NODE_ADDRESS]: baseNodeAddress,
      [COLUMN.CPU_CORES]: numberIsFinite(nodeRow?.[COLUMN.CPU_CORES]) ?
        nodeRow[COLUMN.CPU_CORES] :
        existing?.[COLUMN.CPU_CORES] || 0,
      [COLUMN.MEMORY_MB]: numberIsFinite(nodeRow?.[COLUMN.MEMORY_MB]) ?
        nodeRow[COLUMN.MEMORY_MB] :
        existing?.[COLUMN.MEMORY_MB] || 0,
      [COLUMN.DISK_GB]: numberIsFinite(nodeRow?.[COLUMN.DISK_GB]) ?
        nodeRow[COLUMN.DISK_GB] :
        existing?.[COLUMN.DISK_GB] || 0,
      [COLUMN.CPU_USAGE_PERCENT]: numberIsFinite(
        nodeRow?.[COLUMN.CPU_USAGE_PERCENT],
      ) ?
        nodeRow[COLUMN.CPU_USAGE_PERCENT] :
        existing?.[COLUMN.CPU_USAGE_PERCENT] || 0,
      [COLUMN.MEMORY_USAGE_PERCENT]: numberIsFinite(
        nodeRow?.[COLUMN.MEMORY_USAGE_PERCENT],
      ) ?
        nodeRow[COLUMN.MEMORY_USAGE_PERCENT] :
        existing?.[COLUMN.MEMORY_USAGE_PERCENT] || 0,
      [COLUMN.DISK_USAGE_PERCENT]: numberIsFinite(
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
      ...(durableBootIncarnation > 0 ? {
        [COLUMN.BOOT_INCARNATION]: durableBootIncarnation,
      } : {}),
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
});

export {REPLICA_DISPATCH_STATE_PUBLICATION_METHODS};
