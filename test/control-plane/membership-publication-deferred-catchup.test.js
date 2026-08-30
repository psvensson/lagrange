import {test} from '../../src/test-helpers/tap.js';
import {MembershipPublicationCoordinatorReconcile} from
  '../../src/control-plane/membership-publication-coordinator-reconcile.js';
import {buildMembershipPublicationRow} from
  '../../src/control-plane/membership-publication-planning-evidence.js';
import {MEMBERSHIP_PUBLICATION_STATUS} from
  '../../src/control-plane/membership-publication-row-contract.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {hydrateCdcPropagatedTablesFromAuthority} from
  '../../src/cdc/cdc-integration-service-authoritative-catchup.js';
import {applyCDCIntegrationServiceCacheVisibilityWait} from
  '../../src/cdc/cdc-integration-service-cache-visibility-wait.js';
import {AUTHORITATIVE_READ_SOURCE} from
  '../../src/cdc/cdc-integration-service-shared-constants.js';
import {TABLES} from '../../src/constants/index.js';
import {CDC_PROPAGATED_TABLES} from '../../src/cache/cdc-table-policy.js';
import {buildControlPlaneReadAuthority} from
  '../../src/control-plane/control-plane-system-table-gateway-read-contracts.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';

// CL-001 variant D — a non-write-leader's control_plane_publications cache is fed
// only by the leader's point-in-time CDC fan-out (leader-gated, no replay). A node
// that missed the fan-out window stays permanently stale: getLatestPublicationRowSync
// freezes at a stale epoch while the cluster advances, surfacing as the harness
// `publication_epochs_disagree` consistency mismatch. The fix makes a DEFERRING
// non-write-leader pull its publications cache forward from the authoritative owner
// (reusing the CL-014 catch-up), rate-limited so it does not read on every tick.
//
// These falsifiers drive the REAL reconcileClusterMembership defer branch, the REAL
// refreshDeferredPublicationsCacheFromAuthority, the REAL CL-014 hydrate, the REAL
// cache-repair mixin + cache merge, and the REAL getLatestPublicationRowSync read —
// the only stub is the authoritative read transport (the owner-RPC lane boundary).

const PUBLICATIONS = TABLES.CONTROL_PLANE_PUBLICATIONS;
const MEMBERS = Object.freeze(['N1', 'N2', 'N3']);

function publicationRow(epoch, nowMs) {
  return buildMembershipPublicationRow({
    candidate: {
      publicationEpoch: epoch,
      publishedActiveNodeIds: MEMBERS,
      publisherNodeId: 'N1',
      requiredAckNodeIds: MEMBERS,
      acknowledgedNodeIds: MEMBERS,
    },
    status: MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED,
    nowMs,
    publicationId: `pub-${epoch}`,
  });
}

// Real applyAuthoritativeCacheRepair / applyAuthoritativeCacheSweep via the
// production mixin (not a hand-rolled mock) bound to a real SystemTableCache.
class CacheRepairHost {}
applyCDCIntegrationServiceCacheVisibilityWait(CacheRepairHost);

function makeAuthorityService(cache, authorityRows) {
  const service = Object.create(CacheRepairHost.prototype);
  service.cacheMutationTarget = cache;
  service.getPrimaryKeyField = () => 'publication_id';
  service.executeAuthoritativeSystemTableRead = async () => ({
    success: true,
    source: AUTHORITATIVE_READ_SOURCE.OWNER_RPC_LANE,
    rows: authorityRows,
  });
  service.logger = {warn() {}, info() {}, debug() {}, error() {}};
  // The method form the coordinator invokes (CDCIntegrationService exposes this).
  service.hydrateCdcPropagatedTablesFromAuthority = (opts) =>
    hydrateCdcPropagatedTablesFromAuthority(service, opts);
  return service;
}

function makeDeferringCoordinator({cache, cdcIntegrationService, now}) {
  const coordinator = Object.create(MembershipPublicationCoordinatorReconcile.prototype);
  coordinator.nodeId = 'N1';
  coordinator.logger = {warn() {}, info() {}, debug() {}, error() {}};
  coordinator.buildOwnerKey = () => 'owner-key';
  coordinator._emitConvergenceDecisionTrace = () => {};
  // Force the not-write-leader defer branch.
  coordinator.resolveIsControlPlanePublicationsWriteLeader = () => false;
  coordinator.now = now || (() => 1000);
  coordinator.systemTableCache = cache;
  coordinator.cdcIntegrationService = cdcIntegrationService;
  return coordinator;
}

