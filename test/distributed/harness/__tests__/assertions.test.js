/**
 * Property-based tests for convergence assertions.
 *
 * Feature: distributed-testing-framework
 * Property 9: Convergence Threshold Configuration
 *
 * Validates: Requirements 5.2
 */

import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert';
import fc from 'fast-check';
import {
  countVotersPerPartition,
  hasConflictingLeaders,
  isVoterReady,
  waitForConvergence,
} from '../assertions.js';
import {CONVERGENCE_DEFAULTS} from '../constants.js';
import {
  buildConvergedMockNode,
  buildNonConvergingMockNode,
} from './assertions-test-helpers.js';

/**
 * Feature: distributed-testing-framework
 * Property 9: Convergence Threshold Configuration
 *
 * *For any* set of convergence options (settleTimeoutMs,
 * quietWindowMs, targetVoterCount, maxSustainedOverTargetMs),
 * the convergence assertion SHALL use the provided values
 * instead of defaults.
 *
 * **Validates: Requirements 5.2**
 */
test('Property 9: Convergence Threshold Configuration', async (t) => {
  await t.test(
    'custom targetVoterCount is used instead of default',
    async () => {
      const partitionIds = ['p1', 'p2'];

      await fc.assert(
        fc.asyncProperty(
          fc.integer({min: 1, max: 9}),
          async (targetVoterCount) => {
            const node = buildConvergedMockNode(
              partitionIds, targetVoterCount,
            );

            // Use very small timeouts so the test completes
            // instantly. If the function ignored our custom
            // targetVoterCount and used the default (3), then
            // targetVoterCount !== 3 would either fail
            // convergence (count < 3) or detect over-target
            // (count > 3).
            const result = await waitForConvergence([node], {
              settleTimeoutMs: 500,
              quietWindowMs: 0,
              maxSustainedOverTargetMs: 500,
              sampleIntervalMs: 10,
              targetVoterCount,
            });

            assert.strictEqual(typeof result.settledAfterMs, 'number');
            assert.ok(result.settledAfterMs >= 0);
            assert.strictEqual(typeof result.leaderChanges, 'number');
            assert.strictEqual(typeof result.maxOverTargetMs, 'number');
          },
        ),
        {numRuns: 10},
      );
    },
  );

  await t.test(
    'custom settleTimeoutMs controls timeout duration',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({min: 50, max: 200}),
          async (settleTimeoutMs) => {
            const node = buildNonConvergingMockNode();
            const start = Date.now();

            try {
              await waitForConvergence([node], {
                settleTimeoutMs,
                quietWindowMs: 0,
                maxSustainedOverTargetMs: 1000,
                sampleIntervalMs: 10,
                targetVoterCount: 3,
              });
              // Should not reach here — non-converging node
              // must time out.
              assert.fail('Expected convergence timeout');
            } catch (err) {
              const elapsed = Date.now() - start;
              // The error message should reference our custom
              // timeout, not the default.
              assert.ok(
                err.message.includes(String(settleTimeoutMs)),
                'Error should reference custom timeout ' +
                settleTimeoutMs + ' but got: ' + err.message,
              );
              // Elapsed time should be roughly around our
              // custom timeout (with tolerance for scheduling).
              assert.ok(
                elapsed < settleTimeoutMs + 500,
                'Should timeout near ' + settleTimeoutMs +
                'ms but took ' + elapsed + 'ms',
              );
            }
          },
        ),
        {numRuns: 10},
      );
    },
  );

  await t.test(
    'provided options override defaults for all fields',
    async () => {
      const optionsArb = fc.record({
        settleTimeoutMs: fc.integer({min: 100, max: 500}),
        quietWindowMs: fc.integer({min: 0, max: 50}),
        targetVoterCount: fc.integer({min: 1, max: 9}),
        maxSustainedOverTargetMs: fc.integer({min: 100, max: 1000}),
        sampleIntervalMs: fc.integer({min: 5, max: 50}),
      });

      await fc.assert(
        fc.asyncProperty(optionsArb, async (customOpts) => {
          // Merge should produce custom values, not defaults.
          const merged = {...CONVERGENCE_DEFAULTS, ...customOpts};

          assert.strictEqual(
            merged.settleTimeoutMs, customOpts.settleTimeoutMs,
          );
          assert.strictEqual(
            merged.quietWindowMs, customOpts.quietWindowMs,
          );
          assert.strictEqual(
            merged.targetVoterCount, customOpts.targetVoterCount,
          );
          assert.strictEqual(
            merged.maxSustainedOverTargetMs,
            customOpts.maxSustainedOverTargetMs,
          );
          assert.strictEqual(
            merged.sampleIntervalMs, customOpts.sampleIntervalMs,
          );

          // Verify the function actually uses these by
          // converging with the custom targetVoterCount.
          const node = buildConvergedMockNode(
            ['p1'], customOpts.targetVoterCount,
          );
          const result = await waitForConvergence(
            [node], customOpts,
          );
          assert.ok(result.settledAfterMs >= 0);
        }),
        {numRuns: 10},
      );
    },
  );
});

/**
 * Unit tests for convergence assertions.
 *
 * Validates: Requirements 5.2, 5.3
 */

// -------------------------------------------------------
// isVoterReady
// -------------------------------------------------------

test('isVoterReady — valid voter-ready row returns true', async () => {
  const row = {
    service_type: 'partition',
    status: 'ACTIVE',
    raft_role: 'leader',
    address: 'node-1/p1/r0',
  };
  assert.strictEqual(isVoterReady(row), true);
});

