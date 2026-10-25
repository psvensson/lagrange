import fs from 'node:fs';
import path from 'node:path';
import {test} from '../../src/test-helpers/tap.js';
import {collectLiveInputs, refreshImportGraphReport} from
  '../../scripts/generate-global-owner-debt-inventory.js';
import {listJavaScriptFiles} from
  '../../scripts/global-owner-debt-inventory/helpers.js';
import {METRIC_REPORTS} from '../../scripts/metric-report-constants.js';
import {beginMetricMeasurement, finishMetricMeasurement, readCurrentMetricReport,
  ensureMetricReports} from '../../scripts/metric-report-provenance.js';
import {addComplexTest, createMetricFixture, PRODUCERS, runMetricProducer} from
  './metric-report-fixture.js';

function reportFiles(root) {
  return Object.fromEntries(Object.entries(METRIC_REPORTS).map(([id, descriptor]) => {
    const filename = path.join(root, descriptor.reportPath);
    return [id, {bytes: fs.readFileSync(filename, 'utf8'), ino: fs.statSync(filename).ino}];
  }));
}

test('fresh graph cannot authorize metrics from previous source bytes', async (t) => {
  const root = createMetricFixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  for (const producer of PRODUCERS) runMetricProducer(root, producer);
  await refreshImportGraphReport(root, listJavaScriptFiles(root));
  const before = await collectLiveInputs(root);
  const previousReports = reportFiles(root);
  addComplexTest(root);
  await refreshImportGraphReport(root, listJavaScriptFiles(root));
  const after = await collectLiveInputs(root);
  t.equal(after.complexity.count, before.complexity.count + 1,
    'inventory measures the changed function despite restored source mtime');
  t.notSame(after.identities.complexity, before.identities.complexity,
    'changed measured source payload changes inventory identity');
  const changedReports = reportFiles(root);
  for (const id of ['cognitive', 'duplicationSource']) {
    t.same(changedReports[id], previousReports[id], `${id} was not regenerated`);
  }
  for (const id of ['complexity', 'cycles', 'duplicationTest']) {
    t.not(changedReports[id].bytes, previousReports[id].bytes, `${id} refreshes its seal`);
  }
  ensureMetricReports(root);
  t.same(reportFiles(root), changedReports, 'matching inputs neither rewrite nor replace reports');
  for (const id of Object.keys(METRIC_REPORTS)) {
    t.ok(readCurrentMetricReport(root, id), `${id} producer seals the current measurement`);
  }
  fs.writeFileSync(path.join(root, 'src/cycle-a.js'), 'import \'./cycle-b.js\';\n');
  fs.writeFileSync(path.join(root, 'src/cycle-b.js'), 'import \'./cycle-a.js\';\n');
  await refreshImportGraphReport(root, listJavaScriptFiles(root));
  const ratchet = await collectLiveInputs(root);
  t.equal(ratchet.cycles.cycleGroups.length, 1,
    'a real red cycle ratchet still supplies its complete freshly sealed measurement');
  const producerFile = path.join(root, 'scripts/check-complexity.js');
  fs.writeFileSync(producerFile, fs.readFileSync(producerFile, 'utf8')
    .replace('const TARGET_THRESHOLD = 12;', 'const TARGET_THRESHOLD = 13;'));
  await refreshImportGraphReport(root, listJavaScriptFiles(root));
  const configured = await collectLiveInputs(root);
  t.equal(configured.complexity.count, ratchet.complexity.count,
    'configuration witness preserves the violation count');
  t.equal(configured.complexity.targetThreshold, 13, 'real producer uses changed configuration');
  t.notSame(configured.identities.complexity, ratchet.identities.complexity,
    'changed measured configuration payload changes inventory identity');
  const savedOptions = process.env.NODE_OPTIONS;
  try {
    process.env.NODE_OPTIONS = `${savedOptions || ''} --no-warnings`.trim();
    const runtimeChanged = await collectLiveInputs(root);
    t.same(runtimeChanged.identities, configured.identities,
      'validated semantic inventory identities remain equal across runtime cache identities');
    t.notSame(runtimeChanged.complexity.provenance, configured.complexity.provenance,
      'the local report was actually remeasured and sealed for the changed runtime');
  } finally {
    if (savedOptions === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = savedOptions;
  }
});

test('invalid report custody cannot be reused and changed measurement inputs refuse a seal', (t) => {
  const root = createMetricFixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  runMetricProducer(root, 'check-complexity.js');
  const filename = path.join(root, METRIC_REPORTS.complexity.reportPath);
  const original = fs.readFileSync(filename, 'utf8');
  const report = JSON.parse(original);
  for (const broken of [null, {}, {...report, count: 99},
    {...report, provenance: {...report.provenance, id: 'cognitive'}}]) {
    fs.writeFileSync(filename, JSON.stringify(broken));
    t.notOk(readCurrentMetricReport(root, 'complexity'), 'unsealed or altered report is stale');
  }
  fs.writeFileSync(filename, '{');
  t.notOk(readCurrentMetricReport(root, 'complexity'), 'malformed JSON is stale');
  fs.writeFileSync(filename, original);
  const measurement = beginMetricMeasurement('complexity', {root});
  addComplexTest(root);
  t.throws(() => finishMetricMeasurement(measurement, report),
    /inputs changed during measurement/, 'cannot label previous measurement with new source');
  t.notOk(readCurrentMetricReport(root, 'complexity'), 'previous seal remains stale');
  t.equal(fs.readFileSync(filename, 'utf8'), original, 'failed measurement preserves prior bytes');
  const scoped = beginMetricMeasurement('complexity', {root, targets: ['test/'],
    reportPath: 'test-output/analysis/complexity-scoped.json'});
  finishMetricMeasurement(scoped, report);
  fs.copyFileSync(path.join(root, scoped.reportPath), filename);
  t.notOk(readCurrentMetricReport(root, 'complexity'), 'scoped report cannot certify full scope');
  fs.writeFileSync(path.join(root, 'scripts/check-complexity.js'), 'process.exit(1);\n');
  t.throws(() => ensureMetricReports(root), /metric report refresh failed: complexity/,
    'exit 1 without a fresh report is a failed measurement, not an accepted ratchet');
  const partialProducer = 'import fs from \'node:fs\';\n' +
    `fs.writeFileSync(${JSON.stringify(filename)}, JSON.stringify({count: 0}));\n` +
    'process.exit(1);\n';
  fs.writeFileSync(path.join(root, 'scripts/check-complexity.js'), partialProducer);
  t.throws(() => ensureMetricReports(root), /metric report refresh failed: complexity/,
    'partial unsealed output followed by exit 1 cannot authorize inventory');
  t.end();
});
