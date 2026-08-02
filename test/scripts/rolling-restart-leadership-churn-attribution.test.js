import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OUTCOME,
  analyzeLeadershipChurn,
  inspectNodeCaptureLines,
} from '../../scripts/rolling-restart-leadership-churn-attribution.js';

const PARTITION_ID = 'sql_transactions-p1';
const NODE_A = 'node-a';
const NODE_B = 'node-b';
const OBSERVED_BEFORE_MS = 10_000;
const OBSERVED_AFTER_MS = 20_000;

function signature(leaderNodeId) {
  return JSON.stringify([[PARTITION_ID, leaderNodeId]]);
}

function reset({
  observedAtMs,
  selectedNodeId,
  selectedLeader,
  observerLeaders,
}) {
  return {
    observedAtMs,
    selectedNodeId,
    leaderSignature: signature(selectedLeader),
    leaderObservations: Object.entries(observerLeaders).map(
      ([nodeId, leaderNodeId]) => ({
        nodeId,
        capturedAtMs: observedAtMs - 1,
        leaderSignature: signature(leaderNodeId),
        leaderCount: 1,
      }),
    ),
  };
}

function transition({
  nodeId,
  role,
  term,
  timeMs,
  trigger,
  replicaId = `${nodeId}-r`,
  peerCohort = ['r1', 'r2', 'r3'],
}) {
  return {
    msg: 'Raft leadership transition evidence',
    eventType: 'role_transition',
    partitionId: PARTITION_ID,
    nodeId,
    replicaId,
    role,
    term,
    trigger,
    peerCohort,
    timeMs,
    time: new Date(timeMs).toISOString(),
    evidencePath: `${nodeId}.log.gz:1`,
  };
}

function completeCapture(nodeId) {
  return {nodeId, complete: true, problems: []};
}

test('attributes a reset to a witnessed higher-term campaign and election', () => {
  const result = analyzeLeadershipChurn({
    resetHistory: [
      reset({
        observedAtMs: OBSERVED_BEFORE_MS,
        selectedNodeId: NODE_A,
        selectedLeader: NODE_A,
        observerLeaders: {[NODE_A]: NODE_A, [NODE_B]: NODE_A},
      }),
      reset({
        observedAtMs: OBSERVED_AFTER_MS,
        selectedNodeId: NODE_A,
        selectedLeader: NODE_B,
        observerLeaders: {[NODE_A]: NODE_B, [NODE_B]: NODE_B},
      }),
    ],
    records: [
      transition({
        nodeId: NODE_A,
        role: 'leader',
        term: 4,
        timeMs: 5_000,
        trigger: 'quorum_elected',
      }),
      {
        msg: 'Event loop gap detected',
        nodeId: NODE_B,
        gapMs: 1_200,
        timeMs: 17_000,
        time: new Date(17_000).toISOString(),
        evidencePath: 'node-b.log.gz:2',
      },
      transition({
        nodeId: NODE_B,
        role: 'candidate',
        term: 5,
        timeMs: 18_000,
        trigger: 'campaign_started',
      }),
      transition({
        nodeId: NODE_B,
        role: 'leader',
        term: 5,
        timeMs: 18_500,
        trigger: 'quorum_elected',
      }),
    ],
    captureIntegrity: [completeCapture(NODE_A), completeCapture(NODE_B)],
  });

  assert.equal(result.signatureResetCount, 1);
  assert.equal(result.resets[0].outcome, OUTCOME.REAL);
  const attribution = result.resets[0].partitionTransitions[0];
  assert.equal(attribution.partitionId, PARTITION_ID);
  assert.equal(attribution.oldLeader, NODE_A);
  assert.equal(attribution.newLeader, NODE_B);
  assert.equal(attribution.oldTerm, 4);
  assert.equal(attribution.newTerm, 5);
  assert.equal(attribution.campaignWitness.trigger, 'campaign_started');
  assert.deepEqual(attribution.peerCohort, ['r1', 'r2', 'r3']);
  assert.equal(attribution.eventLoopContext.nearest.gapMs, 1_200);
  assert.deepEqual(attribution.missingWitnesses, []);
});

function contradictoryObserverHistory() {
  const observerLeaders = {[NODE_A]: NODE_A, [NODE_B]: NODE_B};
  return [
    reset({
      observedAtMs: OBSERVED_BEFORE_MS,
      selectedNodeId: NODE_A,
      selectedLeader: NODE_A,
      observerLeaders,
    }),
    reset({
      observedAtMs: OBSERVED_AFTER_MS,
      selectedNodeId: NODE_B,
      selectedLeader: NODE_B,
      observerLeaders,
    }),
  ];
}