// A follower exercised through the REAL periodic owner-driver
// (driveOwnerMembershipReconcile). resolveControlPlanePublicationsLeadership reads
// canWriteSystemTableLocally (false here) then the cache PARTITIONS/SERVICES leader
// rows (absent on a publications-only cache) → resolves isLeader=false, the !isLeader
// branch this fix targets. No reconcileQueue / demand-driven reason is enqueued — the
// only thing that can advance a steady follower's stale epoch is this periodic tick.
function makeFollowerDriverCoordinator({cache, cdcIntegrationService, now}) {
  const coordinator = makeDeferringCoordinator({cache, cdcIntegrationService, now});
  coordinator.ownerMembershipReconcileInFlight = false;
  coordinator.ownerDriverPredicateSnapshot = undefined;
  coordinator.ownerDriverSnapSnapshot = undefined;
  return coordinator;
}

test('CL-001 variant D: a deferring non-write-leader pulls its stale publications ' +
  'cache forward to the cluster-committed epoch (end-to-end through the real path)',
async (t) => {
  const cache = new SystemTableCache();
  // This node only ever saw epoch 19 — it missed the fan-out for epochs 20..40.
  cache.applySystemTableChange(
    PUBLICATIONS, 'UPSERT', publicationRow(19, 1000), {causeId: 'seed-stale'});
  // The authoritative owner (current write-leader) is at epoch 40.
  const service = makeAuthorityService(cache, [publicationRow(40, 2000)]);
  const coordinator = makeDeferringCoordinator(
    {cache, cdcIntegrationService: service, now: () => 5000});

  t.equal(coordinator.getLatestPublicationRowSync().publicationEpoch, 19,
    'exposed epoch starts stale at 19 (missed the CDC fan-out window)');

  const result = await coordinator.reconcileClusterMembership();
  t.equal(result.deferred, true, 'a non-write-leader still defers the reconcile');

  t.equal(coordinator.getLatestPublicationRowSync().publicationEpoch, 40,
    'the defer path triggered the authoritative catch-up — exposed epoch converged ' +
    'to the cluster-committed epoch 40');
});

test('CL-001 variant D: the deferred catch-up is rate-limited to one authoritative ' +
  'read per cooldown and scoped to control_plane_publications', async (t) => {
  let clock = 1000;
  const seen = [];
  const spyService = {
    hydrateCdcPropagatedTablesFromAuthority: (opts) => {
      seen.push(opts);
      return Promise.resolve(null);
    },
  };
  const coordinator = makeDeferringCoordinator(
    {cache: new SystemTableCache(), cdcIntegrationService: spyService, now: () => clock});

  const publicationsSweeps = () =>
    seen.filter((opts) => Array.isArray(opts?.tables) &&
      opts.tables.includes(PUBLICATIONS));

  await coordinator.reconcileClusterMembership();
  t.equal(publicationsSweeps().length, 1, 'the first defer triggers a catch-up');
  t.same(publicationsSweeps()[0], {
    tables: [PUBLICATIONS],
    readAuthority: buildControlPlaneReadAuthority({
      authoritativeReadMode:
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED,
      leaderMode: CONTROL_PLANE_READ_LEADER_MODE.PREFERRED,
    }),
  },
  'the catch-up is scoped to control_plane_publications only and routes through ' +
    'the authoritative owner pinned to the leader by one authority token');

  clock += 4000; // still within the 5000ms cooldown
  await coordinator.reconcileClusterMembership();
  t.equal(publicationsSweeps().length, 1,
    'a second defer within the cooldown does NOT issue another authoritative read');

  clock += 2000; // now past the cooldown since the last read
  await coordinator.reconcileClusterMembership();
  t.equal(publicationsSweeps().length, 2,
    'after the cooldown elapses the catch-up runs again');
});

