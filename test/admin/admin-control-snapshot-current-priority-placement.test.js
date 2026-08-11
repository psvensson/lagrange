import {test} from '../../src/test-helpers/tap.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  resolvePriorityControlPlanePartitionIds,
} from '../../src/bootstrap/system-partition-classification.js';
import {
  buildCurrentPriorityPlacementObservation,
} from '../../src/admin/admin-control-snapshot-current-priority-placement.js';

const TEST_CAPTURED_AT_MS = 1000;
const TEST_NODE_IDS = Object.freeze(['node-a', 'node-b', 'node-c']);
const TEST_PRIORITY_TABLE_IDS = Object.freeze([
  SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
  SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
  SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
  SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
  SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS,
  SYSTEM_TABLE_NAME.SCHEMA_OPERATIONS,
]);

function buildPriorityRows() {
  const partitionRows = [];
  const serviceRows = [];
  for (const tableId of TEST_PRIORITY_TABLE_IDS) {
    const partitionId = INITIAL_PARTITION_IDS[tableId];
    partitionRows.push({
      partition_id: partitionId,
      table_id: tableId,
      leader_node_id: TEST_NODE_IDS[0],
      state: 'NORMAL',
    });
    for (const [index, nodeId] of TEST_NODE_IDS.entries()) {
      const replicaId = partitionId + '-r' + String(index + 1);
      serviceRows.push({
        service_id: replicaId,
        service_type: 'partition',
        partition_id: partitionId,
        replica_id: replicaId,
        node_id: nodeId,
        status: 'active',
        // Partition leadership is owned by partitions.leader_node_id.
        // Durable services rows intentionally collapse leader to follower.
        raft_role: 'follower',
        address: nodeId + '/partition/' + replicaId,
      });
    }
  }
  return {partitionRows, serviceRows};
}

function buildObservation(rows) {
  return buildCurrentPriorityPlacementObservation({
    ...rows,
    capturedAt: TEST_CAPTURED_AT_MS,
    readinessByNodeId: {},
    activeNodeViews: {
      locallyEligibleNodeIds: [...TEST_NODE_IDS],
      effectiveActiveNodeIds: [...TEST_NODE_IDS],
      projectedServingNodeIds: [...TEST_NODE_IDS],
      publishedActiveNodeIds: [...TEST_NODE_IDS],
    },
  });
}

test('current priority placement observes spread and leadership from one capture',
  async (t) => {
    const rows = buildPriorityRows();
    const settled = buildObservation(rows);
    t.equal(settled.state, 'available');
    t.equal(settled.satisfied, true);
    t.equal(settled.priorityPartitionSummary.totalSpreadGap, 0);
    t.equal(settled.leaderCoverage.missingLeaderPartitionCount, 0);

    const schemaPartitionId =
      INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SCHEMA_OPERATIONS];
    const schemaPartition = rows.partitionRows.find(
      (row) => row.partition_id === schemaPartitionId,
    );
    schemaPartition.leader_node_id = null;
    const missingSchemaLeader = buildObservation(rows);
    t.equal(
      missingSchemaLeader.priorityPartitionSummary.totalSpreadGap,
      0,
      'leader loss does not fabricate a replica-placement deficit',
    );
    t.equal(missingSchemaLeader.satisfied, false);
    t.same(
      missingSchemaLeader.leaderCoverage.missingLeaderPartitionIds,
      [schemaPartitionId],
    );

    schemaPartition.leader_node_id = TEST_NODE_IDS[0];
    const schemaLeaderVoter = rows.serviceRows.find(
      (row) =>
        row.partition_id === schemaPartitionId &&
        row.node_id === TEST_NODE_IDS[0],
    );
    schemaLeaderVoter.address = null;
    const addresslessSchemaLeader = buildObservation(rows);
    t.same(
      addresslessSchemaLeader.leaderCoverage.missingLeaderPartitionIds,
      [schemaPartitionId],
      'canonical ownership without an addressed current voter stays blocked',
    );
    schemaLeaderVoter.address =
      TEST_NODE_IDS[0] + '/partition/' + schemaLeaderVoter.replica_id;
    schemaLeaderVoter.status = 'failed';
    const inactiveSchemaLeader = buildObservation(rows);
    t.same(
      inactiveSchemaLeader.leaderCoverage.missingLeaderPartitionIds,
      [schemaPartitionId],
      'canonical ownership without an active current voter stays blocked',
    );
    schemaLeaderVoter.status = 'active';

    const fractionalCapture = buildCurrentPriorityPlacementObservation({
      ...rows,
      capturedAt: TEST_CAPTURED_AT_MS + 0.5,
      readinessByNodeId: {},
      activeNodeViews: {
        locallyEligibleNodeIds: [...TEST_NODE_IDS],
      },
    });
    t.equal(
      fractionalCapture.capturedAt,
      TEST_CAPTURED_AT_MS + 0.5,
      'the observation preserves the enclosing snapshot clock exactly',
    );
    t.equal(
      fractionalCapture.state,
      'available',
      'omitted lower-priority node views do not invalidate local eligibility',
    );

    const unpublishedCapture = buildCurrentPriorityPlacementObservation({
      ...rows,
      capturedAt: TEST_CAPTURED_AT_MS,
      readinessByNodeId: {},
      activeNodeViews: {
        locallyEligibleNodeIds: [...TEST_NODE_IDS],
        projectedServingNodeIds: [...TEST_NODE_IDS],
        publishedActiveNodeIds: null,
      },
    });
    t.equal(
      unpublishedCapture.state,
      'available',
      'normal pre-publication null does not override valid local eligibility',
    );
    t.equal(unpublishedCapture.satisfied, true);
    t.end();
  });

