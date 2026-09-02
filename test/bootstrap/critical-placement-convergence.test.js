// Witness for the critical-system-placement-distinct-node-invariant quest.
// Raw node:test (not the tap shim) so --test-name-pattern selects exactly one
// scenario and each receipt is independently honest.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CRITICAL_PLACEMENT_EVIDENCE_STATE,
  CRITICAL_PLACEMENT_REASON,
  isCriticalPlacementPartitionId,
  resolveAggregatePlacementEvidenceState,
  resolveCriticalPartitionPlacement,
  resolveCriticalPlacementConvergence,
} from '../../src/bootstrap/critical-placement-convergence.js';
import {
  DECLARED_REPLICA_COUNT_DEFAULT,
  REPLICATION_TARGET_SOURCE,
} from '../../src/bootstrap/replication-target-authority.js';
import {
  CRITICAL_SYSTEM_PARTITION_IDS,
} from '../../src/bootstrap/system-partition-classification.js';
import {
  SYSTEM_TABLE_NAME,
  getInitialReplicaIds,
} from '../../src/bootstrap/system-table-schemas-constants.js';

const SERVICES_PARTITION_ID = `${SYSTEM_TABLE_NAME.SERVICES}-p1`;

function serviceRow(replicaId, nodeId, overrides = {}) {
  return {
    service_id: `svc-${replicaId}`,
    service_type: 'partition',
    node_id: nodeId,
    partition_id: SERVICES_PARTITION_ID,
    replica_id: replicaId,
    raft_role: 'follower',
    status: 'active',
    ...overrides,
  };
}

// The exact shape system tables are created with: three logical replicas, one
// physical failure domain.
function seedLocalRows() {
  return [
    serviceRow(`${SERVICES_PARTITION_ID}-r1`, 'seed'),
    serviceRow(`${SERVICES_PARTITION_ID}-r2`, 'seed'),
    serviceRow(`${SERVICES_PARTITION_ID}-r3`, 'seed'),
  ];
}

function spreadRows() {
  return [
    serviceRow(`${SERVICES_PARTITION_ID}-r1`, 'seed'),
    serviceRow(`${SERVICES_PARTITION_ID}-r2`, 'node-2'),
    serviceRow(`${SERVICES_PARTITION_ID}-r3`, 'node-3'),
  ];
}

// The persisted policy row the seed writes for this partition: the schema
// creation default, PERSISTED — from then on it is the authoritative policy,
// which is the only place a requirement may come from.
function servicesPolicyRow(overrides = {}) {
  return {
    partition_id: SERVICES_PARTITION_ID,
    table_id: SYSTEM_TABLE_NAME.SERVICES,
    replica_count: DECLARED_REPLICA_COUNT_DEFAULT,
    ...overrides,
  };
}

function criticalPolicyRows() {
  return [...CRITICAL_SYSTEM_PARTITION_IDS].sort().map((partitionId) => ({
    partition_id: partitionId,
    table_id: partitionId.replace(/-p1$/u, ''),
    replica_count: DECLARED_REPLICA_COUNT_DEFAULT,
  }));
}

test('seed-local-replicas-are-not-converged', () => {
  const rows = seedLocalRows();
  assert.equal(rows.length, 3, 'fixture holds the full logical replica count');

  const placement = resolveCriticalPartitionPlacement({
    partitionId: SERVICES_PARTITION_ID,
    partitionRow: servicesPolicyRow(),
    serviceRows: rows,
  });

  assert.equal(placement.requiredReplicaCount, 3);
  assert.equal(placement.distinctNodeCount, 1);
  assert.equal(placement.converged, false,
    'three replicas on one node must NOT satisfy formation readiness');
  assert.equal(placement.reasonCode,
    CRITICAL_PLACEMENT_REASON.INSUFFICIENT_DISTINCT_NODES);
});

