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

test('merge table ID validation happens before absent ordering',
  async (t) => {
    for (const invalidTableId of [false, 0, Object('boxed-table')]) {
      for (const absentKind of ['missing', 'null', 'undefined']) {
        for (const invalidFirst of [false, true]) {
          const invalidRow = {
            ...buildPartitionRow('invalid-p1', null, null),
            table_id: invalidTableId,
          };
          const absentRow = buildPartitionRow('absent-p1', null, null);
          if (absentKind === 'missing') {
            Reflect.deleteProperty(absentRow, 'table_id');
          } else {
            absentRow.table_id = absentKind === 'null' ? null : undefined;
          }
          const rows = invalidFirst ?
            [invalidRow, absentRow] :
            [absentRow, invalidRow];
          const {manager} = buildManager({
            listPartitions: () => rows,
            executeMergeCandidate: null,
          });
          await t.rejects(
            manager.evaluateAllPartitions(),
            TypeError,
            'invalid non-absent table ID is rejected before ' +
              absentKind + ' ordering',
          );
          manager.shutdown();
        }
      }
    }
    t.end();
  });

test('merge evaluation ignores a hostile source iterator', async (t) => {
  const rows = [
    buildPartitionRow('users-p2', 'm', null),
    buildPartitionRow('users-p1', null, 'm'),
  ];
  const {manager} = buildManager({
    listPartitions: () => rows,
    executeMergeCandidate: null,
  });
  const originalOwnIterator =
    Object.getOwnPropertyDescriptor(rows, Symbol.iterator);
  let results;
  try {
    Object.defineProperty(rows, Symbol.iterator, {
      configurable: true,
      value() {
        throw new Error('partition iterator must not execute');
      },
    });
    results = await manager.evaluateAllPartitions();
  } finally {
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

test('merge evaluation captures Array.isArray', async (t) => {
  const rows = [
    buildPartitionRow('users-p2', 'm', null),
    buildPartitionRow('users-p1', null, 'm'),
  ];
  const {manager} = buildManager({
    listPartitions: () => rows,
    executeMergeCandidate: null,
  });
  const original = Array.isArray;
  let results;
  try {
    Array.isArray = () => false;
    results = await manager.evaluateAllPartitions();
  } finally {
    Array.isArray = original;
    manager.shutdown();
  }
  t.same(results.mergeCandidates, [
    {leftId: 'users-p1', rightId: 'users-p2'},
  ]);
  t.end();
});

test('merge evaluation captures Array.prototype.sort', async (t) => {
  const rows = [
    buildPartitionRow('users-p2', 'm', null),
    buildPartitionRow('users-p1', null, 'm'),
  ];
  const {manager} = buildManager({
    listPartitions: () => rows,
    executeMergeCandidate: null,
  });
  const original = Array.prototype.sort;
  let results;
  try {
    Array.prototype.sort = () => {
      throw new Error('mutable Array.prototype.sort must not execute');
    };
    results = await manager.evaluateAllPartitions();
  } finally {
    Array.prototype.sort = original;
    manager.shutdown();
  }
  t.same(results.mergeCandidates, [
    {leftId: 'users-p1', rightId: 'users-p2'},
  ]);
  t.end();
});

test('merge evaluation captures Reflect.apply', async (t) => {
  const rows = [
    buildPartitionRow('users-p2', 'm', null),
    buildPartitionRow('users-p1', null, 'm'),
  ];
  const {manager} = buildManager({
    listPartitions: () => rows,
    executeMergeCandidate: null,
  });
  const original = Reflect.apply;
  let results;
  try {
    Reflect.apply = () => {
      throw new Error('mutable Reflect.apply must not execute');
    };
    results = await manager.evaluateAllPartitions();
  } finally {
    Reflect.apply = original;
    manager.shutdown();
  }
  t.same(results.mergeCandidates, [
    {leftId: 'users-p1', rightId: 'users-p2'},
  ]);
  t.end();
});

test('merge evaluation captures Array.prototype push and includes', async (t) => {
  const rows = [
    buildPartitionRow('users-p2', 'm', null),
    buildPartitionRow('users-p1', null, 'm'),
  ];
  const {manager} = buildManager({
    listPartitions: () => rows,
    executeMergeCandidate: async () => ({
      success: true,
      workflowId: 'merge-wf',
    }),
  });
  const originalPush = Array.prototype.push;
  const originalIncludes = Array.prototype.includes;
  let pushTrapCalls = 0;
  let includesTrapCalls = 0;
  let results;
  try {
    Array.prototype.push = function(...values) {
      if (values.some((value) =>
        value === 'write_activity' ||
        value?.workflowId === 'merge-wf' ||
        (value && value.leftId === 'users-p1' &&
          value.rightId === 'users-p2'))) {
        pushTrapCalls += 1;
        throw new Error('live Array.prototype.push must not execute');
      }
      return originalPush.apply(this, values);
    };
    Array.prototype.includes = function(value, fromIndex) {
      if (value === 'write_activity') {
        includesTrapCalls += 1;
        throw new Error('live Array.prototype.includes must not execute');
      }
      return originalIncludes.call(this, value, fromIndex);
    };
    results = await manager.evaluateAllPartitions({
      reasonCodes: ['write_activity'],
      triggerReason: 'reactive_request',
    });
  } finally {
    Array.prototype.includes = originalIncludes;
    Array.prototype.push = originalPush;
    manager.shutdown();
  }
  t.same(results.mergeCandidates, [
    {leftId: 'users-p1', rightId: 'users-p2'},
  ]);
  t.equal(results.executedMerges.length, 1,
    'auto-executed merge reaches the transition outcome owner');
  t.equal(pushTrapCalls, 0,
    'evaluation and transition outcomes never consult live Array.prototype.push');
  t.equal(includesTrapCalls, 0,
    'evaluation never consults live Array.prototype.includes');
  t.end();
});

test('merge evaluation live copy ignores sparse inherited rows and captures Reflect.defineProperty',
  async (t) => {
    const rows = [];
    rows.length = 3;
    rows[0] = buildPartitionRow('users-p1', null, 'm');
    rows[2] = buildPartitionRow('users-p2', 'm', null);
    let inheritedIndexReads = 0;
    const hostilePrototype = Object.create(Array.prototype);
    Object.defineProperty(hostilePrototype, '1', {
      configurable: true,
      get() {
        inheritedIndexReads += 1;
        return buildPartitionRow('inherited-p1', 'a', 'b');
      },
    });
    Object.setPrototypeOf(rows, hostilePrototype);

    const {manager} = buildManager({
      listPartitions: () => rows,
      executeMergeCandidate: null,
    });
    const originalDefineProperty = Reflect.defineProperty;
    let defineTrapCalls = 0;
    let results;
    try {
      Reflect.defineProperty = (target, key, descriptor) => {
        if (Array.isArray(target) && /^\\d+$/u.test(String(key))) {
          defineTrapCalls += 1;
          throw new Error('live Reflect.defineProperty must not execute');
        }
        return originalDefineProperty(target, key, descriptor);
      };
      results = await manager.evaluateAllPartitions();
    } finally {
      Reflect.defineProperty = originalDefineProperty;
      manager.shutdown();
    }
    t.same(results.mergeCandidates, [
      {leftId: 'users-p1', rightId: 'users-p2'},
    ]);
    t.equal(inheritedIndexReads, 0,
      'sparse inherited numeric rows are not evaluation authority');
    t.equal(defineTrapCalls, 0,
      'evaluation copy uses the captured Reflect.defineProperty intrinsic');
    t.end();
  });

test('evaluation row copying captures Reflect.defineProperty and bypasses inherited setters',
  (t) => {
    const rows = [
      buildPartitionRow('users-p1', null, 'm'),
      buildPartitionRow('users-p2', 'm', null),
    ];
    const {manager} = buildManager({executeMergeCandidate: null});
    let inheritedSetterCalls = 0;
    const priorPrototypeIndex =
      Object.getOwnPropertyDescriptor(Array.prototype, '0');
    const originalDefineProperty = Reflect.defineProperty;
    let copied;
    try {
      Object.defineProperty(Array.prototype, '0', {
        configurable: true,
        set() {
          inheritedSetterCalls += 1;
        },
      });
      Reflect.defineProperty = () => {
        throw new Error('mutable Reflect.defineProperty must not execute');
      };
      copied = manager.normalizeEvaluationPartitions(rows);
    } finally {
      Reflect.defineProperty = originalDefineProperty;
      if (priorPrototypeIndex) {
        Object.defineProperty(Array.prototype, '0', priorPrototypeIndex);
      } else {
        Reflect.deleteProperty(Array.prototype, '0');
      }
      manager.shutdown();
    }
    t.equal(inheritedSetterCalls, 0,
      'copy defines own numeric slots without prototype setters');
    t.equal(copied.length, 2);
    t.equal(copied[0].partition_id, 'users-p1');
    t.end();
  });

test('merge adjacency ignores partition-key accessors and inherited key fields',
  async (t) => {
    let keyAccessorCalls = 0;
    const left = buildPartitionRow('users-p1', null, 'm');
    const right = buildPartitionRow('users-p2', 'm', null);
    const leftEnd = left.partition_key_end;
    const rightStart = right.partition_key_start;
    Reflect.deleteProperty(left, 'partition_key_end');
    Reflect.deleteProperty(right, 'partition_key_start');
    Object.defineProperty(left, 'partition_key_end', {
      configurable: true,
      enumerable: true,
      get() {
        keyAccessorCalls += 1;
        return 'wrong-left-end';
      },
    });
    Object.defineProperty(right, 'partition_key_start', {
      configurable: true,
      enumerable: true,
      get() {
        keyAccessorCalls += 1;
        return 'wrong-right-start';
      },
    });
    Object.defineProperty(left, 'partitionKeyEnd', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: leftEnd,
    });
    Object.defineProperty(right, 'partitionKeyStart', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: rightStart,
    });
    const inherited = Object.create({partition_key_start: 'inherited'});
    inherited.partition_id = 'inherited-p1';
    inherited.table_id = 'tbl-users';
    inherited.partition_key_end = null;
    const {manager} = buildManager({
      listPartitions: () => [left, right],
      executeMergeCandidate: null,
    });
    const results = await manager.evaluateAllPartitions();
    t.same(results.mergeCandidates, [
      {leftId: 'users-p1', rightId: 'users-p2'},
    ]);
    t.equal(keyAccessorCalls, 0, 'partition-key accessors are never invoked');
    t.equal(manager.getPartitionStartKey(inherited), null,
      'inherited partition-key fields are not accepted');
    manager.shutdown();
    t.end();
  });

test('evaluation partition IDs ignore accessors and inherited fields',
  async (t) => {
    let idAccessorCalls = 0;
    const left = buildPartitionRow('users-p1', null, 'm');
    const right = buildPartitionRow('users-p2', 'm', null);

    Reflect.deleteProperty(left, 'partition_id');
    Object.defineProperty(left, 'partition_id', {
      configurable: true,
      enumerable: true,
      get() {
        idAccessorCalls += 1;
        return 'wrong-left-id';
      },
    });
    left.partitionId = 'users-p1';

    const inheritedRight = Object.assign(
      Object.create({partition_id: 'wrong-inherited-id'}),
      right,
    );
    Reflect.deleteProperty(inheritedRight, 'partition_id');
    inheritedRight.partitionId = 'users-p2';

    const {manager} = buildManager({
      listPartitions: () => [left, inheritedRight],
      executeMergeCandidate: null,
    });
    const results = await manager.evaluateAllPartitions();
    t.same(results.mergeCandidates, [
      {leftId: 'users-p1', rightId: 'users-p2'},
    ]);
    t.equal(idAccessorCalls, 0, 'partition-ID accessors are never invoked');
    t.equal(manager.getPartitionId(inheritedRight), 'users-p2',
      'inherited partition IDs are not evaluation authority');
    manager.shutdown();
    t.end();
  });

test('evaluation partition IDs reject boxed and exotic own values', (t) => {
  const {manager} = buildManager({executeMergeCandidate: null});
  for (const invalidId of [Object('boxed-id'), Symbol('invalid-id'), 7]) {
    const row = buildPartitionRow('placeholder', null, null);
    row.partition_id = invalidId;
    row.partitionId = 'fallback-must-not-win';
    t.equal(manager.getPartitionId(row), null,
      'invalid authoritative snake-case ID fails closed without alias fallback');
  }
  manager.shutdown();
  t.end();
});

test('snake-case null boundaries stay authoritative over camel aliases', (t) => {
  const {manager} = buildManager({executeMergeCandidate: null});
  const row = buildPartitionRow('users-p1', null, null);
  row.partitionKeyStart = 'wrong-start';
  row.partitionKeyEnd = 'wrong-end';
  t.equal(manager.getPartitionStartKey(row), null,
    'null snake-case start remains the unbounded lower edge');
  t.equal(manager.getPartitionEndKey(row), null,
    'null snake-case end remains the unbounded upper edge');
  manager.shutdown();
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