function unchangedAuthoritativeStateRecords() {
  const cohort = ['r1', 'r2'];
  return [
    transition({
      replicaId: 'r1',
      nodeId: NODE_A,
      role: 'leader',
      term: 3,
      timeMs: 5_000,
      trigger: 'quorum_elected',
      peerCohort: cohort,
    }),
    transition({
      replicaId: 'r2',
      nodeId: NODE_B,
      role: 'follower',
      term: 3,
      timeMs: 5_100,
      trigger: 'leader_observed',
      peerCohort: cohort,
    }),
  ];
}

test('attributes observer selection flips only with unchanged authoritative state',
  () => {
    const result = analyzeLeadershipChurn({
      resetHistory: contradictoryObserverHistory(),
      records: unchangedAuthoritativeStateRecords(),
      captureIntegrity: [completeCapture(NODE_A), completeCapture(NODE_B)],
    });

    assert.equal(result.resets[0].outcome, OUTCOME.ARTIFACT);
    assert.deepEqual(
      result.resets[0].partitionTransitions[0].observationProof,
      {
        authoritativeStateUnchanged: true,
        previousObserver: NODE_A,
        currentObserver: NODE_B,
        stableObserverLeaders: {[NODE_A]: NODE_A, [NODE_B]: NODE_B},
        authoritativeLeader: NODE_A,
        authoritativeTerm: 3,
        peerCohort: ['r1', 'r2'],
        replicaStateWitnesses: [
          {
            replicaId: 'r1',
            nodeId: NODE_A,
            role: 'leader',
            term: 3,
            evidencePath: `${NODE_A}.log.gz:1`,
          },
          {
            replicaId: 'r2',
            nodeId: NODE_B,
            role: 'follower',
            term: 3,
            evidencePath: `${NODE_B}.log.gz:1`,
          },
        ],
        intervalTransitionCount: 0,
      },
    );
  });

test('stable contradictory observers without authoritative history stay incomplete',
  () => {
    const result = analyzeLeadershipChurn({
      resetHistory: contradictoryObserverHistory(),
    });

    assert.equal(result.resets[0].outcome, OUTCOME.INCOMPLETE);
    assert.equal(
      result.resets[0].partitionTransitions[0].observationProof,
      undefined,
    );
  });

test('stable contradictory observers with an interval transition stay incomplete',
  () => {
    const result = analyzeLeadershipChurn({
      resetHistory: contradictoryObserverHistory(),
      records: [
        ...unchangedAuthoritativeStateRecords(),
        transition({
          replicaId: 'r1',
          nodeId: NODE_A,
          role: 'leader',
          term: 3,
          timeMs: 15_000,
          trigger: 'heartbeat_reasserted',
          peerCohort: ['r1', 'r2'],
        }),
      ],
      captureIntegrity: [completeCapture(NODE_A), completeCapture(NODE_B)],
    });

    assert.equal(result.resets[0].outcome, OUTCOME.INCOMPLETE);
    assert.equal(
      result.resets[0].partitionTransitions[0].observationProof,
      undefined,
    );
  });

test('stable contradictory observers with incomplete capture stay incomplete',
  () => {
    const result = analyzeLeadershipChurn({
      resetHistory: contradictoryObserverHistory(),
      records: unchangedAuthoritativeStateRecords(),
      captureIntegrity: [
        completeCapture(NODE_A),
        {nodeId: NODE_B, complete: false, problems: ['incarnation_2_empty']},
      ],
    });

    assert.equal(result.resets[0].outcome, OUTCOME.INCOMPLETE);
    assert.equal(
      result.resets[0].partitionTransitions[0].observationProof,
      undefined,
    );
  });

function realTransitionHistory() {
  return [
    reset({
      observedAtMs: OBSERVED_BEFORE_MS,
      selectedNodeId: NODE_A,
      selectedLeader: NODE_A,
      observerLeaders: {[NODE_A]: NODE_A, [NODE_B]: NODE_A},
    }),
    reset({
      observedAtMs: OBSERVED_AFTER_MS,
      selectedNodeId: NODE_A,
      selectedLeader: NODE_B,
      observerLeaders: {[NODE_A]: NODE_B, [NODE_B]: NODE_B},
    }),
  ];
}

