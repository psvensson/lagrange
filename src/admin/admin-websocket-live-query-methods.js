// The admin websocket's live-query surface: a subscribe is answered with the
// named acknowledgement `live_query_subscribed` or, when it fails, once with
// the subscription's typed `error` event; every event the live query manager
// sends the subscriber travels as one `live_query_event`
// (architecture/live-query-data-plane.md, "Event fields").
import {ADMIN_WEBSOCKET_API_SHARED} from './admin-websocket-api-shared.js';
import {LIVE_QUERY_EVENT, LIVE_QUERY_EVENT_ROW_FIELDS} from
  '../live-query/live-query-constants.js';

const {
  ADMIN_ERROR_HINT,
  ADMIN_ERROR_MESSAGE,
  ADMIN_LOG_MSG,
  ErrorCode,
  MessageType,
  SQLParser,
  parseLiveSelect,
} = ADMIN_WEBSOCKET_API_SHARED;

/**
 * The client message for one live-query event. Row fields travel under their
 * contract names (absent ones are not serialized); an error event carries
 * the admin websocket's own error fields, `error` and `errorCode`.
 * @param {string} subscriptionId
 * @param {Object} event - The live query manager's event.
 * @param {Array<string>} partitions - The subscription's partitions.
 * @param {function(Error): string} errorCodeOf - The admin error typing.
 * @return {Object}
 */
function buildLiveQueryEventMessage(subscriptionId, event, partitions, errorCodeOf) {
  const message = {
    type: MessageType.LIVE_QUERY_EVENT,
    subscriptionId,
    eventType: event.type,
    queryId: event.queryId,
    partitions,
  };
  for (const field of LIVE_QUERY_EVENT_ROW_FIELDS) {
    message[field] = event[field];
  }
  if (event.type === LIVE_QUERY_EVENT.ERROR) {
    message.error = event.error;
    message.errorCode = errorCodeOf(new Error(event.error));
  }
  return message;
}

const ADMIN_WEBSOCKET_LIVE_QUERY_METHODS = {
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

    // A statement that does not parse is answered SYNTAX_ERROR and never
    // registers.
    let ast = null;
    try {
      const parsed = parseLiveSelect(sql);
      ast = new SQLParser(parsed.isLive ? parsed.sql : sql).parse();
    } catch (error) {
      this.logger.error(ADMIN_LOG_MSG.LIVE_QUERY_SUBSCRIBE_FAILED, {
        clientId: clientInfo.id, subscriptionId, error: error.message});
      this.answerLiveQuerySubscribeFailure(clientInfo, subscriptionId,
        `${ADMIN_ERROR_MESSAGE.LIVE_QUERY_PARSE_FAILED}: ${error.message}`,
        ErrorCode.SYNTAX_ERROR);
    }
    if (ast === null) return;

    // The snapshot is sent during registration, before the partitions are
    // known: until then an event names none. A failure the manager already
    // sent as the subscription's error event is the subscribe's answer.
    const registration = {partitions: [], failureAnswered: false};
    const liveClient = {
      id: clientInfo.id,
      // The live query manager sends each event as JSON text.
      send: (data) => {
        const event = JSON.parse(data);
        registration.failureAnswered ||= event.type === LIVE_QUERY_EVENT.ERROR;
        this.sendToClient(clientInfo, buildLiveQueryEventMessage(
          subscriptionId, event, registration.partitions,
          (error) => this.getErrorCode(error)));
      },
    };

    try {
      const result = await this.liveQueryManager.registerLiveQuery(
        ast,
        liveClient,
      );
      registration.partitions = result.partitions;

      clientInfo.liveQueryMap.set(subscriptionId, result.queryId);

      this.sendToClient(clientInfo, {
        type: MessageType.LIVE_QUERY_SUBSCRIBED,
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
        clientId: clientInfo.id, subscriptionId, error: error.message});
      if (!registration.failureAnswered) {
        this.answerLiveQuerySubscribeFailure(clientInfo, subscriptionId,
          error.message, this.getErrorCode(error));
      }
    }
  },

  /**
   * Answer a failed subscribe once, as the subscription's typed error event:
   * the subscription id, what failed and its admin error code.
   * @param {Object} clientInfo
   * @param {string} subscriptionId
   * @param {string} cause
   * @param {string} errorCode
   */
  answerLiveQuerySubscribeFailure(clientInfo, subscriptionId, cause, errorCode) {
    this.sendToClient(clientInfo, buildLiveQueryEventMessage(subscriptionId,
      {type: LIVE_QUERY_EVENT.ERROR, error: cause}, [], () => errorCode));
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
};

export {ADMIN_WEBSOCKET_LIVE_QUERY_METHODS};
