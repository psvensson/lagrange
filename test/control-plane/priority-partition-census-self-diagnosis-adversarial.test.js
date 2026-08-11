import {test} from '../../src/test-helpers/tap.js';
import {SERVICE_STATUS, SERVICE_TYPE} from '../../src/constants/index.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  buildDerivedPriorityPartitionSummary,
  chooseMoreAdvancedPriorityPartitionSummary,
  isReadinessPromotable,
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

function createServiceRow(nodeId, index, raftRole = 'follower') {
  return {
    service_id: `${PARTITION_ID}-r${index}`,
    node_id: nodeId,
    partition_id: PARTITION_ID,
    service_type: SERVICE_TYPE.PARTITION,
    status: SERVICE_STATUS.ACTIVE,
    raft_role: raftRole,
    address: `${nodeId}/partition/${PARTITION_ID}/${index}`,
  };
}

function createDerivedOptions(overrides = {}) {
  return {
    partitionRows: [{partition_id: PARTITION_ID, replica_count: 3}],
    serviceRows: [
      createServiceRow('node-1', 1),
      createServiceRow('node-2', 2),
    ],
    locallyEligibleNodeIds: ELIGIBLE_NODE_IDS,
    ...overrides,
  };
}

function semanticBlock(partitionId = PARTITION_ID, overrides = {}) {
  return {
    partitionId,
    requiredDistinctNodeCount: 3,
    readyDistinctNodeCount: 2,
    readyReplicaCount: 2,
    spreadGap: 1,
    exclusionReasonCounts: {},
    ...overrides,
  };
}

function semanticSummary(blockedPartitions = [semanticBlock()]) {
  return {
    satisfied: false,
    requiredDistinctNodeCount: 3,
    readyEligibleNodeCount: 3,
    totalPriorityPartitionCount: blockedPartitions.length,
    missingPartitionIds: blockedPartitions.map((entry) => entry.partitionId),
    blockedPartitions,
  };
}

function partitionBlock(summary) {
  return summary?.blockedPartitions?.find(
    (entry) => entry.partitionId === PARTITION_ID,
  ) || null;
}

test('invalid nested blockers and missing identifiers fail closed', (t) => {
  const proxyBlock = new Proxy(semanticBlock(), {});
  const inheritedBlock = Object.assign(
    Object.create({partitionId: PARTITION_ID}),
    semanticBlock(''),
  );
  const accessorBlock = semanticBlock();
  let accessorReads = 0;
  Object.defineProperty(accessorBlock, 'partitionId', {
    enumerable: true,
    get() {
      accessorReads += 1;
      return PARTITION_ID;
    },
  });
  const invalidSummaries = [
    semanticSummary([proxyBlock]),
    semanticSummary([inheritedBlock]),
    semanticSummary([accessorBlock]),
    {...semanticSummary([]), satisfied: true, missingPartitionIds: [Object(PARTITION_ID)]},
  ];
  accessorReads = 0;
  for (let index = 0; index < invalidSummaries.length; index += 1) {
    t.equal(
      normalizePriorityPartitionSummary(
        invalidSummaries[index],
        {},
        SUMMARY_HELPERS,
      ),
      null,
    );
  }
  t.equal(accessorReads, 0);
  t.end();
});

test('explicit malformed eligibility cannot fall through to inferred nodes', (t) => {
  const sparse = new Array(3);
  sparse[0] = 'node-1';
  sparse[2] = 'node-3';
  const accessor = ['node-1', 'node-2', 'node-3'];
  let accessorReads = 0;
  Object.defineProperty(accessor, 1, {
    enumerable: true,
    configurable: true,
    get() {
      accessorReads += 1;
      return 'node-2';
    },
  });
  class NodeList extends Array {}
  const invalidLists = [
    new Proxy([...ELIGIBLE_NODE_IDS], {}),
    sparse,
    accessor,
    new NodeList(...ELIGIBLE_NODE_IDS),
    ['node-1', 'node-2', Object('node-3')],
  ];
  for (let index = 0; index < invalidLists.length; index += 1) {
    t.equal(buildDerivedPriorityPartitionSummary(
      createDerivedOptions({locallyEligibleNodeIds: invalidLists[index]}),
      SUMMARY_HELPERS,
    ), null);
  }
  t.equal(accessorReads, 0);
  t.end();
});