test('distinct-nodes-meeting-required-count-are-converged', () => {
  const placement = resolveCriticalPartitionPlacement({
    partitionId: SERVICES_PARTITION_ID,
    partitionRow: servicesPolicyRow(),
    serviceRows: spreadRows(),
  });

  assert.equal(placement.distinctNodeCount, 3);
  assert.deepEqual([...placement.distinctNodeIds], ['node-2', 'node-3', 'seed']);
  assert.equal(placement.converged, true);
  assert.equal(placement.reasonCode, CRITICAL_PLACEMENT_REASON.CONVERGED);

  // OVER-spread is the second input shape reaching convergence, and every
  // fixture previously reached it only by distinct === required. The bound is
  // `>=`, not `===`: a partition on MORE nodes than its replica count is
  // converged. Narrowing it would be a liveness defect — on any cluster larger
  // than the replication factor, ordinary rebalancing or learner promotion
  // produces over-spread and formation would never be observable as complete.
  const overSpread = resolveCriticalPartitionPlacement({
    partitionId: SERVICES_PARTITION_ID,
    partitionRow: servicesPolicyRow(),
    serviceRows: [
      ...spreadRows(),
      serviceRow(`${SERVICES_PARTITION_ID}-r4`, 'node-4'),
    ],
  });

  assert.ok(overSpread.distinctNodeCount > overSpread.requiredReplicaCount,
    'the over-spread fixture must exceed the required count, not equal it');
  assert.equal(overSpread.distinctNodeCount, 4);
  assert.equal(overSpread.requiredReplicaCount, 3);
  assert.equal(overSpread.converged, true);
  assert.equal(overSpread.reasonCode, CRITICAL_PLACEMENT_REASON.CONVERGED);
});

test('critical-set-is-the-declared-vocabulary', () => {
  const convergence = resolveCriticalPlacementConvergence({serviceRows: []});
  const evaluated = convergence.partitions.map((p) => p.partitionId).sort();
  const declared = [...CRITICAL_SYSTEM_PARTITION_IDS].sort();

  assert.deepEqual(evaluated, declared,
    'the evaluator must read the declared critical set, not a local copy');
  for (const partitionId of declared) {
    assert.equal(isCriticalPlacementPartitionId(partitionId), true);
  }
  assert.equal(isCriticalPlacementPartitionId('user_table-p1'), false);
});

