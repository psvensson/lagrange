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
