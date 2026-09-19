// Witness for the readiness-admission-transitions-observed quest, planning-owner
// half. Raw node:test so the anchored receipt runner selects exactly one
// scenario.
//
// SCOPE. In the formation traced by the second causal packet of 2026-09-19 a
// joiner's planning owner served a deferred readiness snapshot of the seed
// for 173 s and never said which condition kept a new build from being
// admitted. These witnesses pin that every term of the reuse decision and
// every refusal of the publish decision is now named, once per transition and
// per owner key, build variant and participation kind; that an unchanged
// state says nothing at all whatever the shape of the traffic; and that no
// decision moved, under a still clock, under a ticking one, and under a
// logger that throws.
//
// The drive is the REAL ReadinessPlanningSnapshotOwner with semantic planning
// enabled and the REAL routing surface, on a virtual clock. Each term is
// broken through a production seam of the owner's service contract, never by
// reaching into its private state.
import test from 'node:test';
import assert from 'node:assert/strict';

import {ReadinessPlanningSnapshotOwner} from
  '../../src/control-plane/readiness-planning-snapshot-owner.js';
import {
  READINESS_ADMISSION_LOG_MSG,
  READINESS_ADMISSION_STATE,
  READINESS_ADMISSION_TERM,
  READINESS_PUBLICATION_REFUSAL_TERM,
  READINESS_ADMISSION_TERM_NAMES,
  READINESS_PUBLICATION_REFUSAL_TERM_NAMES,
  READINESS_PUBLICATION_STATE,
  readReadinessAdmissionTrackedVariantCount,
} from '../../src/control-plane/readiness-admission-transition-record.js';
import {
  PLANNING_READ_OPTIONS,
  RECOVERY_READ_OPTIONS,
  ROUTED_READ_OPTIONS,
  STALE_HEARTBEAT_MAX_AGE_MS,
  VICTIM_NODE_ID,
  createAdmissionDrive,
  isDeferredSnapshot,
  runAdmissionScenario,
} from './readiness-admission-transitions-rig.js';

// THE FROZEN ORACLE. Measured by running this rig's `runAdmissionScenario`
// against the tree at b869139a6 - main with the guard-inputs quest landed and
// not one source line of this quest applied. A verifier reproduces it by
// copying this rig and `readiness-planning-formation-rig.js` onto a checkout
// of that commit and hashing the same observations. The observations are
// projected through `projectPreExistingDenial`, so no field this quest adds
// can enter the digest and make the differential pass by moving the
// comparison, and they carry the owner's own published state per step, so a
// term dropped from the PUBLISH decision moves the digest too.
const MAIN_ADMISSION_SCENARIO_DIGEST =
  '920e05dfd0a43f0a127ed838c72997464021e13bf12620b30bcc3fac072783f2';
// The same scenario with a clock that ticks on every read of it. One extra
// clock read anywhere moves every later observation, so this is the witness
// that the diagnostic reads no clock main did not read.
const MAIN_TICKING_CLOCK_DIGEST =
  'eaaed0f0a69a0a47dbba4731d0df575def68bbd9941574cfda7195e017d235ea';
// Main's owner source-read counts over the same scenario, measured the same
// way. `canReuseCompletedSnapshot` is counted because the read path must keep
// reaching the decision through it - the deferral-bounded audit spies there.
const MAIN_OWNER_CALL_COUNTS = Object.freeze({
  readPlanningProjectionIdentity: 145,
  captureToken: 129,
  readCurrentSourceObservation: 337,
  hasUnclassifiedSourceChange: 477,
  isCompletedSnapshotLive: 22,
  capturePositiveDecisionLiveVeto: 60,
  capturePublicationGuard: 76,
  captureCurrentPlanningSource: 115,
  readCompleted: 98,
  canReuseCompletedSnapshot: 30,
  readSync: 40,
});

