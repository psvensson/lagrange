import {CONTROL_PLANE_READINESS_DIMENSION} from './control-plane-readiness-constants.js';

const NODE_TRUST_STATE = Object.freeze({
  SERVE: 'serve',
  REPAIR_ONLY: 'repair_only',
  BLOCKED: 'blocked',
  UNKNOWN: 'unknown',
});

const NODE_TRUST_EVIDENCE_STATE = Object.freeze({
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  EXPIRED: 'expired',
  FRESH: 'fresh',
  GRACE: 'grace',
  KNOWN: 'known',
  MEMBER: 'member',
  REMOVED: 'removed',
  UNKNOWN: 'unknown',
  UNPUBLISHED: 'unpublished',
});

const NODE_TRUST_PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const NODE_TRUST_ACTIVE_STATUS = 'active';
const NODE_TRUST_SEMANTIC_OWNER = 'ControlPlaneReadinessService';
const NODE_TRUST_REASON = Object.freeze({
  CACHE_WATERMARK_UNKNOWN: 'cache_watermark_unknown',
  PROCESS_NOT_ALIVE: 'process_not_alive',
  READINESS_NOT_REPAIR_ELIGIBLE: 'readiness_not_repair_eligible',
  READINESS_REVISION_UNKNOWN: 'readiness_revision_unknown',
});

