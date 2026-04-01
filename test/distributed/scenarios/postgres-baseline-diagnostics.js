import {
  DISCOVERY_READINESS_REASON_ROUTING_NOT_READY,
  DISCOVERY_READINESS_REASON_TOPOLOGY_NOT_READY,
  DISCOVERY_READINESS_REASON_SCHEMA_VERSION_LAG,
  DISCOVERY_READINESS_REASON_SCHEMA_VERSION_UNKNOWN,
  normalizeRequiredSchemaVersion,
} from './postgres-baseline-strict-gate.js';

const ZERO = 0;
const ONE = 1;
const DEFAULT_UNKNOWN_NODE_ID = 'unknown';
const DEFAULT_NODE_PROBE_REASON_PREFIX = 'node_probe_error:';
const DISCOVERY_REASON_DETAIL_PREFIX = 'discovery_reasons=';
const DISCOVERY_REASON_DETAIL_SEPARATOR = '&';
const NODE_REASON_SEPARATOR = '|';
const NODE_REASON_VALUE_SEPARATOR = '=';
const NODE_REASON_PREFIX_SEPARATOR = ':';
const PROBE_ERROR_REASON_CODE = 'probe_error';
const STALE_REPLICA_OPERATION_REASON_CODE = 'replica_operation_stale_timeout';
const STALE_AGE_BUCKET_UNKNOWN = 'unknown';
const STALE_AGE_BUCKET_LT_30S = 'lt_30s';
const STALE_AGE_BUCKET_30_TO_60S = '30s_to_60s';
const STALE_AGE_BUCKET_60_TO_120S = '60s_to_120s';
const STALE_AGE_BUCKET_GTE_120S = 'gte_120s';
const STALE_REASON_SEGMENT_PATTERN =
  /replica_operation_stale_timeout=[^|]*/gi;
const STALE_REASON_AGE_MS_PATTERN = /ageMs=(\d+)/i;
const REASON_CODE_PATTERN = /^[a-z][a-z0-9_]*$/;
const IGNORED_REASON_CODES = new Set([
  'discovery_reasons',
  'discovery_not_ready',
]);
const DEFAULT_STRICT_PRELOAD_REASON_CODES = Object.freeze([
  DISCOVERY_READINESS_REASON_TOPOLOGY_NOT_READY,
  DISCOVERY_READINESS_REASON_ROUTING_NOT_READY,
  DISCOVERY_READINESS_REASON_SCHEMA_VERSION_UNKNOWN,
  DISCOVERY_READINESS_REASON_SCHEMA_VERSION_LAG,
  'schema_table_missing',
  'schema_partition_unavailable',
  'local_replica_not_voter_ready',
  'leadership_unstable',
  'replica_operations_in_flight',
  STALE_REPLICA_OPERATION_REASON_CODE,
  PROBE_ERROR_REASON_CODE,
]);

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

function normalizeNonNegativeInteger(value) {
  if (!Number.isFinite(value)) {
    return ZERO;
  }
  return Math.max(ZERO, Math.floor(Number(value)));
}

function normalizeStrictPreloadReasonCodes(reasonCodes) {
  if (!Array.isArray(reasonCodes) || reasonCodes.length === ZERO) {
    return DEFAULT_STRICT_PRELOAD_REASON_CODES;
  }
  const normalized = [];
  const seen = new Set();
  for (const reasonCode of reasonCodes) {
    const normalizedReasonCode = String(reasonCode || '').toLowerCase().trim();
    if (!REASON_CODE_PATTERN.test(normalizedReasonCode) ||
        seen.has(normalizedReasonCode)) {
      continue;
    }
    normalized.push(normalizedReasonCode);
    seen.add(normalizedReasonCode);
  }
  return normalized.length > ZERO ? normalized : DEFAULT_STRICT_PRELOAD_REASON_CODES;
}

function extractReasonCodeFromSegment(segment) {
  const normalizedSegment = String(segment || '').toLowerCase().trim();
  if (!normalizedSegment) {
    return null;
  }

  if (normalizedSegment.includes(NODE_REASON_VALUE_SEPARATOR)) {
    const key = normalizedSegment
      .slice(ZERO, normalizedSegment.indexOf(NODE_REASON_VALUE_SEPARATOR))
      .trim();
    if (REASON_CODE_PATTERN.test(key) && !IGNORED_REASON_CODES.has(key)) {
      return key;
    }
  }

  if (normalizedSegment.includes(NODE_REASON_PREFIX_SEPARATOR)) {
    const parts = normalizedSegment.split(NODE_REASON_PREFIX_SEPARATOR);
    for (let index = parts.length - ONE; index >= ZERO; index -= ONE) {
      const part = String(parts[index] || '').trim();
      if (REASON_CODE_PATTERN.test(part) && !IGNORED_REASON_CODES.has(part)) {
        return part;
      }
    }
  }

  return REASON_CODE_PATTERN.test(normalizedSegment) &&
      !IGNORED_REASON_CODES.has(normalizedSegment) ?
    normalizedSegment :
    null;
}