const TRANSITION = READINESS_ADMISSION_LOG_MSG.ADMISSION_TRANSITION;
const PUBLICATION = READINESS_ADMISSION_LOG_MSG.PUBLICATION_REFUSED;
const DEFERRED_WINDOW_MS = 7_000;
const TERM_CHANGE_WINDOW_MS = 3_000;
const STEADY_READ_COUNT = 25;
const FLAP_CYCLE_COUNT = 4;
const READS_PER_STATE = 3;
const REFUSAL_DRAIN_ROUNDS = 40;
const LINES_PER_FLAP_CYCLE = 2;
const REFUSAL_REPEAT_COUNT = 6;
const VARIANT_STEADY_READ_COUNT = 500;
const MANY_OWNER_KEY_COUNT = 200;
const MANY_OWNER_KEY_ROUNDS = 8;
const OVER_VARIANT_CAP_COUNT = 40;
const OWNER_VARIANT_CAP = 16;
const SECOND_NODE_ID = 'node-2';
// `createAdmittedDrive` reads twice: the cold read establishes the admitted
// state silently, and the second is suppressed as an unchanged repeat.
const ESTABLISHING_SUPPRESSED_READS = 1;

// Each case breaks exactly one condition of the admission decision, and names
// the terms the owner's own evaluation order produces. A saturated planning
// identity and a saturated generation each also rotate the planning identity,
// so the freshness term genuinely fails with them: the assertion is the whole
// set, never a substring of it.
const DEFERRAL_CASES = Object.freeze([
  Object.freeze({
    label: 'live-evidence veto expired',
    terms: Object.freeze([READINESS_ADMISSION_TERM.LIVE_EVIDENCE_VETO]),
    engage: (drive) => drive.advance(STALE_HEARTBEAT_MAX_AGE_MS + 1),
    release: async (drive) => {
      await drive.drain();
    },
  }),
  Object.freeze({
    label: 'transport topology invalid',
    terms: Object.freeze([READINESS_ADMISSION_TERM.TRANSPORT_TOPOLOGY_INVALID]),
    engage: (drive) => drive.setTransportValid(false),
    release: async (drive) => {
      drive.setTransportValid(true);
      await drive.drain();
    },
  }),
  Object.freeze({
    label: 'source change unclassified',
    terms: Object.freeze([READINESS_ADMISSION_TERM.SOURCE_CHANGE_UNCLASSIFIED]),
    engage: (drive) => drive.writeUnclassifiedSourceChange(1),
    release: async (drive) => {
      drive.flushDeferredCacheChanges();
      await drive.drain();
    },
  }),
  Object.freeze({
    label: 'planning identity saturated',
    terms: Object.freeze([
      READINESS_ADMISSION_TERM.PLANNING_IDENTITY_SATURATED,
      READINESS_ADMISSION_TERM.FRESHNESS_NOT_CURRENT,
    ]),
    engage: (drive) => drive.setLivenessUnavailable(true),
    release: async (drive) => {
      drive.setLivenessUnavailable(false);
      await drive.drain();
    },
  }),
  Object.freeze({
    label: 'freshness not current',
    terms: Object.freeze([READINESS_ADMISSION_TERM.FRESHNESS_NOT_CURRENT]),
    engage: (drive) => drive.rotateLivenessIdentity(),
    release: async (drive) => {
      await drive.drain();
    },
  }),
  // Saturation is one-way in the owner's generation contract, so this case
  // has no release and is driven last.
  Object.freeze({
    label: 'generation saturated',
    terms: Object.freeze([
      READINESS_ADMISSION_TERM.GENERATION_SATURATED,
      READINESS_ADMISSION_TERM.FRESHNESS_NOT_CURRENT,
    ]),
    engage: (drive) => drive.saturateGeneration(),
    release: null,
  }),
]);

function transitionLines(drive) {
  return drive.sink.lines
    .filter((line) => line.message === TRANSITION)
    .map((line) => line.payload);
}

function publicationLines(drive, ownerKey) {
  return drive.sink.lines
    .filter((line) => line.message === PUBLICATION &&
      line.payload.ownerKey === ownerKey)
    .map((line) => line.payload);
}

