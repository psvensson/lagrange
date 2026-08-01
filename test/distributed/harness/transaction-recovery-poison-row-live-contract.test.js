import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {test} from '../../../src/test-helpers/tap.js';
import {
  assertPoisonRowHandoffEvidence,
  buildPoisonMutationWitness,
  extractHandoffEvidence,
  getDurableRejoinCandidates,
  isDurableRejoinPoisonCheckpoint,
  resolveExpectedRouteSource,
} from '../scenarios/transaction-recovery-poison-row-live.js';
import {QUERY_ERROR_CODE} from
  '../../../src/query/query-constants.js';
import {normalizeProbeEnvelope} from
  './startup-runtime-handoff-probe.js';

const RECOVERY_OUTCOME_INCOMPLETE = 'transaction_recovery_incomplete';
const POISON_DIMENSION = 'commit_mode';
const DURABLE_REJOIN_ROUTE_SOURCE = 'ddb-test-reuse-7-7:8080';
const HANDOFF_SAMPLE_OBSERVED = 'observed';
const HANDOFF_SAMPLE_UNOBSERVED = 'unobserved';
const TYPED_OUTCOME_OBSERVED_AT_MS = 10;
const RESTART_STARTED_AT_MS = 5;
const RESTART_SETTLED_AT_MS = 20;
const DURABLE_REJOIN_NODE_ID = 'joiner-node';
const DURABLE_REJOIN_SESSION_ID = 'join-session-2';
const DURABLE_REJOIN_STARTED_AT_MS = 100;
const REPOSITORY_ROOT_URL = new URL('../../../', import.meta.url);
const SEALED_LIVE_AB_VEHICLE = Object.freeze({
  config: Object.freeze({
    path: 'test/distributed/config/local-poison-row-ab.json',
    sha256: '82ded6a20e5932f38b1767d06d56f234340ce97b1d0af223db6d89e16d9dd0a0',
  }),
  probe: Object.freeze({
    path: 'test/distributed/harness/startup-runtime-handoff-probe.js',
    sha256: '47a13484bc82a48bc556e893b0cb121db9e7f2bb7e97ea812e3f57019f3fba96',
  }),
  scenario: Object.freeze({
    path: 'test/distributed/scenarios/' +
      'transaction-recovery-poison-row-live.js',
    sha256: 'a111a8db98f11385274a9c363060213e1c62e0d6a3a50c7ffc4954eb6d138497',
  }),
  runner: Object.freeze({
    path: 'solve/changes/transaction-recovery-poison-row-invariant/' +
      'live-ab/run-sample.sh',
    sha256: '5a0a2a92eeefea2c2e1a74f77c4b05c39f5be8695527b5acfbfe11fe2fbba3af',
  }),
});

const VALID_ASSERTION_OPTIONS = Object.freeze({
  expectedRouteSource: DURABLE_REJOIN_ROUTE_SOURCE,
  restartStartedAtMs: RESTART_STARTED_AT_MS,
  restartSettledAtMs: RESTART_SETTLED_AT_MS,
});

function buildValidCapture() {
  const evidence = {
    sampleState: HANDOFF_SAMPLE_OBSERVED,
    ready: false,
    transactionRecoveryState: 'failed',
    transactionRecoveryReady: false,
    outcome: {
      kind: RECOVERY_OUTCOME_INCOMPLETE,
      errorCode: QUERY_ERROR_CODE.TRANSACTION_RECOVERY_INCOMPLETE,
      decisionDimension: POISON_DIMENSION,
      routeSource: DURABLE_REJOIN_ROUTE_SOURCE,
    },
  };
  return {
    sampleCount: 2,
    firstFailedSample: evidence,
    typedOutcomeSample: evidence,
    typedOutcomeObservedAtMs: TYPED_OUTCOME_OBSERVED_AT_MS,
    genericAdmissionObservedBeforeTypedOutcome: false,
    lastSample: {at: 1, evidence},
  };
}

