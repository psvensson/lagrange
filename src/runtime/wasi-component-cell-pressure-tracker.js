const BYTES_PER_KIB = 1024;
const KIB_PER_MIB = 1024;
const DEFAULT_EMIT_BUFFER_MIB = 16;
const DEFAULT_MAX_AGGREGATE_EMIT_BUFFER_MIB = 64;
const DEFAULT_CELL_EMIT_BUFFER_BYTES =
  DEFAULT_EMIT_BUFFER_MIB * KIB_PER_MIB * BYTES_PER_KIB;
const DEFAULT_MAX_AGGREGATE_EMIT_BUFFER_BYTES =
  DEFAULT_MAX_AGGREGATE_EMIT_BUFFER_MIB * KIB_PER_MIB * BYTES_PER_KIB;
const CELL_EMIT_BUFFER_META_SLOTS = 2;
const INT32_BYTE_WIDTH = 4;
const CELL_EMIT_DATA_OFFSET = CELL_EMIT_BUFFER_META_SLOTS * INT32_BYTE_WIDTH;
const ZERO = 0;
const ONE = 1;
const UNSET_TIMESTAMP = null;
const MEMORY_PRESSURE_EXCEEDED_CODE =
  'request_cell_runtime_memory_pressure_exceeded';

function defaultCreatePressureError(projectedBytes, limitBytes) {
  const error = new Error(
    `Runtime aggregate emit buffer bytes (${projectedBytes}) exceeded ` +
      `limit (${limitBytes})`,
  );
  error.code = MEMORY_PRESSURE_EXCEEDED_CODE;
  return error;
}

function resolvePositiveSafeInteger(candidate, fallback) {
  return Number.isSafeInteger(candidate) && candidate > ZERO ?
    candidate :
    fallback;
}

function markCellBusy(state, deadlineMs, nowMs = Date.now()) {
  state.busy = true;
  state.busySinceMs = nowMs;
  state.activeDeadlineMs = deadlineMs;
}

function clearCellBusy(state) {
  state.busy = false;
  state.busySinceMs = UNSET_TIMESTAMP;
  state.activeDeadlineMs = UNSET_TIMESTAMP;
}

function isCellBusyWithinDeadline(state, nowMs = Date.now()) {
  return state?.busy === true &&
    Number.isFinite(state.activeDeadlineMs) &&
    nowMs <= state.activeDeadlineMs;
}

function countBusyCells(cells) {
  if (!cells || typeof cells.values !== 'function') {
    return ZERO;
  }
  let count = ZERO;
  for (const state of cells.values()) {
    if (state?.busy === true) {
      count += ONE;
    }
  }
  return count;
}

class WasiComponentCellPressureTracker {
  constructor(options = {}) {
    this.maxAggregateEmitBufferBytes = resolvePositiveSafeInteger(
      options.maxAggregateEmitBufferBytes,
      DEFAULT_MAX_AGGREGATE_EMIT_BUFFER_BYTES,
    );
    this.defaultEmitBufferBytes = resolvePositiveSafeInteger(
      options.emitBufferBytes,
      DEFAULT_CELL_EMIT_BUFFER_BYTES,
    );
    this.activeEmitBufferBytes = ZERO;
    this.activeEmitBufferCount = ZERO;
    this.peakEmitBufferBytes = ZERO;
    this.rejectedPressureCount = ZERO;
    this.totalAcquiredCount = ZERO;
    this.totalReleasedCount = ZERO;
  }

  resolveEmitBufferBytes(callContextOptions) {
    return resolvePositiveSafeInteger(
      callContextOptions?.emitBufferBytes,
      this.defaultEmitBufferBytes,
    );
  }

