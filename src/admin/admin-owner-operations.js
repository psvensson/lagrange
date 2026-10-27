/**
 * Semantic admin operations over the authoritative system-table owners.
 *
 * Each operation invokes the existing owner and keeps its lifecycle,
 * persistence and outcome semantics; none issues SQL. They replace the raw
 * system-table statements the CLI and the harness sent through the admin
 * query channel:
 * - config set   -> DynamicConfigService.set (validated, gateway write)
 * - node drain   -> the node-local one-way drain owner (this node only)
 * - node remove  -> NodesOwner.removeTerminalNode (exact observed terminal row)
 * - table policy -> TablePolicyService.updateTablePolicy (gateway write)
 *
 * An absent owner answers OWNER_NOT_READY; nothing falls back to SQL.
 * @module admin/admin-owner-operations
 */

import {HTTP_STATUS} from '../constants/index.js';
import {NODE_REMOVAL_ERROR_CODE} from '../control-plane/owners/nodes-owner.js';
import {POSTGRES_WIRE_SCALE_ERROR_CODE} from
  '../control-plane/owners/postgres-wire-scale-contract.js';
import {LOG_MARKER_ERROR_CODE} from
  '../control-plane/owners/log-diagnostic-marker-contract.js';
import {CONFIG_ERROR_CODE} from '../config/config-constants.js';
import {POLICY_ERROR_CODE} from '../policy/policy-constants.js';
import {CONTROL_PLANE_MUTATION_OUTCOME} from
  '../control-plane/control-plane-system-table-gateway-constants.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_STRING = 'string';
const ADMIN_DRAIN_REASON_CODE = 'admin_drain';

const ADMIN_OWNER_OPERATION_ROUTE = Object.freeze({
  CONFIG_BY_KEY: '/api/admin/config/:configKey',
  NODE_BY_ID: '/api/admin/nodes/:nodeId',
  NODE_DRAIN: '/api/admin/nodes/:nodeId/drain',
  TABLE_POLICY: '/api/admin/tables/:tableId/policy',
  POSTGRES_WIRE_SCALE: '/api/admin/services/sys-postgres-wire/scale',
  LOG_MARKER: '/api/admin/logs/markers',
});

// The concrete path of each operation, for its clients (CLI, harness).
const ADMIN_OWNER_OPERATION_PATH = Object.freeze({
  configByKey: (configKey) =>
    `/api/admin/config/${encodeURIComponent(configKey)}`,
  nodeById: (nodeId) => `/api/admin/nodes/${encodeURIComponent(nodeId)}`,
  nodeDrain: (nodeId) =>
    `/api/admin/nodes/${encodeURIComponent(nodeId)}/drain`,
  tablePolicy: (tableId) =>
    `/api/admin/tables/${encodeURIComponent(tableId)}/policy`,
  postgresWireScale: ADMIN_OWNER_OPERATION_ROUTE.POSTGRES_WIRE_SCALE,
  logMarker: ADMIN_OWNER_OPERATION_ROUTE.LOG_MARKER,
});

// The named outcome of one admin owner operation (R07).
const ADMIN_OWNER_OPERATION_OUTCOME = Object.freeze({
  APPLIED: 'applied',
  REFUSED: 'refused',
  OWNER_NOT_READY: 'owner_not_ready',
  FAILED: 'failed',
});

const ADMIN_OWNER_OPERATION_ERROR_CODE = Object.freeze({
  OWNER_NOT_READY: 'ADMIN_OWNER_NOT_READY',
  CONFIG_KEY_REQUIRED: 'CONFIG_KEY_REQUIRED',
  NODE_ID_REQUIRED: 'NODE_ID_REQUIRED',
  NODE_DRAIN_REMOTE_UNSUPPORTED: 'NODE_DRAIN_REMOTE_UNSUPPORTED',
});

const ADMIN_OWNER_OPERATION_ERROR_MSG = Object.freeze({
  OWNER_NOT_READY: 'The owner of this operation is not available yet',
  CONFIG_KEY_REQUIRED: 'configKey is required',
  NODE_ID_REQUIRED: 'nodeId is required',
  NODE_DRAIN_REMOTE_UNSUPPORTED:
    'A node drains only itself: connect to the node to drain it',
});