test('explicit malformed readiness evidence cannot promote a learner', (t) => {
  const learnerRows = [
    createServiceRow('node-1', 1),
    createServiceRow('node-2', 2),
    createServiceRow('node-3', 3, 'learner'),
  ];
  const nonPromotable = {
    dimensions: {
      controlPlanePublished: false,
      controlPlaneRecoveryEligible: false,
    },
  };
  const normal = buildDerivedPriorityPartitionSummary(createDerivedOptions({
    serviceRows: learnerRows,
    readinessByNodeId: {'node-3': nonPromotable},
  }), SUMMARY_HELPERS);
  t.equal(
    partitionBlock(normal).exclusionReasonCounts.learner_not_promotable,
    1,
  );

  let dimensionReads = 0;
  const accessorReadiness = {};
  Object.defineProperty(accessorReadiness, 'dimensions', {
    enumerable: true,
    get() {
      dimensionReads += 1;
      return nonPromotable.dimensions;
    },
  });
  const invalidMaps = [
    {'node-3': new Proxy(nonPromotable, {})},
    {'node-3': accessorReadiness},
    {'node-3': Object('boxed')},
  ];
  for (let index = 0; index < invalidMaps.length; index += 1) {
    t.equal(buildDerivedPriorityPartitionSummary(createDerivedOptions({
      serviceRows: learnerRows,
      readinessByNodeId: invalidMaps[index],
    }), SUMMARY_HELPERS), null);
  }
  t.equal(dimensionReads, 0);
  t.end();
});

test('direct readiness promotion rejects exotic nested dimensions', (t) => {
  const arrayDimensions = Object.assign([], {
    controlPlaneRecoveryEligible: true,
  });
  const boxedDimensions = Object.assign(Object('dimensions'), {
    controlPlaneRecoveryEligible: true,
  });
  const hiddenDimensions = {};
  Object.defineProperty(hiddenDimensions, 'controlPlaneRecoveryEligible', {
    value: true,
    configurable: true,
  });
  let accessorReads = 0;
  const accessorDimensions = {controlPlaneRecoveryEligible: true};
  Object.defineProperty(accessorDimensions, 'controlPlanePublished', {
    enumerable: true,
    configurable: true,
    get() {
      accessorReads += 1;
      return true;
    },
  });
  const invalidDimensions = [
    arrayDimensions,
    boxedDimensions,
    hiddenDimensions,
    accessorDimensions,
  ];
  for (let index = 0; index < invalidDimensions.length; index += 1) {
    t.equal(isReadinessPromotable({
      dimensions: invalidDimensions[index],
    }), false);
  }
  t.equal(accessorReads, 0);
  t.end();
});

test('revoked proxies fail closed at every canonical census boundary', (t) => {
  const outerReadiness = Proxy.revocable({}, {});
  const nestedDimensions = Proxy.revocable({}, {});
  const serviceArray = Proxy.revocable([], {});
  const serviceRecord = Proxy.revocable(createServiceRow('node-1', 1), {});
  outerReadiness.revoke();
  nestedDimensions.revoke();
  serviceArray.revoke();
  serviceRecord.revoke();

  t.equal(isReadinessPromotable(outerReadiness.proxy), false);
  t.equal(isReadinessPromotable({
    dimensions: nestedDimensions.proxy,
  }), false);
  t.equal(buildDerivedPriorityPartitionSummary(createDerivedOptions({
    serviceRows: serviceArray.proxy,
  }), SUMMARY_HELPERS), null);
  t.equal(buildDerivedPriorityPartitionSummary(createDerivedOptions({
    serviceRows: [serviceRecord.proxy],
  }), SUMMARY_HELPERS), null);
  t.end();
});