async function createAdmittedDrive(options = {}) {
  const drive = createAdmissionDrive(options);
  drive.read();
  await drive.drain();
  assert.equal(isDeferredSnapshot(drive.read()), false,
    'the drive starts from an admitted record');
  drive.sink.clear();
  return drive;
}

function assertDeferralLine(line, deferralCase, expectedPreviousState) {
  const label = deferralCase.label;
  assert.deepEqual(line.failedTerms, [...deferralCase.terms],
    `${label}: the line names exactly the failed terms`);
  // The list is bounded by construction: the term names are a frozen module
  // constant, so a line can carry at most that many entries and nothing is
  // ever withheld.
  assert.ok(line.failedTerms.length <= READINESS_ADMISSION_TERM_NAMES.length,
    `${label}: the term list cannot exceed the terms that exist`);
  assert.equal(line.failedTermsWithheld, 0,
    `${label}: the bounded term list withheld nothing`);
  assert.equal(line.ownerKey, VICTIM_NODE_ID,
    `${label}: the line is per owner key`);
  assert.equal(typeof line.buildOptionsKey, 'string',
    `${label}: the line names the build variant it is about`);
  assert.equal(line.previousState, expectedPreviousState,
    `${label}: the line states the state it left`);
  assert.equal(line.state, READINESS_ADMISSION_STATE.DEFERRED,
    `${label}: the line states the state it entered`);
  assert.equal(typeof line.inheritedRecordAgeMs, 'number',
    `${label}: the inherited record's age is stated`);
  assert.equal(line.deferredForMs, null,
    `${label}: no deferred duration on the way in`);
  assert.equal(line.droppedLineCount, 0,
    `${label}: no line was dropped by the sink`);
}

test('the planning owner names the failing terms of each deferral transition',
  async () => {
    const drive = await createAdmittedDrive();
    try {
      for (const deferralCase of DEFERRAL_CASES) {
        deferralCase.engage(drive);
        assert.equal(isDeferredSnapshot(drive.read()), true,
          `${deferralCase.label}: the owner serves a deferred snapshot`);
        const intoDeferred = transitionLines(drive);
        assert.equal(intoDeferred.length, 1,
          `${deferralCase.label}: exactly one line for the transition`);
        assertDeferralLine(intoDeferred[0], deferralCase,
          READINESS_ADMISSION_STATE.ADMITTED);
        if (!deferralCase.release) continue;
        drive.advance(DEFERRED_WINDOW_MS);
        drive.sink.clear();
        await deferralCase.release(drive);
        assert.equal(isDeferredSnapshot(drive.read()), false,
          `${deferralCase.label}: the owner returns to an admitted record`);
        const intoAdmitted = transitionLines(drive);
        assert.equal(intoAdmitted.length, 1,
          `${deferralCase.label}: exactly one line for the return`);
        assert.deepEqual(intoAdmitted[0].failedTerms, [],
          `${deferralCase.label}: an admitted record fails no term`);
        assert.equal(intoAdmitted[0].state, READINESS_ADMISSION_STATE.ADMITTED,
          `${deferralCase.label}: the return names the admitted state`);
        assert.equal(intoAdmitted[0].deferredForMs, DEFERRED_WINDOW_MS,
          `${deferralCase.label}: the return states the time spent deferred`);
        drive.sink.clear();
      }
    } finally {
      drive.shutdown();
    }
  });

