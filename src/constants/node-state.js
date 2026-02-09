/**
 * Unified NODE_STATE enum - single source of truth for node lifecycle
 * and persisted node status.
 *
 * Replaces both STATE (node-specific values) from src/constants/states.js
 * and NODE_STATUS from src/node/node-constants.js.
 *
 * Requirements: 2.1, 2.2, 2.4
 */
const NODE_STATE = Object.freeze({
  INITIALIZING: 'initializing',
  STARTING: 'starting',
  CONNECTING: 'connecting',
  DISCOVERING: 'discovering',
  JOINING: 'joining',
  SYNCING: 'syncing',
  READY: 'ready',
  ACTIVE: 'active',
  SUSPECTED: 'suspected',
  FAILED: 'failed',
  RECOVERING: 'recovering',
  DRAINING: 'draining',
  SHUTTING_DOWN: 'shutting_down',
  STOPPED: 'stopped',
});

export {NODE_STATE};