test('required-count-derives-from-authoritative-policy', () => {
  // The requirement is the PERSISTED policy row resolved through the
  // replication-target authority — not the declared initial replica
  // identities. An identity count is runtime state: the epic measured a
  // minted replace-replica identity dragging a length-derived denominator to
  // 4, and S1 only made the declaration un-mutable. Here the two sources are
  // forced APART, so an implementation reading either the declaration or a
  // schema default cannot stay green.
  const declaredIdentityCount =
    getInitialReplicaIds(SYSTEM_TABLE_NAME.SERVICES).length;
  const divergedRequirement = declaredIdentityCount + 2;

  const placement = resolveCriticalPartitionPlacement({
    partitionId: SERVICES_PARTITION_ID,
    partitionRow: servicesPolicyRow({replica_count: divergedRequirement}),
    serviceRows: spreadRows(),
  });
  assert.equal(placement.requiredReplicaCount, divergedRequirement,
    'required count must come from the persisted policy row');
  assert.equal(placement.requiredReplicaCountSource,
    REPLICATION_TARGET_SOURCE.PARTITION_ROW);
  assert.notEqual(placement.requiredReplicaCount, declaredIdentityCount,
    'the identity count is forced apart and must not win');
  assert.equal(placement.tableId, SYSTEM_TABLE_NAME.SERVICES);
  assert.equal(placement.converged, false,
    'three holders under a persisted requirement of five is a deficit');

  // NO policy row is an UNREADABLE requirement, which must fail closed to
  // UNKNOWN — even though the holders would satisfy both the identity count
  // and the schema creation default.
  const undeclared = resolveCriticalPartitionPlacement({
    partitionId: SERVICES_PARTITION_ID,
    serviceRows: spreadRows(),
  });
  assert.equal(undeclared.requiredReplicaCount, 0);
  assert.equal(undeclared.requiredReplicaCountSource,
    REPLICATION_TARGET_SOURCE.UNDECLARED);
  assert.equal(undeclared.distinctNodeCount, 3,
    'the rows are real: only the requirement is unreadable');
  assert.equal(undeclared.converged, false,
    'an undeclared requirement must fail closed, never open');
  assert.equal(undeclared.reasonCode,
    CRITICAL_PLACEMENT_REASON.REQUIRED_COUNT_UNKNOWN);
  assert.equal(undeclared.evidenceState,
    CRITICAL_PLACEMENT_EVIDENCE_STATE.UNKNOWN,
    'absent policy is UNKNOWN, never a guessed KNOWN state');

  // A present-but-invalid value is the same unreadable requirement: the
  // authority's strict decode refuses a string, a zero and a negative, and
  // no schema default may stand in for what the row failed to declare.
  for (const invalidValue of ['9', 0, -3, 2.5, null]) {
    const invalid = resolveCriticalPartitionPlacement({
      partitionId: SERVICES_PARTITION_ID,
      partitionRow: servicesPolicyRow({replica_count: invalidValue}),
      serviceRows: spreadRows(),
    });
    assert.equal(invalid.requiredReplicaCount, 0,
      `${String(invalidValue)} is not a readable requirement`);
    assert.equal(invalid.evidenceState,
      CRITICAL_PLACEMENT_EVIDENCE_STATE.UNKNOWN,
      `${String(invalidValue)} must resolve UNKNOWN`);
    assert.notEqual(invalid.requiredReplicaCount,
      DECLARED_REPLICA_COUNT_DEFAULT,
      'the creation default must never read as a row requirement');
  }
});

test('non-serving-service-rows-do-not-count', () => {
  const rows = [
    serviceRow(`${SERVICES_PARTITION_ID}-r1`, 'seed'),
    serviceRow(`${SERVICES_PARTITION_ID}-r2`, 'node-2', {status: 'stopped'}),
    serviceRow(`${SERVICES_PARTITION_ID}-r3`, 'node-3', {status: 'stopped'}),
  ];

  const placement = resolveCriticalPartitionPlacement({
    partitionId: SERVICES_PARTITION_ID,
    partitionRow: servicesPolicyRow(),
    serviceRows: rows,
  });

  assert.equal(placement.distinctNodeCount, 1,
    'stopped replicas contribute no serving failure domain');
  assert.equal(placement.converged, false);
});

