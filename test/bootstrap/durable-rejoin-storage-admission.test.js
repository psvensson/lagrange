// Durable rejoin storage admission (src/bootstrap/durable-rejoin-storage-admission.js):
// a restoring replica waits for its authoritative lifecycle observation within
// its bound and refuses, retryable, when the authority stays unavailable.
import {test} from '../../src/test-helpers/tap.js';
import {
  DURABLE_REJOIN_LIFECYCLE_AUTHORITY_UNAVAILABLE,
  assertDurableRejoinStorageAdmission,
} from '../../src/bootstrap/durable-rejoin-storage-admission.js';

test('assertDurableRejoinStorageAdmission - retries transient unavailable lifecycle authority before succeeding',
  async (t) => {
    let observations = 0;
    const expectedRow = {
      service_id: 'stock-p5-r3',
      replica_id: 'stock-p5-r3',
      partition_id: 'stock-p5',
      node_id: 'node-3',
      service_type: 'partition',
      status: 'active',
      raft_role: 'VOTER',
      created_at: 100,
      state_entered_at: 200,
      cleanup_token: null,
    };
    const fakeStateMachine = {
      sleep: async () => {},
      getControlPlaneSystemTableGateway: () => ({
        readAuthoritativeRows: async () => {
          observations += 1;
          if (observations < 3) {
            return {success: false, error: 'owner_fact_below_term_floor'};
          }
          return {success: true, rows: [expectedRow]};
        },
      }),
    };

    await assertDurableRejoinStorageAdmission(fakeStateMachine, {
      restoringExistingReplica: true,
      replicaId: 'stock-p5-r3',
      authorityObservationPollIntervalMs: 1,
      maxAuthorityObservationAttempts: 5,
      lifecycleAuthority: {
        replicaId: 'stock-p5-r3',
        replicaCreatedAt: 100,
        partitionId: 'stock-p5',
        nodeId: 'node-3',
        serviceType: 'partition',
        status: 'active',
        durableVersionColumn: 'state_entered_at',
        durableVersion: 200,
      },
    });
    t.equal(observations, 3,
      'must retry transient services-p1 election unavailability and succeed once authoritative row is readable');

    const alwaysUnavailableMachine = {
      sleep: async () => {},
      getControlPlaneSystemTableGateway: () => ({
        readAuthoritativeRows: async () => ({
          success: false,
          error: 'owner_fact_below_term_floor',
        }),
      }),
    };
    let caught = null;
    try {
      await assertDurableRejoinStorageAdmission(alwaysUnavailableMachine, {
        restoringExistingReplica: true,
        replicaId: 'stock-p5-r3',
        authorityObservationPollIntervalMs: 0,
        maxAuthorityObservationAttempts: 3,
        lifecycleAuthority: {
          replicaId: 'stock-p5-r3',
          replicaCreatedAt: 100,
          partitionId: 'stock-p5',
          nodeId: 'node-3',
          serviceType: 'partition',
          status: 'active',
          durableVersionColumn: 'state_entered_at',
          durableVersion: 200,
        },
      });
    } catch (error) {
      caught = error;
    }
    t.ok(caught, 'must throw when authority remains unavailable after retry budget');
    t.equal(caught?.code, DURABLE_REJOIN_LIFECYCLE_AUTHORITY_UNAVAILABLE);
    t.equal(caught?.deferRetry, true);
  });
