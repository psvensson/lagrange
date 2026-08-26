import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROLLER_PATHS,
  REVERT_COUNTEREXAMPLE,
  analyzeFormationReleaseEvents,
  executionOutcomeExpected,
  observeFixedClosure,
  revertedCounterexampleObserved,
  resolveRunBinding,
} from '../../scripts/checks/run-formation-release-handoff-gcp.js';
import {formationReleaseGenerationIdentity} from
  '../../src/control-plane/formation-release-handoff-identity.js';
import {computeFileSetFingerprint, computeSourceFingerprint} from
  '../../src/diagnostics/source-fingerprint.js';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {
  canonicalCommitDelta,
  commitDeltaChangedPaths,
} from '../../scripts/solve/content-addressed-change-artifact.js';
import {resolveDockerBuildContextManifest} from
  '../../test/distributed/harness/docker-provider.js';

const FINGERPRINT = '0123456789abcdef';
const FENCE_IDENTITY = 'allowed:matched:matched:present:confirmed';
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
function buildCohort() {
  return [
    {nodeId: 'joiner-a', bootIncarnation: 3},
    {nodeId: 'joiner-b', bootIncarnation: 5},
  ];
}
function buildPhysicalEvidence(cohort = buildCohort()) {
  return [
    {nodeId: 'seed', bootIncarnation: 1},
    ...cohort,
  ].map(({nodeId, bootIncarnation}, index) => ({
    nodeId,
    expectedBootIncarnation: bootIncarnation,
    nodePresent: true,
    nodeBootIncarnation: bootIncarnation,
    nodeStatus: index === 0 ? 'active' : 'joining',
    nodeConnectionState: index === 0 ? 'ready' : 'connected',
    currentPrimaryPresent: true,
    currentPrimaryBootIncarnation: bootIncarnation,
  }));
}
function buildStartupAuthorityObservation({
  state = 'ready',
  ready = true,
  spreadSatisfied = true,
  reasonCodes = [],
  publicationEpoch = 41,
} = {}) {
  return {
    observedStartupAuthorityState: state,
    observedStartupAuthorityReady: ready,
    observedStartupPrioritySpreadSatisfied: spreadSatisfied,
    observedStartupAuthorityReasonCodes: reasonCodes,
    observedStartupAuthorityPublicationEpoch: publicationEpoch,
    observedStartupAuthorityFenceIdentity: FENCE_IDENTITY,
    fenceIdentity: FENCE_IDENTITY,
  };
}
const GENERATION = formationReleaseGenerationIdentity(
  41,
  'seed',
  1,
  buildCohort(),
);
const FIXED_RELEASE_CONTENT_DIGEST = 'b'.repeat(64);

function git(cwd, args) {
  return execFileSync('git', args, {cwd, encoding: 'utf8'}).trim();
}

function bindingOwners(fixedCommit, fixedSourceFingerprint) {
  return {
    async buildDigestRecord() {
      return {
        releaseContentDigest: FIXED_RELEASE_CONTENT_DIGEST,
        headCommit: fixedCommit,
        srcFingerprint: fixedSourceFingerprint,
        fileCount: 1,
      };
    },
    canonicalCommitDelta,
    commitDeltaChangedPaths,
    resolveCommittedEndpoint(root, expectedCommit) {
      if (root === ROOT) {
        if (expectedCommit !== fixedCommit) {
          throw new Error('runtime endpoint must be the exact clean commit');
        }
        return expectedCommit;
      }
      const head = git(root, ['rev-parse', 'HEAD']);
      const dirty = git(root, [
        'status',
        '--porcelain',
        '--untracked-files=all',
      ]);
      if (head !== expectedCommit || dirty.length > 0) {
        throw new Error('runtime endpoint must be the exact clean commit');
      }
      return head;
    },
    resolveDockerBuildContextManifest,
  };
}

