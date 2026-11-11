// Witness for a publication epoch admitted through a handoff-routed reconcile
// (which plans without the service and partition rows a priority census is
// derived from), driven from the production entry point
// AdminControlSnapshot.reconcileAuthoritativeMembershipPublicationFromHandoff
// with the real coordinator and the real publications owner over real SQLite.
//
// The durable row before the reconcile carries a census (a spread gap). The
// handoff publishes a third node at a new epoch. The admitted row must state
// that its census was NOT DERIVED at this epoch (it never carries no
// summary), every reader of the spread rule must hold on it, and the owner's
// own next full reconcile must derive the census without any observer.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {AdminWebSocketAPI} from '../../src/admin/admin-websocket-api.js';
import {TABLES} from '../../src/constants/index.js';
import {buildReadinessByNodeId} from
  '../../src/control-plane/active-node-projection.js';
import {
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  buildPublicationActiveGateHandoffContract,
} from '../../src/control-plane/publication-active-gate-handoff-contract.js';
import {
  buildPublicationActiveGateMembershipConvergence,
} from '../../src/control-plane/publication-active-gate-handoff-contract-helpers.js';
import {
  MEMBERSHIP_PUBLICATION_READ_SOURCE,
} from '../../src/control-plane/membership-publication-row-contract.js';
import {
  PRIORITY_PARTITION_CENSUS_STATE,
  readPriorityPartitionCensusState,
  statePriorityPartitionSummary,
} from '../../src/control-plane/membership-publication-priority-partition-summary.js';
import {
  PUBLICATION_RECOVERY_GATE_STATE,
  buildPublicationRecoveryGateSnapshot,
} from '../../src/control-plane/publication-recovery-gate.js';
import {
  resolvePrioritySpreadPending,
} from '../../src/control-plane/publication-recovery-priority-spread.js';
import {decideServeEligibility} from
  '../../src/control-plane/serve-eligibility-record-decision.js';
import {normalizeControlPlanePublicationRow} from
  '../../src/control-plane/system-row-normalizers.js';
import {
  resetFixtureSingletons,
  clearFixtureSingletons,
} from '../test-helpers/participant-transaction-fixture.js';
import {autonomousHandoffFixture} from
  './completed-placement-autonomous-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const NODES = Object.freeze(['node-1', 'node-2', 'node-3']);
const PUBLISHED = Object.freeze(['node-1', 'node-2']);
const RECOVERY_PENDING =
  CONTROL_PLANE_READINESS_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING;
const SETTLE_TURNS = 30;

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

// The handoff as its producers build it: the owner's planning snapshot and
// the readiness owner's entries.
async function buildProductionHandoff(f) {
  const planningSnapshot = await f.membership.readPublicationPlanningSnapshot({
    readSource: MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED,
  });
  return buildPublicationActiveGateHandoffContract({
    nodeRows: planningSnapshot.nodeRows,
    readinessByNodeId: buildReadinessByNodeId({
      readinessEntries: await f.readiness.getAllNodeReadiness({
        allowAuthoritativeRefresh: true,
      }),
    }),
    publicationConvergence:
      buildPublicationActiveGateMembershipConvergence(planningSnapshot),
  });
}

