// Witness for the critical-placement-formation-observer quest.
// Raw node:test so --test-name-pattern selects exactly one scenario.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CRITICAL_PLACEMENT_OBSERVATION_STATE,
  observeCriticalPlacement,
} from '../../src/bootstrap/critical-placement-formation-observer.js';
import {
  OPERATION_LEDGER_FORMATION_BARRIER_STATE,
  buildOperationLedgerFormationBarrierLogFields,
  resolveOperationLedgerFormationBarrierState,
} from '../../src/bootstrap/node-joining-operation-ledger-formation-readiness.js';
import {
  CRITICAL_SYSTEM_PARTITION_IDS,
} from '../../src/bootstrap/system-partition-classification.js';
import {
  SYSTEM_TABLE_NAME,
  getInitialReplicaIds,
} from '../../src/bootstrap/system-table-schemas-constants.js';

// A cache that answers only for the services table, the way the real one does.
function cacheOf(rows) {
  return {
    filter: (tableName, predicate) =>
      tableName === SYSTEM_TABLE_NAME.SERVICES ?
        rows.filter(predicate) :
        [],
  };
}

function rowsFor({omit = [], soloIndex = -1} = {}) {
  const declared = [...CRITICAL_SYSTEM_PARTITION_IDS].sort();
  const rows = [];
  declared.forEach((partitionId, partitionIndex) => {
    if (omit.includes(partitionId)) {
      return;
    }
    const tableId = partitionId.replace(/-p1$/u, '');
    (getInitialReplicaIds(tableId) || []).forEach((replicaId, replicaIndex) => {
      rows.push({
        service_id: `svc-${replicaId}`,
        service_type: 'partition',
        node_id: partitionIndex === soloIndex ?
          `node-${partitionIndex}-solo` :
          `node-${partitionIndex}-${replicaIndex}`,
        partition_id: partitionId,
        replica_id: replicaId,
        raft_role: replicaIndex === 0 ? 'leader' : 'follower',
        status: 'active',
      });
    });
  });
  return {declared, rows};
}

test('spread-critical-set-observes-converged', () => {
  const {rows} = rowsFor();
  const observation = observeCriticalPlacement({systemTableCache: cacheOf(rows)});
  assert.equal(observation.converged, true);
  assert.equal(observation.state,
    CRITICAL_PLACEMENT_OBSERVATION_STATE.CONVERGED);
  assert.deepEqual([...observation.pendingPartitionIds], []);
  assert.ok(observation.observedPartitionCount > 0);
});

test('seed-local-critical-set-observes-pending', () => {
  // The shape a cluster is actually created in: every critical partition holds
  // its full replica count on the seed alone.
  const rows = [];
  for (const partitionId of CRITICAL_SYSTEM_PARTITION_IDS) {
    const tableId = partitionId.replace(/-p1$/u, '');
    (getInitialReplicaIds(tableId) || []).forEach((replicaId, index) => {
      rows.push({
        service_id: `svc-${replicaId}`,
        service_type: 'partition',
        node_id: 'seed',
        partition_id: partitionId,
        replica_id: replicaId,
        raft_role: index === 0 ? 'leader' : 'follower',
        status: 'active',
      });
    });
  }
  const observation = observeCriticalPlacement({systemTableCache: cacheOf(rows)});
  assert.equal(observation.converged, false,
    'a seed-local critical set has not reached its serving topology');
  assert.equal(observation.state, CRITICAL_PLACEMENT_OBSERVATION_STATE.PENDING);
  assert.equal(observation.pendingPartitionIds.length,
    observation.observedPartitionCount,
    'every critical partition is pending, not just one');
});

test('partial-spread-names-the-pending-partitions', () => {
  // Mixed causes, and more than one pending id, so neither a constant nor a
  // cap-at-one implementation satisfies it.
  const declared = [...CRITICAL_SYSTEM_PARTITION_IDS].sort();
  const omitted = [declared[0], declared[Math.floor(declared.length / 2)]];
  const soloIndex = declared.length - 1;
  const {rows} = rowsFor({omit: omitted, soloIndex});
  const expected = [...omitted, declared[soloIndex]].sort();

  const observation = observeCriticalPlacement({systemTableCache: cacheOf(rows)});
  assert.equal(observation.converged, false);
  assert.deepEqual([...observation.pendingPartitionIds], expected,
    'pending names exactly the partitions not spread, by both causes');
});

test('unavailable-cache-is-typed-and-not-converged', () => {
  for (const systemTableCache of [
    undefined, null, {}, {filter: 'not a function'},
    {filter: () => null}, {filter: () => 'rows'},
  ]) {
    const observation = observeCriticalPlacement({systemTableCache});
    assert.equal(observation.converged, false,
      'an unreadable cache is never convergence');
    assert.equal(observation.state,
      CRITICAL_PLACEMENT_OBSERVATION_STATE.CACHE_UNAVAILABLE);
    assert.equal(observation.observedPartitionCount, 0);
    assert.deepEqual([...observation.pendingPartitionIds], []);
  }
});

test('observer-reads-only-the-services-table', () => {
  const asked = [];
  const cache = {
    filter: (tableName) => {
      asked.push(tableName);
      return [];
    },
  };
  observeCriticalPlacement({systemTableCache: cache});
  assert.deepEqual(asked, [SYSTEM_TABLE_NAME.SERVICES],
    'exactly one table read, so the observation cannot drift onto another');
});

