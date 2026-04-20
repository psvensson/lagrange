import assert from 'node:assert/strict';
import {test} from '../../src/test-helpers/tap.js';
import {BootstrapTopologySnapshotOwner} from
  '../../src/bootstrap/owners/bootstrap-topology-snapshot-owner.js';
import {COLUMN, SERVICE_STATUS, SERVICE_TYPE, TABLES} from
  '../../src/constants/index.js';
import {CANONICAL_LEADER_IDENTITY_STATE} from
  '../../src/query/canonical-leader-routing.js';

const SEED_NODE_ID = 'seed-node-1';
const PARTITION_ID = 'nodes-p1';
const SYSTEM_TABLE_PARTITION_ID = 'partitions-p1';
const TABLE_NAME = TABLES.PARTITIONS;
const PRIORITY_PARTITION_ID = 'sql_transactions-p1';
const LEADER_RAFT_ROLE = 'leader';
const FOLLOWER_RAFT_ROLE = 'follower';
const PRIORITY_SERVICE_ROWS = Object.freeze([
  {
    [COLUMN.SERVICE_ID]: 'sql_transactions-p1-r1',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: PRIORITY_PARTITION_ID,
    [COLUMN.NODE_ID]: SEED_NODE_ID,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.RAFT_ROLE]: LEADER_RAFT_ROLE,
  },
  {
    [COLUMN.SERVICE_ID]: 'sql_transactions-p1-r2',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: PRIORITY_PARTITION_ID,
    [COLUMN.NODE_ID]: 'node-2',
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.RAFT_ROLE]: FOLLOWER_RAFT_ROLE,
  },
]);
const CACHE_PARTITION_ROW = Object.freeze({
  [COLUMN.PARTITION_ID]: PARTITION_ID,
  [COLUMN.TABLE_NAME]: TABLES.NODES,
  [COLUMN.LEADER_NODE_ID]: SEED_NODE_ID,
  [COLUMN.CREATED_AT]: 100,
  [COLUMN.UPDATED_AT]: 200,
});

function createSystemTableCache(options = {}) {
  const getCachePartitionRows =
    typeof options.getCachePartitionRows === 'function' ?
      options.getCachePartitionRows :
      () => (
        Array.isArray(options.cachePartitionRows) ?
          options.cachePartitionRows :
          [CACHE_PARTITION_ROW]
      );
  const getCacheServiceRows =
    typeof options.getCacheServiceRows === 'function' ?
      options.getCacheServiceRows :
      () => (
        Array.isArray(options.cacheServiceRows) ?
          options.cacheServiceRows :
          []
      );
  const getRowsByTableName = (tableName) => {
    if (tableName === TABLES.PARTITIONS) {
      return [
        ...getCachePartitionRows(),
        {
          [COLUMN.PARTITION_ID]: SYSTEM_TABLE_PARTITION_ID,
          [COLUMN.TABLE_NAME]: TABLES.PARTITIONS,
          [COLUMN.LEADER_NODE_ID]: SEED_NODE_ID,
          [COLUMN.CREATED_AT]: 100,
          [COLUMN.UPDATED_AT]: 200,
        },
      ];
    }
    if (tableName === TABLES.SERVICES) {
      return getCacheServiceRows();
    }
    return [];
  };
  return {
    getAll(tableName) {
      return getRowsByTableName(tableName);
    },
    filter(tableName, predicate) {
      const rows = getRowsByTableName(tableName);
      return rows.filter(predicate);
    },
  };
}