test('a deferral that changes its failing terms is one deferral, not two',
  async () => {
    const drive = await createAdmittedDrive();
    try {
      // A record nobody has served before is reported from `unobserved`: the
      // bootstrap is spent, so this owner key has no completed record.
      assert.equal(isDeferredSnapshot(drive.read(SECOND_NODE_ID)), true,
        'a second owner key has no completed record to serve');
      const [absent] = transitionLines(drive);
      assert.deepEqual(absent.failedTerms,
        [READINESS_ADMISSION_TERM.COMPLETED_RECORD_ABSENT],
        'the missing record names itself');
      assert.equal(absent.previousState, READINESS_ADMISSION_STATE.UNOBSERVED,
        'a deferral nobody has seen before is reported from unobserved');
      assert.equal(absent.inheritedRecordAgeMs, null,
        'there is no inherited record, so there is no age to state');
      drive.sink.clear();
      // The victim now defers for the live veto, changes term while deferred,
      // and returns. The duration must span the WHOLE deferral.
      drive.advance(STALE_HEARTBEAT_MAX_AGE_MS + 1);
      drive.read();
      drive.advance(TERM_CHANGE_WINDOW_MS);
      drive.setTransportValid(false);
      drive.read();
      drive.advance(DEFERRED_WINDOW_MS);
      drive.setTransportValid(true);
      await drive.drain();
      assert.equal(isDeferredSnapshot(drive.read()), false,
        'the owner returns to an admitted record');
      const lines = transitionLines(drive);
      assert.equal(lines.length, 3,
        'one line in, one for the changed terms, one out');
      assert.equal(lines[1].previousState, READINESS_ADMISSION_STATE.DEFERRED,
        'a term change while deferred stays deferred');
      assert.deepEqual(lines[1].failedTerms,
        [READINESS_ADMISSION_TERM.TRANSPORT_TOPOLOGY_INVALID],
        'the changed terms are named');
      assert.equal(lines[1].deferredForMs, null,
        'a term change is not a return, so it states no duration');
      assert.equal(lines[2].deferredForMs,
        TERM_CHANGE_WINDOW_MS + DEFERRED_WINDOW_MS,
        'the return states the whole deferral, not the last term change');
    } finally {
      drive.shutdown();
    }
  });

async function assertVariantsStaySilent(drive, first, second) {
  const before = transitionLines(drive).length;
  for (let index = 0; index < VARIANT_STEADY_READ_COUNT; index += 1) {
    drive.read(VICTIM_NODE_ID, first);
    drive.read(VICTIM_NODE_ID, second);
  }
  return transitionLines(drive).length - before;
}

