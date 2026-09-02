// Witness for the critical-placement-authoritative-evidence quest (S3).
// Raw node:test so --test-name-pattern selects exactly one scenario and each
// receipt is independently honest.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CRITICAL_PLACEMENT_EVIDENCE_STATE,
  CRITICAL_PLACEMENT_REASON,
  resolveCriticalPlacementConvergence,
} from '../../src/bootstrap/critical-placement-convergence.js';
import {
  CRITICAL_PLACEMENT_EPOCH_STATE,
  CRITICAL_PLACEMENT_OBSERVATION_REASON,
  observeCriticalPlacement,
  resolveCriticalPlacementEvidenceCurrency,
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
  DECLARED_REPLICA_COUNT_DEFAULT,
  REPLICATION_TARGET_SOURCE,
} from '../../src/bootstrap/replication-target-authority.js';
import {
  SYSTEM_TABLE_NAME,
  getInitialReplicaIds,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  MEMBERSHIP_EPOCH_FENCE_STATE,
  isMembershipEpochFenceCurrent,
} from '../../src/control-plane/membership-epoch-contract.js';

const STATE = CRITICAL_PLACEMENT_EVIDENCE_STATE;

function declaredCriticalPartitionIds() {
  return [...CRITICAL_SYSTEM_PARTITION_IDS].sort();
}

// The persisted policy rows a fresh seed actually writes: one partitions row
// per critical partition, replica_count carrying the schema creation default.
// The default is legitimate HERE precisely because the seed PERSISTED it —
// once written it is the authoritative policy row, not a bootstrap guess.
function freshSeedPolicyRows({omit = [], override = {}} = {}) {
  const rows = [];
  for (const partitionId of declaredCriticalPartitionIds()) {
    if (omit.includes(partitionId)) {
      continue;
    }
    rows.push({
      partition_id: partitionId,
      table_id: partitionId.replace(/-p1$/u, ''),
      replica_count: DECLARED_REPLICA_COUNT_DEFAULT,
      ...(override[partitionId] || {}),
    });
  }
  return rows;
}

// Service rows per critical partition. `spread` places every replica on its
// own node; `seedOnly` concentrates every replica of every partition on one
// physical node — the exact shape a cluster is created in.
function serviceRowsFor({omit = [], soloPartitionIds = [], seedOnly = false} = {}) {
  const rows = [];
  declaredCriticalPartitionIds().forEach((partitionId, partitionIndex) => {
    if (omit.includes(partitionId)) {
      return;
    }
    const tableId = partitionId.replace(/-p1$/u, '');
    (getInitialReplicaIds(tableId) || []).forEach((replicaId, replicaIndex) => {
      rows.push({
        service_id: `svc-${replicaId}`,
        service_type: 'partition',
        node_id: seedOnly ?
          'node-seed' :
          soloPartitionIds.includes(partitionId) ?
            `node-${partitionIndex}-solo` :
            `node-${partitionIndex}-${replicaIndex}`,
        partition_id: partitionId,
        replica_id: replicaId,
        raft_role: replicaIndex === 0 ? 'leader' : 'follower',
        status: 'active',
      });
    });
  });
  return rows;
}

function publicationRows(epoch) {
  return epoch === null ? [] : [{status: 'PUBLISHED', publication_epoch: epoch}];
}

// A cache exposing the filter surface over exactly the three evidence tables.
function cacheOf({services = [], partitions = [], publications = []} = {}) {
  const tables = {
    [SYSTEM_TABLE_NAME.SERVICES]: services,
    [SYSTEM_TABLE_NAME.PARTITIONS]: partitions,
    [SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS]: publications,
  };
  return {
    filter: (tableName, predicate) =>
      (tables[tableName] || []).filter(predicate),
  };
}

