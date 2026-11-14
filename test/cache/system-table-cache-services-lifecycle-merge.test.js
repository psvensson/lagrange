import {test} from '../../src/test-helpers/tap.js';
import {
  CDC_OPERATIONS,
  SystemTableCache,
} from '../../src/cache/system-table-cache.js';
import {TABLES} from '../../src/constants/index.js';
import {SYSTEM_TABLE_CACHE_MUTATION_MODE} from
  '../../src/cache/cache-constants.js';
import {areAuthoritativeSystemTableCacheRowsAligned} from
  '../../src/cache/system-table-cache-authoritative-reconciliation.js';

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

// Authoritative lifecycle reconciliation (the terminal-handoff refresh mode).
// Measured on ed708dfd: an older cached row with raft_role null was labelled
// with the authority's newer updated_at while keeping its own null role, and
// the aligned predicate certified it.
function buildLifecycleRow(overrides = {}) {
  return {
    service_id: SERVICE_ID,
    service_type: 'partition',
    partition_id: 'priority-partition',
    replica_id: SERVICE_ID,
    node_id: 'node-b',
    address: 'node-b/partition/priority-partition-r4',
    group_id: null,
    error_message: null,
    cleanup_token: null,
    create_attempt_token: 'attempt-1',
    created_at: 500,
    status: 'active',
    raft_role: 'follower',
    state_entered_at: 3000,
    previous_state: 'syncing',
    trigger_reason: 'unknown',
    updated_at: 3000,
    ...overrides,
  };
}

function reconcileLifecycle(cachedRow, authoritativeRow) {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(
    TABLES.SERVICES,
    CDC_OPERATIONS.UPSERT,
    cachedRow,
  );
  const alignedBefore = areAuthoritativeSystemTableCacheRowsAligned(
    TABLES.SERVICES,
    cache.get(TABLES.SERVICES, SERVICE_ID),
    authoritativeRow,
  );
  cache.applySystemTableChange(
    TABLES.SERVICES,
    CDC_OPERATIONS.UPSERT,
    authoritativeRow,
    {
      mutationMode: SYSTEM_TABLE_CACHE_MUTATION_MODE
        .AUTHORITATIVE_SERVICE_LIFECYCLE_RECONCILIATION,
    },
  );
  const row = cache.get(TABLES.SERVICES, SERVICE_ID);
  return {
    alignedBefore,
    row,
    alignedAfter: areAuthoritativeSystemTableCacheRowsAligned(
      TABLES.SERVICES,
      row,
      authoritativeRow,
    ),
  };
}

test(
  'SystemTableCache - lifecycle reconciliation fills the absent cached role ' +
    'of the measured interleaving from the newer authoritative row',
  (t) => {
    const authoritativeRow = buildLifecycleRow();
    const {row, alignedAfter} = reconcileLifecycle(
      buildLifecycleRow({
        status: 'syncing',
        raft_role: null,
        state_entered_at: 1000,
        previous_state: 'creating',
        updated_at: 1000,
        updated_at_hlc: '1000-0-services-p1-r1',
      }),
      authoritativeRow,
    );

    t.same(
      row,
      authoritativeRow,
      'the absent cached role is filled and the superseded HLC dropped',
    );
    t.equal(row.raft_role, 'follower', 'the older null role is not kept');
    t.equal(alignedAfter, true, 'the installed authoritative row is aligned');

    const mergedPartialRow = {...authoritativeRow, raft_role: null};
    t.equal(
      areAuthoritativeSystemTableCacheRowsAligned(
        TABLES.SERVICES,
        mergedPartialRow,
        authoritativeRow,
      ),
      false,
      'a row labelled with the authoritative version but missing its ' +
        'raft_role is not aligned',
    );
    t.end();
  },
);

test(
  'SystemTableCache - lifecycle reconciliation applies a newer role-only ' +
    'authoritative version at an unchanged lifecycle timestamp',
  (t) => {
    const authoritativeRow = buildLifecycleRow({updated_at: 3500});
    const {alignedBefore, row, alignedAfter} = reconcileLifecycle(
      buildLifecycleRow({raft_role: null}),
      authoritativeRow,
    );

    t.equal(
      alignedBefore,
      false,
      'an older cached row version is not aligned with newer authority',
    );
    t.same(row, authoritativeRow, 'the newer role write is installed');
    t.equal(alignedAfter, true);
    t.end();
  },
);

test(
  'SystemTableCache - lifecycle reconciliation never lets an absent cached ' +
    'value override an authoritative value at an equal version',
  (t) => {
    const authoritativeRow = buildLifecycleRow();
    const nullRole = reconcileLifecycle(
      buildLifecycleRow({raft_role: null}),
      authoritativeRow,
    );
    t.equal(
      nullRole.alignedBefore,
      false,
      'a null cached raft_role is not aligned with an authoritative role',
    );
    t.equal(nullRole.row.raft_role, 'follower', 'the null cached role is filled');
    t.equal(nullRole.alignedAfter, true);

    const missingRoleRow = buildLifecycleRow();
    delete missingRoleRow.raft_role;
    const missingRole = reconcileLifecycle(missingRoleRow, authoritativeRow);
    t.equal(
      missingRole.alignedBefore,
      false,
      'a missing cached raft_role is not aligned with an authoritative role',
    );
    t.equal(missingRole.row.raft_role, 'follower');
    t.equal(missingRole.alignedAfter, true);
    t.end();
  },
);