function analyzeWithTerms({oldTerm, newTerm}) {
  return analyzeLeadershipChurn({
    resetHistory: realTransitionHistory(),
    records: [
      transition({
        nodeId: NODE_A,
        role: 'leader',
        term: oldTerm,
        timeMs: 5_000,
        trigger: 'quorum_elected',
      }),
      transition({
        nodeId: NODE_B,
        role: 'candidate',
        term: newTerm,
        timeMs: 18_000,
        trigger: 'campaign_started',
      }),
      transition({
        nodeId: NODE_B,
        role: 'leader',
        term: newTerm,
        timeMs: 18_500,
        trigger: 'quorum_elected',
      }),
    ],
    captureIntegrity: [completeCapture(NODE_A), completeCapture(NODE_B)],
  });
}

test('rejects negative-zero, negative, fractional, and unsafe-integer terms', () => {
  const rejectedTermCases = [
    {oldTerm: -0, newTerm: 1, witness: 'old_term'},
    {oldTerm: 4, newTerm: -5, witness: 'new_leader_transition'},
    {oldTerm: 4, newTerm: 5.5, witness: 'new_leader_transition'},
    {oldTerm: 4, newTerm: 2 ** 53, witness: 'new_leader_transition'},
    {oldTerm: 4, newTerm: Number.NaN, witness: 'new_leader_transition'},
  ];
  for (const {oldTerm, newTerm, witness} of rejectedTermCases) {
    const result = analyzeWithTerms({oldTerm, newTerm});
    assert.equal(
      result.resets[0].outcome,
      OUTCOME.INCOMPLETE,
      `terms ${oldTerm} -> ${newTerm} must not be a real transition`,
    );
    assert.ok(
      result.resets[0].missingWitnesses.includes(witness),
      `terms ${oldTerm} -> ${newTerm} must name witness ${witness}`,
    );
  }
});

test('rejects string terms even when Number.isFinite is poisoned', () => {
  const originalIsFinite = Number.isFinite;
  Number.isFinite = () => true;
  try {
    const result = analyzeWithTerms({oldTerm: '4', newTerm: '5'});
    assert.equal(result.resets[0].outcome, OUTCOME.INCOMPLETE);
    assert.ok(result.resets[0].missingWitnesses.includes('old_term'));
    assert.ok(
      result.resets[0].missingWitnesses.includes('new_leader_transition'),
    );
  } finally {
    Number.isFinite = originalIsFinite;
  }
});

test('malformed signature changes name the missing signature witness', () => {
  const [previous, current] = realTransitionHistory();
  previous.leaderSignature = '{"not":"entries"}';
  current.leaderSignature = 'not-json';
  const result = analyzeLeadershipChurn({resetHistory: [previous, current]});

  assert.equal(result.signatureResetCount, 1);
  assert.equal(result.resets[0].outcome, OUTCOME.INCOMPLETE);
  assert.deepEqual(
    result.resets[0].missingWitnesses,
    ['valid_leader_signature_change'],
  );
});

test('one-sided malformed signatures name the missing signature witness', () => {
  const malformedCurrentSignatures = [
    'not-json',
    '{"not":"entries"}',
    JSON.stringify([[PARTITION_ID, 5]]),
    JSON.stringify([[PARTITION_ID]]),
  ];
  for (const malformed of malformedCurrentSignatures) {
    const [previous, current] = realTransitionHistory();
    current.leaderSignature = malformed;
    const result = analyzeLeadershipChurn({resetHistory: [previous, current]});

    assert.equal(result.signatureResetCount, 1, `signature ${malformed}`);
    assert.equal(
      result.resets[0].outcome,
      OUTCOME.INCOMPLETE,
      `signature ${malformed} must stay incomplete`,
    );
    assert.deepEqual(
      result.resets[0].missingWitnesses,
      ['valid_leader_signature_change'],
      `signature ${malformed} must name the signature witness`,
    );
    assert.deepEqual(result.resets[0].partitionTransitions, []);
  }
});

test('hostile getters fire exactly once and cannot flip a verdict on re-read',
  () => {
    let termReads = 0;
    const [leaderRecord, ...otherRecords] = [
      transition({
        nodeId: NODE_B,
        role: 'leader',
        term: 5,
        timeMs: 18_500,
        trigger: 'quorum_elected',
      }),
      transition({
        nodeId: NODE_A,
        role: 'leader',
        term: 4,
        timeMs: 5_000,
        trigger: 'quorum_elected',
      }),
      transition({
        nodeId: NODE_B,
        role: 'candidate',
        term: 5,
        timeMs: 18_000,
        trigger: 'campaign_started',
      }),
    ];
    Object.defineProperty(leaderRecord, 'term', {
      enumerable: true,
      configurable: true,
      get() {
        termReads += 1;
        return termReads === 1 ? 5 : '5';
      },
    });
    const result = analyzeLeadershipChurn({
      resetHistory: realTransitionHistory(),
      records: [leaderRecord, ...otherRecords],
      captureIntegrity: [completeCapture(NODE_A), completeCapture(NODE_B)],
    });

    assert.equal(termReads, 1);
    assert.equal(result.resets[0].outcome, OUTCOME.REAL);
    assert.equal(result.resets[0].partitionTransitions[0].newTerm, 5);
  });

