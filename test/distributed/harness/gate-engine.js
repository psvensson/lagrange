import {GATE_RESULT_MODE} from './constants.js';

const ZERO = 0;
const ONE = 1;
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_POLL_INTERVAL_MS = 250;
const DEFAULT_STABLE_WINDOW_MS = 0;
const UNKNOWN_NODE_ID = 'unknown-node';
const UNKNOWN_REASON = 'unknown_reason';

function normalizeNodeId(node) {
  if (typeof node?.id === 'string' && node.id.length > ZERO) {
    return node.id;
  }
  return UNKNOWN_NODE_ID;
}

function normalizeErrorMessage(error) {
  if (typeof error?.message === 'string' && error.message.length > ZERO) {
    return error.message;
  }
  if (typeof error === 'string' && error.length > ZERO) {
    return error;
  }
  return UNKNOWN_REASON;
}

function normalizeReasons(reasons) {
  if (!Array.isArray(reasons)) {
    return [];
  }
  return reasons
    .map((reason) => String(reason))
    .filter((reason) => reason.length > ZERO);
}

function normalizeGateProbeResult(result) {
  const ready = result?.ready === true;
  const reasons = normalizeReasons(result?.reasons);
  return {
    ready,
    reasons,
  };
}

function incrementHistogram(reasonHistogram, reasons) {
  for (const reason of reasons) {
    const key = String(reason || UNKNOWN_REASON);
    if (!Object.prototype.hasOwnProperty.call(reasonHistogram, key)) {
      reasonHistogram[key] = ZERO;
    }
    reasonHistogram[key] += ONE;
  }
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function resolvePositiveInteger(value, fallback) {
  if (Number.isInteger(value) && value > ZERO) {
    return value;
  }
  return fallback;
}

function resolveNonNegativeInteger(value, fallback) {
  if (Number.isInteger(value) && value >= ZERO) {
    return value;
  }
  return fallback;
}

class GateEngine {
  constructor(options = {}) {
    this._now = typeof options.now === 'function' ? options.now : () => Date.now();
    this._sleep = typeof options.sleep === 'function' ? options.sleep :
      (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs));
  }

  async waitForGate(options = {}) {
    const nodes = Array.isArray(options.nodes) ? [...options.nodes] : [];
    const nodeIds = uniqueSorted(nodes.map((node) => normalizeNodeId(node)));
    const probeNode = typeof options.probeNode === 'function' ?
      options.probeNode :
      async () => ({ready: true, reasons: []});
    const evaluateGlobalCondition =
      typeof options.evaluateGlobalCondition === 'function' ?
        options.evaluateGlobalCondition :
        async () => ({ready: true, reasons: []});
    const timeoutMs = resolvePositiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS);
    const pollIntervalMs = resolvePositiveInteger(
      options.pollIntervalMs,
      DEFAULT_POLL_INTERVAL_MS,
    );
    const stableWindowMs = resolveNonNegativeInteger(
      options.stableWindowMs,
      DEFAULT_STABLE_WINDOW_MS,
    );
    const allowSubsetFallback = options.allowSubsetFallback === true;

    const reasonHistogram = {};
    const deadlineMs = this._now() + timeoutMs;
    let attempts = ZERO;
    let allReadySinceMs = null;
    let lastKnownGoodSubset = null;
    let lastIncludedNodeIds = [];

    while (this._now() <= deadlineMs) {
      attempts += ONE;

      const probeOutcomes = [];
      for (const node of nodes) {
        const nodeId = normalizeNodeId(node);
        try {
          const probeResult = normalizeGateProbeResult(await probeNode(node));
          probeOutcomes.push({
            nodeId,
            ready: probeResult.ready,
            reasons: probeResult.reasons,
          });
          if (!probeResult.ready) {
            incrementHistogram(reasonHistogram, probeResult.reasons);
          }
        } catch (error) {
          const reasons = [normalizeErrorMessage(error)];
          probeOutcomes.push({
            nodeId,
            ready: false,
            reasons,
          });
          incrementHistogram(reasonHistogram, reasons);
        }
      }

      let globalCondition = {
        ready: true,
        reasons: [],
      };
      try {
        globalCondition = normalizeGateProbeResult(
          await evaluateGlobalCondition(),
        );
      } catch (error) {
        globalCondition = {
          ready: false,
          reasons: [normalizeErrorMessage(error)],
        };
      }
      if (!globalCondition.ready) {
        incrementHistogram(reasonHistogram, globalCondition.reasons);
      }

      const includedNodeIds = uniqueSorted(
        probeOutcomes
          .filter((outcome) => outcome.ready)
          .map((outcome) => outcome.nodeId),
      );
      const includedNodeSet = new Set(includedNodeIds);
      const excludedNodeIds = nodeIds.filter((nodeId) => !includedNodeSet.has(nodeId));
      lastIncludedNodeIds = includedNodeIds;

      const hasUsableSubset = globalCondition.ready && includedNodeIds.length > ZERO;
      if (hasUsableSubset) {
        lastKnownGoodSubset = {
          includedNodeIds,
          excludedNodeIds,
        };
      }

      const allNodesReady = globalCondition.ready &&
        includedNodeIds.length === nodeIds.length;
      if (allNodesReady) {
        if (allReadySinceMs === null) {
          allReadySinceMs = this._now();
        }
        const stableElapsedMs = this._now() - allReadySinceMs;
        if (stableElapsedMs >= stableWindowMs) {
          return {
            mode: GATE_RESULT_MODE.ALL_READY,
            includedNodeIds,
            excludedNodeIds,
            attempts,
            stableElapsedMs,
            reasonHistogram,
          };
        }
      } else {
        allReadySinceMs = null;
      }

      if (this._now() >= deadlineMs) {
        break;
      }
      await this._sleep(pollIntervalMs);
    }

    if (allowSubsetFallback && lastKnownGoodSubset) {
      return {
        mode: GATE_RESULT_MODE.SUBSET_READY,
        includedNodeIds: lastKnownGoodSubset.includedNodeIds,
        excludedNodeIds: lastKnownGoodSubset.excludedNodeIds,
        attempts,
        stableElapsedMs: ZERO,
        reasonHistogram,
      };
    }

    const includedNodeSet = new Set(lastIncludedNodeIds);
    const excludedNodeIds = nodeIds.filter((nodeId) => !includedNodeSet.has(nodeId));
    return {
      mode: GATE_RESULT_MODE.FAILED,
      includedNodeIds: lastIncludedNodeIds,
      excludedNodeIds,
      attempts,
      stableElapsedMs: ZERO,
      reasonHistogram,
    };
  }
}

export {GateEngine};