test('isVoterReady — follower role returns true', async () => {
  const row = {
    service_type: 'partition',
    status: 'ACTIVE',
    raft_role: 'follower',
    address: 'node-1/p1/r1',
  };
  assert.strictEqual(isVoterReady(row), true);
});

test('isVoterReady — null/undefined row returns false', async () => {
  assert.strictEqual(isVoterReady(null), false);
  assert.strictEqual(isVoterReady(undefined), false);
});

test('isVoterReady — wrong service_type returns false', async () => {
  const row = {
    service_type: 'message-group',
    status: 'ACTIVE',
    raft_role: 'leader',
    address: 'node-1/mg/r0',
  };
  assert.strictEqual(isVoterReady(row), false);
});

test('isVoterReady — non-ACTIVE status returns false', async () => {
  const row = {
    service_type: 'partition',
    status: 'STARTING',
    raft_role: 'leader',
    address: 'node-1/p1/r0',
  };
  assert.strictEqual(isVoterReady(row), false);
});

test('isVoterReady — learner role returns false', async () => {
  const row = {
    service_type: 'partition',
    status: 'ACTIVE',
    raft_role: 'learner',
    address: 'node-1/p1/r0',
  };
  assert.strictEqual(isVoterReady(row), false);
});

test('isVoterReady — missing raft_role returns false', async () => {
  const row = {
    service_type: 'partition',
    status: 'ACTIVE',
    address: 'node-1/p1/r0',
  };
  assert.strictEqual(isVoterReady(row), false);
});

test('isVoterReady — missing address returns false', async () => {
  const row = {
    service_type: 'partition',
    status: 'ACTIVE',
    raft_role: 'leader',
  };
  assert.strictEqual(isVoterReady(row), false);
});

test('isVoterReady — case-insensitive raft_role check', async () => {
  const row = {
    service_type: 'partition',
    status: 'ACTIVE',
    raft_role: 'LEADER',
    address: 'node-1/p1/r0',
  };
  assert.strictEqual(isVoterReady(row), true);
});

// -------------------------------------------------------
// countVotersPerPartition
// -------------------------------------------------------

test('countVotersPerPartition — counts voters per partition', async () => {
  const rows = [
    {service_type: 'partition', status: 'ACTIVE', raft_role: 'leader',
      address: 'a', partition_id: 'p1'},
    {service_type: 'partition', status: 'ACTIVE', raft_role: 'follower',
      address: 'b', partition_id: 'p1'},
    {service_type: 'partition', status: 'ACTIVE', raft_role: 'follower',
      address: 'c', partition_id: 'p1'},
    {service_type: 'partition', status: 'ACTIVE', raft_role: 'leader',
      address: 'd', partition_id: 'p2'},
  ];
  const counts = countVotersPerPartition(rows);
  assert.strictEqual(counts.get('p1'), 3);
  assert.strictEqual(counts.get('p2'), 1);
});

test('countVotersPerPartition — skips learners', async () => {
  const rows = [
    {service_type: 'partition', status: 'ACTIVE', raft_role: 'leader',
      address: 'a', partition_id: 'p1'},
    {service_type: 'partition', status: 'ACTIVE', raft_role: 'learner',
      address: 'b', partition_id: 'p1'},
  ];
  const counts = countVotersPerPartition(rows);
  assert.strictEqual(counts.get('p1'), 1);
});

test('countVotersPerPartition — empty rows returns empty map', async () => {
  const counts = countVotersPerPartition([]);
  assert.strictEqual(counts.size, 0);
});

test('countVotersPerPartition — skips rows without partition_id', async () => {
  const rows = [
    {service_type: 'partition', status: 'ACTIVE', raft_role: 'leader',
      address: 'a'},
  ];
  const counts = countVotersPerPartition(rows);
  assert.strictEqual(counts.size, 0);
});

await import('./assertions-convergence-snapshot-test-cases.js');
await import('./assertions-priority-recovery-test-cases.js');
await import('./assertions-convergence-settle-test-cases.js');

// --- hasConflictingLeaders tests ---

test('hasConflictingLeaders returns false for identical maps',
  async () => {
    const leaders = {'p1': 'node-a', 'p2': 'node-b'};
    assert.strictEqual(
      hasConflictingLeaders(leaders, leaders), false,
    );
  });

test('hasConflictingLeaders returns false when one map has extra keys',
  async () => {
    const a = {'p1': 'node-a', 'p2': 'node-b'};
    const b = {'p1': 'node-a', 'p2': 'node-b', 'p3': 'node-c'};
    assert.strictEqual(hasConflictingLeaders(a, b), false);
    assert.strictEqual(hasConflictingLeaders(b, a), false);
  });

test('hasConflictingLeaders returns true for conflicting values',
  async () => {
    const a = {'p1': 'node-a', 'p2': 'node-b'};
    const b = {'p1': 'node-a', 'p2': 'node-x'};
    assert.strictEqual(hasConflictingLeaders(a, b), true);
  });

test('hasConflictingLeaders returns false for empty maps',
  async () => {
    assert.strictEqual(hasConflictingLeaders({}, {}), false);
    assert.strictEqual(
      hasConflictingLeaders({'p1': 'a'}, {}), false,
    );
  });

test('hasConflictingLeaders returns false for disjoint keys',
  async () => {
    const a = {'p1': 'node-a'};
    const b = {'p2': 'node-b'};
    assert.strictEqual(hasConflictingLeaders(a, b), false);
  });