test('current priority placement adapter fails closed before node-view fallback',
  (t) => {
    const rows = buildPriorityRows();
    const baseOptions = {
      ...rows,
      capturedAt: TEST_CAPTURED_AT_MS,
      readinessByNodeId: {},
    };
    const malformedLocal = buildCurrentPriorityPlacementObservation({
      ...baseOptions,
      activeNodeViews: {
        locallyEligibleNodeIds: {length: 1},
        projectedServingNodeIds: [...TEST_NODE_IDS],
        publishedActiveNodeIds: [...TEST_NODE_IDS],
      },
    });
    t.equal(malformedLocal.state, 'unavailable');
    t.equal(malformedLocal.satisfied, false);

    let accessorReads = 0;
    const accessorViews = {
      projectedServingNodeIds: [...TEST_NODE_IDS],
    };
    Object.defineProperty(accessorViews, 'locallyEligibleNodeIds', {
      enumerable: true,
      get() {
        accessorReads += 1;
        return [...TEST_NODE_IDS];
      },
    });
    const accessorObservation = buildCurrentPriorityPlacementObservation({
      ...baseOptions,
      activeNodeViews: accessorViews,
    });
    t.equal(accessorObservation.state, 'unavailable');
    t.equal(accessorReads, 0);

    const revokedViews = Proxy.revocable({}, {});
    revokedViews.revoke();
    let revokedViewsObservation;
    t.doesNotThrow(() => {
      revokedViewsObservation = buildCurrentPriorityPlacementObservation({
        ...baseOptions,
        activeNodeViews: revokedViews.proxy,
      });
    });
    t.equal(revokedViewsObservation.state, 'unavailable');

    const revokedOptions = Proxy.revocable(baseOptions, {});
    revokedOptions.revoke();
    let revokedOptionsObservation;
    t.doesNotThrow(() => {
      revokedOptionsObservation = buildCurrentPriorityPlacementObservation(
        revokedOptions.proxy,
      );
    });
    t.equal(revokedOptionsObservation.state, 'unavailable');

    const revokedPartitionRows = Proxy.revocable(rows.partitionRows, {});
    const revokedServiceRows = Proxy.revocable(rows.serviceRows, {});
    revokedPartitionRows.revoke();
    revokedServiceRows.revoke();
    t.equal(buildCurrentPriorityPlacementObservation({
      ...baseOptions,
      partitionRows: revokedPartitionRows.proxy,
      activeNodeViews: {
        locallyEligibleNodeIds: [...TEST_NODE_IDS],
      },
    }).state, 'unavailable');
    t.equal(buildCurrentPriorityPlacementObservation({
      ...baseOptions,
      serviceRows: revokedServiceRows.proxy,
      activeNodeViews: {
        locallyEligibleNodeIds: [...TEST_NODE_IDS],
      },
    }).state, 'unavailable');

    const malformedLowerView = buildCurrentPriorityPlacementObservation({
      ...baseOptions,
      activeNodeViews: {
        locallyEligibleNodeIds: [...TEST_NODE_IDS],
        publishedActiveNodeIds: {length: TEST_NODE_IDS.length},
      },
    });
    t.equal(malformedLowerView.state, 'unavailable');

    for (const readinessByNodeId of ['malformed', 42, false]) {
      t.equal(buildCurrentPriorityPlacementObservation({
        ...baseOptions,
        readinessByNodeId,
        activeNodeViews: {
          locallyEligibleNodeIds: [...TEST_NODE_IDS],
        },
      }).state, 'unavailable');
    }
    t.equal(buildCurrentPriorityPlacementObservation({
      ...baseOptions,
      readinessByNodeId: null,
      activeNodeViews: {
        locallyEligibleNodeIds: [...TEST_NODE_IDS],
      },
    }).state, 'available');
    const revokedReadinessMap = Proxy.revocable({}, {});
    const revokedNodeReadiness = Proxy.revocable({}, {});
    revokedReadinessMap.revoke();
    revokedNodeReadiness.revoke();
    t.equal(buildCurrentPriorityPlacementObservation({
      ...baseOptions,
      readinessByNodeId: revokedReadinessMap.proxy,
      activeNodeViews: {
        locallyEligibleNodeIds: [...TEST_NODE_IDS],
      },
    }).state, 'unavailable');
    t.equal(buildCurrentPriorityPlacementObservation({
      ...baseOptions,
      readinessByNodeId: {'node-c': revokedNodeReadiness.proxy},
      activeNodeViews: {
        locallyEligibleNodeIds: [...TEST_NODE_IDS],
      },
    }).state, 'unavailable');

    const effectiveFallback = buildCurrentPriorityPlacementObservation({
      ...baseOptions,
      activeNodeViews: {
        locallyEligibleNodeIds: [],
        effectiveActiveNodeIds: [...TEST_NODE_IDS],
        publishedActiveNodeIds: null,
      },
    });
    t.equal(effectiveFallback.state, 'available');
    t.equal(effectiveFallback.satisfied, true);
    t.same(effectiveFallback.eligibleNodeIds, [...TEST_NODE_IDS]);

    const projectedFallback = buildCurrentPriorityPlacementObservation({
      ...baseOptions,
      activeNodeViews: {
        locallyEligibleNodeIds: null,
        projectedServingNodeIds: [...TEST_NODE_IDS],
        publishedActiveNodeIds: null,
      },
    });
    t.equal(projectedFallback.state, 'available');
    t.equal(projectedFallback.satisfied, true);
    t.same(projectedFallback.eligibleNodeIds, [...TEST_NODE_IDS]);
    t.end();
  });

