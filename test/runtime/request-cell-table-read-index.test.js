import {test} from '../../src/test-helpers/tap.js';
import {
  INDEXED_ROW_ESTIMATED_BYTES,
  RequestCellTableReadBoundError,
  indexRequestCellTableReads,
  readIndexedRequestCellTable,
  requestCellTableIndexEstimatedBytes,
  requestCellTableIndexRowBound,
} from '../../src/runtime/request-cell-table-read-index.js';

const canonicalArrayPrototype = Object.getPrototypeOf([]);

test('request Cell read index preserves first-row lookup semantics', (t) => {
  const indexed = indexRequestCellTableReads([{
    context: 'table:ratings',
    rows: [
      {key: 1, value: 41},
      {key: 1, value: 99},
      {key: 2, value: 42},
      {key: 4_294_967_295, value: -2_147_483_648},
    ],
  }]);

  t.equal(readIndexedRequestCellTable(indexed, 'table:ratings', 1), 41);
  t.equal(readIndexedRequestCellTable(indexed, 'table:ratings', 2), 42);
  t.equal(readIndexedRequestCellTable(indexed, 'table:ratings', 3), 0);
  t.equal(
    readIndexedRequestCellTable(
      indexed,
      'table:ratings',
      4_294_967_295,
    ),
    -2_147_483_648,
  );
  t.end();
});

test('request Cell read indexes are invocation-isolated snapshots', (t) => {
  const source = [{
    context: 'table:ratings',
    rows: [{key: 1, value: 10}],
  }];
  const first = indexRequestCellTableReads(source);
  source[0].rows[0].value = 20;
  const second = indexRequestCellTableReads(source);

  t.equal(readIndexedRequestCellTable(first, 'table:ratings', 1), 10);
  t.equal(readIndexedRequestCellTable(second, 'table:ratings', 1), 20);
  t.not(first[0].rows, second[0].rows);
  t.end();
});

test('request Cell read index fails closed on malformed snapshots', (t) => {
  for (const malformed of [
    null,
    {},
    [{context: 'table:ratings'}],
    [{context: 'table:ratings', rows: [null]}],
    [{context: 'table:ratings', rows: [{key: 1}]}],
    [{context: 'table:ratings', rows: [{key: -0, value: 1}]}],
    [{
      context: 'table:ratings',
      rows: [{key: Number.MAX_SAFE_INTEGER, value: 1}],
    }],
  ]) {
    t.throws(
      () => indexRequestCellTableReads(malformed),
      /request Cell table/u,
    );
  }
  t.end();
});

test('request Cell read index rejects accessors without executing them', (t) => {
  let reads = 0;
  const row = {key: 1};
  Object.defineProperty(row, 'value', {
    enumerable: true,
    get() {
      reads += 1;
      return 42;
    },
  });

  t.throws(
    () => indexRequestCellTableReads([{
      context: 'table:ratings',
      rows: [row],
    }]),
    /row is invalid/u,
  );
  t.equal(reads, 0);
  t.end();
});

test('request Cell read index enforces its invocation row bound', (t) => {
  const error = t.throws(
    () => indexRequestCellTableReads([{
      context: 'table:ratings',
      rows: [{key: 1, value: 42}],
    }], 0),
    /bound exceeded/u,
  );
  t.type(error, RequestCellTableReadBoundError);
  t.equal(error.actualRows, 1);
  t.equal(error.maximumRows, 0);
  t.equal(
    requestCellTableIndexEstimatedBytes(error.actualRows),
    INDEXED_ROW_ESTIMATED_BYTES,
  );
  t.end();
});

test('request Cell index row bound reserves raw-plus-Map coexistence', (t) => {
  t.equal(
    requestCellTableIndexRowBound(INDEXED_ROW_ESTIMATED_BYTES * 100_001),
    100_001,
  );
  t.equal(
    requestCellTableIndexRowBound(
      INDEXED_ROW_ESTIMATED_BYTES * 100_001 - 1,
    ),
    100_000,
  );
  t.end();
});

test('request Cell read index is equivalent to first-match reference lookup',
  (t) => {
    const snapshots = [{
      context: 'table:a',
      rows: [
        {key: 0, value: -2_147_483_648},
        {key: 17, value: -1},
        {key: 17, value: 99},
        {key: 4_294_967_295, value: 2_147_483_647},
      ],
    }, {
      context: 'table:b',
      rows: [
        {key: 1, value: 0},
        {key: 2, value: 1},
      ],
    }];
    const indexed = indexRequestCellTableReads(snapshots);
    for (const context of ['table:a', 'table:b', 'table:missing']) {
      for (const key of [0, 1, 2, 17, 18, 4_294_967_295]) {
        const snapshot = snapshots.find((entry) => entry.context === context);
        const reference =
          snapshot?.rows.find((entry) => entry.key === key)?.value ?? 0;
        t.equal(
          readIndexedRequestCellTable(indexed, context, key),
          reference,
          `${context} key ${key}`,
        );
      }
    }
    t.end();
  });

test('request Cell read index ignores polluted array iteration', (t) => {
  const originalIterator = Object.getOwnPropertyDescriptor(
    canonicalArrayPrototype,
    Symbol.iterator,
  );
  // Adversarial fixture: restored in the finally block.
  Object.defineProperty(canonicalArrayPrototype, Symbol.iterator, {
    configurable: true,
    value: function hostileIterator() {
      throw new Error('hostile iterator executed');
    },
    writable: true,
  });
  let indexed;
  try {
    indexed = indexRequestCellTableReads([{
      context: 'table:ratings',
      rows: [{key: 1, value: 42}],
    }]);
  } finally {
    Object.defineProperty(
      canonicalArrayPrototype,
      Symbol.iterator,
      originalIterator,
    );
  }
  t.equal(readIndexedRequestCellTable(indexed, 'table:ratings', 1), 42);
  t.end();
});
