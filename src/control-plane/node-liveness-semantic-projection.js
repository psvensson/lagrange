import {COLUMN, SERVICE_STATUS, STATE} from
  '../constants/index.js';
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';

const arrayPrototypeIncludes = Function.call.bind(Array.prototype.includes);
const jsonStringify = JSON.stringify;
const numberCoerce = Number;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const objectFreeze = Object.freeze;
const objectHasOwn = Object.hasOwn;
const objectIs = Object.is;
const stringPrototypeToLowerCase =
  Function.call.bind(String.prototype.toLowerCase);
const stringPrototypeTrim = Function.call.bind(String.prototype.trim);

const NODE_LIVENESS_NUMERIC_TIME_ERROR =
  'Node liveness projection requires numeric nowMs';
const NODE_STATE_REPORTER_PUBLICATION_PATH = 'node_state_reporter';
const ATTEMPT_TIMEOUT_FAILURE_STAGE = 'attempt_timeout';
const READY_CONNECTION_STATE =
  stringPrototypeToLowerCase(String(STATE.READY));
const ACTIVE_SERVICE_STATUS =
  stringPrototypeToLowerCase(String(SERVICE_STATUS.ACTIVE));
const READY_LEASE_FIELD_NAMES = objectFreeze([
  COLUMN.READY_LEASE_EXPIRES_AT,
  'ready_lease_expires_at',
  'readyLeaseExpiresAt',
  'readyLeaseExpiresAtMs',
  'readyLeaseExpires',
]);
const LAST_HEARTBEAT_FIELD_NAMES = objectFreeze([
  COLUMN.LAST_HEARTBEAT,
  'last_heartbeat',
  'lastHeartbeat',
  'lastHeartbeatAt',
]);
const CONNECTION_STATE_FIELD_NAMES = objectFreeze([
  COLUMN.CONNECTION_STATE,
  'connection_state',
  'connectionState',
]);
const NODE_ID_FIELD_NAMES = objectFreeze([
  COLUMN.NODE_ID,
  'node_id',
]);
const STATUS_FIELD_NAMES = objectFreeze([
  COLUMN.STATUS,
  'status',
]);

const NODE_LIVENESS_SEMANTIC_STATE = objectFreeze({
  ACTIVE: 'active',
  CLEARED: 'cleared',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  EXPIRED: 'expired',
  FRESH: 'fresh',
  HEALTHY: 'healthy',
  INACTIVE: 'inactive',
  INVALID: 'invalid',
  STALE: 'stale',
  UNKNOWN: 'unknown',
  VALID: 'valid',
});

const NODE_LIVENESS_SEMANTIC_THRESHOLD_DEFAULT = objectFreeze({
  clusterMemberStaleHeartbeatMs: 30_000,
  derivationGraceMs: 60_000,
  repairStaleHeartbeatMs: 10_000,
  transportGraceMs: 15_000,
});

const ROW_READY_CONNECTION_STATES = objectFreeze([
  stringPrototypeToLowerCase(String(STATE.CONNECTED)),
  READY_CONNECTION_STATE,
]);
const ROUTER_CONNECTED_STATE = stringPrototypeToLowerCase(
  String(STATE.CONNECTED),
);

function normalizeFiniteNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && stringPrototypeTrim(value).length === 0) {
    return null;
  }
  const numeric = numberCoerce(value);
  return numberIsSafeInteger(numeric) && numeric >= 0 &&
    !objectIs(numeric, -0) ? numeric : null;
}

function normalizeSemanticNowMs(value) {
  if (typeof value !== 'number' || !numberIsSafeInteger(value) || value < 0 ||
      objectIs(value, -0)) {
    throw new TypeError(NODE_LIVENESS_NUMERIC_TIME_ERROR);
  }
  return value;
}

function normalizeState(value) {
  const state = typeof value === 'string' ?
    stringPrototypeToLowerCase(value) : '';
  return state.length > 0 ? state : null;
}

function normalizeThreshold(value, fallback) {
  return typeof value === 'number' && numberIsSafeInteger(value) &&
    value > 0 ? value : fallback;
}

