import t from 'tap';
import {
  shouldDeferMembershipReconcileToWriteLeader,
} from '../../src/control-plane/membership-publication-coordinator-reconcile.js';

// Phase 4 leader-driven gate: defer the membership reconcile only when enabled
// AND a working predicate says this node is NOT the write-leader. Fail OPEN
// otherwise so default behavior is unchanged.

t.test('disabled -> never defers (default behavior unchanged)', async (t) => {
  t.equal(
    shouldDeferMembershipReconcileToWriteLeader({
      membershipLeaderDrivenEnabled: false,
      resolveIsControlPlanePublicationsWriteLeader: () => false,
    }),
    false,
    'flag off -> no gating even if predicate says not-leader',
  );
});

t.test('enabled, no predicate -> fail open (never blocks)', async (t) => {
  t.equal(
    shouldDeferMembershipReconcileToWriteLeader({
      membershipLeaderDrivenEnabled: true,
      resolveIsControlPlanePublicationsWriteLeader: null,
    }),
    false,
  );
});

t.test('enabled + predicate', async (t) => {
  t.equal(
    shouldDeferMembershipReconcileToWriteLeader({
      membershipLeaderDrivenEnabled: true,
      resolveIsControlPlanePublicationsWriteLeader: () => true,
    }),
    false,
    'this node IS write-leader -> drive (do not defer)',
  );
  t.equal(
    shouldDeferMembershipReconcileToWriteLeader({
      membershipLeaderDrivenEnabled: true,
      resolveIsControlPlanePublicationsWriteLeader: () => false,
    }),
    true,
    'this node is NOT write-leader -> defer',
  );
});

t.test('enabled + throwing predicate -> fail open (never blocks)', async (t) => {
  t.equal(
    shouldDeferMembershipReconcileToWriteLeader({
      membershipLeaderDrivenEnabled: true,
      resolveIsControlPlanePublicationsWriteLeader: () => {
        throw new Error('leadership unknown');
      },
    }),
    false,
    'predicate error must never strand the reconcile',
  );
});