test('fresh-seed-critical-set-fully-inspected', () => {
  const declared = declaredCriticalPartitionIds();
  const convergence = resolveCriticalPlacementConvergence({
    serviceRows: serviceRowsFor({seedOnly: true}),
    partitionRows: freshSeedPolicyRows(),
  });

  const inspected = convergence.partitions.map((p) => p.partitionId).sort();
  assert.deepEqual(inspected, declared,
    'every declared critical partition is inspected, none invented');

  // Every inspected partition's requirement resolved from its persisted
  // policy row: the count of policy-valid partitions IS the inspected count.
  const policyValid = convergence.partitions.filter((p) =>
    p.requiredReplicaCountSource === REPLICATION_TARGET_SOURCE.PARTITION_ROW);
  assert.equal(policyValid.length, inspected.length,
    'inspected critical partitions == partitions with valid authoritative policy');

  const requiredUnknown = convergence.partitions.filter((p) =>
    p.reasonCode === CRITICAL_PLACEMENT_REASON.REQUIRED_COUNT_UNKNOWN);
  assert.equal(requiredUnknown.length, 0,
    'REQUIRED_COUNT_UNKNOWN == 0 on a fresh seeded cluster');
  assert.deepEqual([...convergence.unknownPartitionIds], []);
});

test('seed-concentrated-placement-is-known-not-converged', () => {
  const convergence = resolveCriticalPlacementConvergence({
    serviceRows: serviceRowsFor({seedOnly: true}),
    partitionRows: freshSeedPolicyRows(),
  });

  assert.equal(convergence.evidenceState, STATE.KNOWN_NOT_CONVERGED,
    'the shape a cluster is created in is a MEASURED deficit, not unknown');
  assert.equal(convergence.converged, false);
  assert.deepEqual([...convergence.pendingPartitionIds].sort(),
    declaredCriticalPartitionIds(),
    'EVERY critical partition is pending, not one');
  assert.deepEqual([...convergence.unknownPartitionIds], [],
    'a valid policy plus measured holders is knowledge, never UNKNOWN');
});

test('spread-placement-is-known-converged', () => {
  const convergence = resolveCriticalPlacementConvergence({
    serviceRows: serviceRowsFor(),
    partitionRows: freshSeedPolicyRows(),
  });

  assert.equal(convergence.evidenceState, STATE.KNOWN_CONVERGED);
  assert.equal(convergence.converged, true);
  assert.deepEqual([...convergence.pendingPartitionIds], []);
  assert.deepEqual([...convergence.unknownPartitionIds], []);
  for (const placement of convergence.partitions) {
    assert.equal(placement.evidenceState, STATE.KNOWN_CONVERGED,
      placement.partitionId);
  }
});

test('partial-spread-names-the-pending-partitions', () => {
  // Three partitions pending by MIXED causes — two with no service rows and
  // one present but on a single node — with pendingPartitionIds asserted to
  // equal exactly those three, sorted. Cardinality three and mixed causes
  // together defeat a constant, a cap-at-one or cap-at-two accumulation, and
  // an implementation keyed on absence alone.
  const declared = declaredCriticalPartitionIds();
  const omitted = [declared[0], declared[Math.floor(declared.length / 2)]];
  const solo = declared[declared.length - 1];
  const expectedPending = [...omitted, solo].sort();
  assert.equal(new Set(expectedPending).size, 3, 'three distinct partitions');

  const convergence = resolveCriticalPlacementConvergence({
    serviceRows: serviceRowsFor({omit: omitted, soloPartitionIds: [solo]}),
    partitionRows: freshSeedPolicyRows(),
  });

  assert.equal(convergence.evidenceState, STATE.KNOWN_NOT_CONVERGED);
  assert.deepEqual([...convergence.pendingPartitionIds], expectedPending);
  assert.deepEqual([...convergence.unknownPartitionIds], [],
    'every requirement here is valid: nothing is UNKNOWN');
});

test('required-rf-resolves-through-the-policy-authority', () => {
  // The divergence probe. Persisted desired RF = 5 while the declared initial
  // replica identity count stays 3: the requirement MUST follow the persisted
  // policy row, so three distinct holders are now a measured deficit. An
  // implementation still counting identities reports converged and reds here.
  const declared = declaredCriticalPartitionIds();
  const probed = declared[0];
  const probedTableId = probed.replace(/-p1$/u, '');
  assert.equal((getInitialReplicaIds(probedTableId) || []).length, 3,
    'the declaration really says 3, so 5 can only come from the row');

  const raised = resolveCriticalPlacementConvergence({
    serviceRows: serviceRowsFor(),
    partitionRows: freshSeedPolicyRows({
      override: {[probed]: {replica_count: 5}},
    }),
  });
  const probedPlacement = raised.partitions.find(
    (p) => p.partitionId === probed);
  assert.equal(probedPlacement.requiredReplicaCount, 5,
    'the requirement is the PERSISTED policy value');
  assert.equal(probedPlacement.requiredReplicaCountSource,
    REPLICATION_TARGET_SOURCE.PARTITION_ROW);
  assert.equal(probedPlacement.evidenceState, STATE.KNOWN_NOT_CONVERGED,
    'three holders under a persisted requirement of five is a deficit');
  assert.equal(raised.evidenceState, STATE.KNOWN_NOT_CONVERGED);

  // And the decision changes where it should: restoring the persisted value
  // to the declared default restores convergence.
  const restored = resolveCriticalPlacementConvergence({
    serviceRows: serviceRowsFor(),
    partitionRows: freshSeedPolicyRows(),
  });
  assert.equal(restored.evidenceState, STATE.KNOWN_CONVERGED);
});

