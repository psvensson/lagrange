import {spawnSync} from 'node:child_process';
import {test} from '../../src/test-helpers/tap.js';
import Database from 'better-sqlite3';
import {
  PARTITION_DESCRIPTOR_EPOCH_ERROR_MSG,
  PARTITION_TRANSITION_METADATA_FIELD,
} from '../../src/partition/partition-constants.js';
import {
  replaySplitEntry,
  resolveSplitSnapshotBatchRowLimit,
  routeSplitSnapshotBatch,
} from '../../src/partition/partition-split-routing.js';

const TABLE_NAME = 'users';
const PRIMARY_KEY_COLUMN = 'id';
const SPLIT_KEY = 'm';
const ACTIVE_VERSION = 3;
const PENDING_VERSION = 4;
const STALE_VERSION = 2;
const LEFT_PARTITION_ID = 'users-left';
const RIGHT_PARTITION_ID = 'users-right';
const INSERT_SQL = 'INSERT INTO users (id, name) VALUES (?, ?)';
const SNAPSHOT_MAX_ROWS_PER_CALL = 64;

function createMetadata(targetVersion) {
  return {
    primaryKeyColumn: PRIMARY_KEY_COLUMN,
    splitKey: SPLIT_KEY,
    targetPartitionIds: [LEFT_PARTITION_ID, RIGHT_PARTITION_ID],
    [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]:
      targetVersion,
  };
}

function createDescriptorEvidence(tableDescriptor, partitionVersion) {
  return {
    tableDescriptor,
    targetPartitionDescriptors: [
      {
        partition_id: LEFT_PARTITION_ID,
        partition_version: partitionVersion,
      },
      {
        partition_id: RIGHT_PARTITION_ID,
        partition_version: partitionVersion,
      },
    ],
    requireTargetDescriptors: true,
  };
}

test('split routing rejects Proxy and accessor metadata before traps', async (t) => {
  let proxyTrapCalls = 0;
  const proxyMetadata = new Proxy(createMetadata(PENDING_VERSION), {
    get() {
      proxyTrapCalls += 1;
      throw new Error('proxy get trap executed');
    },
    getOwnPropertyDescriptor() {
      proxyTrapCalls += 1;
      throw new Error('proxy descriptor trap executed');
    },
  });
  const queryExecutor = {
    async executeOnPartition() {
      t.fail('unsafe metadata must reject before route dispatch');
      return {success: true};
    },
  };

  await t.rejects(
    replaySplitEntry(
      {
        sql: INSERT_SQL,
        params: ['a', 'Ada'],
        data: {[PRIMARY_KEY_COLUMN]: 'a'},
      },
      proxyMetadata,
      {tableName: TABLE_NAME, queryExecutor},
    ),
    /proxi(?:es|y)/iu,
  );
  t.equal(proxyTrapCalls, 0, 'replay rejects Proxy metadata before traps');

  await t.rejects(
    routeSplitSnapshotBatch(
      [{id: 'a', name: 'Ada'}],
      ['id', 'name'],
      proxyMetadata,
      {tableName: TABLE_NAME, queryExecutor},
    ),
    /proxi(?:es|y)/iu,
  );
  t.equal(proxyTrapCalls, 0, 'snapshot routing rejects Proxy metadata before traps');

  let primaryKeyGetterCalls = 0;
  const accessorMetadata = createMetadata(PENDING_VERSION);
  Object.defineProperty(accessorMetadata, 'primaryKeyColumn', {
    configurable: true,
    enumerable: true,
    get() {
      primaryKeyGetterCalls += 1;
      return PRIMARY_KEY_COLUMN;
    },
  });

  await t.rejects(
    replaySplitEntry(
      {
        sql: INSERT_SQL,
        params: ['a', 'Ada'],
        data: {[PRIMARY_KEY_COLUMN]: 'a'},
      },
      accessorMetadata,
      {tableName: TABLE_NAME, queryExecutor},
    ),
    /primaryKeyColumn/iu,
  );
  t.equal(
    primaryKeyGetterCalls,
    0,
    'primaryKeyColumn accessors are not live routing authority',
  );
});