function normalizeThresholds(thresholds = {}) {
  const source = copyStrictOwnDataRecord(thresholds) || {};
  return objectFreeze({
    clusterMemberStaleHeartbeatMs: normalizeThreshold(
      source.clusterMemberStaleHeartbeatMs,
      NODE_LIVENESS_SEMANTIC_THRESHOLD_DEFAULT
        .clusterMemberStaleHeartbeatMs,
    ),
    derivationGraceMs: normalizeThreshold(
      source.derivationGraceMs,
      NODE_LIVENESS_SEMANTIC_THRESHOLD_DEFAULT.derivationGraceMs,
    ),
    repairStaleHeartbeatMs: normalizeThreshold(
      source.repairStaleHeartbeatMs,
      NODE_LIVENESS_SEMANTIC_THRESHOLD_DEFAULT.repairStaleHeartbeatMs,
    ),
    transportGraceMs: normalizeThreshold(
      source.transportGraceMs,
      NODE_LIVENESS_SEMANTIC_THRESHOLD_DEFAULT.transportGraceMs,
    ),
  });
}

function hasOwnReadyLeaseField(nodeRow) {
  if (!nodeRow || typeof nodeRow !== 'object') return false;
  for (let index = 0; index < READY_LEASE_FIELD_NAMES.length; index += 1) {
    if (objectHasOwn(nodeRow, READY_LEASE_FIELD_NAMES[index])) return true;
  }
  return false;
}

function readFirstOwnValue(record, fieldNames) {
  if (!record) return undefined;
  for (let index = 0; index < fieldNames.length; index += 1) {
    const fieldName = fieldNames[index];
    if (objectHasOwn(record, fieldName) && record[fieldName] !== undefined) {
      return record[fieldName];
    }
  }
  return undefined;
}

function readNodeTimes(nodeRow) {
  return objectFreeze({
    lastHeartbeatMs: normalizeFiniteNumber(
      readFirstOwnValue(nodeRow, LAST_HEARTBEAT_FIELD_NAMES),
    ),
    readyLeaseExpiresAtMs: normalizeFiniteNumber(
      readFirstOwnValue(nodeRow, READY_LEASE_FIELD_NAMES),
    ),
  });
}

function projectDeadlineFreshness(valueMs, thresholdMs, nowMs) {
  const deadlineAtMs = valueMs + thresholdMs;
  if (!numberIsSafeInteger(valueMs) || !numberIsSafeInteger(deadlineAtMs)) {
    return objectFreeze({
      deadlineAtMs: null,
      state: NODE_LIVENESS_SEMANTIC_STATE.UNKNOWN,
    });
  }
  return objectFreeze({
    deadlineAtMs,
    state: nowMs < deadlineAtMs ?
      NODE_LIVENESS_SEMANTIC_STATE.FRESH :
      NODE_LIVENESS_SEMANTIC_STATE.STALE,
  });
}

function projectLease(nodeRow, readyLeaseExpiresAtMs, nowMs) {
  if (numberIsFinite(readyLeaseExpiresAtMs)) {
    return objectFreeze({
      expiresAtMs: readyLeaseExpiresAtMs,
      explicitlyCleared: false,
      state: nowMs < readyLeaseExpiresAtMs ?
        NODE_LIVENESS_SEMANTIC_STATE.VALID :
        NODE_LIVENESS_SEMANTIC_STATE.EXPIRED,
    });
  }
  const explicitlyCleared = hasOwnReadyLeaseField(nodeRow);
  return objectFreeze({
    expiresAtMs: null,
    explicitlyCleared,
    state: explicitlyCleared ?
      NODE_LIVENESS_SEMANTIC_STATE.CLEARED :
      NODE_LIVENESS_SEMANTIC_STATE.UNKNOWN,
  });
}

