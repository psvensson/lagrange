import {
  POSTGRES_BASELINE_COMPARISON_SEGMENT_1,
} from './postgres-baseline-comparison-segment-1.js';

const {DISCOVERY_ADMISSION_SOURCE, ZERO} = POSTGRES_BASELINE_COMPARISON_SEGMENT_1;

export function normalizeNonNegativeInteger(value) {
  if (!Number.isFinite(value)) {
    return ZERO;
  }
  return Math.max(ZERO, Math.floor(Number(value)));
}

export function resolveControlSnapshotCandidates(seedNode, loadNodes) {
  const nodes = [];
  if (seedNode) {
    nodes.push(seedNode);
  }
  if (Array.isArray(loadNodes)) {
    nodes.push(...loadNodes);
  }
  const seenNodeIds = new Set();
  const candidates = [];
  for (const node of nodes) {
    const nodeId =
      typeof node?.id === 'string' && node.id.length > ZERO ? node.id : null;
    if (!nodeId) {
      continue;
    }
    if (seenNodeIds.has(nodeId)) {
      continue;
    }
    seenNodeIds.add(nodeId);
    candidates.push(node);
  }
  return candidates;
}

export function recordAdmissionRuntimeOwnership(audit, stage, nodeId, source) {
  if (!audit || typeof audit !== 'object') {
    return;
  }
  if (typeof nodeId !== 'string' || nodeId.length === ZERO) {
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(audit, stage)) {
    return;
  }
  if (!Object.values(DISCOVERY_ADMISSION_SOURCE).includes(source)) {
    return;
  }
  audit[stage].byNodeId[nodeId] = source;
}