test('inherited properties never satisfy attribution or capture witnesses', () => {
  const pollutedKeys = {
    srcFingerprintMatches: true,
    harnessEvent: 'incarnation-boundary',
    candidateWindowResetHistory: [{}, {}],
    leaderSignature: signature(NODE_A),
  };
  const saved = {};
  for (const [key, value] of Object.entries(pollutedKeys)) {
    saved[key] = Object.getOwnPropertyDescriptor(Object.prototype, key);
    // eslint-disable-next-line no-extend-native -- adversarial intrinsic test
    Object.defineProperty(Object.prototype, key, {
      value,
      configurable: true,
      writable: true,
    });
  }
  try {
    const inspected = inspectNodeCaptureLines(NODE_A, [
      JSON.stringify({time: '2026-08-02T10:00:00.000Z', nodeId: NODE_A}),
    ], 'node-a.log.gz');
    assert.equal(inspected.integrity.boundaryCount, 0);
    assert.equal(inspected.integrity.incarnations[0].bootProvenanceCount, 0);
    assert.deepEqual(inspected.integrity.problems, [
      'incarnation_1_boot_provenance_missing',
    ]);

    const result = analyzeLeadershipChurn({
      resetHistory: [
        {observedAtMs: OBSERVED_BEFORE_MS, selectedNodeId: NODE_A},
        {observedAtMs: OBSERVED_AFTER_MS, selectedNodeId: NODE_B},
      ],
    });
    assert.equal(result.signatureResetCount, 0);
  } finally {
    for (const [key, descriptor] of Object.entries(saved)) {
      // eslint-disable-next-line no-extend-native -- restore tested intrinsic
      if (descriptor) Object.defineProperty(Object.prototype, key, descriptor);
      else delete Object.prototype[key];
    }
  }
});

test('sparse arrays with polluted numeric indices cannot fabricate history', () => {
  const [previous, current] = realTransitionHistory();
  const sparseHistory = new Array(2);
  const saved = {
    0: Object.getOwnPropertyDescriptor(Array.prototype, 0),
    1: Object.getOwnPropertyDescriptor(Array.prototype, 1),
  };
  // eslint-disable-next-line no-extend-native -- adversarial intrinsic test
  Object.defineProperty(Array.prototype, 0, {
    value: previous,
    configurable: true,
    writable: true,
  });
  // eslint-disable-next-line no-extend-native -- adversarial intrinsic test
  Object.defineProperty(Array.prototype, 1, {
    value: current,
    configurable: true,
    writable: true,
  });
  try {
    const result = analyzeLeadershipChurn({resetHistory: sparseHistory});
    assert.equal(result.resetHistoryCount, 0);
    assert.equal(result.signatureResetCount, 0);
  } finally {
    for (const [index, descriptor] of Object.entries(saved)) {
      // eslint-disable-next-line no-extend-native -- restore tested intrinsic
      if (descriptor) Object.defineProperty(Array.prototype, index, descriptor);
      else delete Array.prototype[index];
    }
  }
});

test('poisoning Object.values after module load changes nothing', () => {
  const originalValues = Object.values;
  Object.values = () => {
    throw new Error('poisoned Object.values');
  };
  try {
    const result = analyzeLeadershipChurn({
      resetHistory: contradictoryObserverHistory(),
      records: unchangedAuthoritativeStateRecords(),
      captureIntegrity: [completeCapture(NODE_A), completeCapture(NODE_B)],
    });
    assert.equal(result.resets[0].outcome, OUTCOME.ARTIFACT);
    assert.deepEqual(result.classificationContract, [
      OUTCOME.REAL,
      OUTCOME.ARTIFACT,
      OUTCOME.INCOMPLETE,
    ]);
  } finally {
    Object.values = originalValues;
  }
});