test(
  'SystemTableCache - lifecycle reconciliation keeps a strictly newer ' +
    'cached SERVICES row',
  (t) => {
    const cachedRow = buildLifecycleRow({
      updated_at: 4000,
      updated_at_hlc: '4000-0-services-p1-r1',
    });
    const {alignedBefore, row, alignedAfter} = reconcileLifecycle(
      cachedRow,
      buildLifecycleRow({raft_role: 'learner'}),
    );

    t.same(row, cachedRow, 'newer cached role and version evidence stays');
    t.equal(alignedBefore, true, 'a strictly newer cached row is aligned');
    t.equal(alignedAfter, true);

    const newerAbsentRoleRow = {...cachedRow, raft_role: null};
    const newerAbsentRole = reconcileLifecycle(
      newerAbsentRoleRow,
      buildLifecycleRow(),
    );
    t.same(
      newerAbsentRole.row,
      newerAbsentRoleRow,
      'an older authoritative role is not written under a newer cached version',
    );
    t.equal(newerAbsentRole.alignedBefore, true);
    t.end();
  },
);

test(
  'SystemTableCache - an older authoritative lifecycle read does not ' +
    'regress a newer cached SERVICES row',
  (t) => {
    const cachedRow = buildLifecycleRow();
    const {row, alignedAfter} = reconcileLifecycle(
      cachedRow,
      buildLifecycleRow({
        status: 'syncing',
        raft_role: 'learner',
        state_entered_at: 2000,
        previous_state: 'creating',
        updated_at: 2000,
      }),
    );

    t.same(row, cachedRow, 'older authority changes no cached column');
    t.equal(
      alignedAfter,
      false,
      'a different lifecycle status is never reported aligned',
    );
    t.end();
  },
);

test(
  'SystemTableCache - lifecycle reconciliation keeps an owner-local voter ' +
    'seed held under an older label against a newer null authoritative role',
  (t) => {
    // CL-035: the owner seeds its voter role ahead of the durable row.
    const {row, alignedAfter} = reconcileLifecycle(
      buildLifecycleRow({state_entered_at: 2000, updated_at: 2000}),
      buildLifecycleRow({raft_role: null}),
    );
    t.equal(row.raft_role, 'follower', 'the seeded voter role is kept');
    t.equal(row.updated_at, 3000);
    t.equal(alignedAfter, true);
    t.end();
  },
);

test(
  'SystemTableCache - lifecycle reconciliation keeps a deliberately cleared ' +
    'null under newer cached evidence or another incarnation',
  (t) => {
    const newerLifecycleRow = buildLifecycleRow({
      raft_role: null,
      state_entered_at: 4000,
      updated_at: 4000,
    });
    const newerLifecycle = reconcileLifecycle(
      newerLifecycleRow,
      buildLifecycleRow({updated_at: 4000}),
    );
    t.equal(
      newerLifecycle.row.raft_role,
      null,
      'a strictly newer cached lifecycle keeps its cleared role',
    );
    t.equal(newerLifecycle.alignedBefore, true);

    const newerLifecycleError = reconcileLifecycle(
      buildLifecycleRow({
        status: 'creating',
        error_message: null,
        state_entered_at: 4000,
        updated_at: 4000,
      }),
      buildLifecycleRow({error_message: 'boom', updated_at: 4000}),
    );
    t.equal(
      newerLifecycleError.row.error_message,
      null,
      'an older lifecycle value is never written into a newer lifecycle',
    );

    for (const incarnation of [
      {create_attempt_token: 'attempt-0'},
      {created_at: 400},
    ]) {
      const otherIncarnation = reconcileLifecycle(
        buildLifecycleRow({raft_role: null, ...incarnation}),
        buildLifecycleRow(),
      );
      t.equal(
        otherIncarnation.row.raft_role,
        null,
        `another incarnation (${Object.keys(incarnation)[0]}) keeps its null`,
      );
    }
    t.end();
  },
);

test(
  'SystemTableCache - documented: a seed-cleared null at an equal lifecycle ' +
    'version is refilled from the authoritative row',
  (t) => {
    // Record v2 routes this case to the cache position-contract unit; this
    // quest pins the behaviour, it does not claim it.
    const {alignedBefore, row} = reconcileLifecycle(
      buildLifecycleRow({raft_role: null}),
      buildLifecycleRow(),
    );
    t.equal(alignedBefore, false);
    t.equal(row.raft_role, 'follower');
    t.end();
  },
);

