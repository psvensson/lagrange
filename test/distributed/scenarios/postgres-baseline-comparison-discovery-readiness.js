import {POSTGRES_BASELINE_COMPARISON_BENCHMARK_TABLE_LOAD_BUNDLE} from './postgres-baseline-comparison-benchmark-table-load.js';
import {
  isNodeClientCircuitOpenError,
  truncateDiscoveryErrorMessage,
} from './postgres-baseline-comparison-discovery-runtime-helpers.js';
import {recordAdmissionRuntimeOwnership} from './postgres-baseline-comparison-admission-runtime-helpers.js';

const {
  ADMIN_QUERY_TRACE_CAPTURE_MAX_NODES,
  ADMIN_QUERY_TRACE_CAPTURE_MAX_PER_NODE,
  DEFAULT_PROBE_TIMEOUT_MS,
  DISCOVERY_ADMISSION_SOURCE,
  DISCOVERY_BENCHMARK_ADMISSION_FIELD_DEGRADED_OPERATION_IDS,
  DISCOVERY_BENCHMARK_ADMISSION_FIELD_LOCAL_REPLICA_ROLE,
  DISCOVERY_BENCHMARK_ADMISSION_FIELD_REASONS,
  DISCOVERY_BENCHMARK_ADMISSION_FIELD_ROUTING_READY,
  DISCOVERY_BENCHMARK_ADMISSION_FIELD_SCHEMA_READY,
  DISCOVERY_BENCHMARK_ADMISSION_FIELD_STATE,
  DISCOVERY_BENCHMARK_ADMISSION_FIELD_TABLE_NAME,
  DISCOVERY_BENCHMARK_ADMISSION_FIELD_TOPOLOGY_READY,
  DISCOVERY_BENCHMARK_ADMISSION_STATE_BLOCKED,
  DISCOVERY_BENCHMARK_ADMISSION_STATE_READY,
  DISCOVERY_FIELD_SERVICES,
  DISCOVERY_PROBE_REASON_ADMIN_NOT_READY,
  DISCOVERY_PROBE_REASON_LAST_ERROR_PREFIX,
  DISCOVERY_PROBE_REASON_LOAD_PROBE_FAILED,
  DISCOVERY_PROBE_REASON_PROBE_ERROR_PREFIX,
  DISCOVERY_PROBE_REASON_REACHABLE_BY_PREFIX,
  DISCOVERY_READINESS_FIELD_BENCHMARK_READY,
  DISCOVERY_READINESS_FIELD_LEADERSHIP_STABLE,
  DISCOVERY_READINESS_FIELD_REASONS,
  DISCOVERY_READINESS_FIELD_REPLICA_OPS_IN_FLIGHT,
  DISCOVERY_READINESS_FIELD_ROUTING_READY,
  DISCOVERY_READINESS_FIELD_SCHEMA_READY,
  DISCOVERY_READINESS_FIELD_TABLE_NAME,
  DISCOVERY_READINESS_FIELD_TOPOLOGY_READY,
  DISCOVERY_READINESS_FIELD_WORKLOAD_READY,
  DISCOVERY_READINESS_REASON_BENCHMARK_NOT_READY,
  DISCOVERY_READINESS_REASON_FIELD_CODE,
  DISCOVERY_READINESS_REASON_FIELD_DETAIL,
  DISCOVERY_READINESS_REASON_READINESS_MISSING,
  DISCOVERY_READINESS_REASON_ROUTING_NOT_READY,
  DISCOVERY_READINESS_REASON_SCHEMA_NOT_READY,
  DISCOVERY_READINESS_REASON_STATE_CONTRADICTION,
  DISCOVERY_READINESS_REASON_WORKLOAD_NOT_READY,
  DISCOVERY_REPLICA_FIELD_BENCHMARK_ADMISSION,
  DISCOVERY_REPLICA_FIELD_NODE_ID,
  DISCOVERY_REPLICA_FIELD_READINESS,
  DISCOVERY_SELECTION_POSTGRES_WIRE,
  DISCOVERY_SERVICE_FIELD_PROTOCOL,
  DISCOVERY_SERVICE_FIELD_REPLICAS,
  DISCOVERY_SERVICE_FIELD_SERVICE_IDS,
  DISCOVERY_SOURCE_SCOPE_TABLE_NAME_AND_ID,
  DISCOVERY_SOURCE_SCOPE_TABLE_NAME_ONLY,
  DISCOVERY_SOURCE_SCOPE_UNSCOPED,
  DISCOVERY_UNKNOWN_NODE_ID,
  NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_ID,
  NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_NAME,
  NODE_CLIENT_CHANNEL,
  NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
  NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
  NODE_CLIENT_TRANSIENT_CONTEXT,
  ZERO,
  isLoadNodeCandidate,
  normalizeTableName,
  normalizeTableId,
  sanitizeAdminQueryTraceEntry,
} = POSTGRES_BASELINE_COMPARISON_BENCHMARK_TABLE_LOAD_BUNDLE;

