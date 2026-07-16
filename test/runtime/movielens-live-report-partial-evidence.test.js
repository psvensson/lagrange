import {readFile} from 'node:fs/promises';
import {test} from '../../src/test-helpers/tap.js';
import {
  buildAffinityDemoLiveReport,
} from '../../examples/service-data-affinity/affinity-demo-live-report.js';

const TIMESTAMP = '2026-07-15T18:20:58.624Z';

function reportDetail(report) {
  return report.standardSummary.scenarios[0].detail;
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
    error.schemaAdmission = {
      admitted: false,
      snapshot: {ready: false, state: 'control_plane_pressure'},
    };
    const report = buildAffinityDemoLiveReport({timestamp: TIMESTAMP, error});
    t.same(reportDetail(report).schemaAdmission, error.schemaAdmission);
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
    const {runComparison} = await t.mockImport(
      '../../examples/service-data-affinity/run-comparison.js',
      {
        '../../examples/service-data-affinity/download-movielens.js': {
          downloadRatings: async () => {},
        },
        '../../examples/service-data-affinity/run-postgres-baseline.js': {
          runPostgresBaseline: async () => ({
            queryDurationMs: 1,
            returnedAggregateRows: 1,
            topMovies: [{movieId: 1, score: 2}],
          }),
        },
        '../../examples/service-data-affinity/run-affinity-demo.js': {
          runAffinityDemo: async ({phaseEvidence} = {}) => {
            t.type(
              phaseEvidence,
              'object',
              'comparison supplies the live phase evidence accumulator',
            );
            phaseEvidence = phaseEvidence || {};
            phaseEvidence.schemaAdmission = schemaAdmission;
            return {
              converged: true,
              ranking: [{movieId: 1, score: 2}],
              lagrangeDistributedSql: {},
              parallelReduce: {replicas: 2, mergeCandidates: 2},
              learnedAffinity: {},
            };
          },
        },
        '../../examples/service-data-affinity/affinity-demo-live-report.js': {
          writeAffinityDemoLiveReport: async (...args) => {
            liveReports.push(args);
          },
        },
      },
    );

    const comparison = await runComparison();

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
    const {runComparison} = await t.mockImport(
      '../../examples/service-data-affinity/run-comparison.js',
      {
        '../../examples/service-data-affinity/download-movielens.js': {
          downloadRatings: async () => {},
        },
        '../../examples/service-data-affinity/run-postgres-baseline.js': {
          runPostgresBaseline: async () => ({
            queryDurationMs: 1,
            returnedAggregateRows: 1,
            topMovies: [{movieId: 1, score: 2}],
          }),
        },
        '../../examples/service-data-affinity/run-affinity-demo.js': {
          runAffinityDemo: async ({phaseEvidence} = {}) => {
            t.type(
              phaseEvidence,
              'object',
              'comparison supplies the failure evidence accumulator',
            );
            phaseEvidence = phaseEvidence || {};
            phaseEvidence.preloadAdmission = preloadAdmission;
            return {
              converged: true,
              ranking: [{movieId: 2, score: 2}],
              lagrangeDistributedSql: {},
              parallelReduce: {replicas: 2, mergeCandidates: 2},
              learnedAffinity: {},
            };
          },
        },
        '../../examples/service-data-affinity/affinity-demo-live-report.js': {
          writeAffinityDemoLiveReport: async (...args) => {
            liveReports.push(args);
          },
        },
      },
    );

    const error = await t.rejects(
      runComparison(),
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
    const {runComparison} = await t.mockImport(
      '../../examples/service-data-affinity/run-comparison.js',
      {
        '../../examples/service-data-affinity/download-movielens.js': {
          downloadRatings: async () => {},
        },
        '../../examples/service-data-affinity/run-postgres-baseline.js': {
          runPostgresBaseline: async () => {
            throw baselineError;
          },
        },
        '../../examples/service-data-affinity/run-affinity-demo.js': {
          runAffinityDemo: async () => {
            lagrangeRuns += 1;
          },
        },
        '../../examples/service-data-affinity/affinity-demo-live-report.js': {
          writeAffinityDemoLiveReport: async (...args) => {
            liveReports.push(args);
          },
        },
      },
    );

    const error = await t.rejects(runComparison(), /PostgreSQL baseline failed/u);

    t.equal(lagrangeRuns, 0, 'failed prerequisite does not start Lagrange');
    t.equal(liveReports.length, 1, 'failed prerequisite emits one sealed report');
    t.equal(liveReports[0]?.[0], null);
    t.equal(liveReports[0]?.[1], error);
    t.same(liveReports[0]?.[2], {});
    t.end();
  });