function createOwner(options = {}) {
  const partitionRows =
    Array.isArray(options.partitionRows) ? options.partitionRows : [];
  const getPartitionRows =
    typeof options.getPartitionRows === 'function' ?
      options.getPartitionRows :
      () => partitionRows;
  const cachePartitionRows = Array.isArray(options.cachePartitionRows) ?
    options.cachePartitionRows :
    [CACHE_PARTITION_ROW];
  const cacheServiceRows = Array.isArray(options.cacheServiceRows) ?
    options.cacheServiceRows :
    [];
  const logger = options.logger || {
    warn() {},
    info() {},
    debug() {},
    error() {},
  };
  return new BootstrapTopologySnapshotOwner({
    nowFn: options.nowFn,
    authoritativeSnapshotCacheTtlMs: options.authoritativeSnapshotCacheTtlMs,
    warningThrottleMs: options.warningThrottleMs,
    delegates: {
      getSystemTableCache: () => createSystemTableCache({
        cachePartitionRows,
        cacheServiceRows,
        getCachePartitionRows: options.getCachePartitionRows,
        getCacheServiceRows: options.getCacheServiceRows,
      }),
      getPartitionServices: () => new Map([
        ['nodes-p1-r1', {
          partitionId: SYSTEM_TABLE_PARTITION_ID,
          replicaId: 'partitions-p1-r1',
          initialized: true,
          db: {
            prepare(sql) {
              if (typeof options.onPrepare === 'function') {
                options.onPrepare(sql);
              }
              assert.equal(
                sql,
                `SELECT * FROM ${TABLE_NAME}`,
                'owner should read one local system-table partition snapshot',
              );
              return {
                all() {
                  return getPartitionRows();
                },
              };
            },
          },
        }],
      ]),
      getSeedNodeId: () => SEED_NODE_ID,
      getLogger: () => logger,
    },
  });
}

test(
  'BootstrapTopologySnapshotOwner retains cached partition rows when local authoritative rows are empty',
  async (t) => {
    const warnings = [];
    const owner = createOwner({
      partitionRows: [],
      logger: {
        warn(message, payload) {
          warnings.push({message, payload});
        },
        info() {},
        debug() {},
        error() {},
      },
    });

    const rows = owner.resolveAuthoritativeSystemTableSnapshotRows(
      TABLE_NAME,
      [CACHE_PARTITION_ROW],
    );

    t.same(
      rows,
      [CACHE_PARTITION_ROW],
      'empty local partition reads must not erase cached topology rows',
    );
    t.equal(
      owner.resolveCanonicalPartitionLeaderNodeId(PARTITION_ID),
      SEED_NODE_ID,
      'leader resolution should preserve cached partition ownership when local rows are empty',
    );
    t.ok(
      warnings.some((entry) => entry?.payload?.authoritativeRowCount === 0),
      'owner should emit a bounded fallback warning with the empty authoritative row count',
    );
  },
);

test(
  'BootstrapTopologySnapshotOwner still prefers local authoritative rows when they are present',
  async (t) => {
    const replacementLeaderNodeId = 'replacement-leader';
    const owner = createOwner({
      partitionRows: [{
        ...CACHE_PARTITION_ROW,
        [COLUMN.LEADER_NODE_ID]: replacementLeaderNodeId,
        [COLUMN.UPDATED_AT]: 300,
      }],
    });

    const rows = owner.resolveAuthoritativeSystemTableSnapshotRows(
      TABLE_NAME,
      [CACHE_PARTITION_ROW],
    );

    t.equal(rows.length, 1, 'owner should still surface one authoritative row');
    t.equal(
      rows[0]?.[COLUMN.LEADER_NODE_ID],
      replacementLeaderNodeId,
      'non-empty local authoritative rows should continue to override stale cache rows',
    );
    t.equal(
      owner.resolveCanonicalPartitionLeaderNodeId(PARTITION_ID),
      replacementLeaderNodeId,
      'leader resolution should still prefer present local authoritative rows',
    );
  },
);