test('absent-evidence-is-not-converged', () => {
  for (const rows of [undefined, [], null]) {
    const placement = resolveCriticalPartitionPlacement({
      partitionId: SERVICES_PARTITION_ID,
      partitionRow: servicesPolicyRow(),
      serviceRows: rows,
    });
    assert.equal(placement.converged, false, 'absence is not satisfaction');
    assert.equal(placement.reasonCode,
      CRITICAL_PLACEMENT_REASON.EVIDENCE_ABSENT);
  }

  const convergence = resolveCriticalPlacementConvergence({
    serviceRows: [],
    partitionRows: criticalPolicyRows(),
  });
  assert.equal(convergence.converged, false);
  assert.equal(convergence.evidenceState,
    CRITICAL_PLACEMENT_EVIDENCE_STATE.KNOWN_NOT_CONVERGED,
    'zero holders under valid policy is a MEASURED deficit for the set');
  assert.ok(convergence.pendingPartitionIds.length > 0);

  // The seventh shape class: a NON-CANONICAL container or record. This is the
  // seam a real caller actually reaches — rows arrive from a cache, not from a
  // literal — and it is why the module copies through strict-own-data before
  // reading anything. Unreadable evidence is not converged; without these the
  // whole hardening layer is unpinned and a Proxy row among two good ones
  // reports converged TRUE.
  class RowCollection extends Array {}
  const subclassRows = new RowCollection();
  spreadRows().forEach((row) => subclassRows.push(row));

  const sparseRows = spreadRows();
  delete sparseRows[1];

  const inheritedOnlyRow = Object.create({
    service_id: 'svc-inherited', service_type: 'partition',
    node_id: 'node-9', partition_id: SERVICES_PARTITION_ID,
    replica_id: `${SERVICES_PARTITION_ID}-r9`,
    raft_role: 'follower', status: 'active',
  });

  const accessorRow = {...serviceRow(`${SERVICES_PARTITION_ID}-r3`, 'node-3')};
  let accessorReads = 0;
  Object.defineProperty(accessorRow, 'node_id', {
    enumerable: true,
    get() {
      accessorReads += 1;
      return 'node-3';
    },
  });

  const symbolKeyedRow = {...serviceRow(`${SERVICES_PARTITION_ID}-r3`, 'node-3')};
  symbolKeyedRow[Symbol('smuggled')] = 'node-4';

  function nonEnumerableNodeIdRow() {
    const row = {...serviceRow(`${SERVICES_PARTITION_ID}-r3`, 'node-3')};
    Object.defineProperty(row, 'node_id', {
      value: 'node-3',
      enumerable: false,
      writable: true,
      configurable: true,
    });
    return row;
  }

  const hostile = [
    ['proxy row among valid rows', [
      ...spreadRows().slice(0, 2),
      new Proxy(serviceRow(`${SERVICES_PARTITION_ID}-r3`, 'node-3'), {}),
    ]],
    // A Proxy over the CONTAINER is refused by a different guard than a Proxy
    // over a row: the container check in copyDenseOwnDataArray, not the record
    // check in copyStrictOwnDataRecord. Wrapping rows only never reaches it.
    ['proxy over the row container', new Proxy(spreadRows(), {})],
    // A null row is a primitive, not a record: it must fail closed, not crash.
    ['null row among valid rows', [...spreadRows().slice(0, 2), null]],
    // Distinct from the accessor row: this one HAS a value and fails only the
    // enumerability test, so the accessor fixture never reaches this guard.
    ['non-enumerable node_id', [
      ...spreadRows().slice(0, 2),
      nonEnumerableNodeIdRow(),
    ]],
    ['array subclass container', subclassRows],
    ['sparse array', sparseRows],
    ['inherited-only row', [...spreadRows().slice(0, 2), inheritedOnlyRow]],
    ['accessor-backed node_id', [...spreadRows().slice(0, 2), accessorRow]],
    ['symbol-keyed row', [...spreadRows().slice(0, 2), symbolKeyedRow]],
  ];

  for (const [label, serviceRows] of hostile) {
    let placement = null;
    // Assert no-throw explicitly: the sparse case degrades to a TypeError
    // when the hardening is removed, which a bare converged check would not
    // describe.
    assert.doesNotThrow(() => {
      placement = resolveCriticalPartitionPlacement({
        partitionId: SERVICES_PARTITION_ID,
        partitionRow: servicesPolicyRow(),
        serviceRows,
      });
    }, `${label} must not throw`);
    assert.equal(placement.converged, false, `${label} must not converge`);
    assert.equal(placement.reasonCode,
      CRITICAL_PLACEMENT_REASON.EVIDENCE_ABSENT,
      `${label} must report evidence absent`);
  }

  assert.equal(accessorReads, 0,
    'an accessor on a row field must never be executed');
});

test('repeated-node-rows-count-once', () => {
  const rows = [
    ...spreadRows(),
    serviceRow(`${SERVICES_PARTITION_ID}-r4`, 'node-2'),
    serviceRow(`${SERVICES_PARTITION_ID}-r5`, 'node-2'),
  ];

  const placement = resolveCriticalPartitionPlacement({
    partitionId: SERVICES_PARTITION_ID,
    partitionRow: servicesPolicyRow(),
    serviceRows: rows,
  });

  assert.equal(placement.distinctNodeCount, 3,
    'a node holding several replicas is one failure domain');
  assert.equal(placement.distinctNodeIds.length, 3);
});

