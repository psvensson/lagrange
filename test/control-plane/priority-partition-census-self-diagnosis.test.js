import {test} from '../../src/test-helpers/tap.js';
import {SERVICE_STATUS, SERVICE_TYPE} from '../../src/constants/index.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  arePriorityPartitionSummariesEqual,
  buildDerivedPriorityPartitionSummary,
  chooseMoreAdvancedPriorityPartitionSummary,
  normalizePriorityPartitionSummary,
} from '../../src/control-plane/membership-publication-priority-partition-summary.js';
import {
  normalizeNodeIdList,
  normalizePositiveInteger,
} from '../../src/control-plane/membership-publication-row-helpers.js';

const PARTITION_ID =
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS];
const ELIGIBLE_NODE_IDS = Object.freeze(['node-1', 'node-2', 'node-3']);
const SUMMARY_HELPERS = Object.freeze({
  normalizeNodeIdList,
  normalizePositiveInteger,
});

function createServiceRow(nodeId, index, options = {}) {
  return {
    service_id: `${PARTITION_ID}-r${index}`,
    node_id: nodeId,
    partition_id: PARTITION_ID,
    service_type: options.serviceType || SERVICE_TYPE.PARTITION,
    status: SERVICE_STATUS.ACTIVE,
    raft_role: options.raftRole === undefined ? 'follower' : options.raftRole,
    address: `${nodeId}/partition/${PARTITION_ID}/${index}`,
  };
}

function deriveSummary(serviceRows, replicaCount = 3) {
  const partitionRow = {
    partition_id: PARTITION_ID,
    ...(replicaCount === null ? {} : {replica_count: replicaCount}),
  };
  return buildDerivedPriorityPartitionSummary(
    {
      partitionRows: [partitionRow],
      serviceRows,
      locallyEligibleNodeIds: ELIGIBLE_NODE_IDS,
    },
    SUMMARY_HELPERS,
  );
}

function partitionBlock(summary) {
  return summary?.blockedPartitions?.find(
    (entry) => entry.partitionId === PARTITION_ID,
  ) || null;
}

function semanticBlock(overrides = {}) {
  return {
    partitionId: PARTITION_ID,
    requiredDistinctNodeCount: 3,
    readyDistinctNodeCount: 2,
    readyReplicaCount: 2,
    spreadGap: 1,
    exclusionReasonCounts: {},
    ...overrides,
  };
}

function semanticSummary(blockedPartition) {
  return {
    satisfied: false,
    requiredDistinctNodeCount: 3,
    readyEligibleNodeCount: 3,
    totalPriorityPartitionCount: 1,
    missingPartitionIds: [PARTITION_ID],
    blockedPartitions: [blockedPartition],
  };
}

test('priority census distinguishes absent rows from ready replicas', (t) => {
  const summary = deriveSummary([
    createServiceRow('node-1', 1),
    createServiceRow('node-2', 2),
  ]);
  const blocked = partitionBlock(summary);

  t.match(blocked, {
    expectedReplicaCount: 3,
    readyReplicaCount: 2,
    readyDistinctNodeCount: 2,
    spreadGap: 1,
    exclusionReasonCounts: {row_absent: 1},
  });
  t.end();
});

test('row_absent counts missing rows, not present-but-excluded rows', (t) => {
  const completeCensus = partitionBlock(deriveSummary([
    createServiceRow('node-1', 1),
    createServiceRow('node-2', 2),
    createServiceRow('node-3', 3, {raftRole: null}),
  ]));
  t.equal(completeCensus.readyReplicaCount, 2);
  t.equal(completeCensus.exclusionReasonCounts.raft_role_missing, 1);
  t.equal(
    Object.hasOwn(completeCensus.exclusionReasonCounts, 'row_absent'),
    false,
  );

  const mixedCensus = partitionBlock(deriveSummary([
    createServiceRow('node-1', 1),
    createServiceRow('node-2', 2, {raftRole: null}),
  ]));
  t.match(mixedCensus.exclusionReasonCounts, {
    raft_role_missing: 1,
    row_absent: 1,
  });
  t.end();
});