test('split routing rejects stale mirrored writes by descriptor epoch',
  async (t) => {
    const queryExecutor = {
      async executeOnPartition() {
        t.fail('stale descriptor epoch must reject before route dispatch');
      },
    };

    await t.rejects(
      replaySplitEntry(
        {
          sql: INSERT_SQL,
          params: ['n', 'Nina'],
          data: {[PRIMARY_KEY_COLUMN]: 'n'},
        },
        createMetadata(STALE_VERSION),
        {
          tableName: TABLE_NAME,
          queryExecutor,
          descriptorEpochEvidence: createDescriptorEvidence(
            {active_partition_version: ACTIVE_VERSION},
            STALE_VERSION,
          ),
        },
      ),
      {message: PARTITION_DESCRIPTOR_EPOCH_ERROR_MSG.STALE_ROUTE},
    );
  });

test('split routing accepts pending target descriptor epoch', async (t) => {
  const routed = [];
  const queryExecutor = {
    async executeOnPartition(partitionId, sql, params) {
      routed.push({partitionId, sql, params});
      return {success: true};
    },
  };

  await replaySplitEntry(
    {
      sql: INSERT_SQL,
      params: ['a', 'Ada'],
      data: {[PRIMARY_KEY_COLUMN]: 'a'},
    },
    createMetadata(PENDING_VERSION),
    {
      tableName: TABLE_NAME,
      queryExecutor,
      descriptorEpochEvidence: createDescriptorEvidence(
        {
          active_partition_version: ACTIVE_VERSION,
          pending_partition_version: PENDING_VERSION,
        },
        PENDING_VERSION,
      ),
    },
  );

  t.same(
    routed.map((entry) => entry.partitionId),
    [LEFT_PARTITION_ID],
  );
});

test('split snapshot batching groups ordered upserts by fenced child',
  async (t) => {
    const routed = [];
    const queryExecutor = {
      async executeOnPartition(
        partitionId,
        sql,
        params,
        _isRead,
        _waitForCommit,
        _isTransaction,
        deliveryOptions,
      ) {
        routed.push({partitionId, sql, params, deliveryOptions});
        return {success: true};
      },
    };

    await routeSplitSnapshotBatch(
      [
        {id: 'a', name: 'Ada'},
        {id: 'z', name: 'Zoe'},
        {id: 'b', name: 'Bob'},
      ],
      ['id', 'name'],
      createMetadata(PENDING_VERSION),
      {
        tableName: TABLE_NAME,
        queryExecutor,
        descriptorEpochEvidence: createDescriptorEvidence(
          {
            active_partition_version: ACTIVE_VERSION,
            pending_partition_version: PENDING_VERSION,
          },
          PENDING_VERSION,
        ),
      },
    );

    t.same(routed, [
      {
        partitionId: LEFT_PARTITION_ID,
        sql: 'INSERT OR REPLACE INTO users (id, name) VALUES (?, ?), (?, ?)',
        params: ['a', 'Ada', 'b', 'Bob'],
        deliveryOptions: {splitMirrorOrigin: 'snapshot'},
      },
      {
        partitionId: RIGHT_PARTITION_ID,
        sql: 'INSERT OR REPLACE INTO users (id, name) VALUES (?, ?)',
        params: ['z', 'Zoe'],
        deliveryOptions: {splitMirrorOrigin: 'snapshot'},
      },
    ]);
  });