test('evaluator-mints-no-readiness-verdict', () => {
  const placement = resolveCriticalPartitionPlacement({
    partitionId: SERVICES_PARTITION_ID,
    partitionRow: servicesPolicyRow(),
    serviceRows: spreadRows(),
  });
  const convergence = resolveCriticalPlacementConvergence({
    serviceRows: spreadRows(),
    partitionRows: criticalPolicyRows(),
  });

  const forbidden = ['ready', 'active', 'phase', 'verdict', 'status',
    'trafficReady', 'lifecycle'];
  for (const key of forbidden) {
    assert.equal(Object.hasOwn(placement, key), false,
      `placement must not mint ${key}`);
    assert.equal(Object.hasOwn(convergence, key), false,
      `convergence must not mint ${key}`);
  }
  assert.equal(Object.isFrozen(placement), true);
  assert.equal(Object.isFrozen(convergence), true);
  // Outer freeze leaves array VALUES mutable in place. pendingPartitionIds is
  // exactly the array a formation barrier would hold onto.
  assert.equal(Object.isFrozen(placement.distinctNodeIds), true);
  assert.equal(Object.isFrozen(convergence.partitions), true);
  assert.equal(Object.isFrozen(convergence.pendingPartitionIds), true);
});

test('witness-deterministic', () => {
  const forward = resolveCriticalPlacementConvergence({
    serviceRows: spreadRows(),
    partitionRows: criticalPolicyRows(),
  });
  const reversed = resolveCriticalPlacementConvergence({
    serviceRows: [...spreadRows()].reverse(),
    partitionRows: [...criticalPolicyRows()].reverse(),
  });

  assert.deepEqual(JSON.parse(JSON.stringify(forward)),
    JSON.parse(JSON.stringify(reversed)),
    'row order must not change the answer');

  const repeated = resolveCriticalPlacementConvergence({
    serviceRows: spreadRows(),
    partitionRows: criticalPolicyRows(),
  });
  assert.deepEqual(JSON.parse(JSON.stringify(forward)),
    JSON.parse(JSON.stringify(repeated)));
});

test('foreign-partition-rows-do-not-count', () => {
  // The production input is the WHOLE services table. Without the partition_id
  // guard every partition would report the union of all serving nodes, and a
  // single-node cluster would answer converged.
  const rows = [
    serviceRow(`${SERVICES_PARTITION_ID}-r1`, 'seed'),
    {
      service_id: 'svc-foreign-a',
      service_type: 'partition',
      node_id: 'node-2',
      partition_id: `${SYSTEM_TABLE_NAME.NODES}-p1`,
      replica_id: `${SYSTEM_TABLE_NAME.NODES}-p1-r2`,
      raft_role: 'follower',
      status: 'active',
    },
    {
      service_id: 'svc-foreign-b',
      service_type: 'partition',
      node_id: 'node-3',
      partition_id: `${SYSTEM_TABLE_NAME.NODES}-p1`,
      replica_id: `${SYSTEM_TABLE_NAME.NODES}-p1-r3`,
      raft_role: 'follower',
      status: 'active',
    },
  ];

  const placement = resolveCriticalPartitionPlacement({
    partitionId: SERVICES_PARTITION_ID,
    partitionRow: servicesPolicyRow(),
    serviceRows: rows,
  });

  assert.equal(placement.distinctNodeCount, 1,
    'nodes serving a DIFFERENT partition are not this partition\'s spread');
  assert.deepEqual([...placement.distinctNodeIds], ['seed']);
  assert.equal(placement.converged, false);
});

