import {TABLES} from '../constants/index.js';


const CDC_AUTHORITY_CLASS = Object.freeze({
  CONTROL: 'control',
  USER: 'user',
});

const CDC_POLICY_CLASS = Object.freeze({
  CONTROL_INTERNAL_PROPAGATION: 'control_internal_propagation',
  CONTROL_NO_INTERNAL_PROPAGATION: 'control_no_internal_propagation',
  USER_NO_CDC: 'user_no_cdc',
});

// The typed refusal of a table policy that asks for external user-table CDC
// (owner decision D2, 2026-10-26): no external consumer path exists, so the
// request is reported unsupported at admission, never silently accepted.
const CDC_TABLE_POLICY_REFUSAL = Object.freeze({
  EXTERNAL_CDC_UNSUPPORTED: 'external_cdc_unsupported',
});
const CDC_TABLE_POLICY_REFUSAL_MSG = Object.freeze({
  EXTERNAL_CDC_UNSUPPORTED:
    'External CDC for user tables is not supported: no external CDC consumer ' +
    'path exists, so a table policy may not request externalCdcAllowed: true',
});

const CDC_BOOTSTRAP_HYDRATION_MODE = Object.freeze({
  BOOTSTRAP_ONLY: 'bootstrap_only',
  NONE: 'none',
});

function freezeTablePolicy(policy) {
  return Object.freeze({
    ...policy,
    degradedByOperationIds: Object.freeze(
      Array.isArray(policy.degradedByOperationIds) ?
        [...policy.degradedByOperationIds] :
        [],
    ),
  });
}

function createTablePolicy(tableName, policy) {
  return freezeTablePolicy({
    tableName,
    ...policy,
  });
}