test('a steady state logs nothing and a flap states the suppressed reads',
  async () => {
    // A record that is being served is not an event. The FIRST read of a
    // variant that serves an admitted record says nothing at all - asserted
    // before anything clears the sink.
    const cold = createAdmissionDrive();
    try {
      assert.equal(isDeferredSnapshot(cold.read()), false,
        'the cold read is served an admitted record');
      assert.deepEqual(transitionLines(cold), [],
        'the first admitted read of a variant is silent');
    } finally {
      cold.shutdown();
    }
    const steady = await createAdmittedDrive();
    try {
      for (let index = 0; index < STEADY_READ_COUNT; index += 1) {
        assert.equal(isDeferredSnapshot(steady.read()), false,
          'the steady state keeps serving an admitted record');
      }
      assert.deepEqual(transitionLines(steady), [],
        `${STEADY_READ_COUNT} reads in an unchanged state emit no line`);
      steady.setTransportValid(false);
      steady.read();
      assert.equal(transitionLines(steady)[0].suppressedReads,
        ESTABLISHING_SUPPRESSED_READS + STEADY_READ_COUNT,
        'the line that ends a steady state says how many reads it suppressed');
    } finally {
      steady.shutdown();
    }
    const flap = await createAdmittedDrive();
    try {
      for (let cycle = 0; cycle < FLAP_CYCLE_COUNT; cycle += 1) {
        flap.setTransportValid(false);
        for (let read = 0; read < READS_PER_STATE; read += 1) flap.read();
        flap.setTransportValid(true);
        await flap.drain();
        for (let read = 0; read < READS_PER_STATE; read += 1) flap.read();
      }
      const lines = transitionLines(flap);
      assert.equal(lines.length, FLAP_CYCLE_COUNT * LINES_PER_FLAP_CYCLE,
        'log volume is bounded by state changes, not by reads');
      assert.equal(lines[0].suppressedReads, ESTABLISHING_SUPPRESSED_READS,
        'the first line suppressed only the drive\'s establishing read');
      for (const line of lines.slice(1)) {
        assert.equal(line.suppressedReads, READS_PER_STATE - 1,
          'every later line says how many identical reads it suppressed');
      }
    } finally {
      flap.shutdown();
    }
    // TWO BUILD VARIANTS of one owner key, each in its own unchanging state:
    // the planning variant admitted, the recovery variant with no completed
    // record of its own. Keyed by owner key alone this logged on every read.
    const variants = await createAdmittedDrive();
    try {
      variants.read(VICTIM_NODE_ID, RECOVERY_READ_OPTIONS);
      const established = transitionLines(variants).length;
      assert.equal(established, 1,
        'only the recovery variant announces itself; the planning one is ' +
          'already admitted and silent');
      const emitted = await assertVariantsStaySilent(
        variants, PLANNING_READ_OPTIONS, RECOVERY_READ_OPTIONS);
      assert.equal(emitted, 0,
        `${2 * VARIANT_STEADY_READ_COUNT} reads of two variants in two ` +
          'stable states emit no further line');
    } finally {
      variants.shutdown();
    }
    // ONE BUILD VARIANT read two ways: a planning read is deferred while a
    // routed read of the same variant is served through the sealed CL-012
    // stored-snapshot bridge. Different states, forever, same build key.
    const participations = await createAdmittedDrive({storedBridge: true});
    try {
      participations.storeBridgeSnapshot(VICTIM_NODE_ID,
        participations.read(VICTIM_NODE_ID, PLANNING_READ_OPTIONS));
      participations.advance(STALE_HEARTBEAT_MAX_AGE_MS + 1);
      participations.read(VICTIM_NODE_ID, PLANNING_READ_OPTIONS);
      participations.read(VICTIM_NODE_ID, ROUTED_READ_OPTIONS);
      const established = transitionLines(participations).length;
      const emitted = await assertVariantsStaySilent(
        participations, PLANNING_READ_OPTIONS, ROUTED_READ_OPTIONS);
      assert.ok(established >= 1,
        'entering the split state is announced');
      assert.equal(emitted, 0,
        `${2 * VARIANT_STEADY_READ_COUNT} reads of one variant under two ` +
          'participation kinds in two stable states emit no further line');
    } finally {
      participations.shutdown();
    }
    // MANY OWNER KEYS, all in the same unchanging state. A private eviction
    // policy restarted live keys from `unobserved` and made every read a line.
    const manyKeys = await createAdmittedDrive();
    try {
      const keys = [];
      for (let index = 0; index < MANY_OWNER_KEY_COUNT; index += 1) {
        keys.push(`joiner-${index}`);
      }
      for (const key of keys) manyKeys.read(key);
      const established = transitionLines(manyKeys).length;
      assert.equal(established, MANY_OWNER_KEY_COUNT,
        'each owner key announces its own deferral exactly once');
      for (let round = 0; round < MANY_OWNER_KEY_ROUNDS; round += 1) {
        for (const key of keys) manyKeys.read(key);
      }
      assert.equal(transitionLines(manyKeys).length, established,
        `${MANY_OWNER_KEY_COUNT * MANY_OWNER_KEY_ROUNDS} steady reads ` +
          `across ${MANY_OWNER_KEY_COUNT} owner keys emit no further line`);
    } finally {
      manyKeys.shutdown();
    }
  });

test('the transition record is forgotten exactly when the owner forgets it',
  async () => {
    const drive = await createAdmittedDrive();
    try {
      for (let index = 0; index < OVER_VARIANT_CAP_COUNT; index += 1) {
        drive.read(VICTIM_NODE_ID, {decisionDimension: `dimension-${index}`});
      }
      const tracked = readReadinessAdmissionTrackedVariantCount(drive.owner);
      assert.equal(tracked, OWNER_VARIANT_CAP,
        'the record tracks exactly the variants the owner still tracks, ' +
          'with no bound and no eviction policy of its own');
      drive.shutdown();
      assert.equal(readReadinessAdmissionTrackedVariantCount(drive.owner), 0,
        'a stopped owner takes its transition records with it');
    } finally {
      drive.shutdown();
    }
  });