test(
  'BootstrapTopologySnapshotOwner retains cached leader ownership for priority control-plane partitions while local rows converge',
  async (t) => {
    const warnings = [];
    const priorityCachePartitionRow = {
      [COLUMN.PARTITION_ID]: PRIORITY_PARTITION_ID,
      [COLUMN.TABLE_NAME]: TABLES.SQL_TRANSACTIONS,
      [COLUMN.LEADER_NODE_ID]: SEED_NODE_ID,
      [COLUMN.CREATED_AT]: 100,
      [COLUMN.UPDATED_AT]: 200,
    };
    const owner = createOwner({
      partitionRows: [{
        ...priorityCachePartitionRow,
        [COLUMN.LEADER_NODE_ID]: null,
        [COLUMN.UPDATED_AT]: 300,
      }],
      cachePartitionRows: [priorityCachePartitionRow],
      cacheServiceRows: PRIORITY_SERVICE_ROWS,
      logger: {
        warn(message, payload) {
          warnings.push({message, payload});
        },
        info() {},
        debug() {},
        error() {},
      },
    });

    const rows = owner.resolveAuthoritativeSystemTableSnapshotRows(
      TABLE_NAME,
      [priorityCachePartitionRow],
    );

    t.equal(
      rows[0]?.[COLUMN.LEADER_NODE_ID],
      SEED_NODE_ID,
      'owner should retain the last-known-good cached leader for priority control-plane partitions',
    );
    t.equal(
      owner.resolveCanonicalPartitionLeaderNodeId(PRIORITY_PARTITION_ID),
      SEED_NODE_ID,
      'leader resolution should reuse the retained cached leader during convergence',
    );
    t.match(
      owner.resolveCanonicalPartitionLeaderIdentity(PRIORITY_PARTITION_ID),
      {
        state: CANONICAL_LEADER_IDENTITY_STATE.OWNER_CONFIRMED,
        leaderNodeId: SEED_NODE_ID,
        bootstrapLeaderStabilizationState: 'authoritative',
      },
      'leader identity should publish the stabilized authority row once cached canonical ownership has already been promoted into published authority',
    );
    t.ok(
      warnings.some((entry) =>
        Array.isArray(entry?.payload?.partitionIds) &&
        entry.payload.partitionIds.includes(PRIORITY_PARTITION_ID),
      ),
      'owner should emit one bounded stabilization warning when cached leader ownership is retained',
    );
  },
);

test(
  'BootstrapTopologySnapshotOwner stabilizes priority partition owners without re-reading published partition authority',
  async (t) => {
    const priorityCachePartitionRow = {
      [COLUMN.PARTITION_ID]: PRIORITY_PARTITION_ID,
      [COLUMN.TABLE_NAME]: TABLES.SQL_TRANSACTIONS,
      [COLUMN.LEADER_NODE_ID]: SEED_NODE_ID,
      [COLUMN.CREATED_AT]: 100,
      [COLUMN.UPDATED_AT]: 200,
    };
    const owner = createOwner({
      partitionRows: [{
        ...priorityCachePartitionRow,
        [COLUMN.LEADER_NODE_ID]: null,
        [COLUMN.UPDATED_AT]: 300,
      }],
      cachePartitionRows: [priorityCachePartitionRow],
      cacheServiceRows: PRIORITY_SERVICE_ROWS,
    });
    owner.getPublishedBootstrapPartitionSnapshotRow = () => {
      throw new Error(
        'partition stabilization must not recurse through published partition reads',
      );
    };

    const rows = owner.resolveAuthoritativeSystemTableSnapshotRows(
      TABLE_NAME,
      [priorityCachePartitionRow],
    );

    t.equal(
      rows[0]?.[COLUMN.LEADER_NODE_ID],
      SEED_NODE_ID,
      'priority partition stabilization should retain the cached owner without re-entering published partition resolution',
    );
  },
);

test(
  'BootstrapTopologySnapshotOwner stops retaining cached leader ownership once only follower evidence remains on the cached leader node',
  async (t) => {
    const priorityCachePartitionRow = {
      [COLUMN.PARTITION_ID]: PRIORITY_PARTITION_ID,
      [COLUMN.TABLE_NAME]: TABLES.SQL_TRANSACTIONS,
      [COLUMN.LEADER_NODE_ID]: SEED_NODE_ID,
      [COLUMN.CREATED_AT]: 100,
      [COLUMN.UPDATED_AT]: 200,
    };
    const owner = createOwner({
      partitionRows: [{
        ...priorityCachePartitionRow,
        [COLUMN.LEADER_NODE_ID]: null,
        [COLUMN.UPDATED_AT]: 300,
      }],
      cachePartitionRows: [priorityCachePartitionRow],
      cacheServiceRows: [
        {
          ...PRIORITY_SERVICE_ROWS[0],
          [COLUMN.RAFT_ROLE]: FOLLOWER_RAFT_ROLE,
        },
        {
          ...PRIORITY_SERVICE_ROWS[1],
          [COLUMN.RAFT_ROLE]: LEADER_RAFT_ROLE,
        },
      ],
    });

    const rows = owner.resolveAuthoritativeSystemTableSnapshotRows(
      TABLE_NAME,
      [priorityCachePartitionRow],
    );

    t.equal(
      rows[0]?.[COLUMN.LEADER_NODE_ID],
      null,
      'owner should stop copying the cached leader into published authority when the cached leader node no longer has leader evidence',
    );
    t.equal(
      owner.resolveCanonicalPartitionLeaderNodeId(PRIORITY_PARTITION_ID),
      'node-2',
      'canonical leader resolution should prefer fresh leader service evidence over stale cached owner retention',
    );
  },
);