async function fixedBindingEvidence(fixedCommit = 'a'.repeat(40)) {
  const sourceFingerprint = await computeSourceFingerprint(
    path.join(ROOT, 'src'),
  );
  const controllerDigest = await computeFileSetFingerprint(
    ROOT,
    CONTROLLER_PATHS,
  );
  const buildContext = await resolveDockerBuildContextManifest(
    ROOT,
    'Dockerfile',
  );
  return {
    argv: [
      `--expected-source-fingerprint=${sourceFingerprint}`,
      `--expected-controller-digest=${controllerDigest}`,
      `--expected-release-content-digest=${FIXED_RELEASE_CONTENT_DIGEST}`,
      `--expected-fixed-commit=${fixedCommit}`,
      `--expected-build-input-digest=${buildContext.buildInputDigest}`,
    ],
    buildContext,
    controllerDigest,
    fixedCommit,
    owners: bindingOwners(fixedCommit, sourceFingerprint),
    sourceFingerprint,
  };
}

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
    observedPublicationEpoch: 41,
    releaseAuthorized: false,
    observedAuthorityReady: true,
    observedRecoveryReasonCodes: [],
    ...buildStartupAuthorityObservation(),
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
    observedPublicationEpoch: 41,
    releaseAuthorized: true,
    observedAuthorityReady: true,
    observedRecoveryReasonCodes: [],
    ...buildStartupAuthorityObservation(),
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
    observedPublicationEpoch: 41,
    releaseAuthorized: true,
    observedAuthorityReady: true,
    observedRecoveryReasonCodes: [],
    ...buildStartupAuthorityObservation({
      state: 'recovery_pending',
      ready: false,
      spreadSatisfied: false,
      reasonCodes: [
        'publication_epoch_pending',
        'priority_partitions_not_spread',
      ],
      publicationEpoch: 42,
    }),
    physicalCohortEvidence: buildPhysicalEvidence(),
    requiredCohort: cohort,
    readyNodeIds: [],
    pendingNodeIds: ['joiner-a', 'joiner-b'],
    msg: 'Formation release handoff authority transition',
  });
  events.push({
    time: '2026-08-25T00:00:12.000Z',
    nodeId: 'seed',
    state: 'active',
    reason: 'retained_until_captured_cohort_ready',
    generation: GENERATION,
    authorityNodeId: 'seed',
    authorityBootIncarnation: 1,
    capturedPublicationEpoch: 41,
    observedPublicationEpoch: 41,
    releaseAuthorized: true,
    observedAuthorityReady: false,
    observedRecoveryReasonCodes: ['priority_partitions_not_spread'],
    ...buildStartupAuthorityObservation({
      state: 'recovery_pending',
      ready: false,
      spreadSatisfied: false,
      reasonCodes: ['priority_partitions_not_spread'],
      publicationEpoch: 42,
    }),
    requiredCohort: cohort,
    readyNodeIds: [],
    pendingNodeIds: ['joiner-a', 'joiner-b'],
    msg: 'Formation release handoff authority transition',
  });
  for (const nodeId of ['joiner-a', 'joiner-b']) {
    events.push({
      time: '2026-08-25T00:00:13.000Z',
      nodeId,
      formationReleaseHandoffState: 'active',
      formationReleaseHandoffGeneration: GENERATION,
      formationReleaseHandoffReleaseAuthorized: true,
      msg: 'Join priority-placement formation barrier',
    });
  }
  events.push({
    time: '2026-08-25T00:00:39.000Z',
    nodeId: 'seed',
    state: 'terminal_pending',
    reason: 'terminal_durability_pending',
    generation: GENERATION,
    authorityNodeId: 'seed',
    authorityBootIncarnation: 1,
    capturedPublicationEpoch: 41,
    observedPublicationEpoch: 41,
    releaseAuthorized: false,
    observedAuthorityReady: false,
    observedRecoveryReasonCodes: ['priority_partitions_not_spread'],
    ...buildStartupAuthorityObservation({
      state: 'recovery_pending',
      ready: false,
      spreadSatisfied: false,
      reasonCodes: ['priority_partitions_not_spread'],
      publicationEpoch: 42,
    }),
    requiredCohort: cohort,
    readyNodeIds: ['joiner-a', 'joiner-b'],
    pendingNodeIds: [],
    pendingTerminalState: 'complete',
    pendingTerminalReason: 'captured_cohort_ready',
    msg: 'Formation release handoff authority transition',
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
    observedPublicationEpoch: 41,
    releaseAuthorized: false,
    observedAuthorityReady: false,
    observedRecoveryReasonCodes: ['priority_partitions_not_spread'],
    ...buildStartupAuthorityObservation({
      state: 'recovery_pending',
      ready: false,
      spreadSatisfied: false,
      reasonCodes: ['priority_partitions_not_spread'],
      publicationEpoch: 42,
    }),
    requiredCohort: cohort,
    readyNodeIds: ['joiner-a', 'joiner-b'],
    pendingNodeIds: [],
    pendingTerminalState: null,
    pendingTerminalReason: null,
    msg: 'Formation release handoff authority transition',
  });
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (
      event.msg === 'Formation release handoff authority transition' &&
      event.state === 'active' &&
      !event.physicalCohortEvidence
    ) {
      event.physicalCohortEvidence = buildPhysicalEvidence(cohort);
    }
  }
  return events;
}

function buildIdleTransitionEvent() {
  return {
    time: '2026-08-25T00:00:08.000Z',
    nodeId: 'seed',
    state: 'idle',
    reason: 'no_satisfied_formation_cohort',
    generation: null,
    authorityNodeId: 'seed',
    authorityBootIncarnation: null,
    capturedPublicationEpoch: null,
    observedPublicationEpoch: null,
    observedAuthorityReady: null,
    observedRecoveryReasonCodes: [],
    releaseAuthorized: false,
    requiredCohort: [],
    readyNodeIds: [],
    pendingNodeIds: [],
    pendingTerminalState: null,
    pendingTerminalReason: null,
    msg: 'Formation release handoff authority transition',
  };
}

function buildTransientProjectionOmissionRevocationEvents() {
  const events = buildPassingEvents();
  events.splice(9, 4, {
    ...events[12],
    time: '2026-08-25T00:00:20.000Z',
    state: 'revoked',
    reason: 'startup_authority_incompatible',
    observedPublicationEpoch: 42,
    observedAuthorityReady: null,
    observedRecoveryReasonCodes: [],
    releaseAuthorized: false,
    readyNodeIds: [],
    pendingNodeIds: [],
    capturedCanonicalNodeIds: ['joiner-a', 'joiner-b', 'seed'],
    observedCanonicalNodeIds: ['joiner-b', 'seed'],
    physicalCohortEvidence: buildPhysicalEvidence(),
  });
  return events;
}

