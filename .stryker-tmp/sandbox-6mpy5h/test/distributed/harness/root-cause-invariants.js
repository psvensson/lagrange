// @ts-nocheck
import {ROOT_CAUSE_CLASS, ROOT_CAUSE_CODE} from './root-cause-constants.js';
import {
  createInvariantRecord,
  INVARIANT_ID,
} from '../../../src/invariants/invariant-catalog.js';

const ZERO = 0;
const MAX_DETAIL_ENTRIES = 25;
const CDC_RETRY_STORM_THRESHOLD = 1;
const CACHE_STALE_THRESHOLD_MS = 5000;

const CONTROL_PLANE_PARTITION_KEYS = Object.freeze([
  'nodes',
  'services',
  'node_endpoints',
  'service_endpoints',
]);

const INVARIANT_PRECEDENCE = Object.freeze([
  ROOT_CAUSE_CODE.LEADERSHIP_UNKNOWN_CONTROL_PLANE_PARTITION,
  ROOT_CAUSE_CODE.CDC_RETRY_STORM,
  ROOT_CAUSE_CODE.CACHE_STALE_WATERMARK,
  ROOT_CAUSE_CODE.SERVICES_MISSING_SYS_POSTGRES_WIRE,
  ROOT_CAUSE_CODE.DISCOVERY_EMPTY_WITH_SERVICES_PRESENT,
  ROOT_CAUSE_CODE.SNAPSHOT_MISSING,
]);

const ROOT_CAUSE_CLASS_BY_INVARIANT_CODE = Object.freeze({
  [ROOT_CAUSE_CODE.LEADERSHIP_UNKNOWN_CONTROL_PLANE_PARTITION]:
    ROOT_CAUSE_CLASS.LEADERSHIP,
  [ROOT_CAUSE_CODE.CDC_RETRY_STORM]: ROOT_CAUSE_CLASS.CDC,
  [ROOT_CAUSE_CODE.CACHE_STALE_WATERMARK]: ROOT_CAUSE_CLASS.CACHE,
  [ROOT_CAUSE_CODE.SERVICES_MISSING_SYS_POSTGRES_WIRE]: ROOT_CAUSE_CLASS.DISCOVERY,
  [ROOT_CAUSE_CODE.DISCOVERY_EMPTY_WITH_SERVICES_PRESENT]: ROOT_CAUSE_CLASS.DISCOVERY,
  [ROOT_CAUSE_CODE.SNAPSHOT_MISSING]: ROOT_CAUSE_CLASS.UNKNOWN,
});

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSnapshotEntries(snapshotsByNodeId) {
  if (!isRecord(snapshotsByNodeId)) {
    return [];
  }
  return Object.entries(snapshotsByNodeId)
    .map(([nodeId, snapshot]) => ({
      nodeId: String(nodeId),
      snapshot: isRecord(snapshot) ? snapshot : null,
    }))
    .filter((entry) => entry.nodeId.length > 0);
}

function pickDominantInvariantCode(invariants) {
  const failing = new Set(
    (Array.isArray(invariants) ? invariants : [])
      .filter((invariant) => invariant?.passed === false)
      .map((invariant) => String(invariant?.code || ''))
      .filter(Boolean),
  );
  if (failing.size === 0) {
    return null;
  }
  for (const code of INVARIANT_PRECEDENCE) {
    if (failing.has(code)) {
      return code;
    }
  }
  return [...failing].sort()[0];
}

function buildInvariantResult({
  invariantId,
  passed,
  details,
  entityId = 'preflight',
}) {
  const invariant = createInvariantRecord({
    invariantId,
    passed,
    entityId,
    observed: details,
    details,
    timestampMs: ZERO,
  });
  return {
    ...invariant,
    code: invariant.reasonCode,
  };
}

function evaluateSnapshotMissing(entries) {
  const missingNodeIds = [];
  for (const entry of entries) {
    const snapshot = entry.snapshot;
    if (!snapshot) {
      continue;
    }
    if (isRecord(snapshot.missing)) {
      missingNodeIds.push(entry.nodeId);
    }
  }
  const details = {
      missingCount: missingNodeIds.length,
      missingNodeIds: missingNodeIds.slice(0, MAX_DETAIL_ENTRIES),
    };
  return buildInvariantResult({
    invariantId: INVARIANT_ID.CONTROL_PLANE_SNAPSHOT_AVAILABLE,
    passed: missingNodeIds.length === 0,
    details,
  });
}

function evaluateLeadershipUnknown(entries) {
  const violations = [];
  for (const entry of entries) {
    const snapshot = entry.snapshot;
    if (!snapshot || isRecord(snapshot.missing)) {
      continue;
    }
    const partitions = isRecord(snapshot.controlPlanePartitions) ?
      snapshot.controlPlanePartitions :
      {};
    for (const partitionKey of CONTROL_PLANE_PARTITION_KEYS) {
      const partition = partitions[partitionKey];
      if (!isRecord(partition)) {
        violations.push({
          nodeId: entry.nodeId,
          partitionKey,
          lastErrorCode: 'partition_missing',
        });
        continue;
      }
      if (partition.leaderKnown !== true) {
        violations.push({
          nodeId: entry.nodeId,
          partitionKey,
          lastErrorCode: typeof partition.lastErrorCode === 'string' ?
            partition.lastErrorCode :
            null,
        });
      }
    }
  }
  const details = {
      violationCount: violations.length,
      violations: violations.slice(0, MAX_DETAIL_ENTRIES),
    };
  return buildInvariantResult({
    invariantId: INVARIANT_ID.CONTROL_PLANE_PARTITION_LEADER_DISCOVERABLE,
    passed: violations.length === 0,
    details,
  });
}

