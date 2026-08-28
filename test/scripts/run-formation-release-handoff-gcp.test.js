import {test} from '../../src/test-helpers/tap.js';
import {
  analyzeFormationReleaseEvents,
} from '../../scripts/checks/run-formation-release-handoff-gcp.js';
import {formationReleaseGenerationIdentity} from
  '../../src/control-plane/formation-release-handoff-identity.js';

const FINGERPRINT = '0123456789abcdef';
function buildCohort() {
  return [
    {nodeId: 'joiner-a', bootIncarnation: 3},
    {nodeId: 'joiner-b', bootIncarnation: 5},
  ];
}
const GENERATION = formationReleaseGenerationIdentity(
  41,
  'seed',
  1,
  buildCohort(),
);

function buildPassingEvents() {
  const events = [];
  const cohort = buildCohort();
  for (let index = 0; index < 5; index += 1) {
    events.push({
      time: `2026-08-25T00:00:0${index}.000Z`,
      nodeId: `node-${index}`,
      bootedSrcFingerprint: FINGERPRINT,
      expectedSrcFingerprint: FINGERPRINT,
      srcFingerprintMatches: true,
      msg: 'Distributed Database System starting',
    });
  }
  events.push({
    time: '2026-08-25T00:00:09.000Z',
    nodeId: 'seed',
    state: 'active',
    reason: 'retained_until_captured_cohort_ready',
    generation: GENERATION,
    authorityNodeId: 'seed',
    authorityBootIncarnation: 1,
    capturedPublicationEpoch: 41,
    releaseAuthorized: false,
    observedAuthorityReady: true,
    observedRecoveryReasonCodes: [],
    requiredCohort: cohort,
    readyNodeIds: [],
    pendingNodeIds: ['joiner-a', 'joiner-b'],
    msg: 'Formation release handoff authority transition',
  });
  events.push({
    time: '2026-08-25T00:00:10.000Z',
    nodeId: 'seed',
    state: 'active',
    reason: 'retained_until_captured_cohort_ready',
    generation: GENERATION,
    authorityNodeId: 'seed',
    authorityBootIncarnation: 1,
    capturedPublicationEpoch: 41,
    releaseAuthorized: true,
    observedAuthorityReady: true,
    observedRecoveryReasonCodes: [],
    requiredCohort: cohort,
    readyNodeIds: [],
    pendingNodeIds: ['joiner-a', 'joiner-b'],
    msg: 'Formation release handoff authority transition',
  });
  events.push({
    time: '2026-08-25T00:00:11.000Z',
    nodeId: 'seed',
    state: 'active',
    reason: 'retained_until_captured_cohort_ready',
    generation: GENERATION,
    authorityNodeId: 'seed',
    authorityBootIncarnation: 1,
    capturedPublicationEpoch: 41,
    releaseAuthorized: true,
    observedAuthorityReady: false,
    observedRecoveryReasonCodes: ['priority_partitions_not_spread'],
    requiredCohort: cohort,
    readyNodeIds: [],
    pendingNodeIds: ['joiner-a', 'joiner-b'],
    msg: 'Formation release handoff authority transition',
  });
  for (const nodeId of ['joiner-a', 'joiner-b']) {
    events.push({
      time: '2026-08-25T00:00:12.000Z',
      nodeId,
      formationReleaseHandoffState: 'active',
      formationReleaseHandoffGeneration: GENERATION,
      formationReleaseHandoffReleaseAuthorized: true,
      msg: 'Join priority-placement formation barrier',
    });
  }
  // The non-monotone spread reopen is proven at the startup-authority boundary:
  // ready -> recovery_pending -> ready across the captured window (harness
  // correction 2026-08-28; the generation itself is no longer required to
  // transition through a destructive reopened state).
  events.push({
    time: '2026-08-25T00:00:13.000Z',
    nodeId: 'joiner-a',
    state: 'waiting_for_formation_cohort',
    startupAuthorityState: 'ready',
    msg: 'Join priority-placement formation barrier',
  });
  events.push({
    time: '2026-08-25T00:00:14.000Z',
    nodeId: 'joiner-a',
    state: 'waiting_for_startup_authority',
    startupAuthorityState: 'recovery_pending',
    msg: 'Join priority-placement formation barrier',
  });
  events.push({
    time: '2026-08-25T00:00:39.000Z',
    nodeId: 'joiner-a',
    state: 'ledger_spread_satisfied',
    startupAuthorityState: 'ready',
    msg: 'Join priority-placement formation barrier',
  });
  events.push({
    time: '2026-08-25T00:00:40.000Z',
    nodeId: 'seed',
    state: 'complete',
    reason: 'captured_cohort_ready',
    generation: GENERATION,
    authorityNodeId: 'seed',
    authorityBootIncarnation: 1,
    capturedPublicationEpoch: 41,
    releaseAuthorized: false,
    observedAuthorityReady: false,
    observedRecoveryReasonCodes: ['priority_partitions_not_spread'],
    requiredCohort: cohort,
    readyNodeIds: ['joiner-a', 'joiner-b'],
    pendingNodeIds: [],
    msg: 'Formation release handoff authority transition',
  });
  return events;
}