function collectAdminQueryTraceByNodeId(nodes) {
  const traceByNodeId = {};
  const traceNodes = Array.isArray(nodes) ?
    nodes.slice(ZERO, ADMIN_QUERY_TRACE_CAPTURE_MAX_NODES) :
    [];
  for (const node of traceNodes) {
    const nodeId =
      typeof node?.id === 'string' && node.id.length > ZERO ?
        node.id :
        DISCOVERY_UNKNOWN_NODE_ID;
    if (typeof node?.getAdminQueryTraceSnapshot !== 'function') {
      continue;
    }
    let traceSnapshot = [];
    try {
      traceSnapshot = node.getAdminQueryTraceSnapshot();
    } catch (_error) {
      continue;
    }
    if (!Array.isArray(traceSnapshot) || traceSnapshot.length === ZERO) {
      continue;
    }
    const recentTraceEntries = traceSnapshot.slice(
      -ADMIN_QUERY_TRACE_CAPTURE_MAX_PER_NODE,
    );
    traceByNodeId[nodeId] = recentTraceEntries.map((entry) =>
      sanitizeAdminQueryTraceEntry(entry, nodeId),
    );
  }
  return Object.keys(traceByNodeId).length > ZERO ? traceByNodeId : null;
}

function selectFailureDiagnosticNodes({nodes, state, failureArtifact}) {
  const allNodes = Array.isArray(nodes) ? nodes : [];
  const sutLoadNodes =
    Array.isArray(state?.sutLoadNodes) && state.sutLoadNodes.length > ZERO ?
      state.sutLoadNodes :
      [];
  const candidateNodesById = new Map();
  const addCandidateNode = (node) => {
    if (!isLoadNodeCandidate(node)) {
      return;
    }
    const nodeId = typeof node?.id === 'string' ? node.id : null;
    if (!nodeId) {
      return;
    }
    const existing = candidateNodesById.get(nodeId);
    if (!existing) {
      candidateNodesById.set(nodeId, node);
      return;
    }
    if (
      typeof existing.getAdminQueryTraceSnapshot !== 'function' &&
      typeof node.getAdminQueryTraceSnapshot === 'function'
    ) {
      candidateNodesById.set(nodeId, node);
    }
  };
  for (const node of sutLoadNodes) {
    addCandidateNode(node);
  }
  for (const node of allNodes) {
    addCandidateNode(node);
  }
  const candidateNodes = [...candidateNodesById.values()];
  const affectedNodeIds = new Set(
    Array.isArray(failureArtifact?.affectedNodeIds) ?
      failureArtifact.affectedNodeIds :
      [],
  );
  if (affectedNodeIds.size === ZERO) {
    return candidateNodes;
  }

  const affectedCandidateNodes = candidateNodes.filter((node) =>
    affectedNodeIds.has(node.id),
  );
  if (affectedCandidateNodes.length > ZERO) {
    return affectedCandidateNodes;
  }

  return allNodes.filter(
    (node) => affectedNodeIds.has(node?.id) && isLoadNodeCandidate(node),
  );
}

function uniqueSorted(values) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : []).filter(
        (value) => typeof value === 'string' && value.length > ZERO,
      ),
    ),
  ].sort();
}

function formatDiscoveryReasonEntry(reason) {
  const code =
    typeof reason?.[DISCOVERY_READINESS_REASON_FIELD_CODE] === 'string' &&
    reason[DISCOVERY_READINESS_REASON_FIELD_CODE].length > ZERO ?
      reason[DISCOVERY_READINESS_REASON_FIELD_CODE] :
      'unknown_reason';
  const detail =
    typeof reason?.[DISCOVERY_READINESS_REASON_FIELD_DETAIL] === 'string' &&
    reason[DISCOVERY_READINESS_REASON_FIELD_DETAIL].length > ZERO ?
      reason[DISCOVERY_READINESS_REASON_FIELD_DETAIL] :
      null;
  return detail ? code + '=' + detail : code;
}

function summarizeCodedDiscoveryReasons(
  rawReasons,
  defaultFallbackReason,
  options = {},
) {
  const reasons = Array.isArray(rawReasons) ? rawReasons : [];
  const fallbackReason = Object.prototype.hasOwnProperty.call(
    options,
    'fallbackReason',
  ) ?
    options.fallbackReason :
    defaultFallbackReason;
  if (reasons.length === ZERO) {
    return typeof fallbackReason === 'string' && fallbackReason.length > ZERO ?
      [fallbackReason] :
      [];
  }
  return reasons.map((reason) => formatDiscoveryReasonEntry(reason));
}

function summarizeDiscoveryReadinessReasons(readiness, options = {}) {
  return summarizeCodedDiscoveryReasons(
    readiness?.[DISCOVERY_READINESS_FIELD_REASONS],
    DISCOVERY_READINESS_REASON_WORKLOAD_NOT_READY,
    options,
  );
}

function summarizeDiscoverySelectionExclusionReasons(readiness) {
  const summarizedReasons = summarizeDiscoveryReadinessReasons(readiness, {
    fallbackReason: null,
  });
  if (summarizedReasons.length > ZERO) {
    return summarizedReasons;
  }
  const fallbackReasons = [];
  if (readiness?.[DISCOVERY_READINESS_FIELD_ROUTING_READY] !== true) {
    fallbackReasons.push(DISCOVERY_READINESS_REASON_ROUTING_NOT_READY);
  }
  if (readiness?.[DISCOVERY_READINESS_FIELD_SCHEMA_READY] !== true) {
    fallbackReasons.push(DISCOVERY_READINESS_REASON_SCHEMA_NOT_READY);
  }
  return fallbackReasons.length > ZERO ?
    fallbackReasons :
    [DISCOVERY_READINESS_REASON_READINESS_MISSING];
}

