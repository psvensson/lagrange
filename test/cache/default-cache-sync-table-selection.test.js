/**
 * Tests for CDC propagation table classification.
 *
 * Validates the invariants of the propagated/non-propagated split:
 * - Every TABLES constant appears in exactly one classification list
 * - The union of both lists equals CACHE_SYSTEM_TABLES
 * - Topology tables are propagated; operational tables are not
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  CACHE_HYDRATION_TABLES,
  CACHE_SYSTEM_TABLES,
  CDC_PROPAGATED_TABLES,
  CDC_NON_PROPAGATED_TABLES,
} from '../../src/cache/cache-constants.js';
import {
  CDC_AUTHORITY_CLASS,
  CDC_BOOTSTRAP_HYDRATION_MODE,
  CDC_POLICY_CLASS,
  getSystemTableCdcPolicy,
  getTableCdcPolicy,
  isExternalCdcAllowedForTable,
  isTableCdcReadinessRelevant,
  isTableInternalCachePropagationEnabled,
} from '../../src/cache/cdc-table-policy.js';
import {TABLES} from '../../src/constants/index.js';

// --- structural invariants ---

test('propagated + non-propagated equals CACHE_SYSTEM_TABLES', async (t) => {
  const union = [...CDC_PROPAGATED_TABLES, ...CDC_NON_PROPAGATED_TABLES];
  t.equal(
    union.length,
    CACHE_SYSTEM_TABLES.length,
    'combined length must match CACHE_SYSTEM_TABLES',
  );
  for (const table of CACHE_SYSTEM_TABLES) {
    t.ok(union.includes(table), `${table} must appear in union`);
  }
});

test('no table appears in both propagated and non-propagated', async (t) => {
  for (const table of CDC_PROPAGATED_TABLES) {
    t.notOk(
      CDC_NON_PROPAGATED_TABLES.includes(table),
      `${table} must not be in both lists`,
    );
  }
});

test('every TABLES constant is classified', async (t) => {
  for (const table of Object.values(TABLES)) {
    t.ok(
      CACHE_SYSTEM_TABLES.includes(table),
      `${table} must be in CACHE_SYSTEM_TABLES`,
    );
  }
});

test('CACHE_HYDRATION_TABLES equals CDC_PROPAGATED_TABLES', async (t) => {
  t.equal(CACHE_HYDRATION_TABLES.length, CDC_PROPAGATED_TABLES.length);
  for (const table of CDC_PROPAGATED_TABLES) {
    t.ok(CACHE_HYDRATION_TABLES.includes(table));
  }
});

// --- propagated tables (topology/routing/placement/config) ---

test('core topology tables are propagated', async (t) => {
  const expected = [
    TABLES.NODES,
    TABLES.PARTITIONS,
    TABLES.SERVICES,
    TABLES.MESSAGE_GROUPS,
    TABLES.TABLES,
    TABLES.INDICES,
    TABLES.CONFIG,
    TABLES.REPLICA_OPERATIONS,
    TABLES.NODE_ENDPOINTS,
    TABLES.SERVICE_DEFINITIONS,
    TABLES.SERVICE_ENDPOINTS,
    TABLES.DEBUG_SESSIONS,
    TABLES.STORAGE_RESERVATIONS,
    TABLES.LATENCY_GROUPS,
    TABLES.INTER_GROUP_LATENCIES,
  ];
  for (const table of expected) {
    t.ok(
      CDC_PROPAGATED_TABLES.includes(table),
      `${table} should be CDC-propagated`,
    );
  }
});

// --- non-propagated tables (operational/transient/service-scoped) ---

test('high-cardinality and service-scoped tables are non-propagated',
  async (t) => {
    const expected = [
      TABLES.LOGS,
      TABLES.CONTEXTS,
      TABLES.CODE,
      TABLES.LIVE_QUERIES,
      TABLES.SQL_WRITE_OPERATIONS,
      TABLES.SERVICE_TIMERS,
      TABLES.MODULE_MANIFESTS,
      TABLES.PACKAGE_REGISTRY_MAPPINGS,
      TABLES.PACKAGE_REGISTRY_OVERRIDES,
      TABLES.MODULE_DEPENDENCY_LOCKS,
      TABLES.WASM_OPERATIONS,
      TABLES.DEBUG_BREAKPOINTS,
      TABLES.DEBUG_SNAPSHOTS,
    ];
    for (const table of expected) {
      t.ok(
        CDC_NON_PROPAGATED_TABLES.includes(table),
        `${table} should be non-propagated`,
      );
      t.notOk(
        CACHE_HYDRATION_TABLES.includes(table),
        `${table} should not be in hydration tables`,
      );
    }
  });

// --- backward compat: logs stays a valid system table ---

test('logs remains a recognized system table for explicit queries',
  async (t) => {
    t.ok(CACHE_SYSTEM_TABLES.includes(TABLES.LOGS));
  });

test('system-table CDC policy registry classifies control-plane tables explicitly',
  async (t) => {
    const servicesPolicy = getSystemTableCdcPolicy(TABLES.SERVICES);
    t.equal(
      servicesPolicy?.policyClass,
      CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION,
      'services should use control internal propagation policy',
    );
    t.equal(
      servicesPolicy?.authorityClass,
      CDC_AUTHORITY_CLASS.CONTROL,
      'services should remain control-plane metadata',
    );
    t.equal(
      servicesPolicy?.internalCachePropagation,
      true,
      'services should propagate into the system cache',
    );
    t.equal(
      servicesPolicy?.readinessRelevant,
      true,
      'services should participate in readiness logic',
    );
    t.equal(
      servicesPolicy?.bootstrapHydrationMode,
      CDC_BOOTSTRAP_HYDRATION_MODE.BOOTSTRAP_ONLY,
      'services should only hydrate through bootstrap snapshot flow',
    );
    t.equal(
      isExternalCdcAllowedForTable(TABLES.SERVICES),
      false,
      'system services metadata should not be treated as client CDC by default',
    );
  });

test('system-table CDC policy registry classifies control tables without propagation',
  async (t) => {
    const logsPolicy = getSystemTableCdcPolicy(TABLES.LOGS);
    t.equal(
      logsPolicy?.policyClass,
      CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
      'logs should stay control metadata without internal propagation',
    );
    t.equal(
      logsPolicy?.internalCachePropagation,
      false,
      'logs should not hydrate into every node cache',
    );
    t.equal(
      logsPolicy?.readinessRelevant,
      false,
      'logs should not influence discovery readiness',
    );
    t.equal(
      logsPolicy?.bootstrapHydrationMode,
      CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
      'logs should not participate in bootstrap hydration snapshots',
    );
  });

test('sql_write_operations stays out of internal propagation and readiness',
  async (t) => {
    const writeOperationsPolicy = getSystemTableCdcPolicy(
      TABLES.SQL_WRITE_OPERATIONS,
    );
    t.equal(
      writeOperationsPolicy?.policyClass,
      CDC_POLICY_CLASS.CONTROL_NO_INTERNAL_PROPAGATION,
      'sql_write_operations should remain a non-propagated control table',
    );
    t.equal(
      writeOperationsPolicy?.internalCachePropagation,
      false,
      'sql_write_operations should not hydrate into every node cache',
    );
    t.equal(
      writeOperationsPolicy?.readinessRelevant,
      false,
      'sql_write_operations should not influence discovery readiness',
    );
    t.equal(
      writeOperationsPolicy?.bootstrapHydrationMode,
      CDC_BOOTSTRAP_HYDRATION_MODE.NONE,
      'sql_write_operations should not participate in bootstrap hydration',
    );
    t.equal(
      isTableInternalCachePropagationEnabled(TABLES.SQL_WRITE_OPERATIONS),
      false,
      'sql_write_operations should skip internal cache propagation',
    );
    t.equal(
      isTableCdcReadinessRelevant(TABLES.SQL_WRITE_OPERATIONS),
      false,
      'sql_write_operations should stay out of CDC readiness checks',
    );
    t.notOk(
      CACHE_HYDRATION_TABLES.includes(TABLES.SQL_WRITE_OPERATIONS),
      'sql_write_operations should be absent from hydration tables',
    );
  });

test('user tables default to user CDC policy without control-plane readiness',
  async (t) => {
    const benchmarkPolicy = getTableCdcPolicy('benchmark_events');
    t.equal(
      benchmarkPolicy?.policyClass,
      CDC_POLICY_CLASS.USER_EXTERNAL_CDC,
      'benchmark_events should default to user CDC policy',
    );
    t.equal(
      benchmarkPolicy?.authorityClass,
      CDC_AUTHORITY_CLASS.USER,
      'benchmark_events should be classified as user data',
    );
    t.equal(
      benchmarkPolicy?.internalCachePropagation,
      false,
      'user tables should not enter internal cache propagation by default',
    );
    t.equal(
      isTableCdcReadinessRelevant('benchmark_events'),
      false,
      'user tables should not affect control-plane readiness by default',
    );
    t.equal(
      isTableInternalCachePropagationEnabled('benchmark_events'),
      false,
      'user tables should not hydrate into the system cache by default',
    );
    t.equal(
      isExternalCdcAllowedForTable('benchmark_events'),
      true,
      'user tables should remain eligible for shared CDC delivery',
    );
  });