test('non-partition rows cannot satisfy the replica-row census', (t) => {
  const blocked = partitionBlock(deriveSummary([
    createServiceRow('node-1', 1),
    createServiceRow('node-2', 2),
    createServiceRow('node-3', 3, {serviceType: 'compute'}),
  ]));

  t.equal(blocked.readyReplicaCount, 2);
  t.equal(blocked.exclusionReasonCounts.not_partition_service, 1);
  t.equal(blocked.exclusionReasonCounts.row_absent, 1);
  t.end();
});

test('row_absent is non-negative and omitted without target authority', (t) => {
  const overTarget = partitionBlock(deriveSummary([
    createServiceRow('node-1', 1),
    createServiceRow('node-1', 2),
    createServiceRow('node-2', 3),
    createServiceRow('node-2', 4),
  ]));
  t.equal(overTarget.expectedReplicaCount, 3);
  t.equal(overTarget.readyReplicaCount, 4);
  t.equal(Object.hasOwn(overTarget.exclusionReasonCounts, 'row_absent'), false);

  const unknownTarget = partitionBlock(deriveSummary([
    createServiceRow('node-1', 1),
    createServiceRow('node-2', 2),
  ], null));
  t.equal(Object.hasOwn(unknownTarget, 'expectedReplicaCount'), false);
  t.equal(
    Object.hasOwn(unknownTarget.exclusionReasonCounts, 'row_absent'),
    false,
  );
  t.end();
});

test('partition rows diagnose a fully absent service-row census', (t) => {
  const blocked = partitionBlock(deriveSummary([]));
  t.match(blocked, {
    expectedReplicaCount: 3,
    readyReplicaCount: 0,
    readyDistinctNodeCount: 0,
    exclusionReasonCounts: {row_absent: 3},
  });
  t.end();
});

test('only an explicit service-row snapshot can diagnose authoritative absence',
  (t) => {
    const options = {
      partitionRows: [{partition_id: PARTITION_ID, replica_count: 3}],
      locallyEligibleNodeIds: ELIGIBLE_NODE_IDS,
    };
    t.equal(
      buildDerivedPriorityPartitionSummary(options, SUMMARY_HELPERS),
      null,
      'an omitted serviceRows field is read-unavailable, not empty',
    );
    t.equal(
      buildDerivedPriorityPartitionSummary(
        {...options, serviceRows: {}},
        SUMMARY_HELPERS,
      ),
      null,
      'a malformed serviceRows value is read-unavailable, not empty',
    );
    t.equal(
      partitionBlock(buildDerivedPriorityPartitionSummary(
        {...options, serviceRows: []},
        SUMMARY_HELPERS,
      )).exclusionReasonCounts.row_absent,
      3,
      'an explicit empty snapshot is authoritative absence',
    );
    t.end();
  });

test('normalization keeps the additive field optional and accepts snake case', (t) => {
  const legacy = normalizePriorityPartitionSummary(
    semanticSummary(semanticBlock()),
    {},
    SUMMARY_HELPERS,
  );
  t.equal(
    Object.hasOwn(legacy.blockedPartitions[0], 'expectedReplicaCount'),
    false,
  );

  const enriched = normalizePriorityPartitionSummary(
    semanticSummary(semanticBlock({expected_replica_count: 3})),
    {},
    SUMMARY_HELPERS,
  );
  t.equal(enriched.blockedPartitions[0].expectedReplicaCount, 3);
  t.end();
});

test('diagnostic enrichment wins semantic ties and current values replace stale ones',
  (t) => {
    const legacy = semanticSummary(semanticBlock());
    const enriched = semanticSummary(semanticBlock({
      expectedReplicaCount: 3,
      exclusionReasonCounts: {row_absent: 1},
    }));
    const enrichedWithDifferentTarget = semanticSummary(semanticBlock({
      expectedReplicaCount: 5,
      exclusionReasonCounts: {row_absent: 3},
    }));

    t.same(
      chooseMoreAdvancedPriorityPartitionSummary(
        legacy,
        enriched,
        SUMMARY_HELPERS,
      ),
      normalizePriorityPartitionSummary(enriched, {}, SUMMARY_HELPERS),
    );
    t.same(
      chooseMoreAdvancedPriorityPartitionSummary(
        enriched,
        legacy,
        SUMMARY_HELPERS,
      ),
      normalizePriorityPartitionSummary(enriched, {}, SUMMARY_HELPERS),
    );
    t.same(
      chooseMoreAdvancedPriorityPartitionSummary(
        enriched,
        enrichedWithDifferentTarget,
        SUMMARY_HELPERS,
      ),
      normalizePriorityPartitionSummary(
        enrichedWithDifferentTarget,
        {},
        SUMMARY_HELPERS,
      ),
      'equally complete current diagnostics replace stale values without ' +
      'changing semantic advancement ranks',
    );
    t.equal(
      arePriorityPartitionSummariesEqual(legacy, enriched, SUMMARY_HELPERS),
      false,
      'the additive enrichment triggers one durable summary refresh',
    );
    t.equal(
      arePriorityPartitionSummariesEqual(enriched, enriched, SUMMARY_HELPERS),
      true,
      'equal enriched summaries stabilize without publication churn',
    );
    t.end();
  });