test(
  'BootstrapTopologySnapshotOwner retains the last authoritative priority leader when refreshed local and cache rows both drop owner metadata',
  async (t) => {
    let nowMs = 1000;
    const priorityCachePartitionRow = {
      [COLUMN.PARTITION_ID]: PRIORITY_PARTITION_ID,
      [COLUMN.TABLE_NAME]: TABLES.SQL_TRANSACTIONS,
      [COLUMN.LEADER_NODE_ID]: SEED_NODE_ID,
      [COLUMN.CREATED_AT]: 100,
      [COLUMN.UPDATED_AT]: 200,
    };
    let currentPartitionRows = [{
      ...priorityCachePartitionRow,
    }];
    let currentCachePartitionRows = [{
      ...priorityCachePartitionRow,
    }];
    const owner = createOwner({
      nowFn: () => nowMs,
      authoritativeSnapshotCacheTtlMs: 50,
      getPartitionRows: () => currentPartitionRows,
      getCachePartitionRows: () => currentCachePartitionRows,
      cacheServiceRows: PRIORITY_SERVICE_ROWS,
    });

    t.equal(
      owner.resolveCanonicalPartitionLeaderNodeId(PRIORITY_PARTITION_ID),
      SEED_NODE_ID,
      'initial authoritative resolution should seed the retained leader from the last known good topology snapshot',
    );

    nowMs += 100;
    currentPartitionRows = [{
      ...priorityCachePartitionRow,
      [COLUMN.LEADER_NODE_ID]: null,
      [COLUMN.UPDATED_AT]: 300,
    }];
    currentCachePartitionRows = [{
      ...priorityCachePartitionRow,
      [COLUMN.LEADER_NODE_ID]: null,
      [COLUMN.UPDATED_AT]: 300,
    }];

    t.match(
      owner.resolveCanonicalPartitionLeaderIdentity(PRIORITY_PARTITION_ID),
      {
        state: CANONICAL_LEADER_IDENTITY_STATE.OWNER_CONFIRMED,
        leaderNodeId: SEED_NODE_ID,
        bootstrapLeaderStabilizationState: 'authoritative',
      },
      'expired bootstrap snapshots should resolve canonical leader identity from the stabilized published authority row while fresh leaderless rows converge',
    );
  },
);