test('split snapshot batching ignores hostile row iterator',
  async (t) => {
    const routed = [];
    const rows = [
      {id: 'a', name: 'Ada'},
      {id: 'z', name: 'Zoe'},
      {id: 'b', name: 'Bob'},
    ];
    Object.defineProperty(rows, Symbol.iterator, {
      configurable: true,
      value() {
        throw new Error('snapshot rows iterator executed');
      },
    });

    await routeSplitSnapshotBatch(
      rows,
      ['id', 'name'],
      createMetadata(PENDING_VERSION),
      {
        tableName: TABLE_NAME,
        queryExecutor: {
          async executeOnPartition(partitionId, _sql, params) {
            routed[routed.length] = {partitionId, params};
            return {success: true};
          },
        },
      },
    );

    t.same(routed, [
      {partitionId: LEFT_PARTITION_ID, params: ['a', 'Ada', 'b', 'Bob']},
      {partitionId: RIGHT_PARTITION_ID, params: ['z', 'Zoe']},
    ]);
  });

test('split snapshot batching rejects Proxy and sparse row arrays before traps',
  async (t) => {
    let arrayTrapCalls = 0;
    const proxyRows = new Proxy([{id: 'a', name: 'Ada'}], {
      get() {
        arrayTrapCalls += 1;
        throw new Error('row-array get trap executed');
      },
      getOwnPropertyDescriptor() {
        arrayTrapCalls += 1;
        throw new Error('row-array descriptor trap executed');
      },
    });
    const queryExecutor = {
      async executeOnPartition() {
        t.fail('invalid snapshot rows must reject before dispatch');
        return {success: true};
      },
    };

    await t.rejects(
      routeSplitSnapshotBatch(
        proxyRows,
        ['id', 'name'],
        createMetadata(PENDING_VERSION),
        {tableName: TABLE_NAME, queryExecutor},
      ),
      /route mirrored partition split write/iu,
    );
    t.equal(arrayTrapCalls, 0, 'Proxy row array rejects before traps');

    const sparseRows = new Array(2);
    sparseRows[0] = {id: 'a', name: 'Ada'};
    await t.rejects(
      routeSplitSnapshotBatch(
        sparseRows,
        ['id', 'name'],
        createMetadata(PENDING_VERSION),
        {tableName: TABLE_NAME, queryExecutor},
      ),
      /route mirrored partition split write/iu,
    );
  });

test('split snapshot batching rejects Proxy row records before traps',
  async (t) => {
    let rowTrapCalls = 0;
    const proxyRow = new Proxy({id: 'a', name: 'Ada'}, {
      ownKeys() {
        rowTrapCalls += 1;
        throw new Error('row ownKeys trap executed');
      },
      getOwnPropertyDescriptor() {
        rowTrapCalls += 1;
        throw new Error('row descriptor trap executed');
      },
    });
    await t.rejects(
      routeSplitSnapshotBatch(
        [proxyRow],
        ['id', 'name'],
        createMetadata(PENDING_VERSION),
        {
          tableName: TABLE_NAME,
          queryExecutor: {
            async executeOnPartition() {
              t.fail('Proxy row must reject before dispatch');
              return {success: true};
            },
          },
        },
      ),
      /route mirrored partition split write/iu,
    );
    t.equal(rowTrapCalls, 0, 'Proxy row rejects before record traps');
  });

test('split snapshot batching captures Map constructor after module load',
  async (t) => {
    const OriginalMap = globalThis.Map;
    const routed = [];
    let observedError = null;
    class PoisonMap extends OriginalMap {
      constructor() {
        super();
        OriginalMap.prototype.set.call(
          this,
          LEFT_PARTITION_ID,
          [{id: 'poison'}],
        );
      }
    }

    try {
      globalThis.Map = PoisonMap;
      await routeSplitSnapshotBatch(
        [{id: 'a'}],
        ['id'],
        createMetadata(PENDING_VERSION),
        {
          tableName: TABLE_NAME,
          queryExecutor: {
            async executeOnPartition(partitionId, _sql, params) {
              routed[routed.length] = {partitionId, params};
              return {success: true};
            },
          },
        },
      );
    } catch (error) {
      observedError = error;
    } finally {
      globalThis.Map = OriginalMap;
    }

    t.equal(observedError, null, 'post-load Map replacement is ignored');
    t.same(routed, [
      {partitionId: LEFT_PARTITION_ID, params: ['a']},
    ]);
  });

