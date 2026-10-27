import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {collectLiveInputs, refreshImportGraphReport} from '../../scripts/generate-global-owner-debt-inventory.js';
import {listJavaScriptFiles} from '../../scripts/global-owner-debt-inventory/helpers.js';
import {readCurrentMetricReport} from '../../scripts/metric-report-provenance.js';
import {createMetricFixture, PRODUCERS, runMetricProducer} from './metric-report-fixture.js';
import {PRIMARY_CLASS_MANIFEST_PATH} from
  '../../scripts/checks/test-primary-classification-constants.js';
import {captureMetricInputs} from '../../scripts/metric-report-inputs.js';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'metric-inputs-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  for (const directory of ['src', 'scripts', 'test/shards', 'node_modules/metric-tool',
    'node_modules/metric-dependency']) {
    fs.mkdirSync(path.join(root, directory), {recursive: true});
  }
  const write = (name, value) => fs.writeFileSync(path.join(root, name), value);
  write('package.json', '{}');
  write('package-lock.json', '{}');
  write('src/input.js', 'export const value = 1;');
  write('scripts/producer.js', 'export const threshold = 12;');
  write('node_modules/metric-tool/package.json', JSON.stringify({
    name: 'metric-tool', version: '1.0.0', dependencies: {'metric-dependency': '*'},
  }));
  write('node_modules/metric-tool/index.js', 'module.exports = 1;');
  write('node_modules/metric-dependency/package.json',
    JSON.stringify({name: 'metric-dependency', version: '1.0.0'}));
  write('node_modules/metric-dependency/index.js', 'module.exports = 1;');
  const capture = () => captureMetricInputs(root,
    {tools: ['metric-tool'], command: ['scripts/producer.js']}, ['src', 'test'], 'report.json');
  return {root, write, capture};
}

test('cache identity covers actual bytes, configuration, producer and tool closure', (t) => {
  const {root, write, capture} = fixture(t);
  const initial = capture();
  assert.deepEqual(capture(), initial, 'unchanged inputs retain the identity');
  write('README.md', 'unmeasured documentation');
  assert.deepEqual(capture(), initial, 'unrelated documentation preserves fast path');
  for (const filename of ['src/input.js', 'scripts/producer.js', 'package-lock.json',
    'node_modules/metric-tool/index.js', 'node_modules/metric-dependency/index.js']) {
    const absolute = path.join(root, filename);
    const original = fs.readFileSync(absolute);
    const stat = fs.statSync(absolute);
    fs.appendFileSync(absolute, '\n ');
    fs.utimesSync(absolute, stat.atime, stat.mtime);
    assert.notDeepEqual(capture(), initial, `${filename} bytes invalidate with unchanged mtime`);
    fs.writeFileSync(absolute, original);
    assert.deepEqual(capture(), initial, 'restored bytes restore identity');
  }
  write(PRIMARY_CLASS_MANIFEST_PATH, '{"count": 1}');
  assert.deepEqual(capture(), initial, 'unmeasured generated inventory cannot invalidate measurements');
  const relocated = `${root}-relocated`;
  fs.cpSync(root, relocated, {recursive: true});
  t.after(() => fs.rmSync(relocated, {recursive: true, force: true}));
  fs.rmSync(path.join(relocated, 'node_modules'), {recursive: true});
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(relocated, 'node_modules'));
  assert.deepEqual(captureMetricInputs(relocated,
    {tools: ['metric-tool'], command: ['scripts/producer.js']}, ['src', 'test'], 'report.json'),
  initial, 'relocated worktree with shared installed tools has identical inputs');
});

for (const omitted of [
  {label: 'imported hidden cache directory', file: 'src/.cache/dependency.js',
    fromSubject: './.cache/dependency.js', backToSubject: '../subject.js'},
  {label: 'imported directory outside declared entry roots', file: 'metric-shared/dependency.js',
    fromSubject: '../metric-shared/dependency.js', backToSubject: '../src/subject.js'},
]) {
  test(`independent provenance review: ${omitted.label} is an actual analyzer input`, async (t) => {
    const root = createMetricFixture();
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const dependency = path.join(root, omitted.file);
    fs.mkdirSync(path.dirname(dependency), {recursive: true});
    fs.writeFileSync(path.join(root, 'src/subject.js'),
      `import ${JSON.stringify(omitted.fromSubject)};\nexport const value = 1;\n`);
    fs.writeFileSync(dependency, 'export const dependency = 1;\n');
    for (const producer of PRODUCERS) runMetricProducer(root, producer);
    await refreshImportGraphReport(root, listJavaScriptFiles(root));
    const before = await collectLiveInputs(root);
    assert.equal(before.cycles.cycleGroups.length, 0, 'the actual initial cycle measurement is clear');
    const stat = fs.statSync(dependency);
    fs.writeFileSync(dependency, `import ${JSON.stringify(omitted.backToSubject)};\n`);
    fs.utimesSync(dependency, stat.atime, stat.mtime);
    assert.equal(readCurrentMetricReport(root, 'cycles'), null,
      'changing an imported measurement dependency invalidates the prior seal');
    await refreshImportGraphReport(root, listJavaScriptFiles(root));
    const after = await collectLiveInputs(root);
    assert.equal(after.cycles.cycleGroups.length, 1,
      'the actual inventory consumer refreshes cycles even after the graph is refreshed');
    const measured = runMetricProducer(root, 'check-circular-dependencies.js');
    const actual = readCurrentMetricReport(root, 'cycles');
    assert.equal(measured.status, 1, 'actual changed input triggers the existing cycle ratchet');
    assert.equal(actual.cycleGroups.length, 1, 'fresh actual producer confirms the missing cycle');
    t.diagnostic(JSON.stringify({input: omitted.file, before: before.cycles.cycleGroups.length,
      consumerAfterFreshGraph: after.cycles.cycleGroups.length,
      actualRemeasurement: actual.cycleGroups.length, producerExit: measured.status}));
  });
}
