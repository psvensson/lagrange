import {test} from '../../../../src/test-helpers/tap.js';
import {
  BENCHMARK_RESOURCE_CLAIM_EVIDENCE_STATE,
} from '../benchmark-resource-claim-evidence-view.js';
import {
  inspectBenchmarkResourceClaimEvidenceRoot,
  validateBenchmarkResourceEvidenceRoot,
} from '../benchmark-resource-evidence-root.js';
import {
  BENCHMARK_RESOURCE_MEASUREMENT_OUTCOME_STATE,
  BENCHMARK_RESOURCE_MEASUREMENT_REASON,
  BENCHMARK_RESOURCE_MEASUREMENT_RETRY,
  benchmarkResourceStaleMeasurementOutcome,
  createBenchmarkResourceMeasurementOutcome,
  inspectBenchmarkResourceMeasurementOutcome,
} from '../benchmark-resource-measurement-outcome.js';
import {
  BENCHMARK_RESOURCE_WINDOW_COORDINATE_REASON,
  appendBenchmarkResourceMeasuredWindowCoordinate,
  assertBenchmarkResourceMeasuredWindowCoordinatesComplete,
  createBenchmarkResourceWindowCoordinateContext,
} from '../benchmark-resource-window-coordinate-validation.js';
import {
  createBenchmarkResourceEvidenceFixture,
} from './benchmark-resource-evidence-test-fixture.js';

const PROFILE_IDENTITY = `sha256:${'a'.repeat(64)}`;
const SIDE_IDS = Object.freeze(['candidate', 'baseline']);
const expected = Object.freeze({
  matrixManifestDigest: `sha256:${'b'.repeat(64)}`,
  matrixId: 'matrix',
  cellId: 'cell',
  pairId: 'pair',
  runId: 'run',
  profileIdentity: PROFILE_IDENTITY,
  sideIds: SIDE_IDS,
});

function measuredWindow(sideId, blockedOrderIndex, overrides = {}) {
  const blockIndex = overrides.blockIndex ?? 0;
  const loadIndex = overrides.loadIndex ?? 0;
  const startedMinute = overrides.startedMinute ?? blockIndex;
  return {
    matrixManifestDigest: expected.matrixManifestDigest,
    matrixId: expected.matrixId,
    cellId: expected.cellId,
    pairId: expected.pairId,
    runId: expected.runId,
    profileIdentity: expected.profileIdentity,
    sideId,
    pairedBlockId:
      overrides.pairedBlockId ?? `block-${blockIndex}-load-${loadIndex}`,
    blockIndex,
    blockedOrderIndex,
    offeredLoad: overrides.offeredLoad ?? 1_000,
    loadIndex,
    phase: overrides.phase ?? 'measured',
    startedAt:
      `2026-07-27T12:${String(startedMinute).padStart(2, '0')}:00.000Z`,
    endedAt:
      `2026-07-27T12:${String(startedMinute + 1).padStart(2, '0')}:00.000Z`,
  };
}

function appendPairedBlock(context, blockIndex) {
  appendBenchmarkResourceMeasuredWindowCoordinate(
    context,
    measuredWindow('candidate', blockIndex % 2, {
      blockIndex,
      startedMinute: blockIndex * 2,
    }),
    expected,
  );
  appendBenchmarkResourceMeasuredWindowCoordinate(
    context,
    measuredWindow('baseline', (blockIndex + 1) % 2, {
      blockIndex,
      startedMinute: blockIndex * 2 + 1,
    }),
    expected,
  );
}

test('C4 admits exact repeated paired coordinates and rooted profile bytes',
  (t) => {
    const context = createBenchmarkResourceWindowCoordinateContext();
    appendPairedBlock(context, 0);
    appendPairedBlock(context, 1);
    t.doesNotThrow(() =>
      assertBenchmarkResourceMeasuredWindowCoordinatesComplete(
        context,
        SIDE_IDS,
        [
          measuredWindow('candidate', 0, {startedMinute: 0}),
          measuredWindow('baseline', 1, {startedMinute: 1}),
          measuredWindow('candidate', 1, {
            blockIndex: 1,
            startedMinute: 2,
          }),
          measuredWindow('baseline', 0, {
            blockIndex: 1,
            startedMinute: 3,
          }),
        ],
      ));

    const fixture = createBenchmarkResourceEvidenceFixture();
    const validation = validateBenchmarkResourceEvidenceRoot(fixture.receipt);
    const inspection =
      inspectBenchmarkResourceClaimEvidenceRoot(fixture.receipt);
    t.match(validation, {valid: true});
    t.equal(inspection.state, BENCHMARK_RESOURCE_CLAIM_EVIDENCE_STATE.ACCEPTED);
    t.same(inspection.evidence.profile, {
      id: fixture.profileEnvelope.artifact.payload.profile.id,
      identity: fixture.profileEnvelope.artifact.payload.profileIdentity,
      envelopeDigest: fixture.profileEnvelope.digest,
    });
    t.equal(
      inspection.evidence.measurementOutcome.state,
      BENCHMARK_RESOURCE_MEASUREMENT_OUTCOME_STATE.NON_MEASURING,
    );
    t.end();
  });

