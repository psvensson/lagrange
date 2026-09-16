// The F4 packet: one run of the formation cone, frozen at the formation-
// complete boundary, then torn down and measured again.
//
// Nothing here decides an owner. It runs the same E chain the peer-authority
// probe runs, reads what the accounting owner recorded, classifies every
// unowned turn by the proof its creation site carries, and then proves the
// scenario reached rest after the seal.
import {
  FORMATION, FORMATION_END_REASON, SEALED, TEARDOWN, createRecorder, digestOf,
  fileOf, installHook, installOwnerCallObserver, readStrict, summarizeOwners,
  summarizeUnowned,
} from './formation-attribution-provenance.js';
import {
  FormationTurnAttribution,
} from '../../src/diagnostics/formation-turn-attribution.js';
import {
  observePeerRaftAuthority,
} from './formation-sim-peer-raft-authority.js';
import {
  runSeedHandoffScenario,
} from './formation-sim-production-seed-host.js';

const ZERO = 0;
const ENTRY = 'entry';

/**
 * Run the census and return the frozen packet.
 * @return {Promise<Object>}
 */
async function runFormationAttributionCensus() {
  const recorder = createRecorder();
  const held = {attribution: null};
  const attribution = new FormationTurnAttribution({
    hookFactory: installHook(recorder, held),
  });
  held.attribution = attribution;
  const peers = observePeerRaftAuthority();
  const restoreOwnerCalls = installOwnerCallObserver(recorder);
  let mark = null;
  let snapshot = null;
  let run = null;
  // Let everything the process arranged before this point dispatch, so the
  // window opens on a quiet loop rather than on the tail of module loading.
  await new Promise((resolve) => setImmediate(resolve));
  attribution.start();
  try {
    run = await runSeedHandoffScenario({
      onFormationComplete: (formationMark) => {
        snapshot = attribution.snapshot();
        mark = formationMark;
        recorder.phase = TEARDOWN;
      },
    });
    recorder.phase = SEALED;
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    restoreOwnerCalls();
    attribution.stop();
  }
  const census = peers.census();
  peers.restore();
  return buildPacket({attribution, census, mark, recorder, run, snapshot});
}

function countOwnerCalls(recorder, kind) {
  let total = ZERO;
  for (const call of recorder.ownerCalls) {
    if (call.phase === FORMATION && call.kind === kind) total += 1;
  }
  return total;
}

function countSegments(recorder, phase, predicate) {
  let total = ZERO;
  for (const segment of recorder.segments) {
    if (segment.phase === phase && predicate(segment)) total += 1;
  }
  return total;
}

// Causal identity for anything the census could not classify. Stack
// provenance is not required for this - a V8 promise continuation may have no
// repository frame at all - so what is recorded is lineage and shape.
function unknownDetail(recorder) {
  const rows = [];
  for (const segment of recorder.segments) {
    if (segment.phase !== FORMATION) continue;
    if (segment.owner !== 'unattributed') continue;
    if (segment.createdInWindow === false) continue;
    if (fileOf(segment.root ?? 'native') !== 'native') continue;
    rows.push({
      asyncId: segment.asyncId,
      type: segment.type,
      triggerAsyncId: segment.trigger,
    });
  }
  return rows;
}

function buildPacket({census, mark, recorder, run, snapshot}) {
  const unowned = summarizeUnowned(recorder.segments);
  const strict = readStrict(run.strictReport);
  const owned = countSegments(recorder, FORMATION,
    (segment) => segment.owner !== 'unattributed');
  return {
    formationWindowEndReason: FORMATION_END_REASON,
    formationWindowEndVirtualTimeMs: mark.atMs,

    totalDispatches: owned + unowned.segments,
    ownedByInheritance: owned,
    explicitOwnerEntries: countOwnerCalls(recorder, ENTRY),
    explicitHandoffs: countOwnerCalls(recorder, 'handoff'),
    perOwner: summarizeOwners(snapshot, recorder.ownerCalls),

    unattributed: {
      segments: unowned.segments,
      durationUs: snapshot.unattributedDurationUs,
      outsideDomainByReason: unowned.outsideDomainByReason,
      bySite: unowned.bySite,
    },
    productionSemanticUnowned: unowned.productionSemanticUnowned,
    unknownSegments: unowned.unknownSegments,
    unknownDetail: unknownDetail(recorder),
    ambiguousSemanticOwner: recorder.ambiguous,
    peerRepresentationOwnerAssignments: recorder.peerAssignments,
    genericExecutionOwnerAssignments: recorder.carrierAssignments,
    overlapDurationUs: snapshot.overlapDurationUs,
    partitionDeltaUs: snapshot.partitionDeltaUs,

    ownerAddressCount: census.ownerAddressCount,
    peerObjectCount: census.peerObjectCount,
    peerAddressCount: census.peerAddressCount,
    runtimesInPeerSlots: census.runtimesInPeerSlots,
    authorityBreaches: census.authorityBreaches,

    strictViolations: strict.violations,
    strictSubstitutions: strict.substitutions,
    proofEligible: strict.proofEligible,

    hostTranscriptDigest: digestOf(mark.transcript),
    networkTranscriptDigest: digestOf(run.networkTranscript),
    provenanceDigest: digestOf(mark.provenance),

    afterTeardown: {
      pending: run.pendingEventCount,
      postSealProductionEffects: countSegments(recorder, SEALED,
        (segment) => segment.owner !== 'unattributed'),
      postSealEnqueues:
        run.scenario.network.enqueueEpoch() - run.enqueueEpoch,
      teardownSegments: countSegments(recorder, TEARDOWN, () => true),
    },
  };
}

export {runFormationAttributionCensus};
