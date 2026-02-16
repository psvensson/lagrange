/**
 * PG wire test matrix index.
 *
 * Documents all test files covering the sys-postgres-wire replicated
 * system service. Used by shard scripts and CI to enumerate PG wire
 * test coverage.
 *
 * Categories:
 *   UNIT        — fast, isolated, no cluster infrastructure
 *   INTEGRATION — requires cluster bootstrap or multi-node setup
 *   COMPAT      — requires real PG client binaries (psql, pg)
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4
 */

/**
 * Category labels for test classification.
 * @enum {string}
 */
const PGWIRE_TEST_CATEGORY = Object.freeze({
  UNIT: 'unit',
  INTEGRATION: 'integration',
  COMPAT: 'compat',
});

/**
 * Complete test matrix for sys-postgres-wire coverage.
 *
 * Each entry maps a file path to its category and the spec
 * requirements it validates.
 *
 * @type {ReadonlyArray<Readonly<{
 *   file: string,
 *   category: string,
 *   requirements: ReadonlyArray<string>,
 * }>>}
 */
const PGWIRE_TEST_MATRIX = Object.freeze([
  // --- Constants (Task 1) ---
  Object.freeze({
    file: 'test/constants/pgwire-constants.test.js',
    category: PGWIRE_TEST_CATEGORY.UNIT,
    requirements: Object.freeze(['1.1', '6.1', '12.1']),
  }),

  // --- Bootstrap registration (Task 2) ---
  Object.freeze({
    file:
      'test/bootstrap/shared/meta-service-definition-registration.test.js',
    category: PGWIRE_TEST_CATEGORY.UNIT,
    requirements: Object.freeze(['1.1', '1.2', '1.4', '11.1']),
  }),

  // --- Descriptor validation (Task 3) ---
  Object.freeze({
    file: 'test/runtime/pgwire-descriptor.test.js',
    category: PGWIRE_TEST_CATEGORY.UNIT,
    requirements: Object.freeze(['2.4', '7.1', '10.1']),
  }),

  // --- Runtime module lifecycle (Task 4) ---
  Object.freeze({
    file: 'test/runtime/pgwire-runtime-module.test.js',
    category: PGWIRE_TEST_CATEGORY.UNIT,
    requirements: Object.freeze(['2.1', '6.1', '7.1', '9.1']),
  }),

  // --- Native JS driver lifecycle (Task 5) ---
  Object.freeze({
    file: 'test/runtime/native-js-driver-lifecycle.test.js',
    category: PGWIRE_TEST_CATEGORY.UNIT,
    requirements: Object.freeze(['2.2', '2.4', '9.4']),
  }),

  // --- State projection (Task 6) ---
  Object.freeze({
    file: 'test/runtime/state-projection.test.js',
    category: PGWIRE_TEST_CATEGORY.UNIT,
    requirements: Object.freeze(['5.1', '5.2', '5.4', '13.1']),
  }),

  // --- Endpoint publication (Task 7) ---
  Object.freeze({
    file: 'test/runtime/runtime-endpoint-writer.test.js',
    category: PGWIRE_TEST_CATEGORY.UNIT,
    requirements: Object.freeze(['6.1', '6.2', '6.3', '6.4']),
  }),
  Object.freeze({
    file: 'test/runtime/endpoint-lifecycle.test.js',
    category: PGWIRE_TEST_CATEGORY.UNIT,
    requirements: Object.freeze(['6.1', '6.2', '6.3', '6.4']),
  }),

  // --- Rebalancer entity support (Task 8) ---
  Object.freeze({
    file: 'test/rebalancer/runtime-service-entity.test.js',
    category: PGWIRE_TEST_CATEGORY.UNIT,
    requirements: Object.freeze(['3.2', '4.1', '4.2', '4.3']),
  }),

  // --- Move planning (Task 9) ---
  Object.freeze({
    file: 'test/rebalancer/move-planner-runtime-service.test.js',
    category: PGWIRE_TEST_CATEGORY.UNIT,
    requirements: Object.freeze(['3.1', '3.3', '4.4']),
  }),

  // --- Startup safety gate (Task 11) ---
  Object.freeze({
    file: 'test/bootstrap/pgwire-startup-safety-gate.test.js',
    category: PGWIRE_TEST_CATEGORY.UNIT,
    requirements:
      Object.freeze(['11.1', '11.2', '11.3', '11.4']),
  }),

  // --- Protocol handler (Task 12) ---
  Object.freeze({
    file: 'test/runtime/pgwire-protocol-handler.test.js',
    category: PGWIRE_TEST_CATEGORY.UNIT,
    requirements: Object.freeze(['8.1', '9.1', '9.4', '10.1']),
  }),
  Object.freeze({
    file: 'test/runtime/pgwire-session.test.js',
    category: PGWIRE_TEST_CATEGORY.UNIT,
    requirements: Object.freeze(['8.1', '8.2', '8.3', '8.4']),
  }),

  // --- Authentication (Task 13) ---
  Object.freeze({
    file: 'test/runtime/pgwire-auth-handler.test.js',
    category: PGWIRE_TEST_CATEGORY.UNIT,
    requirements:
      Object.freeze(['10.1', '10.2', '10.3', '10.4']),
  }),

  // --- Port allocation (Task 14) ---
  Object.freeze({
    file: 'test/runtime/pgwire-port-allocator.test.js',
    category: PGWIRE_TEST_CATEGORY.UNIT,
    requirements: Object.freeze(['7.1', '7.2', '7.3', '7.4']),
  }),

  // --- Metrics (Task 15) ---
  Object.freeze({
    file: 'test/runtime/pgwire-metrics.test.js',
    category: PGWIRE_TEST_CATEGORY.UNIT,
    requirements: Object.freeze(['12.1', '12.2', '12.4']),
  }),

  // --- Admin UX (Task 16) ---
  Object.freeze({
    file: 'test/admin/admin-runtime-service-views.test.js',
    category: PGWIRE_TEST_CATEGORY.UNIT,
    requirements:
      Object.freeze(['13.1', '13.2', '13.3', '13.4']),
  }),

  // --- Integration: bootstrap / join (Task 17) ---
  Object.freeze({
    file:
      'test/integration/pgwire-bootstrap.integration.test.js',
    category: PGWIRE_TEST_CATEGORY.INTEGRATION,
    requirements: Object.freeze(['15.2']),
  }),

  // --- Integration: scale / failover / rebalance (Task 17) ---
  Object.freeze({
    file:
      'test/integration/pgwire-rebalance.integration.test.js',
    category: PGWIRE_TEST_CATEGORY.INTEGRATION,
    requirements: Object.freeze(['15.2']),
  }),

  // --- Client compatibility (Task 17) ---
  Object.freeze({
    file: 'test/compatibility/pgwire-client-compat.test.js',
    category: PGWIRE_TEST_CATEGORY.COMPAT,
    requirements: Object.freeze(['15.3']),
  }),
]);

/**
 * Return file paths for a given category.
 * @param {string} category - One of PGWIRE_TEST_CATEGORY values.
 * @return {string[]} Matching file paths.
 */
function filesByCategory(category) {
  return PGWIRE_TEST_MATRIX
    .filter((e) => e.category === category)
    .map((e) => e.file);
}

export {
  PGWIRE_TEST_CATEGORY,
  PGWIRE_TEST_MATRIX,
  filesByCategory,
};
