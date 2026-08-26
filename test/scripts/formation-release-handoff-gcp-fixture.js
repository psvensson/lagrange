import {formationReleaseGenerationIdentity} from
  '../../src/control-plane/formation-release-handoff-identity.js';

const FINGERPRINT = '0123456789abcdef';
const FENCE_IDENTITY = 'allowed:matched:matched:present:confirmed';

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
  const base = {
    nodeId: 'seed',
    state: 'active',
    reason: 'retained_until_captured_cohort_ready',
    generation: GENERATION,
    authorityNodeId: 'seed',
    authorityBootIncarnation: 1,
    capturedPublicationEpoch: 41,
    observedPublicationEpoch: 41,
    observedRecoveryReasonCodes: [],
    requiredCohort: cohort,
    readyNodeIds: [],
    pendingNodeIds: ['joiner-a', 'joiner-b'],
    msg: 'Formation release handoff authority transition',
  };
  events.push({
    ...base,
    time: '2026-08-25T00:00:09.000Z',
    releaseAuthorized: false,
    observedAuthorityReady: true,
    ...buildStartupAuthorityObservation(),
  });
  events.push({
    ...base,
    time: '2026-08-25T00:00:10.000Z',
    releaseAuthorized: true,
    observedAuthorityReady: true,
    ...buildStartupAuthorityObservation(),
  });
  events.push({
    ...base,
    time: '2026-08-25T00:00:11.000Z',
    releaseAuthorized: true,
    observedAuthorityReady: true,
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
  });
  events.push({
    ...base,
    time: '2026-08-25T00:00:12.000Z',
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
  const terminalBase = {
    ...base,
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
    readyNodeIds: ['joiner-a', 'joiner-b'],
    pendingNodeIds: [],
  };
  events.push({
    ...terminalBase,
    time: '2026-08-25T00:00:39.000Z',
    state: 'terminal_pending',
    reason: 'terminal_durability_pending',
    pendingTerminalState: 'complete',
    pendingTerminalReason: 'captured_cohort_ready',
  });
  events.push({
    ...terminalBase,
    time: '2026-08-25T00:00:40.000Z',
    state: 'complete',
    reason: 'captured_cohort_ready',
    pendingTerminalState: null,
    pendingTerminalReason: null,
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

export {
  buildCohort,
  buildPassingEvents,
  buildPhysicalEvidence,
  buildStartupAuthorityObservation,
  FINGERPRINT,
  GENERATION,
};