test('two planning owners never share transition state', async () => {
  const first = await createAdmittedDrive();
  const second = await createAdmittedDrive();
  try {
    first.setTransportValid(false);
    first.read();
    assert.equal(transitionLines(first).length, 1,
      'the first owner reports its own deferral');
    assert.deepEqual(transitionLines(second), [],
      'the second owner, still admitted, reports nothing');
    for (let index = 0; index < STEADY_READ_COUNT; index += 1) second.read();
    assert.deepEqual(transitionLines(second), [],
      'and stays silent while the other owner flaps');
  } finally {
    first.shutdown();
    second.shutdown();
  }
});

// One refused publish of the victim's own variant: the source moves while
// that build is in flight, and exactly one drain round runs it.
// Let every queued build run to a published completion again.
async function settle(drive) {
  drive.setMutateDuringBuild(null);
  drive.flushDeferredCacheChanges();
  drive.requestBuild();
  assert.equal(await drive.drainUntilBuilt(), true,
    'the victim rebuilds once the source stops moving under it');
  await drive.drain(REFUSAL_DRAIN_ROUNDS);
}

async function refuseOnce(drive, mutate) {
  drive.setMutateDuringBuild(mutate);
  drive.requestBuild();
  assert.equal(await drive.drainUntilBuilt(), true,
    'the victim\'s own variant was rebuilt, and so republished');
}

test('a refused publish names its refusal reason once per change', async () => {
  const drive = await createAdmittedDrive();
  try {
    // The node's lifecycle moves while every build is in flight, so the
    // publication guard captured at build start no longer holds at completion.
    for (let index = 0; index < REFUSAL_REPEAT_COUNT; index += 1) {
      drive.advance(DEFERRED_WINDOW_MS);
      await refuseOnce(drive, () => drive.toggleLifecycleState());
    }
    const guard = publicationLines(drive, VICTIM_NODE_ID);
    assert.equal(guard.length, 1,
      'many refusals for one reason emit exactly one line');
    assert.deepEqual(guard[0].refusalTerms,
      [READINESS_PUBLICATION_REFUSAL_TERM.PUBLICATION_GUARD_CHANGED],
      'the line names the term that refused the publish');
    assert.equal(guard[0].state, READINESS_PUBLICATION_STATE.REFUSED,
      'the line names the refused state');
    assert.ok(guard[0].refusalTerms.length <=
      READINESS_PUBLICATION_REFUSAL_TERM_NAMES.length,
    'the refusal-term list cannot exceed the terms that exist');
    assert.equal(guard[0].refusalTermsWithheld, 0,
      'the bounded refusal-term list withheld nothing');
    assert.equal(typeof guard[0].buildOptionsKey, 'string',
      'the line names the build variant it refused');
    assert.equal(guard[0].droppedLineCount, 0,
      'no line was dropped by the sink');
    // Going back to a published build is itself a change: it says how many
    // refusals it suppressed and how long publishes were refused.
    drive.sink.clear();
    await settle(drive);
    const published = publicationLines(drive, VICTIM_NODE_ID);
    assert.equal(published.length, 1,
      'the return to a published build emits exactly one line');
    assert.equal(published[0].state, READINESS_PUBLICATION_STATE.PUBLISHED,
      'the line names the published state');
    assert.deepEqual(published[0].refusalTerms, [],
      'a published build refuses no term');
    assert.equal(published[0].suppressedRefusals, REFUSAL_REPEAT_COUNT - 1,
      'and says how many identical refusals it suppressed');
    // The episode is measured from the FIRST refusal of the run, not from
    // the last one: six refusals one window apart span five windows, and a
    // `refusedSince` that reset on every refusal would report one.
    assert.equal(published[0].refusedForMs,
      DEFERRED_WINDOW_MS * (REFUSAL_REPEAT_COUNT - 1),
      'and exactly how long publishes were refused, from the first refusal');
    // A second reason: the planning identity itself moves during the build.
    drive.sink.clear();
    await refuseOnce(drive, () => drive.rotateLivenessIdentity());
    const identity = publicationLines(drive, VICTIM_NODE_ID);
    assert.equal(identity.length, 1,
      'a changed refusal reason emits exactly one further line');
    assert.deepEqual(identity[0].refusalTerms,
      [READINESS_PUBLICATION_REFUSAL_TERM.PLANNING_IDENTITY_NOT_CURRENT],
      'the moved planning identity names itself');
    // A third: a source change the owner has not classified yet.
    drive.sink.clear();
    await settle(drive);
    drive.sink.clear();
    await refuseOnce(drive, () => drive.writeUnclassifiedSourceChange(9));
    const unclassified = publicationLines(drive, VICTIM_NODE_ID);
    assert.equal(unclassified.length, 1,
      'a third refusal reason emits exactly one further line');
    assert.ok(unclassified[0].refusalTerms.includes(
      READINESS_PUBLICATION_REFUSAL_TERM.SOURCE_CHANGE_UNCLASSIFIED),
    'the unclassified source change names itself');
    drive.flushDeferredCacheChanges();
  } finally {
    drive.shutdown();
  }
});

