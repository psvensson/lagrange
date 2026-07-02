import t from 'tap';
import {
  shouldDeferMembershipReconcileToWriteLeader,
} from '../../src/control-plane/membership-publication-coordinator-reconcile.js';

// Phase 4 leader-driven gate (unconditional since 2026-07-02): defer the
// membership reconcile only when a working predicate says this node is NOT the
// write-leader. Fail OPEN otherwise so a coordinator wired without the
// predicate reconciles as before.

t.test('no predicate -> fail open (never blocks)', async (t) => {
  t.equal(
    shouldDeferMembershipReconcileToWriteLeader({
      resolveIsControlPlanePublicationsWriteLeader: null,
    }),
    false,
  );
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

t.test('throwing predicate -> fail open (never blocks)', async (t) => {
  t.equal(
    shouldDeferMembershipReconcileToWriteLeader({
      resolveIsControlPlanePublicationsWriteLeader: () => {
        throw new Error('leadership unknown');
      },
    }),
    false,
    'predicate error must never strand the reconcile',
  );
});