function evaluateCdcRetryStorm(entries) {
  const violatingNodeIds = [];
  let maxRetryCount = ZERO;
  for (const entry of entries) {
    const snapshot = entry.snapshot;
    if (!snapshot || isRecord(snapshot.missing)) {
      continue;
    }
    const retryCount = Number(snapshot?.cdcHealth?.retryCount);
    if (Number.isFinite(retryCount)) {
      maxRetryCount = Math.max(maxRetryCount, Math.floor(retryCount));
      if (retryCount >= CDC_RETRY_STORM_THRESHOLD) {
        violatingNodeIds.push(entry.nodeId);
      }
    }
  }
  const details = {
      threshold: CDC_RETRY_STORM_THRESHOLD,
      maxRetryCount,
      violatingNodeIds: violatingNodeIds.slice(0, MAX_DETAIL_ENTRIES),
    };
  return buildInvariantResult({
    invariantId: INVARIANT_ID.CDC_RETRY_BUDGET_HEALTHY,
    passed: violatingNodeIds.length === 0,
    details,
  });
}

function evaluateCacheStaleWatermark(entries) {
  const violatingNodeIds = [];
  let maxStalenessMs = ZERO;
  for (const entry of entries) {
    const snapshot = entry.snapshot;
    if (!snapshot || isRecord(snapshot.missing)) {
      continue;
    }
    const stalenessMs = Number(snapshot?.cacheFreshness?.stalenessMs);
    if (!Number.isFinite(stalenessMs)) {
      continue;
    }
    maxStalenessMs = Math.max(maxStalenessMs, Math.floor(stalenessMs));
    if (stalenessMs >= CACHE_STALE_THRESHOLD_MS) {
      violatingNodeIds.push(entry.nodeId);
    }
  }
  const details = {
      thresholdMs: CACHE_STALE_THRESHOLD_MS,
      maxStalenessMs,
      violatingNodeIds: violatingNodeIds.slice(0, MAX_DETAIL_ENTRIES),
    };
  return buildInvariantResult({
    invariantId: INVARIANT_ID.CACHE_FRESHNESS_WITHIN_WATERMARK,
    passed: violatingNodeIds.length === 0,
    details,
  });
}

function evaluateServicesMissingSysPostgresWire(entries) {
  const violatingNodeIds = [];
  for (const entry of entries) {
    const snapshot = entry.snapshot;
    if (!snapshot || isRecord(snapshot.missing)) {
      continue;
    }
    const count = Number(snapshot?.rowCounts?.sysPostgresWireServiceCount);
    if (Number.isFinite(count) && Math.floor(count) === ZERO) {
      violatingNodeIds.push(entry.nodeId);
    }
  }
  const details = {
      violatingNodeIds: violatingNodeIds.slice(0, MAX_DETAIL_ENTRIES),
    };
  return buildInvariantResult({
    invariantId: INVARIANT_ID.DISCOVERY_SYS_POSTGRES_WIRE_VISIBLE,
    passed: violatingNodeIds.length === 0,
    details,
  });
}

function evaluateDiscoveryEmptyWithServicesPresent(entries) {
  const violatingNodeIds = [];
  for (const entry of entries) {
    const snapshot = entry.snapshot;
    if (!snapshot || isRecord(snapshot.missing)) {
      continue;
    }
    const selectedNodeIds = Array.isArray(snapshot?.discovery?.selectedNodeIds) ?
      snapshot.discovery.selectedNodeIds :
      [];
    if (selectedNodeIds.length > ZERO) {
      continue;
    }
    const serviceCount = Number(snapshot?.rowCounts?.sysPostgresWireServiceCount);
    if (Number.isFinite(serviceCount) && Math.floor(serviceCount) > ZERO) {
      violatingNodeIds.push(entry.nodeId);
    }
  }
  const details = {
      violatingNodeIds: violatingNodeIds.slice(0, MAX_DETAIL_ENTRIES),
    };
  return buildInvariantResult({
    invariantId: INVARIANT_ID.DISCOVERY_NON_EMPTY_WITH_SERVICES_PRESENT,
    passed: violatingNodeIds.length === 0,
    details,
  });
}

function evaluateInvariantsFromEntries(entries) {
  return [
    evaluateLeadershipUnknown(entries),
    evaluateCdcRetryStorm(entries),
    evaluateCacheStaleWatermark(entries),
    evaluateServicesMissingSysPostgresWire(entries),
    evaluateDiscoveryEmptyWithServicesPresent(entries),
    evaluateSnapshotMissing(entries),
  ];
}

export function evaluateRootCauseInvariants({snapshotsByNodeId}) {
  const entries = normalizeSnapshotEntries(snapshotsByNodeId);
  const invariants = evaluateInvariantsFromEntries(entries);
  const dominantInvariant = pickDominantInvariantCode(invariants);
  const rootCauseClass = dominantInvariant ?
    (ROOT_CAUSE_CLASS_BY_INVARIANT_CODE[dominantInvariant] ||
      ROOT_CAUSE_CLASS.UNKNOWN) :
    ROOT_CAUSE_CLASS.UNKNOWN;

  return {
    invariants,
    dominantInvariant,
    rootCauseCode: dominantInvariant,
    rootCauseClass,
  };
}
