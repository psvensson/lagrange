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

test('storage_reservation_reconcile section is recorded around the ' +
  'reservation reconcile sweep and the sweep behavior is unchanged',
async (t) => {
  const {applyRebalanceCoordinatorReservationLifecycleMethods} = await import(
    '../../src/rebalancer/rebalance-coordinator-reservation-lifecycle-methods.js'
  );
  class TestCoordinator {
    constructor() {
      this.logger = {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      };
      // First authoritative read (expired-active) returns one stale row; the
      // second (all-active) returns none, so the sweep expires exactly one.
      const reads = [
        {success: true, rows: [{reservation_id: 'res-1', operation_id: 'op-1'}]},
        {success: true, rows: []},
      ];
      this.controlPlaneSystemTableGateway = {
        readAuthoritativeRows: async () => reads.shift(),
      };
      this.stats = {reservationsReconciled: 0};
      this.events = [];
      this.transitions = [];
    }
    emit(eventName, payload) {
      this.events.push([eventName, payload]);
    }
    async queryOperationById() {
      return null;
    }
    isOperationTerminal() {
      return false;
    }
  }
  applyRebalanceCoordinatorReservationLifecycleMethods(TestCoordinator);
  const coordinator = new TestCoordinator();
  coordinator.transitionActiveReservationById =
    async (reservationId, status) => {
      coordinator.transitions.push([reservationId, status]);
      return {success: true, changed: true};
    };

  const site = RAFT_CHURN_SYNC_SECTION.STORAGE_RESERVATION_RECONCILE;
  const before = siteSnapshot(site)?.count || 0;
  const result = await coordinator.reconcileReservations();
  const after = siteSnapshot(site)?.count || 0;

  t.equal(after, before + 1, 'the reconcile sweep entered its sync section');
  t.same(
    result,
    {expired: 1, orphansReleased: 0},
    'reconcile result counts unchanged (one stale reservation expired)',
  );
  t.same(
    coordinator.transitions,
    [['res-1', 'expired']],
    'the stale reservation transitioned exactly as before',
  );
  t.equal(
    coordinator.stats.reservationsReconciled,
    1,
    'stats accumulation unchanged',
  );
  t.equal(
    coordinator.events.length,
    1,
    'reservationReconciled event still emitted',
  );
  t.end();
});

test('storage_reservation_reconcile async wrapper records the section only ' +
  'after settle and propagates rejections unchanged', async (t) => {
  const {trackStorageReservationReconcile} = await import(
    '../../src/diagnostics/raft-churn-sync-sections.js'
  );
  const site = RAFT_CHURN_SYNC_SECTION.STORAGE_RESERVATION_RECONCILE;

  const before = siteSnapshot(site)?.count || 0;
  let observedMidSpan = null;
  const value = await trackStorageReservationReconcile(async () => {
    await Promise.resolve();
    observedMidSpan = (siteSnapshot(site)?.count || 0) === before;
    return 'reconcile-value';
  });
  t.equal(value, 'reconcile-value', 'resolved value propagated unchanged');
  t.ok(
    observedMidSpan,
    'section is still open across the await (span, not first-segment only)',
  );
  t.equal(
    siteSnapshot(site)?.count || 0,
    before + 1,
    'section recorded once after the async sweep settled',
  );

  let rejected = null;
  try {
    await trackStorageReservationReconcile(async () => {
      throw new Error('reconcile-boom');
    });
  } catch (error) {
    rejected = error;
  }
  t.equal(rejected?.message, 'reconcile-boom', 'rejection propagated unchanged');
  t.equal(
    siteSnapshot(site)?.count || 0,
    before + 2,
    'section exits on rejection too (finally path)',
  );
  t.end();
});

test('stuck_transaction_heal section is recorded around the hold-timeout ' +
  'sweep and the heal-deferred behavior is unchanged', async (t) => {
  const {PartitionServiceTransactionBase} = await import(
    '../../src/partition/partition-service-transaction-base.js'
  );
  const {PARTITION_SERVICE_SHARED} = await import(
    '../../src/partition/partition-service-shared.js'
  );
  const {RaftRole} = PARTITION_SERVICE_SHARED;
  const warns = [];
  const service = Object.assign(
    Object.create(PartitionServiceTransactionBase.prototype),
    {
      partitionId: 'p-1',
      role: RaftRole.LEADER,
      preparedStateHoldTimeoutMs: 1000,
      preparedTransactions: new Map([
        ['session-1', {preparedAt: 0}],
      ]),
      activeTransactions: new Map(),
      isSoloReplicaGroup: () => false,
      logger: {
        info: () => {},
        warn: (message, context) => warns.push([message, context]),
        error: () => {},
        debug: () => {},
      },
    },
  );

  const site = RAFT_CHURN_SYNC_SECTION.STUCK_TRANSACTION_HEAL;
  const before = siteSnapshot(site)?.count || 0;
  // preparedAt=0 with now=5000 exceeds the 1000ms hold; leader role defers.
  const released = service.enforcePreparedStateHoldTimeouts(5000);
  const after = siteSnapshot(site)?.count || 0;

  t.equal(after, before + 1, 'the heal sweep entered its sync section');
  t.equal(released, 0, 'leader-role heal still deferred (returns 0)');
  t.equal(warns.length, 1, 'heal-deferred warn still emitted once');
  t.equal(
    warns[0][1]?.expiredPreparedSessionCount,
    1,
    'deferred warn context unchanged',
  );
  t.ok(
    service.preparedTransactions.has('session-1'),
    'deferred heal leaves the stuck session in place (no behavior change)',
  );

  // The cheap early-return path (nothing expired) is also inside the section.
  service.preparedTransactions.clear();
  const releasedEmpty = service.enforcePreparedStateHoldTimeouts(5000);
  t.equal(releasedEmpty, 0, 'empty sweep still returns 0');
  t.equal(
    siteSnapshot(site)?.count || 0,
    before + 2,
    'empty sweep is also recorded (the continuous cadence is measurable)',
  );
  t.end();
});
