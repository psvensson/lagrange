import {createAdminQueryResultMessageEnvelope} from './admin-query-result-message-envelope.js';
import {ADMIN_WEBSOCKET_API_SHARED} from './admin-websocket-api-shared.js';
import {AdminWebSocketAPISegment2} from './admin-websocket-load-lane-admission.js';

const STALE_SOCKET_LOG_MSG = 'Closing stale admin socket connection on lane';

// CL-031: the control snapshot grows unbounded and only surfaces as a
// >100MB websocket frame. When an outgoing payload exceeds this threshold,
// attribute the size to the payload's top-level members at the single
// serialization point so the offending member is named in the logs.
const ADMIN_PAYLOAD_SIZE_ATTRIBUTION_THRESHOLD_BYTES = 8 * 1024 * 1024;
const ADMIN_PAYLOAD_SIZE_ATTRIBUTION_WARN_INTERVAL_MS = 30 * 1000;
const ADMIN_PAYLOAD_SIZE_ATTRIBUTION_TOP_MEMBER_COUNT = 8;
// Gate 212016Z: single-level attribution named only the generic 'results'
// wrapper (the snapshot row rides inside an array). Descend through the
// dominant member — arrays via their largest element — while the mass keeps
// concentrating, so the warn names the actual growing snapshot member.
const ADMIN_PAYLOAD_SIZE_ATTRIBUTION_MAX_DEPTH = 4;
const ADMIN_PAYLOAD_SIZE_ATTRIBUTION_ARRAY_SCAN_LIMIT = 64;
const ADMIN_PAYLOAD_SIZE_ATTRIBUTION_MEMBER_BYTES_UNAVAILABLE = -1;
const ADMIN_PAYLOAD_SIZE_ATTRIBUTION_LOG_MSG =
  'Admin websocket payload exceeded size attribution threshold';

/**
 * Measure the serialized UTF-8 byte length of one payload member.
 * Members that fail to stringify report -1.
 * @param {*} value
 * @returns {number}
 */
function measureAdminPayloadMemberBytes(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value));
  } catch (_error) {
    return ADMIN_PAYLOAD_SIZE_ATTRIBUTION_MEMBER_BYTES_UNAVAILABLE;
  }
}

/**
 * Measure each top-level member of a container, largest first.
 *
 * Size attribution re-stringifies an already-huge object: to avoid doubling
 * peak memory it measures member-by-member (each member's serialization is
 * released before the next is built) and never stringifies the whole
 * container a second time.
 * @param {Object} container
 * @returns {Array<{key: string, bytes: number}>}
 */
function buildAdminPayloadMemberBytes(container) {
  return Object.keys(container)
    .map((key) => ({
      key,
      bytes: measureAdminPayloadMemberBytes(container[key]),
    }))
    .sort((a, b) => b.bytes - a.bytes);
}

const {
  ADMIN_ERROR_HINT,
  ADMIN_ERROR_MATCH,
  ADMIN_ERROR_MESSAGE,
  ADMIN_LOG_MSG,
  ADMIN_SERVICE_OPERATION,
  ADMIN_STREAM_LANE_SNAPSHOT,
  ErrorCode,
  MessageType,
  SQLParser,
  adaptAdminMessageToServiceMessage,
  appendStructuredQueryMetadata,
  isAdminMessageDispatchable,
  parseLiveSelect,
} = ADMIN_WEBSOCKET_API_SHARED;