test('expected targets require own primitive safe positive integers', (t) => {
  const rows = [
    createServiceRow('node-1', 1),
    createServiceRow('node-2', 2),
  ];
  const invalidTargets = [
    '3',
    Object(3),
    3.5,
    Number.MAX_SAFE_INTEGER + 1,
    3n,
    Symbol('3'),
    Infinity,
  ];
  for (const invalidTarget of invalidTargets) {
    const blocked = partitionBlock(deriveSummary(rows, invalidTarget));
    t.equal(Object.hasOwn(blocked, 'expectedReplicaCount'), false);
    t.equal(Object.hasOwn(blocked.exclusionReasonCounts, 'row_absent'), false);
  }

  const inheritedPartitionRow = Object.assign(
    Object.create({replica_count: 3}),
    {partition_id: PARTITION_ID},
  );
  const inheritedTarget = partitionBlock(buildDerivedPriorityPartitionSummary(
    {
      partitionRows: [inheritedPartitionRow],
      serviceRows: rows,
      locallyEligibleNodeIds: ELIGIBLE_NODE_IDS,
    },
    SUMMARY_HELPERS,
  ));
  t.equal(inheritedTarget, null, 'a non-plain partition row fails closed');

  let accessorReads = 0;
  const accessorPartitionRow = {partition_id: PARTITION_ID};
  Object.defineProperty(accessorPartitionRow, 'replica_count', {
    enumerable: true,
    get() {
      accessorReads += 1;
      return 3;
    },
  });
  const accessorTarget = partitionBlock(buildDerivedPriorityPartitionSummary(
    {
      partitionRows: [accessorPartitionRow],
      serviceRows: rows,
      locallyEligibleNodeIds: ELIGIBLE_NODE_IDS,
    },
    SUMMARY_HELPERS,
  ));
  t.equal(accessorReads, 0);
  t.equal(accessorTarget, null, 'an accessor row makes the census unavailable');

  const originalIsSafeInteger = Number.isSafeInteger;
  try {
    Number.isSafeInteger = () => true;
    const blocked = partitionBlock(deriveSummary(rows, Infinity));
    t.equal(Object.hasOwn(blocked, 'expectedReplicaCount'), false);
  } finally {
    Number.isSafeInteger = originalIsSafeInteger;
  }
  t.end();
});

test('diagnostic normalization ignores pollution, accessors, and toJSON', (t) => {
  const inheritedExpectedBlock = Object.assign(
    Object.create({expectedReplicaCount: 3}),
    semanticBlock(),
  );
  const inheritedExpected = normalizePriorityPartitionSummary(
    semanticSummary(inheritedExpectedBlock),
    {},
    SUMMARY_HELPERS,
  );
  t.equal(inheritedExpected, null);

  let exclusionAccessorReads = 0;
  const accessorBlock = semanticBlock();
  Object.defineProperty(accessorBlock, 'exclusionReasonCounts', {
    enumerable: true,
    get() {
      exclusionAccessorReads += 1;
      return {row_absent: 99};
    },
  });
  const accessorSummary = normalizePriorityPartitionSummary(
    semanticSummary(accessorBlock),
    {},
    SUMMARY_HELPERS,
  );
  t.equal(exclusionAccessorReads, 0);
  t.equal(accessorSummary, null);

  const toJsonSummary = semanticSummary(semanticBlock({
    expectedReplicaCount: 3,
    exclusionReasonCounts: {
      row_absent: 1,
      toJSON() {
        throw new Error('ambient JSON serialization must not execute');
      },
    },
  }));
  t.equal(
    arePriorityPartitionSummariesEqual(
      toJsonSummary,
      semanticSummary(semanticBlock({
        expectedReplicaCount: 3,
        exclusionReasonCounts: {row_absent: 1},
      })),
      SUMMARY_HELPERS,
    ),
    false,
    'a non-count toJSON member invalidates explicit diagnostic evidence',
  );

  const originalPollution = Object.getOwnPropertyDescriptor(
    Object.prototype,
    'row_absent',
  );
  try {
    Reflect.defineProperty(Object.prototype, 'row_absent', {
      value: 99,
      configurable: true,
      enumerable: true,
    });
    const baseline = semanticSummary(semanticBlock({expectedReplicaCount: 3}));
    const candidate = semanticSummary(semanticBlock({
      expectedReplicaCount: 3,
      exclusionReasonCounts: {row_absent: 1},
    }));
    const selected = chooseMoreAdvancedPriorityPartitionSummary(
      baseline,
      candidate,
      SUMMARY_HELPERS,
    );
    t.equal(selected.blockedPartitions[0].exclusionReasonCounts.row_absent, 1);
  } finally {
    if (originalPollution) {
      Reflect.defineProperty(Object.prototype, 'row_absent', originalPollution);
    } else {
      Reflect.deleteProperty(Object.prototype, 'row_absent');
    }
  }
  t.end();
});