test('absent-policy-evidence-is-unknown-never-known-not-converged', () => {
  // One partition has NO persisted policy row while its holders would satisfy
  // the declared default. Guessing either direction is forbidden: without a
  // requirement the holders prove nothing (never KNOWN_CONVERGED), and a
  // deficit cannot be measured against a requirement that does not exist
  // (never KNOWN_NOT_CONVERGED).
  const declared = declaredCriticalPartitionIds();
  const undeclared = declared[0];

  const convergence = resolveCriticalPlacementConvergence({
    serviceRows: serviceRowsFor(),
    partitionRows: freshSeedPolicyRows({omit: [undeclared]}),
  });

  const placement = convergence.partitions.find(
    (p) => p.partitionId === undeclared);
  assert.equal(placement.evidenceState, STATE.UNKNOWN);
  assert.equal(placement.requiredReplicaCount, 0);
  assert.equal(placement.reasonCode,
    CRITICAL_PLACEMENT_REASON.REQUIRED_COUNT_UNKNOWN);
  assert.equal(placement.distinctNodeCount, 3,
    'the holder rows are real: only the requirement is unreadable');
  assert.deepEqual([...convergence.unknownPartitionIds], [undeclared]);
  assert.deepEqual([...convergence.pendingPartitionIds], [],
    'an unknown requirement never manufactures a deficit');
  assert.equal(convergence.evidenceState, STATE.UNKNOWN,
    'a set containing an unknown and no measured deficit is UNKNOWN');
  assert.equal(convergence.converged, false);
});

test('one-malformed-policy-keeps-only-that-evidence-unknown', () => {
  // A present-but-invalid policy value is the same unreadable requirement as
  // an absent row, and it stays PER-PARTITION: neighbours keep their measured
  // answers. A measured deficit elsewhere still makes the SET provenly not
  // converged — one unknown partition cannot retract another's measurement.
  const declared = declaredCriticalPartitionIds();
  const malformed = declared[0];
  const solo = declared[declared.length - 1];

  const mixedWithDeficit = resolveCriticalPlacementConvergence({
    serviceRows: serviceRowsFor({soloPartitionIds: [solo]}),
    partitionRows: freshSeedPolicyRows({
      override: {[malformed]: {replica_count: '9'}},
    }),
  });
  assert.deepEqual([...mixedWithDeficit.unknownPartitionIds], [malformed],
    'exactly the malformed partition is unknown, no more, no fewer');
  assert.deepEqual([...mixedWithDeficit.pendingPartitionIds], [solo]);
  assert.equal(mixedWithDeficit.evidenceState, STATE.KNOWN_NOT_CONVERGED,
    'a measured deficit under valid policy is knowledge');

  const mixedWithoutDeficit = resolveCriticalPlacementConvergence({
    serviceRows: serviceRowsFor(),
    partitionRows: freshSeedPolicyRows({
      override: {[malformed]: {replica_count: '9'}},
    }),
  });
  assert.deepEqual([...mixedWithoutDeficit.unknownPartitionIds], [malformed]);
  assert.equal(mixedWithoutDeficit.evidenceState, STATE.UNKNOWN,
    'every neighbour satisfied plus one unknown is UNKNOWN, never CONVERGED');
});