test('learner-replicas-are-not-eligible-capacity', () => {
  // A learner is catching up and guarantees no quorum, so a leader plus two
  // learners on distinct nodes is one voting failure domain, not three.
  const rows = [
    serviceRow(`${SERVICES_PARTITION_ID}-r1`, 'seed', {raft_role: 'leader'}),
    serviceRow(`${SERVICES_PARTITION_ID}-r2`, 'node-2', {raft_role: 'learner'}),
    serviceRow(`${SERVICES_PARTITION_ID}-r3`, 'node-3', {raft_role: 'learner'}),
  ];

  const placement = resolveCriticalPartitionPlacement({
    partitionId: SERVICES_PARTITION_ID,
    partitionRow: servicesPolicyRow(),
    serviceRows: rows,
  });

  assert.equal(placement.distinctNodeCount, 1);
  assert.equal(placement.converged, false,
    'learners are not eligible serving capacity');
});

test('non-partition-service-rows-do-not-count', () => {
  const rows = [
    serviceRow(`${SERVICES_PARTITION_ID}-r1`, 'seed',
      {service_type: 'wasm_service'}),
    serviceRow(`${SERVICES_PARTITION_ID}-r2`, 'node-2',
      {service_type: 'wasm_service'}),
    serviceRow(`${SERVICES_PARTITION_ID}-r3`, 'node-3',
      {service_type: 'wasm_service'}),
  ];

  const placement = resolveCriticalPartitionPlacement({
    partitionId: SERVICES_PARTITION_ID,
    partitionRow: servicesPolicyRow(),
    serviceRows: rows,
  });

  assert.equal(placement.distinctNodeCount, 0);
  assert.equal(placement.converged, false);
  assert.equal(placement.reasonCode,
    CRITICAL_PLACEMENT_REASON.EVIDENCE_ABSENT);
});

test('set-iteration-is-ambient-hardened', () => {
  // Set.prototype.forEach is a seam: a ghost-injecting callback could inflate
  // the distinct-node count and flip seed-local rows to converged.
  /* eslint-disable no-extend-native */
  const originalForEach = Set.prototype.forEach;
  const originalValues = Set.prototype.values;
  const originalIterator = Set.prototype[Symbol.iterator];
  try {
    Set.prototype.forEach = function ghostForEach(callback) {
      callback('ghost-node-a');
      callback('ghost-node-b');
      callback('ghost-node-c');
    };
    const ghostIterator = function ghostIterate() {
      return [
        'ghost-node-a', 'ghost-node-b', 'ghost-node-c',
      ][Symbol.iterator]();
    };
    Set.prototype.values = ghostIterator;
    // @@iterator is a SEPARATE slot: assigning .values does not touch it, so
    // without this a rewrite to [...values] or for..of would survive green.
    Set.prototype[Symbol.iterator] = ghostIterator;

    const placement = resolveCriticalPartitionPlacement({
      partitionId: SERVICES_PARTITION_ID,
      partitionRow: servicesPolicyRow(),
      serviceRows: seedLocalRows(),
    });

    assert.equal(placement.distinctNodeCount, 1,
      'ambient Set seams must not inflate the distinct-node count');
    assert.deepEqual([...placement.distinctNodeIds], ['seed']);
    assert.equal(placement.converged, false);
  } finally {
    Set.prototype.forEach = originalForEach;
    Set.prototype.values = originalValues;
    Set.prototype[Symbol.iterator] = originalIterator;
  }
  /* eslint-enable no-extend-native */
});

test('malformed-node-id-rows-do-not-count', () => {
  // '' satisfies SQLite notNull, so an empty node_id is a reachable row. One
  // such row plus two real nodes must not report convergence over two domains.
  // A NUMERIC node_id is the type-pinning case: values must be pinned to
  // string BEFORE any coercion, because String(x) invokes a hostile toString
  // or Symbol.toPrimitive. Without the typeof test, 3 coerces to '3' and
  // becomes a counted failure domain.
  const rows = [
    serviceRow(`${SERVICES_PARTITION_ID}-r1`, ''),
    serviceRow(`${SERVICES_PARTITION_ID}-r2`, 'node-2'),
    serviceRow(`${SERVICES_PARTITION_ID}-r3`, 'node-3'),
    serviceRow(`${SERVICES_PARTITION_ID}-r4`, 3),
  ];

  const placement = resolveCriticalPartitionPlacement({
    partitionId: SERVICES_PARTITION_ID,
    partitionRow: servicesPolicyRow(),
    serviceRows: rows,
  });

  assert.equal(placement.distinctNodeCount, 2,
    'an empty node_id is not a failure domain');
  assert.equal(placement.converged, false);
});