function summarizeBenchmarkAdmissionReasons(admission, options = {}) {
  return summarizeCodedDiscoveryReasons(
    admission?.[DISCOVERY_BENCHMARK_ADMISSION_FIELD_REASONS],
    DISCOVERY_READINESS_REASON_BENCHMARK_NOT_READY,
    options,
  );
}

function buildCanonicalBenchmarkAdmissionState(admission) {
  if (!admission || typeof admission !== 'object') {
    return null;
  }
  return {
    state:
      admission[DISCOVERY_BENCHMARK_ADMISSION_FIELD_STATE] ===
      DISCOVERY_BENCHMARK_ADMISSION_STATE_READY ?
        DISCOVERY_BENCHMARK_ADMISSION_STATE_READY :
        DISCOVERY_BENCHMARK_ADMISSION_STATE_BLOCKED,
    routingReady:
      admission[DISCOVERY_BENCHMARK_ADMISSION_FIELD_ROUTING_READY] === true,
    schemaReady:
      admission[DISCOVERY_BENCHMARK_ADMISSION_FIELD_SCHEMA_READY] === true,
    topologyReady:
      admission[DISCOVERY_BENCHMARK_ADMISSION_FIELD_TOPOLOGY_READY] === true,
    tableName:
      typeof admission[DISCOVERY_BENCHMARK_ADMISSION_FIELD_TABLE_NAME] ===
        'string' &&
      admission[DISCOVERY_BENCHMARK_ADMISSION_FIELD_TABLE_NAME].length > ZERO ?
        admission[DISCOVERY_BENCHMARK_ADMISSION_FIELD_TABLE_NAME] :
        null,
    localReplicaRole:
      typeof admission[
        DISCOVERY_BENCHMARK_ADMISSION_FIELD_LOCAL_REPLICA_ROLE
      ] === 'string' &&
      admission[DISCOVERY_BENCHMARK_ADMISSION_FIELD_LOCAL_REPLICA_ROLE].length >
        ZERO ?
        admission[DISCOVERY_BENCHMARK_ADMISSION_FIELD_LOCAL_REPLICA_ROLE] :
        null,
    degradedByOperationIds: uniqueSorted(
      admission[DISCOVERY_BENCHMARK_ADMISSION_FIELD_DEGRADED_OPERATION_IDS],
    ),
    admissionReasons: summarizeBenchmarkAdmissionReasons(admission, {
      fallbackReason: null,
    }),
  };
}

function evaluateDiscoveryReplicaBenchmarkAdmission(admission) {
  if (!admission || typeof admission !== 'object') {
    return null;
  }
  const admissionState = buildCanonicalBenchmarkAdmissionState(admission);
  const contradictions = [];
  if (
    admissionState.state === DISCOVERY_BENCHMARK_ADMISSION_STATE_READY &&
    (admissionState.routingReady !== true ||
      admissionState.schemaReady !== true ||
      admissionState.topologyReady !== true ||
      admissionState.admissionReasons.length > ZERO)
  ) {
    contradictions.push(DISCOVERY_READINESS_REASON_STATE_CONTRADICTION);
  }
  if (contradictions.length > ZERO) {
    return {
      ready: false,
      hasAdmission: true,
      reasons: uniqueSorted([
        ...contradictions,
        ...summarizeBenchmarkAdmissionReasons(admission),
      ]),
      admissionState,
    };
  }
  const ready =
    admissionState.state === DISCOVERY_BENCHMARK_ADMISSION_STATE_READY;
  const reasons = ready ? [] : summarizeBenchmarkAdmissionReasons(admission);
  return {
    ready,
    hasAdmission: true,
    reasons:
      reasons.length > ZERO ?
        reasons :
        [DISCOVERY_READINESS_REASON_BENCHMARK_NOT_READY],
    admissionState,
  };
}

function shouldDeferTopologyOnlyAdmissionBlocker(
  admissionEvaluation,
  options = {},
) {
  if (options.allowTopologyDeferredSelection !== true) {
    return false;
  }
  if (
    !admissionEvaluation ||
    admissionEvaluation.ready === true ||
    admissionEvaluation.hasAdmission !== true
  ) {
    return false;
  }
  const admissionState = admissionEvaluation.admissionState;
  if (!admissionState || typeof admissionState !== 'object') {
    return false;
  }
  if (
    admissionState.routingReady !== true ||
    admissionState.schemaReady !== true
  ) {
    return false;
  }
  if (admissionState.topologyReady === true) {
    return false;
  }
  const reasons = Array.isArray(admissionEvaluation.reasons) ?
    admissionEvaluation.reasons :
    [];
  return !reasons.includes(DISCOVERY_READINESS_REASON_STATE_CONTRADICTION);
}

