import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  COLUMN,
  NODE_STATE,
  SERVICE_STATUS,
  STATE,
  STRING,
} from '../constants/index.js';
import {
  compareNodeHeartbeatWatermarks,
  getNodeHeartbeatWatermark,
} from '../node/node-readiness-policy.js';
import {assertCritical} from '../utils/assert.js';
import {
  getControlPlaneNodeStatePublicationProfile,
} from './control-plane-constants.js';
import {normalizeKnownNodeBootIncarnation} from
  './control-plane-error-classification.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
  isAuthoritativeControlPlaneRowReadSuccessful,
  readAuthoritativeControlPlaneRows,
} from './control-plane-system-table-gateway.js';
import {DISPATCH_DEFAULT} from './replica-dispatch-service-constants.js';

/**
 * The one semantic owner of durable node lifecycle publication (CONNECTED
 * liveness and READY promotion) at the NODES boundary. Heartbeat (local
 * ingress) and ReplicaDispatch (routed ingress) are adapters that build one
 * request and call publish(); neither decides lifecycle policy.
 *
 * publish() never throws for a domain outcome: every result is a frozen,
 * named outcome. It performs no retries, timeouts or queueing; a deferred
 * outcome carries retryAfterMs and the caller's next level-triggered tick is
 * the retry.
 */
// Intrinsics are captured at import so a later replacement cannot change how
// durable identity and lifecycle columns are projected.
const arrayIsArray = Array.isArray;
const jsonStringify = JSON.stringify;
const mathFloor = Math.floor;
const mathMax = Math.max;
const numberIsFinite = Number.isFinite;
const objectFreeze = Object.freeze;

const NODE_LIFECYCLE_PUBLICATION_OUTCOME = Object.freeze({
  APPLIED: 'applied',
  ALREADY_CURRENT: 'already_current',
  RESOLVED_BY_READBACK: 'resolved_by_readback',
  NOT_APPLIED_SOURCE_UNCHANGED: 'not_applied_source_unchanged',
  REFUSED_SOURCE_CHANGED: 'refused_source_changed',
  REFUSED_STALE_INCARNATION: 'refused_stale_incarnation',
  REFUSED_ROW_MISSING: 'refused_row_missing',
  REFUSED_INCARNATION_REQUIRED: 'refused_incarnation_required',
  AUTHORITY_UNAVAILABLE: 'authority_unavailable',
});

const COMPLETED_OUTCOMES = Object.freeze([
  NODE_LIFECYCLE_PUBLICATION_OUTCOME.APPLIED,
  NODE_LIFECYCLE_PUBLICATION_OUTCOME.ALREADY_CURRENT,
  NODE_LIFECYCLE_PUBLICATION_OUTCOME.RESOLVED_BY_READBACK,
]);

const DEFERRED_OUTCOMES = Object.freeze([
  NODE_LIFECYCLE_PUBLICATION_OUTCOME.NOT_APPLIED_SOURCE_UNCHANGED,
  NODE_LIFECYCLE_PUBLICATION_OUTCOME.AUTHORITY_UNAVAILABLE,
]);

/**
 * The durable row now reflects the request (it carries the authoritative row).
 * @param {string} outcome
 * @return {boolean}
 */
function isNodeLifecyclePublicationCompleted(outcome) {
  return COMPLETED_OUTCOMES.includes(outcome);
}

/**
 * Nothing was decided against the request; a later attempt may apply it.
 * @param {string} outcome
 * @return {boolean}
 */
function isNodeLifecyclePublicationDeferred(outcome) {
  return DEFERRED_OUTCOMES.includes(outcome);
}

const NODE_LIFECYCLE_PUBLICATION_STATES = Object.freeze([
  STATE.CONNECTED,
  STATE.READY,
]);

const READY_SOURCE_STATUSES = Object.freeze([
  NODE_STATE.JOINING,
  SERVICE_STATUS.ACTIVE,
]);