test('split snapshot batching rejects dimensions outside route and bind budgets',
  async (t) => {
    const dispatches = [];
    const queryExecutor = {
      async executeOnPartition(partitionId, _sql, params) {
        dispatches[dispatches.length] = {partitionId, params};
        return {success: true};
      },
    };
    const overWideColumns = Array.from(
      {length: 32_767},
      (_value, index) => `column_${index}`,
    );
    const overTallRows = Array.from(
      {length: 65},
      (_value, index) => ({id: `a_${index}`}),
    );

    for (const [rows, columns] of [
      [[{id: 'a'}], []],
      [[{id: 'a'}], overWideColumns],
      [overTallRows, ['id']],
    ]) {
      await t.rejects(
        routeSplitSnapshotBatch(
          rows,
          columns,
          createMetadata(PENDING_VERSION),
          {tableName: TABLE_NAME, queryExecutor},
        ),
        /route mirrored partition split write/iu,
      );
    }
    t.equal(dispatches.length, 0, 'invalid dimensions reject before dispatch');
    t.throws(
      () => resolveSplitSnapshotBatchRowLimit([], 1),
      /route mirrored partition split write/iu,
    );
    t.throws(
      () => resolveSplitSnapshotBatchRowLimit(overWideColumns, 1),
      /route mirrored partition split write/iu,
    );
    t.equal(
      resolveSplitSnapshotBatchRowLimit(
        ['id'],
        SNAPSHOT_MAX_ROWS_PER_CALL,
      ),
      SNAPSHOT_MAX_ROWS_PER_CALL,
    );
    t.equal(
      resolveSplitSnapshotBatchRowLimit(
        Array.from({length: 512}, (_value, index) => `column_${index}`),
        SNAPSHOT_MAX_ROWS_PER_CALL,
      ),
      63,
      'wide tables retain per-SQL batching below the source-row cap',
    );
  });

test('split snapshot batching owns internal numeric array appends',
  async (t) => {
    const rows = [{id: 'v12-route-key'}];
    const columns = ['id'];
    const metadata = {
      primaryKeyColumn: PRIMARY_KEY_COLUMN,
      splitKey: 'm',
      targetPartitionIds: ['v12-left-sentinel', 'v12-right-sentinel'],
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]:
        PENDING_VERSION,
    };
    const dispatch = {value: null};
    let interceptedRouteWrites = 0;
    const routeOwnedValues = new Set([
      'v12-right-sentinel',
      rows[0],
      '?',
      '(?)',
      'v12-route-key',
    ]);
    const priorIndexDescriptor =
      Object.getOwnPropertyDescriptor(Array.prototype, '0');

    let observedRouteError = null;
    try {
      Reflect.defineProperty(Array.prototype, '0', {
        configurable: true,
        enumerable: false,
        set(value) {
          if (routeOwnedValues.has(value)) {
            interceptedRouteWrites += 1;
          }
        },
      });

      try {
        await routeSplitSnapshotBatch(
          rows,
          columns,
          metadata,
          {
            tableName: TABLE_NAME,
            queryExecutor: {
              async executeOnPartition(partitionId, sql, params) {
                dispatch.value = {partitionId, sql, params};
                return {success: true};
              },
            },
          },
        );
      } catch (error) {
        observedRouteError = error;
      }
    } finally {
      if (priorIndexDescriptor) {
        Reflect.defineProperty(
          Array.prototype,
          '0',
          priorIndexDescriptor,
        );
      } else {
        Reflect.deleteProperty(Array.prototype, '0');
      }
    }

    t.equal(
      interceptedRouteWrites,
      0,
      'inherited numeric setters never observe snapshot-route owned appends',
    );
    t.equal(observedRouteError, null, 'snapshot routing remains successful');
    t.same(dispatch.value, {
      partitionId: 'v12-right-sentinel',
      sql: 'INSERT OR REPLACE INTO users (id) VALUES (?)',
      params: ['v12-route-key'],
    });
  });