const SYSTEM_TABLE_CDC_POLICIES = Object.freeze({
  [TABLES.NODES]: createTablePolicy(TABLES.NODES, {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: true,
    readinessRelevant: true,
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: false,
  }),
  [TABLES.PARTITIONS]: createTablePolicy(TABLES.PARTITIONS, {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: true,
    readinessRelevant: true,
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: false,
  }),
  [TABLES.SERVICES]: createTablePolicy(TABLES.SERVICES, {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: true,
    readinessRelevant: true,
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: false,
  }),
  [TABLES.MESSAGE_GROUPS]: createTablePolicy(TABLES.MESSAGE_GROUPS, {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: true,
    readinessRelevant: true,
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: false,
  }),
  [TABLES.TABLES]: createTablePolicy(TABLES.TABLES, {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: true,
    readinessRelevant: true,
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: false,
  }),
  [TABLES.SCHEMA_MIGRATIONS]: createTablePolicy(TABLES.SCHEMA_MIGRATIONS, {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: true,
    readinessRelevant: false,
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: false,
  }),
  [TABLES.INDICES]: createTablePolicy(TABLES.INDICES, {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: true,
    readinessRelevant: true,
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: false,
  }),
  [TABLES.NODE_ENDPOINTS]: createTablePolicy(TABLES.NODE_ENDPOINTS, {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: true,
    readinessRelevant: true,
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: false,
  }),
  // Projection/wake only. Serving grants require the authoritative row owner;
  // this table does not add a cluster-readiness dependency.
  [TABLES.SERVICE_INSTANCES]: createTablePolicy(TABLES.SERVICE_INSTANCES, {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: true,
    readinessRelevant: false,
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: false,
  }),
  [TABLES.SERVICE_DEFINITIONS]: createTablePolicy(TABLES.SERVICE_DEFINITIONS, {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: true,
    readinessRelevant: true,
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: false,
  }),
  [TABLES.SERVICE_BINDINGS]: createTablePolicy(TABLES.SERVICE_BINDINGS, {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: true,
    readinessRelevant: false,
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: false,
  }),
  [TABLES.SERVICE_ENDPOINTS]: createTablePolicy(TABLES.SERVICE_ENDPOINTS, {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: true,
    readinessRelevant: true,
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: false,
  }),
  [TABLES.REPLICA_OPERATIONS]: createTablePolicy(TABLES.REPLICA_OPERATIONS, {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: true,
    readinessRelevant: true,
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: false,
  }),
  [TABLES.STORAGE_RESERVATIONS]: createTablePolicy(
    TABLES.STORAGE_RESERVATIONS,
    {
      policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
      authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
      internalCachePropagation: true,
      readinessRelevant: true,
      bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
      externalCdcAllowed: false,
    },
  ),
  [TABLES.CONTROL_PLANE_PUBLICATIONS]: createTablePolicy(
    TABLES.CONTROL_PLANE_PUBLICATIONS,
    {
      policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
      authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
      internalCachePropagation: true,
      readinessRelevant: true,
      bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
      externalCdcAllowed: false,
    },
  ),
  [TABLES.CONFIG]: createTablePolicy(TABLES.CONFIG, {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: true,
    readinessRelevant: true,
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: false,
  }),
  [TABLES.SQL_TRANSACTIONS]: createTablePolicy(TABLES.SQL_TRANSACTIONS, {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: true,
    readinessRelevant: true,
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: false,
  }),
  [TABLES.SQL_TRANSACTION_PARTICIPANTS]: createTablePolicy(
    TABLES.SQL_TRANSACTION_PARTICIPANTS,
    {
      policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
      authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
      internalCachePropagation: true,
      readinessRelevant: true,
      bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
      externalCdcAllowed: false,
    },
  ),
  [TABLES.SQL_WRITE_OPERATIONS]: createTablePolicy(
    TABLES.SQL_WRITE_OPERATIONS,
    {
      policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
      authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
      internalCachePropagation: false,
      readinessRelevant: false,
      bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
      externalCdcAllowed: false,
    },
  ),
  [TABLES.SCHEMA_OPERATIONS]: createTablePolicy(
    TABLES.SCHEMA_OPERATIONS,
    {
      policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
      authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
      internalCachePropagation: false,
      readinessRelevant: false,
      bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
      externalCdcAllowed: false,
    },
  ),
  [TABLES.SCHEMA_MIGRATION_PARTITIONS]: createTablePolicy(
    TABLES.SCHEMA_MIGRATION_PARTITIONS,
    {
      policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
      authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
      internalCachePropagation: false,
      readinessRelevant: false,
      bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
      externalCdcAllowed: false,
    },
  ),
  [TABLES.DEBUG_SESSIONS]: createTablePolicy(TABLES.DEBUG_SESSIONS, {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: true,
    readinessRelevant: true,
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: false,
  }),
  [TABLES.LATENCY_GROUPS]: createTablePolicy(TABLES.LATENCY_GROUPS, {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: true,
    readinessRelevant: true,
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
    externalCdcAllowed: false,
  }),
  [TABLES.INTER_GROUP_LATENCIES]: createTablePolicy(
    TABLES.INTER_GROUP_LATENCIES,
    {
      policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
      authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
      internalCachePropagation: true,
      readinessRelevant: true,
      bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
      externalCdcAllowed: false,
    },
  ),
  // PLACEMENT-classified (rule 3): the runtime-service rebalancer reads the
  // aggregated attribution rows from cache to build affinity group weights.
  // Not readiness-relevant — attribution is a load signal, never a gate.
  [TABLES.SERVICE_PARTITION_ACCESS]: createTablePolicy(
    TABLES.SERVICE_PARTITION_ACCESS,
    {
      policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
      authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
      internalCachePropagation: true,
      readinessRelevant: false,
      bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
      externalCdcAllowed: false,
    },
  ),
  [TABLES.LOGS]: createTablePolicy(TABLES.LOGS, {
    policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: false,
    readinessRelevant: false,
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
    externalCdcAllowed: false,
  }),
  [TABLES.CONTEXTS]: createTablePolicy(TABLES.CONTEXTS, {
    policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: false,
    readinessRelevant: false,
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
    externalCdcAllowed: false,
  }),
  [TABLES.CODE]: createTablePolicy(TABLES.CODE, {
    policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: false,
    readinessRelevant: false,
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
    externalCdcAllowed: false,
  }),
  [TABLES.LIVE_QUERIES]: createTablePolicy(TABLES.LIVE_QUERIES, {
    policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: false,
    readinessRelevant: false,
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
    externalCdcAllowed: false,
  }),
  [TABLES.SERVICE_TIMERS]: createTablePolicy(TABLES.SERVICE_TIMERS, {
    policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: false,
    readinessRelevant: false,
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
    externalCdcAllowed: false,
  }),
  [TABLES.SERVICE_PACKAGES]: createTablePolicy(TABLES.SERVICE_PACKAGES, {
    policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: false,
    readinessRelevant: false,
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
    externalCdcAllowed: false,
  }),
  [TABLES.SERVICE_REVISIONS]: createTablePolicy(TABLES.SERVICE_REVISIONS, {
    policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: false,
    readinessRelevant: false,
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
    externalCdcAllowed: false,
  }),
  [TABLES.SERVICE_INSTALLATIONS]: createTablePolicy(
    TABLES.SERVICE_INSTALLATIONS,
    {
      policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
      authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
      internalCachePropagation: false,
      readinessRelevant: false,
      bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
      externalCdcAllowed: false,
    },
  ),
  [TABLES.SERVICE_INSTALL_FAILURES]: createTablePolicy(
    TABLES.SERVICE_INSTALL_FAILURES,
    {
      policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
      authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
      internalCachePropagation: false,
      readinessRelevant: false,
      bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
      externalCdcAllowed: false,
    },
  ),
  [TABLES.MODULE_MANIFESTS]: createTablePolicy(TABLES.MODULE_MANIFESTS, {
    policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: false,
    readinessRelevant: false,
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
    externalCdcAllowed: false,
  }),
  [TABLES.PACKAGE_REGISTRY_MAPPINGS]: createTablePolicy(
    TABLES.PACKAGE_REGISTRY_MAPPINGS,
    {
      policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
      authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
      internalCachePropagation: false,
      readinessRelevant: false,
      bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
      externalCdcAllowed: false,
    },
  ),
  [TABLES.PACKAGE_REGISTRY_OVERRIDES]: createTablePolicy(
    TABLES.PACKAGE_REGISTRY_OVERRIDES,
    {
      policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
      authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
      internalCachePropagation: false,
      readinessRelevant: false,
      bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
      externalCdcAllowed: false,
    },
  ),
  [TABLES.MODULE_DEPENDENCY_LOCKS]: createTablePolicy(
    TABLES.MODULE_DEPENDENCY_LOCKS,
    {
      policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
      authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
      internalCachePropagation: false,
      readinessRelevant: false,
      bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
      externalCdcAllowed: false,
    },
  ),
  [TABLES.WASM_OPERATIONS]: createTablePolicy(TABLES.WASM_OPERATIONS, {
    policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: false,
    readinessRelevant: false,
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
    externalCdcAllowed: false,
  }),
  [TABLES.CALL_CELL_REDUCE_SLOTS]: createTablePolicy(
    TABLES.CALL_CELL_REDUCE_SLOTS,
    {
      policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
      authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
      internalCachePropagation: false,
      readinessRelevant: false,
      bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
      externalCdcAllowed: false,
    },
  ),
  [TABLES.CALL_CELL_REDUCE_RESULTS]: createTablePolicy(
    TABLES.CALL_CELL_REDUCE_RESULTS,
    {
      policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
      authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
      internalCachePropagation: false,
      readinessRelevant: false,
      bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
      externalCdcAllowed: false,
    },
  ),
  [TABLES.CALL_ACTIVATION_LEASES]: createTablePolicy(
    TABLES.CALL_ACTIVATION_LEASES,
    {
      policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
      authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
      internalCachePropagation: true,
      readinessRelevant: false,
      bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
      externalCdcAllowed: false,
    },
  ),
  // Payload bytes must never enter the system-table cache or the CDC
  // propagation path (cluster-owned-artifacts brief, permanent
  // invariant) — both artifact payload tables are authoritative-read
  // only, no hydration, no fanout.
  [TABLES.ARTIFACT_PAYLOADS]: createTablePolicy(
    TABLES.ARTIFACT_PAYLOADS,
    {
      policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
      authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
      internalCachePropagation: false,
      readinessRelevant: false,
      bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
      externalCdcAllowed: false,
    },
  ),
  [TABLES.ARTIFACT_PAYLOAD_CHUNKS]: createTablePolicy(
    TABLES.ARTIFACT_PAYLOAD_CHUNKS,
    {
      policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
      authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
      internalCachePropagation: false,
      readinessRelevant: false,
      bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
      externalCdcAllowed: false,
    },
  ),
  [TABLES.DEBUG_BREAKPOINTS]: createTablePolicy(TABLES.DEBUG_BREAKPOINTS, {
    policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: false,
    readinessRelevant: false,
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
    externalCdcAllowed: false,
  }),
  [TABLES.DEBUG_SNAPSHOTS]: createTablePolicy(TABLES.DEBUG_SNAPSHOTS, {
    policyClass: CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: false,
    readinessRelevant: false,
    bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
    externalCdcAllowed: false,
  }),
});