function sha256File(relativePath) {
  const bytes = readFileSync(new URL(relativePath, REPOSITORY_ROOT_URL));
  return createHash('sha256').update(bytes).digest('hex');
}

test('sealed durable poison-row A/B binds the current live vehicle', (t) => {
  for (const [vehiclePart, identity] of
    Object.entries(SEALED_LIVE_AB_VEHICLE)) {
    t.equal(
      identity.sha256,
      sha256File(identity.path),
      `${vehiclePart} evidence is byte-identical to the current vehicle`,
    );
  }
  t.end();
});

test(
  'poison-row mutation arms only at a current durable-rejoin checkpoint',
  (t) => {
    const workflow = {
      workflowKind: 'join',
      nodeId: DURABLE_REJOIN_NODE_ID,
      sessionId: DURABLE_REJOIN_SESSION_ID,
      checkpoint: 'MEMBERSHIP_WRITTEN',
      createdAt: DURABLE_REJOIN_STARTED_AT_MS + 1,
      updatedAt: DURABLE_REJOIN_STARTED_AT_MS + 2,
      terminal: false,
    };
    const options = {
      nodeId: DURABLE_REJOIN_NODE_ID,
      restartStartedAtMs: DURABLE_REJOIN_STARTED_AT_MS,
    };
    t.equal(
      isDurableRejoinPoisonCheckpoint(workflow, options),
      true,
      'the current join membership checkpoint opens the window',
    );
    workflow.checkpoint = 'READY_LEASE_ASSIGNED';
    t.equal(
      isDurableRejoinPoisonCheckpoint(workflow, options),
      true,
      'the ready lease remains a pre-final-attachment checkpoint',
    );
    workflow.checkpoint = 'FINALIZED';
    t.equal(
      isDurableRejoinPoisonCheckpoint(workflow, options),
      false,
      'finalized join state is too late to arm poison',
    );
    workflow.checkpoint = 'JOIN_INFRASTRUCTURE_READY';
    t.equal(
      isDurableRejoinPoisonCheckpoint(workflow, options),
      false,
      'infrastructure readiness is too early to poison membership work',
    );
    workflow.checkpoint = 'MEMBERSHIP_WRITTEN';
    workflow.createdAt = DURABLE_REJOIN_STARTED_AT_MS - 1;
    t.equal(
      isDurableRejoinPoisonCheckpoint(workflow, options),
      false,
      'a persisted checkpoint from the prior incarnation cannot arm poison',
    );
    workflow.createdAt = DURABLE_REJOIN_STARTED_AT_MS + 1;
    t.equal(
      isDurableRejoinPoisonCheckpoint(Object.create(workflow), options),
      false,
      'inherited workflow evidence cannot synthesize an activation window',
    );
    t.end();
  },
);

test(
  'poison-row live selection uses non-seed candidates and exact route maps',
  (t) => {
    const seedNode = {id: 'seed-node', role: 'seed'};
    const earlyJoinerNode = {id: 'early-joiner-node', role: 'joiner'};
    const joinerNode = {id: 'joiner-node', role: 'joiner'};
    const nodes = [seedNode, earlyJoinerNode, joinerNode];
    t.same(
      getDurableRejoinCandidates(nodes),
      [joinerNode, earlyJoinerNode],
      'the live vehicle checks later joiners first for zero leadership',
    );
    t.same(
      getDurableRejoinCandidates([seedNode]),
      [],
      'a seed-only inventory cannot masquerade as durable-rejoin coverage',
    );
    t.equal(
      resolveExpectedRouteSource(nodes, earlyJoinerNode, [
        'ddb-test-reuse-3-1:8080',
        'ddb-test-reuse-3-2:8080',
        'ddb-test-reuse-3-3:8080',
      ]),
      'ddb-test-reuse-3-2:8080',
      'the selected joiner maps to its exact configured route',
    );
    t.equal(
      resolveExpectedRouteSource(nodes, earlyJoinerNode, [
        'ddb-test-reuse-3-1:8080',
      ]),
      null,
      'an incomplete route map fails closed',
    );
    t.end();
  },
);

