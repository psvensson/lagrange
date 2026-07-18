/**
 * refreshAuthoritativeCacheRow guard: unlike repairCacheVisibilityHole
 * (which treats a PRESENT cache row as satisfying with no field
 * expectations), this primitive must force a present-but-STALE cache row to
 * match the authoritative row. Metadata-publication CAS guards depend on it
 * when their cache's CDC feed is stalled by the very publication they are
 * trying to make (write-routing-repair-under-control-plane-moves).
 */

import {test} from '../../src/test-helpers/tap.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {
  applyCDCIntegrationServiceCacheVisibilityWait,
} from '../../src/cdc/cdc-integration-service-cache-visibility-wait.js';

class VisibilityWaitHost {}
applyCDCIntegrationServiceCacheVisibilityWait(VisibilityWaitHost);

function createHost({readResult}) {
  const host = new VisibilityWaitHost();
  host.reads = [];
  host.applied = [];
  host.cachedRecord = null;
  host.logger = {info: () => {}, warn: () => {}, debug: () => {}, error: () => {}};
  host.getPrimaryKeyField = () => 'partition_id';
  host.shouldWaitForCacheUpdate = () => true;
  host.getCacheRecord = () => host.cachedRecord;
  host.executeAuthoritativeSystemTableRead = async (tableName, sql, params) => {
    host.reads.push({tableName, sql, params});
    return readResult;
  };
  host.applyAuthoritativeCacheRepair = (tableName, operation, row, key) => {
    host.applied.push({tableName, operation, row, key});
    host.cachedRecord = row;
    return true;
  };
  return host;
}

test('refreshAuthoritativeCacheRow aligns a stale present cache row to the authority',
  async (t) => {
    const authoritativeRow = {
      partition_id: 'p1',
      leader_node_id: 'node-x',
      updated_at: 9,
    };
    const host = createHost({
      readResult: {success: true, rows: [authoritativeRow]},
    });

    const aligned = await host.refreshAuthoritativeCacheRow('partitions', 'p1');

    t.equal(aligned, true, 'a readable authoritative row must be applied');
    t.equal(host.reads.length, 1, 'one authoritative point read');
    t.same(host.reads[0].params, ['p1'], 'read keyed by the primary key');
    t.equal(host.applied.length, 1, 'the row must be repaired into the cache');
    t.equal(host.applied[0].operation, 'UPSERT',
      'repair must upsert unconditionally — present-but-stale rows included');
    t.same(host.applied[0].row, authoritativeRow,
      'the cache must receive the authoritative row verbatim');
  });

test(
  'refreshAuthoritativeCacheRow aligns the production cache exactly while ' +
    'retaining cache-local causal evidence',
  async (t) => {
    const cache = new SystemTableCache();
    const authoritativeRow = {
      service_id: 'sql_write_operations-p1-r4',
      service_type: 'partition',
      partition_id: 'sql_write_operations-p1',
      replica_id: 'sql_write_operations-p1-r4',
      node_id: 'node-x',
      address: 'node-x/partition/sql_write_operations-p1-r4',
      status: 'active',
      raft_role: 'follower',
      state_entered_at: 9,
      created_at: 3,
      updated_at: 9,
    };
    cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATION.UPSERT,
      {
        ...authoritativeRow,
        status: 'syncing',
        updated_at_hlc: '9-0-node-x',
      },
    );
    const host = new VisibilityWaitHost();
    host.logger = {
      info: () => {},
      warn: () => {},
      debug: () => {},
      error: () => {},
    };
    host.systemTableCache = cache;
    host.cacheMutationTarget = cache;
    host.getPrimaryKeyField = () => 'service_id';
    host.shouldWaitForCacheUpdate = () => true;
    host.executeAuthoritativeSystemTableRead =
      async () => ({success: true, rows: [authoritativeRow]});

    const aligned = await host.refreshAuthoritativeCacheRow(
      TABLES.SERVICES,
      authoritativeRow.service_id,
    );
    const cachedRow = cache.get(
      TABLES.SERVICES,
      authoritativeRow.service_id,
    );

    t.equal(aligned, true, 'the production cache confirms exact alignment');
    t.equal(
      cachedRow.status,
      authoritativeRow.status,
      'the durable lifecycle field is repaired exactly',
    );
    t.equal(
      cachedRow.updated_at_hlc,
      '9-0-node-x',
      'cache-local causal evidence survives authoritative replacement',
    );
  },
);

test(
  'refreshAuthoritativeCacheRow rejects a silently dropped cache repair',
  async (t) => {
    const authoritativeRow = {
      partition_id: 'p1',
      leader_node_id: 'node-x',
      updated_at: 9,
    };
    const host = createHost({
      readResult: {success: true, rows: [authoritativeRow]},
    });
    host.cachedRecord = {
      ...authoritativeRow,
      leader_node_id: 'node-stale',
    };
    host.applyAuthoritativeCacheRepair = (
      tableName,
      operation,
      row,
      key,
    ) => {
      host.applied.push({tableName, operation, row, key});
      return true;
    };

    const aligned = await host.refreshAuthoritativeCacheRow(
      'partitions',
      'p1',
    );

    t.equal(
      aligned,
      false,
      'invoking the mutation target is not proof of cache alignment',
    );
    t.equal(host.applied.length, 1, 'the repair was attempted once');
    t.equal(
      host.cachedRecord.leader_node_id,
      'node-stale',
      'the unchanged cache remains observable as divergent',
    );
  },
);

test('refreshAuthoritativeCacheRow reports failure without touching the cache when the authority is unreadable',
  async (t) => {
    const host = createHost({
      readResult: {success: false, error: 'unavailable'},
    });

    const aligned = await host.refreshAuthoritativeCacheRow('partitions', 'p1');

    t.equal(aligned, false, 'an unreadable authority must not claim success');
    t.equal(host.applied.length, 0, 'no speculative cache mutation');
  });

test('refreshAuthoritativeCacheRow leaves the cache alone when the authority has no row',
  async (t) => {
    const host = createHost({
      readResult: {success: true, rows: []},
    });

    const aligned = await host.refreshAuthoritativeCacheRow('partitions', 'p1');

    t.equal(aligned, false, 'an absent authoritative row is not an alignment');
    t.equal(host.applied.length, 0,
      'absence must not evict cache rows here (owner-sweep is the delete path)');
  });