// A user table carries no CDC obligation (owner decision D2, 2026-10-26):
// external user-table CDC is off until an implemented consumer path exists.
const USER_TABLE_NO_CDC_POLICY = createTablePolicy(null, {
  policyClass: CDC_POLICY_CLASS.USER_NO_CDC,
  authorityClass: CDC_AUTHORITY_CLASS.USER,
  internalCachePropagation: false,
  readinessRelevant: false,
  bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
  externalCdcAllowed: false,
});

const SYSTEM_TABLE_CDC_POLICY_LIST = Object.freeze(
  Object.values(SYSTEM_TABLE_CDC_POLICIES),
);

const CDC_PROPAGATED_TABLES = Object.freeze(
  SYSTEM_TABLE_CDC_POLICY_LIST
    .filter((policy) => policy.internalCachePropagation === true)
    .map((policy) => policy.tableName),
);

const CDC_NON_PROPAGATED_TABLES = Object.freeze(
  SYSTEM_TABLE_CDC_POLICY_LIST
    .filter((policy) => policy.internalCachePropagation !== true)
    .map((policy) => policy.tableName),
);

function isKnownSystemTable(tableName) {
  return Object.prototype.hasOwnProperty.call(
    SYSTEM_TABLE_CDC_POLICIES,
    String(tableName || ''),
  );
}