test(
  'BootstrapTopologySnapshotOwner retains the last authoritative priority leader when refreshed authoritative rows disappear entirely',
  async (t) => {
    let nowMs = 1000;
    const priorityCachePartitionRow = {
      [COLUMN.PARTITION_ID]: PRIORITY_PARTITION_ID,
      [COLUMN.TABLE_NAME]: TABLES.SQL_TRANSACTIONS,
      [COLUMN.LEADER_NODE_ID]: SEED_NODE_ID,
      [COLUMN.CREATED_AT]: 100,
      [COLUMN.UPDATED_AT]: 200,
    };
    let currentPartitionRows = [{
      ...priorityCachePartitionRow,
    }];
    let currentCachePartitionRows = [{
      ...priorityCachePartitionRow,
    }];
    const owner = createOwner({
      nowFn: () => nowMs,
      authoritativeSnapshotCacheTtlMs: 50,
      getPartitionRows: () => currentPartitionRows,
      getCachePartitionRows: () => currentCachePartitionRows,
      cacheServiceRows: PRIORITY_SERVICE_ROWS,
    });

    t.equal(
      owner.resolveCanonicalPartitionLeaderNodeId(PRIORITY_PARTITION_ID),
      SEED_NODE_ID,
      'initial authoritative resolution should seed the retained leader before the local row disappears',
    );

    nowMs += 100;
    currentPartitionRows = [];
    currentCachePartitionRows = [{
      ...priorityCachePartitionRow,
      [COLUMN.LEADER_NODE_ID]: null,
      [COLUMN.UPDATED_AT]: 300,
    }];

    t.equal(
      owner.getBootstrapRawAuthoritativePartitionSnapshotRow(
        PRIORITY_PARTITION_ID,
      )?.[COLUMN.LEADER_NODE_ID],
      null,
      'raw observed bootstrap rows should preserve the current leaderless regression for diagnostics',
    );
    t.same(
      owner.readLatestObservedAuthoritativeSystemTableSnapshotRows(
        TABLES.PARTITIONS,
      )?.find((row) => row?.[COLUMN.PARTITION_ID] === PRIORITY_PARTITION_ID),
      {
        ...priorityCachePartitionRow,
        [COLUMN.LEADER_NODE_ID]: null,
        [COLUMN.UPDATED_AT]: 300,
      },
      'latest observed rows should expose the regressed local observation for diagnostics',
    );
    t.equal(
      owner.getBootstrapPartitionSnapshotRow(PRIORITY_PARTITION_ID)?.[
        COLUMN.LEADER_NODE_ID
      ],
      SEED_NODE_ID,
      'published bootstrap rows should retain the last stable priority leader for critical consumers',
    );
    t.same(
      owner.readPublishedAuthoritativeSystemTableSnapshotRows(
        TABLES.PARTITIONS,
      )?.find((row) => row?.[COLUMN.PARTITION_ID] === PRIORITY_PARTITION_ID),
      {
        ...priorityCachePartitionRow,
        [COLUMN.LEADER_NODE_ID]: SEED_NODE_ID,
        [COLUMN.UPDATED_AT]: 300,
      },
      'published authority rows should expose the retained stable leader for consumers',
    );
    t.same(
      owner.readRetainedAuthoritativeSystemTableSnapshotRows(
        TABLES.PARTITIONS,
      )?.find((row) => row?.[COLUMN.PARTITION_ID] === PRIORITY_PARTITION_ID),
      {
        ...priorityCachePartitionRow,
        [COLUMN.LEADER_NODE_ID]: SEED_NODE_ID,
        [COLUMN.UPDATED_AT]: 300,
      },
      'retained authority rows should keep the last published stable leader for owner stabilization',
    );
    t.match(
      owner.resolveCanonicalPartitionLeaderIdentity(PRIORITY_PARTITION_ID),
      {
        state: CANONICAL_LEADER_IDENTITY_STATE.OWNER_CONFIRMED,
        leaderNodeId: SEED_NODE_ID,
        bootstrapLeaderStabilizationState: 'authoritative',
      },
      'missing authoritative rows should still resolve canonical leader identity from the stabilized published authority row instead of collapsing to a missing owner identity',
    );
  },
);

