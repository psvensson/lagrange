import {TABLES} from '../constants/index.js';

const CDC_AUTHORITY_CLASS = Object.freeze({
  CONTROL: 'control',
  USER: 'user',
});

const CDC_POLICY_CLASS = Object.freeze({
  CONTROL_INTERNAL_PROPAGATION: 'control_internal_propagation',
  CONTROL_NO_INTERNAL_PROPAGATION: 'control_no_internal_propagation',
  USER_EXTERNAL_CDC: 'user_external_cdc',
  USER_NO_CDC: 'user_no_cdc',
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
  [TABLES.SERVICE_DEFINITIONS]: createTablePolicy(TABLES.SERVICE_DEFINITIONS, {
    policyClass: CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
    authorityClass: CDC_AUTHORITY_CLASS.CONTROL,
    internalCachePropagation: true,
    readinessRelevant: true,
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

const USER_TABLE_EXTERNAL_CDC_POLICY = createTablePolicy(null, {
  policyClass: CDC_POLICY_CLASS.USER_EXTERNAL_CDC,
  authorityClass: CDC_AUTHORITY_CLASS.USER,
  internalCachePropagation: false,
  readinessRelevant: false,
  bootstrapHydrationMode: CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
  externalCdcAllowed: true,
});

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

function getTableCdcPolicy(tableName, options = {}) {
  const normalizedTableName = String(tableName || '');
  const systemTablePolicy = getSystemTableCdcPolicy(normalizedTableName);
  if (systemTablePolicy) {
    return systemTablePolicy;
  }
  if (options.externalCdcAllowed === false) {
    return createTablePolicy(normalizedTableName, USER_TABLE_NO_CDC_POLICY);
  }
  return createTablePolicy(normalizedTableName, USER_TABLE_EXTERNAL_CDC_POLICY);
}

function isTableInternalCachePropagationEnabled(tableName, options = {}) {
  return getTableCdcPolicy(tableName, options)?.internalCachePropagation === true;
}

function isTableCdcReadinessRelevant(tableName, options = {}) {
  return getTableCdcPolicy(tableName, options)?.readinessRelevant === true;
}

function isExternalCdcAllowedForTable(tableName, options = {}) {
  return getTableCdcPolicy(tableName, options)?.externalCdcAllowed === true;
}

export {
  CDC_AUTHORITY_CLASS,
  CDC_BOOTSTRAP_HYDRATION_MODE,
  CDC_NON_PROPAGATED_TABLES,
  CDC_POLICY_CLASS,
  CDC_PROPAGATED_TABLES,
  SYSTEM_TABLE_CDC_POLICIES,
  getSystemTableCdcPolicy,
  getTableCdcPolicy,
  isExternalCdcAllowedForTable,
  isKnownSystemTable,
  isTableCdcReadinessRelevant,
  isTableInternalCachePropagationEnabled,
};
