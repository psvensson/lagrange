import t from 'tap';
import {
  MembershipPublicationCoordinatorReconcile,
  NOT_PUBLICATIONS_WRITE_LEADER_REASON,
  shouldDeferMembershipReconcileToWriteLeader,
} from '../../src/control-plane/membership-publication-coordinator-reconcile.js';

// Phase 4 leader-driven gate (unconditional since 2026-07-02): defer the
// membership reconcile unless a working predicate proves this node IS the
// write-leader. Fail CLOSED when the predicate is missing or throws.

t.test('no predicate -> fail closed (defers reconcile)', async (t) => {
  const coordinator = new MembershipPublicationCoordinatorReconcile({
    nodeId: 'N1',
    resolveIsControlPlanePublicationsWriteLeader: null,
  });
  t.equal(
    shouldDeferMembershipReconcileToWriteLeader(coordinator),
    true,
  );
  const result = await coordinator.reconcileClusterMembership();
  t.equal(result.deferred, true);
  t.equal(result.reason, NOT_PUBLICATIONS_WRITE_LEADER_REASON);
});

t.test('predicate wired', async (t) => {
  t.equal(
    shouldDeferMembershipReconcileToWriteLeader({
      resolveIsControlPlanePublicationsWriteLeader: () => true,
    }),
    false,
    'this node IS write-leader -> drive (do not defer)',
  );
  t.equal(
    shouldDeferMembershipReconcileToWriteLeader({
      resolveIsControlPlanePublicationsWriteLeader: () => false,
    }),
    true,
    'this node is NOT write-leader -> defer',
  );
});

t.test('throwing predicate -> fail closed (defers reconcile)', async (t) => {
  const coordinator = new MembershipPublicationCoordinatorReconcile({
    nodeId: 'N1',
    resolveIsControlPlanePublicationsWriteLeader: () => {
      throw new Error('leadership unknown');
    },
  });
  t.equal(
    shouldDeferMembershipReconcileToWriteLeader(coordinator),
    true,
    'predicate error must fail closed and defer the reconcile',
  );
  const result = await coordinator.reconcileClusterMembership();
  t.equal(result.deferred, true);
  t.equal(result.reason, NOT_PUBLICATIONS_WRITE_LEADER_REASON);
});