test(
  'BootstrapTopologySnapshotOwner preserves stabilized published and retained priority leaders across leaderless cache overwrites',
  async (t) => {
    const priorityStablePartitionRow = {
      [COLUMN.PARTITION_ID]: PRIORITY_PARTITION_ID,
      [COLUMN.TABLE_NAME]: TABLES.SQL_TRANSACTIONS,
      [COLUMN.LEADER_NODE_ID]: SEED_NODE_ID,
      [COLUMN.CREATED_AT]: 100,
      [COLUMN.UPDATED_AT]: 200,
    };
    const priorityLeaderlessPartitionRow = {
      ...priorityStablePartitionRow,
      [COLUMN.LEADER_NODE_ID]: null,
      [COLUMN.UPDATED_AT]: 300,
    };
    const owner = createOwner({
      cachePartitionRows: [priorityLeaderlessPartitionRow],
      cacheServiceRows: PRIORITY_SERVICE_ROWS,
    });

    owner.cacheAuthoritativeSystemTableSnapshotRows(
      TABLES.PARTITIONS,
      [priorityStablePartitionRow],
      {
        rawRows: [priorityStablePartitionRow],
      },
    );
    const publishedRows = owner.cacheAuthoritativeSystemTableSnapshotRows(
      TABLES.PARTITIONS,
      [priorityLeaderlessPartitionRow],
      {
        rawRows: [priorityLeaderlessPartitionRow],
      },
    );

    t.same(
      publishedRows.find((row) => row?.[COLUMN.PARTITION_ID] === PRIORITY_PARTITION_ID),
      {
        ...priorityLeaderlessPartitionRow,
        [COLUMN.LEADER_NODE_ID]: SEED_NODE_ID,
      },
      'cache writes should stabilize published authority rows with the retained priority leader',
    );
    t.same(
      owner.readPublishedAuthoritativeSystemTableSnapshotRows(
        TABLES.PARTITIONS,
      )?.find((row) => row?.[COLUMN.PARTITION_ID] === PRIORITY_PARTITION_ID),
      {
        ...priorityLeaderlessPartitionRow,
        [COLUMN.LEADER_NODE_ID]: SEED_NODE_ID,
      },
      'published authority rows should keep the retained stable leader after a leaderless cache overwrite',
    );
    t.same(
      owner.readRetainedAuthoritativeSystemTableSnapshotRows(
        TABLES.PARTITIONS,
      )?.find((row) => row?.[COLUMN.PARTITION_ID] === PRIORITY_PARTITION_ID),
      {
        ...priorityLeaderlessPartitionRow,
        [COLUMN.LEADER_NODE_ID]: SEED_NODE_ID,
      },
      'retained authority rows should remain aligned with the stabilized published leader',
    );
    t.same(
      owner.readLatestObservedAuthoritativeSystemTableSnapshotRows(
        TABLES.PARTITIONS,
      )?.find((row) => row?.[COLUMN.PARTITION_ID] === PRIORITY_PARTITION_ID),
      priorityLeaderlessPartitionRow,
      'latest observed rows should still expose the leaderless regression for diagnostics',
    );
    t.match(
      owner.resolveCanonicalPartitionLeaderIdentity(PRIORITY_PARTITION_ID),
      {
        state: CANONICAL_LEADER_IDENTITY_STATE.OWNER_CONFIRMED,
        leaderNodeId: SEED_NODE_ID,
        bootstrapLeaderStabilizationState: 'authoritative',
      },
      'canonical leader resolution should continue to publish the stabilized authority row after a leaderless cache overwrite',
    );
  },
);

