// A lifecycle DELETE fenced by identity + source state + lifecycle generation
// (no updated_at) must order correctly in the cache.
//
// A DELETE's CDC payload is its where-clause predicate, not a row version.
// Without an origin-HLC pair the cache used to read the predicate's created_at
// as the delete's version, so a row whose updated_at had advanced through an
// unrelated role write looked newer than its own removal and survived it.
import {test} from '../../src/test-helpers/tap.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {TABLES} from '../../src/constants/index.js';

const REPLICA_ID = 'mg-1-r1';

function stoppedAtGeneration(createdAt, stateEnteredAt) {
  return {
    service_id: REPLICA_ID,
    service_type: 'message-group',
    group_id: 'mg-1',
    node_id: 'node-a',
    status: 'stopped',
    raft_role: 'leader',
    created_at: createdAt,
    state_entered_at: stateEnteredAt,
    updated_at: stateEnteredAt,
  };
}

function removalPredicate(row) {
  return {
    service_id: row.service_id,
    service_type: row.service_type,
    group_id: row.group_id,
    node_id: row.node_id,
    status: 'stopped',
    created_at: row.created_at,
    state_entered_at: row.state_entered_at,
  };
}

function roleWrite(row, updatedAt) {
  return {service_id: row.service_id, created_at: row.created_at,
    raft_role: 'follower', updated_at: updatedAt};
}

test('cache orders a generation-fenced removal after unrelated role writes',
  async (t) => {
    const cache = new SystemTableCache();
    const generationG = stoppedAtGeneration(100, 300);
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', generationG);
    cache.applySystemTableChange(TABLES.SERVICES, 'UPDATE',
      roleWrite(generationG, 999));

    cache.applySystemTableChange(TABLES.SERVICES, 'DELETE',
      removalPredicate(generationG));
    t.equal(cache.get(TABLES.SERVICES, REPLICA_ID), undefined,
      'the removal carrying G removes the row whose updated_at advanced');

    cache.applySystemTableChange(TABLES.SERVICES, 'UPDATE',
      roleWrite(generationG, 999));
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', generationG);
    t.equal(cache.get(TABLES.SERVICES, REPLICA_ID), undefined,
      'late writes of the removed generation cannot resurrect it');

    const generationNext = stoppedAtGeneration(2000, 2000);
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', generationNext);
    t.equal(cache.get(TABLES.SERVICES, REPLICA_ID)?.created_at, 2000,
      'the recreated generation G+1 is admitted');

    cache.applySystemTableChange(TABLES.SERVICES, 'DELETE',
      removalPredicate(generationG));
    t.equal(cache.get(TABLES.SERVICES, REPLICA_ID)?.created_at, 2000,
      'a delayed removal carrying G cannot delete G+1');
  });

test('cache keeps origin-HLC ordering for a generation-fenced removal',
  async (t) => {
    const cache = new SystemTableCache();
    const generationG = {...stoppedAtGeneration(100, 300),
      updated_at_hlc: '1000-0-node-a'};
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', generationG);
    cache.applySystemTableChange(TABLES.SERVICES, 'DELETE',
      {...removalPredicate(generationG), updated_at_hlc: '900-0-node-a'});
    t.equal(cache.get(TABLES.SERVICES, REPLICA_ID)?.service_id, REPLICA_ID,
      'an HLC-older delete stays superseded even when its predicate matches');
    cache.applySystemTableChange(TABLES.SERVICES, 'DELETE',
      {...removalPredicate(generationG), updated_at_hlc: '1100-0-node-a'});
    t.equal(cache.get(TABLES.SERVICES, REPLICA_ID), undefined,
      'an HLC-newer delete removes the row');
  });