const NODE_TELEMETRY_COLUMNS = Object.freeze([
  COLUMN.CPU_CORES,
  COLUMN.MEMORY_MB,
  COLUMN.DISK_GB,
  COLUMN.CPU_USAGE_PERCENT,
  COLUMN.MEMORY_USAGE_PERCENT,
  COLUMN.DISK_USAGE_PERCENT,
]);

const NODE_LIFECYCLE_CRITICAL_WORK = 'critical';

const NODE_LIFECYCLE_PUBLICATION_LITERAL = Object.freeze({
  OWNER: 'node_lifecycle_publication',
  COALESCING_KEY_PREFIX: 'node-state:',
  INVALID_REQUEST: 'NodeLifecyclePublication received an invalid request',
  GATEWAY_REQUIRED:
    'NodeLifecyclePublication requires a control-plane system-table gateway',
  LEASE_AUTHORITY_REQUIRED:
    'NodeLifecyclePublication requires the node READY lease authority',
  QUERY_TIMEOUT_LEASE_DIVISOR: 3,
});

// Lifecycle writes are routed to the NODES partition owner; the caller's
// local projection is installed from the outcome row, never awaited here.
const NODE_LIFECYCLE_WRITE_ROUTING = Object.freeze({
  allowCoalescing: true,
  skipCacheWait: true,
});

// The lifecycle source and readback are read from the NODES partition owner
// through the gateway, wherever this owner runs (a joiner, a message-group
// replica, the seed); never from a possibly non-owner local replica.
const NODE_LIFECYCLE_AUTHORITATIVE_READ = Object.freeze({
  owner: NODE_LIFECYCLE_PUBLICATION_LITERAL.OWNER,
  authoritativeReadMode:
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
  leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
  deliveryPriority: NODE_LIFECYCLE_CRITICAL_WORK,
  workClass: NODE_LIFECYCLE_CRITICAL_WORK,
});

const SELECT_NODE_ROW_SQL =
  `SELECT * FROM ${SYSTEM_TABLE_NAME.NODES} WHERE ${COLUMN.NODE_ID} = ?`;

function freezeOutcome(outcome, fields = {}) {
  return objectFreeze({outcome, ...fields});
}

function readColumn(row, column) {
  const value = row?.[column];
  return value === undefined ? null : value;
}

function normalizeCapabilities(capabilities) {
  if (arrayIsArray(capabilities)) {
    return jsonStringify(capabilities);
  }
  return typeof capabilities === 'string' && capabilities.length > 0 ?
    capabilities :
    null;
}

function resolvePositiveInteger(value) {
  const numeric = Number(value);
  return numberIsFinite(numeric) && numeric > 0 ? mathFloor(numeric) : null;
}

// Startup-owned storage-budget columns travel with every publication so a
// liveness write never clears the budget the registration seeded.
function resolveStorageBudgetColumns(source) {
  const columns = {};
  const budgetBytes = resolvePositiveInteger(
    source[COLUMN.STORAGE_BUDGET_BYTES],
  );
  if (budgetBytes !== null) {
    columns[COLUMN.STORAGE_BUDGET_BYTES] = budgetBytes;
  }
  const budgetSource = source[COLUMN.STORAGE_BUDGET_SOURCE];
  if (typeof budgetSource === 'string' && budgetSource.length > 0) {
    columns[COLUMN.STORAGE_BUDGET_SOURCE] = budgetSource;
  }
  const budgetUpdatedAt = resolvePositiveInteger(
    source[COLUMN.STORAGE_BUDGET_UPDATED_AT],
  );
  if (budgetUpdatedAt !== null) {
    columns[COLUMN.STORAGE_BUDGET_UPDATED_AT] = budgetUpdatedAt;
  }
  return columns;
}

function resolveTelemetryColumns(telemetry) {
  if (!telemetry || typeof telemetry !== 'object') {
    return {};
  }
  const columns = {};
  for (const column of NODE_TELEMETRY_COLUMNS) {
    if (numberIsFinite(telemetry[column])) {
      columns[column] = telemetry[column];
    }
  }
  return {...columns, ...resolveStorageBudgetColumns(telemetry)};
}