test('captured Array classification keeps partition rows visible', (t) => {
  const originalIsArray = Object.getOwnPropertyDescriptor(Array, 'isArray');
  let summary;
  try {
    Reflect.defineProperty(Array, 'isArray', {
      value() {
        return false;
      },
      configurable: true,
      writable: true,
    });
    summary = buildDerivedPriorityPartitionSummary(
      createDerivedOptions(),
      SUMMARY_HELPERS,
    );
  } finally {
    Reflect.defineProperty(Array, 'isArray', originalIsArray);
  }
  const block = partitionBlock(summary);
  t.equal(summary.satisfied, false);
  t.equal(block.expectedReplicaCount, 3);
  t.equal(block.exclusionReasonCounts.row_absent, 1);
  t.equal(block.readyReplicaCount, 2);
  t.end();
});

test('captured Map construction keeps partition rows visible', (t) => {
  const originalMap = Object.getOwnPropertyDescriptor(globalThis, 'Map');
  let summary;
  try {
    Reflect.defineProperty(globalThis, 'Map', {
      value: class AmbientMap {},
      configurable: true,
      writable: true,
    });
    summary = buildDerivedPriorityPartitionSummary(
      createDerivedOptions(),
      SUMMARY_HELPERS,
    );
  } finally {
    Reflect.defineProperty(globalThis, 'Map', originalMap);
  }
  const block = partitionBlock(summary);
  t.equal(summary.satisfied, false);
  t.equal(block.expectedReplicaCount, 3);
  t.equal(block.exclusionReasonCounts.row_absent, 1);
  t.end();
});

test('captured Set insertion keeps the census stable after ambient mutation', (t) => {
  const originalAdd = Object.getOwnPropertyDescriptor(Set.prototype, 'add');
  let summary;
  try {
    Reflect.defineProperty(Set.prototype, 'add', {
      value() {
        return this;
      },
      configurable: true,
      writable: true,
    });
    summary = buildDerivedPriorityPartitionSummary(
      createDerivedOptions(),
      SUMMARY_HELPERS,
    );
  } finally {
    Reflect.defineProperty(Set.prototype, 'add', originalAdd);
  }
  t.equal(summary.satisfied, false);
  t.equal(partitionBlock(summary).readyDistinctNodeCount, 2);
  t.end();
});

test('captured Map lookup keeps partition classification stable', (t) => {
  const originalGet = Object.getOwnPropertyDescriptor(Map.prototype, 'get');
  const originalHas = Object.getOwnPropertyDescriptor(Map.prototype, 'has');
  let summary;
  try {
    Reflect.defineProperty(Map.prototype, 'get', {
      value() {
        return null;
      },
      configurable: true,
      writable: true,
    });
    Reflect.defineProperty(Map.prototype, 'has', {
      value() {
        return false;
      },
      configurable: true,
      writable: true,
    });
    summary = buildDerivedPriorityPartitionSummary(
      createDerivedOptions(),
      SUMMARY_HELPERS,
    );
  } finally {
    Reflect.defineProperty(Map.prototype, 'get', originalGet);
    Reflect.defineProperty(Map.prototype, 'has', originalHas);
  }
  t.equal(summary.satisfied, false);
  t.equal(partitionBlock(summary).readyDistinctNodeCount, 2);
  t.end();
});

