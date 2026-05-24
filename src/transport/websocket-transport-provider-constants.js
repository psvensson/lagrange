const LOCAL_STR_STRING = 'string';
const WS_PROVIDER_SUBSYSTEM = 'websocket-transport-provider';

const WS_PROVIDER_LOCAL_MSG = Object.freeze({
  FAILED_TO_PARSE_MESSAGE: 'Failed to parse message',
  PROVIDER_SHUTDOWN: 'Provider shutdown',
  PENDING_MESSAGE_CANCELLED: 'Pending message cancelled',
});

const WS_PROVIDER_LOG_MSG = Object.freeze({
  CONNECTING: 'Connecting to endpoint',
  CONNECTED: 'Connected to endpoint',
  CONNECTION_FAILED: 'Connection failed',
  DISCONNECTING: 'Disconnecting from endpoint',
  DISCONNECTED: 'Disconnected from endpoint',
  SENDING_MESSAGE: 'Sending message',
  MESSAGE_SENT: 'Message sent',
  MESSAGE_RECEIVED: 'Message received',
  IDENTIFICATION_SENT: 'Identification sent',
  IDENTIFICATION_RECEIVED: 'Identification received',
  PING_SENT: 'Ping sent',
  PONG_RECEIVED: 'Pong received',
  RECONNECTING: 'Attempting reconnection',
  RECONNECT_FAILED: 'Reconnection failed',
  MAX_RECONNECTS_REACHED: 'Max reconnection attempts reached',
  SHUTDOWN_STARTED: 'Shutdown started',
  SHUTDOWN_COMPLETE: 'Shutdown complete',
  HEALTH_CHECK: 'Health check performed',
  PROVIDER_UNAVAILABLE: 'Provider is unavailable',
});

const WS_PROVIDER_ERROR_MSG = Object.freeze({
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',
  SEND_FAILED: 'SEND_FAILED',
  CONNECTION_CLOSED: 'CONNECTION_CLOSED',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  MESSAGE_TIMEOUT: 'MESSAGE_TIMEOUT',
  MESSAGE_NOT_ACKNOWLEDGED: 'MESSAGE_NOT_ACKNOWLEDGED',
  connectionFailed: (address, message) =>
    `Failed to connect to ${address}: ${message}`,
  sendFailed: (message) => `Failed to send message: ${message}`,
});

export {
  LOCAL_STR_STRING,
  WS_PROVIDER_ERROR_MSG,
  WS_PROVIDER_LOCAL_MSG,
  WS_PROVIDER_LOG_MSG,
  WS_PROVIDER_SUBSYSTEM,
};
