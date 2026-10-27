/**
 * A spent wait is a failure, and is visible: the owner-driven membership
 * reconcile (driveOwnerMembershipReconcile) races its drive against
 * OWNER_MEMBERSHIP_RECONCILE_TIMEOUT_MS. When the bound is spent it logs
 * exactly one wait_bound_spent ERROR naming the deficit it was driving, and
 * none when the drive wins the race. The post-expiry behaviour is unchanged:
 * the drive still answers true and the transition warn still reports
 * reconcileTimedOut.
 *
 * Fake timers (node:test mock.timers) spend the bound; nothing waits on
 * wall time.
 */

import {mock} from 'node:test';
import {test} from '../../src/test-helpers/tap.js';
import {
  MembershipPublicationCoordinatorReconcile,
} from '../../src/control-plane/membership-publication-coordinator-reconcile.js';
import {captureLogger} from '../test-helpers/wait-bound-spent-capture.js';

const RECONCILE_TIMEOUT_MS = 15_000;
const START_MS = 2_000_000;
const RECONCILE_WAIT = 'OWNER_MEMBERSHIP_RECONCILE_TIMEOUT_MS';
const drive =
  MembershipPublicationCoordinatorReconcile.prototype.driveOwnerMembershipReconcile;

// An OPEN publication awaiting one recovery-eligible ack: zero published-set
// deficit, one ack-completion node, so the owner drives (CL-001 variant A).
function ownerContext(nodeId, reconcile) {
  const capture = captureLogger();
  const ctx = {
    nodeId,
    systemTableCache: {
      get: (table, key) =>
        table === 'partitions' && key === 'control_plane_publications-p1' ?
          {leader_node_id: nodeId} :
          null,
      find: () => null,
    },
    assertSingleMembershipPartition: () => {},
    now: () => 1,
    reconcileActiveGateMembershipPublication: reconcile,
    readPublicationPlanningSnapshot: async () => ({
      nodeRows: [],
      readinessByNodeId: {
        peer: {dimensions: {controlPlaneRecoveryEligible: true}},
      },
      latestPublicationRow: {
        publicationEpoch: 20,
        status: 'OPEN',
        publishedActiveNodeIds: [nodeId, 'peer'],
        requiredAckNodeIds: [nodeId, 'peer'],
        acknowledgedNodeIds: [nodeId],
      },
      latestPublishedPublicationRow: null,
    }),
    logger: capture.logger,
    _emitConvergenceDecisionTrace: () => {},
    _buildPublicationReadinessTraceFields: () => ({}),
    refreshDeferredPublicationsCacheFromAuthority: async () => {},
    refreshDeferredPropagatedCachesFromAuthority: async () => {},
  };
  return {ctx, capture};
}

async function flushMicrotasks(rounds = 50) {
  for (let round = 0; round < rounds; round += 1) {
    await Promise.resolve();
  }
}

test('a spent owner reconcile bound logs one wait_bound_spent ERROR and the ' +
  'drive still answers as before', async (t) => {
  mock.timers.enable({apis: ['setTimeout', 'Date'], now: START_MS});
  t.teardown(() => mock.timers.reset());
  const {ctx, capture} = ownerContext('owner-reconcile-spent-a',
    () => new Promise(() => {}));

  const drove = drive.call(ctx);
  await flushMicrotasks();
  mock.timers.tick(RECONCILE_TIMEOUT_MS);
  t.equal(await drove, true, 'the drive still answers true at its bound');

  const spent = capture.spent();
  t.equal(spent.length, 1, 'exactly one wait_bound_spent');
  const context = spent[0].context;
  t.equal(context.wait, RECONCILE_WAIT, 'names the wait');
  t.equal(context.boundMs, RECONCILE_TIMEOUT_MS, 'names the bound');
  t.equal(context.elapsedMs, RECONCILE_TIMEOUT_MS,
    'elapsed measured on the race clock');
  t.same(context.lastObserved, {
    missingCount: 0,
    ownerAckCompletionPendingCount: 1,
    publicationEpoch: 20,
    leadershipTier: context.lastObserved.leadershipTier,
  }, 'names the deficit the drive was carrying');
  t.equal(context.scope.nodeId, 'owner-reconcile-spent-a');
  const warn = capture.warns().find((line) =>
    line.context?.reconcileTimedOut !== undefined);
  t.equal(warn?.context.reconcileTimedOut, true,
    'the transition warn still reports the timed-out drive');
  t.equal(capture.errors().length, 1, 'no other ERROR');
});

test('an owner reconcile that resolves inside its bound logs no ' +
  'wait_bound_spent', async (t) => {
  mock.timers.enable({apis: ['setTimeout', 'Date'], now: START_MS});
  t.teardown(() => mock.timers.reset());
  const {ctx, capture} = ownerContext('owner-reconcile-spent-b',
    async () => {});

  t.equal(await drive.call(ctx), true, 'the drive answers true');
  mock.timers.tick(RECONCILE_TIMEOUT_MS);
  t.equal(capture.spent().length, 0, 'no wait_bound_spent');
  const warn = capture.warns().find((line) =>
    line.context?.reconcileTimedOut !== undefined);
  t.equal(warn?.context.reconcileTimedOut, false);
});