// Owner refusal codes and the HTTP status each answers with.
const REFUSAL_STATUS_BY_CODE = new Map([
  [ADMIN_OWNER_OPERATION_ERROR_CODE.CONFIG_KEY_REQUIRED,
    HTTP_STATUS.BAD_REQUEST],
  [ADMIN_OWNER_OPERATION_ERROR_CODE.NODE_ID_REQUIRED, HTTP_STATUS.BAD_REQUEST],
  [ADMIN_OWNER_OPERATION_ERROR_CODE.NODE_DRAIN_REMOTE_UNSUPPORTED,
    HTTP_STATUS.CONFLICT],
  [NODE_REMOVAL_ERROR_CODE.NODE_ID_REQUIRED, HTTP_STATUS.BAD_REQUEST],
  [NODE_REMOVAL_ERROR_CODE.INCARNATION_REQUIRED, HTTP_STATUS.BAD_REQUEST],
  [NODE_REMOVAL_ERROR_CODE.TERMINAL_STATUS_REQUIRED, HTTP_STATUS.BAD_REQUEST],
  [NODE_REMOVAL_ERROR_CODE.OBSERVATION_CHANGED, HTTP_STATUS.CONFLICT],
  [POSTGRES_WIRE_SCALE_ERROR_CODE.REQUEST_INVALID, HTTP_STATUS.BAD_REQUEST],
  [POSTGRES_WIRE_SCALE_ERROR_CODE.DEFINITION_MISMATCH, HTTP_STATUS.CONFLICT],
  [LOG_MARKER_ERROR_CODE.REQUEST_INVALID, HTTP_STATUS.BAD_REQUEST],
  [LOG_MARKER_ERROR_CODE.IDENTITY_CONFLICT, HTTP_STATUS.CONFLICT],
  [CONFIG_ERROR_CODE.VALUE_INVALID, HTTP_STATUS.BAD_REQUEST],
  [CONFIG_ERROR_CODE.OBSERVATION_CHANGED, HTTP_STATUS.CONFLICT],
  [POLICY_ERROR_CODE.TABLE_ID_REQUIRED, HTTP_STATUS.BAD_REQUEST],
  [POLICY_ERROR_CODE.POLICY_INVALID, HTTP_STATUS.BAD_REQUEST],
  [POLICY_ERROR_CODE.OBSERVATION_CHANGED, HTTP_STATUS.CONFLICT],
]);

const NOT_READY_MUTATION_OUTCOMES = new Set([
  CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED,
  CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY,
]);

function isNonEmptyString(value) {
  return typeof value === LOCAL_STR_STRING && value.length > 0;
}

function answer(statusCode, body) {
  return Object.freeze({statusCode, body: Object.freeze(body)});
}

function refusal(code, message) {
  return answer(REFUSAL_STATUS_BY_CODE.get(code), {
    success: false,
    outcome: ADMIN_OWNER_OPERATION_OUTCOME.REFUSED,
    errorCode: code,
    error: message,
  });
}

function ownerNotReady(retryAfterMs = null, error = null) {
  return answer(HTTP_STATUS.SERVICE_UNAVAILABLE, {
    success: false,
    outcome: ADMIN_OWNER_OPERATION_OUTCOME.OWNER_NOT_READY,
    errorCode: error?.code || ADMIN_OWNER_OPERATION_ERROR_CODE.OWNER_NOT_READY,
    error: error?.message || ADMIN_OWNER_OPERATION_ERROR_MSG.OWNER_NOT_READY,
    ...(isNonEmptyString(error?.outcome) ? {mutationOutcome: error.outcome} : {}),
    ...(Number.isFinite(retryAfterMs) ? {retryAfterMs} : {}),
  });
}

function applied(fields) {
  return answer(HTTP_STATUS.OK, {
    success: true,
    outcome: ADMIN_OWNER_OPERATION_OUTCOME.APPLIED,
    ...fields,
  });
}

/**
 * The failure answer of an owner error that is neither a typed refusal nor
 * an owner that is not ready.
 * @param {Error} error
 * @param {string|null} code
 * @return {{statusCode: number, body: Object}}
 */