test('service-row census ignores an array iterator override', (t) => {
  const rows = [
    createServiceRow('node-1', 1),
    createServiceRow('node-2', 2),
  ];
  rows[Symbol.iterator] = function* hideRows() {
    yield createServiceRow('node-3', 99, {serviceType: 'compute'});
  };
  const blocked = partitionBlock(deriveSummary(rows));
  t.equal(blocked.readyReplicaCount, 2);
  t.equal(blocked.exclusionReasonCounts.row_absent, 1);
  t.equal(
    Object.hasOwn(blocked.exclusionReasonCounts, 'not_partition_service'),
    false,
  );
  t.end();
});

test('semantic fields require own primitive safe data', (t) => {
  const unsafe = semanticSummary(semanticBlock());
  unsafe.requiredDistinctNodeCount = Number.MAX_SAFE_INTEGER + 1;
  unsafe.blockedPartitions[0].partitionId = Object(PARTITION_ID);
  const normalizedUnsafe = normalizePriorityPartitionSummary(
    unsafe,
    {},
    SUMMARY_HELPERS,
  );
  t.equal(normalizedUnsafe, null);

  const inheritedBlock = Object.assign(
    Object.create({partitionId: PARTITION_ID}),
    {
      requiredDistinctNodeCount: 3,
      readyDistinctNodeCount: 2,
      readyReplicaCount: 2,
      spreadGap: 1,
    },
  );
  const normalizedInherited = normalizePriorityPartitionSummary(
    semanticSummary(inheritedBlock),
    {},
    SUMMARY_HELPERS,
  );
  t.equal(normalizedInherited, null);

  let blockedPartitionReads = 0;
  const accessorSummary = semanticSummary(semanticBlock());
  Object.defineProperty(accessorSummary, 'blockedPartitions', {
    enumerable: true,
    get() {
      blockedPartitionReads += 1;
      return [semanticBlock()];
    },
  });
  normalizePriorityPartitionSummary(accessorSummary, {}, SUMMARY_HELPERS);
  t.equal(blockedPartitionReads, 0);

  const forgedMissingIds = [PARTITION_ID];
  forgedMissingIds[Symbol.iterator] = function* forgeMissingIds() {
    yield 'forged-p1';
  };
  const normalizedMissingIds = normalizePriorityPartitionSummary(
    {...semanticSummary(semanticBlock()), missingPartitionIds: forgedMissingIds},
    {},
    SUMMARY_HELPERS,
  );
  t.same(normalizedMissingIds.missingPartitionIds, [PARTITION_ID]);
  t.end();
});

