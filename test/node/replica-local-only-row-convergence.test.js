/**
 * CL-021 guard: a priority replica activated via the local-commit fallback
 * (CL-016) must CONVERGE its deferred durable services row once the control
 * plane can accept writes — local-only activation must not be a terminal
 * state.
 *
 * Production witness (stat-gate-20260612T041945Z run2,
 * control_plane_publications-p1): REPLACE operations completed to 3 distinct
 * targets and the new replicas joined raft, but their durable services-row
 * writes were deferred ('Replica create status write deferred' x12) and
 * NOTHING retried them — the spread planner on the leader node never saw the
 * replicas as ready (readyDistinctNodeCount stayed 1) and looped planning
 * REPLACEs from already-retired sources into the retirement safety guard
 * (123 safety_blocked skips/run) — the deterministic mode=load ACTIVE-wait
 * stall.
 *
 * Guards:
 * 1. The timeout-checker tick retries the durable write for local-only rows
 *    and clears the marker on success — red if the reconcile is unwired or
 *    removed.
 * 2. Failures back off per row (no unbounded write storm) and later ticks
 *    converge once the gateway recovers.
 * 3. Untracked replicas drop their marker (bounded set).
 */

import {test} from '../../src/test-helpers/tap.js';
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  assignReplicaHandlerCreateStatusMethods,
} from '../../src/node/replica-handler-create-status-methods.js';
import {
  CONTROL_PLANE_MUTATION_OUTCOME,
} from '../../src/control-plane/control-plane-system-table-gateway.js';

const NODE_ID = 'node-a';
const REPLICA_ID = 'control_plane_publications-p1-r5';
const PARTITION_ID = 'control_plane_publications-p1';

class TestReplicaHandlerHost {}
assignReplicaHandlerCreateStatusMethods(TestReplicaHandlerHost);

function createHandler(stateMachine) {
  const systemTableCache = new SystemTableCache();
  stateMachine.systemTableCache = systemTableCache;
  const handler = Object.create(TestReplicaHandlerHost.prototype);
  handler.nodeId = NODE_ID;
  handler.replicaStateMachine = stateMachine;
  handler.systemTableCache = systemTableCache;
  handler.buildTrackedServiceAddress = (replicaId) =>
    `${NODE_ID}/partition/${replicaId}`;
  handler.getTrackedReplicaRole = () => null;
  handler.getTrackedService = () => null;
  return handler;
}

function createStateMachine({gateway, nowRef}) {
  return new ReplicaStateMachine({
    nodeId: NODE_ID,
    cdcIntegrationService: gateway,
    controlPlaneSystemTableGateway: gateway,
    now: () => nowRef.value,
    timeoutCheckIntervalMs: 5_000,
  });
}

function createGateway() {
  const calls = {mutations: []};
  const gateway = {
    failNext: true,
    returnNext: null,
    async submitMutation(mutation, _options) {
      calls.mutations.push(mutation);
      if (gateway.failNext) {
        const error = new Error('control plane not writable');
        error.retryable = true;
        throw error;
      }
      if (gateway.returnNext) {
        return gateway.returnNext;
      }
      return {success: true};
    },
  };
  return {gateway, calls};
}

async function seedLocalOnlyReplica(stateMachine) {
  // Track the replica without persistence (the CL-016 fallback path:
  // local state machine + local cache row, durable write deferred).
  await stateMachine._applyTransition(
    REPLICA_ID,
    'pending',
    {
      partitionId: PARTITION_ID,
      nodeId: NODE_ID,
      serviceId: REPLICA_ID,
      serviceType: 'partition',
      serviceAddress: `${NODE_ID}/partition/${REPLICA_ID}`,
    },
    {persist: false, validate: false},
  );
  stateMachine.markServiceRowLocalOnly(REPLICA_ID);
}

