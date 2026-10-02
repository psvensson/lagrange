/**
 * Guard tests for merge-candidate auto-execution in
 * PartitionSplitMergeManager: eligible adjacent under-threshold pairs now
 * EXECUTE through the wired executeMergeCandidate owner (they are no
 * longer computed and discarded), execution is bounded per evaluation
 * exactly like splits, deferred/error outcomes land in their canonical
 * buckets, and the loop stays inert when no owner is wired.
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  DEFAULT_MAX_AUTO_EXECUTE_MERGES_PER_EVALUATION,
  PartitionSplitMergeManager,
} from '../../src/partition/partition-split-merge-manager.js';
import {
  PARTITION_TRANSITION_STATE,
  SPLIT_MERGE_REASON,
} from '../../src/partition/partition-constants.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
} from '../../src/partition/partition-service-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

const SQLITE_BINARY_EARLIER_KEY = '\uE000';
const UTF16_EARLIER_BUT_SQLITE_LATER_KEY = '\u{10000}';
const EXPECTED_ADJACENCY_MISMATCH =
  PARTITION_SERVICE_ERROR_MSG.splitKeyTypeMismatch('number', 'string');

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'test-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function buildPartitionRow(partitionId, startKey, endKey) {
  return {
    partition_id: partitionId,
    table_id: 'tbl-users',
    partition_key_start: startKey,
    partition_key_end: endKey,
    size_bytes: 64,
  };
}

function buildManager(options = {}) {
  const executedCandidates = options.executedCandidates || [];
  const manager = new PartitionSplitMergeManager({
    listPartitions: options.listPartitions || (() => [
      buildPartitionRow('users-p1', null, 'm'),
      buildPartitionRow('users-p2', 'm', null),
    ]),
    getPartitionMetrics: options.getPartitionMetrics ||
      (() => ({sizeBytes: 64, queriesPerMinute: 0})),
    executeMergeCandidate: Object.hasOwn(options, 'executeMergeCandidate') ?
      options.executeMergeCandidate :
      (async (candidate) => {
        executedCandidates.push(candidate);
        return {success: true, workflowId: 'merge-wf'};
      }),
    ...options.managerOptions,
  });
  return {manager, executedCandidates};
}

test('merge auto-execution - eligible adjacent pair executes through the ' +
    'wired owner', async (t) => {
  const {manager, executedCandidates} = buildManager();

  const results = await manager.evaluateAllPartitions();
  t.equal(results.evaluated, true);
  t.same(results.mergeCandidates, [
    {leftId: 'users-p1', rightId: 'users-p2'},
  ]);
  t.equal(results.executedMerges.length, 1);
  t.equal(results.mergeErrors.length, 0);
  t.same(executedCandidates, [{leftId: 'users-p1', rightId: 'users-p2'}]);

  manager.shutdown();
});


test('merge sort table IDs ignore mutable String and reject coercion', (t) => {
  const {manager} = buildManager({executeMergeCandidate: null});
  const rows = [
    {...buildPartitionRow('b-p1', null, null), table_id: 'table-b'},
    {...buildPartitionRow('a-p1', null, null), table_id: 'table-a'},
  ];
  const OriginalString = globalThis.String;
  try {
    globalThis.String = () => 'corrupted';
    t.same(
      manager.sortEvaluationPartitions(rows).map((row) => row.partition_id),
      ['a-p1', 'b-p1'],
      'primitive table IDs sort without consulting mutable String',
    );
  } finally {
    globalThis.String = OriginalString;
  }

  let coercionCalls = 0;
  const hostileTableId = {
    [Symbol.toPrimitive]() {
      coercionCalls += 1;
      throw new Error('table ID coercion executed');
    },
  };
  const hostileRows = [
    {...buildPartitionRow('bad-p1', null, null), table_id: hostileTableId},
    {...buildPartitionRow('good-p1', null, null), table_id: 'table-a'},
  ];
  t.throws(
    () => manager.sortEvaluationPartitions(hostileRows),
    TypeError,
    'non-string table IDs fail closed',
  );
  const sameHostileRows = [
    {...buildPartitionRow('bad-p1', null, null), table_id: hostileTableId},
    {...buildPartitionRow('bad-p2', 'm', null), table_id: hostileTableId},
  ];
  t.throws(
    () => manager.sortEvaluationPartitions(sameHostileRows),
    TypeError,
    'same-reference non-string table IDs validate before equality',
  );
  t.equal(coercionCalls, 0, 'table ID comparison never coerces hostile metadata');
  manager.shutdown();
  t.end();
});

test('merge table IDs preserve falsey values for primitive-string validation',
  (t) => {
    const {manager} = buildManager({executeMergeCandidate: null});
    for (const invalidTableId of [0, false]) {
      const rows = [
        {...buildPartitionRow('bad-p1', null, null), table_id: invalidTableId},
        {...buildPartitionRow('good-p1', null, null), table_id: 'table-a'},
      ];
      t.throws(
        () => manager.sortEvaluationPartitions(rows),
        TypeError,
        'falsey non-string table IDs are rejected rather than normalized away',
      );
    }
    t.equal(
      manager.getPartitionTableId(
        {...buildPartitionRow('empty-p1', null, null), table_id: ''},
      ),
      '',
      'an own primitive empty string is preserved as a string value',
    );
    manager.shutdown();
    t.end();
  });

test('merge table ID reads ignore accessors, inheritance and prototype pollution',
  (t) => {
    const {manager} = buildManager({executeMergeCandidate: null});
    let accessorCalls = 0;
    const inheritedRow = Object.create({table_id: 'polluted-table'});
    inheritedRow.partition_id = 'inherited-p1';
    inheritedRow.partition_key_start = null;
    inheritedRow.partition_key_end = null;

    const accessorRow = buildPartitionRow('accessor-p1', null, null);
    Reflect.deleteProperty(accessorRow, 'table_id');
    Object.defineProperty(accessorRow, 'table_id', {
      configurable: true,
      enumerable: true,
      get() {
        accessorCalls += 1;
        return 'getter-table';
      },
    });

    const priorPrototypeTableId =
      Object.getOwnPropertyDescriptor(Object.prototype, 'table_id');
    try {
      Reflect.defineProperty(Object.prototype, 'table_id', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: 'prototype-table',
      });
      t.equal(manager.getPartitionTableId(inheritedRow), null);
      t.equal(manager.getPartitionTableId(accessorRow), null);
      t.equal(
        manager.getPartitionTableId({
          partition_id: 'plain-p1',
          partition_key_start: null,
          partition_key_end: null,
        }),
        null,
      );
      t.equal(accessorCalls, 0, 'table-ID accessors are never invoked');
    } finally {
      if (priorPrototypeTableId) {
        Reflect.defineProperty(
          Object.prototype,
          'table_id',
          priorPrototypeTableId,
        );
      } else {
        Reflect.deleteProperty(Object.prototype, 'table_id');
      }
      manager.shutdown();
    }
    t.end();
  });

test('merge table ID reads capture Object.getOwnPropertyDescriptor', (t) => {
  const {manager} = buildManager({executeMergeCandidate: null});
  const original = Object.getOwnPropertyDescriptor;
  try {
    Object.getOwnPropertyDescriptor = () => {
      throw new Error('mutated getOwnPropertyDescriptor');
    };
    t.equal(
      manager.getPartitionTableId(
        {...buildPartitionRow('owned-p1', null, null), table_id: 'table-a'},
      ),
      'table-a',
    );
  } finally {
    Object.getOwnPropertyDescriptor = original;
    manager.shutdown();
  }
  t.end();
});

test('merge table ID reads capture Object.hasOwn', (t) => {
  const {manager} = buildManager({executeMergeCandidate: null});
  const original = Object.hasOwn;
  try {
    Object.hasOwn = () => false;
    t.equal(
      manager.getPartitionTableId(
        {...buildPartitionRow('owned-p1', null, null), table_id: 'table-a'},
      ),
      'table-a',
    );
  } finally {
    Object.hasOwn = original;
    manager.shutdown();
  }
  t.end();
});

test('merge table ID validation happens before absent ordering', (t) => {
  const {manager} = buildManager({executeMergeCandidate: null});
  const invalidIds = [false, 0, Object('boxed-table')];
  for (const invalidTableId of invalidIds) {
    const invalidRow = {
      ...buildPartitionRow('invalid-p1', null, null),
      table_id: invalidTableId,
    };
    const absentRow = buildPartitionRow('absent-p1', null, null);
    Reflect.deleteProperty(absentRow, 'table_id');
    t.throws(
      () => manager.sortEvaluationPartitions([absentRow, invalidRow]),
      TypeError,
      'invalid right table ID is rejected before left absence orders it',
    );
    t.throws(
      () => manager.sortEvaluationPartitions([invalidRow, absentRow]),
      TypeError,
      'invalid left table ID is rejected before right absence orders it',
    );
  }
  manager.shutdown();
  t.end();
});

test('merge evaluation ignores source iterators and captures array intrinsics',
  async (t) => {
    const rows = [
      {...buildPartitionRow('users-p2', 'm', null), table_id: 'tbl-users'},
      {...buildPartitionRow('users-p1', null, 'm'), table_id: 'tbl-users'},
    ];
    const {manager} = buildManager({
      listPartitions: () => rows,
      executeMergeCandidate: null,
    });
    const originalOwnIterator =
      Object.getOwnPropertyDescriptor(rows, Symbol.iterator);
    const originalSort = Array.prototype.sort;
    const originalIsArray = Array.isArray;
    let results;
    try {
      Object.defineProperty(rows, Symbol.iterator, {
        configurable: true,
        value() {
          throw new Error('partition iterator must not execute');
        },
      });
      Array.prototype.sort = () => {
        throw new Error('mutable Array.prototype.sort must not execute');
      };
      Array.isArray = () => false;
      results = await manager.evaluateAllPartitions();
    } finally {
      Array.isArray = originalIsArray;
      Array.prototype.sort = originalSort;
      if (originalOwnIterator) {
        Object.defineProperty(rows, Symbol.iterator, originalOwnIterator);
      } else {
        Reflect.deleteProperty(rows, Symbol.iterator);
      }
      manager.shutdown();
    }
    t.same(results.mergeCandidates, [
      {leftId: 'users-p1', rightId: 'users-p2'},
    ]);
    t.end();
  });

test('merge evaluation copy ignores inherited numeric setters and key accessors',
  async (t) => {
    const rows = [
      buildPartitionRow('users-p1', null, 'm'),
      buildPartitionRow('users-p2', 'm', null),
    ];
    let inheritedSetterCalls = 0;
    let keyAccessorCalls = 0;
    const accessorRow = rows[1];
    const ownStart = accessorRow.partition_key_start;
    Reflect.deleteProperty(accessorRow, 'partition_key_start');
    Object.defineProperty(accessorRow, 'partition_key_start', {
      configurable: true,
      enumerable: true,
      get() {
        keyAccessorCalls += 1;
        return ownStart;
      },
    });
    Object.defineProperty(accessorRow, 'partitionKeyStart', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: ownStart,
    });
    const priorPrototypeIndex =
      Object.getOwnPropertyDescriptor(Array.prototype, '0');
    try {
      Object.defineProperty(Array.prototype, '0', {
        configurable: true,
        set() {
          inheritedSetterCalls += 1;
        },
      });
      const {manager} = buildManager({
        listPartitions: () => rows,
        executeMergeCandidate: null,
      });
      const results = await manager.evaluateAllPartitions();
      t.same(results.mergeCandidates, [
        {leftId: 'users-p1', rightId: 'users-p2'},
      ]);
      t.equal(inheritedSetterCalls, 0,
        'copy defines own numeric slots without prototype setters');
      t.equal(keyAccessorCalls, 0,
        'partition-key accessors are not invoked');
      manager.shutdown();
    } finally {
      if (priorPrototypeIndex) {
        Object.defineProperty(Array.prototype, '0', priorPrototypeIndex);
      } else {
        Reflect.deleteProperty(Array.prototype, '0');
      }
    }
    t.end();
  });

test('merge auto-execution - adjacency sorting uses SQLite BINARY key order',
  async (t) => {
    const {manager} = buildManager({
      listPartitions: () => [
        buildPartitionRow(
          'users-p3',
          UTF16_EARLIER_BUT_SQLITE_LATER_KEY,
          null,
        ),
        buildPartitionRow('users-p1', null, SQLITE_BINARY_EARLIER_KEY),
        buildPartitionRow(
          'users-p2',
          SQLITE_BINARY_EARLIER_KEY,
          UTF16_EARLIER_BUT_SQLITE_LATER_KEY,
        ),
      ],
      executeMergeCandidate: null,
    });

    const results = await manager.evaluateAllPartitions();
    t.same(results.mergeCandidates, [
      {leftId: 'users-p1', rightId: 'users-p2'},
      {leftId: 'users-p2', rightId: 'users-p3'},
    ]);

    manager.shutdown();
  });

test('merge auto-execution - adjacency delegates mixed-key refusal to routing owner',
  async (t) => {
    const {manager} = buildManager({
      listPartitions: () => [
        buildPartitionRow('users-p1', null, 1000),
        buildPartitionRow('users-p2', 'abc', null),
      ],
      executeMergeCandidate: null,
    });

    await t.rejects(
      manager.evaluateAllPartitions(),
      {message: EXPECTED_ADJACENCY_MISMATCH},
      'mixed boundary types must fail closed through the partition-key order owner',
    );

    manager.shutdown();
  });

test('merge auto-execution - bounded per evaluation; overflow candidates ' +
    'are deferred with backpressure', async (t) => {
  const {manager, executedCandidates} = buildManager({
    listPartitions: () => [
      buildPartitionRow('users-p1', null, 'g'),
      buildPartitionRow('users-p2', 'g', 'm'),
      buildPartitionRow('users-p3', 'm', 't'),
      buildPartitionRow('users-p4', 't', null),
    ],
  });
  t.equal(
    manager.getThresholds().maxAutoExecuteMergesPerEvaluation,
    DEFAULT_MAX_AUTO_EXECUTE_MERGES_PER_EVALUATION,
  );

  const results = await manager.evaluateAllPartitions();
  t.equal(results.mergeCandidates.length, 3);
  t.equal(executedCandidates.length,
    DEFAULT_MAX_AUTO_EXECUTE_MERGES_PER_EVALUATION);
  t.equal(results.executedMerges.length,
    DEFAULT_MAX_AUTO_EXECUTE_MERGES_PER_EVALUATION);
  t.equal(results.mergeDeferred.length, 2);
  for (const deferred of results.mergeDeferred) {
    t.equal(deferred.reason, SPLIT_MERGE_REASON.CONTROL_PLANE_BACKPRESSURE);
  }

  manager.shutdown();
});

test('merge auto-execution - deferred workflow outcomes land in the ' +
    'deferred bucket, errors in the error bucket', async (t) => {
  const deferredExecution = {
    success: false,
    state: PARTITION_TRANSITION_STATE.DEFERRED,
    retryScheduled: true,
  };
  const {manager} = buildManager({
    executeMergeCandidate: async () => deferredExecution,
  });
  const results = await manager.evaluateAllPartitions();
  t.equal(results.mergeDeferred.length, 1);
  t.equal(results.executedMerges.length, 0);
  manager.shutdown();

  const {manager: failingManager} = buildManager({
    executeMergeCandidate: async () => {
      throw new Error('merge start exploded');
    },
  });
  const failingResults = await failingManager.evaluateAllPartitions();
  t.equal(failingResults.mergeErrors.length, 1);
  t.equal(failingResults.mergeErrors[0].error, 'merge start exploded');
  t.equal(failingResults.executedMerges.length, 0);
  failingManager.shutdown();
});

test('merge auto-execution - stays inert when no owner is wired: ' +
    'candidates are still reported', async (t) => {
  const {manager} = buildManager({executeMergeCandidate: null});

  const results = await manager.evaluateAllPartitions();
  t.same(results.mergeCandidates, [
    {leftId: 'users-p1', rightId: 'users-p2'},
  ]);
  t.equal(results.executedMerges.length, 0);
  t.equal(results.mergeErrors.length, 0);
  t.equal(results.mergeDeferred.length, 0);

  manager.shutdown();
});

test('merge auto-execution - over-threshold pairs are not candidates and ' +
    'never execute', async (t) => {
  const {manager, executedCandidates} = buildManager({
    getPartitionMetrics: () => ({
      sizeBytes: 3 * 1024 * 1024 * 1024,
      queriesPerMinute: 0,
    }),
  });

  const results = await manager.evaluateAllPartitions();
  t.equal(results.mergeCandidates.length, 0);
  t.equal(executedCandidates.length, 0);

  manager.shutdown();
});

test('merge auto-execution - non-adjacent partitions are not candidates',
  async (t) => {
    const {manager, executedCandidates} = buildManager({
      listPartitions: () => [
        buildPartitionRow('users-p1', null, 'g'),
        buildPartitionRow('users-p2', 'm', null),
      ],
    });

    const results = await manager.evaluateAllPartitions();
    t.equal(results.mergeCandidates.length, 0);
    t.equal(executedCandidates.length, 0);

    manager.shutdown();
  });

test('merge auto-execution - evaluation summary diagnostics count merge ' +
    'executions', async (t) => {
  const {manager} = buildManager();
  await manager.evaluateAllPartitions();
  const diagnostics = manager.getEvaluationDiagnostics();
  t.equal(diagnostics.lastSummary.mergeCandidateCount, 1);
  t.equal(diagnostics.lastSummary.executedMergeCount, 1);
  t.equal(diagnostics.lastSummary.mergeErrorCount, 0);
  manager.shutdown();
});