test('census output is independent of ambient Array prototype helpers', (t) => {
  const originalIterator = Object.getOwnPropertyDescriptor(
    Array.prototype,
    Symbol.iterator,
  );
  const originalEvery = Object.getOwnPropertyDescriptor(Array.prototype, 'every');
  const originalMap = Object.getOwnPropertyDescriptor(Array.prototype, 'map');
  const originalFilter = Object.getOwnPropertyDescriptor(Array.prototype, 'filter');
  const originalFind = Object.getOwnPropertyDescriptor(Array.prototype, 'find');
  let summary;
  let equal;
  try {
    Reflect.defineProperty(Array.prototype, Symbol.iterator, {
      value: function* hideArrayEntries() {},
      configurable: true,
      writable: true,
    });
    Reflect.defineProperty(Array.prototype, 'every', {
      value: () => true, configurable: true, writable: true,
    });
    Reflect.defineProperty(Array.prototype, 'map', {
      value: () => [], configurable: true, writable: true,
    });
    Reflect.defineProperty(Array.prototype, 'filter', {
      value: () => [], configurable: true, writable: true,
    });
    Reflect.defineProperty(Array.prototype, 'find', {
      value: () => undefined, configurable: true, writable: true,
    });
    summary = deriveSummary([
      createServiceRow('node-1', 1),
      createServiceRow('node-2', 2),
    ]);
    equal = arePriorityPartitionSummariesEqual(
      semanticSummary(semanticBlock({
        expectedReplicaCount: 3,
        exclusionReasonCounts: {row_absent: 1},
      })),
      semanticSummary(semanticBlock({
        expectedReplicaCount: 5,
        exclusionReasonCounts: {row_absent: 3},
      })),
      SUMMARY_HELPERS,
    );
  } finally {
    Reflect.defineProperty(Array.prototype, Symbol.iterator, originalIterator);
    Reflect.defineProperty(Array.prototype, 'every', originalEvery);
    Reflect.defineProperty(Array.prototype, 'map', originalMap);
    Reflect.defineProperty(Array.prototype, 'filter', originalFilter);
    Reflect.defineProperty(Array.prototype, 'find', originalFind);
  }
  const blocked = partitionBlock(summary);
  t.equal(blocked.readyReplicaCount, 2);
  t.equal(blocked.expectedReplicaCount, 3);
  t.equal(blocked.exclusionReasonCounts.row_absent, 1);
  t.equal(equal, false);
  t.end();
});

test('reason accumulation ignores writable and non-writable prototype pollution',
  (t) => {
    const originalReason = Object.getOwnPropertyDescriptor(
      Object.prototype,
      'raft_role_missing',
    );
    const counts = [];
    try {
      for (const writable of [true, false]) {
        Reflect.defineProperty(Object.prototype, 'raft_role_missing', {
          value: 99,
          configurable: true,
          enumerable: true,
          writable,
        });
        const blocked = partitionBlock(deriveSummary([
          createServiceRow('node-1', 1),
          createServiceRow('node-2', 2, {raftRole: null}),
        ]));
        counts.push(blocked.exclusionReasonCounts.raft_role_missing);
      }
    } finally {
      if (originalReason) {
        Reflect.defineProperty(
          Object.prototype,
          'raft_role_missing',
          originalReason,
        );
      } else {
        Reflect.deleteProperty(Object.prototype, 'raft_role_missing');
      }
    }
    t.same(counts, [1, 1]);
    t.end();
  });

test('proxy census authority fails closed', (t) => {
  const rows = [
    createServiceRow('node-1', 1),
    createServiceRow('node-2', 2),
  ];
  const proxiedRows = new Proxy(rows, {
    get(target, property, receiver) {
      if (property === 'length') {
        return 0;
      }
      return Reflect.get(target, property, receiver);
    },
  });
  t.equal(buildDerivedPriorityPartitionSummary({
    partitionRows: [{partition_id: PARTITION_ID, replica_count: 3}],
    serviceRows: proxiedRows,
    locallyEligibleNodeIds: ELIGIBLE_NODE_IDS,
  }, SUMMARY_HELPERS), null);

  const fabricatedPartitionRow = new Proxy({}, {
    getOwnPropertyDescriptor(_target, property) {
      if (property === 'partition_id') {
        return {value: PARTITION_ID, enumerable: true, configurable: true};
      }
      if (property === 'replica_count') {
        return {value: 7, enumerable: true, configurable: true};
      }
      return undefined;
    },
    ownKeys() {
      return ['partition_id', 'replica_count'];
    },
  });
  t.equal(buildDerivedPriorityPartitionSummary({
    partitionRows: [fabricatedPartitionRow],
    serviceRows: rows,
    locallyEligibleNodeIds: ELIGIBLE_NODE_IDS,
  }, SUMMARY_HELPERS), null);
  t.end();
});
