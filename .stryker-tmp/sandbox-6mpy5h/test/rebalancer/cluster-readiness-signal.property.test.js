/**
 * Property Tests: Cluster Readiness Signal Evaluation
 *
 * Feature: bootstrap-lifecycle-hardening, Property 9: Cluster
 * readiness signal evaluation
 * **Validates: Requirements 4.2**
 *
 * *For any* combination of the three cluster readiness conditions
 * (CDC pipeline ready, expected nodes registered with ACTIVE status,
 * cache hydrated for all CDC-propagated tables), the
 * ClusterReadinessSignal SHALL report `ready: true` if and only if
 * all three conditions are true, and `unmetConditions` SHALL contain
 * exactly the names of the conditions that are false.
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {ClusterReadinessSignal} from
  '../../src/rebalancer/cluster-readiness-signal.js';
import {
  CLUSTER_READINESS_CONDITION,
} from '../../src/constants/cdc-lifecycle-constants.js';
import {CDC_PROPAGATED_TABLES} from '../../src/cache/cache-constants.js';
import {COLUMN} from '../../src/constants/columns.js';
import {TABLES} from '../../src/constants/tables.js';
import {NODE_STATE} from '../../src/constants/node-state.js';

const EXPECTED_NODE_COUNT = 1;

/**
 * Create a CDCPipelineReadinessGate stub that returns a fixed result.
 * @param {boolean} ready
 * @return {Object}
 */
function createGateStub(ready) {
  return {
    evaluate(_context) {
      return {ready, unmetConditions: ready ? [] : ['stubCondition']};
    },
  };
}

/**
 * Create a SystemTableCache stub.
 *
 * @param {boolean} nodesRegistered — whether enough ACTIVE nodes exist
 * @param {boolean} cacheHydrated — whether all CDC-propagated tables
 *   have at least one record
 * @return {Object}
 */
function createCacheStub(nodesRegistered, cacheHydrated) {
  return {
    filter(tableName, predicate) {
      if (tableName === TABLES.NODES && nodesRegistered) {
        const node = {[COLUMN.STATUS]: NODE_STATE.ACTIVE};
        return predicate(node) ? [node] : [];
      }
      return [];
    },
    getAll(tableName) {
      if (cacheHydrated && CDC_PROPAGATED_TABLES.includes(tableName)) {
        return [{id: 'stub'}];
      }
      return [];
    },
  };
}

/**
 * Generates all 8 boolean triples for the three readiness conditions.
 */
const conditionTripleArb = fc.record({
  cdcPipelineReady: fc.boolean(),
  nodesRegistered: fc.boolean(),
  cacheHydrated: fc.boolean(),
});

test(
  'Feature: bootstrap-lifecycle-hardening, ' +
  'Property 9: Cluster readiness signal evaluation',
  async (t) => {
    /**
     * **Validates: Requirements 4.2**
     */
    t.test(
      'ready iff all three conditions true, unmetConditions ' +
      'contains exactly the false condition names',
      async () => {
        await fc.assert(
          fc.property(
            conditionTripleArb,
            ({cdcPipelineReady, nodesRegistered, cacheHydrated}) => {
              const signal = new ClusterReadinessSignal({
                cdcPipelineReadinessGate: createGateStub(
                  cdcPipelineReady
                ),
                systemTableCache: createCacheStub(
                  nodesRegistered,
                  cacheHydrated
                ),
                expectedNodeCount: EXPECTED_NODE_COUNT,
              });

              const result = signal.evaluate({
                partitionServices: new Map(),
                messageGroupServices: new Map(),
              });

              // ready iff all three true
              const allTrue =
                cdcPipelineReady &&
                nodesRegistered &&
                cacheHydrated;
              if (result.ready !== allTrue) return false;

              // Build expected unmet set
              const expectedUnmet = new Set();
              if (!cdcPipelineReady) {
                expectedUnmet.add(
                  CLUSTER_READINESS_CONDITION.CDC_PIPELINE_READY
                );
              }
              if (!nodesRegistered) {
                expectedUnmet.add(
                  CLUSTER_READINESS_CONDITION.NODES_REGISTERED
                );
              }
              if (!cacheHydrated) {
                expectedUnmet.add(
                  CLUSTER_READINESS_CONDITION.CACHE_HYDRATED
                );
              }

              const actualUnmet = new Set(result.unmetConditions);
              if (actualUnmet.size !== expectedUnmet.size) return false;
              for (const c of expectedUnmet) {
                if (!actualUnmet.has(c)) return false;
              }

              return true;
            },
          ),
          {numRuns: 10},
        );
      },
    );
  },
);
