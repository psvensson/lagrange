import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {test} from '../../src/test-helpers/tap.js';
import {createCycleInputFacts, cycleInputsAreCurrent} from
  '../../scripts/metric-cycle-input-facts.js';
import {createMetricFixture} from './metric-report-fixture.js';

const CHILD = `
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {analyzeMetricCycles} from './scripts/metric-cycle-analyzer.js';
const request = createRequire(process.cwd() + '/package.json');
const cabinet = request('filing-cabinet');
const resolver = request('resolve');
const originalResolve = resolver.sync;
const originals = Object.fromEntries(Object.entries(fs));
const root = process.cwd();
const targets = process.env.METRIC_CUSTODY_MODE === 'missing' ? ['missing-directory'] :
  ['src', 'scripts', 'test'];
let message = null;
let measured;
try { measured = await analyzeMetricCycles(root, targets); }
catch (error) { message = error.message; }
const restored = request('filing-cabinet') === cabinet && resolver.sync === originalResolve;
const untouchedFs = Object.entries(originals).every(([key, value]) => fs[key] === value);
let second;
try { await analyzeMetricCycles(root, ['src']); }
catch (error) { second = error.message; }
let warmCycles;
if (measured) {
  const warm = await request('madge')(['src', 'scripts', 'test']);
  warmCycles = warm.circular();
}
process.stdout.write(JSON.stringify({message, restored, untouchedFs, second, warmCycles,
  cycles: measured?.analysis.circular()}));
`;

for (const mode of ['success', 'missing', 'unsupported']) {
  test(`cycle analyzer restores its exact owner references after ${mode}`, (t) => {
    const root = createMetricFixture();
    t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
    if (mode === 'unsupported') {
      fs.mkdirSync(path.join(root, 'metric-shared'));
      fs.writeFileSync(path.join(root, 'src/subject.js'),
        'import \'../metric-shared/dependency.ts\';\n');
      fs.writeFileSync(path.join(root, 'metric-shared/dependency.ts'),
        'import \'../src/subject.js\';\n');
    }
    const child = spawnSync(process.execPath, ['--input-type=module', '--eval', CHILD], {
      cwd: root, encoding: 'utf8', env: {...process.env, METRIC_CUSTODY_MODE: mode},
    });
    t.equal(child.status, 0, child.stderr || 'dedicated producer process completed');
    const result = JSON.parse(child.stdout);
    t.ok(result.restored, 'cabinet export and resolver function are restored by identity');
    t.ok(result.untouchedFs, 'no Node filesystem function or property was replaced');
    t.match(result.second, /before dependency-tree is loaded/,
      'second adapter invocation refuses cached traversal bindings');
    if (mode === 'success') {
      t.equal(result.message, null, 'initial supported analysis succeeded');
      t.same(result.warmCycles, result.cycles,
        'the cached disabled cabinet wrapper delegates to the original analyzer');
    } else {
      t.match(result.message, mode === 'unsupported' ? /unbound cycle resolver route/ : /ENOENT/,
        'real exceptional path was engaged before cleanup');
    }
    t.end();
  });
}

test('contradictory repeated reads and observed-input mutation cannot certify a report', (t) => {
  const root = createMetricFixture();
  t.teardown(() => fs.rmSync(root, {recursive: true, force: true}));
  const filename = path.join(root, 'src/subject.js');
  const journal = createCycleInputFacts(root);
  journal.fileSystem.readFileSync(filename, 'utf8');
  const inputs = journal.finish();
  t.ok(cycleInputsAreCurrent(root, inputs), 'initial actual read remains current');
  fs.appendFileSync(filename, '\nexport const changed = true;\n');
  t.notOk(cycleInputsAreCurrent(root, inputs), 'post-analysis byte change invalidates the manifest');
  journal.fileSystem.readFileSync(filename, 'utf8');
  t.throws(() => journal.finish(), /changed during analysis/,
    'a second contradictory observation is not silently substituted for the first');
  t.end();
});