test('captured collection iterator steps keep every partition visible', (t) => {
  const mapIteratorPrototype = Object.getPrototypeOf(new Map().values());
  const setIteratorPrototype = Object.getPrototypeOf(new Set().values());
  const originalMapNext = Object.getOwnPropertyDescriptor(
    mapIteratorPrototype,
    'next',
  );
  const originalSetNext = Object.getOwnPropertyDescriptor(
    setIteratorPrototype,
    'next',
  );
  let summary;
  try {
    Reflect.defineProperty(mapIteratorPrototype, 'next', {
      value() {
        return {done: true, value: undefined};
      },
      configurable: true,
      writable: true,
    });
    Reflect.defineProperty(setIteratorPrototype, 'next', {
      value() {
        return {done: true, value: undefined};
      },
      configurable: true,
      writable: true,
    });
    summary = buildDerivedPriorityPartitionSummary(
      createDerivedOptions(),
      SUMMARY_HELPERS,
    );
  } finally {
    Reflect.defineProperty(mapIteratorPrototype, 'next', originalMapNext);
    Reflect.defineProperty(setIteratorPrototype, 'next', originalSetNext);
  }
  t.equal(summary.satisfied, false);
  t.equal(summary.totalPriorityPartitionCount, 6);
  t.equal(partitionBlock(summary).readyDistinctNodeCount, 2);
  t.end();
});

test('optional diagnostics use own presence under prototype pollution', (t) => {
  const baselineBlock = semanticBlock();
  delete baselineBlock.exclusionReasonCounts;
  const baseline = semanticSummary([baselineBlock]);
  const enriched = semanticSummary([semanticBlock(PARTITION_ID, {
    exclusionReasonCounts: {row_absent: 1},
  })]);
  const originalCounts = Object.getOwnPropertyDescriptor(
    Object.prototype,
    'exclusionReasonCounts',
  );
  let selected;
  try {
    Reflect.defineProperty(Object.prototype, 'exclusionReasonCounts', {
      value: {row_absent: 1},
      configurable: true,
      enumerable: true,
    });
    selected = chooseMoreAdvancedPriorityPartitionSummary(
      baseline,
      enriched,
      SUMMARY_HELPERS,
    );
  } finally {
    if (originalCounts) {
      Reflect.defineProperty(
        Object.prototype,
        'exclusionReasonCounts',
        originalCounts,
      );
    } else {
      Reflect.deleteProperty(Object.prototype, 'exclusionReasonCounts');
    }
  }
  t.equal(
    Object.hasOwn(selected.blockedPartitions[0], 'exclusionReasonCounts'),
    true,
  );
  t.equal(selected.blockedPartitions[0].exclusionReasonCounts.row_absent, 1);
  t.end();
});

test('hidden readiness evidence is invalid rather than silently absent', (t) => {
  const learnerRows = [
    createServiceRow('node-1', 1),
    createServiceRow('node-2', 2),
    createServiceRow('node-3', 3, 'learner'),
  ];
  const nonPromotable = {
    dimensions: {
      controlPlanePublished: false,
      controlPlaneRecoveryEligible: false,
    },
  };
  const hiddenNodeMap = {};
  Object.defineProperty(hiddenNodeMap, 'node-3', {
    value: nonPromotable,
    configurable: true,
  });
  const hiddenDimensions = {};
  Object.defineProperty(hiddenDimensions, 'dimensions', {
    value: nonPromotable.dimensions,
    configurable: true,
  });
  for (const readinessByNodeId of [
    hiddenNodeMap,
    {'node-3': hiddenDimensions},
  ]) {
    t.equal(buildDerivedPriorityPartitionSummary(createDerivedOptions({
      serviceRows: learnerRows,
      readinessByNodeId,
    }), SUMMARY_HELPERS), null);
  }
  t.end();
});

test('invalid readiness keys return unavailable without throwing', (t) => {
  const options = createDerivedOptions();
  delete options.locallyEligibleNodeIds;
  options.readinessByNodeId = {'': {}};
  t.equal(
    buildDerivedPriorityPartitionSummary(options, SUMMARY_HELPERS),
    null,
  );
  t.end();
});