test(
  'poison-row mutation observation requires an own exact one-row receipt',
  (t) => {
    t.same(
      buildPoisonMutationWitness({affectedRows: 1, operation: 'update'}),
      {
        transactionId: 'tx-poison-live-ab-1pc',
        commitMode: 'ONE_PHASE_COMMIT',
        frozenParticipantCount: 2,
        affectedRows: 1,
        operation: 'update',
        observation: 'mutation_receipt',
      },
      'the durable poison UPDATE receipt becomes the pre-restart witness',
    );
    t.throws(
      () => buildPoisonMutationWitness({affectedRows: 0}),
      {message: /exact one-row mutation receipt/},
      'a no-op poison mutation cannot produce a live witness',
    );
    t.throws(
      () => buildPoisonMutationWitness({}),
      {message: /exact one-row mutation receipt/},
      'a missing mutation count cannot produce a live witness',
    );
    t.throws(
      () => buildPoisonMutationWitness(
        Object.create({affectedRows: 1}),
      ),
      {message: /exact one-row mutation receipt/},
      'an inherited mutation count cannot produce a live witness',
    );
    t.end();
  },
);

test(
  'poison-row live validation fails closed when the startup handoff owner ' +
    'publishes no typed sample',
  (t) => {
    const capture = buildValidCapture();
    capture.typedOutcomeSample = {sampleState: HANDOFF_SAMPLE_UNOBSERVED};
    t.throws(
      () => assertPoisonRowHandoffEvidence(capture, VALID_ASSERTION_OPTIONS),
      {message: /typed transaction_recovery_incomplete outcome/},
      'an unobserved typed sample cannot produce a live PASS',
    );
    t.end();
  },
);

test(
  'poison-row live validation requires failed owner state, decision dimension, ' +
    'and canonical route source',
  (t) => {
    const missingFailure = buildValidCapture();
    missingFailure.firstFailedSample = {
      sampleState: HANDOFF_SAMPLE_UNOBSERVED,
    };
    t.throws(
      () => assertPoisonRowHandoffEvidence(
        missingFailure,
        VALID_ASSERTION_OPTIONS,
      ),
      {message: /failed transaction recovery sample/},
      'the live vehicle requires an owner-recorded failure sample',
    );

    const wrongDimension = buildValidCapture();
    wrongDimension.typedOutcomeSample.outcome.decisionDimension =
      'frozen_participant_count';
    t.throws(
      () => assertPoisonRowHandoffEvidence(
        wrongDimension,
        VALID_ASSERTION_OPTIONS,
      ),
      {message: /commit_mode/},
      'the live vehicle requires the poison-row decision dimension',
    );

    const missingRoute = buildValidCapture();
    delete missingRoute.typedOutcomeSample.outcome.routeSource;
    t.throws(
      () => assertPoisonRowHandoffEvidence(
        missingRoute,
        VALID_ASSERTION_OPTIONS,
      ),
      {message: /route source/},
      'the live vehicle requires canonical route attribution',
    );

    t.doesNotThrow(
      () => assertPoisonRowHandoffEvidence(
        buildValidCapture(),
        VALID_ASSERTION_OPTIONS,
      ),
      'a complete typed owner witness satisfies the live contract',
    );
    t.end();
  },
);

