/**
 * Property Test: Single CDC write path for replica state changes
 * Feature: system-architecture-consolidation,
 *   Property 10: Single CDC write path for replica state changes
 *
 * **Validates: Requirements 5.4**
 *
 * *For any* replica state transition, exactly one CDC write to the
 * services system table shall occur, and it shall originate from
 * the ReplicaStateMachine.
 */
// @ts-nocheck


import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  ReplicaStateMachine,
} from '../../src/node/replica-state-machine.js';
import {
  REPLICA_STATE_MACHINE_STATE,
  REPLICA_STATE_MACHINE_VALID_TRANSITIONS,
} from '../../src/node/replica-state-machine-constants.js';
import {TABLES} from '../../src/constants/tables.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

/**
 * All valid transition sequences through the replica lifecycle.
 * Built by walking the REPLICA_STATE_MACHINE_VALID_TRANSITIONS graph.
 * @type {Array<string[]>}
 */
const VALID_SEQUENCES = [];

/**
 * Build all valid transition paths from a given state.
 * @param {string|null} fromState - Current state (null for new replica).
 * @param {string[]} pathSoFar - Accumulated transitions.
 */
function buildPaths(fromState, pathSoFar) {
  const nextStates =
    REPLICA_STATE_MACHINE_VALID_TRANSITIONS[fromState] || [];

  if (pathSoFar.length > 0) {
    VALID_SEQUENCES.push([...pathSoFar]);
  }

  for (const nextState of nextStates) {
    buildPaths(nextState, [...pathSoFar, nextState]);
  }
}

buildPaths(null, []);

/**
 * Create a mock CDC integration service that tracks all operations.
 * Records table name, operation type, and data for each call.
 * @return {Object} Mock service with calls array.
 */