test('bootstrap-expected-rf-cannot-turn-unknown-into-known', () => {
  // The schema creation default would EXACTLY satisfy these holders, so any
  // implementation that falls back to it reports KNOWN_CONVERGED here and
  // reds this receipt. The bootstrap expected RF may keep a formation barrier
  // blocked; it may never mint knowledge.
  const declared = declaredCriticalPartitionIds();
  const undeclared = declared[0];
  assert.ok(DECLARED_REPLICA_COUNT_DEFAULT >= 1,
    'the schema really declares a creation default');

  const convergence = resolveCriticalPlacementConvergence({
    serviceRows: serviceRowsFor(),
    partitionRows: freshSeedPolicyRows({omit: [undeclared]}),
  });
  const placement = convergence.partitions.find(
    (p) => p.partitionId === undeclared);
  assert.ok(placement.distinctNodeCount >= DECLARED_REPLICA_COUNT_DEFAULT,
    'the fixture holders would satisfy the default — the temptation is real');
  assert.equal(placement.evidenceState, STATE.UNKNOWN,
    'holders satisfying a DEFAULT prove nothing about undeclared policy');
  assert.notEqual(placement.requiredReplicaCount,
    DECLARED_REPLICA_COUNT_DEFAULT,
    'the creation default must not be readable as this row\'s requirement');
});

test('unreadable-cache-is-typed-unknown', () => {
  // Every unreadable evidence surface is typed UNKNOWN with the surface
  // named; none is a deficit verdict. Six whole-cache shapes, then each
  // single-table failure in isolation.
  const wholeCacheShapes = [
    ['absent cache', undefined],
    ['null cache', null],
    ['no read surface', {}],
    ['non-function filter', {filter: 42}],
    ['filter answering null', {filter: () => null}],
    ['filter answering a string', {filter: () => 'rows'}],
  ];
  for (const [label, systemTableCache] of wholeCacheShapes) {
    const observation = observeCriticalPlacement({systemTableCache});
    assert.equal(observation.evidenceState, STATE.UNKNOWN, label);
    assert.equal(observation.converged, false, label);
    assert.ok(observation.reasonCodes.includes(
      CRITICAL_PLACEMENT_OBSERVATION_REASON.SERVICES_EVIDENCE_UNREADABLE),
    `${label} names the services surface`);
    assert.ok(observation.reasonCodes.includes(
      CRITICAL_PLACEMENT_OBSERVATION_REASON
        .PARTITION_POLICY_EVIDENCE_UNREADABLE),
    `${label} names the policy surface`);
    assert.deepEqual([...observation.pendingPartitionIds], [],
      `${label} mints no deficit`);
  }

  // Only the PARTITIONS table unreadable: holder evidence alone answers
  // nothing, and the reason names exactly the failed surface.
  const partitionsThrow = {
    filter: (tableName, predicate) => {
      if (tableName === SYSTEM_TABLE_NAME.PARTITIONS) {
        throw new Error('policy surface refused');
      }
      const tables = {
        [SYSTEM_TABLE_NAME.SERVICES]: serviceRowsFor(),
        [SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS]: publicationRows(1),
      };
      return (tables[tableName] || []).filter(predicate);
    },
  };
  const policyUnreadable = observeCriticalPlacement({
    systemTableCache: partitionsThrow});
  assert.equal(policyUnreadable.evidenceState, STATE.UNKNOWN);
  assert.deepEqual([...policyUnreadable.reasonCodes], [
    CRITICAL_PLACEMENT_OBSERVATION_REASON.PARTITION_POLICY_EVIDENCE_UNREADABLE,
  ], 'exactly the policy surface is named, and nothing is projected');

  // An async cache answers thenables for every table: typed unreadable, and
  // the promise is never mistaken for rows.
  const asyncCache = {filter: async () => []};
  const asyncObservation = observeCriticalPlacement({
    systemTableCache: asyncCache});
  assert.equal(asyncObservation.evidenceState, STATE.UNKNOWN);
});

