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
  CRITICAL_SYSTEM_PARTITION_IDS,
} from '../../src/bootstrap/system-partition-classification.js';
import {
  DECLARED_REPLICA_COUNT_DEFAULT,
  REPLICATION_TARGET_SOURCE,
} from '../../src/bootstrap/replication-target-authority.js';
import {
  getInitialReplicaIds,
} from '../../src/bootstrap/system-table-schemas-constants.js';

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

test('witness-deterministic', () => {
  const build = () => resolveCriticalPlacementConvergence({
    serviceRows: serviceRowsFor({
      soloPartitionIds: [declaredCriticalPartitionIds()[0]],
    }),
    partitionRows: freshSeedPolicyRows(),
  });
  const reversed = () => resolveCriticalPlacementConvergence({
    serviceRows: [...serviceRowsFor({
      soloPartitionIds: [declaredCriticalPartitionIds()[0]],
    })].reverse(),
    partitionRows: [...freshSeedPolicyRows()].reverse(),
  });

  const first = JSON.parse(JSON.stringify(build()));
  const second = JSON.parse(JSON.stringify(build()));
  const rowOrderInsensitive = JSON.parse(JSON.stringify(reversed()));
  assert.deepEqual(first, second, 'repetition must not change the answer');
  assert.deepEqual(first, rowOrderInsensitive,
    'row order must not change the answer');
});
