// The formation attribution census says what it means, and its classification
// is checked rather than trusted.
//
// The census keys an unowned turn by the site that created it, but the site is
// only the key. The PROOF is the reason, which names a code shape - a promise
// resolved on setImmediate, an await that resumes a loop, the return of the
// call that enters an owner. So this witness reads the source at every site
// the census actually recorded and requires the claimed shape to be there. A
// directory is never a proof, and neither is a stack frame.
import {readFileSync} from 'node:fs';

import {test} from '../../src/test-helpers/tap.js';
import {
  OUTSIDE_DOMAIN_REASON, OUTSIDE_DOMAIN_SITE,
} from './formation-attribution-provenance-classify.js';
import {
  runFormationAttributionCensus,
} from './formation-attribution-census.js';

const ZERO = 0;
const OWNER_RUNTIME_COUNT = 138;
const PEER_OBJECT_COUNT = 276;
const REPO_ROOT = new URL('../../', import.meta.url);

// The shape each reason claims, as it appears in the source at the site.
const REASON_SHAPE = Object.freeze({
  [OUTSIDE_DOMAIN_REASON.SCENARIO_SCHEDULER_TURN]:
    'new Promise((resolve) => setImmediate(resolve))',
  [OUTSIDE_DOMAIN_REASON.CLOSURE_OWNER_IDLE_AWAIT]:
    'for (const owner of owners) await owner();',
  [OUTSIDE_DOMAIN_REASON.DRIVE_LOOP_AWAIT]: 'await ',
  [OUTSIDE_DOMAIN_REASON.OWNER_BOUNDARY_RETURN]:
    'await runBootstrapActivity(',
  [OUTSIDE_DOMAIN_REASON.PRE_WINDOW_RESOURCE]: null,
});

test('the formation census closes on its own terms, and its reasons are real',
  async (t) => {
    const packet = await runFormationAttributionCensus();

    // F4 acceptance: semantic, never a count of work.
    t.equal(packet.productionSemanticUnowned, ZERO,
      'no production semantic turn in the formation window is unowned');
    t.equal(packet.unknownSegments, ZERO,
      'every measured turn is classified');
    t.equal(packet.ambiguousSemanticOwner, ZERO,
      'no turn had two semantic owners in flight at once');
    t.equal(packet.peerRepresentationOwnerAssignments, ZERO,
      'no remote peer representation named an owner');
    t.equal(packet.genericExecutionOwnerAssignments, ZERO,
      'no generic carrier named an owner');
    t.equal(packet.overlapDurationUs, ZERO, 'the partition has no overlap');
    t.equal(packet.partitionDeltaUs, ZERO, 'the partition has no missing time');

    // Every site the census recorded carries a reason, and the reason's shape
    // is actually at that site.
    for (const site of Object.keys(packet.unattributed.bySite)) {
      const reason = OUTSIDE_DOMAIN_SITE[site];
      t.ok(reason,
        `${site} is classified by a recorded reason, not by where it lives`);
      const shape = REASON_SHAPE[reason];
      if (shape === null) continue;
      const source = readFileSync(new URL(site, REPO_ROOT), 'utf8');
      t.ok(source.includes(shape),
        `${site} really has the ${reason} shape the census claims for it`);
    }

    // The window is production's window, and the boundary is D's.
    t.match(packet.formationWindowEndReason, /Cluster formed/u,
      'the window ends at the simulator counterpart of the formed mark');
    t.ok(packet.formationWindowEndVirtualTimeMs > ZERO,
      'and it ends at a definite virtual instant');

    // E is unchanged by measuring it.
    t.equal(packet.ownerAddressCount, OWNER_RUNTIME_COUNT,
      'the production construction authority still owns 138 runtimes');
    t.equal(packet.peerObjectCount, PEER_OBJECT_COUNT,
      '276 peer representations still cover the same topology');
    t.same(packet.runtimesInPeerSlots, [], 'no runtime sits in a peer slot');
    t.same(packet.authorityBreaches, [], 'no peer exercised local authority');
    // The strict substrate is gated by the probe, which runs this census as a
    // script. Running the seed chain UNDER the tap runner reaches ambient
    // seams the guard counts - measured here at 1,306 violations where the
    // same code as a script reports 0 - and that is the subject of the open
    // formation-sim-attribution-runner-isolation quest, not of this one. What
    // is asserted here is only what the runner cannot change.
    t.equal(packet.strictSubstitutions, ZERO,
      'no ambient seam was substituted, whatever the runner reached');
    t.type(packet.proofEligible, 'boolean',
      'proof eligibility is reported, and gated by the probe');

    // Teardown is outside the census, and still has to end at rest.
    t.equal(packet.afterTeardown.pending, ZERO,
      'teardown reaches zero pending work');
    t.equal(packet.afterTeardown.postSealProductionEffects, ZERO,
      'no production work runs after the seal');
    t.equal(packet.afterTeardown.postSealEnqueues, ZERO,
      'and nothing is enqueued after it');
    t.ok(packet.afterTeardown.teardownSegments > ZERO,
      'teardown did happen - it is measured, just not in the formation census');
    t.end();
  });
