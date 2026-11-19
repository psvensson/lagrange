/**
 * The node's host identity (owner decision D3, 2026-11-17): the machine a
 * node runs on, the unit replica placement spreads across.
 *
 * It is a REQUIRED, explicit boot-time configuration value (env
 * NODE_HOST_ID, config node.hostId): the Kubernetes node name in the chart
 * (downward API spec.nodeName), the lab host name in the lab harness, an
 * explicit value in embedded and dev harnesses. A node without it refuses to
 * start and to register, with the typed configuration error below. The NODES
 * registration owner persists it in NODES.host_id at every boot
 * incarnation's registration, so a restart re-declares it.
 *
 * It is never inferred from the node id, a provider id or missing topology
 * (owner ruling 2026-10-04). A NODES row without a declared host - one
 * written by an older version that lacked the column, whose node has not
 * yet restarted during a rolling upgrade - reads as HOST_UNDECLARED, which
 * is never a placement target (fail closed).
 */

import {COLUMN} from '../constants/columns.js';

const NODE_HOST_IDENTITY_STATE = Object.freeze({
  DECLARED: 'declared',
  HOST_UNDECLARED: 'host_undeclared',
});

// A Kubernetes node name (RFC 1123 subdomain), a lab host name or a VM
// instance name: 1-253 characters of letters, digits, '.', '_' and '-',
// beginning and ending with a letter or digit. Compared exactly as declared.
const NODE_HOST_ID_PATTERN =
  /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,251}[A-Za-z0-9])?$/u;

const NODE_HOST_ID_ERROR_CODE = Object.freeze({
  REQUIRED: 'NODE_HOST_ID_REQUIRED',
  INVALID: 'NODE_HOST_ID_INVALID',
});

const NODE_HOST_ID_ERROR_MSG = Object.freeze({
  REQUIRED: 'Node host identity is required: set NODE_HOST_ID (config ' +
    'node.hostId) to the name of the machine this node runs on',
  INVALID: 'Node host identity NODE_HOST_ID (config node.hostId) must be ' +
    '1-253 letters, digits, ".", "_" or "-", beginning and ending with a ' +
    'letter or digit; received ',
});

const HOST_UNDECLARED_IDENTITY = Object.freeze({
  state: NODE_HOST_IDENTITY_STATE.HOST_UNDECLARED,
  hostId: null,
});

function isDeclaredNodeHostId(value) {
  return typeof value === 'string' && NODE_HOST_ID_PATTERN.test(value);
}

function nodeHostIdError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * The host identity a booting node declares: its configured value, or the
 * typed configuration error that refuses the start or the registration.
 * @param {*} value The configured NODE_HOST_ID / node.hostId value.
 * @return {string} The declared host id, exactly as configured.
 * @throws {Error} code NODE_HOST_ID_REQUIRED when absent (unset or empty),
 *   NODE_HOST_ID_INVALID when present but not a host name.
 */
function requireDeclaredNodeHostId(value) {
  if (value === undefined || value === null || value === '') {
    throw nodeHostIdError(NODE_HOST_ID_ERROR_CODE.REQUIRED,
      NODE_HOST_ID_ERROR_MSG.REQUIRED);
  }
  if (!isDeclaredNodeHostId(value)) {
    throw nodeHostIdError(NODE_HOST_ID_ERROR_CODE.INVALID,
      NODE_HOST_ID_ERROR_MSG.INVALID + JSON.stringify(value));
  }
  return value;
}

/**
 * The host identity a NODES row carries: the one reader of NODES.host_id.
 * A row without a declared host (an older version's row, or a value no
 * registration could have written) is HOST_UNDECLARED, never a host derived
 * from anything else in the row.
 * @param {Object|null} nodeRow A NODES row.
 * @return {{state: string, hostId: (string|null)}} Frozen.
 */
function readNodeHostIdentity(nodeRow) {
  const hostId = nodeRow?.[COLUMN.HOST_ID];
  return isDeclaredNodeHostId(hostId) ?
    Object.freeze({state: NODE_HOST_IDENTITY_STATE.DECLARED, hostId}) :
    HOST_UNDECLARED_IDENTITY;
}

export {
  NODE_HOST_ID_ERROR_CODE,
  NODE_HOST_IDENTITY_STATE,
  readNodeHostIdentity,
  requireDeclaredNodeHostId,
};