function ownerFailed(error, code) {
  return answer(HTTP_STATUS.INTERNAL_SERVER_ERROR, {
    success: false,
    outcome: ADMIN_OWNER_OPERATION_OUTCOME.FAILED,
    errorCode: code,
    error: error?.message || String(error),
    ...(isNonEmptyString(error?.outcome) ?
      {mutationOutcome: error.outcome} : {}),
  });
}

/**
 * Classify a thrown owner failure into one named answer.
 * @param {Error} error
 * @return {{statusCode: number, body: Object}}
 */
function answerOwnerFailure(error) {
  const code = isNonEmptyString(error?.code) ? error.code : null;
  if (REFUSAL_STATUS_BY_CODE.has(code)) {
    return refusal(code, error.message);
  }
  if (error?.deferRetry === true ||
      NOT_READY_MUTATION_OUTCOMES.has(error?.outcome)) {
    return ownerNotReady(error?.retryAfterMs, error);
  }
  return ownerFailed(error, code);
}

function resolveOwner(provider) {
  return typeof provider === LOCAL_STR_FUNCTION ? provider() || null : null;
}

class AdminOwnerOperations {
  /**
   * @param {Object} [providers] - The authoritative owners, resolved at
   *   call time.
   * @param {Function} [providers.getDynamicConfigService]
   * @param {Function} [providers.getTablePolicyService]
   * @param {Function} [providers.getNodesOwner]
   * @param {Function} [providers.getServiceDefinitionsOwner]
   * @param {Function} [providers.submitLocalDrainIntent]
   * @param {string} nodeId - The serving node.
   */
  constructor(providers = {}, nodeId = null) {
    this.nodeId = nodeId;
    this.getDynamicConfigService = providers.getDynamicConfigService;
    this.getTablePolicyService = providers.getTablePolicyService;
    this.getNodesOwner = providers.getNodesOwner;
    this.getServiceDefinitionsOwner = providers.getServiceDefinitionsOwner;
    this.getLogsOwner = providers.getLogsOwner;
    this.submitLocalDrainIntent = providers.submitLocalDrainIntent;
  }

  /**
   * Set one configuration value through its owner.
   * @param {string} configKey
   * @param {{value: *}} body
   * @return {Promise<{statusCode: number, body: Object}>}
   */
  async setConfig(configKey, body = {}) {
    if (!isNonEmptyString(configKey)) {
      return refusal(ADMIN_OWNER_OPERATION_ERROR_CODE.CONFIG_KEY_REQUIRED,
        ADMIN_OWNER_OPERATION_ERROR_MSG.CONFIG_KEY_REQUIRED);
    }
    const owner = resolveOwner(this.getDynamicConfigService);
    if (!owner) return ownerNotReady();
    try {
      const result = await owner.set(configKey, body?.value,
        isNonEmptyString(body?.updatedBy) ? body.updatedBy : 'admin');
      return applied({
        key: result.key,
        value: result.value,
        requiresRestart: result.requiresRestart === true,
      });
    } catch (error) {
      return answerOwnerFailure(error);
    }
  }

  /**
   * Drain this node through its one-way lifecycle owner.
   * @param {string} nodeId
   * @param {{drainDeadlineMs?: number}} body
   * @return {Promise<{statusCode: number, body: Object}>}
   */
  async drainNode(nodeId, body = {}) {
    if (!isNonEmptyString(nodeId)) {
      return refusal(ADMIN_OWNER_OPERATION_ERROR_CODE.NODE_ID_REQUIRED,
        ADMIN_OWNER_OPERATION_ERROR_MSG.NODE_ID_REQUIRED);
    }
    if (nodeId !== this.nodeId) {
      return refusal(
        ADMIN_OWNER_OPERATION_ERROR_CODE.NODE_DRAIN_REMOTE_UNSUPPORTED,
        ADMIN_OWNER_OPERATION_ERROR_MSG.NODE_DRAIN_REMOTE_UNSUPPORTED);
    }
    if (typeof this.submitLocalDrainIntent !== LOCAL_STR_FUNCTION) {
      return ownerNotReady();
    }
    try {
      const drainDeadlineMs = Number.isSafeInteger(body?.drainDeadlineMs) ?
        body.drainDeadlineMs : null;
      const snapshot = await this.submitLocalDrainIntent({
        drainDeadlineMs,
        reasonCode: ADMIN_DRAIN_REASON_CODE,
      });
      return applied({
        nodeId,
        phase: snapshot?.phase || null,
        reasons: Array.isArray(snapshot?.reasons) ? snapshot.reasons : [],
      });
    } catch (error) {
      return answerOwnerFailure(error);
    }
  }