// GCP run 2026-08-30T15-30-04: the one-shot join-time CL-014 catch-up hydrates every
// CDC-propagated table once; the publications sweep above re-reads publications only.
// A `services` row inserted 31 s AFTER a joiner's one-shot hydration, whose leader
// fan-out update was dropped ('No row found for CDC update', no repairing event),
// therefore never converged: that joiner's routing snapshot held
// canonicalLeaderServiceCount 0 for ten minutes and every distributed write it
// coordinated to the partition timed out. These falsifiers drive the REAL defer
// branch, the REAL sibling sweep and the REAL CL-014 hydrate.
test('late-services-row-converges-after-one-shot-hydration: a services row that ' +
  'landed after the one-shot hydration and missed its fan-out converges on the ' +
  'steady-state defer tick', async (t) => {
  const cache = new SystemTableCache();
  const lateServicesRow = {
    service_id: 'svc-tbl-d915-p1-leader',
    partition_id: 'tbl-d915-p1',
    node_id: '20de1da9',
    status: 'ACTIVE',
    role: 'leader',
  };
  const service = makeAuthorityService(cache, [lateServicesRow]);
  service.getPrimaryKeyField = () => 'service_id';
  const coordinator = makeDeferringCoordinator(
    {cache, cdcIntegrationService: service, now: () => 5000});

  t.equal(cache.getAll(TABLES.SERVICES).length, 0,
    'the joiner has no services row for the result-table partition (the fan-out ' +
    'update was dropped after its one-shot hydration)');

  const result = await coordinator.reconcileClusterMembership();
  t.equal(result.deferred, true, 'a non-write-leader still defers the reconcile');

  const rows = cache.getAll(TABLES.SERVICES);
  t.equal(rows.length, 1,
    'the steady-state defer tick hydrated the missed services row (RED before the ' +
    'fix: the sweep only ever re-read control_plane_publications)');
  t.equal(rows[0].partition_id, 'tbl-d915-p1',
    'the converged row is the canonical leader row the coordinator writes through');
});

test('steady-state-hydration-covers-routing-tables: the sibling sweep asks for ' +
  'the routing-relevant CDC-propagated tables, on its own cooldown, with the ' +
  'default catch-up read policy and one attempt per table', async (t) => {
  let clock = 1000;
  const seen = [];
  const spyService = {
    hydrateCdcPropagatedTablesFromAuthority: (opts) => {
      seen.push(opts);
      return Promise.resolve(null);
    },
  };
  const coordinator = makeDeferringCoordinator(
    {cache: new SystemTableCache(), cdcIntegrationService: spyService,
      now: () => clock});
  const propagatedSweeps = () =>
    seen.filter((opts) => Array.isArray(opts?.tables) &&
      !opts.tables.includes(PUBLICATIONS));

  await coordinator.reconcileClusterMembership();
  t.equal(propagatedSweeps().length, 1, 'the first defer runs the sibling sweep');
  const swept = propagatedSweeps()[0];
  t.ok(swept.tables.includes(TABLES.SERVICES),
    'the services table is swept (the witnessed gap)');
  t.ok(swept.tables.includes(TABLES.PARTITIONS) &&
    swept.tables.includes(TABLES.NODES),
  'the other routing tables a stale row can strand a write on are swept');
  t.equal(swept.tables.includes(PUBLICATIONS), false,
    'publications keeps its own tighter, leader-pinned sweep');
  t.equal(swept.readAuthority, undefined,
    'the sibling sweep uses the catch-up default local-first/owner-fallback policy, ' +
    'never the publications leader pin');
  t.ok(swept.tables.every((tableName) =>
    CDC_PROPAGATED_TABLES.includes(tableName)),
  'every swept table is a CDC-propagated table');
  t.equal(swept.maxAttemptsPerTable, 1,
    'a single attempt per table: a slow owner cannot stall the deferral tick ' +
    'behind retry sleeps');
  t.equal(swept.tables.includes('replica_operations'), false,
    'unbounded-growth tables are never swept (no routing benefit, full scans)');

  clock += 20000; // still within the 30000ms sibling cooldown
  await coordinator.reconcileClusterMembership();
  t.equal(propagatedSweeps().length, 1,
    'a defer within the sibling cooldown issues no second authoritative read');

  clock += 15000; // past the sibling cooldown
  await coordinator.reconcileClusterMembership();
  t.equal(propagatedSweeps().length, 2,
    'after the sibling cooldown elapses the sweep runs again');
});

test('propagated-sweep-never-throws: a failing authoritative read fails soft and ' +
  'still defers', async (t) => {
  const failing = {
    hydrateCdcPropagatedTablesFromAuthority: (opts) => (
      Array.isArray(opts?.tables) && opts.tables.includes(PUBLICATIONS) ?
        Promise.resolve(null) :
        Promise.reject(new Error('owner unreachable'))),
  };
  let clock = 5000;
  const coordinator = makeDeferringCoordinator(
    {cache: new SystemTableCache(), cdcIntegrationService: failing,
      now: () => clock});
  const result = await coordinator.reconcileClusterMembership();
  t.equal(result.deferred, true,
    'a rejected sibling sweep never breaks the defer path');
  clock += 40000; // past the sibling cooldown, so this call actually sweeps
  const outcome =
    await coordinator.refreshDeferredPropagatedCachesFromAuthority();
  t.equal(outcome.swept, false,
    'the failure is recorded and reported as a typed not-swept outcome');
  t.equal(outcome.reason, 'authoritative_read_failed',
    'the typed reason names the authoritative read failure (never a raw null)');
});