test('stale-topology-evidence-cannot-authorize-current-topology', () => {
  // The observation is stamped with the membership publication epoch it was
  // computed under; the evidence-currency boundary then runs the membership
  // epoch owner's fence over that stamp. A consumer that would authorize on
  // this evidence asks the boundary, never a local comparison.
  const observedUnderEpoch4 = observeCriticalPlacement({
    systemTableCache: cacheOf({
      services: serviceRowsFor(),
      partitions: freshSeedPolicyRows(),
      publications: publicationRows(4),
    }),
  });
  assert.equal(observedUnderEpoch4.evidenceState, STATE.KNOWN_CONVERGED,
    'the evidence itself is a genuine KNOWN_CONVERGED');
  assert.equal(observedUnderEpoch4.membershipEpoch.state,
    CRITICAL_PLACEMENT_EPOCH_STATE.AVAILABLE);
  assert.equal(observedUnderEpoch4.membershipEpoch.value, 4);

  // Superseded membership: the consumer's current epoch has moved to 5.
  const staleFence = resolveCriticalPlacementEvidenceCurrency(
    observedUnderEpoch4, 5);
  assert.equal(staleFence.state, MEMBERSHIP_EPOCH_FENCE_STATE.STALE,
    'a KNOWN_CONVERGED from a superseded membership is refused');
  assert.equal(isMembershipEpochFenceCurrent(staleFence), false);

  // The topology the evidence actually described: still current.
  const currentFence = resolveCriticalPlacementEvidenceCurrency(
    observedUnderEpoch4, 4);
  assert.equal(currentFence.state, MEMBERSHIP_EPOCH_FENCE_STATE.CURRENT);
  assert.equal(isMembershipEpochFenceCurrent(currentFence), true,
    'the same evidence IS current for the topology it described');

  // Evidence from a membership the consumer has not yet seen is refused too:
  // both directions of divergence fail closed.
  const futureFence = resolveCriticalPlacementEvidenceCurrency(
    observedUnderEpoch4, 3);
  assert.equal(futureFence.state, MEMBERSHIP_EPOCH_FENCE_STATE.FUTURE);
  assert.equal(isMembershipEpochFenceCurrent(futureFence), false);

  // An unreadable publications surface stamps the epoch UNAVAILABLE, and the
  // boundary resolves an unavailable stamp to UNKNOWN currency — never to
  // CURRENT.
  const publicationsThrow = {
    filter: (tableName, predicate) => {
      if (tableName === SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS) {
        throw new Error('publication surface refused');
      }
      const tables = {
        [SYSTEM_TABLE_NAME.SERVICES]: serviceRowsFor(),
        [SYSTEM_TABLE_NAME.PARTITIONS]: freshSeedPolicyRows(),
      };
      return (tables[tableName] || []).filter(predicate);
    },
  };
  const unstamped = observeCriticalPlacement({
    systemTableCache: publicationsThrow});
  assert.equal(unstamped.membershipEpoch.state,
    CRITICAL_PLACEMENT_EPOCH_STATE.UNAVAILABLE);
  assert.ok(unstamped.reasonCodes.includes(
    CRITICAL_PLACEMENT_OBSERVATION_REASON.MEMBERSHIP_EPOCH_UNAVAILABLE));
  assert.equal(unstamped.evidenceState, STATE.KNOWN_CONVERGED,
    'the placement measurement itself survives: only currency is unknown');
  const unstampedFence = resolveCriticalPlacementEvidenceCurrency(
    unstamped, 4);
  assert.equal(unstampedFence.state, MEMBERSHIP_EPOCH_FENCE_STATE.UNKNOWN);
  assert.equal(isMembershipEpochFenceCurrent(unstampedFence), false);
});

test('observer-mints-no-readiness-state', () => {
  const observation = observeCriticalPlacement({
    systemTableCache: cacheOf({
      services: serviceRowsFor(),
      partitions: freshSeedPolicyRows(),
      publications: publicationRows(1),
    }),
  });

  const forbidden = ['ready', 'active', 'phase', 'verdict', 'status',
    'trafficReady', 'lifecycle', 'state'];
  for (const key of forbidden) {
    assert.equal(Object.hasOwn(observation, key), false,
      `observation must not mint ${key}`);
  }
  assert.equal(Object.isFrozen(observation), true);
  assert.equal(Object.isFrozen(observation.reasonCodes), true);
  assert.equal(Object.isFrozen(observation.pendingPartitionIds), true);
  assert.equal(Object.isFrozen(observation.unknownPartitionIds), true);
  assert.equal(Object.isFrozen(observation.membershipEpoch), true);
});

