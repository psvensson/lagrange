import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {test} from '../../src/test-helpers/tap.js';
import {METRIC_REPORTS} from '../../scripts/metric-report-constants.js';
import {readCurrentMetricReport} from '../../scripts/metric-report-provenance.js';
import {createMetricFixture, runMetricProducer} from './metric-report-fixture.js';

const SUBJECT = 'src/subject.js';
const SHARED = 'metric-shared';
const PRODUCER = 'check-circular-dependencies.js';

function write(root, relative, content) {
  const filename = path.join(root, relative);
  fs.mkdirSync(path.dirname(filename), {recursive: true});
  fs.writeFileSync(filename, content);
}

function measure(t, root, count) {
  const result = runMetricProducer(root, PRODUCER);
  t.equal(result.status, count ? 1 : 0, result.stderr || 'actual cycle ratchet exit');
  const report = readCurrentMetricReport(root, 'cycles');
  t.ok(report, 'actual analyzer produced a reusable complete input seal');
  t.equal(report?.cycleGroups.length, count, 'actual cycle count');
  return report;
}

const CASES = [
  {
    name: 'missing import becomes present', import: '../metric-shared/missing.js',
    prepare() {},
    change(root) {
      write(root, `${SHARED}/missing.js`, 'import \'../src/subject.js\';\n');
    },
  },
  {
    name: 'higher priority extension appears', import: '../metric-shared/choice',
    prepare(root) {
      write(root, `${SHARED}/choice.jsx`, 'export const value = 1;\n');
    },
    change(root) {
      write(root, `${SHARED}/choice.js`, 'import \'../src/subject.js\';\n');
    },
  },
  {
    name: 'package main redirects resolution', import: '../metric-shared/package',
    prepare(root) {
      write(root, `${SHARED}/package/package.json`, JSON.stringify({main: 'one.js'}));
      write(root, `${SHARED}/package/one.js`, 'export const value = 1;\n');
      write(root, `${SHARED}/package/two.js`, 'import \'../../src/subject.js\';\n');
    },
    change(root) {
      write(root, `${SHARED}/package/package.json`, JSON.stringify({main: 'two.js'}));
    },
  },
  {
    name: 'symlink redirects imported bytes', import: '../metric-shared/link.js',
    prepare(root) {
      write(root, `${SHARED}/plain.js`, 'export const value = 1;\n');
      write(root, `${SHARED}/cycle.js`, 'import \'../src/subject.js\';\n');
      fs.symlinkSync('plain.js', path.join(root, SHARED, 'link.js'));
    },
    change(root) {
      fs.unlinkSync(path.join(root, SHARED, 'link.js'));
      fs.symlinkSync('cycle.js', path.join(root, SHARED, 'link.js'));
    },
  },
  {
    name: 'pure generic resolver input changes', import: '../metric-shared/dependency.mjs',
    prepare(root) {
      write(root, `${SHARED}/dependency.mjs`, 'export const value = 1;\n');
    },
    change(root) {
      write(root, `${SHARED}/dependency.mjs`, 'import \'../src/subject.js\';\n');
    },
  },
];

for (const scenario of CASES) {
  test(`real cycle resolution invalidates when ${scenario.name}`, (t) => {
    const root = createMetricFixture();
    t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
    write(root, SUBJECT, `import ${JSON.stringify(scenario.import)};\n`);
    scenario.prepare(root);
    measure(t, root, 0);
    const originalSubject = fs.readFileSync(path.join(root, SUBJECT));
    scenario.change(root);
    t.same(fs.readFileSync(path.join(root, SUBJECT)), originalSubject,
      'entry source remains unchanged while resolution input changes');
    t.notOk(readCurrentMetricReport(root, 'cycles'), 'prior sealed report is stale');
    measure(t, root, 1);
    // Deleting a positive input also invalidates; this file is outside roots.
    if (scenario.name === CASES[0].name) {
      fs.unlinkSync(path.join(root, SHARED, 'missing.js'));
      t.notOk(readCurrentMetricReport(root, 'cycles'), 'deleted positive dependency is stale');
      measure(t, root, 0);
    }
    t.end();
  });
}

for (const unsupported of [
  {extension: 'ts', content: 'import \'../src/subject.js\';\n'},
  {extension: 'js', content: 'define([\'../src/subject.js\'], function() {});\n'},
]) {
  test(`unsupported ${unsupported.extension} resolver cannot replace custody`, (t) => {
    const root = createMetricFixture();
    t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
    measure(t, root, 0);
    const reportFile = path.join(root, METRIC_REPORTS.cycles.reportPath);
    const previous = fs.readFileSync(reportFile, 'utf8');
    write(root, SUBJECT, `import '../metric-shared/dependency.${unsupported.extension}';\n`);
    write(root, `${SHARED}/dependency.${unsupported.extension}`, unsupported.content);
    const result = runMetricProducer(root, PRODUCER);
    t.equal(result.status, 1, 'unsupported resolver input refuses measurement');
    t.match(result.stderr, /unbound cycle resolver route/, 'refusal names the unbound route');
    t.equal(fs.readFileSync(reportFile, 'utf8'), previous, 'no incomplete replacement report');
    t.notOk(readCurrentMetricReport(root, 'cycles'), 'previous report cannot certify changed inputs');
    t.end();
  });
}