// Only forward liveness progress is written: a request that does not advance
// the durable heartbeat watermark is either already current or lost a race.
function presenceOrder(previousValue, nextValue) {
  if (previousValue === null && nextValue !== null) {
    return 1;
  }
  return previousValue !== null && nextValue === null ? -1 : 0;
}

function isLifecycleWatermarkNewer(previous, next) {
  if (!previous || !next) {
    return true;
  }
  const order =
    presenceOrder(previous.lastHeartbeat, next.lastHeartbeat) ||
    presenceOrder(previous.readyLeaseExpiresAt, next.readyLeaseExpiresAt) ||
    compareNodeHeartbeatWatermarks(previous, next);
  return order > 0;
}

function assertPublicationRequest(request) {
  const valid = request && typeof request === 'object' &&
    typeof request.nodeId === 'string' && request.nodeId.length > 0 &&
    NODE_LIFECYCLE_PUBLICATION_STATES.includes(request.state);
  if (!valid) {
    throw new TypeError(NODE_LIFECYCLE_PUBLICATION_LITERAL.INVALID_REQUEST);
  }
}

// The row the CAS must still observe: full identity plus the lifecycle and
// liveness columns the source policy decided on.
function buildSourcePredicate(source, bootIncarnation) {
  return {
    [COLUMN.NODE_ID]: source[COLUMN.NODE_ID],
    [COLUMN.BOOT_INCARNATION]: bootIncarnation,
    [COLUMN.STATUS]: readColumn(source, COLUMN.STATUS),
    [COLUMN.CONNECTION_STATE]: readColumn(source, COLUMN.CONNECTION_STATE),
    [COLUMN.LAST_HEARTBEAT]: readColumn(source, COLUMN.LAST_HEARTBEAT),
    [COLUMN.CREATED_AT]: readColumn(source, COLUMN.CREATED_AT),
  };
}

function sourceLifecycleUnchanged(observed, source) {
  return [
    COLUMN.NODE_ID,
    COLUMN.BOOT_INCARNATION,
    COLUMN.STATUS,
    COLUMN.CONNECTION_STATE,
    COLUMN.CREATED_AT,
  ].every((column) =>
    readColumn(observed, column) === readColumn(source, column));
}

function destinationObserved(observed, plan) {
  return readColumn(observed, COLUMN.NODE_ID) === plan.nodeId &&
    readColumn(observed, COLUMN.STATUS) ===
      readColumn(plan.expectedRow, COLUMN.STATUS) &&
    readColumn(observed, COLUMN.CONNECTION_STATE) === plan.nextState &&
    Number(readColumn(observed, COLUMN.LAST_HEARTBEAT)) >= plan.heartbeatAt;
}

// A JOINING source that another READY writer already activated for the same
// boot is the requested destination, not a conflict.
function readyActivationObserved(observed, plan) {
  return plan.nextState === STATE.READY &&
    readColumn(plan.source, COLUMN.STATUS) === NODE_STATE.JOINING &&
    readColumn(observed, COLUMN.STATUS) === SERVICE_STATUS.ACTIVE &&
    readColumn(observed, COLUMN.CONNECTION_STATE) === STATE.READY;
}

function lifecycleAlreadyCurrent(row, plan) {
  return readColumn(row, COLUMN.CONNECTION_STATE) === plan.nextState &&
    readColumn(row, COLUMN.STATUS) ===
      readColumn(plan.expectedRow, COLUMN.STATUS);
}