function normalizeTimestampMs(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (Number.isFinite(Number(value))) {
    return Number(value);
  }
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeFiniteNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeReasonCodes(readiness, additions = []) {
  return Object.freeze([
    ...new Set([
      ...(Array.isArray(readiness?.reasons) ? readiness.reasons : [])
        .map((reason) => String(reason?.code || reason || '')),
      ...additions,
    ].filter(Boolean)),
  ]);
}

function firstPresentValue(...values) {
  const value = values.find(
    (candidate) => candidate !== null && candidate !== undefined,
  );
  return value === undefined ? null : value;
}

function resolveMembershipState(publication, nodeId) {
  if (!publication) {
    return NODE_TRUST_EVIDENCE_STATE.UNKNOWN;
  }
  if (
    String(publication.status || '').toUpperCase() !==
      NODE_TRUST_PUBLICATION_STATUS_PUBLISHED
  ) {
    return NODE_TRUST_EVIDENCE_STATE.UNPUBLISHED;
  }
  if (
    publication.publishedActiveNodeIdsPresent !== true &&
    !Array.isArray(publication.publishedActiveNodeIds)
  ) {
    return NODE_TRUST_EVIDENCE_STATE.UNKNOWN;
  }
  return (publication.publishedActiveNodeIds || []).includes(nodeId) ?
    NODE_TRUST_EVIDENCE_STATE.MEMBER :
    NODE_TRUST_EVIDENCE_STATE.REMOVED;
}

function buildMembershipEvidence(readiness) {
  const publication = readiness?.membershipPublication || null;
  const publicationEpoch = normalizeFiniteNumber(
    publication?.publicationEpoch,
  );
  const sourceSnapshotVersion = normalizeFiniteNumber(
    publication?.sourceSnapshotVersion,
  );
  const revisionKnown =
    Number.isFinite(publicationEpoch) &&
    Number.isFinite(sourceSnapshotVersion);
  return Object.freeze({
    state: revisionKnown ?
      resolveMembershipState(publication, readiness?.nodeId) :
      NODE_TRUST_EVIDENCE_STATE.UNKNOWN,
    publicationEpoch: Number.isFinite(publicationEpoch) ?
      publicationEpoch :
      null,
    sourceSnapshotVersion: Number.isFinite(sourceSnapshotVersion) ?
      sourceSnapshotVersion :
      null,
  });
}

function hasKnownCacheWatermark(version, appliedAtMs) {
  return [version !== null, version !== undefined].every(Boolean) ||
    appliedAtMs !== null;
}

function buildCacheWatermark(value = null) {
  const source = value && typeof value === 'object' ? value : {};
  const nodesAppliedAtMs = normalizeTimestampMs(source.nodesAppliedAtMs);
  const servicesAppliedAtMs = normalizeTimestampMs(source.servicesAppliedAtMs);
  const nodesKnown = hasKnownCacheWatermark(
    source.nodesVersion,
    nodesAppliedAtMs,
  );
  const servicesKnown = hasKnownCacheWatermark(
    source.servicesVersion,
    servicesAppliedAtMs,
  );
  return Object.freeze({
    state: source.state === NODE_TRUST_EVIDENCE_STATE.KNOWN &&
      nodesKnown && servicesKnown ?
      NODE_TRUST_EVIDENCE_STATE.KNOWN :
      NODE_TRUST_EVIDENCE_STATE.UNKNOWN,
    nodesVersion: source.nodesVersion ?? null,
    servicesVersion: source.servicesVersion ?? null,
    nodesAppliedAtMs,
    servicesAppliedAtMs,
  });
}

function buildTransportEvidence(readiness, options, capturedAtMs) {
  const explicit = options.transport && typeof options.transport === 'object' ?
    options.transport :
    null;
  const routerState = String(
    explicit?.state ?? readiness?.nodeEvidence?.routerConnectionState ?? '',
  ).toLowerCase();
  const state = Object.freeze({
    connected: NODE_TRUST_EVIDENCE_STATE.CONNECTED,
    ready: NODE_TRUST_EVIDENCE_STATE.CONNECTED,
    disconnected: NODE_TRUST_EVIDENCE_STATE.DISCONNECTED,
  })[routerState] || NODE_TRUST_EVIDENCE_STATE.UNKNOWN;
  const observedAtMs = normalizeTimestampMs(
    explicit?.observedAtMs ??
    (state === NODE_TRUST_EVIDENCE_STATE.UNKNOWN ? null : capturedAtMs),
  );
  return Object.freeze({state, observedAtMs});
}

function buildFreshnessEvidence(readiness, options, capturedAtMs) {
  const nodeEvidence = readiness?.nodeEvidence || {};
  const heartbeatAgeMs = normalizeFiniteNumber(nodeEvidence.heartbeatAgeMs);
  const staleHeartbeatLimitMs = normalizeFiniteNumber(
    firstPresentValue(
      nodeEvidence.staleHeartbeatLimitMs,
      options.graceLimitMs,
    ),
  );
  const graceStartedAtMs = normalizeTimestampMs(options.graceStartedAtMs);
  const graceUntilMs = [
    Number.isFinite(graceStartedAtMs),
    Number.isFinite(staleHeartbeatLimitMs),
  ].every(Boolean) ?
    graceStartedAtMs + staleHeartbeatLimitMs :
    null;
  const heartbeatKnown = [
    Number.isFinite(heartbeatAgeMs),
    Number.isFinite(staleHeartbeatLimitMs),
  ].every(Boolean);
  const heartbeatFresh = [
    heartbeatKnown,
    heartbeatAgeMs <= staleHeartbeatLimitMs,
  ].every(Boolean);
  const graceEligible = options.selfRuntimeGrace === true || [
    heartbeatKnown,
    !heartbeatFresh,
  ].every(Boolean);
  const graceActive = [
    graceEligible,
    Number.isFinite(capturedAtMs),
    Number.isFinite(graceUntilMs),
    capturedAtMs < graceUntilMs,
  ].every(Boolean);
  let state = NODE_TRUST_EVIDENCE_STATE.EXPIRED;
  if (!heartbeatKnown && options.selfRuntimeGrace !== true) {
    state = NODE_TRUST_EVIDENCE_STATE.UNKNOWN;
  } else if (heartbeatFresh) {
    state = NODE_TRUST_EVIDENCE_STATE.FRESH;
  } else if (graceActive) {
    state = NODE_TRUST_EVIDENCE_STATE.GRACE;
  }
  return Object.freeze({
    state,
    heartbeatAgeMs: Number.isFinite(heartbeatAgeMs) ? heartbeatAgeMs : null,
    staleHeartbeatLimitMs: Number.isFinite(staleHeartbeatLimitMs) ?
      staleHeartbeatLimitMs :
      null,
    graceUntilMs,
  });
}

function buildReadinessRevision(readiness) {
  const observedAtMs = normalizeTimestampMs(
    readiness?.observedAtMs ?? readiness?.observedAt,
  );
  const projectionRevision =
    readiness?.projectionReadinessContract?.evidence?.projectionRevision || {};
  return Object.freeze({
    state: Number.isFinite(observedAtMs) ?
      NODE_TRUST_EVIDENCE_STATE.KNOWN :
      NODE_TRUST_EVIDENCE_STATE.UNKNOWN,
    observedAtMs,
    localProjectionRevision: firstPresentValue(
      projectionRevision.localRevision,
      projectionRevision.observedRevision,
    ),
    requiredProjectionRevision: firstPresentValue(
      projectionRevision.requiredRevision,
      projectionRevision.desiredRevision,
    ),
  });
}

function hasUnknownTrustEvidence(context) {
  return [
    context.membership.state,
    context.cacheWatermark.state,
    context.transport.state,
    context.freshness.state,
    context.readinessRevision.state,
  ].includes(NODE_TRUST_EVIDENCE_STATE.UNKNOWN);
}

function isTrustExplicitlyBlocked(context) {
  return (
    context.membership.state !== NODE_TRUST_EVIDENCE_STATE.MEMBER ||
    context.transport.state !== NODE_TRUST_EVIDENCE_STATE.CONNECTED ||
    (context.status !== NODE_TRUST_ACTIVE_STATUS &&
      !context.selfRuntimeGrace) ||
    !context.processAlive ||
    !context.canonicalRepair
  );
}

const TRUST_DECISION_RULES = Object.freeze([
  Object.freeze({
    matches: hasUnknownTrustEvidence,
    decision: Object.freeze({
      state: NODE_TRUST_STATE.UNKNOWN,
      repair: false,
      serve: false,
    }),
  }),
  Object.freeze({
    matches: isTrustExplicitlyBlocked,
    decision: Object.freeze({
      state: NODE_TRUST_STATE.BLOCKED,
      repair: false,
      serve: false,
    }),
  }),
  Object.freeze({
    matches: (context) =>
      context.freshness.state === NODE_TRUST_EVIDENCE_STATE.FRESH &&
      context.canonicalServe,
    decision: Object.freeze({
      state: NODE_TRUST_STATE.SERVE,
      repair: true,
      serve: true,
    }),
  }),
  Object.freeze({
    matches: (context) => [
      NODE_TRUST_EVIDENCE_STATE.FRESH,
      NODE_TRUST_EVIDENCE_STATE.GRACE,
    ].includes(context.freshness.state),
    decision: Object.freeze({
      state: NODE_TRUST_STATE.REPAIR_ONLY,
      repair: true,
      serve: false,
    }),
  }),
  Object.freeze({
    matches: () => true,
    decision: Object.freeze({
      state: NODE_TRUST_STATE.BLOCKED,
      repair: false,
      serve: false,
    }),
  }),
]);

function resolveTrustDecision(context) {
  return TRUST_DECISION_RULES.find((rule) => rule.matches(context)).decision;
}

function buildTrustReasonCodes(readiness, context) {
  const reasonCodeSet = new Set();
  if (context.membership.state !== NODE_TRUST_EVIDENCE_STATE.MEMBER) {
    reasonCodeSet.add(`membership_${context.membership.state}`);
  }
  if (context.cacheWatermark.state === NODE_TRUST_EVIDENCE_STATE.UNKNOWN) {
    reasonCodeSet.add(NODE_TRUST_REASON.CACHE_WATERMARK_UNKNOWN);
  }
  if (context.transport.state !== NODE_TRUST_EVIDENCE_STATE.CONNECTED) {
    reasonCodeSet.add(`transport_${context.transport.state}`);
  }
  if (context.freshness.state !== NODE_TRUST_EVIDENCE_STATE.FRESH) {
    reasonCodeSet.add(`freshness_${context.freshness.state}`);
  }
  if (context.readinessRevision.state === NODE_TRUST_EVIDENCE_STATE.UNKNOWN) {
    reasonCodeSet.add(NODE_TRUST_REASON.READINESS_REVISION_UNKNOWN);
  }
  if (!context.processAlive) {
    reasonCodeSet.add(NODE_TRUST_REASON.PROCESS_NOT_ALIVE);
  }
  if (!context.canonicalRepair) {
    reasonCodeSet.add(NODE_TRUST_REASON.READINESS_NOT_REPAIR_ELIGIBLE);
  }
  return normalizeReasonCodes(readiness, reasonCodeSet);
}

function buildTrustObserverEvidence(options) {
  const activeServiceCount = Number(options.activeServiceCount);
  return Object.freeze({
    activeNodeRow: options.activeNodeRow === true,
    activeServiceCount:
      Number.isInteger(activeServiceCount) && activeServiceCount > 0 ?
        activeServiceCount :
        0,
    selfRuntimeGrace: options.selfRuntimeGrace === true,
  });
}

function buildNodeTrustState(readiness, options = {}) {
  const dimensions = readiness?.dimensions || {};
  const capturedAtMs = normalizeTimestampMs(
    firstPresentValue(
      options.capturedAtMs,
      readiness?.observedAtMs,
      readiness?.observedAt,
    ),
  );
  const membership = buildMembershipEvidence(readiness);
  const cacheWatermark = buildCacheWatermark(options.cacheWatermark);
  const transport = buildTransportEvidence(readiness, options, capturedAtMs);
  const freshness = buildFreshnessEvidence(readiness, options, capturedAtMs);
  const readinessRevision = buildReadinessRevision(readiness);
  const processAlive =
    dimensions[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] === true;
  const canonicalRepair =
    dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] === true;
  const canonicalServe =
    dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] === true;
  const status = String(readiness?.nodeEvidence?.status || '').toLowerCase();
  const selfRuntimeGrace = options.selfRuntimeGrace === true;
  const decisionContext = {
    membership,
    cacheWatermark,
    transport,
    freshness,
    readinessRevision,
    status,
    selfRuntimeGrace,
    processAlive,
    canonicalRepair,
    canonicalServe,
  };
  const decision = resolveTrustDecision(decisionContext);

  return Object.freeze({
    semanticOwner: NODE_TRUST_SEMANTIC_OWNER,
    nodeId: readiness?.nodeId || null,
    observerNodeId: options.observerNodeId || null,
    capturedAtMs,
    membership,
    cacheWatermark,
    transport,
    freshness,
    readinessRevision,
    observerEvidence: buildTrustObserverEvidence(options),
    state: decision.state,
    repairEligible: decision.repair,
    serveEligible: decision.serve,
    reasonCodes: buildTrustReasonCodes(readiness, decisionContext),
  });
}

export {NODE_TRUST_STATE, buildNodeTrustState};
