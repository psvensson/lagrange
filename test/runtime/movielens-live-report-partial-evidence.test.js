import {readFile} from 'node:fs/promises';
import {test} from '../../src/test-helpers/tap.js';
import {
  buildAffinityDemoLiveReport,
} from '../../examples/service-data-affinity/affinity-demo-live-report.js';
import {runComparison} from
  '../../examples/service-data-affinity/run-comparison.js';

function demoResultObservationIsValid(observedResult) {
  return Boolean(
    observedResult &&
    observedResult.learnedAffinity &&
    observedResult.learnedAffinity.resultSnapshot &&
    observedResult.learnedAffinity.resultSnapshot.state === 'available' &&
    Number.isFinite(observedResult.learnedAffinity.resultComputedAt) &&
    observedResult.learnedAffinity.resultComputedAt > 0,
  );
}

function retainObservedDemoResult(phaseEvidence, observedResult) {
  if (!demoResultObservationIsValid(observedResult)) return false;
  const retainedComputedAt =
    phaseEvidence.result?.learnedAffinity?.resultComputedAt || 0;
  const observedComputedAt = observedResult.learnedAffinity.resultComputedAt;
  if (observedComputedAt < retainedComputedAt) return false;
  phaseEvidence.result = observedResult;
  return true;
}

const TIMESTAMP = '2026-07-15T18:20:58.624Z';

function reportDetail(report) {
  return report.standardSummary.scenarios[0].detail;
}

function createComparisonTestDependencies({
  t,
  liveReports,
  ranking = [{movieId: 1, score: 2}],
  phaseEvidenceEntry = null,
  baselineError = null,
  onAffinityRun = null,
}) {
  return {
    downloadRatingsFn: async () => {},
    runPostgresBaselineFn: async () => {
      if (baselineError) throw baselineError;
      return {
        queryDurationMs: 1,
        returnedAggregateRows: 1,
        topMovies: [{movieId: 1, score: 2}],
      };
    },
    runAffinityDemoFn: async ({phaseEvidence} = {}) => {
      onAffinityRun?.();
      t.type(
        phaseEvidence,
        'object',
        'comparison supplies one phase evidence accumulator',
      );
      if (phaseEvidenceEntry) {
        phaseEvidence[phaseEvidenceEntry.key] = phaseEvidenceEntry.value;
      }
      return {
        converged: true,
        ranking,
        lagrangeDistributedSql: {},
        parallelReduce: {replicas: 2, mergeCandidates: 2},
        learnedAffinity: {},
      };
    },
    writeLiveReportFn: async (...args) => {
      liveReports.push(args);
    },
  };
}

test('live report retains admitted preload evidence when a later phase fails',
  (t) => {
    const schemaAdmission = {
      admitted: true,
      snapshot: {ready: true, state: 'ready'},
      stableConfirmationCount: 2,
    };
    const preloadAdmission = {
      admitted: true,
      snapshot: {ready: true, state: 'operation_drain_progressing'},
      loadLaneAdmission: {admitted: true, state: 'admitted'},
    };
    const report = buildAffinityDemoLiveReport({
      timestamp: TIMESTAMP,
      error: new Error('ratings split timed out'),
      phaseEvidence: {schemaAdmission, preloadAdmission},
    });

    t.equal(report.summary.failed, 1, 'the later failure remains honest');
    t.same(
      reportDetail(report).schemaAdmission,
      schemaAdmission,
      'completed schema admission survives the later failure boundary',
    );
    t.same(
      reportDetail(report).preloadAdmission,
      preloadAdmission,
      'completed preload evidence survives the later failure boundary',
    );
    t.equal(reportDetail(report).error, 'ratings split timed out');
    t.end();
  });

test('live report retains an observed result when later affinity placement stalls',
  (t) => {
    const observedResult = {
      converged: false,
      resultCorrect: true,
      ranking: Array.from({length: 10}, (_item, index) => ({
        movieId: index + 1,
        score: 10 - index,
      })),
      parallelReduce: {replicas: 2, mergeCandidates: 20},
      learnedAffinity: {
        resultComputedAt: 42,
        resultSnapshot: {state: 'available'},
      },
    };
    const phaseEvidence = {};
    t.equal(
      retainObservedDemoResult(phaseEvidence, observedResult),
      true,
      'an exact owner-parsed result is retained',
    );
    const unavailableResult = {
      converged: false,
      resultCorrect: false,
      ranking: [],
      learnedAffinity: {
        resultComputedAt: 0,
        resultSnapshot: {state: 'unavailable'},
      },
    };
    t.equal(
      retainObservedDemoResult(phaseEvidence, unavailableResult),
      false,
      'a later absent read cannot replace observed evidence',
    );
    t.equal(
      phaseEvidence.result,
      observedResult,
      'absence proves nothing and preserves the last exact result',
    );
    const olderResult = {
      ...observedResult,
      learnedAffinity: {
        ...observedResult.learnedAffinity,
        resultComputedAt: 41,
      },
    };
    t.equal(
      retainObservedDemoResult(phaseEvidence, olderResult),
      false,
      'an older valid observation cannot replace newer evidence',
    );
    t.equal(
      phaseEvidence.result,
      observedResult,
      'retained evidence is monotonic by result chronology',
    );
    const report = buildAffinityDemoLiveReport({
      timestamp: TIMESTAMP,
      error: new Error('learned-affinity stalled'),
      phaseEvidence,
    });

    t.equal(report.summary.failed, 1, 'the placement failure remains honest');
    t.same(
      reportDetail(report).result,
      observedResult,
      'the already-observed result survives the later failure boundary',
    );
    t.end();
  });