test('current priority leader coverage ignores ambient Array and Map mutation',
  (t) => {
    const rows = buildPriorityRows();
    for (let index = 0; index < rows.partitionRows.length; index += 1) {
      rows.partitionRows[index].leader_node_id = null;
    }
    const options = {
      ...rows,
      capturedAt: TEST_CAPTURED_AT_MS,
      readinessByNodeId: {},
      activeNodeViews: {
        locallyEligibleNodeIds: [...TEST_NODE_IDS],
      },
    };
    const baseline = buildCurrentPriorityPlacementObservation(options);
    const mappedOptions = {
      ...buildPriorityRows(),
      capturedAt: TEST_CAPTURED_AT_MS,
      readinessByNodeId: {},
      activeNodeViews: {
        locallyEligibleNodeIds: [...TEST_NODE_IDS],
      },
    };
    const originalFilter = Object.getOwnPropertyDescriptor(
      Array.prototype,
      'filter',
    );
    const originalPush = Object.getOwnPropertyDescriptor(
      Array.prototype,
      'push',
    );
    const originalMap = Object.getOwnPropertyDescriptor(globalThis, 'Map');
    const originalSet = Object.getOwnPropertyDescriptor(globalThis, 'Set');
    let mutated;
    let mappedMutated;
    try {
      Reflect.defineProperty(Array.prototype, 'filter', {
        value() {
          return [];
        },
        configurable: true,
        writable: true,
      });
      Reflect.defineProperty(Array.prototype, 'push', {
        value() {
          return this.length;
        },
        configurable: true,
        writable: true,
      });
      Reflect.defineProperty(globalThis, 'Map', {
        value: class AmbientMap {
          constructor() {
            throw new Error('ambient Map constructed');
          }
        },
        configurable: true,
        writable: true,
      });
      Reflect.defineProperty(globalThis, 'Set', {
        value: class AmbientSet {
          constructor() {
            throw new Error('ambient Set constructed');
          }
        },
        configurable: true,
        writable: true,
      });
      mutated = buildCurrentPriorityPlacementObservation(options);
      mappedMutated = buildCurrentPriorityPlacementObservation(mappedOptions);
    } finally {
      Reflect.defineProperty(Array.prototype, 'filter', originalFilter);
      Reflect.defineProperty(Array.prototype, 'push', originalPush);
      Reflect.defineProperty(globalThis, 'Map', originalMap);
      Reflect.defineProperty(globalThis, 'Set', originalSet);
    }
    t.equal(baseline.state, 'available');
    t.equal(baseline.priorityPartitionSummary.satisfied, true);
    t.equal(baseline.leaderCoverage.satisfied, false);
    t.equal(baseline.satisfied, false);
    t.equal(mutated.state, 'available');
    t.equal(mutated.priorityPartitionSummary.satisfied, true);
    t.equal(mutated.leaderCoverage.satisfied, false);
    t.equal(mutated.satisfied, false);
    t.same(
      mappedMutated.leaderCoverage.leaderNodeIdsByPartition[
        INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS]
      ],
      [TEST_NODE_IDS[0]],
    );
    t.end();
  });

