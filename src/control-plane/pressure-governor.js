import {METRICS_LOG_TAG} from '../constants/index.js';
const PRESSURE_GOVERNOR_LITERAL = Object.freeze({
  DEFAULT: 'default',
  NONE: 'none',
  TRANSPORT_OUTBOUND: 'transport:outbound',
  CONTROL_PLANE: 'control-plane:',
  CONTROL_PLANE_BOOTSTRAP: 'control-plane:bootstrap:',
  CONTROL_PLANE_READ: 'control-plane:read',
  CONTROL_PLANE_WRITE: 'control-plane:write',
  QUERY_PLANE: 'query-plane:',
  QUERY: 'query:',
  SNAPSHOT_TRANSFER: 'snapshot-transfer:',
  CONTROL_PLANE_PRESSURE_DEGRADED: 'control_plane_pressure_degraded',
  MESSAGEROUTER: 'messageRouter',
  LOGGER: 'logger',
});
const PRESSURE_WORK_CLASS = Object.freeze({
  CRITICAL: 'critical',
  READINESS: 'readiness',
  INTERACTIVE: 'interactive',
  BACKGROUND: 'background',
});
const PRESSURE_READINESS_WORK_CLASS_ALIASES = Object.freeze([
  'control-plane-readiness',
  'control-plane-planning',
]);
const PRESSURE_READINESS_WORK_CLASSES = Object.freeze(
  new Set([
    PRESSURE_WORK_CLASS.READINESS,
    ...PRESSURE_READINESS_WORK_CLASS_ALIASES,
  ]),
);
const PRESSURE_GOVERNOR_ACTION = Object.freeze({
  ALLOW: 'allow',
  DEFER: 'defer',
  REJECT: 'reject',
});
const PRESSURE_GOVERNOR_REASON = Object.freeze({
  NONE: 'none',
  CRITICAL_BYPASS: 'critical_bypass',
  CRITICAL_RESERVE_EXHAUSTED: 'critical_reserve_exhausted',
  READINESS_BYPASS: 'readiness_bypass',
  READINESS_RESERVE_EXHAUSTED: 'readiness_reserve_exhausted',
  TRANSPORT_BACKPRESSURE: 'transport_backpressure',
});
const PRESSURE_GOVERNOR_ERROR_CODE = Object.freeze({
  CONTROL_PLANE_PRESSURE_DEGRADED: 'CONTROL_PLANE_PRESSURE_DEGRADED',
});
const PRESSURE_GOVERNOR_DEFAULT = Object.freeze({RETRY_AFTER_MS: 250});
// Pacing hints are derived from the measured pressure summary, never from the
// request: a fixed hint was falsified live (cold-formation joins rely on tight
// retry against flickering backpressure; 250ms pacing serialized them ~9x).
// Shallow saturation yields a near-immediate retry; the hint grows with
// overshoot depth and is capped at the legacy default.
const PRESSURE_DEFER_PACING_BASE_MS = Object.freeze({
  [PRESSURE_WORK_CLASS.CRITICAL]: 10,
  [PRESSURE_WORK_CLASS.READINESS]: 10,
  [PRESSURE_WORK_CLASS.INTERACTIVE]: 15,
  [PRESSURE_WORK_CLASS.BACKGROUND]: 100,
});
const PRESSURE_DEFER_PACING_MAX_MS = PRESSURE_GOVERNOR_DEFAULT.RETRY_AFTER_MS;
const PRESSURE_DEFER_PACING_OVERSHOOT_GAIN = 3;
// Bounded per-work-class admission queues: waiters admitted on capacity in
// priority order instead of sleeping a fixed hint (the "real queueing" shape).
const PRESSURE_ADMISSION_QUEUE_LIMIT = Object.freeze({
  [PRESSURE_WORK_CLASS.CRITICAL]: 64,
  [PRESSURE_WORK_CLASS.READINESS]: 64,
  [PRESSURE_WORK_CLASS.INTERACTIVE]: 128,
  [PRESSURE_WORK_CLASS.BACKGROUND]: 256,
});
const PRESSURE_ADMISSION_MAX_WAIT_MS = Object.freeze({
  [PRESSURE_WORK_CLASS.CRITICAL]: 500,
  [PRESSURE_WORK_CLASS.READINESS]: 500,
  [PRESSURE_WORK_CLASS.INTERACTIVE]: 1000,
  [PRESSURE_WORK_CLASS.BACKGROUND]: 2000,
});
const PRESSURE_ADMISSION_POLL_INTERVAL_MS = 10;
const PRESSURE_WORK_CLASS_PRIORITY_RANK = Object.freeze({
  [PRESSURE_WORK_CLASS.CRITICAL]: 0,
  [PRESSURE_WORK_CLASS.READINESS]: 1,
  [PRESSURE_WORK_CLASS.INTERACTIVE]: 2,
  [PRESSURE_WORK_CLASS.BACKGROUND]: 3,
});
const SHARED_GOVERNORS = new Map();
const PRESSURE_CAPACITY_PARTITION = Object.freeze({
  SHARED: 'shared',
  BACKGROUND: 'background',
  CONTROL_PLANE: 'control-plane',
  QUERY_PLANE: 'query-plane',
  // Bulk snapshot-transfer lane (S3): fed by the router's additive
  // bulkChannel stats section, never by the outbound queues (bulk bytes do
  // not traverse them). Sensor advisory; the sender-side token bucket is the
  // enforcement point.
  BULK: 'bulk',
});
const TRANSPORT_RESOURCE_PREFIXES = Object.freeze([
  'transport:',
  'control-plane:',
  'query-plane:',
  'query:',
  'join:',
  'cdc:',
  'rebalancer:',
  'bootstrap:',
  // NOT bare 'snapshot:' — 'control-plane:snapshot:repair' already occupies
  // that vocabulary.
  'snapshot-transfer:',
]);
function normalizeWorkClass(workClass) {
  if (workClass === PRESSURE_WORK_CLASS.CRITICAL) {
    return PRESSURE_WORK_CLASS.CRITICAL;
  }
  if (PRESSURE_READINESS_WORK_CLASSES.has(workClass)) {
    return PRESSURE_WORK_CLASS.READINESS;
  }
  if (workClass === PRESSURE_WORK_CLASS.BACKGROUND) {
    return PRESSURE_WORK_CLASS.BACKGROUND;
  }
  return PRESSURE_WORK_CLASS.INTERACTIVE;
}
function normalizeRetryAfterMs(value) {
  return Number.isFinite(value) && value > 0 ?
    Math.floor(value) :
    PRESSURE_GOVERNOR_DEFAULT.RETRY_AFTER_MS;
}
function normalizeNodeId(nodeId) {
  if (typeof nodeId !== 'string') {
    return PRESSURE_GOVERNOR_LITERAL.DEFAULT;
  }
  const normalized = nodeId.trim();
  return normalized.length > 0 ? normalized : PRESSURE_GOVERNOR_LITERAL.DEFAULT;
}
function normalizeResourceKeys(resourceKeys) {
  if (!Array.isArray(resourceKeys)) {
    return [];
  }
  return [
    ...new Set(
      resourceKeys.filter((resourceKey) => {
        return typeof resourceKey === 'string' && resourceKey.length > 0;
      }),
    ),
  ];
}
function buildNoPressureSummary(sensor = PRESSURE_GOVERNOR_LITERAL.NONE) {
  return Object.freeze({
    sensor,
    capacityPartition: PRESSURE_CAPACITY_PARTITION.SHARED,
    backpressured: false,
    saturatedNodeCount: 0,
    totalPending: 0,
    totalPendingCritical: 0,
    totalPendingCriticalReserveEligible: 0,
    totalPendingBackground: 0,
    criticalReserveExhausted: false,
    readinessReserveExhausted: false,
    maxPendingUtilization: 0,
  });
}
function buildTransportPressureSummary(
  summary = {},
  capacityPartition = PRESSURE_CAPACITY_PARTITION.SHARED,
) {
  return Object.freeze({
    sensor: PRESSURE_GOVERNOR_LITERAL.TRANSPORT_OUTBOUND,
    capacityPartition,
    backpressured: summary?.backpressured === true,
    saturatedNodeCount: Number.isFinite(summary?.saturatedNodeCount) ?
      summary.saturatedNodeCount :
      0,
    totalPending: Number.isFinite(summary?.totalPending) ? summary.totalPending : 0,
    totalPendingCritical: Number.isFinite(summary?.totalPendingCritical) ?
      summary.totalPendingCritical :
      0,
    totalPendingCriticalReserveEligible:
      Number.isFinite(summary?.totalPendingCriticalReserveEligible) ?
        summary.totalPendingCriticalReserveEligible :
        Number.isFinite(summary?.totalPendingCritical) ?
          summary.totalPendingCritical :
          0,
    totalPendingBackground: Number.isFinite(summary?.totalPendingBackground) ?
      summary.totalPendingBackground :
      0,
    criticalReserveExhausted: summary?.criticalReserveExhausted === true,
    readinessReserveExhausted: summary?.readinessReserveExhausted === true,
    maxPendingUtilization: Number.isFinite(summary?.maxPendingUtilization) ?
      summary.maxPendingUtilization :
      0,
  });
}
function resolveCapacityPartition(
  resourceKeys = [],
  workClass = PRESSURE_WORK_CLASS.INTERACTIVE,
) {
  if (!Array.isArray(resourceKeys)) {
    return PRESSURE_CAPACITY_PARTITION.SHARED;
  }
  const hasQueryPlaneResource =
    resourceKeys.some((resourceKey) => {
      return (
        typeof resourceKey === 'string' &&
        (resourceKey.startsWith(PRESSURE_GOVERNOR_LITERAL.QUERY_PLANE) ||
          resourceKey.startsWith(PRESSURE_GOVERNOR_LITERAL.QUERY))
      );
    });
  const hasControlPlaneResource =
    resourceKeys.some((resourceKey) => {
      return (
        typeof resourceKey === 'string' &&
        resourceKey.startsWith(PRESSURE_GOVERNOR_LITERAL.CONTROL_PLANE)
      );
    });
  const hasControlPlaneIngressResource =
    resourceKeys.some((resourceKey) => {
      return (
        resourceKey === PRESSURE_GOVERNOR_LITERAL.CONTROL_PLANE_READ ||
        resourceKey === PRESSURE_GOVERNOR_LITERAL.CONTROL_PLANE_WRITE
      );
    });
  const hasBulkTransferResource =
    resourceKeys.some((resourceKey) => {
      return (
        typeof resourceKey === 'string' &&
        resourceKey.startsWith(PRESSURE_GOVERNOR_LITERAL.SNAPSHOT_TRANSFER)
      );
    });
  const pressurePartitionEvidence = Object.freeze({
    hasQueryPlaneResource,
    hasControlPlaneIngressResource,
    hasBulkTransferResource,
    isBackgroundWork: workClass === PRESSURE_WORK_CLASS.BACKGROUND,
    hasControlPlaneResource,
  });
  if (pressurePartitionEvidence.hasQueryPlaneResource) {
    return PRESSURE_CAPACITY_PARTITION.QUERY_PLANE;
  }
  if (pressurePartitionEvidence.hasControlPlaneIngressResource) {
    return PRESSURE_CAPACITY_PARTITION.CONTROL_PLANE;
  }
  if (pressurePartitionEvidence.hasBulkTransferResource) {
    return PRESSURE_CAPACITY_PARTITION.BULK;
  }
  if (pressurePartitionEvidence.isBackgroundWork) {
    return PRESSURE_CAPACITY_PARTITION.BACKGROUND;
  }
  if (pressurePartitionEvidence.hasControlPlaneResource) {
    return PRESSURE_CAPACITY_PARTITION.CONTROL_PLANE;
  }
  return PRESSURE_CAPACITY_PARTITION.SHARED;
}
function normalizeQueueStat(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
function hasBootstrapControlPlaneResource(resourceKeys = []) {
  return normalizeResourceKeys(resourceKeys).some((resourceKey) => {
    return resourceKey.startsWith(
      PRESSURE_GOVERNOR_LITERAL.CONTROL_PLANE_BOOTSTRAP,
    );
  });
}
function isCriticalReserveExhausted(queue = {}, capacityPartition) {
  if (capacityPartition !== PRESSURE_CAPACITY_PARTITION.CONTROL_PLANE) {
    return false;
  }
  const pendingCritical = Number.isFinite(queue.pendingCriticalReserveEligible) ?
    normalizeQueueStat(queue.pendingCriticalReserveEligible) :
    normalizeQueueStat(queue.pendingCritical);
  const criticalReserve = normalizeQueueStat(queue.criticalReserve);
  return criticalReserve > 0 && pendingCritical >= criticalReserve;
}
function isReadinessReserveExhausted(queue = {}, capacityPartition) {
  if (capacityPartition !== PRESSURE_CAPACITY_PARTITION.CONTROL_PLANE) {
    return false;
  }
  const pendingReadiness = normalizeQueueStat(queue.pendingReadiness);
  const readinessReserve = normalizeQueueStat(queue.readinessReserve);
  return readinessReserve > 0 && pendingReadiness >= readinessReserve;
}
function isPartitionBackpressured(queue = {}, capacityPartition) {
  const pending = normalizeQueueStat(queue.pending);
  const maxPending = normalizeQueueStat(queue.maxPending);
  const pendingBackground = normalizeQueueStat(queue.pendingBackground);
  const backgroundPendingLimit = normalizeQueueStat(queue.backgroundPendingLimit);
  if (maxPending > 0 && pending >= maxPending) {
    return true;
  }
  if (capacityPartition === PRESSURE_CAPACITY_PARTITION.QUERY_PLANE) {
    return (
      pending > 0 &&
      backgroundPendingLimit > 0 &&
      pendingBackground >= backgroundPendingLimit
    );
  }
  if (capacityPartition === PRESSURE_CAPACITY_PARTITION.BACKGROUND) {
    return (
      pending > 0 &&
      backgroundPendingLimit > 0 &&
      pendingBackground >= backgroundPendingLimit
    );
  }
  if (capacityPartition === PRESSURE_CAPACITY_PARTITION.CONTROL_PLANE) {
    return isCriticalReserveExhausted(queue, capacityPartition);
  }
  return false;
}
// The BULK partition summary reads the router's additive bulkChannel stats
// section (pending chunk requests, in-flight bytes, token depth) because bulk
// bytes never traverse the outbound queues — without this the sensor is
// blind to bulk load.
function buildBulkChannelPressureSummary(routerStats = {}) {
  const bulkChannel = routerStats?.bulkChannel || {};
  const pendingRequests = normalizeQueueStat(bulkChannel.pendingRequests);
  const maxPendingRequests = normalizeQueueStat(bulkChannel.maxPendingRequests);
  const saturatedPeerCount = normalizeQueueStat(bulkChannel.saturatedPeerCount);
  return buildTransportPressureSummary(
    {
      backpressured:
        saturatedPeerCount > 0 ||
        (maxPendingRequests > 0 && pendingRequests >= maxPendingRequests),
      saturatedNodeCount: saturatedPeerCount,
      totalPending: pendingRequests,
      totalPendingBackground: pendingRequests,
      maxPendingUtilization:
        maxPendingRequests > 0 ? pendingRequests / maxPendingRequests : 0,
    },
    PRESSURE_CAPACITY_PARTITION.BULK,
  );
}
function buildPartitionedTransportPressureSummary(routerStats = {}, capacityPartition) {
  if (capacityPartition === PRESSURE_CAPACITY_PARTITION.BULK) {
    return buildBulkChannelPressureSummary(routerStats);
  }
  const outboundQueues = routerStats?.outboundQueues || {};
  let saturatedNodeCount = 0;
  let totalPending = 0;
  let totalPendingCritical = 0;
  let totalPendingCriticalReserveEligible = 0;
  let totalPendingBackground = 0;
  let criticalReserveExhausted = false;
  let readinessReserveExhausted = false;
  let maxPendingUtilization = 0;
  for (const queue of Object.values(outboundQueues)) {
    const pending = normalizeQueueStat(queue.pending);
    const pendingCritical = normalizeQueueStat(queue.pendingCritical);
    const pendingCriticalReserveEligible =
      Number.isFinite(queue.pendingCriticalReserveEligible) ?
        normalizeQueueStat(queue.pendingCriticalReserveEligible) :
        pendingCritical;
    const pendingBackground = normalizeQueueStat(queue.pendingBackground);
    const maxPending = normalizeQueueStat(queue.maxPending);
    const queueCriticalReserveExhausted = isCriticalReserveExhausted(
      queue,
      capacityPartition,
    );
    if (isPartitionBackpressured(queue, capacityPartition)) {
      saturatedNodeCount += 1;
    }
    if (queueCriticalReserveExhausted) {
      criticalReserveExhausted = true;
    }
    if (isReadinessReserveExhausted(queue, capacityPartition)) {
      readinessReserveExhausted = true;
    }
    totalPending += pending;
    totalPendingCritical += pendingCritical;
    totalPendingCriticalReserveEligible += pendingCriticalReserveEligible;
    totalPendingBackground += pendingBackground;
    if (maxPending > 0) {
      maxPendingUtilization = Math.max(maxPendingUtilization, pending / maxPending);
    }
  }
  return buildTransportPressureSummary(
    {
      backpressured: saturatedNodeCount > 0,
      saturatedNodeCount,
      totalPending,
      totalPendingCritical,
      totalPendingCriticalReserveEligible,
      totalPendingBackground,
      criticalReserveExhausted,
      readinessReserveExhausted,
      maxPendingUtilization,
    },
    capacityPartition,
  );
}
function shouldUseTransportSensor(resourceKeys) {
  if (!Array.isArray(resourceKeys) || resourceKeys.length === 0) {
    return true;
  }
  return resourceKeys.some((resourceKey) => {
    return TRANSPORT_RESOURCE_PREFIXES.some((prefix) => {
      return resourceKey.startsWith(prefix);
    });
  });
}
function buildDecision(action, reason, summary, retryAfterMs = 0) {
  return Object.freeze({
    action,
    reason,
    retryAfterMs: normalizeRetryAfterMs(retryAfterMs),
    summary,
  });
}
// Admission evidence is derived only from the normalized work class and the
// measured pressure summary. Per-request allow flags are deliberately absent:
// policy attaches to the work class, never to the call site.
function normalizePressureAdmissionEvidence(request = {}, workClass, summary) {
  const criticalWork = workClass === PRESSURE_WORK_CLASS.CRITICAL;
  const readinessWork = workClass === PRESSURE_WORK_CLASS.READINESS;
  return Object.freeze({
    backpressured: summary?.backpressured === true,
    criticalWork,
    readinessWork,
    bootstrapCriticalWork:
      criticalWork && hasBootstrapControlPlaneResource(request.resourceKeys),
    criticalReserveExhausted: summary?.criticalReserveExhausted === true,
    readinessReserveExhausted: summary?.readinessReserveExhausted === true,
  });
}
const PRESSURE_ADMISSION_DECISION_TABLE = Object.freeze([
  Object.freeze({
    matches: (evidence) => evidence.backpressured !== true,
    action: PRESSURE_GOVERNOR_ACTION.ALLOW,
    reason: PRESSURE_GOVERNOR_REASON.NONE,
  }),
  Object.freeze({
    matches: (evidence) =>
      evidence.readinessWork === true &&
      evidence.readinessReserveExhausted !== true,
    action: PRESSURE_GOVERNOR_ACTION.ALLOW,
    reason: PRESSURE_GOVERNOR_REASON.READINESS_BYPASS,
  }),
  Object.freeze({
    matches: (evidence) => evidence.readinessWork === true,
    action: PRESSURE_GOVERNOR_ACTION.DEFER,
    reason: PRESSURE_GOVERNOR_REASON.READINESS_RESERVE_EXHAUSTED,
  }),
  Object.freeze({
    matches: (evidence) =>
      evidence.criticalWork === true &&
      evidence.bootstrapCriticalWork !== true &&
      evidence.criticalReserveExhausted === true,
    action: PRESSURE_GOVERNOR_ACTION.DEFER,
    reason: PRESSURE_GOVERNOR_REASON.CRITICAL_RESERVE_EXHAUSTED,
  }),
  Object.freeze({
    matches: (evidence) => evidence.criticalWork === true,
    action: PRESSURE_GOVERNOR_ACTION.ALLOW,
    reason: PRESSURE_GOVERNOR_REASON.CRITICAL_BYPASS,
  }),
  Object.freeze({
    matches: () => true,
    action: PRESSURE_GOVERNOR_ACTION.DEFER,
    reason: PRESSURE_GOVERNOR_REASON.TRANSPORT_BACKPRESSURE,
  }),
]);
function derivePacingHintMs(workClass, summary) {
  const base =
    PRESSURE_DEFER_PACING_BASE_MS[workClass] ??
    PRESSURE_DEFER_PACING_BASE_MS[PRESSURE_WORK_CLASS.INTERACTIVE];
  const utilization = Number.isFinite(summary?.maxPendingUtilization) ?
    summary.maxPendingUtilization :
    0;
  const overshoot = Math.max(0, utilization - 1);
  return Math.min(
    PRESSURE_DEFER_PACING_MAX_MS,
    Math.floor(base * (1 + PRESSURE_DEFER_PACING_OVERSHOOT_GAIN * overshoot)),
  );
}
function decidePressureAdmission(evidence) {
  return PRESSURE_ADMISSION_DECISION_TABLE.find((entry) =>
    entry.matches(evidence),
  );
}
function buildPressureAdmissionFailure(decision, overrides = {}) {
  const summary = decision?.summary || buildNoPressureSummary();
  return {
    success: false,
    error: overrides.error || PRESSURE_GOVERNOR_LITERAL.CONTROL_PLANE_PRESSURE_DEGRADED,
    errorCode: overrides.errorCode || PRESSURE_GOVERNOR_ERROR_CODE.CONTROL_PLANE_PRESSURE_DEGRADED,
    pressureAction: decision?.action || PRESSURE_GOVERNOR_ACTION.REJECT,
    pressureReason: decision?.reason || PRESSURE_GOVERNOR_REASON.TRANSPORT_BACKPRESSURE,
    retryAfterMs: Number.isFinite(decision?.retryAfterMs) ? decision.retryAfterMs : 0,
    pressureSummary: summary,
    rows: Array.isArray(overrides.rows) ? overrides.rows : [],
    tableName: overrides.tableName || null,
  };
}
const GLOBAL_LAST_EMIT_TIMES = new Map();
let globalLastEmitTime = 0;
const EMIT_PRESSURE_METRIC_LIMIT_MS = 1000;
const EMIT_PRESSURE_GLOBAL_LIMIT_MS = 500;

class PressureGovernor {
  constructor(options = {}) {
    this.nodeId = normalizeNodeId(options.nodeId);
    this.now = typeof options.now === 'function' ? options.now : () => Date.now();
    this.messageRouter = options.messageRouter || null;
    this.logger = options.logger || null;
    this.lastEmitTimes = new Map();
    this.admissionWaiters = [];
    this.admissionWaiterSeq = 0;
    this.admissionPollTimer = null;
  }
  static getShared(options = {}) {
    const nodeId = normalizeNodeId(options.nodeId);
    if (!SHARED_GOVERNORS.has(nodeId)) {
      SHARED_GOVERNORS.set(nodeId, new PressureGovernor(options));
      return SHARED_GOVERNORS.get(nodeId);
    }
    const shared = SHARED_GOVERNORS.get(nodeId);
    shared.configure(options);
    return shared;
  }
  static clearSharedForTests() {
    for (const governor of SHARED_GOVERNORS.values()) {
      governor.dispose();
    }
    SHARED_GOVERNORS.clear();
    GLOBAL_LAST_EMIT_TIMES.clear();
    globalLastEmitTime = 0;
  }
  configure(options = {}) {
    if (Object.prototype.hasOwnProperty.call(options, PRESSURE_GOVERNOR_LITERAL.MESSAGEROUTER)) {
      this.messageRouter = options.messageRouter || null;
    }
    if (typeof options.now === 'function') {
      this.now = options.now;
    }
    if (Object.prototype.hasOwnProperty.call(options, PRESSURE_GOVERNOR_LITERAL.LOGGER)) {
      this.logger = options.logger || null;
    }
  }

  emitPressureMetric(request = {}, decision = null) {
    if (typeof this.logger?.info !== 'function' || !decision) {
      return;
    }
    const summary = decision.summary || buildNoPressureSummary();
    if (decision.action === PRESSURE_GOVERNOR_ACTION.ALLOW && summary.backpressured !== true) {
      return;
    }
    const key = `${this.nodeId}:${decision.action}:${decision.reason}`;
    const now = this.now();
    let lastEmit = GLOBAL_LAST_EMIT_TIMES.get(key) || 0;
    let lastGlobalEmit = globalLastEmitTime || 0;
    if (now < lastEmit) {
      GLOBAL_LAST_EMIT_TIMES.delete(key);
      lastEmit = 0;
    }
    if (now < lastGlobalEmit) {
      globalLastEmitTime = 0;
      lastGlobalEmit = 0;
    }
    if (
      now - lastEmit < EMIT_PRESSURE_METRIC_LIMIT_MS ||
      now - lastGlobalEmit < EMIT_PRESSURE_GLOBAL_LIMIT_MS
    ) {
      return;
    }
    GLOBAL_LAST_EMIT_TIMES.set(key, now);
    globalLastEmitTime = now;
    if (!this.lastEmitTimes) {
      this.lastEmitTimes = new Map();
    }
    this.lastEmitTimes.set(key, now);
    this.lastGlobalEmitTime = now;
    try {
      this.logger.info(METRICS_LOG_TAG.PRESSURE_POLICY, {
        nodeId: this.nodeId,
        action: decision.action,
        reason: decision.reason,
        workClass: normalizeWorkClass(request.workClass),
        resourceKeys: normalizeResourceKeys(request.resourceKeys),
        retryAfterMs: normalizeRetryAfterMs(decision.retryAfterMs),
        sensor: summary.sensor || PRESSURE_GOVERNOR_LITERAL.NONE,
        capacityPartition: summary.capacityPartition || PRESSURE_CAPACITY_PARTITION.SHARED,
        backpressured: summary.backpressured === true,
        saturatedNodeCount: normalizeQueueStat(summary.saturatedNodeCount),
        totalPending: normalizeQueueStat(summary.totalPending),
        totalPendingCritical: normalizeQueueStat(summary.totalPendingCritical),
        totalPendingCriticalReserveEligible:
          normalizeQueueStat(summary.totalPendingCriticalReserveEligible),
        totalPendingBackground: normalizeQueueStat(summary.totalPendingBackground),
        criticalReserveExhausted: summary.criticalReserveExhausted === true,
        maxPendingUtilization: Number.isFinite(summary.maxPendingUtilization) ?
          summary.maxPendingUtilization :
          0,
      });
    } catch (_error) {
      // Metrics logging must not change admission behavior.
    }
  }

  getPressureSummary(
    resourceKeys = [],
    workClass = PRESSURE_WORK_CLASS.INTERACTIVE,
  ) {
    const normalizedKeys = normalizeResourceKeys(resourceKeys);
    const capacityPartition = resolveCapacityPartition(
      normalizedKeys,
      normalizeWorkClass(workClass),
    );
    if (!shouldUseTransportSensor(normalizedKeys)) {
      return buildNoPressureSummary();
    }
    if (typeof this.messageRouter?.getStats === 'function') {
      return buildPartitionedTransportPressureSummary(
        this.messageRouter.getStats(),
        capacityPartition,
      );
    }
    if (typeof this.messageRouter?.getOutboundPressureSummary !== 'function') {
      return buildTransportPressureSummary(
        buildNoPressureSummary(PRESSURE_GOVERNOR_LITERAL.TRANSPORT_OUTBOUND),
        capacityPartition,
      );
    }
    return buildTransportPressureSummary(
      this.messageRouter.getOutboundPressureSummary(),
      capacityPartition,
    );
  }

  isBackpressured(request = {}) {
    return this.getPressureSummary(
      request.resourceKeys,
      request.workClass,
    ).backpressured === true;
  }

  emitDecision(request, decision) {
    this.emitPressureMetric(request, decision);
    return decision;
  }

  evaluate(request = {}) {
    const workClass = normalizeWorkClass(request.workClass);
    const summary = this.getPressureSummary(request.resourceKeys, workClass);
    const evidence = normalizePressureAdmissionEvidence(
      request,
      workClass,
      summary,
    );
    const outcome = decidePressureAdmission(evidence);
    return this.emitDecision(
      request,
      buildDecision(
        outcome.action,
        outcome.reason,
        summary,
        outcome.action === PRESSURE_GOVERNOR_ACTION.ALLOW ?
          0 :
          derivePacingHintMs(workClass, summary),
      ),
    );
  }

  // Admit-on-capacity admission: a DEFER decision parks the caller in a
  // bounded, priority-ordered queue and resolves as soon as the measured
  // pressure clears instead of sleeping a pacing hint. Queue overflow and
  // deadline expiry fall back to the plain DEFER decision so callers keep
  // their own retry loops as the backstop.
  admit(request = {}) {
    const decision = this.evaluate(request);
    if (decision.action !== PRESSURE_GOVERNOR_ACTION.DEFER) {
      return Promise.resolve(decision);
    }
    return this.enqueueAdmissionWaiter(request, decision);
  }

  enqueueAdmissionWaiter(request, deferDecision) {
    const workClass = normalizeWorkClass(request.workClass);
    const queuedForClass = this.admissionWaiters.reduce(
      (count, waiter) => count + (waiter.workClass === workClass ? 1 : 0),
      0,
    );
    if (queuedForClass >= PRESSURE_ADMISSION_QUEUE_LIMIT[workClass]) {
      return Promise.resolve(deferDecision);
    }
    return new Promise((resolve) => {
      this.admissionWaiters.push({
        workClass,
        rank: PRESSURE_WORK_CLASS_PRIORITY_RANK[workClass],
        seq: this.admissionWaiterSeq++,
        request,
        deferDecision,
        deadlineAtMs: this.now() + PRESSURE_ADMISSION_MAX_WAIT_MS[workClass],
        resolve,
      });
      this.scheduleAdmissionPoll();
    });
  }

  scheduleAdmissionPoll() {
    if (this.admissionPollTimer || this.admissionWaiters.length === 0) {
      return;
    }
    // The timer intentionally keeps the process alive: it exists only while
    // waiters are parked, and every waiter resolves by its bounded deadline.
    // The re-arm is unconditional: a throwing pressure sensor must never
    // strand parked waiters or escape the timer callback as a crash.
    this.admissionPollTimer = setTimeout(() => {
      this.admissionPollTimer = null;
      try {
        this.drainAdmissionWaiters();
      } finally {
        this.scheduleAdmissionPoll();
      }
    }, PRESSURE_ADMISSION_POLL_INTERVAL_MS);
  }

  drainAdmissionWaiters() {
    if (this.admissionWaiters.length === 0) {
      return;
    }
    const nowMs = this.now();
    const ordered = [...this.admissionWaiters].sort(
      (a, b) => a.rank - b.rank || a.seq - b.seq,
    );
    const resolved = new Set();
    for (const waiter of ordered) {
      // A throwing sensor counts as "still deferred": the waiter keeps its
      // deadline guarantee (resolving with the enqueue-time decision) instead
      // of being stranded or crashing the poll loop.
      let decision = null;
      try {
        decision = this.evaluate(waiter.request);
      } catch (_error) {
        decision = null;
      }
      if (decision && decision.action !== PRESSURE_GOVERNOR_ACTION.DEFER) {
        waiter.resolve(decision);
        resolved.add(waiter);
      } else if (nowMs >= waiter.deadlineAtMs) {
        waiter.resolve(decision || waiter.deferDecision);
        resolved.add(waiter);
      }
    }
    if (resolved.size > 0) {
      this.admissionWaiters = this.admissionWaiters.filter(
        (waiter) => !resolved.has(waiter),
      );
    }
  }

  dispose() {
    if (this.admissionPollTimer) {
      clearTimeout(this.admissionPollTimer);
      this.admissionPollTimer = null;
    }
    const waiters = this.admissionWaiters;
    this.admissionWaiters = [];
    for (const waiter of waiters) {
      waiter.resolve(waiter.deferDecision);
    }
  }
}

export {
  buildPressureAdmissionFailure,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_GOVERNOR_DEFAULT,
  PRESSURE_GOVERNOR_ERROR_CODE,
  PRESSURE_GOVERNOR_REASON,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
};