function buildCanonicalDiscoveryReadinessState(readiness) {
  if (!readiness || typeof readiness !== 'object') {
    return null;
  }
  const replicaOpsInFlight = Number.isInteger(
    readiness[DISCOVERY_READINESS_FIELD_REPLICA_OPS_IN_FLIGHT],
  ) ?
    readiness[DISCOVERY_READINESS_FIELD_REPLICA_OPS_IN_FLIGHT] :
    null;
  const tableName =
    typeof readiness[DISCOVERY_READINESS_FIELD_TABLE_NAME] === 'string' &&
    readiness[DISCOVERY_READINESS_FIELD_TABLE_NAME].length > ZERO ?
      readiness[DISCOVERY_READINESS_FIELD_TABLE_NAME] :
      null;
  return {
    workloadReady: readiness[DISCOVERY_READINESS_FIELD_WORKLOAD_READY] === true,
    benchmarkReady:
      readiness[DISCOVERY_READINESS_FIELD_BENCHMARK_READY] === true,
    routingReady: readiness[DISCOVERY_READINESS_FIELD_ROUTING_READY] === true,
    schemaReady: readiness[DISCOVERY_READINESS_FIELD_SCHEMA_READY] === true,
    topologyReady: readiness[DISCOVERY_READINESS_FIELD_TOPOLOGY_READY] === true,
    replicaOpsInFlight,
    leadershipStable:
      readiness[DISCOVERY_READINESS_FIELD_LEADERSHIP_STABLE] === true,
    tableName,
    discoveryReasons: summarizeDiscoveryReadinessReasons(readiness, {
      fallbackReason: null,
    }),
  };
}

function hasDiscoveryReasonWithPrefixes(discoveryReasons, prefixes) {
  return discoveryReasons.some(
    (reason) =>
      typeof reason === 'string' &&
      prefixes.some((prefix) => reason.startsWith(prefix)),
  );
}

function isBenchmarkReadyContradicted(readinessState, blockers) {
  return (
    readinessState.benchmarkReady === true &&
    (readinessState.routingReady !== true ||
      readinessState.schemaReady !== true ||
      readinessState.topologyReady !== true ||
      blockers.hasTopologyBlocker ||
      blockers.hasRoutingBlocker ||
      blockers.hasSchemaBlocker)
  );
}

function isTopologyReadyContradicted(readinessState, hasTopologyBlocker) {
  return (
    readinessState.topologyReady === true &&
    (readinessState.leadershipStable !== true || hasTopologyBlocker)
  );
}

function detectDiscoveryReadinessContradictions(readinessState) {
  if (!readinessState || typeof readinessState !== 'object') {
    return [];
  }

  const contradictions = [];
  const discoveryReasons = Array.isArray(readinessState.discoveryReasons) ?
    readinessState.discoveryReasons :
    [];
  const blockers = {
    hasTopologyBlocker: hasDiscoveryReasonWithPrefixes(discoveryReasons, [
      'local_replica_not_voter_ready',
      'leadership_unstable',
      'replica_operations_in_flight',
    ]),
    hasRoutingBlocker: hasDiscoveryReasonWithPrefixes(discoveryReasons, [
      'routing_not_ready',
    ]),
    hasSchemaBlocker: hasDiscoveryReasonWithPrefixes(discoveryReasons, [
      'schema_table_missing',
      'schema_partition_unavailable',
    ]),
  };

  if (isBenchmarkReadyContradicted(readinessState, blockers)) {
    contradictions.push(DISCOVERY_READINESS_REASON_STATE_CONTRADICTION);
  }

  if (isTopologyReadyContradicted(readinessState, blockers.hasTopologyBlocker)) {
    contradictions.push(DISCOVERY_READINESS_REASON_STATE_CONTRADICTION);
  }

  return contradictions;
}

function isReplicaSelectionReady(readinessState) {
  return (
    readinessState?.routingReady === true &&
    readinessState?.schemaReady === true &&
    readinessState?.topologyReady === true
  );
}

function evaluateDiscoveryReplicaReadiness(readiness, options = {}) {
  const requireCanonicalBenchmarkReadiness =
    options.requireCanonicalBenchmarkReadiness === true;
  const allowMissingReadiness = options.allowMissingReadiness === true;
  if (!readiness || typeof readiness !== 'object') {
    return {
      ready: allowMissingReadiness,
      hasReadiness: false,
      reasons: [DISCOVERY_READINESS_REASON_READINESS_MISSING],
      readinessState: null,
    };
  }

  const readinessState = buildCanonicalDiscoveryReadinessState(readiness);
  const contradictions = detectDiscoveryReadinessContradictions(readinessState);
  if (contradictions.length > ZERO) {
    return {
      ready: false,
      hasReadiness: true,
      reasons: uniqueSorted([
        ...contradictions,
        ...summarizeDiscoverySelectionExclusionReasons(readiness),
      ]),
      readinessState,
    };
  }
  const ready = requireCanonicalBenchmarkReadiness ?
    readinessState?.benchmarkReady === true :
    isReplicaSelectionReady(readinessState);
  const reasons = ready ?
    [] :
    summarizeDiscoverySelectionExclusionReasons(readiness);

  return {
    ready,
    hasReadiness: true,
    reasons:
      reasons.length > ZERO ?
        reasons :
        [DISCOVERY_READINESS_REASON_BENCHMARK_NOT_READY],
    readinessState,
  };
}