test('leader-role fallback is deterministic across service-row ordering',
  (t) => {
    const rows = buildPriorityRows();
    const partitionId =
      INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS];
    const partitionRow = rows.partitionRows.find(
      (row) => row.partition_id === partitionId,
    );
    partitionRow.leader_node_id = null;
    const partitionServices = rows.serviceRows.filter(
      (row) => row.partition_id === partitionId,
    );
    partitionServices[0].raft_role = 'leader';
    partitionServices[2].raft_role = 'leader';
    const build = (serviceRows) => buildCurrentPriorityPlacementObservation({
      partitionRows: rows.partitionRows,
      serviceRows,
      capturedAt: TEST_CAPTURED_AT_MS,
      readinessByNodeId: {},
      activeNodeViews: {
        locallyEligibleNodeIds: [...TEST_NODE_IDS],
      },
    });
    const forward = build(rows.serviceRows);
    const reversed = build([...rows.serviceRows].reverse());
    t.same(
      forward.leaderCoverage.leaderNodeIdsByPartition[partitionId],
      [TEST_NODE_IDS[0]],
    );
    t.same(
      reversed.leaderCoverage.leaderNodeIdsByPartition[partitionId],
      [TEST_NODE_IDS[0]],
    );
    t.same(forward.leaderCoverage, reversed.leaderCoverage);
    t.end();
  });