function projectTransportGrace(evidence, thresholds, nowMs) {
  if (evidence.transportGraceEligible !== true) {
    return objectFreeze({
      deadlineAtMs: null,
      state: NODE_LIVENESS_SEMANTIC_STATE.INACTIVE,
    });
  }
  const startedAtMs = normalizeFiniteNumber(
    evidence.transportGraceStartedAtMs,
  );
  if (!numberIsSafeInteger(startedAtMs) ||
      !numberIsSafeInteger(startedAtMs + thresholds.transportGraceMs)) {
    return objectFreeze({
      deadlineAtMs: null,
      state: NODE_LIVENESS_SEMANTIC_STATE.UNKNOWN,
    });
  }
  const deadlineAtMs = startedAtMs + thresholds.transportGraceMs;
  return objectFreeze({
    deadlineAtMs,
    state: nowMs < deadlineAtMs ?
      NODE_LIVENESS_SEMANTIC_STATE.ACTIVE :
      NODE_LIVENESS_SEMANTIC_STATE.EXPIRED,
  });
}

function projectProvisioningTrustGrace(evidence, thresholds, nowMs) {
  if (evidence.provisioningTrustGraceEligible !== true) {
    return objectFreeze({
      deadlineAtMs: null,
      state: NODE_LIVENESS_SEMANTIC_STATE.INACTIVE,
    });
  }
  const startedAtMs = normalizeFiniteNumber(
    evidence.provisioningTrustGraceStartedAtMs,
  );
  if (!numberIsSafeInteger(startedAtMs) ||
      !numberIsSafeInteger(
        startedAtMs + thresholds.clusterMemberStaleHeartbeatMs,
      )) {
    return objectFreeze({
      deadlineAtMs: null,
      state: NODE_LIVENESS_SEMANTIC_STATE.UNKNOWN,
    });
  }
  const deadlineAtMs =
    startedAtMs + thresholds.clusterMemberStaleHeartbeatMs;
  return objectFreeze({
    deadlineAtMs,
    state: nowMs < deadlineAtMs ?
      NODE_LIVENESS_SEMANTIC_STATE.ACTIVE :
      NODE_LIVENESS_SEMANTIC_STATE.EXPIRED,
  });
}

function buildUnknownLocalReporterProjection() {
  return objectFreeze({
    deadlineAtMs: null,
    state: NODE_LIVENESS_SEMANTIC_STATE.UNKNOWN,
    timeoutGraceState: NODE_LIVENESS_SEMANTIC_STATE.INACTIVE,
  });
}

function hasLocalReporterFailure(evidence, lastSuccessAtMs, lastFailureAtMs) {
  const consecutiveFailures = normalizeFiniteNumber(
    evidence.localReporterConsecutiveFailures,
  );
  if ((consecutiveFailures || 0) > 0) return true;
  if (!numberIsSafeInteger(lastFailureAtMs)) return false;
  return lastFailureAtMs > lastSuccessAtMs;
}

function isLocalReporterTimeoutGraceEligible(
  evidence,
  hasFailure,
  lastSuccessAtMs,
  lastFailureAtMs,
) {
  if (!hasFailure) return false;
  if (evidence.localReporterLastFailureStage !==
      ATTEMPT_TIMEOUT_FAILURE_STAGE) {
    return false;
  }
  const consecutiveFailures = normalizeFiniteNumber(
    evidence.localReporterConsecutiveFailures,
  );
  if ((consecutiveFailures || 0) > 1) return false;
  return numberIsSafeInteger(lastFailureAtMs) &&
    lastFailureAtMs > lastSuccessAtMs;
}

function projectLocalReporter(evidence, thresholds, nowMs) {
  if (evidence.localReporterPublicationPath !==
      NODE_STATE_REPORTER_PUBLICATION_PATH) {
    return buildUnknownLocalReporterProjection();
  }
  const lastSuccessAtMs = normalizeFiniteNumber(
    evidence.localReporterLastSuccessAtMs,
  );
  if (!numberIsSafeInteger(lastSuccessAtMs)) {
    return buildUnknownLocalReporterProjection();
  }
  const lastFailureAtMs = normalizeFiniteNumber(
    evidence.localReporterLastFailureAtMs,
  );
  const hasFailure = hasLocalReporterFailure(
    evidence,
    lastSuccessAtMs,
    lastFailureAtMs,
  );
  const timeoutGraceEligible = isLocalReporterTimeoutGraceEligible(
    evidence,
    hasFailure,
    lastSuccessAtMs,
    lastFailureAtMs,
  );
  const thresholdMs = timeoutGraceEligible ?
    thresholds.repairStaleHeartbeatMs :
    thresholds.clusterMemberStaleHeartbeatMs;
  const candidateDeadlineAtMs = lastSuccessAtMs + thresholdMs;
  const deadlineAtMs = numberIsSafeInteger(candidateDeadlineAtMs) ?
    candidateDeadlineAtMs : null;
  if (deadlineAtMs === null) {
    return buildUnknownLocalReporterProjection();
  }
  const fresh = nowMs < deadlineAtMs && (!hasFailure || timeoutGraceEligible);
  return objectFreeze({
    deadlineAtMs,
    state: fresh ?
      NODE_LIVENESS_SEMANTIC_STATE.FRESH :
      NODE_LIVENESS_SEMANTIC_STATE.STALE,
    timeoutGraceState: timeoutGraceEligible && fresh ?
      NODE_LIVENESS_SEMANTIC_STATE.ACTIVE :
      NODE_LIVENESS_SEMANTIC_STATE.INACTIVE,
  });
}