test('empty-critical-set-is-not-converged', () => {
  // The decision over COUNTS, so the empty and mixed cases are actually
  // reachable. Under the live 45-partition set the empty guard never fires,
  // so only this direct probe distinguishes a guarded decision from a bare
  // pendingCount check.
  const STATE = CRITICAL_PLACEMENT_EVIDENCE_STATE;
  assert.equal(resolveAggregatePlacementEvidenceState(0, 0, 0), STATE.UNKNOWN,
    'an empty critical set has no pending partitions, but converges over nothing');
  assert.equal(resolveAggregatePlacementEvidenceState(0, 0, 45),
    STATE.KNOWN_CONVERGED);
  assert.equal(resolveAggregatePlacementEvidenceState(0, 1, 45),
    STATE.KNOWN_NOT_CONVERGED);
  assert.equal(resolveAggregatePlacementEvidenceState(0, 45, 45),
    STATE.KNOWN_NOT_CONVERGED);
  assert.equal(resolveAggregatePlacementEvidenceState(1, 0, 45), STATE.UNKNOWN,
    'one unknown partition blocks any KNOWN_CONVERGED claim');
  assert.equal(resolveAggregatePlacementEvidenceState(1, 1, 45),
    STATE.KNOWN_NOT_CONVERGED,
    'a measured deficit is knowledge no unknown neighbour can retract');
  assert.equal(resolveAggregatePlacementEvidenceState(45, 0, 45),
    STATE.UNKNOWN);

  // The live projection routes its answer through that same decision — but
  // that is established by INSPECTION, not by the assertion below: an inlined
  // call site is behaviourally identical for every reachable input, so
  // nothing here can distinguish them.
  const convergence = resolveCriticalPlacementConvergence({
    serviceRows: spreadRows(),
    partitionRows: criticalPolicyRows(),
  });
  assert.equal(convergence.evidenceState, resolveAggregatePlacementEvidenceState(
    convergence.unknownPartitionIds.length,
    convergence.pendingPartitionIds.length,
    convergence.partitions.length));
  assert.equal(convergence.converged, convergence.evidenceState ===
    CRITICAL_PLACEMENT_EVIDENCE_STATE.KNOWN_CONVERGED);
});

test('whole-set-convergence-is-reachable', () => {
  // Without this, the sealed bar is consistent with an evaluator that is
  // ALWAYS false: every other whole-set assertion checks a negative or an
  // equality both sides of which go false together. Transposing the two count
  // arguments at the call site — the likeliest mistake for a two-number
  // predicate — makes convergence unobservable for every possible input, and
  // nothing else here would notice.
  const rows = [];
  [...CRITICAL_SYSTEM_PARTITION_IDS].sort().forEach(
    (partitionId, partitionIndex) => {
      const tableId = partitionId.replace(/-p1$/u, '');
      const replicaIds = getInitialReplicaIds(tableId) || [];
      replicaIds.forEach((replicaId, replicaIndex) => {
        rows.push({
          service_id: `svc-${replicaId}`,
          service_type: 'partition',
          // One replica per distinct node, so every critical partition reaches
          // its required distinct-node count. Node ids vary by partition AND
          // replica: a uniform node set would let a row measured against the
          // WRONG partition return the same answer as the right one.
          node_id: `node-${partitionIndex}-${replicaIndex}`,
          partition_id: partitionId,
          replica_id: replicaId,
          raft_role: replicaIndex === 0 ? 'leader' : 'follower',
          status: 'active',
        });
      });
    });

  const convergence = resolveCriticalPlacementConvergence({
    serviceRows: rows,
    partitionRows: criticalPolicyRows(),
  });

  assert.equal(convergence.converged, true,
    'a fully spread critical set must be observable as converged');
  assert.deepEqual([...convergence.pendingPartitionIds], []);
  assert.ok(convergence.partitions.length > 0);
  for (const placement of convergence.partitions) {
    assert.equal(placement.converged, true, placement.partitionId);
    assert.equal(placement.reasonCode, CRITICAL_PLACEMENT_REASON.CONVERGED);
    assert.ok(placement.distinctNodeCount >= placement.requiredReplicaCount);
  }
});