test('exotic summary, blocker, and options records fail closed', (t) => {
  const satisfied = semanticSummary([]);
  satisfied.satisfied = true;
  const boxedSummary = Object.assign(Object('summary'), satisfied);
  const arraySummary = Object.assign([], satisfied);
  const boxedBlock = Object.assign(Object('block'), semanticBlock());
  const arrayBlock = Object.assign([], semanticBlock());
  t.equal(normalizePriorityPartitionSummary(
    boxedSummary,
    {},
    SUMMARY_HELPERS,
  ), null);
  t.equal(normalizePriorityPartitionSummary(
    arraySummary,
    {},
    SUMMARY_HELPERS,
  ), null);
  t.equal(normalizePriorityPartitionSummary(
    semanticSummary([boxedBlock]),
    {},
    SUMMARY_HELPERS,
  ), null);
  t.equal(normalizePriorityPartitionSummary(
    semanticSummary([arrayBlock]),
    {},
    SUMMARY_HELPERS,
  ), null);
  t.equal(buildDerivedPriorityPartitionSummary(
    Object.assign([], createDerivedOptions()),
    SUMMARY_HELPERS,
  ), null);
  t.end();
});

test('captured string normalization keeps owner classification stable', (t) => {
  const originalTrim = Object.getOwnPropertyDescriptor(String.prototype, 'trim');
  const originalLower = Object.getOwnPropertyDescriptor(
    String.prototype,
    'toLowerCase',
  );
  let summary;
  try {
    Reflect.defineProperty(String.prototype, 'trim', {
      value() {
        return '';
      },
      configurable: true,
      writable: true,
    });
    Reflect.defineProperty(String.prototype, 'toLowerCase', {
      value() {
        return 'corrupted';
      },
      configurable: true,
      writable: true,
    });
    summary = buildDerivedPriorityPartitionSummary(
      createDerivedOptions(),
      SUMMARY_HELPERS,
    );
  } finally {
    Reflect.defineProperty(String.prototype, 'trim', originalTrim);
    Reflect.defineProperty(String.prototype, 'toLowerCase', originalLower);
  }
  t.equal(summary.satisfied, false);
  t.equal(partitionBlock(summary).readyReplicaCount, 2);
  t.end();
});

test('negative zero and invalid explicit counts are unavailable, not defaults', (t) => {
  const summaryFields = [
    'requiredDistinctNodeCount',
    'readyEligibleNodeCount',
    'totalPriorityPartitionCount',
  ];
  for (let index = 0; index < summaryFields.length; index += 1) {
    t.equal(normalizePriorityPartitionSummary({
      ...semanticSummary(),
      [summaryFields[index]]: -0,
    }, {}, SUMMARY_HELPERS), null);
  }
  const blockFields = [
    'requiredDistinctNodeCount',
    'readyDistinctNodeCount',
    'readyReplicaCount',
    'spreadGap',
  ];
  for (let index = 0; index < blockFields.length; index += 1) {
    t.equal(normalizePriorityPartitionSummary(
      semanticSummary([semanticBlock(PARTITION_ID, {
        [blockFields[index]]: -0,
      })]),
      {},
      SUMMARY_HELPERS,
    ), null);
  }
  t.equal(normalizePriorityPartitionSummary(
    semanticSummary([semanticBlock(PARTITION_ID, {
      exclusionReasonCounts: {row_absent: -0},
    })]),
    {},
    SUMMARY_HELPERS,
  ), null);
  t.end();
});

test('exact internal totals distinguish safe-integer aggregate overflow', (t) => {
  const baseline = semanticSummary([
    semanticBlock(`${PARTITION_ID}-a`, {spreadGap: Number.MAX_SAFE_INTEGER}),
    semanticBlock(`${PARTITION_ID}-b`, {spreadGap: 1}),
  ]);
  const worseCandidate = semanticSummary([
    semanticBlock(`${PARTITION_ID}-a`, {spreadGap: Number.MAX_SAFE_INTEGER}),
    semanticBlock(`${PARTITION_ID}-b`, {spreadGap: 2}),
  ]);
  t.same(
    chooseMoreAdvancedPriorityPartitionSummary(
      baseline,
      worseCandidate,
      SUMMARY_HELPERS,
    ),
    normalizePriorityPartitionSummary(baseline, {}, SUMMARY_HELPERS),
  );
  t.end();
});