test('observer-mints-no-readiness-state', () => {
  const {rows} = rowsFor();
  const observation = observeCriticalPlacement({systemTableCache: cacheOf(rows)});
  for (const key of ['ready', 'phase', 'active', 'verdict', 'release',
    'barrier', 'admitted']) {
    assert.equal(Object.hasOwn(observation, key), false,
      `the observer must not mint ${key}`);
  }
  assert.equal(Object.isFrozen(observation), true);
  assert.deepEqual(Object.keys(observation).sort(),
    ['converged', 'observedPartitionCount', 'pendingPartitionIds', 'state']);
});

test('barrier-release-is-unchanged-by-the-observation', () => {
  // BEHAVIOURAL control, not a source-string check: a string slice misses a
  // helper defined above the slice, a computed property access, an override in
  // the snapshot builder, or a conjunction added in the wait loop. Drive the
  // REAL release resolver and require the answer to be identical whether the
  // observation says converged or pending.
  const base = {
    now: 1000,
    startupAuthorityReady: true,
    candidateNodeIds: [], preReadyCandidateNodeIds: [],
  };
  const converged = Object.freeze({
    state: CRITICAL_PLACEMENT_OBSERVATION_STATE.CONVERGED,
    converged: true, pendingPartitionIds: Object.freeze([]),
    observedPartitionCount: 45,
  });
  const pending = Object.freeze({
    state: CRITICAL_PLACEMENT_OBSERVATION_STATE.PENDING,
    converged: false,
    pendingPartitionIds: Object.freeze(['services-p1']),
    observedPartitionCount: 45,
  });

  for (const barrierEngaged of [true, false]) {
    for (const startupAuthorityReady of [true, false]) {
      const args = (criticalPlacement) => ({
        barrierEngaged,
        discoveryDeadline: 2000,
        snapshot: {...base, startupAuthorityReady, criticalPlacement},
      });
      assert.equal(
        resolveOperationLedgerFormationBarrierState(args(pending)),
        resolveOperationLedgerFormationBarrierState(args(converged)),
        `release must ignore the observation (engaged=${barrierEngaged}, ` +
        `authority=${startupAuthorityReady})`);
      // And the absent case must behave identically too.
      assert.equal(
        resolveOperationLedgerFormationBarrierState(args(undefined)),
        resolveOperationLedgerFormationBarrierState(args(converged)));
    }
  }

  // The satisfied answer still comes from the startup-authority alone.
  assert.equal(
    resolveOperationLedgerFormationBarrierState({
      barrierEngaged: true, discoveryDeadline: 2000,
      snapshot: {...base, criticalPlacement: pending},
    }),
    OPERATION_LEDGER_FORMATION_BARRIER_STATE.SATISFIED);
});

test('barrier-log-fields-carry-the-observation', () => {
  // Witnesses the WIRING: without this, replacing the barrier's observation
  // with observeCriticalPlacement({}) or a hardcoded converged:true left the
  // whole bar green, so the slice could report nothing and still pass.
  const snapshot = {
    partitionId: 'replica_operations-p1',
    candidateNodeIds: ['a', 'b'], preReadyCandidateNodeIds: ['a'],
    targetReplicaCount: 3,
    criticalPlacement: {
      state: CRITICAL_PLACEMENT_OBSERVATION_STATE.PENDING,
      converged: false,
      pendingPartitionIds: ['services-p1', 'nodes-p1'],
      observedPartitionCount: 45,
    },
  };
  const fields = buildOperationLedgerFormationBarrierLogFields(snapshot);
  assert.equal(fields.criticalPlacementState,
    CRITICAL_PLACEMENT_OBSERVATION_STATE.PENDING);
  assert.equal(fields.criticalPlacementConverged, false);
  assert.deepEqual(fields.criticalPlacementPendingPartitionIds,
    ['services-p1', 'nodes-p1']);
  assert.equal(fields.criticalPlacementObservedPartitionCount, 45);

  // A snapshot WITHOUT the observation must project defaults, never throw:
  // callers in the convergence lane build barrier snapshots by hand.
  const bare = buildOperationLedgerFormationBarrierLogFields({
    partitionId: 'x', candidateNodeIds: [], preReadyCandidateNodeIds: [],
  });
  assert.equal(bare.criticalPlacementState, null);
  assert.equal(bare.criticalPlacementConverged, false);
  assert.deepEqual(bare.criticalPlacementPendingPartitionIds, []);
  assert.equal(bare.criticalPlacementObservedPartitionCount, 0);
});

test('async-or-throwing-cache-is-typed-unreadable', () => {
  // SystemCacheProxy.filter is ASYNC: treating a thenable as rows would drop
  // the promise and report a permanent unavailable that names no cause.
  const asyncCache = {filter: async () => []};
  const asyncObservation = observeCriticalPlacement({
    systemTableCache: asyncCache,
  });
  assert.equal(asyncObservation.converged, false);
  assert.equal(asyncObservation.state,
    CRITICAL_PLACEMENT_OBSERVATION_STATE.CACHE_UNAVAILABLE);

  // A throwing cache must not escape and abort the barrier snapshot that
  // merely reports this observation.
  const throwingCache = {filter: () => {
    throw new Error('cache exploded');
  }};
  let observation = null;
  assert.doesNotThrow(() => {
    observation = observeCriticalPlacement({systemTableCache: throwingCache});
  });
  assert.equal(observation.converged, false);
  assert.equal(observation.state,
    CRITICAL_PLACEMENT_OBSERVATION_STATE.CACHE_UNAVAILABLE);
});

test('witness-deterministic', () => {
  const {rows} = rowsFor();
  const shape = () => JSON.stringify(
    observeCriticalPlacement({systemTableCache: cacheOf(rows)}));
  const first = shape();
  assert.equal(shape(), first);
  assert.equal(JSON.stringify(observeCriticalPlacement({
    systemTableCache: cacheOf([...rows].reverse()),
  })), first, 'row order must not change the observation');
});