test('C4 rejects duplicate, overlap, cross-load, phase, and missing joins',
  (t) => {
    const duplicate = createBenchmarkResourceWindowCoordinateContext();
    const candidate = measuredWindow('candidate', 0);
    appendBenchmarkResourceMeasuredWindowCoordinate(
      duplicate,
      candidate,
      expected,
    );
    t.throws(
      () => appendBenchmarkResourceMeasuredWindowCoordinate(
        duplicate,
        candidate,
        expected,
      ),
      new RegExp(BENCHMARK_RESOURCE_WINDOW_COORDINATE_REASON.DUPLICATE, 'u'),
    );

    const overlap = createBenchmarkResourceWindowCoordinateContext();
    appendBenchmarkResourceMeasuredWindowCoordinate(
      overlap,
      candidate,
      expected,
    );
    t.throws(
      () => appendBenchmarkResourceMeasuredWindowCoordinate(
        overlap,
        measuredWindow('baseline', 1),
        expected,
      ),
      new RegExp(BENCHMARK_RESOURCE_WINDOW_COORDINATE_REASON.OVERLAP, 'u'),
    );

    const sameSideOverlap = createBenchmarkResourceWindowCoordinateContext();
    appendBenchmarkResourceMeasuredWindowCoordinate(
      sameSideOverlap,
      candidate,
      expected,
    );
    t.throws(
      () => appendBenchmarkResourceMeasuredWindowCoordinate(
        sameSideOverlap,
        measuredWindow('candidate', 1, {
          blockIndex: 1,
          pairedBlockId: 'block-1-load-0',
          startedMinute: 0,
        }),
        expected,
      ),
      new RegExp(BENCHMARK_RESOURCE_WINDOW_COORDINATE_REASON.OVERLAP, 'u'),
    );

    const crossLoad = createBenchmarkResourceWindowCoordinateContext();
    appendBenchmarkResourceMeasuredWindowCoordinate(
      crossLoad,
      candidate,
      expected,
    );
    t.throws(
      () => appendBenchmarkResourceMeasuredWindowCoordinate(
        crossLoad,
        measuredWindow('baseline', 1, {
          offeredLoad: 2_000,
          startedMinute: 1,
        }),
        expected,
      ),
      new RegExp(
        BENCHMARK_RESOURCE_WINDOW_COORDINATE_REASON.PAIRED_BLOCK_MISMATCH,
        'u',
      ),
    );
    const omittedPair = createBenchmarkResourceWindowCoordinateContext();
    appendPairedBlock(omittedPair, 0);
    t.throws(
      () => assertBenchmarkResourceMeasuredWindowCoordinatesComplete(
        omittedPair,
        SIDE_IDS,
        [
          measuredWindow('candidate', 0, {startedMinute: 0}),
          measuredWindow('baseline', 1, {startedMinute: 1}),
          measuredWindow('candidate', 1, {
            blockIndex: 1,
            startedMinute: 2,
          }),
          measuredWindow('baseline', 0, {
            blockIndex: 1,
            startedMinute: 3,
          }),
        ],
      ),
      new RegExp(
        BENCHMARK_RESOURCE_WINDOW_COORDINATE_REASON.EXPECTED_SET_MISMATCH,
        'u',
      ),
    );
    t.throws(
      () => appendBenchmarkResourceMeasuredWindowCoordinate(
        createBenchmarkResourceWindowCoordinateContext(),
        measuredWindow('candidate', 0, {phase: 'warmup'}),
        expected,
      ),
      new RegExp(BENCHMARK_RESOURCE_WINDOW_COORDINATE_REASON.PHASE, 'u'),
    );
    t.throws(
      () => assertBenchmarkResourceMeasuredWindowCoordinatesComplete(
        duplicate,
        SIDE_IDS,
      ),
      new RegExp(
        BENCHMARK_RESOURCE_WINDOW_COORDINATE_REASON.PAIRED_BLOCK_INCOMPLETE,
        'u',
      ),
    );
    t.end();
  });