test('null and empty active-node views preserve the same fallback semantics',
  (t) => {
    const rows = buildPriorityRows();
    const baseOptions = {
      ...rows,
      capturedAt: TEST_CAPTURED_AT_MS,
      readinessByNodeId: {},
    };
    const nullViews = buildCurrentPriorityPlacementObservation({
      ...baseOptions,
      activeNodeViews: null,
    });
    const emptyViews = buildCurrentPriorityPlacementObservation({
      ...baseOptions,
      activeNodeViews: {},
    });
    t.equal(nullViews.state, emptyViews.state);
    t.equal(nullViews.satisfied, emptyViews.satisfied);
    t.same(nullViews.eligibleNodeIds, emptyViews.eligibleNodeIds);
    t.same(
      nullViews.priorityPartitionSummary,
      emptyViews.priorityPartitionSummary,
    );
    t.end();
  });

test('priority ID resolution fails closed for revoked direct inputs', (t) => {
  const expected = TEST_PRIORITY_TABLE_IDS
    .map((tableId) => INITIAL_PARTITION_IDS[tableId])
    .sort();
  const revokedOptions = Proxy.revocable({}, {});
  const revokedPartitionRows = Proxy.revocable([], {});
  const revokedServiceRows = Proxy.revocable([], {});
  const revokedPartitionRow = Proxy.revocable({}, {});
  const revokedServiceRow = Proxy.revocable({}, {});
  revokedOptions.revoke();
  revokedPartitionRows.revoke();
  revokedServiceRows.revoke();
  revokedPartitionRow.revoke();
  revokedServiceRow.revoke();
  t.same(
    resolvePriorityControlPlanePartitionIds(revokedOptions.proxy),
    expected,
  );
  t.same(resolvePriorityControlPlanePartitionIds({
    partitionRows: revokedPartitionRows.proxy,
  }), expected);
  t.same(resolvePriorityControlPlanePartitionIds({
    serviceRows: revokedServiceRows.proxy,
  }), expected);
  t.same(resolvePriorityControlPlanePartitionIds({
    partitionRows: [revokedPartitionRow.proxy],
  }), expected);
  t.same(resolvePriorityControlPlanePartitionIds({
    serviceRows: [revokedServiceRow.proxy],
  }), expected);
  const revokedMixedRow = Proxy.revocable({}, {});
  revokedMixedRow.revoke();
  t.same(resolvePriorityControlPlanePartitionIds({
    partitionRows: [
      {
        partition_id: expected[0],
        table_id: SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
      },
      revokedMixedRow.proxy,
    ],
  }), expected);
  t.same(resolvePriorityControlPlanePartitionIds({
    includeInitialWhenMissing: false,
    partitionRows: [revokedMixedRow.proxy],
  }), expected);

  let accessorReads = 0;
  const accessorPartitionRows = [];
  const accessorServiceRows = [];
  const throwingDescriptor = {
    enumerable: true,
    configurable: true,
    get() {
      accessorReads += 1;
      throw new Error('row index accessor invoked');
    },
  };
  Object.defineProperty(accessorPartitionRows, 0, throwingDescriptor);
  Object.defineProperty(accessorServiceRows, 0, throwingDescriptor);
  t.same(resolvePriorityControlPlanePartitionIds({
    partitionRows: accessorPartitionRows,
  }), expected);
  t.same(resolvePriorityControlPlanePartitionIds({
    serviceRows: accessorServiceRows,
  }), expected);
  t.equal(accessorReads, 0);
  t.end();
});

test('conflicting duplicate partition rows are unavailable and deterministic',
  (t) => {
    const rows = buildPriorityRows();
    const duplicate = {
      ...rows.partitionRows[0],
      leader_node_id: TEST_NODE_IDS[1],
    };
    const build = (partitionRows) => buildCurrentPriorityPlacementObservation({
      partitionRows,
      serviceRows: rows.serviceRows,
      readinessByNodeId: {},
      activeNodeViews: {
        locallyEligibleNodeIds: [...TEST_NODE_IDS],
      },
    });
    const forward = build([duplicate, ...rows.partitionRows]);
    const reversed = build([...rows.partitionRows, duplicate]);
    t.equal(forward.state, 'unavailable');
    t.equal(forward.satisfied, false);
    t.equal(forward.leaderCoverage.satisfied, false);
    t.same(forward.leaderCoverage, reversed.leaderCoverage);
    t.end();
  });
