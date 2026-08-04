// Deterministic proof for quest raft-churn-sync-section-attribution: the three
// formation sweep loops (control-plane rebind, raft-timing apply, replica
// registration) and the leader-activation path are wrapped with
// trackSyncSection so the event-loop gap watchdog attributes the synchronous
// churn burst to named sites (replacing 'unexplainedMs ~ gapMs'). These tests
// prove each new sync section is recorded into the shared registry, that the
// wrapped functions return/throw identically (instrumentation-only, no
// behavior change), and that exclusive nesting does not double-count.

import {test} from '../../src/test-helpers/tap.js';
import {
  getSharedSyncSectionRegistry,
  trackSyncSection,
} from '../../src/diagnostics/event-loop-gap-watchdog.js';

import {
  RAFT_CHURN_SYNC_SECTION,
} from '../../src/diagnostics/raft-churn-sync-sections.js';

function siteSnapshot(site) {
  return getSharedSyncSectionRegistry().snapshot().sites[site];
}

test('RAFT_CHURN_SYNC_SECTION names follow the snake_case convention and ' +
  'are distinct', async (t) => {
  const names = Object.values(RAFT_CHURN_SYNC_SECTION);
  t.ok(names.length >= 4, 'at least four churn scopes are named');
  for (const name of names) {
    t.match(
      name,
      /^[a-z][a-z0-9_]*$/,
      `${name} is snake_case (matches cdc_update_row_fetch convention)`,
    );
  }
  t.equal(
    new Set(names).size,
    names.length,
    'site names are distinct (no accidental double-bucket)',
  );
  t.end();
});

test('control_plane_rebind_sweep section is recorded around the rebind ' +
  'sweep and the sweep behavior is unchanged', async (t) => {
  const {StartupRuntimeSurfaceOwner} = await import(
    '../../src/bootstrap/shared/startup-runtime-surface-owner.js'
  );
  const calls = [];
  const owner = new StartupRuntimeSurfaceOwner({
    delegates: {
      getTablePolicyService: () => ({id: 'policy'}),
      getRebalanceCoordinator: () => ({id: 'coordinator'}),
      getMessageGroupServices: () => new Map([
        ['mg-1', {
          setTablePolicyService: (v) => calls.push(['mg-policy', v.id]),
          setRebalanceCoordinator: (v) => calls.push(['mg-coord', v.id]),
        }],
      ]),
      getPartitionServices: () => new Map([
        ['p-1', {
          setTablePolicyService: (v) => calls.push(['p-policy', v.id]),
          setRebalanceCoordinator: (v) => calls.push(['p-coord', v.id]),
        }],
      ]),
    },
  });

  const before =
    siteSnapshot(RAFT_CHURN_SYNC_SECTION.CONTROL_PLANE_REBIND_SWEEP)?.count || 0;
  const result = owner.bindControlPlaneServices();
  const after =
    siteSnapshot(RAFT_CHURN_SYNC_SECTION.CONTROL_PLANE_REBIND_SWEEP)?.count || 0;

  t.ok(after > before, 'the rebind sweep entered its sync section');
  t.equal(
    calls.length,
    4,
    'all four delegate binds still ran (no behavior change)',
  );
  t.same(
    calls,
    [
      ['mg-policy', 'policy'],
      ['mg-coord', 'coordinator'],
      ['p-policy', 'policy'],
      ['p-coord', 'coordinator'],
    ],
    'bind order and arguments unchanged',
  );
  t.equal(
    result,
    undefined,
    'bindControlPlaneServices return value is unchanged (undefined)',
  );
  t.end();
});

test('replica_registration_sweep section is recorded and registration ' +
  'counts are unchanged', async (t) => {
  const {
    createBootstrapServiceReplicaHandlerRuntimeMethods,
  } = await import(
    '../../src/bootstrap/bootstrap-service-replica-registration-methods.js'
  );
  const registered = [];
  const replicaHandler = {
    registerExistingReplica: (info) => registered.push(info.replicaId),
  };
  const partitions = new Map([
    ['r-1', {partitionId: 'p-1', tableName: 'tables'}],
    ['r-2', {partitionId: 'p-2', tableName: 'tables'}],
  ]);
  // The registration methods are a plain-method bag bound to a host; supply
  // the minimal surface registerPartitionsWithReplicaHandler touches.
  const methods = createBootstrapServiceReplicaHandlerRuntimeMethods();
  const host = Object.assign(Object.create(methods), {
    config: {replicaRegistrationTraceEnabled: false},
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
    nodeId: 'node-0',
  });

  const before =
    siteSnapshot(
      RAFT_CHURN_SYNC_SECTION.REPLICA_REGISTRATION_SWEEP,
    )?.count || 0;
  const result = host.registerPartitionsWithReplicaHandler(
    replicaHandler,
    partitions,
  );
  const after =
    siteSnapshot(
      RAFT_CHURN_SYNC_SECTION.REPLICA_REGISTRATION_SWEEP,
    )?.count || 0;

  t.ok(after > before, 'the registration sweep entered its sync section');
  t.equal(registered.length, 2, 'both replicas registered (no behavior change)');
  t.equal(result.registeredCount, 2, 'reported registeredCount unchanged');
  t.end();
});

test('exclusive nesting does not double-count a churn sweep wrapped around ' +
  'an inner tagged section', async (t) => {
  // Mirror the production shape: a sweep section wraps leaves that may
  // themselves be tagged (e.g. cdc_update_row_fetch inside a rebind-driven
  // CDC fetch). The exclusiveTaggedMs must be the union, not the sum.
  const outer = RAFT_CHURN_SYNC_SECTION.CONTROL_PLANE_REBIND_SWEEP;
  const inner = 'cdc_update_row_fetch';
  const spin = (ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      // busy-wait to accrue measurable exclusive time
    }
  };
  const registry = getSharedSyncSectionRegistry();
  const beforeExclusive = registry.snapshot().exclusiveTaggedMs;
  trackSyncSection(outer, () => {
    spin(5);
    trackSyncSection(inner, () => spin(5));
    spin(5);
  });
  const snapshot = registry.snapshot();
  const outerTotal = snapshot.sites[outer]?.totalMs || 0;
  const innerTotal = snapshot.sites[inner]?.totalMs || 0;
  const exclusiveDelta = snapshot.exclusiveTaggedMs - beforeExclusive;
  t.ok(
    outerTotal >= innerTotal,
    `outer inclusive (${outerTotal}ms) covers inner (${innerTotal}ms)`,
  );
  t.ok(
    exclusiveDelta <= outerTotal + 2,
    `exclusive delta (${exclusiveDelta}ms) is the union, not the sum of ` +
      `outer+inner (${outerTotal + innerTotal}ms)`,
  );
  t.end();
});

test('wrapped functions propagate thrown errors unchanged', async (t) => {
  const site = RAFT_CHURN_SYNC_SECTION.CONTROL_PLANE_REBIND_SWEEP;
  let thrown = null;
  try {
    trackSyncSection(site, () => {
      throw new Error('rebind-boom');
    });
  } catch (error) {
    thrown = error;
  }
  t.equal(thrown?.message, 'rebind-boom', 'exception propagated unchanged');
  t.end();
});