test('a truncated analyzer input manifest cannot certify a cached cycle report', (t) => {
  const root = createMetricFixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const report = measure(t, root, 0);
  report.provenance.analyzerInputs.facts.length = 1;
  fs.writeFileSync(path.join(root, METRIC_REPORTS.cycles.reportPath), JSON.stringify(report));
  t.notOk(readCurrentMetricReport(root, 'cycles'),
    'the report digest binds the complete observed input manifest');
  t.end();
});

const HOME_CONTEXT_READER = `
import {readCurrentMetricReport} from './scripts/metric-report-provenance.js';
const report = readCurrentMetricReport(process.cwd(), 'cycles');
console.log(JSON.stringify(report && {
  cycleCount: report.cycleGroups.length,
  homeDirectory: report.provenance.inputs.runtime.homeDirectory,
}));
`;

function runWithHomeContext(root, directory, arguments_) {
  const result = spawnSync(process.execPath, arguments_, {
    cwd: root, encoding: 'utf8',
    env: {...process.env, HOME: directory, USERPROFILE: directory},
  });
  if (![0, 1].includes(result.status)) {
    throw new Error(result.stderr || result.error?.message || 'home-context child failed');
  }
  return result;
}

function readInHomeContext(root, directory) {
  const result = runWithHomeContext(root, directory,
    ['--input-type=module', '--eval', HOME_CONTEXT_READER]);
  if (result.status !== 0) throw new Error(result.stderr || 'home-context reader failed');
  return JSON.parse(result.stdout);
}

test('real cycle resolution invalidates when the effective home search root changes', (t) => {
  const root = createMetricFixture();
  const contextRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metric-home-resolution-'));
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  t.teardown(() => fs.rmSync(contextRoot, {recursive: true, force: true}));
  const firstDirectory = path.join(contextRoot, 'first');
  const secondDirectory = path.join(contextRoot, 'second');
  const dependency = 'metric-home-context-dependency';
  const subject = path.join(root, SUBJECT);
  const firstTarget = path.join(firstDirectory, '.node_libraries', `${dependency}.js`);
  const secondTarget = path.join(secondDirectory, '.node_libraries', `${dependency}.js`);
  write(root, SUBJECT, `module.exports = require(${JSON.stringify(dependency)});\n`);
  write(firstDirectory, path.relative(firstDirectory, firstTarget), 'module.exports = 1;\n');
  write(secondDirectory, path.relative(secondDirectory, secondTarget),
    `module.exports = require(${JSON.stringify(subject)});\n`);
  const files = [subject, firstTarget, secondTarget];
  const originalBytes = files.map((filename) => fs.readFileSync(filename));

  const first = runWithHomeContext(root, firstDirectory, [`scripts/${PRODUCER}`]);
  t.equal(first.status, 0, first.stderr || 'first home resolves an acyclic dependency');
  const reportFile = path.join(root, METRIC_REPORTS.cycles.reportPath);
  const initialReport = fs.readFileSync(reportFile);
  const initialInode = fs.statSync(reportFile).ino;
  t.same(readInHomeContext(root, firstDirectory), {
    cycleCount: 0, homeDirectory: firstDirectory,
  }, 'unchanged effective home reuses the sealed zero-cycle report');
  t.equal(readInHomeContext(root, secondDirectory), null,
    'a different home cannot reuse the old resolver context');
  t.same(fs.readFileSync(reportFile), initialReport, 'readback leaves report bytes unchanged');
  t.equal(fs.statSync(reportFile).ino, initialInode, 'readback leaves the report inode unchanged');

  const second = runWithHomeContext(root, secondDirectory, [`scripts/${PRODUCER}`]);
  t.equal(second.status, 1, 'fresh analysis under the second home finds the actual cycle');
  t.same(readInHomeContext(root, secondDirectory), {
    cycleCount: 1, homeDirectory: secondDirectory,
  }, 'new context reuses its own complete one-cycle report');
  t.equal(readInHomeContext(root, firstDirectory), null,
    'returning to the original home also invalidates the changed report');
  t.same(files.map((filename) => fs.readFileSync(filename)), originalBytes,
    'entry and dependency bytes stay identical across both resolution contexts');
  t.end();
});