// A logger that throws is the one way a diagnostic can change behaviour: main
// logs nothing on these paths. The reads, the publishes and the build count
// must be main's, and the count of lines the sink refused must reach the next
// line that does get out.
// Every shape a sink can be hostile in. A throwing `info` fails on the call;
// a throwing `info` getter, a throwing `service.logger` getter and a Proxy
// all fail on the READ that reaches the sink, which is why the resolution is
// inside the guard and not before it.
const HOSTILE_LOGGERS = Object.freeze({
  throwingInfo: (service) => {
    service.logger = {info: () => {
      throw new Error('sink');
    }, warn() {}, error() {}, debug() {}};
  },
  throwingInfoGetter: (service) => {
    Object.defineProperty(service.logger, 'info', {
      configurable: true,
      get() {
        throw new Error('info getter');
      },
    });
  },
  throwingLoggerGetter: (service) => {
    Object.defineProperty(service, 'logger', {
      configurable: true,
      get() {
        throw new Error('logger getter');
      },
    });
  },
  proxyLogger: (service) => {
    service.logger = new Proxy({}, {get() {
      throw new Error('proxy get');
    }});
  },
  asyncRejectingInfo: (service) => {
    service.logger = {info: async () => {
      throw new Error('async sink');
    }, warn() {}, error() {}, debug() {}};
  },
  nullLogger: (service) => {
    service.logger = null;
  },
});

// The same script under every sink: the answers served, the deferral verdicts
// and the build count must be the ones a sink that works produces.
async function measureUnderLogger(install) {
  const drive = createAdmissionDrive();
  if (install) install(drive.service);
  const served = [];
  try {
    served.push(isDeferredSnapshot(drive.read()));
    await drive.drain();
    served.push(isDeferredSnapshot(drive.read()));
    drive.advance(STALE_HEARTBEAT_MAX_AGE_MS + 1);
    served.push(isDeferredSnapshot(drive.read()));
    drive.setTransportValid(false);
    served.push(isDeferredSnapshot(drive.read()));
    drive.setTransportValid(true);
    await drive.drain();
    served.push(isDeferredSnapshot(drive.read()));
    const diagnostics = drive.owner.getDiagnostics();
    return {
      served,
      buildCount: drive.state.buildCount,
      retryableBuildFailureCount: diagnostics.retryableBuildFailureCount,
      completedOwnerKeys: [...diagnostics.completedOwnerKeys],
      diagnosticsHasDroppedLineCount:
        JSON.stringify(diagnostics).includes('droppedLineCount'),
    };
  } finally {
    drive.shutdown();
  }
}

