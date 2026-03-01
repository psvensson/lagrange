const INVARIANT_SEVERITY = Object.freeze({
  CRITICAL: 'critical',
  ERROR: 'error',
  WARNING: 'warning',
});

const INVARIANT_SCOPE = Object.freeze({
  CLUSTER: 'cluster',
  NODE: 'node',
  PARTITION: 'partition',
  REPLICA: 'replica',
  BENCHMARK: 'benchmark',
});

const INVARIANT_EVENT = Object.freeze({
  RUNTIME: 'runtime.invariant',
});

const INVARIANT_ID = Object.freeze({
  CONTROL_PLANE_SNAPSHOT_AVAILABLE:
    'control_plane.snapshot_available',
  CONTROL_PLANE_PARTITION_LEADER_DISCOVERABLE:
    'control_plane.partition_leader_discoverable',
  CDC_RETRY_BUDGET_HEALTHY:
    'cdc.retry_budget_healthy',
  CACHE_FRESHNESS_WITHIN_WATERMARK:
    'cache.freshness_within_watermark',
  DISCOVERY_SYS_POSTGRES_WIRE_VISIBLE:
    'discovery.sys_postgres_wire_visible',
  DISCOVERY_NON_EMPTY_WITH_SERVICES_PRESENT:
    'discovery.non_empty_with_services_present',
  PARTITION_SINGLE_CANONICAL_LEADER:
    'partition.single_canonical_leader',
  REPLICA_LOCAL_ROLE_IS_STABLE_FOR_READINESS:
    'replica.local_role_is_stable_for_readiness',
  NODE_LEASE_STATE_NOT_REGRESSED:
    'node.lease_state_not_regressed',
  CDC_SUBSCRIPTION_PROGRESS_VISIBLE:
    'cdc.subscription_progress_visible',
  BENCHMARK_REQUIRED_NODES_ALL_READY:
    'benchmark.required_nodes_all_ready',
});

function freezeDefinition(definition) {
  return Object.freeze({
    ...definition,
    expected: Object.freeze({
      condition: String(definition.expected?.condition || ''),
    }),
  });
}