function summarizeReadinessProbeReasons(options = {}) {
  const reasons = [];
  const errorMessage =
    typeof options.error === 'string' && options.error.length > ZERO ?
      options.error :
      null;
  if (errorMessage) {
    return [
      DISCOVERY_PROBE_REASON_PROBE_ERROR_PREFIX +
        truncateDiscoveryErrorMessage(errorMessage),
    ];
  }
  const diagnostics = options.diagnostics;
  if (!diagnostics || typeof diagnostics !== 'object') {
    return [DISCOVERY_PROBE_REASON_ADMIN_NOT_READY];
  }
  if (
    typeof diagnostics.reachableBy === 'string' &&
    diagnostics.reachableBy.length > ZERO
  ) {
    reasons.push(
      DISCOVERY_PROBE_REASON_REACHABLE_BY_PREFIX + diagnostics.reachableBy,
    );
  }
  if (
    typeof diagnostics.lastError === 'string' &&
    diagnostics.lastError.length > ZERO
  ) {
    reasons.push(
      DISCOVERY_PROBE_REASON_LAST_ERROR_PREFIX +
        truncateDiscoveryErrorMessage(diagnostics.lastError),
    );
  }
  if (reasons.length === ZERO) {
    reasons.push(DISCOVERY_PROBE_REASON_ADMIN_NOT_READY);
  }
  return reasons;
}

function resolveContextObjectOrTransient(context) {
  return context && typeof context === 'object' ?
    context :
    NODE_CLIENT_TRANSIENT_CONTEXT;
}

function resolveLocalDiscoveryContextSequence(options = {}) {
  if (
    Array.isArray(options.contextSequence) &&
    options.contextSequence.length > ZERO
  ) {
    return options.contextSequence;
  }
  return [
    {
      context: resolveContextObjectOrTransient(options.context),
    },
  ];
}

async function fetchLocalServiceDiscoverySnapshot(
  nodeClient,
  node,
  options = {},
) {
  const contextSequence = resolveLocalDiscoveryContextSequence(options);
  const nodeId = String(node?.id || '');
  for (const contextEntry of contextSequence) {
    const context = resolveContextObjectOrTransient(contextEntry?.context);
    try {
      const snapshot = await nodeClient.fetchServiceDiscovery(node, context);
      if (
        nodeId.length === ZERO ||
        discoverySnapshotHasReplicaForNodeId(snapshot, nodeId)
      ) {
        return snapshot;
      }
    } catch (_error) {
      continue;
    }
  }
  return null;
}

function discoverySnapshotHasReplicaForNodeId(snapshot, nodeId) {
  const normalizedNodeId = String(nodeId || '');
  if (normalizedNodeId.length === ZERO) {
    return false;
  }
  const services = Array.isArray(snapshot?.services) ? snapshot.services : [];
  for (const service of services) {
    const replicas = Array.isArray(service?.replicas) ? service.replicas : [];
    for (const replica of replicas) {
      if (String(replica?.nodeId || '') === normalizedNodeId) {
        return true;
      }
    }
  }
  return false;
}

function mergeDiscoveryExcludedReadinessByNodeId(base, next) {
  const merged = {
    ...(base && typeof base === 'object' ? base : {}),
  };
  const entries = next && typeof next === 'object' ? Object.entries(next) : [];
  for (const [nodeId, reasons] of entries) {
    if (!Object.prototype.hasOwnProperty.call(merged, nodeId)) {
      merged[nodeId] = [];
    }
    const normalizedReasons = Array.isArray(reasons) ?
      reasons.map((reason) => String(reason)) :
      [];
    merged[nodeId] = uniqueSorted([...merged[nodeId], ...normalizedReasons]);
  }
  return merged;
}

function resolveDiscoverySourceScope(tableName, tableId) {
  const normalizedTableName = normalizeTableName(tableName, '');
  const normalizedTableId = normalizeTableId(tableId, '');
  if (normalizedTableName.length > ZERO && normalizedTableId.length > ZERO) {
    return DISCOVERY_SOURCE_SCOPE_TABLE_NAME_AND_ID;
  }
  if (normalizedTableName.length > ZERO) {
    return DISCOVERY_SOURCE_SCOPE_TABLE_NAME_ONLY;
  }
  return DISCOVERY_SOURCE_SCOPE_UNSCOPED;
}

