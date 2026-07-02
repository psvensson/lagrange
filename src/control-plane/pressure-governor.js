import {METRICS_LOG_TAG, NUM, TYPEOF} from '../constants/index.js';
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
  DEGRADE: 'degrade',
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
const SHARED_GOVERNORS = new Map();
const PRESSURE_CAPACITY_PARTITION = Object.freeze({
  SHARED: 'shared',
  BACKGROUND: 'background',
  CONTROL_PLANE: 'control-plane',
  QUERY_PLANE: 'query-plane',
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
  return Number.isFinite(value) && value > NUM.ZERO ?
    Math.floor(value) :
    PRESSURE_GOVERNOR_DEFAULT.RETRY_AFTER_MS;
}
function normalizeNodeId(nodeId) {
  if (typeof nodeId !== TYPEOF.STRING) {
    return PRESSURE_GOVERNOR_LITERAL.DEFAULT;
  }
  const normalized = nodeId.trim();
  return normalized.length > NUM.ZERO ? normalized : PRESSURE_GOVERNOR_LITERAL.DEFAULT;
}
function normalizeResourceKeys(resourceKeys) {
  if (!Array.isArray(resourceKeys)) {
    return [];
  }
  return [
    ...new Set(
      resourceKeys.filter((resourceKey) => {
        return typeof resourceKey === TYPEOF.STRING && resourceKey.length > NUM.ZERO;
      }),
    ),
  ];
}
function buildNoPressureSummary(sensor = PRESSURE_GOVERNOR_LITERAL.NONE) {
  return Object.freeze({
    sensor,
    capacityPartition: PRESSURE_CAPACITY_PARTITION.SHARED,
    backpressured: false,
    saturatedNodeCount: NUM.ZERO,
    totalPending: NUM.ZERO,
    totalPendingCritical: NUM.ZERO,
    totalPendingCriticalReserveEligible: NUM.ZERO,
    totalPendingBackground: NUM.ZERO,
    criticalReserveExhausted: false,
    readinessReserveExhausted: false,
    maxPendingUtilization: NUM.ZERO,
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
      NUM.ZERO,
    totalPending: Number.isFinite(summary?.totalPending) ? summary.totalPending : NUM.ZERO,
    totalPendingCritical: Number.isFinite(summary?.totalPendingCritical) ?
      summary.totalPendingCritical :
      NUM.ZERO,
    totalPendingCriticalReserveEligible:
      Number.isFinite(summary?.totalPendingCriticalReserveEligible) ?
        summary.totalPendingCriticalReserveEligible :
        Number.isFinite(summary?.totalPendingCritical) ?
          summary.totalPendingCritical :
          NUM.ZERO,
    totalPendingBackground: Number.isFinite(summary?.totalPendingBackground) ?
      summary.totalPendingBackground :
      NUM.ZERO,
    criticalReserveExhausted: summary?.criticalReserveExhausted === true,
    readinessReserveExhausted: summary?.readinessReserveExhausted === true,
    maxPendingUtilization: Number.isFinite(summary?.maxPendingUtilization) ?
      summary.maxPendingUtilization :
      NUM.ZERO,
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
        typeof resourceKey === TYPEOF.STRING &&
        (resourceKey.startsWith(PRESSURE_GOVERNOR_LITERAL.QUERY_PLANE) ||
          resourceKey.startsWith(PRESSURE_GOVERNOR_LITERAL.QUERY))
      );
    });
  const hasControlPlaneResource =
    resourceKeys.some((resourceKey) => {
      return (
        typeof resourceKey === TYPEOF.STRING &&
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
  const pressurePartitionEvidence = Object.freeze({
    hasQueryPlaneResource,
    hasControlPlaneIngressResource,
    isBackgroundWork: workClass === PRESSURE_WORK_CLASS.BACKGROUND,
    hasControlPlaneResource,
  });
  if (pressurePartitionEvidence.hasQueryPlaneResource) {
    return PRESSURE_CAPACITY_PARTITION.QUERY_PLANE;
  }
  if (pressurePartitionEvidence.hasControlPlaneIngressResource) {
    return PRESSURE_CAPACITY_PARTITION.CONTROL_PLANE;
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
  return Number.isFinite(value) && value > NUM.ZERO ? value : NUM.ZERO;
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
  return criticalReserve > NUM.ZERO && pendingCritical >= criticalReserve;
}
function isReadinessReserveExhausted(queue = {}, capacityPartition) {
  if (capacityPartition !== PRESSURE_CAPACITY_PARTITION.CONTROL_PLANE) {
    return false;
  }
  const pendingReadiness = normalizeQueueStat(queue.pendingReadiness);
  const readinessReserve = normalizeQueueStat(queue.readinessReserve);
  return readinessReserve > NUM.ZERO && pendingReadiness >= readinessReserve;
}
function isPartitionBackpressured(queue = {}, capacityPartition) {
  const pending = normalizeQueueStat(queue.pending);
  const maxPending = normalizeQueueStat(queue.maxPending);
  const pendingBackground = normalizeQueueStat(queue.pendingBackground);
  const backgroundPendingLimit = normalizeQueueStat(queue.backgroundPendingLimit);
  if (maxPending > NUM.ZERO && pending >= maxPending) {
    return true;
  }
  if (capacityPartition === PRESSURE_CAPACITY_PARTITION.QUERY_PLANE) {
    return (
      pending > NUM.ZERO &&
      backgroundPendingLimit > NUM.ZERO &&
      pendingBackground >= backgroundPendingLimit
    );
  }
  if (capacityPartition === PRESSURE_CAPACITY_PARTITION.BACKGROUND) {
    return (
      pending > NUM.ZERO &&
      backgroundPendingLimit > NUM.ZERO &&
      pendingBackground >= backgroundPendingLimit
    );
  }
  if (capacityPartition === PRESSURE_CAPACITY_PARTITION.CONTROL_PLANE) {
    return isCriticalReserveExhausted(queue, capacityPartition);
  }
  return false;
}
function buildPartitionedTransportPressureSummary(routerStats = {}, capacityPartition) {
  const outboundQueues = routerStats?.outboundQueues || {};
  let saturatedNodeCount = NUM.ZERO;
  let totalPending = NUM.ZERO;
  let totalPendingCritical = NUM.ZERO;
  let totalPendingCriticalReserveEligible = NUM.ZERO;
  let totalPendingBackground = NUM.ZERO;
  let criticalReserveExhausted = false;
  let readinessReserveExhausted = false;
  let maxPendingUtilization = NUM.ZERO;
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
      saturatedNodeCount += NUM.ONE;
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
    if (maxPending > NUM.ZERO) {
      maxPendingUtilization = Math.max(maxPendingUtilization, pending / maxPending);
    }
  }
  return buildTransportPressureSummary(
    {
      backpressured: saturatedNodeCount > NUM.ZERO,
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
  if (!Array.isArray(resourceKeys) || resourceKeys.length === NUM.ZERO) {
    return true;
  }
  return resourceKeys.some((resourceKey) => {
    return TRANSPORT_RESOURCE_PREFIXES.some((prefix) => {
      return resourceKey.startsWith(prefix);
    });
  });
}
function buildDecision(action, reason, summary, retryAfterMs = NUM.ZERO) {
  return Object.freeze({
    action,
    reason,
    retryAfterMs: normalizeRetryAfterMs(retryAfterMs),
    summary,
  });
}
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
    allowDegrade: request.allowDegrade !== false,
    allowDefer: request.allowDefer === true,
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
    matches: (evidence) =>
      evidence.readinessWork === true &&
      evidence.readinessReserveExhausted === true &&
      evidence.allowDefer === true,
    action: PRESSURE_GOVERNOR_ACTION.DEFER,
    reason: PRESSURE_GOVERNOR_REASON.READINESS_RESERVE_EXHAUSTED,
  }),
  Object.freeze({
    matches: (evidence) =>
      evidence.criticalWork === true &&
      evidence.bootstrapCriticalWork !== true &&
      evidence.criticalReserveExhausted === true &&
      evidence.allowDefer === true,
    action: PRESSURE_GOVERNOR_ACTION.DEFER,
    reason: PRESSURE_GOVERNOR_REASON.CRITICAL_RESERVE_EXHAUSTED,
  }),
  Object.freeze({
    matches: (evidence) =>
      evidence.criticalWork === true &&
      evidence.bootstrapCriticalWork !== true &&
      evidence.criticalReserveExhausted === true,
    action: PRESSURE_GOVERNOR_ACTION.REJECT,
    reason: PRESSURE_GOVERNOR_REASON.CRITICAL_RESERVE_EXHAUSTED,
  }),
  Object.freeze({
    matches: (evidence) => evidence.criticalWork === true,
    action: PRESSURE_GOVERNOR_ACTION.ALLOW,
    reason: PRESSURE_GOVERNOR_REASON.CRITICAL_BYPASS,
  }),
  Object.freeze({
    matches: (evidence) => evidence.allowDegrade === true,
    action: PRESSURE_GOVERNOR_ACTION.DEGRADE,
    reason: PRESSURE_GOVERNOR_REASON.TRANSPORT_BACKPRESSURE,
  }),
  Object.freeze({
    matches: (evidence) => evidence.allowDefer === true,
    action: PRESSURE_GOVERNOR_ACTION.DEFER,
    reason: PRESSURE_GOVERNOR_REASON.TRANSPORT_BACKPRESSURE,
  }),
  Object.freeze({
    matches: () => true,
    action: PRESSURE_GOVERNOR_ACTION.REJECT,
    reason: PRESSURE_GOVERNOR_REASON.TRANSPORT_BACKPRESSURE,
  }),
]);
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
    retryAfterMs: Number.isFinite(decision?.retryAfterMs) ? decision.retryAfterMs : NUM.ZERO,
    pressureSummary: summary,
    rows: Array.isArray(overrides.rows) ? overrides.rows : [],
    tableName: overrides.tableName || null,
  };
}
const GLOBAL_LAST_EMIT_TIMES = new Map();
let globalLastEmitTime = NUM.ZERO;
const EMIT_PRESSURE_METRIC_LIMIT_MS = 1000;
const EMIT_PRESSURE_GLOBAL_LIMIT_MS = 500;