  /**
   * Remove a terminal node's row through the nodes owner.
   * @param {string} nodeId
   * @param {{bootIncarnation: number, status: string}} observation
   * @return {Promise<{statusCode: number, body: Object}>}
   */
  async removeNode(nodeId, observation) {
    const owner = resolveOwner(this.getNodesOwner);
    if (!owner) return ownerNotReady();
    try {
      return applied(await owner.removeTerminalNode(nodeId, observation));
    } catch (error) {
      return answerOwnerFailure(error);
    }
  }

  /** Persist desired built-in listener state through its authoritative owner. */
  async scalePostgresWireListener(body) {
    const owner = resolveOwner(this.getServiceDefinitionsOwner);
    if (!owner) return ownerNotReady();
    try {
      return applied(await owner.scalePostgresWireListener(body));
    } catch (error) {
      return answerOwnerFailure(error);
    }
  }

  /** Record one fixed diagnostic marker through the logs owner. */
  async appendDiagnosticMarker(body) {
    const owner = resolveOwner(this.getLogsOwner);
    if (!owner) return ownerNotReady();
    try {
      return applied(await owner.appendDiagnosticMarker(body, this.nodeId));
    } catch (error) {
      return answerOwnerFailure(error);
    }
  }

  /**
   * Merge policy overrides into one table's policy through its owner.
   * @param {string} tableId
   * @param {{policy: Object}} body
   * @return {Promise<{statusCode: number, body: Object}>}
   */
  async updateTablePolicy(tableId, body = {}) {
    const owner = resolveOwner(this.getTablePolicyService);
    if (!owner) return ownerNotReady();
    try {
      const result = await owner.updateTablePolicy(tableId, body?.policy);
      return applied({tableId: result.tableId, policy: result.policy});
    } catch (error) {
      return answerOwnerFailure(error);
    }
  }
}

function sendAnswer(reply, result) {
  return reply.code(result.statusCode).send(result.body);
}

/**
 * Register the owner operations on the admin HTTP server.
 * @param {Object} fastify
 * @param {AdminOwnerOperations} operations
 */
function registerAdminOwnerOperationRoutes(fastify, operations) {
  fastify.post(ADMIN_OWNER_OPERATION_ROUTE.LOG_MARKER,
    async (request, reply) => sendAnswer(reply,
      await operations.appendDiagnosticMarker(request.body)));
  fastify.post(ADMIN_OWNER_OPERATION_ROUTE.POSTGRES_WIRE_SCALE,
    async (request, reply) => sendAnswer(reply,
      await operations.scalePostgresWireListener(request.body)));
  fastify.put(ADMIN_OWNER_OPERATION_ROUTE.CONFIG_BY_KEY,
    async (request, reply) => sendAnswer(reply,
      await operations.setConfig(request.params.configKey, request.body)));
  fastify.post(ADMIN_OWNER_OPERATION_ROUTE.NODE_DRAIN,
    async (request, reply) => sendAnswer(reply,
      await operations.drainNode(request.params.nodeId, request.body)));
  fastify.delete(ADMIN_OWNER_OPERATION_ROUTE.NODE_BY_ID,
    async (request, reply) => sendAnswer(reply,
      await operations.removeNode(request.params.nodeId, request.body)));
  fastify.patch(ADMIN_OWNER_OPERATION_ROUTE.TABLE_POLICY,
    async (request, reply) => sendAnswer(reply,
      await operations.updateTablePolicy(request.params.tableId,
        request.body)));
}

export {
  ADMIN_OWNER_OPERATION_ERROR_CODE,
  ADMIN_OWNER_OPERATION_OUTCOME,
  ADMIN_OWNER_OPERATION_PATH,
  AdminOwnerOperations,
  registerAdminOwnerOperationRoutes,
};