test('split snapshot batching captures Object.defineProperty for appends',
  async (t) => {
    const OriginalDefineProperty = Object.defineProperty;
    const dispatch = {value: null};
    try {
      Object.defineProperty = () => {
        throw new Error('mutated Object.defineProperty executed');
      };
      await routeSplitSnapshotBatch(
        [{id: 'a'}],
        ['id'],
        createMetadata(PENDING_VERSION),
        {
          tableName: TABLE_NAME,
          queryExecutor: {
            async executeOnPartition(partitionId, _sql, params) {
              dispatch.value = {partitionId, params};
              return {success: true};
            },
          },
        },
      );
    } finally {
      Object.defineProperty = OriginalDefineProperty;
    }

    t.same(dispatch.value, {
      partitionId: LEFT_PARTITION_ID,
      params: ['a'],
    });
  });

test('split snapshot batching refreshes epoch evidence before each child',
  async (t) => {
    let pendingVersion = PENDING_VERSION;
    const routedPartitionIds = [];
    const queryExecutor = {
      async executeOnPartition(partitionId) {
        routedPartitionIds.push(partitionId);
        pendingVersion += 1;
        return {success: true};
      },
    };

    await t.rejects(
      routeSplitSnapshotBatch(
        [
          {id: 'a', name: 'Ada'},
          {id: 'z', name: 'Zoe'},
        ],
        ['id', 'name'],
        createMetadata(PENDING_VERSION),
        {
          tableName: TABLE_NAME,
          queryExecutor,
          resolveDescriptorEpochEvidence: () => createDescriptorEvidence(
            {
              active_partition_version: ACTIVE_VERSION,
              pending_partition_version: pendingVersion,
            },
            pendingVersion,
          ),
        },
      ),
      {message: PARTITION_DESCRIPTOR_EPOCH_ERROR_MSG.STALE_ROUTE},
    );
    t.same(
      routedPartitionIds,
      [LEFT_PARTITION_ID],
      'stale epoch rejects before dispatching the second child batch',
    );
  });

test('split snapshot batching stays within SQLite bind limits for wide tables',
  async (t) => {
    const database = new Database(':memory:');
    const columns = [
      'id',
      ...Array.from({length: 511}, (_, index) => `value_${index + 1}`),
    ];
    const rows = Array.from({length: 64}, (_, rowIndex) =>
      Object.fromEntries(
        columns.map((column, columnIndex) => [
          column,
          columnIndex === 0 ? rowIndex + 1 : columnIndex,
        ]),
      ));
    const parameterCounts = [];
    const queryExecutor = {
      async executeOnPartition(_partitionId, sql, params) {
        parameterCounts.push(params.length);
        database.prepare(sql).run(...params);
        return {success: true};
      },
    };

    try {
      database.exec(
        'CREATE TABLE wide_rows (' +
        columns.map((column, index) =>
          `${column} INTEGER${index === 0 ? ' PRIMARY KEY' : ''}`,
        ).join(', ') +
        ')',
      );

      await routeSplitSnapshotBatch(
        rows,
        columns,
        {
          primaryKeyColumn: 'id',
          splitKey: 1_000,
          targetPartitionIds: ['wide-left', 'wide-right'],
        },
        {tableName: 'wide_rows', queryExecutor},
      );

      t.same(parameterCounts, [32_256, 512]);
      t.equal(
        database.prepare('SELECT COUNT(*) AS count FROM wide_rows').get().count,
        64,
      );
    } finally {
      database.close();
    }
  });