const INVARIANT_CATALOG = Object.freeze({
  [INVARIANT_ID.CONTROL_PLANE_SNAPSHOT_AVAILABLE]: freezeDefinition({
    id: INVARIANT_ID.CONTROL_PLANE_SNAPSHOT_AVAILABLE,
    severity: INVARIANT_SEVERITY.CRITICAL,
    scope: INVARIANT_SCOPE.CLUSTER,
    owningSubsystem: 'distributed-harness',
    defaultReasonCode: 'snapshot_missing',
    expected: {
      condition: 'all required preflight snapshots are collected',
    },
  }),
  [INVARIANT_ID.CONTROL_PLANE_PARTITION_LEADER_DISCOVERABLE]: freezeDefinition({
    id: INVARIANT_ID.CONTROL_PLANE_PARTITION_LEADER_DISCOVERABLE,
    severity: INVARIANT_SEVERITY.CRITICAL,
    scope: INVARIANT_SCOPE.PARTITION,
    owningSubsystem: 'control-plane',
    defaultReasonCode: 'leadership_unknown_control_plane_partition',
    expected: {
      condition:
        'control-plane owner rows expose a leader for every observed partition',
    },
  }),
  [INVARIANT_ID.CDC_RETRY_BUDGET_HEALTHY]: freezeDefinition({
    id: INVARIANT_ID.CDC_RETRY_BUDGET_HEALTHY,
    severity: INVARIANT_SEVERITY.CRITICAL,
    scope: INVARIANT_SCOPE.NODE,
    owningSubsystem: 'cdc',
    defaultReasonCode: 'cdc_retry_storm',
    expected: {
      condition: 'cdc retry activity remains below the configured storm threshold',
    },
  }),
  [INVARIANT_ID.CACHE_FRESHNESS_WITHIN_WATERMARK]: freezeDefinition({
    id: INVARIANT_ID.CACHE_FRESHNESS_WITHIN_WATERMARK,
    severity: INVARIANT_SEVERITY.ERROR,
    scope: INVARIANT_SCOPE.NODE,
    owningSubsystem: 'cache',
    defaultReasonCode: 'cache_stale_watermark',
    expected: {
      condition: 'cache freshness remains within the configured watermark',
    },
  }),
  [INVARIANT_ID.DISCOVERY_SYS_POSTGRES_WIRE_VISIBLE]: freezeDefinition({
    id: INVARIANT_ID.DISCOVERY_SYS_POSTGRES_WIRE_VISIBLE,
    severity: INVARIANT_SEVERITY.CRITICAL,
    scope: INVARIANT_SCOPE.NODE,
    owningSubsystem: 'discovery',
    defaultReasonCode: 'services_missing_sys_postgres_wire',
    expected: {
      condition: 'sys-postgres-wire service rows are visible before load discovery',
    },
  }),
  [INVARIANT_ID.DISCOVERY_NON_EMPTY_WITH_SERVICES_PRESENT]: freezeDefinition({
    id: INVARIANT_ID.DISCOVERY_NON_EMPTY_WITH_SERVICES_PRESENT,
    severity: INVARIANT_SEVERITY.CRITICAL,
    scope: INVARIANT_SCOPE.NODE,
    owningSubsystem: 'discovery',
    defaultReasonCode: 'discovery_empty_with_services_present',
    expected: {
      condition:
        'discovery selects at least one eligible node when service rows exist',
    },
  }),
  [INVARIANT_ID.PARTITION_SINGLE_CANONICAL_LEADER]: freezeDefinition({
    id: INVARIANT_ID.PARTITION_SINGLE_CANONICAL_LEADER,
    severity: INVARIANT_SEVERITY.CRITICAL,
    scope: INVARIANT_SCOPE.PARTITION,
    owningSubsystem: 'partition-service',
    defaultReasonCode: 'partition_leader_mismatch',
    expected: {
      condition: 'every partition resolves to exactly one canonical owner-row leader',
    },
  }),
  [INVARIANT_ID.REPLICA_LOCAL_ROLE_IS_STABLE_FOR_READINESS]: freezeDefinition({
    id: INVARIANT_ID.REPLICA_LOCAL_ROLE_IS_STABLE_FOR_READINESS,
    severity: INVARIANT_SEVERITY.CRITICAL,
    scope: INVARIANT_SCOPE.REPLICA,
    owningSubsystem: 'readiness',
    defaultReasonCode: 'local_replica_role_unstable',
    expected: {
      condition: 'replicas admitted for readiness are in stable serving roles',
    },
  }),
  [INVARIANT_ID.NODE_LEASE_STATE_NOT_REGRESSED]: freezeDefinition({
    id: INVARIANT_ID.NODE_LEASE_STATE_NOT_REGRESSED,
    severity: INVARIANT_SEVERITY.CRITICAL,
    scope: INVARIANT_SCOPE.NODE,
    owningSubsystem: 'lease-service',
    defaultReasonCode: 'lease_state_regressed',
    expected: {
      condition: 'lease and heartbeat state never regress behind newer observations',
    },
  }),
  [INVARIANT_ID.CDC_SUBSCRIPTION_PROGRESS_VISIBLE]: freezeDefinition({
    id: INVARIANT_ID.CDC_SUBSCRIPTION_PROGRESS_VISIBLE,
    severity: INVARIANT_SEVERITY.CRITICAL,
    scope: INVARIANT_SCOPE.NODE,
    owningSubsystem: 'cdc',
    defaultReasonCode: 'cdc_subscription_progress_missing',
    expected: {
      condition: 'cdc subscriptions become active and visible before readiness',
    },
  }),
  [INVARIANT_ID.BENCHMARK_REQUIRED_NODES_ALL_READY]: freezeDefinition({
    id: INVARIANT_ID.BENCHMARK_REQUIRED_NODES_ALL_READY,
    severity: INVARIANT_SEVERITY.CRITICAL,
    scope: INVARIANT_SCOPE.BENCHMARK,
    owningSubsystem: 'distributed-harness',
    defaultReasonCode: 'required_nodes_not_ready',
    expected: {
      condition:
        'all required benchmark nodes are admitted by the shared readiness evaluator',
    },
  }),
});

function clonePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }
  return {...payload};
}

function getInvariantDefinition(invariantId) {
  if (typeof invariantId !== 'string' || invariantId.length === 0) {
    return null;
  }
  return INVARIANT_CATALOG[invariantId] || null;
}

function createInvariantRecord(options = {}) {
  const definition = getInvariantDefinition(options.invariantId);
  if (!definition) {
    throw new Error(`Unknown invariant ID: ${String(options.invariantId || '')}`);
  }

  return Object.freeze({
    invariantId: definition.id,
    severity: definition.severity,
    scope: typeof options.scope === 'string' && options.scope.length > 0 ?
      options.scope :
      definition.scope,
    entityId: typeof options.entityId === 'string' && options.entityId.length > 0 ?
      options.entityId :
      null,
    owningSubsystem:
      typeof options.owningSubsystem === 'string' &&
        options.owningSubsystem.length > 0 ?
        options.owningSubsystem :
        definition.owningSubsystem,
    reasonCode:
      typeof options.reasonCode === 'string' && options.reasonCode.length > 0 ?
        options.reasonCode :
        definition.defaultReasonCode,
    passed: options.passed !== false,
    expected: clonePayload(options.expected).condition ?
      clonePayload(options.expected) :
      {...definition.expected},
    observed: clonePayload(options.observed),
    details: clonePayload(options.details),
    timestampMs: Number.isFinite(options.timestampMs) ?
      Math.floor(options.timestampMs) :
      Date.now(),
  });
}

export {
  INVARIANT_CATALOG,
  INVARIANT_EVENT,
  INVARIANT_ID,
  INVARIANT_SCOPE,
  INVARIANT_SEVERITY,
  createInvariantRecord,
  getInvariantDefinition,
};