test('formation GCP analyzer accepts a healthy single generation with a ' +
  'real non-monotone spread reopen and exact five-node source proof', (t) => {
  const analysis = analyzeFormationReleaseEvents(
    buildPassingEvents(),
    FINGERPRINT,
  );
  t.equal(analysis.closurePassed, true);
  t.equal(analysis.bootNodeCount, 5);
  t.equal(analysis.generationCount, 1);
  t.equal(analysis.completedGenerationCount, 1);
  t.equal(analysis.invalidRevocationCount, 0);
  t.equal(analysis.spreadReopenObserved, true);
  t.equal(analysis.generationRetainedAcrossReopen, true);
  t.equal(analysis.barrierReleased, true);
  t.equal(analysis.formationTimeoutCount, 0);
  t.equal(analysis.completionMs, 31_000);
  t.end();
});

test('formation GCP analyzer accepts a healthy multi-epoch staggered ' +
  'formation (two legitimate completions)', (t) => {
  const cohortB = [
    {nodeId: 'joiner-c', bootIncarnation: 7},
    {nodeId: 'joiner-d', bootIncarnation: 9},
  ];
  const generationB = formationReleaseGenerationIdentity(
    42,
    'seed',
    1,
    cohortB,
  );
  const events = buildPassingEvents();
  // A second, legitimate generation (later epoch, different cohort) captures
  // and completes after the first, mirroring the real staggered-joiner GCP run.
  events.push({
    time: '2026-08-25T00:00:41.000Z',
    nodeId: 'seed',
    state: 'active',
    reason: 'retained_until_captured_cohort_ready',
    generation: generationB,
    authorityNodeId: 'seed',
    authorityBootIncarnation: 1,
    capturedPublicationEpoch: 42,
    releaseAuthorized: true,
    observedAuthorityReady: true,
    observedRecoveryReasonCodes: [],
    requiredCohort: cohortB,
    readyNodeIds: [],
    pendingNodeIds: ['joiner-c', 'joiner-d'],
    msg: 'Formation release handoff authority transition',
  });
  events.push({
    time: '2026-08-25T00:00:44.000Z',
    nodeId: 'seed',
    state: 'complete',
    reason: 'captured_cohort_ready',
    generation: generationB,
    authorityNodeId: 'seed',
    authorityBootIncarnation: 1,
    capturedPublicationEpoch: 42,
    releaseAuthorized: false,
    observedAuthorityReady: true,
    observedRecoveryReasonCodes: [],
    requiredCohort: cohortB,
    readyNodeIds: ['joiner-c', 'joiner-d'],
    pendingNodeIds: [],
    msg: 'Formation release handoff authority transition',
  });
  const analysis = analyzeFormationReleaseEvents(events, FINGERPRINT);
  t.equal(analysis.closurePassed, true);
  t.equal(analysis.generationCount, 2);
  t.equal(analysis.completedGenerationCount, 2);
  t.equal(analysis.invalidRevocationCount, 0);
  t.end();
});