const ADMIN_WEBSOCKET_MESSAGE_DISPATCH_METHODS = {
  handleConnection(socket, request = null) {
    const lane = this.resolveAdminClientLane(request?.query?.lane);

    if (lane === ADMIN_STREAM_LANE_SNAPSHOT) {
      for (const clientInfo of [...this.clients]) {
        if (clientInfo.lane === lane) {
          this.logger.info(STALE_SOCKET_LOG_MSG, {
            clientId: clientInfo.id,
            lane,
          });
          try {
            clientInfo.socket.close();
          } catch (_closeErr) {
            // Ignore close errors for stale clients
          }
          this.handleDisconnection(clientInfo);
        }
      }
    }

    AdminWebSocketAPISegment2.prototype.handleConnection.call(this, socket, request);
  },

  handleMessage(clientInfo, data) {
    let message;

    try {
      const messageStr = data.toString();
      message = JSON.parse(messageStr);
    } catch (_error) {
      this.sendError(
        clientInfo,
        null,
        ErrorCode.MALFORMED_JSON,
        ADMIN_ERROR_MESSAGE.INVALID_JSON,
        ADMIN_ERROR_HINT.INVALID_JSON,
      );
      return;
    }

    if (!message || typeof message.type !== 'string') {
      this.sendError(
        clientInfo,
        null,
        ErrorCode.MALFORMED_JSON,
        ADMIN_ERROR_MESSAGE.MISSING_TYPE,
        ADMIN_ERROR_HINT.MISSING_TYPE,
      );
      return;
    }

    this.logger.debug(ADMIN_LOG_MSG.RECEIVED_MESSAGE, {
      clientId: clientInfo.id,
      type: message.type,
    });

    switch (message.type) {
    case MessageType.QUERY:
      this.handleDispatchableAdminMessage(clientInfo, message);
      break;

    case MessageType.PARTITION_CALLBACK:
      this.handleDispatchableAdminMessage(clientInfo, message);
      break;

    case MessageType.REFRESH:
      this.handleDispatchableAdminMessage(clientInfo, message);
      break;

    case MessageType.LIVE_QUERY_SUBSCRIBE:
      this.handleLiveQuerySubscribe(clientInfo, message);
      break;

    case MessageType.LIVE_QUERY_UNSUBSCRIBE:
      this.handleLiveQueryUnsubscribe(clientInfo, message);
      break;

    default:
      this.logger.debug(ADMIN_LOG_MSG.UNKNOWN_MESSAGE, {
        clientId: clientInfo.id,
        type: message.type,
      });
      break;
    }
  },

  async handleLiveQuerySubscribe(clientInfo, message) {
    const subscriptionId = message.subscriptionId;
    const sql = message.sql;

    if (!subscriptionId) {
      this.sendError(
        clientInfo,
        null,
        ErrorCode.MALFORMED_JSON,
        ADMIN_ERROR_MESSAGE.LIVE_QUERY_MISSING_SUBSCRIPTION_ID,
        ADMIN_ERROR_HINT.LIVE_QUERY_MISSING_SUBSCRIPTION_ID,
      );
      return;
    }
    if (!sql || typeof sql !== 'string') {
      this.sendError(
        clientInfo,
        null,
        ErrorCode.MALFORMED_JSON,
        ADMIN_ERROR_MESSAGE.LIVE_QUERY_MISSING_SQL,
        ADMIN_ERROR_HINT.LIVE_QUERY_MISSING_SQL,
      );
      return;
    }
    if (!this.liveQueryManager) {
      this.sendError(
        clientInfo,
        null,
        ErrorCode.INTERNAL_ERROR,
        ADMIN_ERROR_MESSAGE.LIVE_QUERY_MANAGER_UNAVAILABLE,
      );
      return;
    }

    try {
      const parsed = parseLiveSelect(sql);
      const selectSql = parsed.isLive ? parsed.sql : sql;
      const parser = new SQLParser(selectSql);
      const ast = parser.parse();

      const registrationResult = {partitions: []};
      const liveClient = {
        id: clientInfo.id,
        send: (data) => {
          const payload =
            typeof data === 'string' ? JSON.parse(data) : data;
          const innerType = payload.type;
          this.sendToClient(clientInfo, {
            type: MessageType.LIVE_QUERY_EVENT,
            subscriptionId,
            eventType: innerType,
            data: payload.row || payload.new || payload.rows || null,
            oldData: payload.old || null,
            queryId: payload.queryId || null,
            partitions: registrationResult.partitions || [],
          });
        },
      };

      const result = await this.liveQueryManager.registerLiveQuery(
        ast,
        liveClient,
      );
      registrationResult.partitions = result.partitions || [];

      clientInfo.liveQueryMap.set(subscriptionId, result.queryId);

      this.sendToClient(clientInfo, {
        type: MessageType.LIVE_QUERY_EVENT,
        subscriptionId,
        queryId: result.queryId,
        partitions: result.partitions,
        expiresAt: result.expiresAt,
      });

      this.logger.info(ADMIN_LOG_MSG.LIVE_QUERY_SUBSCRIBED, {
        clientId: clientInfo.id,
        subscriptionId,
        queryId: result.queryId,
      });
    } catch (error) {
      this.logger.error(ADMIN_LOG_MSG.LIVE_QUERY_SUBSCRIBE_FAILED, {
        clientId: clientInfo.id,
        subscriptionId,
        error: error.message,
      });
      this.sendError(
        clientInfo,
        null,
        ErrorCode.INTERNAL_ERROR,
        `${ADMIN_ERROR_MESSAGE.LIVE_QUERY_PARSE_FAILED}: ${error.message}`,
      );
    }
  },

  handleLiveQueryUnsubscribe(clientInfo, message) {
    const subscriptionId = message.subscriptionId;
    if (!subscriptionId) {
      return;
    }

    const queryId = clientInfo.liveQueryMap.get(subscriptionId);
    if (queryId && this.liveQueryManager) {
      this.liveQueryManager.unregisterLiveQuery(queryId, clientInfo.id);
      clientInfo.liveQueryMap.delete(subscriptionId);

      this.logger.info(ADMIN_LOG_MSG.LIVE_QUERY_UNSUBSCRIBED, {
        clientId: clientInfo.id,
        subscriptionId,
        queryId,
      });
    }
  },

  async handleDispatchableAdminMessage(clientInfo, message) {
    if (!isAdminMessageDispatchable(message.type)) {
      return;
    }

    const envelope = adaptAdminMessageToServiceMessage(message, {
      clientId: clientInfo.id,
      lane: this.resolveAdminClientLane(clientInfo?.lane),
      tenantId: message.tenantId || null,
      principal: message.principal || null,
      traceId: message.traceId || null,
    });
    await this.handleServiceDispatchEnvelope(clientInfo, message, envelope);
  },

  async handleServiceDispatchMessage(clientInfo, message) {
    const envelope = adaptAdminMessageToServiceMessage(message, {
      clientId: clientInfo.id,
      lane: this.resolveAdminClientLane(clientInfo?.lane),
      tenantId: message.tenantId || null,
      principal: message.principal || null,
      traceId: message.traceId || null,
    });
    return this.handleServiceDispatchEnvelope(clientInfo, message, envelope);
  },

  async handleServiceDispatchEnvelope(clientInfo, message, envelope) {
    const queryId = message.queryId || message.messageId || null;

    try {
      const dispatchResult = await this.serviceDispatcher.dispatch(envelope, {
        clientInfo,
        nodeId: this.nodeId,
        traceId: envelope.traceId || null,
        tenantId: envelope.tenantId || null,
        principal: envelope.principal || null,
      });

      const deliveryPayload = dispatchResult.delivery?.payload || {};
      const operation = dispatchResult.envelope.operation;

      if (operation === ADMIN_SERVICE_OPERATION.GET_CACHE_DUMP) {
        const cacheDump =
          deliveryPayload.cacheDump || deliveryPayload.data || null;
        if (!cacheDump || typeof cacheDump !== 'object') {
          throw new Error(ADMIN_ERROR_MESSAGE.SYSTEM_CACHE_EMPTY);
        }
        this.sendCacheDumpPayload(clientInfo, cacheDump);
        return;
      }

      if (
        deliveryPayload.queryResult &&
        typeof deliveryPayload.queryResult === 'object'
      ) {
        this.sendQueryResult(
          clientInfo,
          queryId || envelope.messageId,
          deliveryPayload.queryResult,
        );
        return;
      }

      const deliveryResults = Array.isArray(deliveryPayload.results) ?
        deliveryPayload.results :
        [];
      this.sendQueryResult(clientInfo, queryId || envelope.messageId, {
        operation,
        results: deliveryResults,
        count: deliveryResults.length,
      });
    } catch (error) {
      const errorCode = this.getErrorCode(error);
      this.sendError(
        clientInfo,
        queryId,
        errorCode,
        error.message,
        error.adminHint,
        error,
      );
    }
  },

  sendQueryResult(clientInfo, queryId, result) {
    const message = createAdminQueryResultMessageEnvelope(queryId, result);

    this.sendToClient(clientInfo, message);

    this.logger.debug(ADMIN_LOG_MSG.QUERY_RESULT_SENT, {
      clientId: clientInfo.id,
      queryId,
      success: result.success !== false,
    });
  },

  handleRefreshMessage(clientInfo, _message) {
    this.logger.debug(ADMIN_LOG_MSG.REFRESH_REQUESTED, {
      clientId: clientInfo.id,
    });

    try {
      this.sendCacheDumpPayload(
        clientInfo,
        this.executeLocalCacheDumpEnvelope(),
      );
    } catch (error) {
      const errorCode = this.getErrorCode(error);
      this.sendError(
        clientInfo,
        null,
        errorCode,
        error.message,
        error.adminHint,
        error,
      );
    }
  },

  sendError(clientInfo, queryId, errorCode, errorMessage, hint, options = {}) {
    const message = {
      type: queryId ? MessageType.QUERY_RESULT : MessageType.ERROR,
      timestamp: Date.now(),
      error: errorMessage,
      errorCode,
    };

    if (queryId) {
      message.queryId = queryId;
    }

    if (hint) {
      message.hint = hint;
    }
    if (options?.adminDetails && typeof options.adminDetails === 'object') {
      message.details = options.adminDetails;
    } else if (options?.details && typeof options.details === 'object') {
      message.details = options.details;
    }

    if (options?.deferRetry === true) {
      message.deferRetry = true;
    }
    if (Number.isFinite(options?.retryAfterMs)) {
      message.retryAfterMs = Math.max(
        0,
        Math.floor(options.retryAfterMs),
      );
    }
    appendStructuredQueryMetadata(message, options);

    this.sendToClient(clientInfo, message);
  },

  sendToClient(clientInfo, message) {
    try {
      const json = JSON.stringify(message);
      // CL-031 size attribution. json.length is a free lower bound on the
      // UTF-8 byte length, so under-threshold sends pay no measurement cost
      // on this hot path; member sizes are only computed past the threshold.
      if (
        typeof json === 'string' &&
        json.length > ADMIN_PAYLOAD_SIZE_ATTRIBUTION_THRESHOLD_BYTES
      ) {
        try {
          this._warnOversizedAdminPayload(
            clientInfo,
            message,
            Buffer.byteLength(json),
          );
        } catch (_attributionError) {
          // Size attribution is best-effort diagnostics only.
        }
      }
      clientInfo.socket.send(json);
    } catch (error) {
      this.logger.error(ADMIN_LOG_MSG.SEND_FAILED, {
        clientId: clientInfo.id,
        error: error.message,
      });
      throw error;
    }
  },

  _warnOversizedAdminPayload(clientInfo, message, totalBytes) {
    // Rate-limited to one warn per dispatch instance per window so a polling
    // oracle that keeps requesting the oversized snapshot cannot warn-storm
    // (project lesson CL-009).
    const now = Date.now();
    const lastWarnAtMs =
      Number(this._payloadSizeAttributionLastWarnAtMs) || 0;
    if (now - lastWarnAtMs < ADMIN_PAYLOAD_SIZE_ATTRIBUTION_WARN_INTERVAL_MS) {
      return;
    }
    this._payloadSizeAttributionLastWarnAtMs = now;
    const messageMemberBytes = buildAdminPayloadMemberBytes(message);
    const largestMember = messageMemberBytes[0] || null;
    const attributionPath = [];
    let attributionMemberBytes = messageMemberBytes;
    let container = message;
    for (
      let depth = 0;
      depth < ADMIN_PAYLOAD_SIZE_ATTRIBUTION_MAX_DEPTH;
      depth += 1
    ) {
      const largest = attributionMemberBytes[0];
      if (
        !largest ||
        largest.bytes < ADMIN_PAYLOAD_SIZE_ATTRIBUTION_THRESHOLD_BYTES
      ) {
        break;
      }
      let value = container[largest.key];
      let pathSegment = largest.key;
      if (Array.isArray(value)) {
        let largestIndex = -1;
        let largestElementBytes = -1;
        const scanCount = Math.min(
          value.length,
          ADMIN_PAYLOAD_SIZE_ATTRIBUTION_ARRAY_SCAN_LIMIT,
        );
        for (let i = 0; i < scanCount; i += 1) {
          const elementBytes = measureAdminPayloadMemberBytes(value[i]);
          if (elementBytes > largestElementBytes) {
            largestElementBytes = elementBytes;
            largestIndex = i;
          }
        }
        if (largestIndex < 0) {
          break;
        }
        value = value[largestIndex];
        pathSegment = largest.key + '[' + largestIndex + ']';
      }
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        break;
      }
      attributionPath.push(pathSegment);
      container = value;
      attributionMemberBytes = buildAdminPayloadMemberBytes(container);
    }
    this.logger.warn(ADMIN_PAYLOAD_SIZE_ATTRIBUTION_LOG_MSG, {
      clientId: clientInfo?.id || null,
      totalBytes,
      type: typeof message?.type === 'string' ? message.type : null,
      lane: message?.lane || clientInfo?.lane || null,
      payloadMember: largestMember ? largestMember.key : null,
      payloadMemberBytes: largestMember ? largestMember.bytes : null,
      attributionPath: attributionPath.join('.'),
      topLevelMemberBytes: attributionMemberBytes.slice(
        0,
        ADMIN_PAYLOAD_SIZE_ATTRIBUTION_TOP_MEMBER_COUNT,
      ),
    });
  },

  broadcastCDCEvent(tableName, operation, record) {
    const message = {
      type: MessageType.CDC_EVENT,
      timestamp: Date.now(),
      table: tableName,
      operation: operation.toLowerCase(),
      record,
    };

    for (const clientInfo of this.clients) {
      this.sendToClient(clientInfo, message);
    }
  },

  getErrorCode(error) {
    if (error && typeof error.adminErrorCode === 'string') {
      return error.adminErrorCode;
    }
    const message = error.message.toLowerCase();

    if (
      message.includes(ADMIN_ERROR_MATCH.PARSE) ||
      message.includes(ADMIN_ERROR_MATCH.SYNTAX)
    ) {
      return ErrorCode.SYNTAX_ERROR;
    }
    if (
      message.includes(ADMIN_ERROR_MATCH.TABLE_NOT_FOUND) ||
      message.includes(ADMIN_ERROR_MATCH.TABLE_NOT_FOUND_CODE)
    ) {
      return ErrorCode.TABLE_NOT_FOUND;
    }
    if (message.includes(ADMIN_ERROR_MATCH.TIMEOUT)) {
      return ErrorCode.TIMEOUT;
    }

    return ErrorCode.INTERNAL_ERROR;
  },
};

export {ADMIN_WEBSOCKET_MESSAGE_DISPATCH_METHODS};
