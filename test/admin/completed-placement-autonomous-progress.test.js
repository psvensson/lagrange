import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {AdminWebSocketAPI} from '../../src/admin/admin-websocket-api.js';
import {TABLES} from '../../src/constants/index.js';
import {resetFixtureSingletons, clearFixtureSingletons} from '../test-helpers/participant-transaction-fixture.js';
import {autonomousHandoffFixture, tick, RECOVERY_TICKS} from './completed-placement-autonomous-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

function assertConverged(f, originalOperation) {
  assert.equal(f.target().status, 'active', 'real CDC hydration repairs stale target visibility');
  assert.equal(f.target().raft_role, 'follower');
  assert.equal(f.publication().priority_partition_summary.satisfied, true,
    'the publication owner must durably settle the completed-placement handoff');
  assert.equal(f.publication().status, 'PUBLISHED');
  assert.deepEqual(f.operation(), originalOperation, 'the initial completed ADD remains terminal');
}

function createProductionAdminComposition(t, f) {
  const api = new AdminWebSocketAPI({
    nodeId: 'node-1',
    systemTableCache: f.cache,
    cacheMutationTarget: f.cache,
    sqlQueryEngine: f.engine,
    cdcIntegrationService: f.cdc,
    controlPlaneSystemTableGateway: f.gateway,
    controlPlaneReadinessService: f.readiness,
    nowFn: () => f.clock.now(),
  });
  t.after(() => api.unsubscribeFromCacheNotifications());
  return api;
}

for (const disableTrigger of [false, true]) {
  test(`completed-placement handoff ${disableTrigger ? 'requires' : 'converges through'} the membership owner driver without admin polling`, async (t) => {
    const f = await autonomousHandoffFixture(t);
    const originalOperation = f.operation();
    const api = createProductionAdminComposition(t, f);
    let polls = 0;
    for (const [target, method] of [
      [api.controlSnapshot, 'getControlSnapshot'],
      [api.controlSnapshot, 'resolveLocalControlSnapshot'],
      [api.controlSnapshot, 'buildLocalControlSnapshot'],
      [api.controlSnapshot, 'buildControlSnapshotQueryResult'],
      [api.controlPlaneSnapshotOwner, 'resolveControlSnapshot'],
      [api.controlPlaneSnapshotOwner, 'resolveServiceDiscoverySnapshot'],
    ]) {
      const original = target[method].bind(target);
      target[method] = (...args) => {
        polls += 1;
        return original(...args);
      };
    }
    await tick(f);
    assert.ok(f.hydrations.some(({options, result}) =>
      options.tables?.includes(TABLES.SERVICES) && result.tablesFailed.includes(TABLES.SERVICES)),
    'fault engages the real periodic SERVICES hydration');
    assert.equal(f.target().status, 'syncing');
    assert.equal(f.publication().priority_partition_summary.satisfied, false);
    assert.equal(polls, 0);
    // The refused tick is settled BEFORE disabling its future wake. No held
    // successful read can complete behind the negative's disabled trigger.
    if (disableTrigger) f.clock.clearInterval(f.membership.ownerMembershipDriverTimer);
    f.blocked = false;
    const writesBefore = f.writes.length;
    for (let tickIndex = 0; tickIndex < RECOVERY_TICKS; tickIndex += 1) await tick(f);
    assert.equal(polls, 0, 'autonomous convergence completes with zero observer calls');
    if (disableTrigger) {
      assert.throws(() => assertConverged(f, originalOperation), /real CDC hydration/);
      assert.equal(f.publication().priority_partition_summary.satisfied, false);
      assert.equal(f.writes.length, writesBefore);
      return;
    }
    assert.ok(f.hydrations.some(({options, result, blocked}) => !blocked &&
      options.tables?.includes(TABLES.SERVICES) && !result.tablesFailed.includes(TABLES.SERVICES)),
    'the existing timer drives real SERVICES hydration after fault release');
    assertConverged(f, originalOperation);
    assert.ok(f.writes.slice(writesBefore).some((write) =>
      write.sql.includes(TABLES.CONTROL_PLANE_PUBLICATIONS) && write.changes > 0),
    'owner-originated publication SQL commits after recovery');
    assert.equal(polls, 0, 'formation and handoff convergence never invoked any observer');
    assert.deepEqual(f.errors, [], 'no swallowed owner error can be accepted as convergence');
  });
}