function resolveNextSemanticChangeAtMs(deadlines, nowMs) {
  let earliest = null;
  for (let index = 0; index < deadlines.length; index += 1) {
    const deadlineAtMs = deadlines[index];
    if (!numberIsFinite(deadlineAtMs) || deadlineAtMs <= nowMs) continue;
    if (earliest === null || deadlineAtMs < earliest) earliest = deadlineAtMs;
  }
  return earliest;
}

function projectClusterMembership(context) {
  if (!context.nodeRow) return NODE_LIVENESS_SEMANTIC_STATE.INVALID;
  if (!context.hasLeaseField && context.status === null) {
    return NODE_LIVENESS_SEMANTIC_STATE.HEALTHY;
  }
  if (context.readyNow) return NODE_LIVENESS_SEMANTIC_STATE.HEALTHY;
  if (!context.statusActive || context.lease.explicitlyCleared) {
    return NODE_LIVENESS_SEMANTIC_STATE.INVALID;
  }
  if (context.nodeId === context.localNodeId) {
    return NODE_LIVENESS_SEMANTIC_STATE.HEALTHY;
  }
  if (!context.transportConnected ||
      context.rowConnectionState !== READY_CONNECTION_STATE) {
    return NODE_LIVENESS_SEMANTIC_STATE.INVALID;
  }
  const hasFreshHeartbeatOrRouter =
    context.clusterHeartbeat.state ===
      NODE_LIVENESS_SEMANTIC_STATE.FRESH ||
    context.routerTransportConnected;
  return hasFreshHeartbeatOrRouter ?
    NODE_LIVENESS_SEMANTIC_STATE.HEALTHY :
    NODE_LIVENESS_SEMANTIC_STATE.INVALID;
}

function buildSemanticSignature(projection) {
  return jsonStringify([
    projection.statusSemantics.state,
    projection.connectionSemantics.rowState,
    projection.connectionSemantics.routerState,
    projection.connectionSemantics.connected,
    projection.clusterMembershipSemantics.state,
    projection.leaseSemantics.state,
    projection.leaseSemantics.explicitlyCleared,
    projection.heartbeatFreshness.clusterMembership,
    projection.heartbeatFreshness.derivationGrace,
    projection.repairFreshness.state,
    projection.transportSemantics.state,
    projection.transportSemantics.graceState,
    projection.provisioningTrustSemantics.graceState,
    projection.localReporterSemantics.state,
    projection.localReporterSemantics.timeoutGraceState,
    projection.readyNow,
    projection.readyWhenWritten,
  ]);
}

function normalizeProjectionContext(context) {
  const source = copyStrictOwnDataRecord(context) || {};
  const nowMs = normalizeSemanticNowMs(source.nowMs);
  const nodeRow = copyStrictOwnDataRecord(source.nodeRow);
  const candidateNodeId = typeof source.nodeId === 'string' ?
    source.nodeId : readFirstOwnValue(nodeRow, NODE_ID_FIELD_NAMES);
  const nodeId = typeof candidateNodeId === 'string' ? candidateNodeId : '';
  return {
    nodeId,
    nodeRow,
    nowMs,
    source,
    thresholds: normalizeThresholds(source.thresholds),
  };
}