test('split routing captures mutable intrinsics after module load in isolated runtime',
  (t) => {
    const routingModuleUrl =
      new URL('../../src/partition/partition-split-routing.js', import.meta.url).href;
    const constantsModuleUrl =
      new URL('../../src/partition/partition-constants.js', import.meta.url).href;
    const childSource = `
      import {
        resolveSplitSnapshotBatchRowLimit,
        routeSplitSnapshotBatch,
      } from ${JSON.stringify(routingModuleUrl)};
      import {
        PARTITION_TRANSITION_METADATA_FIELD,
      } from ${JSON.stringify(constantsModuleUrl)};

      const originals = {
        hasOwnProperty: Object.prototype.hasOwnProperty,
        trim: String.prototype.trim,
        toUpperCase: String.prototype.toUpperCase,
        startsWith: String.prototype.startsWith,
        includes: String.prototype.includes,
        split: String.prototype.split,
        match: String.prototype.match,
        arrayIsArray: Array.isArray,
        arrayMap: Array.prototype.map,
        regExpExec: RegExp.prototype.exec,
        numberIsInteger: Number.isInteger,
        mathFloor: Math.floor,
        mathMin: Math.min,
      };
      const hostileCalls = Object.create(null);
      const hostile = (name) => () => {
        hostileCalls[name] = (hostileCalls[name] || 0) + 1;
        throw new Error('post-load mutable intrinsic executed: ' + name);
      };
      const dispatches = [];
      let rowLimit = null;
      try {
        Object.prototype.hasOwnProperty = hostile('hasOwnProperty');
        String.prototype.trim = hostile('trim');
        String.prototype.toUpperCase = hostile('toUpperCase');
        String.prototype.startsWith = hostile('startsWith');
        String.prototype.includes = hostile('includes');
        String.prototype.split = hostile('split');
        String.prototype.match = hostile('match');
        Array.isArray = hostile('arrayIsArray');
        Array.prototype.map = hostile('arrayMap');
        RegExp.prototype.exec = hostile('regExpExec');
        Number.isInteger = hostile('numberIsInteger');
        Math.floor = hostile('mathFloor');
        Math.min = hostile('mathMin');

        await routeSplitSnapshotBatch(
          [{id: 'a'}],
          ['id'],
          {
            primaryKeyColumn: 'id',
            splitKey: 'm',
            targetPartitionIds: ['users-left', 'users-right'],
            [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]: 4,
          },
          {
            tableName: 'users',
            queryExecutor: {
              async executeOnPartition(partitionId, _sql, params) {
                dispatches.push({partitionId, params});
                return {success: true};
              },
            },
          },
        );
        rowLimit = resolveSplitSnapshotBatchRowLimit(['id'], 64);
      } finally {
        Object.prototype.hasOwnProperty = originals.hasOwnProperty;
        String.prototype.trim = originals.trim;
        String.prototype.toUpperCase = originals.toUpperCase;
        String.prototype.startsWith = originals.startsWith;
        String.prototype.includes = originals.includes;
        String.prototype.split = originals.split;
        String.prototype.match = originals.match;
        Array.isArray = originals.arrayIsArray;
        Array.prototype.map = originals.arrayMap;
        RegExp.prototype.exec = originals.regExpExec;
        Number.isInteger = originals.numberIsInteger;
        Math.floor = originals.mathFloor;
        Math.min = originals.mathMin;
      }
      process.stdout.write(JSON.stringify({hostileCalls, dispatches, rowLimit}));
    `;
    const child = spawnSync(
      process.execPath,
      ['--input-type=module', '--eval', childSource],
      {cwd: process.cwd(), encoding: 'utf8'},
    );
    t.equal(child.status, 0,
      child.stderr || 'isolated mutable-intrinsic witness exits cleanly');
    const result = JSON.parse(child.stdout);
    t.same(result.hostileCalls, {},
      'post-load routing intrinsic replacements are never called');
    t.same(result.dispatches, [
      {partitionId: LEFT_PARTITION_ID, params: ['a']},
    ]);
    t.equal(result.rowLimit, SNAPSHOT_MAX_ROWS_PER_CALL);
    t.end();
  });