function getSystemTableCdcPolicy(tableName) {
  const normalizedTableName = String(tableName || '');
  return SYSTEM_TABLE_CDC_POLICIES[normalizedTableName] || null;
}

function getTableCdcPolicy(tableName) {
  const normalizedTableName = String(tableName || '');
  return getSystemTableCdcPolicy(normalizedTableName) ||
    createTablePolicy(normalizedTableName, USER_TABLE_NO_CDC_POLICY);
}

function isTableInternalCachePropagationEnabled(tableName) {
  return getTableCdcPolicy(tableName).internalCachePropagation === true;
}

function isTableCdcReadinessRelevant(tableName) {
  return getTableCdcPolicy(tableName).readinessRelevant === true;
}

/**
 * The one recording rule of the durable CDC obligation ledger (owner decision
 * D2): a committed write owes a CDC obligation only when its table needs
 * internal cache propagation or supports external CDC. It is a pure function
 * of the partition's table name and this static policy, so every replica of a
 * group decides alike for the same committed entry; it never reads a
 * subscriber's presence, a per-node cache or a table's stored policy JSON.
 * @param {string} tableName - The table the partition holds.
 * @return {boolean} Whether a committed write to it records an obligation.
 */
function isTableCdcObligationRecorded(tableName) {
  const policy = getTableCdcPolicy(tableName);
  return policy.internalCachePropagation === true ||
    policy.externalCdcAllowed === true;
}

/**
 * Admission of a table policy's CDC request: an explicit request for external
 * CDC (top-level or under changeDataCapture) is unsupported and refused
 * typed. An explicit false, or no CDC field, is admitted. The two admission
 * owners call it: CREATE TABLE and TablePolicyService.updateTablePolicy.
 * Known gap: a raw client `UPDATE tables SET table_policies = ...` (admin
 * WebSocket SQL -> statement dispatch -> partition-routed write) passes no
 * system-table write admission, so such a request is admitted but inert:
 * the recording rule never reads table_policies. It stays so until the
 * system-table write admission unit lands.
 * @param {Object|null} tablePolicy - The table policy to admit.
 * @return {void}
 * @throws {Error} code CDC_TABLE_POLICY_REFUSAL.EXTERNAL_CDC_UNSUPPORTED.
 */
function assertTablePolicyCdcRequestSupported(tablePolicy) {
  const requested = tablePolicy?.externalCdcAllowed === true ||
    tablePolicy?.changeDataCapture?.externalCdcAllowed === true;
  if (!requested) return;
  const error = new Error(CDC_TABLE_POLICY_REFUSAL_MSG.EXTERNAL_CDC_UNSUPPORTED);
  error.code = CDC_TABLE_POLICY_REFUSAL.EXTERNAL_CDC_UNSUPPORTED;
  throw error;
}

export {
  CDC_AUTHORITY_CLASS,
  CDC_BOOTSTRAP_HYDRATION_MODE,
  CDC_NON_PROPAGATED_TABLES,
  CDC_POLICY_CLASS,
  CDC_PROPAGATED_TABLES,
  CDC_TABLE_POLICY_REFUSAL,
  SYSTEM_TABLE_CDC_POLICIES,
  assertTablePolicyCdcRequestSupported,
  getSystemTableCdcPolicy,
  getTableCdcPolicy,
  isKnownSystemTable,
  isTableCdcObligationRecorded,
  isTableCdcReadinessRelevant,
  isTableInternalCachePropagationEnabled,
};