test(
  'BootstrapTopologySnapshotOwner preserves missing authoritative ownership for non-priority partitions',
  async (t) => {
    const userPartitionId = 'users-p1';
    const userCachePartitionRow = {
      [COLUMN.PARTITION_ID]: userPartitionId,
      [COLUMN.TABLE_NAME]: 'users',
      [COLUMN.LEADER_NODE_ID]: SEED_NODE_ID,
      [COLUMN.CREATED_AT]: 100,
      [COLUMN.UPDATED_AT]: 200,
    };
    const owner = createOwner({
      cachePartitionRows: [userCachePartitionRow],
      cacheServiceRows: [{
        [COLUMN.SERVICE_ID]: 'users-p1-r1',
        [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
        [COLUMN.PARTITION_ID]: userPartitionId,
        [COLUMN.NODE_ID]: SEED_NODE_ID,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      }],
      partitionRows: [{
        ...userCachePartitionRow,
        [COLUMN.LEADER_NODE_ID]: null,
        [COLUMN.UPDATED_AT]: 300,
      }],
    });

    const rows = owner.resolveAuthoritativeSystemTableSnapshotRows(
      TABLE_NAME,
      [userCachePartitionRow],
    );

    t.equal(
      rows[0]?.[COLUMN.LEADER_NODE_ID],
      null,
      'owner should keep non-priority partitions fail-closed when authoritative leader metadata is missing',
    );
    t.equal(
      owner.resolveCanonicalPartitionLeaderNodeId(userPartitionId),
      undefined,
      'leader resolution should preserve the authoritative missing owner for non-priority partitions',
    );
  },
);

test(
  'BootstrapTopologySnapshotOwner reuses bounded authoritative snapshot cache between close reads',
  async (t) => {
    let nowMs = 1000;
    let prepareCallCount = 0;
    const replacementLeaderNodeId = 'replacement-leader';
    const owner = createOwner({
      nowFn: () => nowMs,
      authoritativeSnapshotCacheTtlMs: 50,
      onPrepare() {
        prepareCallCount++;
      },
      partitionRows: [{
        ...CACHE_PARTITION_ROW,
        [COLUMN.LEADER_NODE_ID]: replacementLeaderNodeId,
        [COLUMN.UPDATED_AT]: 300,
      }],
    });

    const firstRows = owner.resolveAuthoritativeSystemTableSnapshotRows(
      TABLE_NAME,
      [CACHE_PARTITION_ROW],
    );
    const secondRows = owner.resolveAuthoritativeSystemTableSnapshotRows(
      TABLE_NAME,
      [CACHE_PARTITION_ROW],
    );

    t.equal(
      prepareCallCount,
      1,
      'owner should query local authoritative rows once within the cache window',
    );
    t.same(
      secondRows,
      firstRows,
      'owner should reuse the bounded cached authoritative row set',
    );

    nowMs += 60;
    owner.resolveAuthoritativeSystemTableSnapshotRows(
      TABLE_NAME,
      [CACHE_PARTITION_ROW],
    );

    t.equal(
      prepareCallCount,
      2,
      'owner should refresh the authoritative row set after the cache window expires',
    );
  },
);

test(
  'BootstrapTopologySnapshotOwner invalidates bounded authoritative snapshot cache after a mutation',
  async (t) => {
    let prepareCallCount = 0;
    const initialLeaderNodeId = 'initial-leader';
    const replacementLeaderNodeId = 'replacement-leader';
    let currentPartitionRows = [{
      ...CACHE_PARTITION_ROW,
      [COLUMN.LEADER_NODE_ID]: initialLeaderNodeId,
      [COLUMN.UPDATED_AT]: 300,
    }];
    const owner = createOwner({
      authoritativeSnapshotCacheTtlMs: 1000,
      getPartitionRows: () => currentPartitionRows,
      onPrepare() {
        prepareCallCount++;
      },
    });

    const firstRows = owner.resolveAuthoritativeSystemTableSnapshotRows(
      TABLE_NAME,
      [CACHE_PARTITION_ROW],
    );

    t.equal(
      firstRows[0]?.[COLUMN.LEADER_NODE_ID],
      initialLeaderNodeId,
      'first read should expose the initial authoritative leader',
    );
    t.equal(
      prepareCallCount,
      1,
      'owner should prepare one local read for the initial authoritative snapshot',
    );

    currentPartitionRows = [{
      ...CACHE_PARTITION_ROW,
      [COLUMN.LEADER_NODE_ID]: replacementLeaderNodeId,
      [COLUMN.UPDATED_AT]: 400,
    }];

    owner.invalidateAuthoritativeSystemTableSnapshotRows();

    const refreshedRows = owner.resolveAuthoritativeSystemTableSnapshotRows(
      TABLE_NAME,
      [CACHE_PARTITION_ROW],
    );

    t.equal(
      refreshedRows[0]?.[COLUMN.LEADER_NODE_ID],
      replacementLeaderNodeId,
      'invalidating the cache should force the next read to expose the refreshed leader',
    );
    t.equal(
      prepareCallCount,
      2,
      'owner should re-read authoritative rows immediately after invalidation',
    );
  },
);

test(
  'BootstrapTopologySnapshotOwner throttles repeated divergence warnings while a mismatch persists',
  async (t) => {
    let nowMs = 1000;
    const warnings = [];
    const owner = createOwner({
      nowFn: () => nowMs,
      authoritativeSnapshotCacheTtlMs: 1,
      warningThrottleMs: 100,
      partitionRows: [],
      logger: {
        warn(message, payload) {
          warnings.push({message, payload});
        },
        info() {},
        debug() {},
        error() {},
      },
    });

    owner.resolveAuthoritativeSystemTableSnapshotRows(
      TABLE_NAME,
      [CACHE_PARTITION_ROW],
    );

    nowMs += 10;
    owner.resolveAuthoritativeSystemTableSnapshotRows(
      TABLE_NAME,
      [CACHE_PARTITION_ROW],
    );

    nowMs += 100;
    owner.resolveAuthoritativeSystemTableSnapshotRows(
      TABLE_NAME,
      [CACHE_PARTITION_ROW],
    );

    t.equal(
      warnings.length,
      2,
      'owner should suppress repeated mismatch warnings inside the throttle window and re-emit them later',
    );
    t.ok(
      warnings.every((entry) =>
        entry.message.includes('retaining cached system-table rows')),
      'throttled warnings should preserve the original fallback warning',
    );
  },
);