test('CL-021: deferred durable services rows converge', async (t) => {
  await t.test(
    'tick retries the durable write and clears the marker on success',
    async (t) => {
      const nowRef = {value: 1_760_000_000_000};
      const {gateway, calls} = createGateway();
      const stateMachine = createStateMachine({gateway, nowRef});
      await seedLocalOnlyReplica(stateMachine);
      t.equal(
        stateMachine.isServiceRowLocalOnly(REPLICA_ID),
        true,
        'fixture: row is local-only',
      );

      // Control plane still recovering: attempt fails, marker stays.
      await stateMachine._reconcileLocalOnlyServiceRows();
      t.equal(
        stateMachine.isServiceRowLocalOnly(REPLICA_ID),
        true,
        'failed attempt keeps the marker',
      );
      t.equal(calls.mutations.length, 1, 'one durable attempt made');
      t.equal(
        calls.mutations[0].operation.toLowerCase(),
        'insert',
        'local-only rows persist via insert-only admission',
      );

      // Backoff: an immediate next pass skips the row.
      await stateMachine._reconcileLocalOnlyServiceRows();
      t.equal(
        calls.mutations.length,
        1,
        'backoff prevents an immediate re-attempt',
      );

      // Control plane recovers; after the backoff window the row converges.
      gateway.failNext = false;
      nowRef.value += 60_000;
      const persisted = await stateMachine._reconcileLocalOnlyServiceRows();
      t.equal(persisted, 1, 'row durably converged');
      t.equal(
        stateMachine.isServiceRowLocalOnly(REPLICA_ID),
        false,
        'marker cleared on durable commit',
      );
      t.equal(
        stateMachine.localOnlyServiceRowRetryStateByServiceId.size,
        0,
        'retry state cleared with the marker',
      );

      stateMachine.shutdown?.();
    },
  );

  await t.test(
    'a RETURNED readiness deferral retains the marker (non-throwing ' +
      'typed outcome must not depend on success:false)',
    async (t) => {
      // Live witness (public-path-multinode-baseline-20260811T095750Z):
      // the gateway defers background-workClass lifecycle writes while
      // the joiner's control-plane readiness converges — it RETURNS
      // a typed deferred outcome rather than throwing. Clearing the marker on
      // that resolution stranded the durable row forever (63x 'No row
      // found for CDC update' on the services-p1 leader).
      const nowRef = {value: 1_760_000_000_000};
      const {gateway, calls} = createGateway();
      gateway.failNext = false;
      gateway.returnNext = {
        outcome: CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED,
        error: 'query_admission_deferred',
        deferRetry: true,
      };
      const stateMachine = createStateMachine({gateway, nowRef});
      await seedLocalOnlyReplica(stateMachine);

      const persisted = await stateMachine._reconcileLocalOnlyServiceRows();

      t.equal(persisted, 0, 'deferred pass counts as not-converged');
      t.equal(calls.mutations.length, 1, 'one durable attempt made');
      t.equal(
        stateMachine.isServiceRowLocalOnly(REPLICA_ID),
        true,
        'returned deferral keeps the marker',
      );

      // Backoff armed: an immediate next pass skips the row.
      await stateMachine._reconcileLocalOnlyServiceRows();
      t.equal(calls.mutations.length, 1, 'backoff after a returned deferral');

      // Gateway accepts writes again; the row converges after the window.
      gateway.returnNext = null;
      nowRef.value += 60_000;
      const converged = await stateMachine._reconcileLocalOnlyServiceRows();
      t.equal(converged, 1, 'row durably converged after recovery');
      t.equal(
        stateMachine.isServiceRowLocalOnly(REPLICA_ID),
        false,
        'marker cleared only on the confirmed apply',
      );
      stateMachine.shutdown?.();
    },
  );

  await t.test(
    'a zero-row apply (observed_state_changed) retains the marker',
    async (t) => {
      // A zero-row UPDATE/UPSERT resolves {success:true} with outcome
      // observed_state_changed and emits no CDC event — the durable row
      // still does not exist, so the marker must survive.
      const nowRef = {value: 1_760_000_000_000};
      const {gateway, calls} = createGateway();
      gateway.failNext = false;
      gateway.returnNext = {
        success: true,
        outcome: CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED,
        partitionResult: {affectedRows: 0},
      };
      const stateMachine = createStateMachine({gateway, nowRef});
      await seedLocalOnlyReplica(stateMachine);

      const persisted = await stateMachine._reconcileLocalOnlyServiceRows();

      t.equal(persisted, 0, 'zero-row apply counts as not-converged');
      t.equal(calls.mutations.length, 1, 'one durable attempt made');
      t.equal(
        stateMachine.isServiceRowLocalOnly(REPLICA_ID),
        true,
        'zero-row apply keeps the marker',
      );

      gateway.returnNext = null;
      nowRef.value += 60_000;
      const converged = await stateMachine._reconcileLocalOnlyServiceRows();
      t.equal(converged, 1, 'row durably converged after recovery');
      t.equal(
        stateMachine.isServiceRowLocalOnly(REPLICA_ID),
        false,
        'marker cleared only on the confirmed apply',
      );
      stateMachine.shutdown?.();
    },
  );

  await t.test('canonical apply effects own replica marker clearance',
    async (t) => {
      const cases = [
        ['applied', {outcome: CONTROL_PLANE_MUTATION_OUTCOME.APPLIED}, true],
        ['no-op', {outcome: CONTROL_PLANE_MUTATION_OUTCOME.NO_OP}, false],
        ['deferred', {outcome: CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED}, false],
        ['rejected', {outcome: CONTROL_PLANE_MUTATION_OUTCOME.REJECTED}, false],
        ['owner not ready', {
          outcome: CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY,
        }, false],
        ['observed state changed', {
          outcome: CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED,
        }, false],
        ['failed legacy', {success: false}, false],
        ['zero-row legacy', {affectedRows: 0}, false],
        ['positive-row legacy', {affectedRows: 1}, true],
        ['empty legacy success', {}, true],
        ['null partition fallback', {
          partitionResult: null,
          affectedRows: 1,
        }, true],
        ['invalid typed outcome', {outcome: 'future_outcome'}, false],
      ];
      for (const [label, result, applied] of cases) {
        const nowRef = {value: 1_760_000_000_000};
        const {gateway, calls} = createGateway();
        gateway.failNext = false;
        gateway.returnNext = result;
        const stateMachine = createStateMachine({gateway, nowRef});
        await seedLocalOnlyReplica(stateMachine);

        const persisted = await stateMachine._reconcileLocalOnlyServiceRows();

        t.equal(calls.mutations.length, 1, `${label}: one mutation submitted`);
        t.equal(persisted, applied ? 1 : 0, `${label}: persisted count`);
        t.equal(
          stateMachine.isServiceRowLocalOnly(REPLICA_ID),
          !applied,
          `${label}: marker clearance follows canonical applied effect`,
        );
        stateMachine.shutdown?.();
      }
    });

  await t.test('untracked replicas drop their marker', async (t) => {
    const nowRef = {value: 1_760_000_000_000};
    const {gateway, calls} = createGateway();
    const stateMachine = createStateMachine({gateway, nowRef});
    stateMachine.markServiceRowLocalOnly('ghost-replica-r9');

    const persisted = await stateMachine._reconcileLocalOnlyServiceRows();

    t.equal(persisted, 0, 'nothing persisted');
    t.equal(calls.mutations.length, 0, 'no durable attempt for ghosts');
    t.equal(
      stateMachine.isServiceRowLocalOnly('ghost-replica-r9'),
      false,
      'ghost marker dropped (set stays bounded)',
    );
    stateMachine.shutdown?.();
  });

  await t.test(
    'timeout-checker tick is wired to the reconcile (real interval)',
    async (t) => {
      const nowRef = {value: 1_760_000_000_000};
      const {gateway} = createGateway();
      gateway.failNext = false;
      const stateMachine = new ReplicaStateMachine({
        nodeId: NODE_ID,
        cdcIntegrationService: gateway,
        controlPlaneSystemTableGateway: gateway,
        now: () => nowRef.value,
        timeoutCheckIntervalMs: 5,
      });
      await seedLocalOnlyReplica(stateMachine);
      t.equal(stateMachine.isServiceRowLocalOnly(REPLICA_ID), true);

      stateMachine.startTimeoutChecker();
      // Wait for real ticks (5ms interval) to drive the reconcile —
      // red if the tick wiring is removed.
      const deadline = Date.now() + 2_000;
      while (
        stateMachine.isServiceRowLocalOnly(REPLICA_ID) &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      stateMachine.stopTimeoutChecker();

      t.equal(
        stateMachine.isServiceRowLocalOnly(REPLICA_ID),
        false,
        'a real tick converged the row (wiring is live)',
      );
      stateMachine.shutdown?.();
    },
  );

  await t.test(
    'reconcile writes carry a fresh updated_at stamp',
    async (t) => {
      const nowRef = {value: 1_760_000_000_000};
      const {gateway, calls} = createGateway();
      gateway.failNext = false;
      const stateMachine = createStateMachine({gateway, nowRef});
      await seedLocalOnlyReplica(stateMachine);
      const lifecycleGeneration = stateMachine.getState(REPLICA_ID)
        .durableVersion;
      // Time advances long after the state was entered.
      nowRef.value += 120_000;

      await stateMachine._reconcileLocalOnlyServiceRows();

      t.equal(calls.mutations.length, 1, 'one durable write');
      const row = calls.mutations[0].row || calls.mutations[0].data;
      t.equal(
        row.updated_at,
        nowRef.value,
        'full-row replace is stamped at reconcile time, not state-entry ' +
          'time (a stale stamp would lose cache merges yet overwrite the ' +
          'durable row for later hydrators)',
      );
      t.equal(row.state_entered_at, lifecycleGeneration,
        'cache freshness cannot silently advance the lifecycle CAS token');
      await stateMachine._applyTransition(REPLICA_ID, 'creating', {
        partitionId: PARTITION_ID,
        nodeId: NODE_ID,
        serviceId: REPLICA_ID,
      }, {persist: true, validate: false});
      t.equal(calls.mutations[1].whereClause.state_entered_at,
        lifecycleGeneration,
        'the next lifecycle transition CASes the converged row generation');
      stateMachine.shutdown?.();
    },
  );

  await t.test(
    'terminal-state rows drop their marker without a durable write',
    async (t) => {
      const nowRef = {value: 1_760_000_000_000};
      const {gateway, calls} = createGateway();
      const stateMachine = createStateMachine({gateway, nowRef});
      await seedLocalOnlyReplica(stateMachine);
      await stateMachine._applyTransition(
        REPLICA_ID,
        'failed',
        {partitionId: PARTITION_ID, nodeId: NODE_ID, serviceId: REPLICA_ID},
        {persist: false, validate: false},
      );
      // The persist:false transition does not clear the marker.
      stateMachine.markServiceRowLocalOnly(REPLICA_ID);

      const persisted = await stateMachine._reconcileLocalOnlyServiceRows();

      t.equal(persisted, 0, 'no durable convergence for terminal rows');
      t.equal(calls.mutations.length, 0, 'no write submitted');
      t.equal(
        stateMachine.isServiceRowLocalOnly(REPLICA_ID),
        false,
        'marker dropped (failure paths own terminal durability)',
      );
      stateMachine.shutdown?.();
    },
  );

  await t.test(
    'lifecycle UPSERT preserves raft_role/group_id from the cached row',
    async (t) => {
      // CL-021 root (pinned by exclusionReasonCounts: raft_role_missing on
      // every blocked partition): the full-row INSERT OR REPLACE nulled
      // columns owned by other writers, leaving REPLACE-created replicas
      // invisible to the spread-ready predicate.
      const nowRef = {value: 1_760_000_000_000};
      const {gateway, calls} = createGateway();
      gateway.failNext = false;
      const stateMachine = createStateMachine({gateway, nowRef});
      stateMachine.systemTableCache = {
        get: (table, key) =>
          table === 'services' && key === REPLICA_ID ?
            {
              service_id: REPLICA_ID,
              raft_role: 'follower',
              group_id: 'group-7',
              status: 'active',
            } :
            null,
      };
      await seedLocalOnlyReplica(stateMachine);

      await stateMachine._reconcileLocalOnlyServiceRows();

      t.equal(calls.mutations.length, 1, 'one durable write');
      const row = calls.mutations[0].row || calls.mutations[0].data;
      t.equal(row.raft_role, 'follower', 'raft_role preserved, not nulled');
      t.equal(row.group_id, 'group-7', 'group_id preserved, not nulled');
      stateMachine.shutdown?.();
    },
  );

  await t.test(
    'reconcile skips rows with an in-flight transition persist',
    async (t) => {
      const nowRef = {value: 1_760_000_000_000};
      const {gateway, calls} = createGateway();
      gateway.failNext = false;
      const stateMachine = createStateMachine({gateway, nowRef});
      await seedLocalOnlyReplica(stateMachine);
      let release;
      stateMachine.serviceRowPersistInFlightByServiceId.set(
        REPLICA_ID,
        new Promise((resolve) => {
          release = resolve;
        }),
      );

      const persisted = await stateMachine._reconcileLocalOnlyServiceRows();

      t.equal(persisted, 0, 'row skipped while a transition persist runs');
      t.equal(calls.mutations.length, 0, 'no racing write submitted');
      t.equal(
        stateMachine.isServiceRowLocalOnly(REPLICA_ID),
        true,
        'marker kept for the next tick',
      );
      release();
      stateMachine.serviceRowPersistInFlightByServiceId.delete(REPLICA_ID);
      stateMachine.shutdown?.();
    },
  );
});

test('CL-021: the deferred-row retry runs only on its own bounded pass; ' +
  'no promotion refusal kicks it', async (t) => {
  // quest learner-host-from-committed-admission: the learner promotion
  // proof no longer depends on the learner's services row, so the on-demand
  // kick a learner_address_unresolvable refusal used to fire is deleted.
  // The tick's pass keeps its per-row backoff.
  const nowRef = {value: 1_760_000_000_000};
  const {gateway, calls} = createGateway();
  const stateMachine = createStateMachine({gateway, nowRef});
  await seedLocalOnlyReplica(stateMachine);
  t.equal(typeof stateMachine.reconcileLocalOnlyServiceRowsNow, 'undefined',
    'there is no on-demand retry entry');

  const kicked = await stateMachine._reconcileLocalOnlyServiceRows();
  t.equal(kicked, 0, 'control plane still failing: nothing converged');
  t.equal(calls.mutations.length, 1, 'the pass made one durable attempt');
  t.equal(
    stateMachine.isServiceRowLocalOnly(REPLICA_ID),
    true,
    'the marker stays until a durable commit',
  );

  await stateMachine._reconcileLocalOnlyServiceRows();
  t.equal(
    calls.mutations.length,
    1,
    'an immediate second pass is bounded by the per-row backoff',
  );

  gateway.failNext = false;
  nowRef.value += 60_000;
  const persisted = await stateMachine._reconcileLocalOnlyServiceRows();
  t.equal(persisted, 1, 'after the backoff the pass converges the row');
  t.equal(
    stateMachine.isServiceRowLocalOnly(REPLICA_ID),
    false,
    'marker cleared on durable commit',
  );
});

test('shared incarnation rule governs both durable role persistence and local priority seeding with negative controls', async (t) => {
  const nowRef = {value: 1_760_000_000_000};
  const {gateway} = createGateway();
  const stateMachine = createStateMachine({gateway, nowRef});
  const handler = createHandler(stateMachine);

  // Establish incarnation 1 in stateMachine and cache with voter role 'follower'
  stateMachine.registerReplicaSnapshot(REPLICA_ID, {
    partitionId: PARTITION_ID,
    nodeId: NODE_ID,
    state: ReplicaStatus.SYNCING,
    serviceId: REPLICA_ID,
    serviceType: 'partition',
    serviceAddress: `${NODE_ID}/partition/${REPLICA_ID}`,
    replicaIdentity: `${REPLICA_ID}#inc-1`,
    createdAt: 1000,
    stateEnteredAt: 1000,
    durableVersionColumn: 'state_entered_at',
    durableVersion: 1000,
    createAttemptToken: 'attempt-1',
    cleanupToken: null,
  });
  handler.systemTableCache.applySystemTableChange('services', 'UPSERT', {
    service_id: REPLICA_ID,
    replica_id: `${REPLICA_ID}#inc-1`,
    partition_id: PARTITION_ID,
    node_id: NODE_ID,
    service_type: 'partition',
    status: ReplicaStatus.SYNCING,
    raft_role: 'follower',
    created_at: 1000,
    updated_at: 1000,
    create_attempt_token: 'attempt-1',
    cleanup_token: null,
  });

  // Positive case: same incarnation preserves raft_role in both local seeding and durable payload
  handler.seedLocalPriorityServiceRow(REPLICA_ID, PARTITION_ID, ReplicaStatus.ACTIVE, {
    markLocalOnly: false,
  });
  t.equal(
    handler.systemTableCache.get('services', REPLICA_ID)?.raft_role,
    'follower',
    'local priority seed preserves voter role for matching incarnation',
  );
  const matchingDurablePayload = stateMachine._buildCreateCdcData(
    stateMachine.getState(REPLICA_ID),
    REPLICA_ID,
    'partition',
    `${NODE_ID}/partition/${REPLICA_ID}`,
  );
  t.equal(
    matchingDurablePayload.raft_role,
    'follower',
    'durable create payload preserves voter role for matching incarnation',
  );

  // Negative control 1: superseded create_attempt_token must not leak cached raft_role into new incarnation
  stateMachine.replicas.set(REPLICA_ID, {
    ...stateMachine.getState(REPLICA_ID),
    state: ReplicaStatus.CREATING,
    createdAt: 2000,
    stateEnteredAt: 2000,
    durableVersion: 2000,
    createAttemptToken: 'attempt-2',
  });
  const mismatchedAttemptDurablePayload = stateMachine._buildCreateCdcData(
    stateMachine.getState(REPLICA_ID),
    REPLICA_ID,
    'partition',
    `${NODE_ID}/partition/${REPLICA_ID}`,
  );
  t.equal(
    mismatchedAttemptDurablePayload.raft_role,
    undefined,
    'durable create payload rejects cached raft_role from older create_attempt_token',
  );
  // Replace cache entry to verify local seed also rejects mismatched incarnation
  handler.systemTableCache.deleteRow?.('services', REPLICA_ID);
  handler.systemTableCache.applySystemTableChange('services', 'UPSERT', {
    service_id: REPLICA_ID,
    replica_id: `${REPLICA_ID}#inc-1`,
    partition_id: PARTITION_ID,
    node_id: NODE_ID,
    service_type: 'partition',
    status: ReplicaStatus.SYNCING,
    raft_role: 'follower',
    created_at: 1000,
    updated_at: 1000,
    create_attempt_token: 'attempt-1',
  });
  // seedLocalReplicaVoterRaftRole must also refuse to seed onto conflicting cached incarnation
  handler.getTrackedReplicaRole = () => 'follower';
  t.equal(
    handler.seedLocalReplicaVoterRaftRole(REPLICA_ID),
    false,
    'seedLocalReplicaVoterRaftRole refuses to seed voter role onto conflicting cached incarnation',
  );
  handler.getTrackedReplicaRole = () => null;

  // Negative control 2: local ACTIVE seed for attempt-2 must not combine new attempt/created_at
  // metadata with the cached follower role from attempt-1 via SystemTableCache merge
  handler.seedLocalPriorityServiceRow(REPLICA_ID, PARTITION_ID, ReplicaStatus.ACTIVE, {
    markLocalOnly: false,
  });
  const activeAttempt2Row = handler.systemTableCache.get('services', REPLICA_ID);
  t.equal(
    activeAttempt2Row?.create_attempt_token,
    'attempt-2',
    'local ACTIVE seed writes new incarnation attempt token',
  );
  t.equal(
    activeAttempt2Row?.created_at,
    2000,
    'local ACTIVE seed writes new incarnation created_at',
  );
  t.equal(
    activeAttempt2Row?.raft_role,
    null,
    'local ACTIVE seed clears cached raft_role from older incarnation instead of merging it',
  );

  // Negative control 3: when compatible owner evidence is unavailable (untracked replica),
  // local ACTIVE seed must omit/clear cached raft_role
  handler.systemTableCache.applySystemTableChange('services', 'UPSERT', {
    service_id: REPLICA_ID,
    raft_role: 'follower',
    updated_at: 2500,
  });
  stateMachine.replicas.delete(REPLICA_ID);
  handler.seedLocalPriorityServiceRow(REPLICA_ID, PARTITION_ID, ReplicaStatus.ACTIVE, {
    markLocalOnly: false,
  });
  t.equal(
    handler.systemTableCache.get('services', REPLICA_ID)?.raft_role,
    null,
    'local ACTIVE seed clears cached raft_role when owner lifecycle evidence is unavailable',
  );

  // Negative control 4: terminal FAILED seed must never preserve cached raft_role
  handler.systemTableCache.applySystemTableChange('services', 'UPSERT', {
    service_id: REPLICA_ID,
    raft_role: 'follower',
    updated_at: 3000,
  });
  handler.seedLocalPriorityServiceRow(REPLICA_ID, PARTITION_ID, ReplicaStatus.FAILED, {
    markLocalOnly: false,
  });
  const failedRow = handler.systemTableCache.get('services', REPLICA_ID);
  t.equal(failedRow?.status, ReplicaStatus.FAILED, 'row transitioned to failed');
  t.equal(failedRow?.raft_role, null, 'terminal FAILED seed clears cached raft_role');

  // Positive control 5: live tracked voter role is resolved on SYNCING -> ACTIVE
  // when cached SERVICES row had raft_role: null, and preserved across in-flight
  // authoritative catch-up replacement with raft_role: null at <= updated_at
  const {
    buildAuthoritativeSystemTableCacheReplacement,
    buildAuthoritativeServiceLifecycleCacheReplacement,
  } = await import(
    '../../src/cache/system-table-cache-authoritative-reconciliation.js'
  );
  handler.systemTableCache.clear();
  stateMachine.resolveLiveReplicaRole = (serviceId) =>
    handler.getTrackedReplicaRole(serviceId) === 'leader' ? 'follower' : null;
  stateMachine.replicas.set(REPLICA_ID, {
    replicaId: REPLICA_ID,
    replicaIdentity: `${REPLICA_ID}#inc-3`,
    partitionId: PARTITION_ID,
    nodeId: NODE_ID,
    state: ReplicaStatus.ACTIVE,
    previousState: ReplicaStatus.SYNCING,
    createdAt: 4000,
    stateEnteredAt: 4100,
    durableVersion: 4100,
    createAttemptToken: 'attempt-3',
    cleanupToken: null,
  });
  handler.systemTableCache.applySystemTableChange('services', 'UPSERT', {
    service_id: REPLICA_ID,
    replica_id: `${REPLICA_ID}#inc-3`,
    partition_id: PARTITION_ID,
    node_id: NODE_ID,
    service_type: 'partition',
    status: ReplicaStatus.SYNCING,
    raft_role: null,
    created_at: 4000,
    updated_at: 4050,
    create_attempt_token: 'attempt-3',
  });
  handler.getTrackedReplicaRole = () => 'leader';
  t.equal(
    stateMachine._buildUpdateCdcData(
      stateMachine.getState(REPLICA_ID),
      REPLICA_ID,
      ReplicaStatus.SYNCING,
      null,
    ).raft_role,
    'follower',
    'ReplicaStateMachine resolves live voter role on SYNCING -> ACTIVE transition when cached raft_role is null',
  );
  handler.seedLocalPriorityServiceRow(REPLICA_ID, PARTITION_ID, ReplicaStatus.ACTIVE, {
    markLocalOnly: false,
  });
  const seededFromLiveRole = handler.systemTableCache.get('services', REPLICA_ID);
  t.equal(
    seededFromLiveRole?.raft_role,
    'follower',
    'seedLocalPriorityServiceRow resolves live voter role (collapsing leader to follower) when cached raft_role is null',
  );
  const inFlightAuthoritativeRow = {
    ...seededFromLiveRole,
    raft_role: null,
    updated_at: seededFromLiveRole.updated_at,
  };
  t.equal(
    buildAuthoritativeSystemTableCacheReplacement(
      seededFromLiveRole,
      inFlightAuthoritativeRow,
    ).raft_role,
    'follower',
    'buildAuthoritativeSystemTableCacheReplacement preserves non-leader voter raft_role against in-flight null authoritative read',
  );
  t.equal(
    buildAuthoritativeServiceLifecycleCacheReplacement(
      seededFromLiveRole,
      inFlightAuthoritativeRow,
    ).raft_role,
    'follower',
    'buildAuthoritativeServiceLifecycleCacheReplacement preserves non-leader voter raft_role against in-flight null authoritative read',
  );
  t.equal(
    buildAuthoritativeSystemTableCacheReplacement(
      {...seededFromLiveRole, raft_role: 'leader'},
      inFlightAuthoritativeRow,
    ).raft_role,
    null,
    'buildAuthoritativeSystemTableCacheReplacement never preserves leader raft_role when authoritative row clears raft_role',
  );
  const olderCachedRowWithHlc = {
    ...seededFromLiveRole,
    status: ReplicaStatus.CREATING,
    state_entered_at: 4000,
    updated_at: 4000,
    updated_at_hlc: '4000-0-services-p1-r1',
  };
  const newerAuthoritativeRowWithoutHlc = {
    ...seededFromLiveRole,
    status: ReplicaStatus.ACTIVE,
    state_entered_at: 4300,
    updated_at: 4300,
  };
  delete newerAuthoritativeRowWithoutHlc.updated_at_hlc;
  const repairedRow = buildAuthoritativeSystemTableCacheReplacement(
    olderCachedRowWithHlc,
    newerAuthoritativeRowWithoutHlc,
  );
  t.equal(
    repairedRow.updated_at_hlc,
    undefined,
    'buildAuthoritativeSystemTableCacheReplacement drops superseded updated_at_hlc when authoritative updated_at advances',
  );
  handler.systemTableCache.applySystemTableChange('services', 'UPSERT', repairedRow);
  handler.systemTableCache.applySystemTableChange('services', 'UPDATE', {
    ...seededFromLiveRole,
    status: ReplicaStatus.SYNCING,
    state_entered_at: 4200,
    updated_at: 4200,
    updated_at_hlc: '4200-0-services-p1-r1',
  });
  t.equal(
    handler.systemTableCache.get('services', REPLICA_ID)?.status,
    ReplicaStatus.ACTIVE,
    'delayed intermediate CDC event with older updated_at/state_entered_at cannot regress an authoritatively repaired ACTIVE row',
  );
  stateMachine.shutdown?.();
});