function buildSutLoadDiscoveryContextSequence(
  baseContext,
  discoveryTableName,
  discoveryTableId,
) {
  const normalizedBaseContext =
    baseContext && typeof baseContext === 'object' ?
      {...baseContext} :
      {...NODE_CLIENT_TRANSIENT_CONTEXT};
  const normalizedTableName = normalizeTableName(discoveryTableName, '');
  const normalizedTableId = normalizeTableId(discoveryTableId, '');
  const sequence = [];
  const seen = new Set();

  function pushContext(context) {
    const contextObject = context && typeof context === 'object' ? context : {};
    const tableName = normalizeTableName(
      contextObject[NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_NAME],
      '',
    );
    const tableId = normalizeTableId(
      contextObject[NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_ID],
      '',
    );
    const scope = resolveDiscoverySourceScope(tableName, tableId);
    const signature = [scope, tableName, tableId].join('|');
    if (seen.has(signature)) {
      return;
    }
    seen.add(signature);
    const normalizedContext = {
      ...contextObject,
    };
    if (tableName.length > ZERO) {
      normalizedContext[NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_NAME] = tableName;
    } else {
      delete normalizedContext[NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_NAME];
    }
    if (tableId.length > ZERO) {
      normalizedContext[NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_ID] = tableId;
    } else {
      delete normalizedContext[NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_ID];
    }
    sequence.push({
      context: normalizedContext,
      scope,
    });
  }

  if (normalizedTableName.length > ZERO && normalizedTableId.length > ZERO) {
    pushContext({
      ...normalizedBaseContext,
      [NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_NAME]: normalizedTableName,
      [NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_ID]: normalizedTableId,
    });
  }
  if (normalizedTableName.length > ZERO) {
    const tableNameOnlyContext = {
      ...normalizedBaseContext,
      [NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_NAME]: normalizedTableName,
    };
    delete tableNameOnlyContext[NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_ID];
    pushContext({
      ...tableNameOnlyContext,
    });
  }
  const unscopedContext = {
    ...normalizedBaseContext,
  };
  delete unscopedContext[NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_NAME];
  delete unscopedContext[NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_ID];
  pushContext(unscopedContext);
  if (sequence.length === ZERO) {
    sequence.push({
      context: {...NODE_CLIENT_TRANSIENT_CONTEXT},
      scope: DISCOVERY_SOURCE_SCOPE_UNSCOPED,
    });
  }
  return sequence;
}

function resolveReplicaAdmissionRuntimeSource(admissionEvaluation, hasReadiness) {
  if (admissionEvaluation?.hasAdmission === true) {
    return DISCOVERY_ADMISSION_SOURCE.RUNTIME;
  }
  return hasReadiness ?
    DISCOVERY_ADMISSION_SOURCE.LEGACY :
    DISCOVERY_ADMISSION_SOURCE.MISSING;
}

function findReplicaForNodeIdInSnapshot(snapshot, normalizedNodeId) {
  const services = Array.isArray(snapshot?.services) ? snapshot.services : [];
  for (const service of services) {
    const replicas = Array.isArray(service?.replicas) ? service.replicas : [];
    for (const replica of replicas) {
      if (String(replica?.nodeId || '') === normalizedNodeId) {
        return replica;
      }
    }
  }
  return null;
}

function extractLocalReplicaReadiness(snapshot, nodeId, options = {}) {
  const normalizedNodeId = String(nodeId || '');
  const replica = findReplicaForNodeIdInSnapshot(snapshot, normalizedNodeId);
  if (replica) {
    const hasReadiness = Boolean(
      replica.readiness && typeof replica.readiness === 'object',
    );
    const admissionEvaluation = evaluateDiscoveryReplicaBenchmarkAdmission(
      replica[DISCOVERY_REPLICA_FIELD_BENCHMARK_ADMISSION],
    );
    recordAdmissionRuntimeOwnership(
      options.admissionRuntimeOwnership,
      'localReplicaConfirmation',
      normalizedNodeId,
      resolveReplicaAdmissionRuntimeSource(admissionEvaluation, hasReadiness),
    );
    return {
      hasLocalReplica: true,
      requiresConfirmation:
        admissionEvaluation?.hasAdmission === true || hasReadiness,
      evaluation:
        admissionEvaluation ||
        evaluateDiscoveryReplicaReadiness(replica.readiness, {
          requireCanonicalBenchmarkReadiness: true,
          allowMissingReadiness: true,
        }),
    };
  }
  recordAdmissionRuntimeOwnership(
    options.admissionRuntimeOwnership,
    'localReplicaConfirmation',
    normalizedNodeId,
    DISCOVERY_ADMISSION_SOURCE.MISSING,
  );
  return {
    hasLocalReplica: false,
    requiresConfirmation: true,
    evaluation: {
      ready: false,
      hasReadiness: false,
      reasons: ['self_discovery_missing'],
      readinessState: null,
    },
  };
}

async function issueDirectNodeProbeQuery(
  node,
  sql,
  params = [],
  lane = NODE_CLIENT_CHANNEL.LOAD,
) {
  const normalizedParams = Array.isArray(params) ? params : [];
  if (typeof node?.queryWithTimeout === 'function') {
    return node.queryWithTimeout(sql, normalizedParams, {
      timeoutMs: DEFAULT_PROBE_TIMEOUT_MS,
      lane,
    });
  }
  if (typeof node?.query === 'function') {
    return node.query(sql, normalizedParams);
  }
  throw new Error(
    'Node handle missing direct query method(node=' +
      String(node?.id || DISCOVERY_UNKNOWN_NODE_ID) +
      ')',
  );
}

async function tryRunLoadProbe(runLoadProbe, queryFn) {
  if (typeof queryFn !== 'function') {
    return false;
  }
  try {
    await runLoadProbe(queryFn);
    return true;
  } catch (_error) {
    return false;
  }
}