test('hostile input arrays never flow through Array.prototype.map', () => {
  const hostileInputs = [];
  const history = contradictoryObserverHistory();
  const records = unchangedAuthoritativeStateRecords();
  const captures = [completeCapture(NODE_A), completeCapture(NODE_B)];
  hostileInputs.push(history, records, captures);
  for (const entry of [...history, ...records, ...captures]) {
    for (const value of Object.values(entry)) {
      if (Array.isArray(value)) hostileInputs.push(value);
    }
  }
  const originalMap = Array.prototype.map;
  const mappedHostileReceivers = [];
  // eslint-disable-next-line no-extend-native -- adversarial intrinsic test
  Array.prototype.map = function recordingMap(...mapArgs) {
    if (hostileInputs.includes(this)) mappedHostileReceivers.push(this);
    return originalMap.apply(this, mapArgs);
  };
  try {
    const result = analyzeLeadershipChurn({
      resetHistory: history,
      records,
      captureIntegrity: captures,
    });
    assert.equal(result.resets[0].outcome, OUTCOME.ARTIFACT);
    assert.deepEqual(mappedHostileReceivers, []);
  } finally {
    // eslint-disable-next-line no-extend-native -- restore tested intrinsic
    Array.prototype.map = originalMap;
  }
});

test('retained missing-incarnation shape stays evidence-incomplete', () => {
  const result = analyzeLeadershipChurn({
    resetHistory: [
      reset({
        observedAtMs: OBSERVED_BEFORE_MS,
        selectedNodeId: NODE_A,
        selectedLeader: NODE_A,
        observerLeaders: {[NODE_A]: NODE_A},
      }),
      reset({
        observedAtMs: OBSERVED_AFTER_MS,
        selectedNodeId: NODE_A,
        selectedLeader: NODE_B,
        observerLeaders: {[NODE_A]: NODE_B},
      }),
    ],
    records: [
      transition({
        nodeId: NODE_A,
        role: 'leader',
        term: 4,
        timeMs: 5_000,
        trigger: 'quorum_elected',
      }),
      {
        msg: 'Event loop gap detected',
        nodeId: NODE_A,
        gapMs: 900,
        timeMs: 19_000,
      },
    ],
    captureIntegrity: [
      completeCapture(NODE_A),
      {
        nodeId: NODE_B,
        complete: false,
        problems: ['incarnation_2_empty', 'incarnation_2_boot_provenance_missing'],
      },
    ],
  });

  assert.equal(result.resets[0].outcome, OUTCOME.INCOMPLETE);
  assert.deepEqual(
    result.resets[0].partitionTransitions[0].missingWitnesses,
    [
      'campaign_or_heartbeat_loss',
      `capture_integrity:${NODE_B}`,
      'new_leader_transition',
      'peer_cohort',
    ],
  );
});

test('capture inspection requires runtime and boot provenance after each boundary',
  () => {
    const firstBoot = JSON.stringify({
      time: '2026-08-02T10:00:00.000Z',
      nodeId: NODE_A,
      srcFingerprintMatches: true,
    });
    const inspected = inspectNodeCaptureLines(NODE_A, [
      firstBoot,
      JSON.stringify({
        harnessEvent: 'incarnation-boundary',
        incarnation: 2,
      }),
    ], 'node-a.log.gz');

    assert.equal(inspected.integrity.complete, false);
    assert.equal(inspected.integrity.boundaryCount, 1);
    assert.equal(inspected.integrity.incarnationCount, 2);
    assert.deepEqual(inspected.integrity.problems, [
      'incarnation_2_boot_provenance_missing',
      'incarnation_2_empty',
    ]);
  });

test('non-boolean boot provenance never counts as a valid source match', () => {
  const inspected = inspectNodeCaptureLines(NODE_A, [
    JSON.stringify({
      time: '2026-08-02T10:00:00.000Z',
      nodeId: NODE_A,
      srcFingerprintMatches: 'false',
    }),
  ], 'node-a.log.gz');

  assert.equal(inspected.integrity.complete, false);
  assert.equal(inspected.integrity.incarnations[0].bootProvenanceCount, 0);
  assert.deepEqual(inspected.integrity.problems, [
    'incarnation_1_boot_provenance_missing',
    'incarnation_1_invalid_boot_provenance',
  ]);
});

test('explicit boot source mismatch is a named capture problem', () => {
  const inspected = inspectNodeCaptureLines(NODE_A, [
    JSON.stringify({
      time: '2026-08-02T10:00:00.000Z',
      nodeId: NODE_A,
      srcFingerprintMatches: false,
    }),
  ], 'node-a.log.gz');

  assert.equal(inspected.integrity.complete, false);
  assert.equal(inspected.integrity.incarnations[0].bootProvenanceCount, 0);
  assert.deepEqual(inspected.integrity.problems, [
    'incarnation_1_boot_provenance_missing',
    'incarnation_1_source_mismatch',
  ]);
});