test(
  'raw readiness probing retains typed startup handoff fields from a 503',
  (t) => {
    const handoff = {
      startupBranch: 'seed',
      infrastructureJoinComplete: true,
      canonicalAuthorityConsumed: true,
      canonicalAuthorityState: 'resolved',
      canonicalAuthoritySource: DURABLE_REJOIN_ROUTE_SOURCE,
      transactionRecoveryState: 'failed',
      transactionRecoveryReady: false,
      transactionRecoveryOutcome: {
        kind: RECOVERY_OUTCOME_INCOMPLETE,
        errorCode: QUERY_ERROR_CODE.TRANSACTION_RECOVERY_INCOMPLETE,
        decisionDimension: POISON_DIMENSION,
        routeSource: DURABLE_REJOIN_ROUTE_SOURCE,
      },
      ready: false,
    };
    const normalized = normalizeProbeEnvelope({
      status: 503,
      body: {startupRuntimeHandoff: handoff},
    });
    t.equal(normalized.status, 503, 'the unavailable status is preserved');
    t.same(
      normalized.startupRuntimeHandoff,
      handoff,
      'typed handoff metadata survives the readiness normalization seam',
    );
    t.end();
  },
);

test(
  'poison-row diagnostics reject inherited and accessor-synthesized evidence',
  (t) => {
    const validHandoff = {
      ready: false,
      transactionRecoveryState: 'failed',
      transactionRecoveryReady: false,
      transactionRecoveryOutcome: {
        kind: RECOVERY_OUTCOME_INCOMPLETE,
        errorCode: QUERY_ERROR_CODE.TRANSACTION_RECOVERY_INCOMPLETE,
        decisionDimension: POISON_DIMENSION,
        routeSource: DURABLE_REJOIN_ROUTE_SOURCE,
      },
    };
    const inheritedDiagnostics = Object.create({
      startupRuntimeHandoff: validHandoff,
    });
    t.equal(
      extractHandoffEvidence(inheritedDiagnostics),
      null,
      'inherited handoff state is not evidence',
    );

    let accessorReadCount = 0;
    const accessorDiagnostics = {};
    Object.defineProperty(accessorDiagnostics, 'startupRuntimeHandoff', {
      configurable: true,
      get() {
        accessorReadCount += 1;
        return validHandoff;
      },
    });
    t.equal(
      extractHandoffEvidence(accessorDiagnostics),
      null,
      'an accessor cannot synthesize handoff evidence',
    );
    t.equal(accessorReadCount, 0, 'diagnostic accessors are never executed');

    const inheritedCapture = Object.create(buildValidCapture());
    t.throws(
      () => assertPoisonRowHandoffEvidence(
        inheritedCapture,
        VALID_ASSERTION_OPTIONS,
      ),
      {message: /failed transaction recovery sample/},
      'inherited capture fields cannot produce a pass',
    );
    t.end();
  },
);

test(
  'poison-row validation requires canonical route equality and typed-first ' +
    'ordering',
  (t) => {
    const wrongRoute = buildValidCapture();
    wrongRoute.typedOutcomeSample.outcome.routeSource = 'wrong-seed:8080';
    t.throws(
      () => assertPoisonRowHandoffEvidence(
        wrongRoute,
        VALID_ASSERTION_OPTIONS,
      ),
      {message: /canonical route source/},
      'a nonempty but noncanonical route cannot pass',
    );

    const lateTypedOutcome = buildValidCapture();
    lateTypedOutcome.typedOutcomeObservedAtMs = RESTART_SETTLED_AT_MS + 1;
    t.throws(
      () => assertPoisonRowHandoffEvidence(
        lateTypedOutcome,
        VALID_ASSERTION_OPTIONS,
      ),
      {message: /must precede generic admission classification/},
      'typed attribution observed after restart settlement cannot pass',
    );

    const genericFirst = buildValidCapture();
    genericFirst.genericAdmissionObservedBeforeTypedOutcome = true;
    t.throws(
      () => assertPoisonRowHandoffEvidence(
        genericFirst,
        VALID_ASSERTION_OPTIONS,
      ),
      {message: /must precede generic admission classification/},
      'generic admission observed first cannot pass',
    );
    t.end();
  },
);