test('split snapshot batching captures Map prototype methods in an isolated runtime',
  (t) => {
    const routingModuleUrl =
      new URL('../../src/partition/partition-split-routing.js', import.meta.url).href;
    const constantsModuleUrl =
      new URL('../../src/partition/partition-constants.js', import.meta.url).href;
    const childSource = `
      import {
        routeSplitSnapshotBatch,
      } from ${JSON.stringify(routingModuleUrl)};
      import {
        PARTITION_TRANSITION_METADATA_FIELD,
      } from ${JSON.stringify(constantsModuleUrl)};

      const originalGet = Map.prototype.get;
      const originalSet = Map.prototype.set;
      let hostileCalls = 0;
      const hostile = () => {
        hostileCalls += 1;
        throw new Error('post-load Map.prototype intrinsic executed');
      };
      const dispatches = [];
      try {
        Map.prototype.get = hostile;
        Map.prototype.set = hostile;
        await routeSplitSnapshotBatch(
          [{id: 'a'}],
          ['id'],
          {
            primaryKeyColumn: 'id',
            splitKey: 'm',
            targetPartitionIds: ['users-left', 'users-right'],
            [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]: 4,
          },
          {
            tableName: 'users',
            queryExecutor: {
              async executeOnPartition(partitionId, _sql, params) {
                dispatches.push({partitionId, params});
                return {success: true};
              },
            },
          },
        );
      } finally {
        Map.prototype.get = originalGet;
        Map.prototype.set = originalSet;
      }
      process.stdout.write(JSON.stringify({hostileCalls, dispatches}));
    `;
    const child = spawnSync(
      process.execPath,
      ['--input-type=module', '--eval', childSource],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );
    t.equal(child.status, 0, child.stderr || 'isolated Map witness exits cleanly');
    const result = JSON.parse(child.stdout);
    t.equal(result.hostileCalls, 0,
      'post-load Map.prototype replacements are never called by routing');
    t.same(result.dispatches, [
      {partitionId: LEFT_PARTITION_ID, params: ['a']},
    ]);
    t.end();
  });

