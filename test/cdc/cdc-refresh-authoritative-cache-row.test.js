/**
 * refreshAuthoritativeCacheRow guard: unlike repairCacheVisibilityHole
 * (which treats a PRESENT cache row as satisfying with no field
 * expectations), this primitive must force a present-but-STALE cache row to
 * match the authoritative row. Metadata-publication CAS guards depend on it
 * when their cache's CDC feed is stalled by the very publication they are
 * trying to make (write-routing-repair-under-control-plane-moves).
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  applyCDCIntegrationServiceCacheVisibilityWait,
} from '../../src/cdc/cdc-integration-service-cache-visibility-wait.js';

class VisibilityWaitHost {}
applyCDCIntegrationServiceCacheVisibilityWait(VisibilityWaitHost);

function createHost({readResult}) {
  const host = new VisibilityWaitHost();
  host.reads = [];
  host.applied = [];
  host.logger = {info: () => {}, warn: () => {}, debug: () => {}, error: () => {}};
  host.getPrimaryKeyField = () => 'partition_id';
  host.shouldWaitForCacheUpdate = () => true;
  host.executeAuthoritativeSystemTableRead = async (tableName, sql, params) => {
    host.reads.push({tableName, sql, params});
    return readResult;
  };
  host.applyAuthoritativeCacheRepair = (tableName, operation, row, key) => {
    host.applied.push({tableName, operation, row, key});
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
