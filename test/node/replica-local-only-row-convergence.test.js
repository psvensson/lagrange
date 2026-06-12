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

const NODE_ID = 'node-a';
const REPLICA_ID = 'control_plane_publications-p1-r5';
const PARTITION_ID = 'control_plane_publications-p1';

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
    async submitMutation(mutation, _options) {
      calls.mutations.push(mutation);
      if (gateway.failNext) {
        const error = new Error('control plane not writable');
        error.retryable = true;
        throw error;
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
        'upsert',
        'local-only rows persist via idempotent UPSERT',
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