test('per-partition-attribution-is-measured', () => {
  // Three axes varied at once, because each defeats a different survivor:
  //  - CARDINALITY three: a list capped at one OR at two still passes with two.
  //  - Chosen BY INDEX, not by literal name: an implementation pushing a
  //    constant pair satisfies any assertion whose expected value is two
  //    literals the fixture also supplies.
  //  - MIXED REASONS: both whole-set fixtures previously made every pending
  //    partition pending for the SAME cause (no rows), so pushing on
  //    distinctNodeCount === 0, or on EVIDENCE_ABSENT, passed — and an
  //    under-spread partition then never enters the list, so whole-set
  //    converged comes out TRUE with a seed-local critical partition. That is
  //    the RF-only false positive this quest exists to kill.
  const declared = [...CRITICAL_SYSTEM_PARTITION_IDS].sort();
  const omittedIndices = [0, Math.floor(declared.length / 2)];
  const underSpreadIndex = declared.length - 1;
  const expectedPending = [
    declared[omittedIndices[0]],
    declared[omittedIndices[1]],
    declared[underSpreadIndex],
  ].sort();
  assert.equal(new Set(expectedPending).size, 3, 'three distinct partitions');

  const rows = [];
  declared.forEach((partitionId, partitionIndex) => {
    if (omittedIndices.includes(partitionIndex)) {
      return; // pending because it has NO rows
    }
    const tableId = partitionId.replace(/-p1$/u, '');
    const replicaIds = getInitialReplicaIds(tableId) || [];
    replicaIds.forEach((replicaId, replicaIndex) => {
      rows.push({
        service_id: `svc-${replicaId}`,
        service_type: 'partition',
        // The under-spread partition gets its FULL replica set on ONE node:
        // present, RF satisfied, but one failure domain.
        node_id: partitionIndex === underSpreadIndex ?
          `node-${partitionIndex}-solo` :
          `node-${partitionIndex}-${replicaIndex}`,
        partition_id: partitionId,
        replica_id: replicaId,
        raft_role: replicaIndex === 0 ? 'leader' : 'follower',
        status: 'active',
      });
    });
  });

  const convergence = resolveCriticalPlacementConvergence({
    serviceRows: rows,
    partitionRows: criticalPolicyRows(),
  });

  assert.equal(convergence.converged, false,
    'an under-spread critical partition must block whole-set convergence');
  assert.deepEqual([...convergence.pendingPartitionIds], expectedPending,
    'pending must name exactly the partitions actually not spread');

  // Pin the mixed causes explicitly, so the scenario cannot silently drift
  // back to a single-reason fixture.
  const byId = new Map(
    convergence.partitions.map((placement) => [placement.partitionId, placement]));
  assert.equal(byId.get(declared[omittedIndices[0]]).reasonCode,
    CRITICAL_PLACEMENT_REASON.EVIDENCE_ABSENT);
  const underSpread = byId.get(declared[underSpreadIndex]);
  assert.equal(underSpread.reasonCode,
    CRITICAL_PLACEMENT_REASON.INSUFFICIENT_DISTINCT_NODES);
  assert.equal(underSpread.distinctNodeCount, 1,
    'present but on one failure domain');
  assert.ok(underSpread.requiredReplicaCount > 1);
});
