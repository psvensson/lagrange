/**
 * Preservation E — Single Mutations and Per-Operation Single-Flight
 *
 * Property 2 (Preservation): For all single (non-concurrent)
 * replica_operations mutations, the mutation completes successfully
 * without additional serialization overhead. Per-operation
 * single-flight keys continue to prevent concurrent reconciliation
 * of the same operation.
 *
 * Different operation IDs may progress independently, while the same stable
 * operation identity remains the transition serialization boundary.
 *
 * **Validates: Requirements 3.8, 3.9**
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import assert from 'node:assert/strict';
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

        for (let i = 0; i < mutationCount; i++) {
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

        for (let i = 0; i < results.length; i++) {
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
  'runReplicaOperationTransitionExclusive lets distinct operation ' +
  'mutations overlap ' +
  '(uses runReplicaOperationTransitionExclusive owner path)',
async (t) => {
  const coordinator = createCoordinator();
  const executionOrder = [];
  let releaseFirstMutation;
  const firstMutationBlocked = new Promise((resolve) => {
    releaseFirstMutation = resolve;
  });

  const p1 = coordinator
    .runReplicaOperationTransitionExclusive(
      async () => {
        executionOrder.push('first-start');
        await firstMutationBlocked;
        executionOrder.push('first-end');
        return 'first';
      },
      {
        operation: {
          operationId: 'operation-first',
          partitionId: 'user-data-p17',
        },
      },
    );
  await new Promise((resolve) => setImmediate(resolve));
  const p2 = coordinator
    .runReplicaOperationTransitionExclusive(
      async () => {
        executionOrder.push('second-start');
        return 'second';
      },
      {
        operation: {
          operationId: 'operation-second',
          partitionId: 'user-data-p17',
        },
      },
    );

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    executionOrder,
    ['first-start', 'second-start'],
    'a distinct operation starts before the first operation is released',
  );
  releaseFirstMutation();

  const [r1, r2] = await Promise.all([p1, p2]);

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
    executionOrder[0],
    'first-start',
    'First mutation should start first',
  );
  assert.equal(
    executionOrder[1],
    'second-start',
    'Second operation should start independently',
  );
  assert.equal(
    executionOrder[2],
    'first-end',
    'First mutation should end after its explicit release',
  );
  t.end();
});
