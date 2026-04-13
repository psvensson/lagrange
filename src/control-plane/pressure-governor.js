import { METRICS_LOG_TAG, NUM, TYPEOF } from '../constants/index.js';const PRESSURE_GOVERNOR_LITERAL = Object.freeze({ DEFAULT:































































  'default', NONE:














  'none', TRANSPORT_OUTBOUND:

















  'transport:outbound', CONTROL_PLANE:


























  'control-plane:', QUERY_PLANE:





  'query-plane:', QUERY:
  'query:', CONTROL_PLANE_PRESSURE_DEGRADED:
































































































  'control_plane_pressure_degraded', MESSAGEROUTER:










































  'messageRouter', LOGGER:





  'logger' });const PRESSURE_WORK_CLASS = Object.freeze({ CRITICAL: 'critical', INTERACTIVE: 'interactive', BACKGROUND: 'background' });const PRESSURE_GOVERNOR_ACTION = Object.freeze({ ALLOW: 'allow', DEGRADE: 'degrade', DEFER: 'defer', REJECT: 'reject' });const PRESSURE_GOVERNOR_REASON = Object.freeze({ NONE: 'none', CRITICAL_BYPASS: 'critical_bypass', TRANSPORT_BACKPRESSURE: 'transport_backpressure' });const PRESSURE_GOVERNOR_ERROR_CODE = Object.freeze({ CONTROL_PLANE_PRESSURE_DEGRADED: 'CONTROL_PLANE_PRESSURE_DEGRADED' });const PRESSURE_GOVERNOR_DEFAULT = Object.freeze({ RETRY_AFTER_MS: 250 });const SHARED_GOVERNORS = new Map();const PRESSURE_CAPACITY_PARTITION = Object.freeze({ SHARED: 'shared', CONTROL_PLANE: 'control-plane', QUERY_PLANE: 'query-plane' });const TRANSPORT_RESOURCE_PREFIXES = Object.freeze(['transport:', 'control-plane:', 'query-plane:', 'query:', 'join:', 'cdc:', 'rebalancer:', 'bootstrap:']);function normalizeWorkClass(workClass) {if (workClass === PRESSURE_WORK_CLASS.CRITICAL) {return PRESSURE_WORK_CLASS.CRITICAL;}if (workClass === PRESSURE_WORK_CLASS.BACKGROUND) {return PRESSURE_WORK_CLASS.BACKGROUND;}return PRESSURE_WORK_CLASS.INTERACTIVE;}function normalizeRetryAfterMs(value) {return Number.isFinite(value) && value > NUM.ZERO ? Math.floor(value) : PRESSURE_GOVERNOR_DEFAULT.RETRY_AFTER_MS;}function normalizeNodeId(nodeId) {if (typeof nodeId !== TYPEOF.STRING) {return PRESSURE_GOVERNOR_LITERAL.DEFAULT;}const normalized = nodeId.trim();return normalized.length > NUM.ZERO ? normalized : PRESSURE_GOVERNOR_LITERAL.DEFAULT;}function normalizeResourceKeys(resourceKeys) {if (!Array.isArray(resourceKeys)) {return [];}return [...new Set(resourceKeys.filter((resourceKey) => {return typeof resourceKey === TYPEOF.STRING && resourceKey.length > NUM.ZERO;}))];}function buildNoPressureSummary(sensor = PRESSURE_GOVERNOR_LITERAL.NONE) {return Object.freeze({ sensor, capacityPartition: PRESSURE_CAPACITY_PARTITION.SHARED, backpressured: false, saturatedNodeCount: NUM.ZERO, totalPending: NUM.ZERO, totalPendingCritical: NUM.ZERO, totalPendingBackground: NUM.ZERO, maxPendingUtilization: NUM.ZERO });}function buildTransportPressureSummary(summary = {}, capacityPartition = PRESSURE_CAPACITY_PARTITION.SHARED) {return Object.freeze({ sensor: PRESSURE_GOVERNOR_LITERAL.TRANSPORT_OUTBOUND, capacityPartition, backpressured: summary?.backpressured === true, saturatedNodeCount: Number.isFinite(summary?.saturatedNodeCount) ? summary.saturatedNodeCount : NUM.ZERO, totalPending: Number.isFinite(summary?.totalPending) ? summary.totalPending : NUM.ZERO, totalPendingCritical: Number.isFinite(summary?.totalPendingCritical) ? summary.totalPendingCritical : NUM.ZERO, totalPendingBackground: Number.isFinite(summary?.totalPendingBackground) ? summary.totalPendingBackground : NUM.ZERO, maxPendingUtilization: Number.isFinite(summary?.maxPendingUtilization) ? summary.maxPendingUtilization : NUM.ZERO });}function resolveCapacityPartition(resourceKeys = []) {if (!Array.isArray(resourceKeys)) {return PRESSURE_CAPACITY_PARTITION.SHARED;}if (resourceKeys.some((resourceKey) => {return typeof resourceKey === TYPEOF.STRING && resourceKey.startsWith(PRESSURE_GOVERNOR_LITERAL.CONTROL_PLANE);})) {return PRESSURE_CAPACITY_PARTITION.CONTROL_PLANE;}if (resourceKeys.some((resourceKey) => {return typeof resourceKey === TYPEOF.STRING && (resourceKey.startsWith(PRESSURE_GOVERNOR_LITERAL.QUERY_PLANE) || resourceKey.startsWith(PRESSURE_GOVERNOR_LITERAL.QUERY));})) {return PRESSURE_CAPACITY_PARTITION.QUERY_PLANE;}return PRESSURE_CAPACITY_PARTITION.SHARED;}function normalizeQueueStat(value) {return Number.isFinite(value) && value > NUM.ZERO ? value : NUM.ZERO;}function isPartitionBackpressured(queue = {}, capacityPartition) {const pending = normalizeQueueStat(queue.pending);const maxPending = normalizeQueueStat(queue.maxPending);const pendingCritical = normalizeQueueStat(queue.pendingCritical);const pendingBackground = normalizeQueueStat(queue.pendingBackground);const criticalReserve = normalizeQueueStat(queue.criticalReserve);const backgroundPendingLimit = normalizeQueueStat(queue.backgroundPendingLimit);if (maxPending > NUM.ZERO && pending >= maxPending) {return true;}if (capacityPartition === PRESSURE_CAPACITY_PARTITION.QUERY_PLANE) {return pending > NUM.ZERO && backgroundPendingLimit > NUM.ZERO && pendingBackground >= backgroundPendingLimit;}if (capacityPartition === PRESSURE_CAPACITY_PARTITION.CONTROL_PLANE) {return criticalReserve > NUM.ZERO && pendingCritical >= criticalReserve;}return false;}function buildPartitionedTransportPressureSummary(routerStats = {}, capacityPartition) {const outboundQueues = routerStats?.outboundQueues || {};let saturatedNodeCount = NUM.ZERO;let totalPending = NUM.ZERO;let totalPendingCritical = NUM.ZERO;let totalPendingBackground = NUM.ZERO;let maxPendingUtilization = NUM.ZERO;for (const queue of Object.values(outboundQueues)) {const pending = normalizeQueueStat(queue.pending);const pendingCritical = normalizeQueueStat(queue.pendingCritical);const pendingBackground = normalizeQueueStat(queue.pendingBackground);const maxPending = normalizeQueueStat(queue.maxPending);if (isPartitionBackpressured(queue, capacityPartition)) {saturatedNodeCount += NUM.ONE;}totalPending += pending;totalPendingCritical += pendingCritical;totalPendingBackground += pendingBackground;if (maxPending > NUM.ZERO) {maxPendingUtilization = Math.max(maxPendingUtilization, pending / maxPending);}}return buildTransportPressureSummary({ backpressured: saturatedNodeCount > NUM.ZERO, saturatedNodeCount, totalPending, totalPendingCritical, totalPendingBackground, maxPendingUtilization }, capacityPartition);}function shouldUseTransportSensor(resourceKeys) {if (!Array.isArray(resourceKeys) || resourceKeys.length === NUM.ZERO) {return true;}return resourceKeys.some((resourceKey) => {return TRANSPORT_RESOURCE_PREFIXES.some((prefix) => {return resourceKey.startsWith(prefix);});});}function buildDecision(action, reason, summary, retryAfterMs = NUM.ZERO) {return Object.freeze({ action, reason, retryAfterMs: normalizeRetryAfterMs(retryAfterMs), summary });}function buildPressureAdmissionFailure(decision, overrides = {}) {const summary = decision?.summary || buildNoPressureSummary();return { success: false, error: overrides.error || PRESSURE_GOVERNOR_LITERAL.CONTROL_PLANE_PRESSURE_DEGRADED, errorCode: overrides.errorCode || PRESSURE_GOVERNOR_ERROR_CODE.CONTROL_PLANE_PRESSURE_DEGRADED, pressureAction: decision?.action || PRESSURE_GOVERNOR_ACTION.REJECT, pressureReason: decision?.reason || PRESSURE_GOVERNOR_REASON.TRANSPORT_BACKPRESSURE, retryAfterMs: Number.isFinite(decision?.retryAfterMs) ? decision.retryAfterMs : NUM.ZERO, pressureSummary: summary, rows: Array.isArray(overrides.rows) ? overrides.rows : [], tableName: overrides.tableName || null };}class PressureGovernor {constructor(options = {}) {this.nodeId = normalizeNodeId(options.nodeId);this.now = typeof options.now === TYPEOF.FUNCTION ? options.now : () => Date.now();this.messageRouter = options.messageRouter || null;this.logger = options.logger || null;}static getShared(options = {}) {const nodeId = normalizeNodeId(options.nodeId);if (!SHARED_GOVERNORS.has(nodeId)) {SHARED_GOVERNORS.set(nodeId, new PressureGovernor(options));return SHARED_GOVERNORS.get(nodeId);}const shared = SHARED_GOVERNORS.get(nodeId);shared.configure(options);return shared;}static clearSharedForTests() {SHARED_GOVERNORS.clear();}configure(options = {}) {if (Object.prototype.hasOwnProperty.call(options, PRESSURE_GOVERNOR_LITERAL.MESSAGEROUTER)) {this.messageRouter = options.messageRouter || null;}if (typeof options.now === TYPEOF.FUNCTION) {this.now = options.now;}if (Object.prototype.hasOwnProperty.call(options, PRESSURE_GOVERNOR_LITERAL.LOGGER)) {
      this.logger = options.logger || null;
    }
  }

  emitPressureMetric(request = {}, decision = null) {
    if (typeof this.logger?.info !== TYPEOF.FUNCTION || !decision) {
      return;
    }
    const summary = decision.summary || buildNoPressureSummary();
    if (decision.action === PRESSURE_GOVERNOR_ACTION.ALLOW &&
    summary.backpressured !== true) {
      return;
    }
    try {
      this.logger.info(METRICS_LOG_TAG.PRESSURE_POLICY, {
        nodeId: this.nodeId,
        action: decision.action,
        reason: decision.reason,
        workClass: normalizeWorkClass(request.workClass),
        resourceKeys: normalizeResourceKeys(request.resourceKeys),
        retryAfterMs: normalizeRetryAfterMs(decision.retryAfterMs),
        sensor: summary.sensor || PRESSURE_GOVERNOR_LITERAL.NONE,
        capacityPartition:
        summary.capacityPartition || PRESSURE_CAPACITY_PARTITION.SHARED,
        backpressured: summary.backpressured === true,
        saturatedNodeCount: normalizeQueueStat(summary.saturatedNodeCount),
        totalPending: normalizeQueueStat(summary.totalPending),
        totalPendingCritical: normalizeQueueStat(summary.totalPendingCritical),
        totalPendingBackground: normalizeQueueStat(summary.totalPendingBackground),
        maxPendingUtilization: Number.isFinite(summary.maxPendingUtilization) ?
        summary.maxPendingUtilization :
        NUM.ZERO
      });
    } catch (_error) {

      // Metrics logging must not change admission behavior.
    }}

  getPressureSummary(resourceKeys = []) {
    const normalizedKeys = normalizeResourceKeys(resourceKeys);
    const capacityPartition = resolveCapacityPartition(normalizedKeys);
    if (!shouldUseTransportSensor(normalizedKeys)) {
      return buildNoPressureSummary();
    }
    if (typeof this.messageRouter?.getStats === TYPEOF.FUNCTION) {
      return buildPartitionedTransportPressureSummary(
        this.messageRouter.getStats(),
        capacityPartition
      );
    }
    if (typeof this.messageRouter?.getOutboundPressureSummary !==
    TYPEOF.FUNCTION) {
      return buildTransportPressureSummary(
        buildNoPressureSummary(PRESSURE_GOVERNOR_LITERAL.TRANSPORT_OUTBOUND),
        capacityPartition
      );
    }
    return buildTransportPressureSummary(
      this.messageRouter.getOutboundPressureSummary(),
      capacityPartition
    );
  }

  isBackpressured(request = {}) {
    return this.getPressureSummary(request.resourceKeys).backpressured === true;
  }

  emitDecision(request, decision) {
    this.emitPressureMetric(request, decision);
    return decision;
  }

  evaluate(request = {}) {
    const workClass = normalizeWorkClass(request.workClass);
    const summary = this.getPressureSummary(request.resourceKeys);
    if (summary.backpressured !== true) {
      return this.emitDecision(request, buildDecision(
        PRESSURE_GOVERNOR_ACTION.ALLOW,
        PRESSURE_GOVERNOR_REASON.NONE,
        summary,
        NUM.ZERO
      ));
    }
    if (workClass === PRESSURE_WORK_CLASS.CRITICAL) {
      return this.emitDecision(request, buildDecision(
        PRESSURE_GOVERNOR_ACTION.ALLOW,
        PRESSURE_GOVERNOR_REASON.CRITICAL_BYPASS,
        summary,
        NUM.ZERO
      ));
    }
    if (request.allowDegrade !== false) {
      return this.emitDecision(request, buildDecision(
        PRESSURE_GOVERNOR_ACTION.DEGRADE,
        PRESSURE_GOVERNOR_REASON.TRANSPORT_BACKPRESSURE,
        summary,
        request.retryAfterMs
      ));
    }
    if (request.allowDefer === true) {
      return this.emitDecision(request, buildDecision(
        PRESSURE_GOVERNOR_ACTION.DEFER,
        PRESSURE_GOVERNOR_REASON.TRANSPORT_BACKPRESSURE,
        summary,
        request.retryAfterMs
      ));
    }
    return this.emitDecision(request, buildDecision(
      PRESSURE_GOVERNOR_ACTION.REJECT,
      PRESSURE_GOVERNOR_REASON.TRANSPORT_BACKPRESSURE,
      summary,
      request.retryAfterMs
    ));
  }
}

export {
  buildPressureAdmissionFailure,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_GOVERNOR_DEFAULT,
  PRESSURE_GOVERNOR_ERROR_CODE,
  PRESSURE_GOVERNOR_REASON,
  PRESSURE_WORK_CLASS,
  PressureGovernor };