async function measureThrowingLoggerScenario(throwUntilLastLine) {
  const drive = createAdmissionDrive();
  const emitted = [];
  let throwing = throwUntilLastLine;
  drive.service.logger = {
    info: (message, payload) => {
      if (throwing) throw new Error('logger sink failed');
      emitted.push({message, payload});
    },
    warn() {},
    error() {},
    debug() {},
  };
  const served = [];
  try {
    served.push(isDeferredSnapshot(drive.read()));
    await drive.drain();
    served.push(isDeferredSnapshot(drive.read()));
    drive.advance(STALE_HEARTBEAT_MAX_AGE_MS + 1);
    served.push(isDeferredSnapshot(drive.read()));
    served.push(isDeferredSnapshot(drive.read()));
    drive.setTransportValid(false);
    served.push(isDeferredSnapshot(drive.read()));
    throwing = false;
    drive.setTransportValid(true);
    await drive.drain();
    served.push(isDeferredSnapshot(drive.read()));
    return {emitted, served, buildCount: drive.state.buildCount};
  } finally {
    drive.shutdown();
  }
}

test('every planning and routing decision matches the frozen oracle of main',
  async () => {
    const measured = await runAdmissionScenario();
    const repeated = await runAdmissionScenario();
    assert.equal(measured.digest, repeated.digest,
      'the scenario is deterministic, so the digest is a witness at all');
    assert.equal(measured.digest, MAIN_ADMISSION_SCENARIO_DIGEST,
      'the served record sequence and object identities, the deferral ' +
        'verdicts, the owner\'s published state per step, the build counts ' +
        'and the routing admissions, denials and pre-existing denial ' +
        'payloads are all identical to main\'s');
    const ticking = await runAdmissionScenario({tickOnRead: true});
    assert.equal(ticking.digest, MAIN_TICKING_CLOCK_DIGEST,
      'under a clock that ticks on every read of it the scenario is still ' +
        'main\'s, so the diagnostic reads no clock main did not read');
    const thrown = await measureThrowingLoggerScenario(true);
    const quiet = await measureThrowingLoggerScenario(false);
    const still = await runAdmissionScenario();
    assert.equal(still.digest, MAIN_ADMISSION_SCENARIO_DIGEST,
      'a scenario run after a throwing logger is still main\'s');
    assert.equal(thrown.buildCount, quiet.buildCount,
      'a logger that throws changes no build count');
    assert.deepEqual(thrown.served, quiet.served,
      'and changes no read: every answer is the same one');
    assert.equal(thrown.emitted.length, 1,
      'the first line the sink accepts gets out');
    assert.ok(thrown.emitted[0].payload.droppedLineCount > 0,
      'and states how many lines the sink refused before it');
    assert.equal(quiet.emitted[0].payload.droppedLineCount, 0,
      'a sink that never refuses reports nothing dropped');
    // Every hostile sink shape, against a sink that works: identical served
    // answers, identical build count, identical queue state. Nothing the
    // recorder does to reach a logger may escape into a read.
    const working = await measureUnderLogger(null);
    assert.equal(working.diagnosticsHasDroppedLineCount, false,
      'the dropped-line counter never enters the owner\'s diagnostics');
    for (const [name, install] of Object.entries(HOSTILE_LOGGERS)) {
      const hostile = await measureUnderLogger(install);
      assert.deepEqual(hostile, working,
        `${name}: a hostile sink changes no read, no build and no counter`);
    }
  });

test('the owner reads no source more often per decision than main did',
  async () => {
    const prototype = ReadinessPlanningSnapshotOwner.prototype;
    const names = Object.keys(MAIN_OWNER_CALL_COUNTS);
    const originals = names.map((name) => prototype[name]);
    const counts = {};
    names.forEach((name, index) => {
      counts[name] = 0;
      Object.defineProperty(prototype, name, {
        configurable: true,
        writable: true,
        value: function(...args) {
          counts[name] += 1;
          return originals[index].apply(this, args);
        },
      });
    });
    try {
      const measured = await runAdmissionScenario();
      assert.equal(measured.digest, MAIN_ADMISSION_SCENARIO_DIGEST,
        'the counted run is the frozen scenario');
      assert.deepEqual(counts, {...MAIN_OWNER_CALL_COUNTS},
        'every owner source read happens exactly as often as on main');
    } finally {
      names.forEach((name, index) => {
        Object.defineProperty(prototype, name, {
          configurable: true, writable: true, value: originals[index],
        });
      });
    }
  });