class NodeLifecyclePublication {
  /**
   * @param {Object} options
   * @param {Object} options.gateway - Control-plane system-table gateway
   *   (persistence and routing to the NODES partition, never policy).
   * @param {NodeReadyLeaseAuthority} options.leaseAuthority
   * @param {Function} [options.now]
   */
  constructor(options = {}) {
    this.gateway = assertCritical(
      options.gateway,
      NODE_LIFECYCLE_PUBLICATION_LITERAL.GATEWAY_REQUIRED,
    );
    this.leaseAuthority = assertCritical(
      options.leaseAuthority,
      NODE_LIFECYCLE_PUBLICATION_LITERAL.LEASE_AUTHORITY_REQUIRED,
    );
    this.now = typeof options.now === 'function' ?
      options.now :
      () => Date.now();
    this.retryAfterMs = DISPATCH_DEFAULT.NODE_STATE_UPDATE_RETRY_AFTER_MS;
  }

  /**
   * Publish one node lifecycle request through the durable NODES boundary.
   * @param {Object} request
   * @param {string} request.nodeId
   * @param {number} request.bootIncarnation
   * @param {string} request.state - CONNECTED or READY.
   * @param {boolean} [request.heartbeatOnly]
   * @param {number} [request.heartbeatAt]
   * @param {string} [request.nodeAddress]
   * @param {Array<string>|string} [request.capabilities]
   * @param {Object} [request.telemetry] - Telemetry and storage-budget columns.
   * @param {string} [request.publicationMode]
   * @return {Promise<Object>} Frozen NODE_LIFECYCLE_PUBLICATION_OUTCOME result.
   */
  async publish(request) {
    assertPublicationRequest(request);
    const bootIncarnation =
      normalizeKnownNodeBootIncarnation(request.bootIncarnation);
    if (bootIncarnation === 0) {
      return freezeOutcome(
        NODE_LIFECYCLE_PUBLICATION_OUTCOME.REFUSED_INCARNATION_REQUIRED,
      );
    }
    const read = await this.readAuthoritativeNodeRow(request.nodeId);
    if (read.outcome) {
      return read.outcome;
    }
    const refusal = this.resolveSourceRefusal(read.row, bootIncarnation);
    if (refusal) {
      return refusal;
    }
    const plan = this.planPublication(request, read.row, bootIncarnation);
    if (plan.outcome) {
      return plan.outcome;
    }
    return this.applyPublication(plan);
  }

  async readAuthoritativeNodeRow(nodeId) {
    let result = null;
    try {
      result = await readAuthoritativeControlPlaneRows(
        this.gateway,
        SYSTEM_TABLE_NAME.NODES,
        SELECT_NODE_ROW_SQL,
        [nodeId],
        NODE_LIFECYCLE_AUTHORITATIVE_READ,
      );
    } catch (_error) {
      result = null;
    }
    return this.classifyNodeRowRead(result, nodeId);
  }

  // Only an explicit successful read is an answer; a missing row is a named
  // refusal, never an empty source to publish over.
  classifyNodeRowRead(result, nodeId) {
    if (!isAuthoritativeControlPlaneRowReadSuccessful(result)) {
      return {outcome: this.buildAuthorityUnavailable(result)};
    }
    const rows = arrayIsArray(result.rows) ? result.rows : [];
    const row = rows.find((candidate) =>
      candidate?.[COLUMN.NODE_ID] === nodeId) || null;
    return row ?
      {row} :
      {
        outcome: freezeOutcome(
          NODE_LIFECYCLE_PUBLICATION_OUTCOME.REFUSED_ROW_MISSING,
        ),
      };
  }

  buildAuthorityUnavailable(result) {
    const retryAfterMs = Number(result?.retryAfterMs);
    return freezeOutcome(
      NODE_LIFECYCLE_PUBLICATION_OUTCOME.AUTHORITY_UNAVAILABLE,
      {
        retryAfterMs: numberIsFinite(retryAfterMs) && retryAfterMs > 0 ?
          retryAfterMs :
          this.retryAfterMs,
      },
    );
  }