test('C4 claim inspection snapshots each resolved artifact exactly once',
  (t) => {
    const fixture = createBenchmarkResourceEvidenceFixture();
    const counts = new Map();
    const resolver = {
      resolve(digest) {
        counts.set(digest, (counts.get(digest) ?? 0) + 1);
        return fixture.receipt.resolver.resolve(digest);
      },
    };
    const inspection = inspectBenchmarkResourceClaimEvidenceRoot({
      rootDigest: fixture.root.digest,
      resolver,
    });

    t.equal(inspection.state, BENCHMARK_RESOURCE_CLAIM_EVIDENCE_STATE.ACCEPTED);
    t.ok([...counts.values()].every((count) => count === 1));
    t.end();
  });

test('canonical measurement outcomes retain exact retry classification',
  (t) => {
    const states = Object.values(
      BENCHMARK_RESOURCE_MEASUREMENT_OUTCOME_STATE,
    );
    const reasons = [
      BENCHMARK_RESOURCE_MEASUREMENT_REASON.EVIDENCE_COMPLETE,
      BENCHMARK_RESOURCE_MEASUREMENT_REASON.EVIDENCE_NOT_CLAIM_ELIGIBLE,
      BENCHMARK_RESOURCE_MEASUREMENT_REASON.EVIDENCE_INVALID,
      BENCHMARK_RESOURCE_MEASUREMENT_REASON.EVIDENCE_EXPIRED,
      BENCHMARK_RESOURCE_MEASUREMENT_REASON.OBSERVATION_MISSING,
    ];
    for (let index = 0; index < states.length; index += 1) {
      const outcome = createBenchmarkResourceMeasurementOutcome(
        states[index],
        reasons[index],
      );
      t.match(
        inspectBenchmarkResourceMeasurementOutcome(outcome),
        {valid: true},
      );
      t.equal(
        outcome.reason.retry,
        states[index] ===
          BENCHMARK_RESOURCE_MEASUREMENT_OUTCOME_STATE.TRANSIENT ?
          BENCHMARK_RESOURCE_MEASUREMENT_RETRY.RETRYABLE :
          BENCHMARK_RESOURCE_MEASUREMENT_RETRY.NEVER,
      );
    }
    t.equal(
      benchmarkResourceStaleMeasurementOutcome(
        BENCHMARK_RESOURCE_MEASUREMENT_REASON.EVIDENCE_EXPIRED,
      ).state,
      BENCHMARK_RESOURCE_MEASUREMENT_OUTCOME_STATE.STALE_INELIGIBLE,
    );
    const symbolExtra = {
      state: BENCHMARK_RESOURCE_MEASUREMENT_OUTCOME_STATE.MEASURING,
      reason: {
        code: BENCHMARK_RESOURCE_MEASUREMENT_REASON.EVIDENCE_COMPLETE,
        retry: BENCHMARK_RESOURCE_MEASUREMENT_RETRY.NEVER,
      },
    };
    Object.defineProperty(symbolExtra, Symbol('extra'), {value: true});
    t.match(
      inspectBenchmarkResourceMeasurementOutcome(symbolExtra),
      {valid: false},
    );
    t.match(
      inspectBenchmarkResourceMeasurementOutcome({
        state: BENCHMARK_RESOURCE_MEASUREMENT_OUTCOME_STATE.INVALID,
        reason: Object.assign([], {
          code: BENCHMARK_RESOURCE_MEASUREMENT_REASON.EVIDENCE_INVALID,
          retry: BENCHMARK_RESOURCE_MEASUREMENT_RETRY.NEVER,
        }),
      }),
      {valid: false},
    );
    t.throws(
      () => createBenchmarkResourceMeasurementOutcome(
        BENCHMARK_RESOURCE_MEASUREMENT_OUTCOME_STATE.INVALID,
        '',
      ),
      new RegExp('measurementOutcome.reason.code:text_required', 'u'),
    );

    const missing = inspectBenchmarkResourceClaimEvidenceRoot({
      rootDigest: `sha256:${'c'.repeat(64)}`,
      resolver: {resolve() {
        return undefined;
      }},
    });
    t.equal(
      missing.measurementOutcome.state,
      BENCHMARK_RESOURCE_MEASUREMENT_OUTCOME_STATE.TRANSIENT,
    );
    t.end();
  });
