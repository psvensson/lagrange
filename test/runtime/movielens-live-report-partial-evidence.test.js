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