test('CL-001 variant D (re-diagnosis 2026-06-18): the PERIODIC owner-driver pulls a ' +
  'steady follower forward — the defer branch is unreachable without a demand-driven ' +
  'reconcile, so the periodic !isLeader tick is the only thing that closes the gap',
async (t) => {
  const cache = new SystemTableCache();
  // A follower that settled at a stale epoch 19 and is now "steady" — nothing left to
  // enqueue a reconcile reason, so reconcileClusterMembership (and its defer-branch
  // catch-up) is never called on demand again.
  cache.applySystemTableChange(
    PUBLICATIONS, 'UPSERT', publicationRow(19, 1000), {causeId: 'seed-stale'});
  const service = makeAuthorityService(cache, [publicationRow(40, 2000)]);
  // resolveControlPlanePublicationsLeadership consults this first; false → fall to the
  // cache tiers, which have no leader row for N1 → isLeader=false.
  service.canWriteSystemTableLocally = () => false;
  const coordinator = makeFollowerDriverCoordinator(
    {cache, cdcIntegrationService: service, now: () => 5000});

  t.equal(coordinator.getLatestPublicationRowSync().publicationEpoch, 19,
    'exposed epoch starts stale at 19 (a steady follower that missed the CDC fan-out)');

  const drove = await coordinator.driveOwnerMembershipReconcile();
  t.equal(drove, false,
    'the follower is not the publications write-leader — the periodic driver does NOT ' +
    'reconcile as owner');

  t.equal(coordinator.getLatestPublicationRowSync().publicationEpoch, 40,
    'the periodic !isLeader tick triggered the authoritative catch-up — the steady ' +
    'follower converged to the cluster-committed epoch 40 (RED before the fix: the ' +
    'driver returned at !isLeader without ever reaching the catch-up)');
});

test('CL-001 variant D DEEPER LAYER (2026-06-18): the catch-up routes through the ' +
  'authoritative OWNER, not the node\'s own (frozen) local publications replica — a ' +
  'follower whose local replica stopped applying committed entries still converges ' +
  '(RED on revert: a local-wins read re-serves the stale epoch forever)', async (t) => {
  const cache = new SystemTableCache();
  // The exposed cache AND the node's own local control_plane_publications replica are
  // BOTH frozen at epoch 19 (the publications leadership/handler split: the local
  // replica silently stopped applying committed entries). Only the authoritative OWNER
  // holds the current epoch 40. A local-wins catch-up read would re-read 19 forever.
  cache.applySystemTableChange(
    PUBLICATIONS, 'UPSERT', publicationRow(19, 1000), {causeId: 'seed-stale'});

  const service = Object.create(CacheRepairHost.prototype);
  service.cacheMutationTarget = cache;
  service.getPrimaryKeyField = () => 'publication_id';
  const reads = [];
  service.executeAuthoritativeSystemTableRead =
    async (_tableName, _sql, _params, options = {}) => {
      const owner = options.readAuthority?.authoritativeReadMode ===
        'owner_rpc_preferred';
      reads.push(owner ? 'owner' : 'local');
      return owner ?
        {
          success: true,
          source: AUTHORITATIVE_READ_SOURCE.OWNER_RPC_LANE,
          rows: [publicationRow(40, 2000)],
        } :
        {
          // The node's own local replica is frozen at the stale epoch.
          success: true,
          source: AUTHORITATIVE_READ_SOURCE.LOCAL_PARTITION_REPLICA,
          rows: [publicationRow(19, 1000)],
        };
    };
  service.logger = {warn() {}, info() {}, debug() {}, error() {}};
  service.hydrateCdcPropagatedTablesFromAuthority = (opts) =>
    hydrateCdcPropagatedTablesFromAuthority(service, opts);

  const coordinator = makeDeferringCoordinator(
    {cache, cdcIntegrationService: service, now: () => 5000});

  t.equal(coordinator.getLatestPublicationRowSync().publicationEpoch, 19,
    'exposed epoch starts stale at 19 (local replica frozen)');

  await coordinator.reconcileClusterMembership();

  t.equal(reads[0], 'owner',
    'the catch-up read was routed through the authoritative OWNER, not local-wins');
  t.equal(coordinator.getLatestPublicationRowSync().publicationEpoch, 40,
    'a follower whose own local replica is frozen still converged to the owner ' +
    'epoch 40 (RED on revert: a local-wins read returns the stale 19 forever)');
  // The owner read is the COMPLETE authoritative set, so the owner-only
  // anti-entropy sweep evicts the stale epoch-19 row (race-guarded, cache-local).
  // Convergence does not depend on the sweep, but pin the sweep contract so a
  // future regression that re-broadens eviction is caught.
  const remaining = cache.getAll(PUBLICATIONS);
  t.equal(remaining.length, 1,
    'the owner-read anti-entropy sweep evicted the stale epoch-19 row — only the ' +
    'current epoch remains');
  t.equal(remaining[0].publication_epoch, 40, 'the surviving row is epoch 40');
});