function projectReadyWhenWritten(context) {
  if (!context.statusActive) return false;
  if (!numberIsFinite(context.readyLeaseExpiresAtMs)) return false;
  if (!numberIsFinite(context.lastHeartbeatMs)) return context.readyNow;
  return context.readyLeaseExpiresAtMs > context.lastHeartbeatMs;
}

function projectNodeSemanticFacts(context) {
  const {nodeRow, nowMs, source, thresholds} = context;
  const {lastHeartbeatMs, readyLeaseExpiresAtMs} = readNodeTimes(nodeRow);
  const status = normalizeState(readFirstOwnValue(nodeRow, STATUS_FIELD_NAMES));
  const rowStateSource = typeof source.rowConnectionState === 'string' ?
    source.rowConnectionState :
    readFirstOwnValue(nodeRow, CONNECTION_STATE_FIELD_NAMES);
  const rowConnectionState = normalizeState(rowStateSource);
  const routerConnectionState = normalizeState(source.routerConnectionState);
  const routerTransportConnected =
    source.routerTransportConnected === true ||
    routerConnectionState === ROUTER_CONNECTED_STATE;
  const transportConnected = typeof source.transportConnected === 'boolean' ?
    source.transportConnected :
    routerTransportConnected ||
      arrayPrototypeIncludes(ROW_READY_CONNECTION_STATES, rowConnectionState);
  const statusActive = status === ACTIVE_SERVICE_STATUS;
  const lease = projectLease(nodeRow, readyLeaseExpiresAtMs, nowMs);
  const clusterHeartbeat = projectDeadlineFreshness(
    lastHeartbeatMs,
    thresholds.clusterMemberStaleHeartbeatMs,
    nowMs,
  );
  const derivationHeartbeat = projectDeadlineFreshness(
    lastHeartbeatMs,
    thresholds.derivationGraceMs,
    nowMs,
  );
  const repairHeartbeat = projectDeadlineFreshness(
    lastHeartbeatMs,
    thresholds.repairStaleHeartbeatMs,
    nowMs,
  );
  const transportGrace = projectTransportGrace(source, thresholds, nowMs);
  const provisioningTrustGrace = projectProvisioningTrustGrace(
    source,
    thresholds,
    nowMs,
  );
  const localReporter = projectLocalReporter(source, thresholds, nowMs);
  const readyNow = statusActive &&
    lease.state === NODE_LIVENESS_SEMANTIC_STATE.VALID;
  const readyWhenWritten = projectReadyWhenWritten({
    lastHeartbeatMs,
    readyLeaseExpiresAtMs,
    readyNow,
    statusActive,
  });
  return {
    clusterHeartbeat,
    derivationHeartbeat,
    lastHeartbeatMs,
    lease,
    localReporter,
    provisioningTrustGrace,
    readyLeaseExpiresAtMs,
    readyNow,
    readyWhenWritten,
    repairHeartbeat,
    routerConnectionState,
    routerTransportConnected,
    rowConnectionState,
    status,
    statusActive,
    transportConnected,
    transportGrace,
  };
}

function buildNextSemanticDeadlineCandidates(facts) {
  return [
    facts.lease.state === NODE_LIVENESS_SEMANTIC_STATE.VALID ?
      facts.lease.expiresAtMs : null,
    facts.clusterHeartbeat.state === NODE_LIVENESS_SEMANTIC_STATE.FRESH ?
      facts.clusterHeartbeat.deadlineAtMs : null,
    facts.derivationHeartbeat.state === NODE_LIVENESS_SEMANTIC_STATE.FRESH ?
      facts.derivationHeartbeat.deadlineAtMs : null,
    facts.repairHeartbeat.state === NODE_LIVENESS_SEMANTIC_STATE.FRESH ?
      facts.repairHeartbeat.deadlineAtMs : null,
    facts.transportGrace.state === NODE_LIVENESS_SEMANTIC_STATE.ACTIVE ?
      facts.transportGrace.deadlineAtMs : null,
    facts.provisioningTrustGrace.state ===
      NODE_LIVENESS_SEMANTIC_STATE.ACTIVE ?
      facts.provisioningTrustGrace.deadlineAtMs : null,
    facts.localReporter.state === NODE_LIVENESS_SEMANTIC_STATE.FRESH ?
      facts.localReporter.deadlineAtMs : null,
  ];
}

