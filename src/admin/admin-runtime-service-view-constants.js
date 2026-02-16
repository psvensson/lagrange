/**
 * Constants for admin runtime-service view helpers.
 *
 * Covers logical service health states, view labels,
 * protocol URI schemes, and endpoint display formatting.
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4
 */

import {META_SERVICE_ID} from '../constants/wasm-meta.js';

/**
 * Health state for a logical service derived from
 * desired vs observed replica counts.
 * @enum {string}
 */
const LOGICAL_SERVICE_HEALTH = Object.freeze({
  HEALTHY: 'healthy',
  PARTIAL: 'partial',
  DEGRADED: 'degraded',
  UNKNOWN: 'unknown',
});

/**
 * Row kind label distinguishing logical service summary rows
 * from individual replica rows in combined views.
 * @enum {string}
 */
const VIEW_ROW_KIND = Object.freeze({
  LOGICAL_SERVICE: 'logical_service',
  REPLICA: 'replica',
});

/**
 * Protocol URI scheme mapping for endpoint display.
 * Maps internal protocol identifiers to user-facing URI prefixes.
 * @enum {string}
 */
const PROTOCOL_URI_SCHEME = Object.freeze({
  POSTGRESQL: 'postgresql://',
  WEBSOCKET: 'ws://',
});

/**
 * Built-in runtime service IDs that must appear in
 * replica-oriented admin views.
 */
const BUILT_IN_RUNTIME_SERVICE_IDS = Object.freeze([
  META_SERVICE_ID.POSTGRES_WIRE,
  META_SERVICE_ID.ADMIN_META,
  META_SERVICE_ID.WASM_META,
]);

/**
 * Default port placeholder when endpoint port is unavailable.
 * @type {string}
 */
const PORT_UNKNOWN = 'unknown';

export {
  LOGICAL_SERVICE_HEALTH,
  VIEW_ROW_KIND,
  PROTOCOL_URI_SCHEME,
  BUILT_IN_RUNTIME_SERVICE_IDS,
  PORT_UNKNOWN,
};
