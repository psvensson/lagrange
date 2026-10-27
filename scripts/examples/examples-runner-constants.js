/**
 * Shared constants for admin WebSocket client helpers.
 */

import {LISTENER_PORT_DEFAULT} from
  '../../src/config/listener-port-model.js';

const DEFAULT_TARGET = 'ws://127.0.0.1:' +
  `${LISTENER_PORT_DEFAULT.ADMIN_WEBSOCKET}/api/admin/stream`;
const DEFAULT_TIMEOUT_MS = 30000;
const WS_OPEN_STATE = 1;

const MESSAGE_TYPE = Object.freeze({
  QUERY: 'query',
  QUERY_RESULT: 'query_result',
});

export {
  DEFAULT_TARGET,
  DEFAULT_TIMEOUT_MS,
  WS_OPEN_STATE,
  MESSAGE_TYPE,
};