test('ordinary observations remain mutation-free during degradation through production composition including delayed tasks', async (t) => {
  const f = await autonomousHandoffFixture(t, {
    publishedActiveNodeIds: ['node-1', 'node-2'],
  });
  const api = createProductionAdminComposition(t, f);
  await tick(f);
  assert.equal(f.target().status, 'syncing');
  assert.equal(f.publication().priority_partition_summary.satisfied, false);
  assert.deepEqual(
    JSON.parse(f.publication().published_active_node_ids),
    ['node-1', 'node-2'],
  );

  // Pause autonomous periodic driver after degradation is established, and
  // unblock the SQL read seam so any observer-initiated repair, hydration, or
  // delayed task would succeed and mutate cache/SQL if scheduled.
  f.clock.clearInterval(f.membership.ownerMembershipDriverTimer);
  f.blocked = false;

  assert.equal(
    api.controlSnapshot.canRunAuthoritativeControlSnapshotRepair(),
    true,
    'production composition must have full repair capability wired',
  );

  const counts = {
    scheduleDiscoveryRepair: 0,
    ensureDiscoveryRepair: 0,
    reconcileFromHandoff: 0,
    reconcileActiveGate: 0,
    reconcileClusterMembership: 0,
    enqueueMembershipReconcile: 0,
  };
  for (const [target, method, key] of [
    [api.serviceDiscovery, 'scheduleAuthoritativeDiscoveryCacheRepair', 'scheduleDiscoveryRepair'],
    [api.serviceDiscovery, 'ensureAuthoritativeDiscoveryCacheRepair', 'ensureDiscoveryRepair'],
    [api.controlSnapshot, 'reconcileAuthoritativeMembershipPublicationFromHandoff', 'reconcileFromHandoff'],
    [f.membership, 'reconcileActiveGateMembershipPublication', 'reconcileActiveGate'],
    [f.membership, 'reconcileClusterMembership', 'reconcileClusterMembership'],
    [f.membership, 'enqueueClusterMembershipReconcile', 'enqueueMembershipReconcile'],
  ]) {
    const original = target[method].bind(target);
    target[method] = (...args) => {
      counts[key] += 1;
      return original(...args);
    };
  }

  const versions = () => Object.fromEntries(Object.values(TABLES).map((table) =>
    [table, f.cache.getTableMutationVersion(table)]));
  const versionsBefore = versions();
  const watermarksBefore = f.cache.getTableRevisionWatermarks();
  const writesBefore = f.writes.length;
  const hydrationsBefore = f.hydrations.length;

  // 1. Ordinary getControlSnapshot and resolveLocalControlSnapshot with real ControlPlaneReadinessService
  const directSnapshot = await api.controlSnapshot.getControlSnapshot({
    capturedAt: f.clock.now(),
  });
  assert.equal(directSnapshot.replicaOperations.inFlightCount, 0);
  const resolvedWithReadiness =
    await api.controlSnapshot.resolveLocalControlSnapshot();
  const repairEvaluation =
    api.controlSnapshot.evaluateAuthoritativeControlSnapshotRepair(
      resolvedWithReadiness,
    );
  assert.equal(repairEvaluation.shouldRepair, true);
  assert.ok(
    repairEvaluation.triggerCodes.includes(
      'priority_placement_completion_handoff_gap',
    ),
  );
  assert.equal(resolvedWithReadiness.snapshotObservation.state, 'stale_usable');
  assert.deepEqual(resolvedWithReadiness.publishedNodes, ['node-1', 'node-2']);
  assert.deepEqual(resolvedWithReadiness.projectedNodes, ['node-1', 'node-2', 'node-3']);
  assert.deepEqual(resolvedWithReadiness.suspectedOrTransitioningNodes, ['node-3']);
  assert.deepEqual(
    resolvedWithReadiness.controlPlaneDiagnostics
      .publicationActiveGateHandoff.missingPublishedNodeIds,
    ['node-3'],
  );
  assert.equal(
    resolvedWithReadiness.controlPlaneDiagnostics
      .publicationActiveGateHandoff.reasonCode,
    'owner_reconcile_pending',
  );

  // 2. Ordinary AdminWebSocketAPI snapshot query & service discovery entrypoints
  await api.buildLocalControlSnapshot();
  await api.buildControlSnapshotQueryResult();
  await api.executeLocalQueryEnvelope(
    {
      queryId: 'q-ordinary-degraded-snapshot',
      sql: 'SELECT * FROM control_snapshot_local()',
      params: [],
    },
    {clientInfo: {lane: 'snapshot'}},
  );
  await api.resolveServiceDiscoverySnapshot();

  // 3. Bounded probe deadline expiration on ordinary observation
  const originalResolve =
    api.controlSnapshot.resolveLocalControlSnapshot.bind(api.controlSnapshot);
  api.controlSnapshot.resolveLocalControlSnapshot = async (options = {}) => {
    await new Promise((resolve) => setTimeout(resolve, 25));
    return originalResolve(options);
  };
  await api.controlSnapshot.buildControlSnapshotQueryResult({queryTimeoutMs: 6});
  api.controlSnapshot.resolveLocalControlSnapshot = originalResolve;

  // 4. Drain delayed tasks (virtual clock timers, real timers, and microtasks/immediates)
  f.clock.advance(60_000);
  for (let step = 0; step < 40; step += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  await new Promise((resolve) => setTimeout(resolve, 35));
  await f.membership.reconcileQueue.awaitCurrentWorkIdle();

  assert.deepEqual(
    versions(),
    versionsBefore,
    'ordinary observations during degradation must not mutate SystemTableCache',
  );
  assert.deepEqual(f.cache.getTableRevisionWatermarks(), watermarksBefore);
  assert.equal(f.writes.length, writesBefore, 'no SQL writes from ordinary observation');
  assert.equal(f.hydrations.length, hydrationsBefore, 'no cache hydrations from ordinary observation');
  assert.deepEqual(counts, {
    scheduleDiscoveryRepair: 0,
    ensureDiscoveryRepair: 0,
    reconcileFromHandoff: 0,
    reconcileActiveGate: 0,
    reconcileClusterMembership: 0,
    enqueueMembershipReconcile: 0,
  });
  assert.equal(f.target().status, 'syncing');
  assert.equal(f.publication().priority_partition_summary.satisfied, false);
  assert.deepEqual(f.errors, []);

  // 5. Positive control on the same authority fixture: explicit forced control
  // snapshot repair and full nine-table discovery cache repair succeed without
  // authoritative_observation_read_incomplete and advance cache + publication.
  const forcedSnapshot =
    await api.controlSnapshot.resolveLocalControlSnapshot({
      forceAuthoritativeRepair: true,
    });
  assert.equal(f.target().status, 'active');
  assert.equal(
    forcedSnapshot.controlPlaneDiagnostics.publicationConvergence
      .priorityPartitionSummary.satisfied,
    true,
  );

  f.clock.advance(5000);
  const fullDiscoveryRepair =
    await api.serviceDiscovery.ensureAuthoritativeDiscoveryCacheRepair({
      bypassReuse: true,
    });
  assert.equal(fullDiscoveryRepair.applied, true);
  assert.equal(fullDiscoveryRepair.tableCount, 9);

  await api.controlSnapshot.triggerMembershipPublicationHandoffOwnerCommand(
    forcedSnapshot,
    {forceAuthoritativeRepair: true},
  );
  await f.membership.reconcileClusterMembership({
    reason: 'verify_repair_capable',
  });
  assert.deepEqual(
    JSON.parse(f.publication().published_active_node_ids),
    ['node-1', 'node-2', 'node-3'],
  );
  assert.equal(f.publication().priority_partition_summary.satisfied, true);
});
