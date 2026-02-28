import {
  DISCOVERY_READINESS_REASON_SCHEMA_VERSION_LAG,
  DISCOVERY_READINESS_REASON_SCHEMA_VERSION_UNKNOWN,
  normalizeRequiredSchemaVersion,
} from './postgres-baseline-strict-gate.js';

const ZERO = 0;
const ONE = 1;
const DEFAULT_UNKNOWN_NODE_ID = 'unknown';
const DEFAULT_NODE_PROBE_REASON_PREFIX = 'node_probe_error:';

function extractNodeProbeReasonsByNodeId(gateResult, options = {}) {
  const nodeReasons = {};
  const reasonHistogram = gateResult?.reasonHistogram &&
    typeof gateResult.reasonHistogram === 'object' ?
    gateResult.reasonHistogram :
    {};
  const nodeProbeReasonPrefix =
    typeof options.nodeProbeReasonPrefix === 'string' &&
      options.nodeProbeReasonPrefix.length > ZERO ?
      options.nodeProbeReasonPrefix :
      DEFAULT_NODE_PROBE_REASON_PREFIX;
  const unknownNodeId = typeof options.unknownNodeId === 'string' &&
    options.unknownNodeId.length > ZERO ?
    options.unknownNodeId :
    DEFAULT_UNKNOWN_NODE_ID;

  for (const reason of Object.keys(reasonHistogram)) {
    if (!reason.startsWith(nodeProbeReasonPrefix)) {
      continue;
    }
    const detail = reason.slice(nodeProbeReasonPrefix.length);
    const separatorIndex = detail.indexOf('=');
    const nodeId = separatorIndex >= ZERO ?
      detail.slice(ZERO, separatorIndex) :
      unknownNodeId;
    const reasonDetail = separatorIndex >= ZERO ?
      detail.slice(separatorIndex + ONE) :
      detail;
    if (!Object.prototype.hasOwnProperty.call(nodeReasons, nodeId)) {
      nodeReasons[nodeId] = [];
    }
    nodeReasons[nodeId].push(reasonDetail);
  }
  return nodeReasons;
}

function formatNodeProbeReasons(nodeReasonsByNodeId) {
  const entries = Object.entries(nodeReasonsByNodeId || {});
  if (entries.length === ZERO) {
    return 'none';
  }
  return entries
    .map(([nodeId, reasons]) => {
      const reasonText = Array.isArray(reasons) && reasons.length > ZERO ?
        reasons.join('|') :
        'unknown';
      return String(nodeId) + ':' + reasonText;
    })
    .join(';');
}

function buildVersionLagSummary(versionConvergence) {
  const requiredSchemaVersion =
    normalizeRequiredSchemaVersion(versionConvergence?.requiredSchemaVersion);
  const sourceNodes = versionConvergence?.nodes &&
    typeof versionConvergence.nodes === 'object' ?
    versionConvergence.nodes :
    {};
  const nodes = {};
  for (const [nodeId, nodeSnapshot] of Object.entries(sourceNodes)) {
    const unmetReasons = Array.isArray(nodeSnapshot?.unmetReasons) ?
      [...nodeSnapshot.unmetReasons] :
      [];
    nodes[String(nodeId)] = {
      observedSchemaVersion:
        normalizeRequiredSchemaVersion(nodeSnapshot?.observedSchemaVersion),
      requiredSchemaVersion:
        normalizeRequiredSchemaVersion(nodeSnapshot?.requiredSchemaVersion) ||
        requiredSchemaVersion,
      unmetReasons,
      lagging:
        unmetReasons.includes(DISCOVERY_READINESS_REASON_SCHEMA_VERSION_LAG) ||
        unmetReasons.includes(DISCOVERY_READINESS_REASON_SCHEMA_VERSION_UNKNOWN),
    };
  }
  return {
    requiredSchemaVersion,
    nodes,
  };
}

export {
  extractNodeProbeReasonsByNodeId,
  formatNodeProbeReasons,
  buildVersionLagSummary,
};