test('split replay captures SQL string and own-property intrinsics in isolated runtime',
  (t) => {
    const routingModuleUrl =
      new URL('../../src/partition/partition-split-routing.js', import.meta.url).href;
    const constantsModuleUrl =
      new URL('../../src/partition/partition-constants.js', import.meta.url).href;
    const serviceConstantsModuleUrl =
      new URL('../../src/partition/partition-service-constants.js', import.meta.url).href;
    const childSource = `
      import {
        replaySplitEntry,
      } from ${JSON.stringify(routingModuleUrl)};
      import {
        PARTITION_TRANSITION_METADATA_FIELD,
      } from ${JSON.stringify(constantsModuleUrl)};
      import {
        PARTITION_SERVICE_OPERATION,
      } from ${JSON.stringify(serviceConstantsModuleUrl)};

      const originals = {
        hasOwnProperty: Object.prototype.hasOwnProperty,
        objectKeys: Object.keys,
        trim: String.prototype.trim,
        toUpperCase: String.prototype.toUpperCase,
        startsWith: String.prototype.startsWith,
        endsWith: String.prototype.endsWith,
        slice: String.prototype.slice,
        substring: String.prototype.substring,
        match: String.prototype.match,
        split: String.prototype.split,
        includes: String.prototype.includes,
        arrayIsArray: Array.isArray,
        arrayPush: Array.prototype.push,
        arrayMap: Array.prototype.map,
        arrayFilter: Array.prototype.filter,
        regexpExec: RegExp.prototype.exec,
        NumberCtor: globalThis.Number,
        numberIsNaN: Number.isNaN,
      };
      const hostileCalls = Object.create(null);
      const hostile = (name) => () => {
        hostileCalls[name] = (hostileCalls[name] || 0) + 1;
        throw new Error('post-load SQL intrinsic executed: ' + name);
      };
      const routed = [];
      try {
        Object.prototype.hasOwnProperty = hostile('hasOwnProperty');
        Object.keys = hostile('objectKeys');
        String.prototype.trim = hostile('trim');
        String.prototype.toUpperCase = hostile('toUpperCase');
        String.prototype.startsWith = hostile('startsWith');
        String.prototype.endsWith = hostile('endsWith');
        String.prototype.slice = hostile('slice');
        String.prototype.substring = hostile('substring');
        String.prototype.match = hostile('match');
        String.prototype.split = hostile('split');
        String.prototype.includes = hostile('includes');
        Array.isArray = hostile('arrayIsArray');
        Array.prototype.push = hostile('arrayPush');
        Array.prototype.map = hostile('arrayMap');
        Array.prototype.filter = hostile('arrayFilter');
        RegExp.prototype.exec = hostile('regExpExec');
        originals.NumberCtor.isNaN = hostile('numberIsNaN');
        globalThis.Number = hostile('NumberCtor');

        const metadata = {
          primaryKeyColumn: 'id',
          splitKey: 'm',
          targetPartitionIds: ['users-left', 'users-right'],
          [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]: 4,
        };
        const queryExecutor = {
          async executeOnPartition(partitionId, _sql, params) {
            routed[routed.length] = {partitionId, params};
            return {success: true};
          },
        };

        await replaySplitEntry(
          {
            type: PARTITION_SERVICE_OPERATION.QUERY,
            sql: " INSERT INTO users (id) VALUES ('a')",
            params: [],
          },
          metadata,
          {tableName: 'users', queryExecutor},
        );
        await replaySplitEntry(
          {
            type: PARTITION_SERVICE_OPERATION.QUERY,
            sql: ' INSERT INTO users (id, name) VALUES (?, ?)',
            params: ['a', 'a'],
          },
          metadata,
          {tableName: 'users', queryExecutor},
        );
      } finally {
        Object.prototype.hasOwnProperty = originals.hasOwnProperty;
        Object.keys = originals.objectKeys;
        String.prototype.trim = originals.trim;
        String.prototype.toUpperCase = originals.toUpperCase;
        String.prototype.startsWith = originals.startsWith;
        String.prototype.endsWith = originals.endsWith;
        String.prototype.slice = originals.slice;
        String.prototype.substring = originals.substring;
        String.prototype.match = originals.match;
        String.prototype.split = originals.split;
        String.prototype.includes = originals.includes;
        Array.isArray = originals.arrayIsArray;
        Array.prototype.push = originals.arrayPush;
        Array.prototype.map = originals.arrayMap;
        Array.prototype.filter = originals.arrayFilter;
        RegExp.prototype.exec = originals.regexpExec;
        globalThis.Number = originals.NumberCtor;
        originals.NumberCtor.isNaN = originals.numberIsNaN;
      }
      process.stdout.write(JSON.stringify({hostileCalls, routed}));
    `;
    const child = spawnSync(
      process.execPath,
      ['--input-type=module', '--eval', childSource],
      {cwd: process.cwd(), encoding: 'utf8'},
    );
    t.equal(child.status, 0,
      child.stderr || 'isolated SQL-intrinsic witness exits cleanly');
    const result = JSON.parse(child.stdout);
    t.same(result.hostileCalls, {},
      'post-load SQL intrinsic replacements are never called');
    t.same(result.routed, [
      {partitionId: LEFT_PARTITION_ID, params: []},
      {partitionId: LEFT_PARTITION_ID, params: ['a', 'a']},
    ]);
    t.end();
  });