class PressureGovernor {
  constructor(options = {}) {
    this.nodeId = normalizeNodeId(options.nodeId);
    this.now = typeof options.now === TYPEOF.FUNCTION ? options.now : () => Date.now();
    this.messageRouter = options.messageRouter || null;
    this.logger = options.logger || null;
    this.lastEmitTimes = new Map();
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
    SHARED_GOVERNORS.clear();
    GLOBAL_LAST_EMIT_TIMES.clear();
    globalLastEmitTime = NUM.ZERO;
  }
  configure(options = {}) {
    if (Object.prototype.hasOwnProperty.call(options, PRESSURE_GOVERNOR_LITERAL.MESSAGEROUTER)) {
      this.messageRouter = options.messageRouter || null;
    }
    if (typeof options.now === TYPEOF.FUNCTION) {
      this.now = options.now;
    }
    if (Object.prototype.hasOwnProperty.call(options, PRESSURE_GOVERNOR_LITERAL.LOGGER)) {
      this.logger = options.logger || null;
    }
  }

  emitPressureMetric(request = {}, decision = null) {
    if (typeof this.logger?.info !== TYPEOF.FUNCTION || !decision) {
      return;
    }
    const summary = decision.summary || buildNoPressureSummary();
    if (decision.action === PRESSURE_GOVERNOR_ACTION.ALLOW && summary.backpressured !== true) {
      return;
    }
    const key = `${this.nodeId}:${decision.action}:${decision.reason}`;
    const now = this.now();
    let lastEmit = GLOBAL_LAST_EMIT_TIMES.get(key) || NUM.ZERO;
    let lastGlobalEmit = globalLastEmitTime || NUM.ZERO;
    if (now < lastEmit) {
      GLOBAL_LAST_EMIT_TIMES.delete(key);
      lastEmit = NUM.ZERO;
    }
    if (now < lastGlobalEmit) {
      globalLastEmitTime = NUM.ZERO;
      lastGlobalEmit = NUM.ZERO;
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
          NUM.ZERO,
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
    if (typeof this.messageRouter?.getStats === TYPEOF.FUNCTION) {
      return buildPartitionedTransportPressureSummary(
        this.messageRouter.getStats(),
        capacityPartition,
      );
    }
    if (typeof this.messageRouter?.getOutboundPressureSummary !== TYPEOF.FUNCTION) {
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
          NUM.ZERO :
          request.retryAfterMs,
      ),
    );
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
