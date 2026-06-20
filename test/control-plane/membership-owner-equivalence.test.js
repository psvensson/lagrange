// Phase 0 PIVOT — deterministic owner-rule equivalence test.
//
// The live divergence probe (gates 1-4) could not give a clean quiescence verdict
// because it rides the event-triggered candidate derivation, which goes dark once
// membership is stable. This test answers the flip's actual safety question
// directly and deterministically: does the minimal single-owner rule
// (`computeShadowActiveMemberSet`) reproduce the AUTHORITATIVE published set at
// converged states? Fixtures are extracted from real rolling-restart gate reports
// (postRebalanceClosure publicationConvergence), including non-trivial
// freeze + unreachable states.
import {readFileSync} from 'node:fs';
import {test} from '../../src/test-helpers/tap.js';
import {computeShadowActiveMemberSet} from '../../src/control-plane/membership-owner-shadow.js';

const FIXTURES = JSON.parse(
  readFileSync(
    new URL('./fixtures/membership-owner-converged-fixtures.json', import.meta.url),
  ),
).fixtures;

const PROMOTABLE = Object.freeze({
  dimensions: {
    cluster_member_healthy: true,
    control_plane_writable: true,
    repair_eligible: true,
    serve_eligible: true,
  },
});
const UNPROMOTABLE = Object.freeze({dimensions: {cluster_member_healthy: false}});

function readinessFor(nodeIds, excludedNodeIds) {
  const excluded = new Set(excludedNodeIds);
  return Object.fromEntries(
    nodeIds.map((n) => [n, excluded.has(n) ? UNPROMOTABLE : PROMOTABLE]),
  );
}

test('equivalence: owner rule reproduces the authoritative published set on every converged fixture, from every node perspective', (t) => {
  t.ok(FIXTURES.length >= 10, `have a real fixture corpus (${FIXTURES.length})`);
  for (const fx of FIXTURES) {
    const auth = [...fx.authoritativePublishedActiveNodeIds].sort();
    const readiness = readinessFor(auth, fx.readinessExcludedNodeIds);
    for (const localNodeId of auth) {
      const got = computeShadowActiveMemberSet({
        publishedBaselineNodeIds: auth,
        readinessByNodeId: readiness,
        memberStatesByNodeId: fx.memberStatesByNodeId,
        localNodeId,
      });
      t.same(
        got,
        auth,
        `${fx.source} [freeze=${fx.membershipFreezeActive}] local=${localNodeId.slice(0, 8)}`,
      );
    }
  }
  t.end();
});

test('equivalence holds under the safety-freeze + unreachable fixtures (baseline-retention == freeze-retention)', (t) => {
  const frozen = FIXTURES.filter(
    (fx) =>
      fx.membershipFreezeActive === true &&
      Object.values(fx.memberStatesByNodeId).includes('unreachable'),
  );
  t.ok(frozen.length >= 1, `corpus contains freeze+unreachable states (${frozen.length})`);
  for (const fx of frozen) {
    const auth = [...fx.authoritativePublishedActiveNodeIds].sort();
    const got = computeShadowActiveMemberSet({
      publishedBaselineNodeIds: auth,
      readinessByNodeId: readinessFor(auth, fx.readinessExcludedNodeIds),
      memberStatesByNodeId: fx.memberStatesByNodeId,
      localNodeId: auth[0],
    });
    // The owner rule retains published-baseline nodes (incl. transiently
    // unreachable ones) — exactly the projection's freeze-retention behavior —
    // so it does NOT trim a quorum under broad suspicion.
    t.same(got, auth, `${fx.source}: owner retains the frozen published set`);
  }
  t.end();
});

test('discrimination: a draining node is dropped even though it is in the published baseline', (t) => {
  const base = FIXTURES.find(
    (fx) => Object.values(fx.memberStatesByNodeId).every((s) => s === 'serving'),
  ) || FIXTURES[0];
  const auth = [...base.authoritativePublishedActiveNodeIds].sort();
  const draining = auth[0];
  const got = computeShadowActiveMemberSet({
    publishedBaselineNodeIds: auth,
    readinessByNodeId: readinessFor(auth, []),
    memberStatesByNodeId: {...base.memberStatesByNodeId, [draining]: 'draining'},
    localNodeId: auth[1],
  });
  t.notOk(got.includes(draining), 'draining node excluded');
  t.same(got, auth.filter((n) => n !== draining));
  t.end();
});

test('self-knowledge: an alive write-leader not yet in the published baseline is still included', (t) => {
  // The gate-1 dominant divergence: projection transiently excludes self; the
  // owner rule must keep self (the node is alive and computing the candidate).
  const got = computeShadowActiveMemberSet({
    publishedBaselineNodeIds: ['peer-a', 'peer-b'],
    readinessByNodeId: readinessFor(['peer-a', 'peer-b'], []),
    localNodeId: 'leader-self',
  });
  t.ok(got.includes('leader-self'), 'self-knowledge includes the local node');
  t.same(got, ['leader-self', 'peer-a', 'peer-b']);
  t.end();
});

test('known Phase 1 gap (documented): the owner rule does NOT trim an unreachable baseline node outside freeze', (t) => {
  // When the authoritative projection TRIMS an unreachable node (non-freeze), the
  // owner rule currently retains it via the baseline — the residual onlyInShadow
  // direction. This is the remaining Phase 1 reconciliation item (port the
  // non-freeze trim semantics); asserted here so the gap is explicit, not silent.
  const got = computeShadowActiveMemberSet({
    publishedBaselineNodeIds: ['a', 'b', 'gone'],
    readinessByNodeId: {
      a: PROMOTABLE,
      b: PROMOTABLE,
      gone: UNPROMOTABLE,
    },
    memberStatesByNodeId: {gone: 'unreachable'},
    localNodeId: 'a',
  });
  t.ok(got.includes('gone'), 'unreachable baseline node is currently retained (known gap)');
  t.end();
});