  acquireEmitBuffer(
    byteLength,
    createPressureError = defaultCreatePressureError,
  ) {
    const requestedBytes = resolvePositiveSafeInteger(
      byteLength,
      this.defaultEmitBufferBytes,
    );
    const projectedBytes = this.activeEmitBufferBytes + requestedBytes;
    if (projectedBytes > this.maxAggregateEmitBufferBytes) {
      this.rejectedPressureCount += ONE;
      throw createPressureError(
        projectedBytes,
        this.maxAggregateEmitBufferBytes,
      );
    }
    this.activeEmitBufferBytes = projectedBytes;
    this.activeEmitBufferCount += ONE;
    this.totalAcquiredCount += ONE;
    if (projectedBytes > this.peakEmitBufferBytes) {
      this.peakEmitBufferBytes = projectedBytes;
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.releaseEmitBuffer(requestedBytes);
    };
  }

  releaseEmitBuffer(releaseFnOrByteLength) {
    if (typeof releaseFnOrByteLength === 'function') {
      releaseFnOrByteLength();
      return;
    }
    const byteLength = Number.isSafeInteger(releaseFnOrByteLength) ?
      releaseFnOrByteLength :
      ZERO;
    this.activeEmitBufferBytes = Math.max(
      ZERO,
      this.activeEmitBufferBytes - byteLength,
    );
    this.activeEmitBufferCount = Math.max(
      ZERO,
      this.activeEmitBufferCount - ONE,
    );
    this.totalReleasedCount += ONE;
  }

  getTelemetry(cells) {
    const instanceCount = Number.isSafeInteger(cells?.size) ?
      cells.size :
      ZERO;
    return Object.freeze({
      activeEmitBufferBytes: this.activeEmitBufferBytes,
      activeEmitBufferCount: this.activeEmitBufferCount,
      activeEmitBuffers: this.activeEmitBufferCount,
      busyCellCount: countBusyCells(cells),
      instanceCount,
      maxAggregateEmitBufferBytes: this.maxAggregateEmitBufferBytes,
      peakEmitBufferBytes: this.peakEmitBufferBytes,
      rejectedAllocations: this.rejectedPressureCount,
      rejectedPressureCount: this.rejectedPressureCount,
      totalAcquiredCount: this.totalAcquiredCount,
      totalReleasedCount: this.totalReleasedCount,
    });
  }
}

function prepareCallEmitPayload(
  tracker,
  payload,
  options,
  createPressureError,
) {
  if (options.callContext === undefined) {
    return {emitBuffer: undefined, releaseEmitBuffer: () => {}};
  }
  const emitBufferBytes = tracker.resolveEmitBufferBytes(options.callContext);
  const releaseEmitBuffer = tracker.acquireEmitBuffer(
    emitBufferBytes,
    createPressureError,
  );
  let emitBuffer;
  try {
    emitBuffer = new SharedArrayBuffer(emitBufferBytes);
  } catch (error) {
    releaseEmitBuffer();
    throw error;
  }
  payload.callContext = {
    emitBudget: Number.isSafeInteger(options.callContext.emitBudget) ?
      options.callContext.emitBudget :
      ZERO,
    emitBuffer,
    maxEmitPayloadBytes: options.callContext.maxEmitPayloadBytes,
    nestedCallBudget:
      Number.isSafeInteger(options.callContext.nestedCallBudget) ?
        options.callContext.nestedCallBudget :
        ZERO,
    onCallBounded: options.callContext.onCallBounded === true,
  };
  return {emitBuffer, releaseEmitBuffer};
}

function normalizeCallInvokeOptions(options = {}) {
  return {
    ...options,
    callContext: options.callContext || {
      emitBudget: options.emitBudget,
      emitBufferBytes: options.emitBufferBytes,
      maxEmitPayloadBytes: options.maxEmitPayloadBytes,
      nestedCallBudget: options.nestedCallBudget,
      onCallBounded: options.onCallBounded === true,
    },
  };
}

export {
  CELL_EMIT_BUFFER_META_SLOTS,
  CELL_EMIT_DATA_OFFSET,
  DEFAULT_CELL_EMIT_BUFFER_BYTES,
  DEFAULT_MAX_AGGREGATE_EMIT_BUFFER_BYTES,
  WasiComponentCellPressureTracker,
  clearCellBusy,
  isCellBusyWithinDeadline,
  markCellBusy,
  normalizeCallInvokeOptions,
  prepareCallEmitPayload,
};
