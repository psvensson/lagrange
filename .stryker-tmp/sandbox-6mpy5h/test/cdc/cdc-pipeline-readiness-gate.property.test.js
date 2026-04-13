/**
 * Property Tests: Pipeline Readiness Gate Evaluation
 *
 * Feature: bootstrap-lifecycle-hardening, Property 3: Pipeline
 * readiness gate evaluation
 * **Validates: Requirements 2.1, 2.2, 2.3**
 *
 * *For any* combination of the three readiness conditions
 * (subscriptions active, propagation leader elected, pipeline proven),
 * the CDCPipelineReadinessGate SHALL report `ready: true` if and only
 * if all three conditions are true, and `unmetConditions` SHALL
 * contain exactly the names of the conditions that are false.
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {CDCPipelineReadinessGate} from
  '../../src/cdc/cdc-pipeline-readiness-gate.js';
import {
  CDC_PIPELINE_READINESS_CONDITION,
} from '../../src/constants/cdc-lifecycle-constants.js';

const PROPAGATED_TABLES = ['nodes', 'partitions', 'services'];

/**
 * Minimal SystemTableCache stub with onCacheChange/offCacheChange.
 * Calling fire() simulates a cache-change notification.
 */
function createCacheStub() {
  const listeners = new Set();
  return {
    onCacheChange(listener) {
      listeners.add(listener);
    },
    offCacheChange(listener) {
      listeners.delete(listener);
    },
    fire() {
      for (const l of [...listeners]) {
        l();
      }
    },
  };
}

/**
 * Create a partition stub for a given table with subscriber count.
 * @param {string} tableName
 * @param {number} subscriberCount
 */
function createPartitionStub(tableName, subscriberCount) {
  return {
    tableName,
    cdcSubscribers: {size: subscriberCount},
  };
}

/**
 * Create a message group stub.
 * @param {boolean} isLeader
 */
function createMessageGroupStub(isLeader) {
  return {
    isLeaderReplica() {
      return isLeader;
    },
  };
}

/**
 * Generates all 8 boolean triples for the three readiness conditions.
 */
const conditionTripleArb = fc.record({
  subscriptionsActive: fc.boolean(),
  propagationLeader: fc.boolean(),
  pipelineProven: fc.boolean(),
});

test(
  'Feature: bootstrap-lifecycle-hardening, ' +
  'Property 3: Pipeline readiness gate evaluation',
  async (t) => {
    /**
     * **Validates: Requirements 2.1, 2.2, 2.3**
     */
    t.test(
      'ready iff all three conditions true, unmetConditions ' +
      'contains exactly the false condition names',
      async () => {
        await fc.assert(
          fc.property(
            conditionTripleArb,
            ({subscriptionsActive, propagationLeader, pipelineProven}) => {
              const cache = createCacheStub();
              const gate = new CDCPipelineReadinessGate({
                systemTableCache: cache,
                cdcPropagatedTables: PROPAGATED_TABLES,
              });

              // Condition 3: pipeline proven — fire cache event
              if (pipelineProven) {
                cache.fire();
              }

              // Condition 1: subscriptions active
              const partitions = new Map();
              if (subscriptionsActive) {
                PROPAGATED_TABLES.forEach((tbl, i) => {
                  partitions.set(
                    `p${i}`,
                    createPartitionStub(tbl, 1)
                  );
                });
              }

              // Condition 2: propagation leader
              const messageGroups = new Map();
              if (propagationLeader) {
                messageGroups.set(
                  'mg1',
                  createMessageGroupStub(true)
                );
              }

              const result = gate.evaluate({
                partitionServices: partitions,
                messageGroupServices: messageGroups,
              });

              // ready iff all three true
              const allTrue =
                subscriptionsActive &&
                propagationLeader &&
                pipelineProven;
              if (result.ready !== allTrue) return false;

              // Build expected unmet set
              const expectedUnmet = new Set();
              if (!subscriptionsActive) {
                expectedUnmet.add(
                  CDC_PIPELINE_READINESS_CONDITION.SUBSCRIPTIONS_ACTIVE
                );
              }
              if (!propagationLeader) {
                expectedUnmet.add(
                  CDC_PIPELINE_READINESS_CONDITION.PROPAGATION_LEADER
                );
              }
              if (!pipelineProven) {
                expectedUnmet.add(
                  CDC_PIPELINE_READINESS_CONDITION.PIPELINE_PROVEN
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