test('barrier-release-is-unchanged-by-the-observation', () => {
  // The barrier's release decision is a pure function of cohort engagement,
  // the discovery deadline and startup authority; the critical-placement
  // observation rides the snapshot as reported evidence only. Identical
  // inputs with and without the observation must resolve the identical
  // state, across every reachable release state.
  const scenarios = [
    [{barrierEngaged: false, discoveryDeadline: 100,
      snapshot: {now: 50, startupAuthorityReady: false}},
    OPERATION_LEDGER_FORMATION_BARRIER_STATE.WAITING_COHORT],
    [{barrierEngaged: false, discoveryDeadline: 100,
      snapshot: {now: 150, startupAuthorityReady: false}},
    OPERATION_LEDGER_FORMATION_BARRIER_STATE.BYPASSED_INSUFFICIENT_COHORT],
    [{barrierEngaged: true, discoveryDeadline: 100,
      snapshot: {now: 50, startupAuthorityReady: false}},
    OPERATION_LEDGER_FORMATION_BARRIER_STATE.WAITING_STARTUP_AUTHORITY],
    [{barrierEngaged: true, discoveryDeadline: 100,
      snapshot: {now: 50, startupAuthorityReady: true}},
    OPERATION_LEDGER_FORMATION_BARRIER_STATE.SATISFIED],
  ];

  const pendingObservation = observeCriticalPlacement({
    systemTableCache: cacheOf({
      services: serviceRowsFor({seedOnly: true}),
      partitions: freshSeedPolicyRows(),
      publications: publicationRows(1),
    }),
  });
  assert.equal(pendingObservation.evidenceState, STATE.KNOWN_NOT_CONVERGED,
    'the observation genuinely reports a deficit while release proceeds');

  for (const [input, expected] of scenarios) {
    const without = resolveOperationLedgerFormationBarrierState(input);
    const withObservation = resolveOperationLedgerFormationBarrierState({
      ...input,
      snapshot: {...input.snapshot, criticalPlacement: pendingObservation},
    });
    assert.equal(without, expected);
    assert.equal(withObservation, expected,
      'the observation must not move the release decision');
  }
});

test('barrier-log-fields-carry-the-observation', () => {
  const observation = observeCriticalPlacement({
    systemTableCache: cacheOf({
      services: serviceRowsFor({seedOnly: true}),
      partitions: freshSeedPolicyRows(),
      publications: publicationRows(2),
    }),
  });
  const fields = buildOperationLedgerFormationBarrierLogFields({
    partitionId: 'replica_operations-p1',
    candidateNodeIds: [],
    preReadyCandidateNodeIds: [],
    targetReplicaCount: 3,
    criticalPlacement: observation,
  });

  assert.equal(fields.criticalPlacementEvidenceState,
    STATE.KNOWN_NOT_CONVERGED);
  assert.equal(fields.criticalPlacementConverged, false);
  assert.deepEqual([...fields.criticalPlacementPendingPartitionIds].sort(),
    declaredCriticalPartitionIds());
  assert.deepEqual([...fields.criticalPlacementUnknownPartitionIds], []);
  assert.ok(fields.criticalPlacementObservedPartitionCount > 0);
  assert.equal(fields.criticalPlacementMembershipEpochState,
    CRITICAL_PLACEMENT_EPOCH_STATE.AVAILABLE);
  assert.equal(fields.criticalPlacementMembershipEpoch, 2);

  // A snapshot without the observation still logs typed absence.
  const absent = buildOperationLedgerFormationBarrierLogFields({
    partitionId: 'replica_operations-p1',
    candidateNodeIds: [],
    preReadyCandidateNodeIds: [],
    targetReplicaCount: 3,
  });
  assert.equal(absent.criticalPlacementEvidenceState, null);
  assert.equal(absent.criticalPlacementConverged, false);
});

test('witness-deterministic', () => {
  const build = () => observeCriticalPlacement({
    systemTableCache: cacheOf({
      services: serviceRowsFor({soloPartitionIds:
        [declaredCriticalPartitionIds()[0]]}),
      partitions: freshSeedPolicyRows(),
      publications: publicationRows(3),
    }),
  });
  const reversed = () => observeCriticalPlacement({
    systemTableCache: cacheOf({
      services: [...serviceRowsFor({soloPartitionIds:
        [declaredCriticalPartitionIds()[0]]})].reverse(),
      partitions: [...freshSeedPolicyRows()].reverse(),
      publications: publicationRows(3),
    }),
  });

  const first = JSON.parse(JSON.stringify(build()));
  const second = JSON.parse(JSON.stringify(build()));
  const rowOrderInsensitive = JSON.parse(JSON.stringify(reversed()));
  assert.deepEqual(first, second, 'repetition must not change the answer');
  assert.deepEqual(first, rowOrderInsensitive,
    'row order must not change the answer');
});