  // The incarnation fence: a lower boot is a zombie writer; a row still on
  // another boot has not been advanced by the registration verb, which owns
  // that transition, so publication must not advance it.
  resolveSourceRefusal(row, bootIncarnation) {
    const knownIncarnation =
      normalizeKnownNodeBootIncarnation(row[COLUMN.BOOT_INCARNATION]);
    if (knownIncarnation > bootIncarnation) {
      return freezeOutcome(
        NODE_LIFECYCLE_PUBLICATION_OUTCOME.REFUSED_STALE_INCARNATION,
        {knownIncarnation},
      );
    }
    if (knownIncarnation !== bootIncarnation) {
      return freezeOutcome(
        NODE_LIFECYCLE_PUBLICATION_OUTCOME.REFUSED_SOURCE_CHANGED,
        {knownIncarnation},
      );
    }
    return null;
  }

  resolveNextState(request, source, now) {
    const promotedFromConnected =
      request.state === STATE.CONNECTED &&
      readColumn(source, COLUMN.CONNECTION_STATE) === STATE.READY &&
      this.leaseAuthority.holdsLiveLease(source, now);
    return promotedFromConnected ? STATE.READY : request.state;
  }

  planPublication(request, source, bootIncarnation) {
    const now = this.now();
    const nextState = this.resolveNextState(request, source, now);
    if (nextState === STATE.READY &&
        !READY_SOURCE_STATUSES.includes(readColumn(source, COLUMN.STATUS))) {
      return {
        outcome: freezeOutcome(
          NODE_LIFECYCLE_PUBLICATION_OUTCOME.REFUSED_SOURCE_CHANGED,
        ),
      };
    }
    const requestedHeartbeatAt = Number(request.heartbeatAt);
    const heartbeatAt = numberIsFinite(requestedHeartbeatAt) ?
      mathMax(requestedHeartbeatAt, now) :
      now;
    const readyLeaseExpiresAt = nextState === STATE.READY ?
      this.leaseAuthority.grant(heartbeatAt) :
      null;
    const update = this.buildUpdateRow(request, source, {
      nextState,
      heartbeatAt,
      readyLeaseExpiresAt,
      bootIncarnation,
    });
    const plan = {
      request,
      nodeId: request.nodeId,
      source,
      nextState,
      heartbeatAt,
      bootIncarnation,
      update,
      expectedRow: {...source, ...update},
    };
    if (!isLifecycleWatermarkNewer(
      getNodeHeartbeatWatermark(source),
      this.resolveStalenessWatermark(request, update),
    )) {
      plan.outcome = lifecycleAlreadyCurrent(source, plan) ?
        freezeOutcome(NODE_LIFECYCLE_PUBLICATION_OUTCOME.ALREADY_CURRENT, {
          row: source,
          observedAtMs: now,
        }) :
        this.buildSourceUnchanged();
    }
    return plan;
  }

  // READY is judged at write time (a lagged READY is rebased to a full
  // lease); any other ask is judged by the liveness it actually observed, so a
  // delayed CONNECTED cannot regress a fresher row.
  resolveStalenessWatermark(request, update) {
    if (request.state === STATE.READY) {
      return getNodeHeartbeatWatermark(update);
    }
    const requestedHeartbeatAt = Number(request.heartbeatAt);
    return getNodeHeartbeatWatermark({
      [COLUMN.LAST_HEARTBEAT]: numberIsFinite(requestedHeartbeatAt) ?
        requestedHeartbeatAt :
        update[COLUMN.LAST_HEARTBEAT],
      [COLUMN.READY_LEASE_EXPIRES_AT]: null,
      [COLUMN.CONNECTION_STATE]: request.state,
    });
  }

  buildUpdateRow(request, source, decision) {
    const capabilities = normalizeCapabilities(request.capabilities);
    return {
      [COLUMN.NODE_ID]: request.nodeId,
      [COLUMN.NODE_ADDRESS]:
        request.nodeAddress ||
        readColumn(source, COLUMN.NODE_ADDRESS) ||
        STRING.UNKNOWN,
      ...resolveTelemetryColumns(request.telemetry),
      ...(decision.nextState === STATE.READY ?
        {[COLUMN.STATUS]: SERVICE_STATUS.ACTIVE} :
        {}),
      [COLUMN.CONNECTION_STATE]: decision.nextState,
      ...(capabilities ? {[COLUMN.CAPABILITIES]: capabilities} : {}),
      [COLUMN.LAST_HEARTBEAT]: decision.heartbeatAt,
      [COLUMN.READY_LEASE_EXPIRES_AT]: decision.readyLeaseExpiresAt,
      [COLUMN.BOOT_INCARNATION]: decision.bootIncarnation,
    };
  }

