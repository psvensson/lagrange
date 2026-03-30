import {
  ROOT_CAUSE_BUNDLE_SCHEMA_VERSION,
  ROOT_CAUSE_CLASS,
  ROOT_CAUSE_CODE,
} from './root-cause-constants.js';
import {NODE_CLIENT_ERROR_CODES, NODE_CLIENT_TIMEOUT_CLASS} from './constants.js';
import {evaluateRootCauseInvariants} from './root-cause-invariants.js';

const ROOT_CAUSE_CODE_VALUES = new Set(Object.values(ROOT_CAUSE_CODE));
const ROOT_CAUSE_CLASS_VALUES = new Set(Object.values(ROOT_CAUSE_CLASS));

const SNAPSHOT_MISSING_REASON_TIMEOUT = 'snapshot_timeout';
const SNAPSHOT_MISSING_REASON_CIRCUIT_OPEN = 'snapshot_circuit_open';
const SNAPSHOT_MISSING_REASON_BUDGET_EXHAUSTED = 'snapshot_budget_exhausted';
const SNAPSHOT_MISSING_REASON_QUERY_FAILED = 'snapshot_query_failed';

const UNKNOWN_NODE_ID = 'unknown';
const UNKNOWN_NODE_ADDRESS = 'unknown';
const ROOT_CAUSE_SNAPSHOT_KIND_PREFLIGHT_CRITICAL_PATH =
  'preflight_critical_path';

function normalizeNodeId(node) {
  return typeof node?.id === 'string' && node.id.length > 0 ?
    node.id :
    UNKNOWN_NODE_ID;
}

function normalizeNodeAddress(node) {
  if (typeof node?.ip === 'string' && node.ip.length > 0) {
    return node.ip;
  }
  if (typeof node?.address === 'string' && node.address.length > 0) {
    return node.address;
  }
  return UNKNOWN_NODE_ADDRESS;
}

function resolveSnapshotMissingReasonCode(error) {
  if (error?.timeoutClass === NODE_CLIENT_TIMEOUT_CLASS.TIMEOUT) {
    return SNAPSHOT_MISSING_REASON_TIMEOUT;
  }
  if (error?.code === NODE_CLIENT_ERROR_CODES.CIRCUIT_OPEN) {
    return SNAPSHOT_MISSING_REASON_CIRCUIT_OPEN;
  }
  if (error?.code === NODE_CLIENT_ERROR_CODES.BUDGET_EXHAUSTED) {
    return SNAPSHOT_MISSING_REASON_BUDGET_EXHAUSTED;
  }
  return SNAPSHOT_MISSING_REASON_QUERY_FAILED;
}

function buildMissingSnapshotEntry(node, error) {
  return {
    nodeId: normalizeNodeId(node),
    address: normalizeNodeAddress(node),
    missing: {
      reasonCode: resolveSnapshotMissingReasonCode(error),
      timeoutClass: typeof error?.timeoutClass === 'string' ? error.timeoutClass : null,
      code: typeof error?.code === 'string' ? error.code : null,
      channel: typeof error?.channel === 'string' ? error.channel : null,
      operation: typeof error?.operation === 'string' ? error.operation : null,
    },
  };
}

function extractControlPlaneLedgerSnapshot(snapshot = {}, nodeId = UNKNOWN_NODE_ID) {
  const diagnostics = snapshot?.controlPlaneDiagnostics;
  if (!diagnostics || typeof diagnostics !== 'object' || Array.isArray(diagnostics)) {
    return null;
  }
  return {
    nodeId,
    capturedAt:
      typeof snapshot?.capturedAt === 'string' ? snapshot.capturedAt : null,
    capturedAtMs:
      Number.isFinite(snapshot?.capturedAtMs) ? snapshot.capturedAtMs :
        (Number.isFinite(snapshot?.capturedAt) ? snapshot.capturedAt : null),
    controlPlaneDiagnostics: JSON.parse(JSON.stringify(diagnostics)),
  };
}

export async function collectPreflightCriticalPathSnapshots({
  nodeClient,
  nodes,
  context = {},
}) {
  const snapshotNodes = Array.isArray(nodes) ? nodes : [];
  const snapshotsByNodeId = {};
  const controlPlaneLedgerSnapshotsByNodeId = {};

  await Promise.all(snapshotNodes.map(async (node) => {
    const nodeId = normalizeNodeId(node);
    try {
      if (typeof nodeClient?.fetchPreflightCriticalPathSnapshot !== 'function') {
        throw new Error('NodeClient missing fetchPreflightCriticalPathSnapshot');
      }
      const snapshot = await nodeClient.fetchPreflightCriticalPathSnapshot(
        node,
        context,
      );
      snapshotsByNodeId[nodeId] = {
        ...snapshot,
        nodeId,
        address: typeof snapshot?.address === 'string' && snapshot.address.length > 0 ?
          snapshot.address :
          normalizeNodeAddress(node),
      };
    } catch (error) {
      snapshotsByNodeId[nodeId] = buildMissingSnapshotEntry(node, error);
    }
  }));

  return snapshotsByNodeId;
}