test(
  'SystemTableCache - lifecycle reconciliation fills undefined and other ' +
    'non-lifecycle absent cached columns',
  (t) => {
    const undefinedRole = reconcileLifecycle(
      buildLifecycleRow({raft_role: undefined}),
      buildLifecycleRow(),
    );
    t.equal(undefinedRole.alignedBefore, false);
    t.equal(undefinedRole.row.raft_role, 'follower');

    const nullGroup = reconcileLifecycle(
      buildLifecycleRow({group_id: null}),
      buildLifecycleRow({group_id: 'group-1'}),
    );
    t.equal(nullGroup.alignedBefore, false);
    t.equal(nullGroup.row.group_id, 'group-1');
    t.equal(nullGroup.alignedAfter, true);
    t.end();
  },
);

test(
  'SystemTableCache - lifecycle reconciliation version guards with ' +
    'non-finite versions on either side',
  (t) => {
    for (const updatedAt of [null, 'not-a-number']) {
      const cachedNonFinite = reconcileLifecycle(
        buildLifecycleRow({raft_role: null, updated_at: updatedAt}),
        buildLifecycleRow(),
      );
      t.equal(
        cachedNonFinite.row.raft_role,
        'follower',
        `a non-finite cached updated_at (${updatedAt}) is not newer`,
      );
    }
    const cachedLifecycleNonFinite = reconcileLifecycle(
      buildLifecycleRow({raft_role: null, state_entered_at: null}),
      buildLifecycleRow(),
    );
    t.equal(
      cachedLifecycleNonFinite.row.raft_role,
      'follower',
      'a non-finite cached lifecycle version is not newer',
    );

    const authorityRowNonFinite = reconcileLifecycle(
      buildLifecycleRow({raft_role: null}),
      buildLifecycleRow({updated_at: null}),
    );
    t.equal(
      authorityRowNonFinite.row.raft_role,
      null,
      'a non-finite authoritative updated_at fills nothing',
    );
    const authorityLifecycleNonFinite = reconcileLifecycle(
      buildLifecycleRow({raft_role: null}),
      buildLifecycleRow({state_entered_at: null}),
    );
    t.equal(
      authorityLifecycleNonFinite.row.raft_role,
      null,
      'an unresolvable authoritative lifecycle version fills nothing',
    );
    t.end();
  },
);

test(
  'SystemTableCache - pinned Q4 gap outside the grid: an identity column ' +
    'that differs blocks the fill, then the identity overwrite exposes it',
  (t) => {
    // The incarnation check reads the cached row before the base overwrites
    // identity columns from authority, so the first reconciliation leaves a
    // Q1 cell and is not aligned; the next one fills it and aligns.
    const authoritativeRow = buildLifecycleRow();
    const cache = new SystemTableCache();
    cache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATIONS.UPSERT,
      buildLifecycleRow({raft_role: null, node_id: 'node-a'}),
    );
    const reconcile = () => {
      cache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATIONS.UPSERT,
        authoritativeRow,
        {
          mutationMode: SYSTEM_TABLE_CACHE_MUTATION_MODE
            .AUTHORITATIVE_SERVICE_LIFECYCLE_RECONCILIATION,
        },
      );
      const row = cache.get(TABLES.SERVICES, SERVICE_ID);
      return {
        row,
        aligned: areAuthoritativeSystemTableCacheRowsAligned(
          TABLES.SERVICES,
          row,
          authoritativeRow,
        ),
      };
    };
    const first = reconcile();
    t.equal(first.row.node_id, 'node-b', 'identity follows authority');
    t.equal(first.row.raft_role, null, 'the other incarnation kept its null');
    t.equal(first.aligned, false, 'the first refresh is not aligned');
    const second = reconcile();
    t.equal(second.row.raft_role, 'follower', 'the next refresh fills it');
    t.equal(second.aligned, true);
    t.end();
  },
);

test(
  'SystemTableCache - unresolved: an equal-version present role that ' +
    'disagrees with authority keeps the cached value and is reported aligned',
  (t) => {
    // Documents today's behaviour for an interleaving the authoritative read
    // cannot order: equal updated_at, both roles present, no HLC on the read.
    // The handoff witness 'ACTIVE terminal handoff aligns lifecycle ownership
    // without regressing a same-version role event carrying newer origin HLC'
    // depends on it. Reported as a finding; not decided here.
    const cachedRow = buildLifecycleRow({
      updated_at_hlc: '3000-1-services-p1-r1',
    });
    const presentRole = reconcileLifecycle(
      cachedRow,
      buildLifecycleRow({raft_role: 'learner'}),
    );
    t.same(presentRole.row, cachedRow);
    t.equal(presentRole.alignedBefore, true);

    const absentAuthorityRole = reconcileLifecycle(
      cachedRow,
      buildLifecycleRow({raft_role: null}),
    );
    t.same(
      absentAuthorityRole.row,
      cachedRow,
      'an absent authoritative role keeps the cached non-leader voter role',
    );
    t.equal(absentAuthorityRole.alignedBefore, true);
    t.end();
  },
);
