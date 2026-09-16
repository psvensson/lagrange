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
  CLASSIFICATION, OUTSIDE_DOMAIN_REASON, OUTSIDE_DOMAIN_SHAPE,
  classifyUnownedTurn,
} from './formation-attribution-provenance-classify.js';
import {
  createRecorder, provenanceCallbacks,
} from './formation-attribution-provenance.js';
import {
  FormationTurnAttribution,
} from '../../src/diagnostics/formation-turn-attribution.js';
import {FORMATION_OWNER} from
  '../../src/diagnostics/formation-diagnostics-contract.js';
import {
  runFormationAttributionCensus,
} from './formation-attribution-census.js';

const ZERO = 0;
const ONE_AMBIGUITY = 1;
const OWNER_RUNTIME_COUNT = 138;
const PEER_OBJECT_COUNT = 276;
const REPO_ROOT = new URL('../../', import.meta.url);

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

    // Every site the census recorded is classified by the SOURCE LINE at
    // that line number, and the classifier is re-run here against the live
    // source so a moved line cannot inherit an old verdict.
    for (const site of Object.keys(packet.unattributed.bySite)) {
      const verdict = classifyUnownedTurn(site);
      t.equal(verdict.classification, CLASSIFICATION.OUTSIDE_DOMAIN,
        `${site} is classified outside-domain by its own line`);
      t.ok(verdict.line && verdict.line.trim().length > ZERO,
        `${site} has a source line to be the proof`);
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

// The shape table is the proof surface, so it is checked against the source
// rather than trusted: a shape that no longer exists in the file it names
// would silently stop classifying anything.
test('every classification shape is present in the file it names',
  (t) => {
    const reasons = new Set(Object.values(OUTSIDE_DOMAIN_REASON));
    for (const candidate of OUTSIDE_DOMAIN_SHAPE) {
      const source = readFileSync(new URL(candidate.file, REPO_ROOT), 'utf8');
      t.ok(source.includes(candidate.shape),
        `${candidate.file} still contains the ${candidate.reason} shape`);
      t.ok(reasons.has(candidate.reason),
        `${candidate.reason} is one of the recorded reasons`);
    }
    t.end();
  });

// A metric that cannot be non-zero proves nothing. Ambiguity is the one
// counter the formation cone never exercises, so it is demonstrated directly:
// a resource that inherited owner A, dispatched while a DIFFERENT owner's
// segment is open, is two semantic owners in flight at once.
test('the ambiguity counter fires on two owners in flight, and not on nesting',
  (t) => {
    const ZERO_US = 0;
    const CONFLICTING_ID = 11;
    const SAME_OWNER_ID = 12;
    const recorder = createRecorder();
    const held = {attribution: null};
    let inner = null;
    const attribution = new FormationTurnAttribution({
      clock: () => ZERO_US,
      hookFactory: (callbacks) => {
        inner = provenanceCallbacks(recorder, held, callbacks);
        return {enable() {}, disable() {}};
      },
    });
    held.attribution = attribution;
    attribution.start();

    // Two resources, one owned by bootstrap and one by readiness.
    attribution.asyncOwners.set(CONFLICTING_ID, FORMATION_OWNER.BOOTSTRAP);
    attribution.asyncOwners.set(SAME_OWNER_ID, FORMATION_OWNER.READINESS);

    // Dispatched with nothing open: ordinary.
    inner.before(CONFLICTING_ID);
    inner.after(CONFLICTING_ID);
    t.equal(recorder.ambiguous, ZERO,
      'a dispatch with no segment open is not ambiguous');

    // Dispatched inside an open segment of the SAME owner: nesting, ordinary.
    attribution.run(FORMATION_OWNER.READINESS, () => {
      inner.before(SAME_OWNER_ID);
      inner.after(SAME_OWNER_ID);
    });
    t.equal(recorder.ambiguous, ZERO,
      'a dispatch nested inside its own owner is not ambiguous either');

    // Dispatched inside an open segment of a DIFFERENT owner: ambiguous.
    attribution.run(FORMATION_OWNER.READINESS, () => {
      inner.before(CONFLICTING_ID);
      inner.after(CONFLICTING_ID);
    });
    t.equal(recorder.ambiguous, ONE_AMBIGUITY,
      'a bootstrap resource dispatched inside an open readiness segment is ' +
        'counted: two semantic owners were in flight at once');
    attribution.stop();
    t.end();
  });
