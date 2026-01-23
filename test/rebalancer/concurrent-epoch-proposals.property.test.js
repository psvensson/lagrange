/**
 * Property Test: Concurrent Epoch Proposals
 * Feature: simplified-cluster-architecture, Property 11: Concurrent Epoch Proposals
 *
 * For any set of concurrent epoch proposals from different nodes, exactly one
 * SHALL succeed and all others SHALL fail with epoch mismatch.
 *
 * **Validates: Requirements 6.3**
 */

import {test} from 'tap';
import fc from 'fast-check';
import {AssignmentEpochManager} from '../../src/rebalancer/assignment-epoch-manager.js';
import {AssignmentEpoch} from '../../src/rebalancer/assignment-epoch.js';

test('Feature: simplified-cluster-architecture, Property 11: Concurrent Epoch Proposals',
  async (t) => {
    await t.test('exactly one concurrent proposal succeeds, others fail with mismatch',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            // Generate 2-5 concurrent proposers
            fc.integer({min: 2, max: 5}),
            // Generate partition assignments
            fc.array(
              fc.record({
                partitionId: fc.stringMatching(/^[a-z]+-p[0-9]+$/),
                nodes: fc.array(fc.stringMatching(/^node[0-9]+$/), {minLength: 1, maxLength: 3}),
              }),
              {minLength: 1, maxLength: 5},
            ),
            async (numProposers, partitionConfigs) => {
              // Create a shared epoch manager (simulating shared state)
              const manager = new AssignmentEpochManager({nodeId: 'coordinator'});
              manager.initialize();

              const initialEpoch = manager.getCurrentEpoch().epoch;

              // Create proposals from different "nodes"
              const proposals = [];
              for (let i = 0; i < numProposers; i++) {
                const assignments = {};
                for (const config of partitionConfigs) {
                  // Each proposer creates slightly different assignments
                  assignments[config.partitionId] = [...config.nodes, `node${i}`];
                }
                proposals.push({
                  nodeId: `proposer-${i}`,
                  expectedEpoch: initialEpoch,
                  assignments,
                });
              }

              // Execute all proposals "concurrently" (sequentially but all using same expected epoch)
              const results = proposals.map((proposal) =>
                manager.proposeEpoch(proposal.expectedEpoch, proposal.assignments),
              );

              // Count successes and failures
              const successes = results.filter((r) => r.success);
              const failures = results.filter((r) => !r.success);

              // Property: Exactly one proposal should succeed
              t.equal(successes.length, 1,
                'exactly one proposal should succeed');

              // Property: All other proposals should fail
              t.equal(failures.length, numProposers - 1,
                'all other proposals should fail');

              // Property: Failed proposals should have epoch mismatch error
              for (const failure of failures) {
                t.ok(failure.error.includes('Epoch mismatch'),
                  'failed proposals should report epoch mismatch');
              }

              // Property: Final epoch should be exactly one greater than initial
              const finalEpoch = manager.getCurrentEpoch().epoch;
              t.equal(finalEpoch, initialEpoch + 1,
                'final epoch should be exactly one greater than initial');
            },
          ),
          {numRuns: 10},
        );
      });

    await t.test('concurrent proposals with retry - only one wins per epoch increment',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            // Generate 2-3 concurrent proposers with retry
            fc.integer({min: 2, max: 3}),
            async (numProposers) => {
              // Create a shared epoch manager
              const manager = new AssignmentEpochManager({
                nodeId: 'coordinator',
                delayFn: () => Promise.resolve(), // No actual delay for testing
              });
              manager.initialize();

              const initialEpoch = manager.getCurrentEpoch().epoch;

              // Create proposals from different "nodes"
              const proposalPromises = [];
              for (let i = 0; i < numProposers; i++) {
                const assignments = {
                  [`partition-${i}`]: [`node${i}`, `node${i + 1}`],
                };
                proposalPromises.push(
                  manager.proposeEpochWithRetry(assignments, {
                    maxRetries: 2,
                    initialDelayMs: 1,
                    maxDelayMs: 10,
                  }),
                );
              }

              // Execute all proposals concurrently
              const results = await Promise.all(proposalPromises);

              // Count successes
              const successes = results.filter((r) => r.success);

              // Property: At least one proposal should succeed
              t.ok(successes.length >= 1,
                'at least one proposal should succeed');

              // Property: Final epoch should be greater than initial
              const finalEpoch = manager.getCurrentEpoch().epoch;
              t.ok(finalEpoch > initialEpoch,
                'final epoch should be greater than initial');

              // Property: Each success increments epoch by exactly 1
              // Total epoch increment should equal number of successes
              t.equal(finalEpoch - initialEpoch, successes.length,
                'epoch increment should equal number of successful proposals');
            },
          ),
          {numRuns: 10},
        );
      });

    await t.test('CAS semantics - stale expectedEpoch always fails', async (t) => {
      await fc.assert(
        fc.property(
          // Generate a stale epoch offset (how far behind)
          fc.integer({min: 1, max: 10}),
          // Generate number of epoch advances
          fc.integer({min: 1, max: 5}),
          (staleOffset, advances) => {
            const manager = new AssignmentEpochManager({nodeId: 'node1'});
            manager.initialize();

            // Advance the epoch several times
            for (let i = 0; i < advances; i++) {
              const currentEpoch = manager.getCurrentEpoch().epoch;
              manager.proposeEpoch(currentEpoch, {[`partition-${i}`]: ['node1']});
            }

            const currentEpoch = manager.getCurrentEpoch().epoch;
            const staleEpoch = Math.max(0, currentEpoch - staleOffset);

            // Attempt proposal with stale epoch
            const result = manager.proposeEpoch(staleEpoch, {test: ['node1']});

            // Property: Stale epoch proposals should always fail
            if (staleEpoch !== currentEpoch) {
              t.equal(result.success, false,
                'proposal with stale epoch should fail');
              t.ok(result.error.includes('Epoch mismatch'),
                'error should indicate epoch mismatch');
            }
          },
        ),
        {numRuns: 10},
      );
    });
  });