async function probeLoadLaneReadiness(nodeClient, node, options = {}) {
  const issueLoadProbeQuery =
    typeof nodeClient?.queryLoadProbe === 'function' ?
      (sql, params, context) =>
        nodeClient.queryLoadProbe(node, sql, params, context) :
      (sql, params, context) =>
        nodeClient.queryLoad(node, sql, params, context);
  const issueLoadChannelProbeQuery =
    typeof nodeClient?.queryLoad === 'function' ?
      (sql, params, context) =>
        nodeClient.queryLoad(node, sql, params, context) :
      null;
  const runLoadProbe = async (queryFn) => {
    await queryFn('SELECT 1', [], NODE_CLIENT_TRANSIENT_CONTEXT);
    const tableProbeSql =
      typeof options.tableProbeSql === 'string' ? options.tableProbeSql : '';
    if (tableProbeSql.length > ZERO) {
      await queryFn(tableProbeSql, [], NODE_CLIENT_TRANSIENT_CONTEXT);
    }
  };
  try {
    await runLoadProbe(issueLoadProbeQuery);
    return {
      ready: true,
      reasons: [],
    };
  } catch (error) {
    if (await tryRunLoadProbe(runLoadProbe, issueLoadChannelProbeQuery)) {
      return {
        ready: true,
        reasons: [],
      };
    }
    if (
      isNodeClientCircuitOpenError(error) &&
      (await tryRunLoadProbe(runLoadProbe, (sql, params) =>
        issueDirectNodeProbeQuery(node, sql, params, NODE_CLIENT_CHANNEL.LOAD),
      ))
    ) {
      return {
        ready: true,
        reasons: [],
      };
    }
    return {
      ready: false,
      reasons: [
        DISCOVERY_PROBE_REASON_LOAD_PROBE_FAILED +
          ':' +
          truncateDiscoveryErrorMessage(String(error?.message || error)),
      ],
    };
  }
}

async function runFallbackReadinessDirectCheck(node) {
  if (typeof node?.getReachabilityDiagnostics === 'function') {
    const diagnostics = await node.getReachabilityDiagnostics({
      timeoutMs: DEFAULT_PROBE_TIMEOUT_MS,
      scope: 'preflight',
    });
    if (diagnostics && typeof diagnostics === 'object') {
      return diagnostics;
    }
  }
  if (typeof node?.queryWithTimeout === 'function') {
    await node.queryWithTimeout('SELECT 1', [], {
      timeoutMs: DEFAULT_PROBE_TIMEOUT_MS,
    });
  } else if (typeof node?.query === 'function') {
    await node.query('SELECT 1', []);
  } else {
    throw new Error('node_missing_query_methods');
  }
  return {
    nodeId: String(node?.id || DISCOVERY_UNKNOWN_NODE_ID),
    reachable: true,
    adminReady: true,
  };
}

async function probeReadinessWithCircuitOpenFallback(nodeClient, node) {
  try {
    return await nodeClient.probeReadiness(node);
  } catch (error) {
    try {
      return await runFallbackReadinessDirectCheck(node);
    } catch (_fallbackError) {
      throw error;
    }
  }
}

function matchesDiscoveryService(service, serviceId, protocol) {
  if (!service || typeof service !== 'object') {
    return false;
  }
  if (service[DISCOVERY_SERVICE_FIELD_PROTOCOL] !== protocol) {
    return false;
  }
  const serviceIds = Array.isArray(service[DISCOVERY_SERVICE_FIELD_SERVICE_IDS]) ?
    service[DISCOVERY_SERVICE_FIELD_SERVICE_IDS] :
    [];
  return serviceIds.includes(serviceId);
}

function evaluateServiceReplicaForDiscoverySelection(
  replica,
  nodeId,
  options = {},
) {
  const admissionEvaluation = evaluateDiscoveryReplicaBenchmarkAdmission(
    replica?.[DISCOVERY_REPLICA_FIELD_BENCHMARK_ADMISSION],
  );
  const hasReadiness = Boolean(
    replica?.[DISCOVERY_REPLICA_FIELD_READINESS] &&
      typeof replica[DISCOVERY_REPLICA_FIELD_READINESS] === 'object',
  );
  recordAdmissionRuntimeOwnership(
    options.admissionRuntimeOwnership,
    'selection',
    nodeId,
    resolveReplicaAdmissionRuntimeSource(admissionEvaluation, hasReadiness),
  );
  const readinessEvaluation =
    admissionEvaluation ||
    evaluateDiscoveryReplicaReadiness(
      replica?.[DISCOVERY_REPLICA_FIELD_READINESS],
      {
        allowMissingReadiness: true,
      },
    );
  const include =
    readinessEvaluation.ready ||
    shouldDeferTopologyOnlyAdmissionBlocker(admissionEvaluation, options);
  return {
    include,
    reasons: readinessEvaluation.reasons,
  };
}

function processDiscoveryServiceReplica({
  replica,
  seenNodeIds,
  discoveredNodeIds,
  excludedReadinessByNodeId,
  options,
}) {
  const nodeId = replica?.[DISCOVERY_REPLICA_FIELD_NODE_ID];
  if (
    typeof nodeId !== 'string' ||
    nodeId.length === ZERO ||
    seenNodeIds.has(nodeId)
  ) {
    return;
  }
  seenNodeIds.add(nodeId);
  const evaluation = evaluateServiceReplicaForDiscoverySelection(
    replica,
    nodeId,
    options,
  );
  if (evaluation.include) {
    discoveredNodeIds.push(nodeId);
  } else {
    excludedReadinessByNodeId[nodeId] = evaluation.reasons;
  }
}

