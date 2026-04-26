/**
 * Preservation E — Single Mutations and Per-Operation Single-Flight
 *
 * Property 2 (Preservation): For all single (non-concurrent)
 * replica_operations mutations, the mutation completes successfully
 * without additional serialization overhead. Per-operation
 * single-flight keys continue to prevent concurrent reconciliation
 * of the same operation.
 *
 * These tests MUST PASS on UNFIXED code — they capture baseline
 * behavior that must remain unchanged after the fix.
 *
 * **Validates: Requirements 3.8, 3.9**
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import assert from 'node:assert/strict';
import {NUM} from '../../src/constants/index.js';
import {
  RebalanceCoordinator,
} from '../../src/rebalancer/rebalance-coordinator.js';

const COORDINATOR_NODE_ID = 'coordinator-pres-node';

/**
 * Create a minimal RebalanceCoordinator for serialization tests.
 * @return {RebalanceCoordinator} Coordinator instance.
 */
function createCoordinator() {
  return new RebalanceCoordinator({
    nodeId: COORDINATOR_NODE_ID,
    systemTableCache: {
      getAll: () => [],
    },
    cdcIntegrationService: {},
    messageRouter: {},
    tablePolicyService: {},
    sqlQueryEngine: {
      executeQuery: async () => ({success: true, rows: []}),
    },
  });
}

test('Property 2 Preservation E: ' +
  'single (non-concurrent) replica_operations mutations execute ' +
  'successfully without additional serialization overhead ' +
  '(uses runReplicaOperationTransitionExclusive owner path)',
async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 1, max: 5}),
      async (mutationCount) => {
        const coordinator = createCoordinator();
        const results = [];

        for (let i = NUM.ZERO; i < mutationCount; i++) {
          const result = await coordinator
            .runReplicaOperationTransitionExclusive(
              async () => {
                return {
                  success: true,
                  mutationIndex: i,
                };
              },
            );
          results.push(result);
        }

        // Preservation: each single mutation completes
        // successfully with the correct result.
        assert.equal(
          results.length,
          mutationCount,
          `Expected ${mutationCount} results, got ` +
          `${results.length}`,
        );

        for (let i = NUM.ZERO; i < results.length; i++) {
          assert.equal(
            results[i].success,
            true,
            `Mutation ${i} should succeed`,
          );
          assert.equal(
            results[i].mutationIndex,
            i,
            `Mutation ${i} should have correct index`,
          );
        }
      },
    ),
    {numRuns: 10},
  );
  t.end();
});

test('Property 2 Preservation E: ' +
  'per-operation single-flight keys prevent concurrent ' +
  'reconciliation of the same operation ' +
  '(uses getOperationOwnerSingleFlightKey owner path)',
async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.stringMatching(/^op-[a-z0-9]{1,8}$/),
      fc.stringMatching(/^op-[a-z0-9]{1,8}$/),
      async (opIdA, opIdB) => {
        fc.pre(opIdA !== opIdB);
        const coordinator = createCoordinator();

        const keyA = coordinator
          .getOperationOwnerSingleFlightKey(opIdA);
        const keyB = coordinator
          .getOperationOwnerSingleFlightKey(opIdB);

        // Preservation: different operation IDs produce
        // different single-flight keys.
        assert.notEqual(
          keyA,
          keyB,
          `Single-flight keys for '${opIdA}' and '${opIdB}' ` +
          `should differ, but both are '${keyA}'`,
        );

        // Same operation ID produces the same key.
        const keyA2 = coordinator
          .getOperationOwnerSingleFlightKey(opIdA);
        assert.equal(
          keyA,
          keyA2,
          `Single-flight key for '${opIdA}' should be ` +
          'deterministic',
        );
      },
    ),
    {numRuns: 10},
  );
  t.end();
});

test('Property 2 Preservation E: ' +
  'runReplicaOperationTransitionExclusive serializes concurrent ' +
  'mutations sequentially ' +
  '(uses runReplicaOperationTransitionExclusive owner path)',
async (t) => {
  const coordinator = createCoordinator();
  const executionOrder = [];

  const p1 = coordinator
    .runReplicaOperationTransitionExclusive(async () => {
      executionOrder.push('first-start');
      await new Promise((resolve) => setTimeout(resolve, 5));
      executionOrder.push('first-end');
      return 'first';
    });
  const p2 = coordinator
    .runReplicaOperationTransitionExclusive(async () => {
      executionOrder.push('second-start');
      return 'second';
    });

  const [r1, r2] = await Promise.all([p1, p2]);

  // Preservation: mutations are serialized — second starts only
  // after first completes.
  assert.equal(
    r1,
    'first',
    'First mutation should return its result',
  );
  assert.equal(
    r2,
    'second',
    'Second mutation should return its result',
  );
  assert.equal(
    executionOrder[NUM.ZERO],
    'first-start',
    'First mutation should start first',
  );
  assert.equal(
    executionOrder[NUM.ONE],
    'first-end',
    'First mutation should end before second starts',
  );
  assert.equal(
    executionOrder[NUM.TWO],
    'second-start',
    'Second mutation should start after first ends',
  );
  t.end();
});