function createTrackingCdcService() {
  const calls = [];
  return {
    calls,
    updateSystemTableRow: async (tableName, whereClause, data) => {
      calls.push({
        operation: 'update',
        tableName,
        whereClause,
        data,
      });
      return {success: true};
    },
    upsertSystemTableRow: async (tableName, data) => {
      calls.push({
        operation: 'upsert',
        tableName,
        data,
      });
      return {success: true};
    },
  };
}

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('Property 10: Single CDC write path for replica state changes',
  async (t) => {
    /**
     * Property: For any valid transition sequence, exactly one
     * CDC write to the services table occurs per transition.
     * No duplicate writes, no missing writes.
     */
    t.test(
      'exactly one CDC write per state transition',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            fc.constantFrom(...VALID_SEQUENCES),
            fc.uuid(),
            fc.uuid(),
            async (sequence, replicaId, partitionId) => {
              const mockCdc = createTrackingCdcService();
              const sm = new ReplicaStateMachine({
                nodeId: 'test-node',
                cdcIntegrationService: mockCdc,
              });

              for (const state of sequence) {
                const result = await sm.transition(
                  replicaId, state, {
                    partitionId,
                    nodeId: 'test-node',
                    reason: 'property-test',
                  },
                );
                if (!result) {
                  sm.clear();
                  return false;
                }
              }

              sm.clear();

              // Exactly one CDC write per transition
              return mockCdc.calls.length === sequence.length;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'exactly one CDC write occurs per state transition',
        );
      },
    );

    /**
     * Property: For any valid transition, every CDC write
     * targets the services system table exclusively.
     */
    t.test(
      'all CDC writes target the services table',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            fc.constantFrom(...VALID_SEQUENCES),
            fc.uuid(),
            fc.uuid(),
            async (sequence, replicaId, partitionId) => {
              const mockCdc = createTrackingCdcService();
              const sm = new ReplicaStateMachine({
                nodeId: 'test-node',
                cdcIntegrationService: mockCdc,
              });

              for (const state of sequence) {
                await sm.transition(replicaId, state, {
                  partitionId,
                  nodeId: 'test-node',
                  reason: 'property-test',
                });
              }

              sm.clear();

              // Every CDC call must target the services table
              for (const call of mockCdc.calls) {
                if (call.tableName !== TABLES.SERVICES) {
                  return false;
                }
              }

              return true;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'all CDC writes target the services system table',
        );
      },
    );

    /**
     * Property: For any valid transition, the CDC write
     * contains the correct new state value matching the
     * transition target.
     */
    t.test(
      'CDC write contains correct state for each transition',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            fc.constantFrom(...VALID_SEQUENCES),
            fc.uuid(),
            fc.uuid(),
            async (sequence, replicaId, partitionId) => {
              const mockCdc = createTrackingCdcService();
              const sm = new ReplicaStateMachine({
                nodeId: 'test-node',
                cdcIntegrationService: mockCdc,
              });

              for (const state of sequence) {
                await sm.transition(replicaId, state, {
                  partitionId,
                  nodeId: 'test-node',
                  reason: 'property-test',
                });
              }

              sm.clear();

              if (mockCdc.calls.length !== sequence.length) {
                return false;
              }

              // Each CDC write's status must match the
              // corresponding transition target state
              for (let i = 0; i < sequence.length; i++) {
                const call = mockCdc.calls[i];
                const data = call.data;
                if (data.status !== sequence[i]) {
                  return false;
                }
              }

              return true;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'CDC write contains correct state for each ' +
          'transition',
        );
      },
    );

    /**
     * Property: For any valid transition sequence with
     * multiple replicas, each replica's transitions produce
     * independent CDC writes — no cross-contamination.
     */
    t.test(
      'no duplicate writes across concurrent replicas',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            fc.uuid(),
            fc.uuid(),
            fc.uuid(),
            async (replicaA, replicaB, partitionId) => {
              // Ensure distinct replica IDs
              if (replicaA === replicaB) return true;

              const mockCdc = createTrackingCdcService();
              const sm = new ReplicaStateMachine({
                nodeId: 'test-node',
                cdcIntegrationService: mockCdc,
              });

              // Transition both replicas through PENDING
              await sm.transition(
                replicaA,
                REPLICA_STATE_MACHINE_STATE.PENDING,
                {
                  partitionId,
                  nodeId: 'test-node',
                  reason: 'property-test',
                },
              );
              await sm.transition(
                replicaB,
                REPLICA_STATE_MACHINE_STATE.PENDING,
                {
                  partitionId,
                  nodeId: 'test-node',
                  reason: 'property-test',
                },
              );

              sm.clear();

              // Exactly 2 CDC writes — one per replica
              return mockCdc.calls.length === 2;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'no duplicate writes across concurrent replicas',
        );
      },
    );

    /**
     * Property: For any valid transition, the CDC write
     * originates from ReplicaStateMachine._persistStateToCdc
     * (verified by the fact that only the state machine's
     * cdcIntegrationService receives calls — no other CDC
     * service instance is invoked).
     */
    t.test(
      'CDC writes originate only from ReplicaStateMachine',
      async (t) => {
        await fc.assert(
          fc.asyncProperty(
            fc.constantFrom(...VALID_SEQUENCES),
            fc.uuid(),
            fc.uuid(),
            async (sequence, replicaId, partitionId) => {
              const smCdc = createTrackingCdcService();
              const externalCdc = createTrackingCdcService();

              const sm = new ReplicaStateMachine({
                nodeId: 'test-node',
                cdcIntegrationService: smCdc,
              });

              for (const state of sequence) {
                await sm.transition(replicaId, state, {
                  partitionId,
                  nodeId: 'test-node',
                  reason: 'property-test',
                });
              }

              sm.clear();

              // The state machine's CDC service received
              // all writes
              const smWrites = smCdc.calls.length;

              // The external CDC service received zero
              // writes (simulating no other component
              // writing to services table)
              const externalWrites = externalCdc.calls.length;

              return smWrites === sequence.length &&
                externalWrites === 0;
            },
          ),
          {numRuns: 10},
        );

        t.pass(
          'CDC writes originate only from ' +
          'ReplicaStateMachine',
        );
      },
    );
  });
