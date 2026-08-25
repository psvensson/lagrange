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

test('formation GCP analyzer requires one positive retained generation on ' +
  'every joiner and exact five-node source proof', (t) => {
  const analysis = analyzeFormationReleaseEvents(
    buildPassingEvents(),
    FINGERPRINT,
  );
  t.equal(analysis.closurePassed, true);
  t.equal(analysis.bootNodeCount, 5);
  t.equal(analysis.positiveGenerationCount, 1);
  t.equal(analysis.canonicalGeneration, GENERATION);
  t.same(analysis.barrierConsumerNodeIds, ['joiner-a', 'joiner-b']);
  t.equal(analysis.completionMs, 31_000);
  t.end();
});

test('formation GCP analyzer rejects @0, missing consumer parity, rotation, ' +
  'revocation, timeout, and source mismatch independently', (t) => {
  const cases = [
    (events) => {
      events[5].requiredCohort[0].bootIncarnation = 0;
    },
    (events) => {
      events.splice(8, 1);
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

test('formation GCP analyzer rejects extra malformed authority, duplicate ' +
  'completion, and consumers observed before the reopened cadence', (t) => {
  const cases = [
    (events) => {
      events.push({
        ...events[5],
        generation: 'malformed-zero-incarnation-generation',
        requiredCohort: [
          {nodeId: 'joiner-a', bootIncarnation: 0},
          {nodeId: 'joiner-b', bootIncarnation: 5},
        ],
      });
    },
    (events) => {
      events[10].readyNodeIds = ['joiner-a', 'joiner-a'];
    },
    (events) => {
      events[8].time = '2026-08-25T00:00:09.000Z';
      events[9].time = '2026-08-25T00:00:09.000Z';
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

test('formation GCP analyzer rejects duplicate terminal, post-terminal active, ' +
  'release regression, and event-order/time-order disagreement', (t) => {
  const cases = [
    (events) => {
      events.push({...events[10]});
    },
    (events) => {
      events.push({...events[7], time: '2026-08-25T00:00:41.000Z'});
    },
    (events) => {
      events.push({...events[6], time: '2026-08-25T00:00:08.000Z'});
    },
    (events) => {
      events.splice(10, 0, {
        ...events[7],
        time: '2026-08-25T00:00:20.000Z',
        releaseAuthorized: false,
      });
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
  t.equal(analysis.capturedAt, '2026-08-25T00:00:09.000Z');
  t.equal(analysis.durableAcknowledgedAt, '2026-08-25T00:00:11.000Z');
  t.equal(analysis.reopenedAt, analysis.durableAcknowledgedAt);
  t.end();
});

test('formation GCP analyzer charges delayed durable acknowledgement to the ' +
  'certification budget', (t) => {
  const events = buildPassingEvents();
  events[6].time = '2026-08-25T00:01:10.000Z';
  events[7].time = '2026-08-25T00:01:11.000Z';
  events[8].time = '2026-08-25T00:01:12.000Z';
  events[9].time = '2026-08-25T00:01:12.000Z';
  events[10].time = '2026-08-25T00:01:20.000Z';
  const analysis = analyzeFormationReleaseEvents(events, FINGERPRINT);
  t.equal(analysis.completionMs, 71_000);
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