function resolveServiceNodeIdsFromDiscovery(
  snapshot,
  serviceId,
  protocol,
  options = {},
) {
  const services = Array.isArray(snapshot?.[DISCOVERY_FIELD_SERVICES]) ?
    snapshot[DISCOVERY_FIELD_SERVICES] :
    [];
  const discoveredNodeIds = [];
  const excludedReadinessByNodeId = {};
  const seenNodeIds = new Set();
  for (const service of services) {
    if (!matchesDiscoveryService(service, serviceId, protocol)) {
      continue;
    }
    const serviceReplicas = Array.isArray(
      service[DISCOVERY_SERVICE_FIELD_REPLICAS],
    ) ?
      service[DISCOVERY_SERVICE_FIELD_REPLICAS] :
      [];
    for (const replica of serviceReplicas) {
      processDiscoveryServiceReplica({
        replica,
        seenNodeIds,
        discoveredNodeIds,
        excludedReadinessByNodeId,
        options,
      });
    }
  }
  return {
    nodeIds: discoveredNodeIds,
    excludedReadinessByNodeId,
  };
}

function resolveSutLoadNodeSelectionFromDiscovery(snapshot, options = {}) {
  const postgresWireSelection = resolveServiceNodeIdsFromDiscovery(
    snapshot,
    NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
    NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
    options,
  );
  if (postgresWireSelection.nodeIds.length > ZERO) {
    return {
      nodeIds: postgresWireSelection.nodeIds,
      excludedReadinessByNodeId:
        postgresWireSelection.excludedReadinessByNodeId,
      selection: DISCOVERY_SELECTION_POSTGRES_WIRE,
      serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
      protocol: NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
    };
  }

  return {
    nodeIds: [],
    excludedReadinessByNodeId: {},
    selection: null,
    serviceId: null,
    protocol: null,
  };
}

function findMatchingServiceReplicaFromDiscovery(
  snapshot,
  serviceId,
  protocol,
  nodeId,
) {
  const services = Array.isArray(snapshot?.[DISCOVERY_FIELD_SERVICES]) ?
    snapshot[DISCOVERY_FIELD_SERVICES] :
    [];
  for (const service of services) {
    if (!matchesDiscoveryService(service, serviceId, protocol)) {
      continue;
    }
    const serviceReplicas = Array.isArray(
      service[DISCOVERY_SERVICE_FIELD_REPLICAS],
    ) ?
      service[DISCOVERY_SERVICE_FIELD_REPLICAS] :
      [];
    for (const replica of serviceReplicas) {
      if (replica?.[DISCOVERY_REPLICA_FIELD_NODE_ID] === nodeId) {
        return replica;
      }
    }
  }
  return null;
}

function findServiceReplicaReadinessFromDiscovery(
  snapshot,
  serviceId,
  protocol,
  nodeId,
) {
  const replica = findMatchingServiceReplicaFromDiscovery(
    snapshot,
    serviceId,
    protocol,
    nodeId,
  );
  return replica?.[DISCOVERY_REPLICA_FIELD_READINESS] || null;
}

function findServiceReplicaBenchmarkAdmissionFromDiscovery(
  snapshot,
  serviceId,
  protocol,
  nodeId,
) {
  const replica = findMatchingServiceReplicaFromDiscovery(
    snapshot,
    serviceId,
    protocol,
    nodeId,
  );
  return replica?.[DISCOVERY_REPLICA_FIELD_BENCHMARK_ADMISSION] || null;
}

export const POSTGRES_BASELINE_COMPARISON_DISCOVERY_READINESS_BUNDLE = {
  ...POSTGRES_BASELINE_COMPARISON_BENCHMARK_TABLE_LOAD_BUNDLE,
  collectAdminQueryTraceByNodeId,
  selectFailureDiagnosticNodes,
  uniqueSorted,
  summarizeDiscoveryReadinessReasons,
  summarizeDiscoverySelectionExclusionReasons,
  summarizeBenchmarkAdmissionReasons,
  buildCanonicalBenchmarkAdmissionState,
  evaluateDiscoveryReplicaBenchmarkAdmission,
  shouldDeferTopologyOnlyAdmissionBlocker,
  buildCanonicalDiscoveryReadinessState,
  detectDiscoveryReadinessContradictions,
  evaluateDiscoveryReplicaReadiness,
  summarizeReadinessProbeReasons,
  fetchLocalServiceDiscoverySnapshot,
  discoverySnapshotHasReplicaForNodeId,
  mergeDiscoveryExcludedReadinessByNodeId,
  resolveDiscoverySourceScope,
  buildSutLoadDiscoveryContextSequence,
  extractLocalReplicaReadiness,
  probeLoadLaneReadiness,
  probeReadinessWithCircuitOpenFallback,
  resolveServiceNodeIdsFromDiscovery,
  resolveSutLoadNodeSelectionFromDiscovery,
  findServiceReplicaReadinessFromDiscovery,
  findServiceReplicaBenchmarkAdmissionFromDiscovery,
};