test('formation GCP analyzer fails a lucky quiet run that never exercises ' +
  'a non-monotone spread reopen', (t) => {
  const events = buildPassingEvents().filter(
    (event) => event.startupAuthorityState === undefined,
  );
  // Remove the reopen proof: drop the startup-authority boundary events.
  const analysis = analyzeFormationReleaseEvents(events, FINGERPRINT);
  t.equal(analysis.spreadReopenObserved, false);
  t.equal(analysis.closurePassed, false,
    'a run with no non-monotone spread reopen must not prove the sealed ' +
      'condition it was introduced to handle');
  t.end();
});

test('formation GCP analyzer rejects a stranded generation that never ' +
  'completes', (t) => {
  const events = buildPassingEvents().filter(
    (event) => event.state !== 'complete',
  );
  const analysis = analyzeFormationReleaseEvents(events, FINGERPRINT);
  t.equal(analysis.completedGenerationCount, 0);
  t.equal(analysis.closurePassed, false);
  t.end();
});

test('formation GCP analyzer rejects @0, rotation, revocation, timeout, ' +
  'and source mismatch independently', (t) => {
  const cases = [
    (events) => {
      events[5].requiredCohort[0].bootIncarnation = 0;
    },
    (events) => {
      events.push({
        ...events[5],
        generation: formationReleaseGenerationIdentity(42, 'seed', 1, [
          {nodeId: 'joiner-c', bootIncarnation: 7},
          {nodeId: 'joiner-d', bootIncarnation: 9},
        ]),
        capturedPublicationEpoch: 42,
        requiredCohort: [
          {nodeId: 'joiner-c', bootIncarnation: 7},
          {nodeId: 'joiner-d', bootIncarnation: 9},
        ],
        pendingNodeIds: ['joiner-c', 'joiner-d'],
      });
    },
    (events) => {
      events.push({
        ...events[5],
        state: 'revoked',
        reason: 'startup_authority_incompatible',
        releaseAuthorized: false,
        readyNodeIds: [],
        pendingNodeIds: [],
      });
    },
    (events) => {
      events.push({code: 'OPERATION_LEDGER_FORMATION_BARRIER_TIMEOUT'});
    },
    (events) => {
      events[0].bootedSrcFingerprint = 'fedcba9876543210';
    },
  ];
  for (const mutate of cases) {
    const events = buildPassingEvents();
    mutate(events);
    t.equal(
      analyzeFormationReleaseEvents(events, FINGERPRINT).closurePassed,
      false,
    );
  }
  t.end();
});

test('formation GCP analyzer rejects a malformed authority transition', (t) => {
  const events = buildPassingEvents();
  events.push({
    ...events[5],
    generation: 'malformed-zero-incarnation-generation',
    requiredCohort: [
      {nodeId: 'joiner-a', bootIncarnation: 0},
      {nodeId: 'joiner-b', bootIncarnation: 5},
    ],
  });
  t.equal(
    analyzeFormationReleaseEvents(events, FINGERPRINT).closurePassed,
    false,
  );
  t.end();
});

test('formation GCP analyzer rejects a post-terminal active regression and ' +
  'a pre-capture release regression', (t) => {
  const cases = [
    (events) => {
      events.push({...events[7], time: '2026-08-25T00:00:41.000Z'});
    },
    (events) => {
      events.push({...events[6], time: '2026-08-25T00:00:08.000Z'});
    },
  ];
  for (let index = 0; index < cases.length; index += 1) {
    const events = buildPassingEvents();
    cases[index](events);
    t.equal(
      analyzeFormationReleaseEvents(events, FINGERPRINT).closurePassed,
      false,
    );
  }
  t.end();
});

test('formation GCP analyzer accepts durable acknowledgement after the spread ' +
  'has already reopened', (t) => {
  const events = buildPassingEvents();
  events.splice(6, 1);
  const analysis = analyzeFormationReleaseEvents(events, FINGERPRINT);
  t.equal(analysis.closurePassed, true);
  t.equal(analysis.generationCount, 1);
  t.equal(analysis.completedGenerationCount, 1);
  t.equal(analysis.spreadReopenObserved, true);
  t.end();
});