  buildWriteOptions(plan) {
    const profile = getControlPlaneNodeStatePublicationProfile({
      publicationMode: plan.request.publicationMode,
      heartbeatOnly: plan.request.heartbeatOnly === true,
      state: plan.nextState,
    });
    return {
      ...NODE_LIFECYCLE_WRITE_ROUTING,
      coalescingKey:
        `${NODE_LIFECYCLE_PUBLICATION_LITERAL.COALESCING_KEY_PREFIX}` +
        `${plan.nodeId}`,
      deliveryPriority: profile.deliveryPriority,
      pressureRetryAfterMs: this.retryAfterMs,
      queryTimeoutMs: mathMax(1, mathFloor(
        this.leaseAuthority.readyLeaseMs /
          NODE_LIFECYCLE_PUBLICATION_LITERAL.QUERY_TIMEOUT_LEASE_DIVISOR,
      )),
      workloadClass: profile.workloadClass,
      workClass: profile.workClass,
    };
  }

  buildSourceUnchanged() {
    return freezeOutcome(
      NODE_LIFECYCLE_PUBLICATION_OUTCOME.NOT_APPLIED_SOURCE_UNCHANGED,
      {retryAfterMs: this.retryAfterMs},
    );
  }

  async applyPublication(plan) {
    let result = null;
    try {
      result = await this.gateway.updateSystemTableRow(
        SYSTEM_TABLE_NAME.NODES,
        buildSourcePredicate(plan.source, plan.bootIncarnation),
        plan.update,
        this.buildWriteOptions(plan),
      );
    } catch (_error) {
      result = null;
    }
    const affectedRows = Number(result?.partitionResult?.affectedRows);
    if (result?.success !== false && affectedRows > 0) {
      const originHlc = result?.partitionResult?.originHlc;
      return freezeOutcome(NODE_LIFECYCLE_PUBLICATION_OUTCOME.APPLIED, {
        row: typeof originHlc === 'string' && originHlc.length > 0 ?
          {...plan.expectedRow, [COLUMN.UPDATED_AT_HLC]: originHlc} :
          plan.expectedRow,
        observedAtMs: this.now(),
      });
    }
    return this.classifyByReadback(plan);
  }

  // Error, zero-row, lost or unknown acknowledgement: the authoritative row
  // decides what happened; nothing is re-written here.
  async classifyByReadback(plan) {
    const read = await this.readAuthoritativeNodeRow(plan.nodeId);
    if (read.outcome) {
      return read.outcome;
    }
    const observed = read.row;
    const refusal = this.resolveSourceRefusal(observed, plan.bootIncarnation);
    if (refusal) {
      return refusal;
    }
    if (destinationObserved(observed, plan) ||
        readyActivationObserved(observed, plan)) {
      return freezeOutcome(
        NODE_LIFECYCLE_PUBLICATION_OUTCOME.RESOLVED_BY_READBACK,
        {row: observed, observedAtMs: this.now()},
      );
    }
    if (sourceLifecycleUnchanged(observed, plan.source)) {
      return this.buildSourceUnchanged();
    }
    return freezeOutcome(
      NODE_LIFECYCLE_PUBLICATION_OUTCOME.REFUSED_SOURCE_CHANGED,
    );
  }
}

export {
  NODE_LIFECYCLE_AUTHORITATIVE_READ,
  NODE_LIFECYCLE_PUBLICATION_OUTCOME,
  NodeLifecyclePublication,
  SELECT_NODE_ROW_SQL,
  isNodeLifecyclePublicationCompleted,
  isNodeLifecyclePublicationDeferred,
};