export async function collectFailureControlSnapshots({
  nodeClient,
  nodes,
  context = {},
}) {
  const snapshotNodes = Array.isArray(nodes) ? nodes : [];
  const snapshotsByNodeId = {};
  const controlPlaneLedgerSnapshotsByNodeId = {};

  await Promise.all(snapshotNodes.map(async (node) => {
    const nodeId = normalizeNodeId(node);
    try {
      if (typeof nodeClient?.fetchControlSnapshot !== 'function') {
        throw new Error('NodeClient missing fetchControlSnapshot');
      }
      const snapshot = await nodeClient.fetchControlSnapshot(node, context);
      snapshotsByNodeId[nodeId] = {
        ...snapshot,
        nodeId,
        address: typeof snapshot?.address === 'string' && snapshot.address.length > 0 ?
          snapshot.address :
          normalizeNodeAddress(node),
      };
      const ledgerSnapshot = extractControlPlaneLedgerSnapshot(
        snapshotsByNodeId[nodeId],
        nodeId,
      );
      if (ledgerSnapshot) {
        controlPlaneLedgerSnapshotsByNodeId[nodeId] = ledgerSnapshot;
      }
    } catch (error) {
      snapshotsByNodeId[nodeId] = buildMissingSnapshotEntry(node, error);
    }
  }));

  return {
    snapshotsByNodeId,
    controlPlaneLedgerSnapshotsByNodeId,
  };
}

export function buildRootCauseBundle({
  failureArtifact,
  snapshotsByNodeId,
  controlPlaneLedgerSnapshotsByNodeId = null,
  playback,
  adminQueryTraceByNodeId,
  snapshotKind = null,
  evaluateInvariants = true,
  channelMetrics = null,
  channelStateByChannel = null,
}) {
  const dominantReason = typeof failureArtifact?.dominantReason === 'string' ?
    failureArtifact.dominantReason :
    null;
  let rootCauseCode = ROOT_CAUSE_CODE_VALUES.has(dominantReason) ?
    dominantReason :
    ROOT_CAUSE_CODE.UNKNOWN;

  const failureRootCauseClass =
    typeof failureArtifact?.rootCauseClass === 'string' ?
      failureArtifact.rootCauseClass :
      null;
  let rootCauseClass = ROOT_CAUSE_CLASS_VALUES.has(failureRootCauseClass) ?
    failureRootCauseClass :
    ROOT_CAUSE_CLASS.UNKNOWN;

  const hasSnapshots = snapshotsByNodeId && typeof snapshotsByNodeId === 'object';
  const shouldEvaluateInvariants =
    evaluateInvariants === true &&
    (snapshotKind === null ||
      snapshotKind === ROOT_CAUSE_SNAPSHOT_KIND_PREFLIGHT_CRITICAL_PATH);
  const invariantEvaluation = hasSnapshots && shouldEvaluateInvariants ?
    evaluateRootCauseInvariants({snapshotsByNodeId}) :
    null;
  if (invariantEvaluation?.dominantInvariant) {
    rootCauseCode = invariantEvaluation.rootCauseCode;
    rootCauseClass = invariantEvaluation.rootCauseClass;
  }

  const bundle = {
    schemaVersion: ROOT_CAUSE_BUNDLE_SCHEMA_VERSION,
    rootCauseCode,
    rootCauseClass,
  };
  if (snapshotsByNodeId && typeof snapshotsByNodeId === 'object') {
    bundle.snapshotsByNodeId = snapshotsByNodeId;
    bundle.snapshotKind =
      snapshotKind ||
      ROOT_CAUSE_SNAPSHOT_KIND_PREFLIGHT_CRITICAL_PATH;
  }
  const directLedgerSnapshots =
    controlPlaneLedgerSnapshotsByNodeId &&
      typeof controlPlaneLedgerSnapshotsByNodeId === 'object' ?
      controlPlaneLedgerSnapshotsByNodeId :
      (snapshotsByNodeId && typeof snapshotsByNodeId === 'object' ?
        Object.entries(snapshotsByNodeId).reduce((accumulator, [nodeId, snapshot]) => {
          const ledgerSnapshot = extractControlPlaneLedgerSnapshot(snapshot, nodeId);
          if (ledgerSnapshot) {
            accumulator[nodeId] = ledgerSnapshot;
          }
          return accumulator;
        }, {}) :
        null);
  if (directLedgerSnapshots &&
      typeof directLedgerSnapshots === 'object' &&
      Object.keys(directLedgerSnapshots).length > 0) {
    bundle.controlPlaneLedgerSnapshotsByNodeId = directLedgerSnapshots;
  }
  if (invariantEvaluation) {
    bundle.invariants = invariantEvaluation.invariants;
    bundle.dominantInvariant = invariantEvaluation.dominantInvariant;
  }
  if (adminQueryTraceByNodeId && typeof adminQueryTraceByNodeId === 'object') {
    bundle.adminQueryTraceByNodeId = adminQueryTraceByNodeId;
  }
  if (channelMetrics && typeof channelMetrics === 'object') {
    bundle.channelMetrics = channelMetrics;
  }
  if (channelStateByChannel && typeof channelStateByChannel === 'object') {
    bundle.channelStateByChannel = channelStateByChannel;
  }
  if (playback && typeof playback === 'object') {
    bundle.playback = playback;
  }
  return bundle;
}