test('formation GCP analyzer charges a completion that overruns the ' +
  'certification budget', (t) => {
  // First capture is events[5] at 00:00:09; the completion is events[13].
  // Pushing the completion to 00:01:10 yields a 61s capture-to-complete span,
  // over the 60-second certification budget.
  const events = buildPassingEvents();
  events[13].time = '2026-08-25T00:01:10.000Z';
  const analysis = analyzeFormationReleaseEvents(events, FINGERPRINT);
  t.equal(analysis.completionMs, 61_000);
  t.equal(analysis.closurePassed, false);
  t.end();
});

test('formation GCP analyzer is stable under post-import mutable intrinsic ' +
  'replacement', (t) => {
  const originals = {
    every: Array.prototype.every,
    filter: Array.prototype.filter,
    find: Array.prototype.find,
    indexOf: Array.prototype.indexOf,
    map: Array.prototype.map,
    sort: Array.prototype.sort,
    slice: Array.prototype.slice,
    iterator: Array.prototype[Symbol.iterator],
    includes: String.prototype.includes,
    dateParse: Date.parse,
    numberIsSafeInteger: Number.isSafeInteger,
    numberIsFinite: Number.isFinite,
    objectHasOwn: Object.hasOwn,
    objectGetOwnPropertyDescriptor: Object.getOwnPropertyDescriptor,
  };
  const events = buildPassingEvents();
  let analysis;
  try {
    // eslint-disable-next-line no-extend-native -- adversarial fixture
    Array.prototype.every = () => false;
    // eslint-disable-next-line no-extend-native -- adversarial fixture
    Array.prototype.filter = () => [];
    // eslint-disable-next-line no-extend-native -- adversarial fixture
    Array.prototype.find = () => null;
    // eslint-disable-next-line no-extend-native -- adversarial fixture
    Array.prototype.indexOf = () => -1;
    // eslint-disable-next-line no-extend-native -- adversarial fixture
    Array.prototype.map = () => [];
    // eslint-disable-next-line no-extend-native -- adversarial fixture
    Array.prototype.sort = () => [];
    // eslint-disable-next-line no-extend-native -- adversarial fixture
    Array.prototype.slice = () => [];
    // eslint-disable-next-line no-extend-native -- adversarial fixture
    Array.prototype[Symbol.iterator] = function* emptyIterator() {};
    // eslint-disable-next-line no-extend-native -- adversarial fixture
    String.prototype.includes = () => false;
    Date.parse = () => Number.NaN;
    Number.isSafeInteger = () => false;
    Number.isFinite = () => false;
    Object.hasOwn = () => false;
    Object.getOwnPropertyDescriptor = () => null;
    analysis = analyzeFormationReleaseEvents(events, FINGERPRINT);
  } finally {
    // eslint-disable-next-line no-extend-native -- adversarial fixture
    Array.prototype.every = originals.every;
    // eslint-disable-next-line no-extend-native -- adversarial fixture
    Array.prototype.filter = originals.filter;
    // eslint-disable-next-line no-extend-native -- adversarial fixture
    Array.prototype.find = originals.find;
    // eslint-disable-next-line no-extend-native -- adversarial fixture
    Array.prototype.indexOf = originals.indexOf;
    // eslint-disable-next-line no-extend-native -- adversarial fixture
    Array.prototype.map = originals.map;
    // eslint-disable-next-line no-extend-native -- adversarial fixture
    Array.prototype.sort = originals.sort;
    // eslint-disable-next-line no-extend-native -- adversarial fixture
    Array.prototype.slice = originals.slice;
    // eslint-disable-next-line no-extend-native -- adversarial fixture
    Array.prototype[Symbol.iterator] = originals.iterator;
    // eslint-disable-next-line no-extend-native -- adversarial fixture
    String.prototype.includes = originals.includes;
    Date.parse = originals.dateParse;
    Number.isSafeInteger = originals.numberIsSafeInteger;
    Number.isFinite = originals.numberIsFinite;
    Object.hasOwn = originals.objectHasOwn;
    Object.getOwnPropertyDescriptor = originals.objectGetOwnPropertyDescriptor;
  }
  t.equal(analysis.closurePassed, true);
  t.end();
});