test('live report does not claim a result when no valid result was observed',
  (t) => {
    const phaseEvidence = {};
    const unavailableResult = {
      converged: false,
      resultCorrect: false,
      ranking: [],
      learnedAffinity: {
        resultComputedAt: 0,
        resultSnapshot: {state: 'unavailable'},
      },
    };
    t.equal(
      retainObservedDemoResult(phaseEvidence, unavailableResult),
      false,
      'unavailable snapshot is not result production',
    );
    const report = buildAffinityDemoLiveReport({
      timestamp: TIMESTAMP,
      error: new Error('service never produced a result'),
      phaseEvidence,
    });
    t.equal(reportDetail(report).result, null);
    t.end();
  });

test('live report retains gate-owned evidence when preload itself fails', (t) => {
  const error = new Error('preload denied');
  error.preloadAdmission = {
    admitted: false,
    snapshot: {ready: false, state: 'stale_usable'},
  };
  const report = buildAffinityDemoLiveReport({timestamp: TIMESTAMP, error});
  t.same(reportDetail(report).preloadAdmission, error.preloadAdmission);
  t.end();
});

test('live report retains gate-owned evidence when schema admission fails',
  (t) => {
    const error = new Error('schema admission denied');
    const readyLeaseAgeWitness = {
      schemaVersion: 1,
      state: 'available',
      nodeId: 'node-stale',
    };
    error.schemaAdmission = {
      admitted: false,
      snapshot: {
        ready: false,
        state: 'control_plane_pressure',
        readyLeaseAgeWitness,
      },
    };
    const report = buildAffinityDemoLiveReport({timestamp: TIMESTAMP, error});
    t.same(reportDetail(report).schemaAdmission, error.schemaAdmission);
    t.same(
      reportDetail(report).schemaAdmission.snapshot.readyLeaseAgeWitness,
      readyLeaseAgeWitness,
      'structured chronology survives the terminal live-report boundary',
    );
    t.end();
  });

test('live runner passes one phase evidence accumulator to success and failure reports',
  async (t) => {
    const source = await readFile(
      'examples/service-data-affinity/run-affinity-demo.js',
      'utf8',
    );
    t.match(source, /runAffinityDemo\(\{phaseEvidence = \{\}\} = \{\}\)/u);
    t.match(source, /phaseEvidence\.schemaAdmission = schemaAdmission/u);
    t.match(source, /phaseEvidence\.preloadAdmission = preloadAdmission/u);
    t.match(source, /retainObservedDemoResult\(phaseEvidence/u);
    t.match(
      source,
      /writeAffinityDemoLiveReport\(null, error, phaseEvidence\)/u,
    );
    t.end();
  });

test('comparison entry point emits the sealed live report from the same run',
  async (t) => {
    const schemaAdmission = {admitted: true, state: 'ready'};
    const liveReports = [];
    const comparison = await runComparison(createComparisonTestDependencies({
      t,
      liveReports,
      phaseEvidenceEntry: {key: 'schemaAdmission', value: schemaAdmission},
    }));

    t.equal(comparison.resultsIdentical, true);
    t.equal(liveReports.length, 1, 'one run emits one sealed live report');
    t.equal(liveReports[0]?.[0]?.converged, true);
    t.equal(liveReports[0]?.[1], null);
    t.same(liveReports[0]?.[2], {schemaAdmission});
    t.end();
  });

test('comparison entry point reports three-way validation failure with phase evidence',
  async (t) => {
    const preloadAdmission = {admitted: true, state: 'admitted'};
    const liveReports = [];
    const dependencies = createComparisonTestDependencies({
      t,
      liveReports,
      ranking: [{movieId: 2, score: 2}],
      phaseEvidenceEntry: {key: 'preloadAdmission', value: preloadAdmission},
    });

    const error = await t.rejects(
      runComparison(dependencies),
      /PostgreSQL and Lagrange rankings differ/u,
    );

    t.equal(liveReports.length, 1, 'failed run still emits one sealed report');
    t.equal(liveReports[0]?.[0], null);
    t.equal(liveReports[0]?.[1], error);
    t.same(liveReports[0]?.[2], {preloadAdmission});
    t.end();
  });

test('comparison entry point reports failures before the Lagrange phase starts',
  async (t) => {
    const liveReports = [];
    let lagrangeRuns = 0;
    const baselineError = new Error('PostgreSQL baseline failed');
    const dependencies = createComparisonTestDependencies({
      t,
      liveReports,
      baselineError,
      onAffinityRun: () => {
        lagrangeRuns += 1;
      },
    });

    const error = await t.rejects(
      runComparison(dependencies),
      /PostgreSQL baseline failed/u,
    );

    t.equal(lagrangeRuns, 0, 'failed prerequisite does not start Lagrange');
    t.equal(liveReports.length, 1, 'failed prerequisite emits one sealed report');
    t.equal(liveReports[0]?.[0], null);
    t.equal(liveReports[0]?.[1], error);
    t.same(liveReports[0]?.[2], {});
    t.end();
  });