function buildGenerationEvents({
  cohort,
  publicationEpoch,
  startSecond,
  reopened,
}) {
  const generation = formationReleaseGenerationIdentity(
    publicationEpoch,
    'seed',
    1,
    cohort,
  );
  const nodeIds = cohort.map((member) => member.nodeId);
  const time = (offset) =>
    `2026-08-25T00:00:${String(startSecond + offset).padStart(2, '0')}.000Z`;
  const common = {
    nodeId: 'seed',
    state: 'active',
    reason: 'retained_until_captured_cohort_ready',
    generation,
    authorityNodeId: 'seed',
    authorityBootIncarnation: 1,
    capturedPublicationEpoch: publicationEpoch,
    observedPublicationEpoch: publicationEpoch,
    ...buildStartupAuthorityObservation({publicationEpoch}),
    requiredCohort: cohort,
    physicalCohortEvidence: buildPhysicalEvidence(cohort),
    readyNodeIds: [],
    pendingNodeIds: nodeIds,
    msg: 'Formation release handoff authority transition',
  };
  const events = [
    {
      ...common,
      time: time(0),
      releaseAuthorized: false,
      observedAuthorityReady: true,
      observedRecoveryReasonCodes: [],
    },
    {
      ...common,
      time: time(1),
      releaseAuthorized: true,
      observedAuthorityReady: true,
      observedRecoveryReasonCodes: [],
    },
    {
      ...common,
      time: time(2),
      releaseAuthorized: true,
      observedAuthorityReady: true,
      observedRecoveryReasonCodes: [],
      ...buildStartupAuthorityObservation({
        state: 'recovery_pending',
        ready: false,
        spreadSatisfied: false,
        reasonCodes: [
          'publication_epoch_pending',
          'priority_partitions_not_spread',
        ],
        publicationEpoch: publicationEpoch + 1,
      }),
      physicalCohortEvidence: buildPhysicalEvidence(cohort),
    },
  ];
  if (reopened) {
    events.push({
      ...common,
      time: time(3),
      releaseAuthorized: true,
      observedAuthorityReady: false,
      observedRecoveryReasonCodes: ['priority_partitions_not_spread'],
      ...buildStartupAuthorityObservation({
        state: 'recovery_pending',
        ready: false,
        spreadSatisfied: false,
        reasonCodes: ['priority_partitions_not_spread'],
        publicationEpoch: publicationEpoch + 1,
      }),
    });
  }
  for (const nodeId of nodeIds) {
    events.push({
      time: time(3),
      nodeId,
      formationReleaseHandoffState: 'active',
      formationReleaseHandoffGeneration: generation,
      formationReleaseHandoffReleaseAuthorized: true,
      msg: 'Join priority-placement formation barrier',
    });
  }
  events.push({
    ...common,
    time: time(4),
    state: 'terminal_pending',
    reason: 'terminal_durability_pending',
    releaseAuthorized: false,
    observedAuthorityReady: reopened ? false : true,
    observedRecoveryReasonCodes:
      reopened ? ['priority_partitions_not_spread'] : [],
    ...buildStartupAuthorityObservation(reopened ? {
      state: 'recovery_pending',
      ready: false,
      spreadSatisfied: false,
      reasonCodes: ['priority_partitions_not_spread'],
      publicationEpoch: publicationEpoch + 1,
    } : {publicationEpoch}),
    readyNodeIds: nodeIds,
    pendingNodeIds: [],
    pendingTerminalState: 'complete',
    pendingTerminalReason: 'captured_cohort_ready',
  });
  events.push({
    ...common,
    time: time(5),
    state: 'complete',
    reason: 'captured_cohort_ready',
    releaseAuthorized: false,
    observedAuthorityReady: reopened ? false : true,
    observedRecoveryReasonCodes:
      reopened ? ['priority_partitions_not_spread'] : [],
    ...buildStartupAuthorityObservation(reopened ? {
      state: 'recovery_pending',
      ready: false,
      spreadSatisfied: false,
      reasonCodes: ['priority_partitions_not_spread'],
      publicationEpoch: publicationEpoch + 1,
    } : {publicationEpoch}),
    readyNodeIds: nodeIds,
    pendingNodeIds: [],
    pendingTerminalState: null,
    pendingTerminalReason: null,
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
  t.equal(
    analysis.projectionSynchronizedAt,
    '2026-08-25T00:00:11.000Z',
  );
  t.end();
});

test('formation GCP analyzer admits only exact, fenced publication ' +
  'projection synchronization evidence', (t) => {
  const solePublicationPending = buildPassingEvents();
  solePublicationPending[7].observedStartupPrioritySpreadSatisfied = true;
  solePublicationPending[7].observedStartupAuthorityReasonCodes = [
    'publication_epoch_pending',
  ];
  t.equal(analyzeFormationReleaseEvents(
    solePublicationPending,
    FINGERPRINT,
  ).closurePassed, true,
  'the pre-existing sole publication synchronization shape remains valid');

  const unknownDurableBoots = buildPassingEvents();
  unknownDurableBoots[7].physicalCohortEvidence[1].nodeBootIncarnation = 0;
  unknownDurableBoots[7].physicalCohortEvidence[2].nodeBootIncarnation = 0;
  t.equal(analyzeFormationReleaseEvents(
    unknownDurableBoots,
    FINGERPRINT,
  ).closurePassed, true,
  'zero row boot is unknown while exact positive current-primary boots bind');

  const cases = [
    {
      name: 'extra reason',
      mutate(event) {
        event.observedStartupAuthorityReasonCodes = [
          'publication_epoch_pending',
          'unknown_reason',
        ];
      },
    },
    {
      name: 'reverse compound order',
      mutate(event) {
        event.observedStartupAuthorityReasonCodes = [
          'priority_partitions_not_spread',
          'publication_epoch_pending',
        ];
      },
    },
    {
      name: 'duplicate compound reason',
      mutate(event) {
        event.observedStartupAuthorityReasonCodes = [
          'publication_epoch_pending',
          'publication_epoch_pending',
        ];
      },
    },
    {
      name: 'missing compound spread reason',
      mutate(event) {
        event.observedStartupAuthorityReasonCodes = [
          'publication_epoch_pending',
        ];
      },
    },
    {
      name: 'unknown startup state',
      mutate(event) {
        event.observedStartupAuthorityState = 'unknown';
      },
    },
    {
      name: 'spread disagreement',
      mutate(event) {
        event.observedStartupPrioritySpreadSatisfied = true;
      },
    },
    {
      name: 'backward epoch',
      mutate(event) {
        event.observedStartupAuthorityPublicationEpoch = 40;
      },
    },
    {
      name: 'fence mismatch',
      mutate(event) {
        event.observedStartupAuthorityFenceIdentity = 'allowed:other';
      },
    },
    {
      name: 'physical cohort mismatch',
      mutate(event) {
        event.physicalCohortEvidence[1].currentPrimaryBootIncarnation = 99;
      },
    },
    {
      name: 'different positive durable row boot',
      mutate(event) {
        event.physicalCohortEvidence[1].nodeBootIncarnation = 99;
      },
    },
    {
      name: 'negative durable row boot',
      mutate(event) {
        event.physicalCohortEvidence[1].nodeBootIncarnation = -1;
      },
    },
    {
      name: 'noninteger durable row boot',
      mutate(event) {
        event.physicalCohortEvidence[1].nodeBootIncarnation = 3.5;
      },
    },
    {
      name: 'missing durable row boot',
      mutate(event) {
        delete event.physicalCohortEvidence[1].nodeBootIncarnation;
      },
    },
    {
      name: 'missing ACTIVE physical evidence',
      mutate(event) {
        delete event.physicalCohortEvidence;
      },
    },
  ];
  for (let index = 0; index < cases.length; index += 1) {
    const events = buildPassingEvents();
    cases[index].mutate(events[7]);
    const analysis = analyzeFormationReleaseEvents(events, FINGERPRINT);
    t.equal(analysis.closurePassed, false, cases[index].name);
    t.equal(analysis.malformedTransitionCount, 1, cases[index].name);
  }

  let getterCalls = 0;
  const accessorEvents = buildPassingEvents();
  Object.defineProperty(
    accessorEvents[7].physicalCohortEvidence[1],
    'nodeBootIncarnation',
    {
      get() {
        getterCalls += 1;
        return 3;
      },
    },
  );
  const accessorAnalysis = analyzeFormationReleaseEvents(
    accessorEvents,
    FINGERPRINT,
  );
  t.equal(accessorAnalysis.closurePassed, false,
    'accessor durable row boot is absent, not authority');
  t.equal(accessorAnalysis.malformedTransitionCount, 1);
  t.equal(getterCalls, 0, 'analyzer never invokes durable row accessors');

  const inheritedEvents = buildPassingEvents();
  const inheritedEvidence = Object.create({nodeBootIncarnation: 3});
  Object.assign(
    inheritedEvidence,
    inheritedEvents[7].physicalCohortEvidence[1],
  );
  delete inheritedEvidence.nodeBootIncarnation;
  inheritedEvents[7].physicalCohortEvidence[1] = inheritedEvidence;
  const inheritedAnalysis = analyzeFormationReleaseEvents(
    inheritedEvents,
    FINGERPRINT,
  );
  t.equal(inheritedAnalysis.closurePassed, false,
    'inherited durable row boot is absent, not authority');
  t.equal(inheritedAnalysis.malformedTransitionCount, 1);
  t.end();
});

test('formation GCP analyzer accepts projection churn above the immutable ' +
  'captured epoch floor and rejects observations below it', (t) => {
  const aboveFloor = buildPassingEvents();
  aboveFloor[7].observedPublicationEpoch = 45;
  aboveFloor[7].observedStartupAuthorityPublicationEpoch = 45;
  aboveFloor[8].observedPublicationEpoch = 44;
  aboveFloor[8].observedStartupAuthorityPublicationEpoch = 44;
  t.equal(analyzeFormationReleaseEvents(
    aboveFloor,
    FINGERPRINT,
  ).closurePassed, true,
  '45 to 44 is compatible churn because both remain above captured epoch 41');

  const belowFloor = buildPassingEvents();
  belowFloor[8].observedPublicationEpoch = 40;
  belowFloor[8].observedStartupAuthorityPublicationEpoch = 40;
  const belowFloorAnalysis = analyzeFormationReleaseEvents(
    belowFloor,
    FINGERPRINT,
  );
  t.equal(belowFloorAnalysis.closurePassed, false);
  t.equal(belowFloorAnalysis.malformedTransitionCount, 1,
    'an observation below captured epoch is not compatible authority');
  t.end();
});

test('formation GCP analyzer accepts the optional synchronization milestone ' +
  'only when distinct and strictly before the raw spread reopen', (t) => {
  const withoutSynchronization = buildPassingEvents();
  withoutSynchronization.splice(7, 1);
  const withoutSynchronizationAnalysis = analyzeFormationReleaseEvents(
    withoutSynchronization,
    FINGERPRINT,
  );
  t.equal(withoutSynchronizationAnalysis.closurePassed, true,
    'capture to pure reopen is a legal general-spec schedule');
  t.equal(withoutSynchronizationAnalysis.projectionSynchronizedAt, null,
    'the optional lane is reported honestly when it was not exercised');

  const lateSynchronization = buildPassingEvents();
  const synchronization = lateSynchronization.splice(7, 1)[0];
  synchronization.time = '2026-08-25T00:00:12.500Z';
  lateSynchronization.splice(8, 0, synchronization);
  const lateAnalysis = analyzeFormationReleaseEvents(
    lateSynchronization,
    FINGERPRINT,
  );
  t.equal(lateAnalysis.cadenceValid, true,
    'the supported cadence remains grammatically valid');
  t.equal(lateAnalysis.closurePassed, false,
    'a post-reopen synchronization cannot certify this sealed lane');

  const conflated = buildPassingEvents();
  conflated.splice(8, 1);
  conflated[7].observedAuthorityReady = false;
  conflated[7].observedRecoveryReasonCodes = [
    'priority_partitions_not_spread',
  ];
  const conflatedAnalysis = analyzeFormationReleaseEvents(
    conflated,
    FINGERPRINT,
  );
  t.equal(conflatedAnalysis.cadenceValid, true,
    'the raw synchronization event remains individually well formed');
  t.equal(conflatedAnalysis.closurePassed, false,
    'one event cannot satisfy synchronization and reopen milestones');
  t.end();
});

test('formation GCP analyzer reports incomplete generation consumers without ' +
  'calling exact transport malformed', (t) => {
  const events = buildPassingEvents();
  events.splice(events.length - 2, 2);
  const analysis = analyzeFormationReleaseEvents(events, FINGERPRINT);
  t.equal(analysis.closurePassed, false,
    'an incomplete generation cannot certify closure');
  t.equal(analysis.cadenceValid, false,
    'the unfinished terminal cadence remains fail closed');
  t.equal(analysis.malformedOrEarlyBarrierCount, 0,
    'captured-cohort consumers are not malformed merely because terminal is pending');
  t.same(analysis.generationEvidence[0].barrierConsumerNodeIds,
    ['joiner-a', 'joiner-b']);
  t.equal(analysis.generationEvidence[0].terminalAt, null);
  t.end();
});

test('formation GCP analyzer rejects @0, missing consumer parity, rotation, ' +
  'revocation, timeout, and source mismatch independently', (t) => {
  const cases = [
    (events) => {
      events[5].requiredCohort[0].bootIncarnation = 0;
    },
    (events) => {
      events.splice(9, 1);
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
      events[12].readyNodeIds = ['joiner-a', 'joiner-a'];
    },
    (events) => {
      events[9].time = '2026-08-25T00:00:09.000Z';
      events[10].time = '2026-08-25T00:00:09.000Z';
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
      events.splice(11, 1);
    },
    (events) => {
      events.push({...events[12]});
    },
    (events) => {
      events.splice(12, 0, {
        ...events[11],
        time: '2026-08-25T00:00:39.500Z',
        pendingTerminalState: 'revoked',
        pendingTerminalReason: 'startup_authority_incompatible',
      });
    },
    (events) => {
      events.push({...events[8], time: '2026-08-25T00:00:41.000Z'});
    },
    (events) => {
      events.push({...events[6], time: '2026-08-25T00:00:08.000Z'});
    },
    (events) => {
      events.splice(11, 0, {
        ...events[8],
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

test('formation GCP analyzer permits only exact nonauthorizing IDLE grammar ' +
  'when generation is null', (t) => {
  const exactIdle = buildIdleTransitionEvent();
  t.equal(analyzeFormationReleaseEvents(
    [...buildPassingEvents(), exactIdle],
    FINGERPRINT,
  ).closurePassed, true, 'exact IDLE diagnostics remain nonauthorizing');

  for (const state of ['active', 'complete', 'revoked']) {
    const malformed = {...exactIdle, state};
    const analysis = analyzeFormationReleaseEvents(
      [...buildPassingEvents(), malformed],
      FINGERPRINT,
    );
    t.equal(analysis.closurePassed, false, `${state} null generation rejects`);
    t.equal(analysis.malformedTransitionCount, 1);
  }

  const inherited = Object.assign(
    Object.create({generation: null}),
    {...exactIdle, generation: undefined},
  );
  delete inherited.generation;
  t.equal(analyzeFormationReleaseEvents(
    [...buildPassingEvents(), inherited],
    FINGERPRINT,
  ).closurePassed, false, 'inherited generation is absent, not authority');

  let getterCalls = 0;
  const accessor = {...exactIdle};
  Object.defineProperty(accessor, 'generation', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return null;
    },
  });
  t.equal(analyzeFormationReleaseEvents(
    [...buildPassingEvents(), accessor],
    FINGERPRINT,
  ).closurePassed, false, 'accessor generation is rejected');
  t.equal(getterCalls, 0, 'authority accessors are never invoked');
  t.end();
});

test('formation GCP negative-control owner classifies only an exact transient ' +
  'projection-omission revocation', (t) => {
  const expected =
    REVERT_COUNTEREXAMPLE.TRANSIENT_PROJECTION_OMISSION_REVOCATION;
  const exact = analyzeFormationReleaseEvents(
    buildTransientProjectionOmissionRevocationEvents(),
    FINGERPRINT,
  );
  t.equal(exact.counterexampleClassification, expected);
  t.equal(revertedCounterexampleObserved('reverted', expected, exact), true);

  const cases = [
    {
      name: 'source mismatch plus revocation',
      mutate(events) {
        events[0].bootedSrcFingerprint = 'fedcba9876543210';
      },
    },
    {
      name: 'malformed authority transition plus revocation',
      mutate(events) {
        events.push({
          ...buildIdleTransitionEvent(),
          state: 'active',
        });
      },
    },
    {
      name: 'unknown barrier generation plus revocation',
      mutate(events) {
        events.push({
          time: '2026-08-25T00:00:15.000Z',
          nodeId: 'joiner-a',
          formationReleaseHandoffState: 'active',
          formationReleaseHandoffGeneration: 'unknown-generation',
          formationReleaseHandoffReleaseAuthorized: true,
          msg: 'Join priority-placement formation barrier',
        });
      },
    },
    {
      name: 'physical member loss plus revocation',
      mutate(events) {
        events[9].physicalCohortEvidence[1].currentPrimaryPresent = false;
      },
    },
    {
      name: 'complete projection plus revocation',
      mutate(events) {
        events[9].observedCanonicalNodeIds = [
          'joiner-a',
          'joiner-b',
          'seed',
        ];
      },
    },
  ];
  for (let index = 0; index < cases.length; index += 1) {
    const candidate = buildTransientProjectionOmissionRevocationEvents();
    cases[index].mutate(candidate);
    const analysis = analyzeFormationReleaseEvents(candidate, FINGERPRINT);
    t.equal(analysis.counterexampleClassification, null, cases[index].name);
    t.equal(
      revertedCounterexampleObserved('reverted', expected, analysis),
      false,
      `${cases[index].name} is not admitted by the report tail`,
    );
  }
  t.end();
});

test('formation GCP negative-control owner requires exact boot proof for the ' +
  'timeout-without-generation lane', (t) => {
  const expected =
    REVERT_COUNTEREXAMPLE.FORMATION_TIMEOUT_WITHOUT_GENERATION;
  const events = buildPassingEvents().slice(0, 5);
  events.push({code: 'OPERATION_LEDGER_FORMATION_BARRIER_TIMEOUT'});
  const exact = analyzeFormationReleaseEvents(events, FINGERPRINT);
  t.equal(exact.counterexampleClassification, expected);
  t.equal(revertedCounterexampleObserved('reverted', expected, exact), true);

  events[0].expectedSrcFingerprint = 'fedcba9876543210';
  const wrongSource = analyzeFormationReleaseEvents(events, FINGERPRINT);
  t.equal(wrongSource.bootProofPassed, false);
  t.equal(wrongSource.counterexampleClassification, null);
  t.equal(
    revertedCounterexampleObserved('reverted', expected, wrongSource),
    false,
    'wrong fingerprint plus timeout fails at the final evidence consumer',
  );

  const timeoutError = new Error('formation timeout');
  timeoutError.code = 'OPERATION_LEDGER_FORMATION_BARRIER_TIMEOUT';
  t.equal(
    executionOutcomeExpected('reverted', expected, exact, timeoutError),
    true,
    'the exact timeout error is an admissible expected execution outcome',
  );
  t.equal(
    executionOutcomeExpected(
      'reverted',
      expected,
      exact,
      new Error('unrelated cluster failure'),
    ),
    false,
    'an unrelated error cannot hitchhike on exact timeout log evidence',
  );
  t.end();
});

test('formation GCP analyzer keeps post-reopen durable acknowledgement ' +
  'well-formed without treating it as the sealed synchronization witness',
(t) => {
  const events = buildPassingEvents();
  events.splice(6, 1);
  events[6].releaseAuthorized = false;
  events.splice(8, 0, {
    ...events[6],
    time: '2026-08-25T00:00:12.500Z',
    releaseAuthorized: true,
    observedAuthorityReady: false,
    observedRecoveryReasonCodes: ['priority_partitions_not_spread'],
  });
  const analysis = analyzeFormationReleaseEvents(events, FINGERPRINT);
  t.equal(analysis.cadenceValid, true,
    'runtime-supported delayed acknowledgement is not malformed');
  t.equal(analysis.closurePassed, false,
    'the certification still requires an exact durable capture readback');
  t.equal(analysis.qualifyingGenerationCount, 0);
  t.end();
});

test('formation GCP analyzer validates sequential generations and selects ' +
  'exactly one reopened cohort of at least two', (t) => {
  const boot = buildPassingEvents().slice(0, 5);
  const first = buildGenerationEvents({
    cohort: [{nodeId: 'joiner-a', bootIncarnation: 3}],
    publicationEpoch: 40,
    startSecond: 5,
    reopened: false,
  });
  const qualifying = buildGenerationEvents({
    cohort: [
      {nodeId: 'joiner-b', bootIncarnation: 5},
      {nodeId: 'joiner-c', bootIncarnation: 7},
    ],
    publicationEpoch: 41,
    startSecond: 10,
    reopened: true,
  });
  const analysis = analyzeFormationReleaseEvents(
    [...boot, ...first, ...qualifying],
    FINGERPRINT,
  );
  t.equal(analysis.closurePassed, true);
  t.equal(analysis.positiveGenerationCount, 2);
  t.equal(analysis.qualifyingGenerationCount, 1);
  t.same(analysis.barrierConsumerNodeIds, ['joiner-b', 'joiner-c']);

  const overlapping = [...boot, ...first, ...qualifying];
  overlapping[first.length + 4].time = '2026-08-25T00:00:11.000Z';
  t.equal(analyzeFormationReleaseEvents(
    overlapping,
    FINGERPRINT,
  ).closurePassed, false, 'active generation windows cannot overlap');

  const secondQualifying = buildGenerationEvents({
    cohort: [
      {nodeId: 'joiner-d', bootIncarnation: 9},
      {nodeId: 'joiner-e', bootIncarnation: 11},
    ],
    publicationEpoch: 42,
    startSecond: 20,
    reopened: true,
  });
  t.equal(analyzeFormationReleaseEvents(
    [...boot, ...first, ...qualifying, ...secondQualifying],
    FINGERPRINT,
  ).closurePassed, false, 'the sealed run requires one qualifying generation');

  const nonCohortConsumer = [...boot, ...first, ...qualifying, {
    ...qualifying[3],
    nodeId: 'uncaptured-joiner',
  }];
  t.equal(analyzeFormationReleaseEvents(
    nonCohortConsumer,
    FINGERPRINT,
  ).closurePassed, false, 'non-cohort consumers fail the whole run closed');
  t.end();
});

test('formation GCP analyzer charges delayed durable acknowledgement to the ' +
  'certification budget', (t) => {
  const events = buildPassingEvents();
  events[6].time = '2026-08-25T00:01:10.000Z';
  events[7].time = '2026-08-25T00:01:11.000Z';
  events[8].time = '2026-08-25T00:01:12.000Z';
  events[9].time = '2026-08-25T00:01:13.000Z';
  events[10].time = '2026-08-25T00:01:13.000Z';
  events[11].time = '2026-08-25T00:01:19.000Z';
  events[12].time = '2026-08-25T00:01:20.000Z';
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

test('formation GCP runner refuses a label-only revert and binds the fixed ' +
  'runtime, build, release, and commit identities', async (t) => {
  const evidence = await fixedBindingEvidence();
  await t.rejects(
    resolveRunBinding(['--variant=reverted', ...evidence.argv], evidence.owners),
    /separate source root/,
    'a reverted label cannot reuse the fixed runtime tree',
  );
  await t.rejects(
    resolveRunBinding([
      '--variant=fixed',
      ...evidence.argv.filter((value) =>
        !value.startsWith('--expected-source-fingerprint=')),
    ], evidence.owners),
    /fingerprint is required/,
    'the fixed lane also requires an explicit runtime identity',
  );
  await t.rejects(
    resolveRunBinding([
      '--variant=fixed',
      ...evidence.argv.filter((value) =>
        !value.startsWith('--expected-controller-digest=')),
    ], evidence.owners),
    /controller digest is required/,
    'controller bytes must be supplied as an independent run expectation',
  );
  const binding = await resolveRunBinding(
    ['--variant=fixed', ...evidence.argv],
    evidence.owners,
  );
  t.equal(binding.runtimeSourceFingerprint, evidence.sourceFingerprint);
  t.equal(binding.controllerDigest, evidence.controllerDigest);
  t.equal(
    binding.runtimeBuildInputDigest,
    evidence.buildContext.buildInputDigest,
  );
  t.equal(binding.fixedCommit, evidence.fixedCommit);
  t.equal(binding.releaseContentDigest, FIXED_RELEASE_CONTENT_DIGEST);
  t.equal(binding.variant, 'fixed');
  t.end();
});

test('formation GCP runner binds clean committed endpoints to the canonical ' +
  'full-index reverse artifact and exact Docker input cone', async (t) => {
  const temporaryRoot = await fs.mkdtemp(path.join(
    os.tmpdir(),
    'formation-release-reverted-binding-',
  ));
  const evidenceRoot = await fs.mkdtemp(path.join(
    os.tmpdir(),
    'formation-release-reverted-evidence-',
  ));
  try {
    await fs.mkdir(path.join(temporaryRoot, 'src'));
    await fs.writeFile(path.join(temporaryRoot, 'Dockerfile'),
      'FROM scratch\nCOPY src/ /app/src/\n');
    await fs.writeFile(path.join(temporaryRoot, 'package.json'), '{}\n');
    await fs.writeFile(path.join(temporaryRoot, 'package-lock.json'), '{}\n');
    await fs.writeFile(
      path.join(temporaryRoot, 'src/example.js'),
      'export const fixed = true;\n',
    );
    git(temporaryRoot, ['init']);
    git(temporaryRoot, ['config', 'user.email', 'formation@example.invalid']);
    git(temporaryRoot, ['config', 'user.name', 'Formation Fixture']);
    git(temporaryRoot, ['add', '.']);
    git(temporaryRoot, ['commit', '-m', 'fixed endpoint']);
    const fixedCommit = git(temporaryRoot, ['rev-parse', 'HEAD']);
    await fs.writeFile(
      path.join(temporaryRoot, 'src/example.js'),
      'export const reverted = true;\n',
    );
    git(temporaryRoot, ['add', 'src/example.js']);
    git(temporaryRoot, ['commit', '-m', 'exact revert']);
    const revertedCommit = git(temporaryRoot, ['rev-parse', 'HEAD']);
    const runtimeFingerprint = await computeSourceFingerprint(
      path.join(temporaryRoot, 'src'),
    );
    const fixedFingerprint = await computeSourceFingerprint(
      path.join(ROOT, 'src'),
    );
    const controllerDigest = await computeFileSetFingerprint(
      ROOT,
      CONTROLLER_PATHS,
    );
    const fixedEvidence = await fixedBindingEvidence(fixedCommit);
    const runtimeBuildContext = await resolveDockerBuildContextManifest(
      temporaryRoot,
      'Dockerfile',
    );
    const delta = canonicalCommitDelta(
      temporaryRoot,
      fixedCommit,
      revertedCommit,
      ['src/example.js'],
    );
    t.equal(delta.ok, true, 'fixture produces the production canonical delta');
    const reverseArtifactBytes = Buffer.from(delta.content, 'utf8');
    const reverseArtifactSha256 = createHash('sha256')
      .update(reverseArtifactBytes)
      .digest('hex');
    const reverseArtifactFile = 'formation-release.reverse.diff';
    await fs.writeFile(
      path.join(evidenceRoot, reverseArtifactFile),
      reverseArtifactBytes,
    );
    const manifestPath = path.join(evidenceRoot, 'revert-manifest.json');
    await fs.writeFile(manifestPath, `${JSON.stringify({
      schemaVersion: 2,
      variant: 'reverted',
      controllerDigest,
      fixedCommit,
      revertedCommit,
      fixedReleaseContentDigest: FIXED_RELEASE_CONTENT_DIGEST,
      fixedBuildInputDigest: fixedEvidence.buildContext.buildInputDigest,
      revertedBuildInputDigest: runtimeBuildContext.buildInputDigest,
      fixedSourceFingerprint: fixedFingerprint,
      runtimeSourceFingerprint: runtimeFingerprint,
      reverseArtifactFile,
      reverseArtifactSha256,
      orderedRevertedPaths: ['src/example.js'],
      expectedCounterexample: 'transient_projection_omission_revocation',
    }, null, 2)}\n`);
    const binding = await resolveRunBinding([
      '--variant=reverted',
      `--runtime-root=${temporaryRoot}`,
      `--revert-manifest=${manifestPath}`,
      `--expected-source-fingerprint=${runtimeFingerprint}`,
      `--expected-controller-digest=${controllerDigest}`,
      `--expected-release-content-digest=${FIXED_RELEASE_CONTENT_DIGEST}`,
      `--expected-fixed-commit=${fixedCommit}`,
      `--expected-build-input-digest=${runtimeBuildContext.buildInputDigest}`,
    ], bindingOwners(fixedCommit, fixedFingerprint));
    t.equal(binding.variant, 'reverted');
    t.equal(binding.revertManifestSha256.length, 64);
    t.equal(
      binding.revertManifest.reverseArtifactSha256,
      reverseArtifactSha256,
    );

    await fs.writeFile(
      path.join(evidenceRoot, reverseArtifactFile),
      'different bytes\n',
    );
    await t.rejects(resolveRunBinding([
      '--variant=reverted',
      `--runtime-root=${temporaryRoot}`,
      `--revert-manifest=${manifestPath}`,
      `--expected-source-fingerprint=${runtimeFingerprint}`,
      `--expected-controller-digest=${controllerDigest}`,
      `--expected-release-content-digest=${FIXED_RELEASE_CONTENT_DIGEST}`,
      `--expected-fixed-commit=${fixedCommit}`,
      `--expected-build-input-digest=${runtimeBuildContext.buildInputDigest}`,
    ], bindingOwners(fixedCommit, fixedFingerprint)), /does not bind/,
    'artifact byte drift fails closed');
  } finally {
    await fs.rm(temporaryRoot, {recursive: true, force: true});
    await fs.rm(evidenceRoot, {recursive: true, force: true});
  }
  t.end();
});
function buildLivePassingEntries() {
  return buildPassingEvents().map((event) => ({
    timestamp: Date.parse(event.time), node_id: event.nodeId, message: event.msg,
    metadata: JSON.stringify(event),
  }));
}
function buildObservationCluster(options = {}) {
  const buffer = options.buffer || [];
  const collector = {
    collectFinalSnapshot: options.collectFinalSnapshot || (async () => {}),
    getBuffer: () => buffer,
  };
  const unexpectedPoll = () => Promise.reject(new Error('unexpected evidence polling'));
  return {buffer, collector, cluster: {
    getNodes: () => options.hasSeed === false ? [] : [{id: 'seed'}],
    getLogCollector: () => collector,
    waitForState: options.waitForState || unexpectedPoll,
  }};
}
async function observeReplayedEntries(entries, elapsedMs, state) {
  const {cluster, buffer} = buildObservationCluster({
    async collectFinalSnapshot() {
      state.snapshotCalls += 1;
      buffer.push(...entries);
    },
  });
  const times = [0, elapsedMs];
  return observeFixedClosure(cluster, FINGERPRINT, () => times.shift());
}
test('formation GCP runner observes closure through the existing cluster ' +
  'state and log-collector owners', async (t) => {
  const entries = buildLivePassingEntries();
  const state = {snapshotCalls: 0};
  const observed = await observeReplayedEntries(entries, 500, state);
  const originalBoolean = globalThis.Boolean;
  let boundary;
  try {
    globalThis.Boolean = () => false;
    boundary = await observeReplayedEntries(entries, 60_000, state);
  } finally {
    globalThis.Boolean = originalBoolean;
  }
  t.equal(observed.satisfied, true);
  t.equal(observed.value.closurePassed, true);
  const complete = analyzeFormationReleaseEvents(buildPassingEvents(), FINGERPRINT);
  t.equal(observed.value.canonicalGeneration, complete.canonicalGeneration,
    'live replay and complete history select the same generation');
  t.equal(state.snapshotCalls, 2, 'each observer replays exactly once');
  t.equal(observed.elapsedMs, 500, 'reported time includes durable replay');
  t.equal(boundary.satisfied, true, 'closure at exactly 60s is admitted');
  t.equal(boundary.elapsedMs, 60_000, 'inclusive boundary is reported exactly');
});
test('formation GCP runner fails closed when authoritative log replay fails',
  async (t) => {
    const replayFailure = new Error('durable log replay unavailable');
    const {cluster} = buildObservationCluster({
      async collectFinalSnapshot() {
        throw replayFailure;
      },
    });
    await t.rejects(observeFixedClosure(cluster, FINGERPRINT), replayFailure,
      'a known-incomplete live buffer cannot become evidence',
    );
    t.end();
  });
test('formation GCP runner observes a streamed terminal after empty replay ' +
  'inside the remaining budget', async (t) => {
  const entries = buildLivePassingEntries();
  const state = {waitOptions: null};
  const {cluster, buffer} = buildObservationCluster({
    async waitForState(predicate, options) {
      state.waitOptions = options;
      t.equal(await predicate(this), false, 'empty replay invents no closure');
      buffer.push(...entries);
      const value = await predicate(this);
      return {satisfied: Boolean(value), value, polls: 2, elapsedMs: 200};
    },
  });
  const observed = await observeFixedClosure(cluster, FINGERPRINT, () => 2_000);
  t.equal(observed.satisfied, true);
  t.equal(observed.value.closurePassed, true);
  t.equal(state.waitOptions.timeoutMs, 60_000, 'replay never widens budget');
  t.end();
});
test('formation GCP runner spends no polling budget after replay exhausts ' +
  'the closure deadline', async (t) => {
  let waitCalls = 0;
  const {cluster} = buildObservationCluster({
    async waitForState() {
      waitCalls += 1;
    },
  });
  const times = [5_000, 65_000];
  const observed = await observeFixedClosure(
    cluster, FINGERPRINT, () => times.shift());
  t.same(observed,
    {satisfied: false, elapsedMs: 60_000, polls: 1, value: false});
  t.equal(waitCalls, 0, 'the original 60s envelope is terminal');
  t.end();
});
test('formation GCP runner refuses replay without an authoritative seed',
  async (t) => {
    const {cluster} = buildObservationCluster({hasSeed: false});
    await t.rejects(observeFixedClosure(cluster, FINGERPRINT),
      /closure observation owner unavailable/,
      'missing replay authority fails before evidence polling');
    t.end();
  });
