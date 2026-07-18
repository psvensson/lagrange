import {test} from '../../src/test-helpers/tap.js';
import {
  CDC_OPERATIONS,
  SystemTableCache,
} from '../../src/cache/system-table-cache.js';
import {TABLES} from '../../src/constants/index.js';

const SERVICE_ID = 'priority-partition-r4';

function seedRoleAdvancedSyncingRow(cache) {
  cache.applySystemTableChange(
    TABLES.SERVICES,
    CDC_OPERATIONS.INSERT,
    {
      service_id: SERVICE_ID,
      service_type: 'partition',
      partition_id: 'priority-partition',
      node_id: 'node-b',
      status: 'syncing',
      state_entered_at: 1000,
      previous_state: 'creating',
      trigger_reason: 'replica_create',
      raft_role: 'follower',
      address: 'node-b/partition/priority-partition-r4',
      created_at: 500,
      updated_at: 3000,
    },
    {causeId: 'role-writer-advanced-row-version'},
  );
}

test(
  'SystemTableCache - newer SERVICES lifecycle fields cross an older ' +
    'composite row version without regressing role ownership',
  (t) => {
    const cache = new SystemTableCache();
    seedRoleAdvancedSyncingRow(cache);

    cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATIONS.INSERT,
      {
        service_id: SERVICE_ID,
        service_type: 'partition',
        partition_id: 'priority-partition',
        node_id: 'node-b',
        status: 'active',
        state_entered_at: 2000,
        previous_state: 'syncing',
        trigger_reason: 'voter_ready',
        raft_role: 'learner',
        address: 'node-b/partition/priority-partition-r4',
        created_at: 500,
        updated_at: 2000,
      },
      {causeId: 'later-active-lifecycle-delivery'},
    );

    const row = cache.get(TABLES.SERVICES, SERVICE_ID);
    t.equal(row.status, 'active', 'newer lifecycle state is visible');
    t.equal(
      row.state_entered_at,
      2000,
      'lifecycle ordering follows its owner timestamp',
    );
    t.equal(row.previous_state, 'syncing', 'lifecycle context advances');
    t.equal(row.trigger_reason, 'voter_ready', 'lifecycle reason advances');
    t.equal(
      row.raft_role,
      'follower',
      'stale composite delivery cannot regress the newer role field',
    );
    t.equal(
      row.updated_at,
      3000,
      'newer composite row version remains authoritative',
    );
    t.end();
  },
);

test(
  'SystemTableCache - older and equal SERVICES lifecycle deliveries remain ' +
    'stale',
  (t) => {
    const cache = new SystemTableCache();
    seedRoleAdvancedSyncingRow(cache);

    for (const stateEnteredAt of [900, 1000]) {
      cache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATIONS.UPDATE,
        {
          service_id: SERVICE_ID,
          status: 'creating',
          state_entered_at: stateEnteredAt,
          previous_state: 'pending',
          updated_at: 2000,
        },
        {causeId: `old-lifecycle-${stateEnteredAt}`},
      );
    }

    const row = cache.get(TABLES.SERVICES, SERVICE_ID);
    t.equal(row.status, 'syncing', 'older/equal lifecycle state is ignored');
    t.equal(row.state_entered_at, 1000, 'lifecycle timestamp does not regress');
    t.equal(row.updated_at, 3000, 'row version does not regress');
    t.end();
  },
);

test(
  'SystemTableCache - non-SERVICES stale rows keep generic row-level LWW',
  (t) => {
    const cache = new SystemTableCache();
    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATIONS.INSERT, {
      node_id: 'node-a',
      status: 'active',
      state_entered_at: 1000,
      created_at: 500,
      updated_at: 3000,
    });

    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATIONS.UPDATE, {
      node_id: 'node-a',
      status: 'inactive',
      state_entered_at: 2000,
      updated_at: 2000,
    });

    const row = cache.get(TABLES.NODES, 'node-a');
    t.equal(row.status, 'active', 'generic stale status remains ignored');
    t.equal(row.state_entered_at, 1000, 'generic stale fields do not advance');
    t.equal(row.updated_at, 3000, 'generic row version remains newer');
    t.end();
  },
);
