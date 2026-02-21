/**
 * Property Tests: Node state gated by pipeline readiness
 *
 * Feature: bootstrap-lifecycle-hardening, Property 4: Node state
 * gated by pipeline readiness
 * **Validates: Requirements 2.5, 2.6**
 *
 * *For any* node lifecycle (bootstrap or join), the node state SHALL
 * never transition to READY while the CDCPipelineReadinessGate reports
 * `ready: false`.
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {CDCPipelineReadinessGate} from
  '../../src/cdc/cdc-pipeline-readiness-gate.js';
import {
  CDC_PIPELINE_READINESS_CONDITION,
} from '../../src/constants/cdc-lifecycle-constants.js';
import {NODE_STATE} from '../../src/constants/node-state.js';

const PROPAGATED_TABLES = ['nodes', 'partitions', 'services'];

/**
 * Minimal SystemTableCache stub with onCacheChange/offCacheChange.
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
      for (const l of [...listeners]) l();
    },
  };
}

/**
 * Create a partition stub for a given table with subscriber count.
 */
function createPartitionStub(tableName, subscriberCount) {
  return {
    tableName,
    cdcSubscribers: {size: subscriberCount},
  };
}

/**
 * Create a message group stub.
 */
function createMessageGroupStub(isLeader) {
  return {
    isLeaderReplica() {
      return isLeader;
    },
  };
}

/**
 * Simulates a node lifecycle gating check. Mirrors the pattern used
 * by both BootstrapService.phaseCacheHydration and
 * NodeJoiningService.phaseQuerySystemState: create a readiness gate,
 * evaluate it, and only allow READY transition when the gate passes.
 *
 * @param {Object} gate - CDCPipelineReadinessGate instance
 * @param {Object} context - partitionServices + messageGroupServices
 * @param {string} currentState - pre-transition node state
 * @return {{transitioned: boolean, finalState: string}}
 */
function simulateLifecycleGating(gate, context, currentState) {
  const result = gate.evaluate(context);
  if (result.ready) {
    return {transitioned: true, finalState: NODE_STATE.READY};
  }
  return {transitioned: false, finalState: currentState};
}

/**
 * Arbitrary for the three readiness conditions.
 */
const conditionTripleArb = fc.record({
  subscriptionsActive: fc.boolean(),
  propagationLeader: fc.boolean(),
  pipelineProven: fc.boolean(),
});

/**
 * Arbitrary for lifecycle type: bootstrap or join.
 */
const lifecycleTypeArb = fc.constantFrom('bootstrap', 'join');

/**
 * Pre-READY states for bootstrap and join flows.
 */
const PRE_READY_STATES = {
  bootstrap: NODE_STATE.STARTING,
  join: NODE_STATE.JOINING,
};

test(
  'Feature: bootstrap-lifecycle-hardening, ' +
  'Property 4: Node state gated by pipeline readiness',
  async (t) => {
    /**
     * **Validates: Requirements 2.5, 2.6**
     */
    t.test(
      'node state never transitions to READY while gate ' +
      'reports ready: false, for any lifecycle and conditions',
      async () => {
        await fc.assert(
          fc.property(
            conditionTripleArb,
            lifecycleTypeArb,
            (conditions, lifecycleType) => {
              const {
                subscriptionsActive,
                propagationLeader,
                pipelineProven,
              } = conditions;

              const cache = createCacheStub();
              const gate = new CDCPipelineReadinessGate({
                systemTableCache: cache,
                cdcPropagatedTables: PROPAGATED_TABLES,
              });

              // Condition 3: pipeline proven
              if (pipelineProven) {
                cache.fire();
              }

              // Condition 1: subscriptions active
              const partitions = new Map();
              if (subscriptionsActive) {
                PROPAGATED_TABLES.forEach((tbl, i) => {
                  partitions.set(
                    `p${i}`,
                    createPartitionStub(tbl, 1),
                  );
                });
              }

              // Condition 2: propagation leader
              const messageGroups = new Map();
              if (propagationLeader) {
                messageGroups.set(
                  'mg1',
                  createMessageGroupStub(true),
                );
              }

              const context = {
                partitionServices: partitions,
                messageGroupServices: messageGroups,
              };

              const preReadyState = PRE_READY_STATES[lifecycleType];
              const gateResult = gate.evaluate(context);
              const lifecycle = simulateLifecycleGating(
                gate, context, preReadyState,
              );

              const allTrue =
                subscriptionsActive &&
                propagationLeader &&
                pipelineProven;

              // Core property: if gate says not ready, node must
              // NOT transition to READY
              if (!gateResult.ready) {
                if (lifecycle.finalState === NODE_STATE.READY) {
                  return false;
                }
                if (lifecycle.transitioned) return false;
                if (lifecycle.finalState !== preReadyState) {
                  return false;
                }
              }

              // Converse: if gate says ready, node may transition
              if (gateResult.ready) {
                if (!allTrue) return false;
                if (!lifecycle.transitioned) return false;
                if (lifecycle.finalState !== NODE_STATE.READY) {
                  return false;
                }
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