function collectReasonCodesFromDiscoveryDetail(detailText) {
  const reasonCodes = [];
  const normalizedDetailText = String(detailText || '');
  let searchIndex = ZERO;

  while (searchIndex < normalizedDetailText.length) {
    const prefixIndex = normalizedDetailText.indexOf(
      DISCOVERY_REASON_DETAIL_PREFIX,
      searchIndex,
    );
    if (prefixIndex < ZERO) {
      break;
    }
    const detailStartIndex = prefixIndex + DISCOVERY_REASON_DETAIL_PREFIX.length;
    let detailEndIndex = normalizedDetailText.indexOf(
      NODE_REASON_SEPARATOR,
      detailStartIndex,
    );
    if (detailEndIndex < ZERO) {
      detailEndIndex = normalizedDetailText.length;
    }
    const detailSegment = normalizedDetailText.slice(
      detailStartIndex,
      detailEndIndex,
    );
    for (const reasonDetail of detailSegment.split(DISCOVERY_REASON_DETAIL_SEPARATOR)) {
      const reasonCode = extractReasonCodeFromSegment(reasonDetail);
      if (reasonCode) {
        reasonCodes.push(reasonCode);
      }
    }
    searchIndex = detailEndIndex + ONE;
  }

  return reasonCodes;
}

function collectNodeReasonCodes(reasonDetail, strictReasonCodes) {
  const normalizedReasonDetail = String(reasonDetail || '').toLowerCase();
  const reasonCodes = new Set();

  for (const reasonCode of strictReasonCodes) {
    if (normalizedReasonDetail.includes(reasonCode)) {
      reasonCodes.add(reasonCode);
    }
  }

  for (const reasonCode of collectReasonCodesFromDiscoveryDetail(
    normalizedReasonDetail,
  )) {
    reasonCodes.add(reasonCode);
  }

  if (normalizedReasonDetail.includes(
    NODE_REASON_SEPARATOR + PROBE_ERROR_REASON_CODE + NODE_REASON_VALUE_SEPARATOR,
  )) {
    reasonCodes.add(PROBE_ERROR_REASON_CODE);
  }

  return [...reasonCodes];
}

function classifyStaleAgeBucket(ageMs) {
  if (!Number.isFinite(ageMs) || ageMs < ZERO) {
    return STALE_AGE_BUCKET_UNKNOWN;
  }
  if (ageMs < 30000) {
    return STALE_AGE_BUCKET_LT_30S;
  }
  if (ageMs < 60000) {
    return STALE_AGE_BUCKET_30_TO_60S;
  }
  if (ageMs < 120000) {
    return STALE_AGE_BUCKET_60_TO_120S;
  }
  return STALE_AGE_BUCKET_GTE_120S;
}

function collectStaleReplicaOperationAges(reasonDetail) {
  const ages = [];
  const normalizedReasonDetail = String(reasonDetail || '');
  STALE_REASON_SEGMENT_PATTERN.lastIndex = ZERO;
  const staleReasonSegments = normalizedReasonDetail.matchAll(
    STALE_REASON_SEGMENT_PATTERN,
  );
  let staleReasonSegmentCount = ZERO;

  for (const staleReasonSegment of staleReasonSegments) {
    staleReasonSegmentCount += ONE;
    const segmentText = String(staleReasonSegment?.[ZERO] || '');
    const ageMatch = segmentText.match(STALE_REASON_AGE_MS_PATTERN);
    if (ageMatch && Number.isFinite(Number(ageMatch[ONE]))) {
      ages.push(Number(ageMatch[ONE]));
      continue;
    }
    ages.push(Number.NaN);
  }

  if (staleReasonSegmentCount === ZERO &&
      normalizedReasonDetail.toLowerCase().includes(
        STALE_REPLICA_OPERATION_REASON_CODE,
      )) {
    ages.push(Number.NaN);
  }

  return ages;
}

function buildStrictPreloadNodeReasonSummary(gateResult, options = {}) {
  const reasonCodeHistogram = {};
  const staleReplicaOperationAgeBuckets = {};
  const strictReasonCodes = normalizeStrictPreloadReasonCodes(options.reasonCodes);
  const reasonHistogram = gateResult?.reasonHistogram &&
    typeof gateResult.reasonHistogram === 'object' ?
    gateResult.reasonHistogram :
    {};

  for (const [reasonText, count] of Object.entries(reasonHistogram)) {
    if (!String(reasonText).startsWith(DEFAULT_NODE_PROBE_REASON_PREFIX)) {
      continue;
    }
    const detailText = String(reasonText).slice(
      String(reasonText).indexOf(NODE_REASON_VALUE_SEPARATOR) + ONE,
    );
    const normalizedCount = Math.max(ONE, normalizeNonNegativeInteger(count));

    for (const reasonCode of collectNodeReasonCodes(detailText, strictReasonCodes)) {
      reasonCodeHistogram[reasonCode] =
        (reasonCodeHistogram[reasonCode] || ZERO) + normalizedCount;
    }

    const staleAges = collectStaleReplicaOperationAges(detailText);
    for (const staleAge of staleAges) {
      const bucket = classifyStaleAgeBucket(staleAge);
      staleReplicaOperationAgeBuckets[bucket] =
        (staleReplicaOperationAgeBuckets[bucket] || ZERO) + normalizedCount;
    }
  }

  return {
    reasonCodeHistogram,
    staleReplicaOperationAgeBuckets,
  };
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
  buildStrictPreloadNodeReasonSummary,
};