async function settle() {
  for (let turn = 0; turn < SETTLE_TURNS; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function durablePublicationRows(f) {
  return f.db.prepare(
    `SELECT * FROM ${TABLES.CONTROL_PLANE_PUBLICATIONS} ` +
      'ORDER BY publication_epoch ASC',
  ).all();
}

// The committed row as CDC delivers it to this node's cache.
function deliverLatestPublicationToCache(f) {
  const row = durablePublicationRows(f).at(-1);
  f.cache.applySystemTableChange(TABLES.CONTROL_PLANE_PUBLICATIONS, 'INSERT',
    row);
  return row;
}

async function readinessReasonCodes(f, nodeId) {
  const entries = await f.readiness.getAllNodeReadiness();
  const entry = buildReadinessByNodeId({readinessEntries: entries})[nodeId];
  return entry.reasons.map((reason) => reason.code);
}

function serveReasons(f, publicationRow, nodeId) {
  return decideServeEligibility({
    nodeId,
    nodeRow: f.db.prepare(
      `SELECT * FROM ${TABLES.NODES} WHERE node_id = ?`).get(nodeId),
    publication: normalizeControlPlanePublicationRow(publicationRow),
    readAtMs: f.clock.now(),
    isNodeLoadReady: () => true,
  }).reasons;
}

test('a handoff-routed admission states its census NOT DERIVED, every spread reader holds on it, and the owner derives it on its own', async (t) => {
  const f = await autonomousHandoffFixture(t,
    {publishedActiveNodeIds: [...PUBLISHED]});
  const api = createProductionAdminComposition(t, f);
  // Only the handoff under test and what the owner itself schedules run: the
  // periodic driver's timer is off; its tick body is called in the last phase.
  f.clock.clearInterval(f.membership.ownerMembershipDriverTimer);
  f.blocked = false;
  const before = durablePublicationRows(f);
  assert.equal(before.length, 1);
  const censusBefore = JSON.parse(before[0].priority_partition_summary);
  assert.equal(censusBefore.satisfied, false,
    'the durable row carries a census with a spread gap');
  const handoff = await buildProductionHandoff(f);
  assert.deepEqual(handoff.missingPublishedNodeIds, ['node-3']);

  // The census inputs cannot be read while the handoff runs and after it:
  // the admitted row is what every reader has until the owner can derive.
  f.blocked = true;
  const outcome = await api.controlSnapshot
    .reconcileAuthoritativeMembershipPublicationFromHandoff(handoff);
  await settle();
  assert.equal(outcome.state, 'published_visible');

  const rows = durablePublicationRows(f);
  assert.equal(rows.length, 2, 'one new epoch was admitted');
  const admitted = rows[1];
  assert.equal(admitted.publication_epoch, before[0].publication_epoch + 1);
  assert.deepEqual(JSON.parse(admitted.published_active_node_ids), NODES);
  assert.notEqual(admitted.priority_partition_summary, null,
    'an admitted epoch never carries no priority summary');
  const admittedSummary =
    normalizeControlPlanePublicationRow(admitted).priorityPartitionSummary;
  assert.equal(readPriorityPartitionCensusState(admittedSummary),
    PRIORITY_PARTITION_CENSUS_STATE.NOT_DERIVED,
    'the admitted row states that its census was not derived at this epoch');

  // Every reader of the spread rule holds on the not-derived census.
  assert.equal(
    resolvePrioritySpreadPending({priorityPartitionSummary: admittedSummary}),
    true, 'the one spread rule reads not-derived as pending');
  const admittedRow = normalizeControlPlanePublicationRow(admitted);
  const gate = buildPublicationRecoveryGateSnapshot({
    publicationEpoch: admittedRow.publicationEpoch,
    publicationStatus: admittedRow.status,
    requiredAckNodeIds: admittedRow.requiredAckNodeIds,
    acknowledgedNodeIds: admittedRow.acknowledgedNodeIds,
    priorityPartitionSummary: admittedSummary,
    recoveryProtocolState:
      admittedRow.membershipLifecycleSummary.recoveryProtocolState,
    priorityRecoveryReasonCodes:
      admittedRow.membershipLifecycleSummary.recoveryProtocolReasonCodes,
  });
  assert.equal(gate.prioritySpreadPending, true,
    'the publication recovery gate reads the admitted row as spread pending');
  assert.notEqual(gate.state, PUBLICATION_RECOVERY_GATE_STATE.READY,
    'the publication recovery gate is not READY on the admitted row');
  assert.deepEqual(serveReasons(f, admitted, 'node-1'),
    ['priority_spread_unstated'],
    'serve eligibility names the unstated spread and nothing else');
  deliverLatestPublicationToCache(f);
  for (const nodeId of NODES) {
    assert.ok((await readinessReasonCodes(f, nodeId)).includes(RECOVERY_PENDING),
      `${nodeId}: the readiness owner reports recovery pending`);
  }

  // The owner derives the census itself once its inputs can be read, with
  // no handoff and no observer call: the census request the handoff made
  // is retried by the owner queue, and the owner driver's tick asks too.
  f.blocked = false;
  // The fixture runs no Raft group: this node is the publications partition's
  // live leader at the leadership seam the driver reads.
  f.cdc.canWriteSystemTableLocally = (tableName) =>
    tableName === TABLES.CONTROL_PLANE_PUBLICATIONS;
  await f.membership.driveOwnerMembershipReconcile();
  await settle();
  await f.membership.reconcileQueue.awaitCurrentWorkIdle();
  const derived = durablePublicationRows(f).at(-1);
  assert.equal(derived.publication_epoch, admitted.publication_epoch,
    'the census is derived on the admitted epoch, not a new one');
  const derivedSummary =
    normalizeControlPlanePublicationRow(derived).priorityPartitionSummary;
  assert.equal(readPriorityPartitionCensusState(derivedSummary),
    PRIORITY_PARTITION_CENSUS_STATE.DERIVED);
  assert.equal(derivedSummary.satisfied, true,
    'the derived census is the committed rows\' (all three voters active)');
  deliverLatestPublicationToCache(f);
  for (const nodeId of NODES) {
    assert.ok(!(await readinessReasonCodes(f, nodeId)).includes(RECOVERY_PENDING),
      `${nodeId}: the gate clears on the derived census`);
  }
  assert.deepEqual(f.errors, []);
});

// End to end on the owner driver's tick. Two things in the tick lead to the
// full reconcile here: the driver's own request for the census, and its
// authoritative cache catch-up, whose change event wakes the owner queue
// through the priority-recovery owner. The request alone is pinned at unit
// level (priority-partition-census-state.test.js).
test('one owner driver tick derives the census of a durable row that states NOT DERIVED when no request for it is queued (a new publications leader)', async (t) => {
  const f = await autonomousHandoffFixture(t);
  f.clock.clearInterval(f.membership.ownerMembershipDriverTimer);
  f.blocked = false;
  // The durable row as a handoff-routed admission left it; this coordinator
  // never ran that handoff (its queue holds no census request).
  f.db.prepare(
    `UPDATE ${TABLES.CONTROL_PLANE_PUBLICATIONS} SET priority_partition_summary = ?`,
  ).run(JSON.stringify(statePriorityPartitionSummary(null)));
  // No change event reaches this node (nothing wakes its owner queue): only
  // the driver's own authoritative read sees the durable row.
  await settle();
  assert.equal(f.membership.reconcileQueue.size, 0);
  const writesBefore = f.writes.length;
  assert.equal(readPriorityPartitionCensusState(
    normalizeControlPlanePublicationRow(durablePublicationRows(f).at(-1))
      .priorityPartitionSummary), PRIORITY_PARTITION_CENSUS_STATE.NOT_DERIVED,
  'nothing has derived the census before the driver ticks');

  f.cdc.canWriteSystemTableLocally = (tableName) =>
    tableName === TABLES.CONTROL_PLANE_PUBLICATIONS;
  await f.membership.driveOwnerMembershipReconcile();
  await settle();
  await f.membership.reconcileQueue.awaitCurrentWorkIdle();

  const derived = durablePublicationRows(f).at(-1);
  const derivedSummary =
    normalizeControlPlanePublicationRow(derived).priorityPartitionSummary;
  assert.equal(readPriorityPartitionCensusState(derivedSummary),
    PRIORITY_PARTITION_CENSUS_STATE.DERIVED,
    'one driver tick led to the full reconcile that derived the census');
  assert.equal(derivedSummary.satisfied, true);
  assert.equal(durablePublicationRows(f).length, 1, 'no new epoch');
  assert.ok(f.writes.length > writesBefore);

  // With the census derived the driver asks for nothing further.
  const writesAfter = f.writes.length;
  await f.membership.driveOwnerMembershipReconcile();
  await settle();
  assert.equal(f.membership.reconcileQueue.size, 0);
  assert.equal(f.writes.length, writesAfter);
  assert.deepEqual(f.errors, []);
});