function buildNodeLivenessProjection(context, facts, clusterMembershipState) {
  const nextSemanticChangeAtMs = resolveNextSemanticChangeAtMs(
    buildNextSemanticDeadlineCandidates(facts),
    context.nowMs,
  );
  const connectionState = facts.transportConnected ?
    NODE_LIVENESS_SEMANTIC_STATE.CONNECTED :
    NODE_LIVENESS_SEMANTIC_STATE.DISCONNECTED;
  return objectFreeze({
    nodeId: context.nodeId,
    projectedAtMs: context.nowMs,
    statusSemantics: objectFreeze({
      state: facts.status || NODE_LIVENESS_SEMANTIC_STATE.UNKNOWN,
      active: facts.statusActive,
    }),
    connectionSemantics: objectFreeze({
      state: connectionState,
      rowState: facts.rowConnectionState,
      routerState: facts.routerConnectionState,
      connected: facts.transportConnected,
    }),
    clusterMembershipSemantics: objectFreeze({
      state: clusterMembershipState,
      healthy:
        clusterMembershipState === NODE_LIVENESS_SEMANTIC_STATE.HEALTHY,
    }),
    leaseSemantics: facts.lease,
    heartbeatFreshness: objectFreeze({
      lastHeartbeatMs: facts.lastHeartbeatMs,
      clusterMembership: facts.clusterHeartbeat.state,
      clusterMembershipDeadlineAtMs: facts.clusterHeartbeat.deadlineAtMs,
      derivationGrace: facts.derivationHeartbeat.state,
      derivationGraceDeadlineAtMs: facts.derivationHeartbeat.deadlineAtMs,
    }),
    repairFreshness: objectFreeze({
      state: facts.repairHeartbeat.state,
      deadlineAtMs: facts.repairHeartbeat.deadlineAtMs,
    }),
    transportSemantics: objectFreeze({
      state: connectionState,
      graceState: facts.transportGrace.state,
      graceDeadlineAtMs: facts.transportGrace.deadlineAtMs,
    }),
    provisioningTrustSemantics: objectFreeze({
      graceState: facts.provisioningTrustGrace.state,
      graceDeadlineAtMs: facts.provisioningTrustGrace.deadlineAtMs,
    }),
    localReporterSemantics: facts.localReporter,
    readyNow: facts.readyNow,
    readyWhenWritten: facts.readyWhenWritten,
    derivationGraceActive:
      facts.lease.state === NODE_LIVENESS_SEMANTIC_STATE.VALID ||
      facts.derivationHeartbeat.state === NODE_LIVENESS_SEMANTIC_STATE.FRESH,
    nextSemanticChangeAtMs,
  });
}

function projectNodeLivenessSemantics(context = {}) {
  const normalized = normalizeProjectionContext(context);
  const facts = projectNodeSemanticFacts(normalized);
  const clusterMembershipState = projectClusterMembership({
    clusterHeartbeat: facts.clusterHeartbeat,
    hasLeaseField: hasOwnReadyLeaseField(normalized.nodeRow),
    lease: facts.lease,
    localNodeId: normalized.source.localNodeId,
    nodeId: normalized.nodeId,
    nodeRow: normalized.nodeRow,
    readyNow: facts.readyNow,
    routerTransportConnected: facts.routerTransportConnected,
    rowConnectionState: facts.rowConnectionState,
    status: facts.status,
    statusActive: facts.statusActive,
    transportConnected: facts.transportConnected,
  });
  const projection = buildNodeLivenessProjection(
    normalized,
    facts,
    clusterMembershipState,
  );
  return objectFreeze({
    projection,
    semanticSignature: buildSemanticSignature(projection),
  });
}

export {
  NODE_LIVENESS_SEMANTIC_STATE,
  NODE_LIVENESS_SEMANTIC_THRESHOLD_DEFAULT,
  normalizeThresholds,
  normalizeSemanticNowMs,
  projectNodeLivenessSemantics,
};