// A node that resolves as the publications WRITE-LEADER (Tier-0 raft-live via
// canWriteSystemTableLocally=true) drives the OWNER path of the periodic driver,
// NOT the follower catch-up branch. assertSingleMembershipPartition and the
// readiness-trace fields are out of scope here, so they are stubbed; the planning
// snapshot is injected to put the owner on the no-deficit (would-skip) branch.
function makeLeaderDriverCoordinator({cache, cdcIntegrationService, now, planningSnapshot}) {
  const coordinator = makeFollowerDriverCoordinator({cache, cdcIntegrationService, now});
  coordinator.assertSingleMembershipPartition = () => {};
  coordinator._buildPublicationReadinessTraceFields = () => ({});
  coordinator.readPublicationPlanningSnapshot = async () => planningSnapshot;
  return coordinator;
}

test('CL-001 variant D OWNER FACE (2026-06-19): a rejoined publications WRITE-LEADER ' +
  'that believes it is steady at a stale epoch re-validates against authority before ' +
  'skipping on no-deficit — the owner path had NO catch-up, so a frozen owner served ' +
  'its own stale epoch forever (RED on revert)', async (t) => {
  const cache = new SystemTableCache();
  // The owner rejoined and its own publications cache is frozen at epoch 19 while the
  // cluster advanced to 40 under a different owner-incarnation. Its owner-stream shows
  // desired=committed=observed=19 (it BELIEVES it is steady), so missing=0.
  cache.applySystemTableChange(
    PUBLICATIONS, 'UPSERT', publicationRow(19, 1000), {causeId: 'seed-stale'});
  const service = makeAuthorityService(cache, [publicationRow(40, 2000)]);
  // Tier-0 raft-live leadership → the owner driver takes the LEADER path.
  service.canWriteSystemTableLocally = () => true;
  // The owner's own planning snapshot shows NO published deficit at the stale epoch —
  // exactly the freeze: it thinks it is fully published and steady, so it would SKIP.
  const planningSnapshot = {
    latestPublishedPublicationRow: publicationRow(19, 1000),
    latestPublicationRow: publicationRow(19, 1000),
    nodeRows: [],
    readinessByNodeId: {},
  };
  const coordinator = makeLeaderDriverCoordinator(
    {cache, cdcIntegrationService: service, now: () => 5000, planningSnapshot});

  t.equal(coordinator.getLatestPublicationRowSync().publicationEpoch, 19,
    'the owner starts frozen at a stale epoch 19 (believes it is steady)');

  const drove = await coordinator.driveOwnerMembershipReconcile();
  t.equal(drove, false,
    'the owner sees no published deficit, so it does not reconcile this tick');

  t.equal(coordinator.getLatestPublicationRowSync().publicationEpoch, 40,
    'before trusting no-deficit, the owner re-validated against authority (owner-RPC) ' +
    'and its frozen cache converged to the committed epoch 40 (RED on revert: the owner ' +
    'path skipped without ever catching up, serving epoch 19 to the consistency probe ' +
    'forever as publication_epochs_disagree)');
});

test('CL-001 variant D: deferral stays safe when no CDC catch-up is available',
  async (t) => {
    const coordinator = makeDeferringCoordinator({
      cache: new SystemTableCache(),
      cdcIntegrationService: {},
      now: () => 1000,
    });
    const result = await coordinator.reconcileClusterMembership();
    t.equal(result.deferred, true,
      'defers cleanly with no catch-up available (no throw)');
  });
