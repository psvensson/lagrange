/**
 * The necessity trap apparatus (scripts/checks/fallback-necessity-trap.js,
 * its runtime and its preload) over a synthetic checkout: one fixture per
 * census detector row and per failure mode experiment.md B names (arms
 * inside expressions, multi-term chains, async and timer attribution, nested
 * arms, N2 primary arming), observed and thrown through the real preload in
 * child node processes. Known-bad inputs must be refused (R19): a drifted
 * file, a rewrite that does not parse, an arm that cannot be armed, merges of
 * different plans or of one process twice.
 */
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {after, test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {detectNavigabilityPatterns} from '../../scripts/checks/code-navigability-detectors.js';
import {necessitySiteId} from '../../scripts/checks/fallback-necessity-sites.js';
import {
  NecessityTrapPlanDriftError, TRAP_MARKER, createTrapRecorder, parseSelection, rewriteSource,
} from '../../scripts/checks/fallback-necessity-trap-runtime.js';
import {
  UNINSTRUMENTED, buildTrapPlan, formatPlanSummary, gateParsableArms, mergeObservations,
  readMergeInputs,
} from '../../scripts/checks/fallback-necessity-trap.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PRELOAD = path.join(REPO, 'scripts/checks/fallback-necessity-trap-preload.js');
const CHILD_TIMEOUT_MS = 20_000;

const FIXTURES = Object.freeze({
  'src/fx/chain.js': [
    'export function chain(a, b, c) {',
    '  return a.x ?? b.y ?? c.z;',
    '}',
    'export function inCall(a, b) {',
    '  return String(a.name || b.name);',
    '}',
    '',
  ],
  'src/fx/typeof.js': [
    'export function conditional(port) {',
    '  return typeof port.read === \'function\' ? port.read() : \'default\';',
    '}',
    'export function statement(port) {',
    '  if (typeof port.write !== \'function\') {',
    '    return \'no-writer\';',
    '  } else {',
    '    return port.write();',
    '  }',
    '}',
    'export function unbraced(port) {',
    '  let result = \'none\';',
    '  if (typeof port.close === \'function\') result = port.close(); else result = \'open\';',
    '  return result;',
    '}',
    'export function nested(port, a, b) {',
    '  return typeof port.pick === \'function\' ? port.pick() : (a.p || b.p);',
    '}',
    '',
  ],
  'src/fx/catch.js': [
    'export function parse(text) {',
    '  try {',
    '    return JSON.parse(text);',
    '  } catch (error) {',
    '    return null;',
    '  }',
    '}',
    'export function noParam(fn) {',
    '  try {',
    '    return fn();',
    '  } catch {',
    '    return undefined;',
    '  }',
    '}',
    '',
  ],
  'src/fx/async.js': [
    'export async function later(a, b) {',
    '  await null;',
    '  return a.v || b.v;',
    '}',
    'export function onTimer(a, b, done) {',
    '  setTimeout(() => done(a.w || b.w), 0);',
    '}',
    '',
  ],
  'src/fx/n2.js': [
    'export function seam(options, fallback) {',
    '  return options.now || fallback.now;',
    '}',
    '',
  ],
});

const directories = [];
after(() => {
  for (const directory of directories) fs.rmSync(directory, {recursive: true, force: true});
});

function temporaryDirectory(prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  directories.push(directory);
  return directory;
}

function writeCheckout() {
  const root = temporaryDirectory('necessity-trap-');
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}\n');
  for (const [file, lines] of Object.entries(FIXTURES)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
    fs.writeFileSync(path.join(root, file), lines.join('\n'));
  }
  return root;
}

function detectedSites(root) {
  return detectNavigabilityPatterns(root).sites.filter((site) =>
    ['two_source_fallback_reads', 'typeof_dual_paths', 'catch_returns_default'].includes(site.row));
}

// A census in which the n2.js chain and the conditional typeof site ran only
// their alternate (N2), every other site its primary only (N1).
function censusFor(root) {
  const sites = detectedSites(root);
  const records = sites.map((site) => {
    const n2 = site.file === 'src/fx/n2.js' ||
      (site.file === 'src/fx/typeof.js' && site.loc.start.line === 2);
    const sides = {primary: !n2, fallback: n2};
    return {file: site.file, row: site.row, range: site.range, hash: site.hash,
      occurrence: site.occurrence, class: n2 ? 'fallback-only' : 'primary-only',
      sidesExecuted: sides, runs: ['unit-run'], sidesByRun: {'unit-run': sides}};
  });
  const runs = ['unit', 'packaging', 'integration', 'bootstrap', 'formation'].map((lane) =>
    ({id: lane === 'unit' ? 'unit-run' : `${lane}-run`, lane}));
  return {schema: 'fallback-census/1', head: 'a'.repeat(40), runs, sites: records};
}

function readFilesFrom(root) {
  return (files) => new Map(files.map((file) =>
    [file, fs.readFileSync(path.join(root, file), 'utf8')]));
}

function planFor(root) {
  return buildTrapPlan({root, census: censusFor(root), readFiles: readFilesFrom(root),
    head: 'test-head'});
}

function siteIdAt(root, file, line, row) {
  const site = detectedSites(root).find((candidate) => candidate.file === file &&
    candidate.loc.start.line === line && candidate.row === row);
  assert.ok(site, `${file}:${line} ${row} must be a detected site`);
  return necessitySiteId(site);
}

function writePlan(root, plan) {
  const file = path.join(root, 'plan.json');
  fs.writeFileSync(file, JSON.stringify(plan));
  return file;
}

function childEnvironment(root, planFile, outDir, extra = {}) {
  return {...process.env, NODE_OPTIONS: `--import=${PRELOAD}`,
    LAGRANGE_NECESSITY_TRAP_PLAN: planFile, LAGRANGE_NECESSITY_TRAP_OUT: outDir,
    LAGRANGE_NECESSITY_TRAP_MODE: 'observe', ...extra};
}

function runChild(root, script, env) {
  const entry = path.join(root, `entry-${directories.length}-${Date.now()}.mjs`);
  fs.writeFileSync(entry, script);
  return spawnSync(process.execPath, [entry], {cwd: root, env, encoding: 'utf8',
    timeout: CHILD_TIMEOUT_MS});
}

function observations(outDir) {
  return fs.readdirSync(outDir).filter((name) => name.endsWith('.json')).sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(outDir, name), 'utf8')));
}

const DRIVER = [
  'import {chain, inCall} from \'./src/fx/chain.js\';',
  'import {conditional, statement, unbraced, nested} from \'./src/fx/typeof.js\';',
  'import {parse, noParam} from \'./src/fx/catch.js\';',
  'import {later, onTimer} from \'./src/fx/async.js\';',
  'const out = {};',
  'out.chainFirst = chain({x: 1}, {y: 2}, {z: 3});',
  'out.chainLast = chain({}, {}, {z: 3});',
  'out.inCall = inCall({}, {name: \'b\'});',
  'out.conditional = conditional({read: () => \'read\'});',
  'out.statement = statement({});',
  'out.unbraced = unbraced({close: () => \'closed\'});',
  'out.nested = nested({}, {}, {p: \'bp\'});',
  'out.parse = parse(\'{bad\');',
  'out.noParam = noParam(() => 7);',
  'out.later = await later({}, {v: \'late\'});',
  'out.timer = await new Promise((resolve) => onTimer({}, {w: \'tick\'}, resolve));',
  'console.log(JSON.stringify(out));',
  '',
].join('\n');

test('plan arms every census-row site and reports what it cannot arm, with the reason', () => {
  const root = writeCheckout();
  const plan = planFor(root);
  const n2Chain = siteIdAt(root, 'src/fx/n2.js', 2, 'two_source_fallback_reads');
  assert.deepEqual(plan.uninstrumented.map(({id, reason}) => [id, reason]),
    [[n2Chain, UNINSTRUMENTED.PRIMARY_TERM]],
    'an N2 two-source site cannot trap its always-evaluated primary term');
  const conditional = plan.files['src/fx/typeof.js'].sites.find((site) => site.line === 2);
  assert.equal(conditional.bucket, 'N2');
  assert.equal(conditional.armedSide, 'primary', 'an N2 site arms its never-run primary');
  const chain = plan.files['src/fx/chain.js'].sites.find((site) => site.line === 2);
  assert.deepEqual(chain.arms, [1, 2], 'a three-term chain has one arm per later term');
  assert.equal(chain.bucket, 'N1');
  const summary = formatPlanSummary(plan);
  assert.match(summary, new RegExp(`UNINSTRUMENTED src/fx/n2.js:2 ${n2Chain.replaceAll('.', '\\.')} ` +
    'two_source_fallback_reads N2 primary-term-always-evaluated'));
  assert.match(summary, /by bucket:\n {2}N1: instrumentable 10 uninstrumented 0\n {2}N2: instrumentable 1 uninstrumented 1\n/u);
});

test('every rewritten fixture parses, keeps its line count and is armed exactly once', () => {
  const root = writeCheckout();
  const plan = planFor(root);
  for (const file of Object.keys(plan.files)) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    const armed = rewriteSource(plan, file, text);
    assert.equal(armed.split('\n').length, text.split('\n').length + 2, file);
    assert.equal(rewriteSource(plan, file, armed), armed, 'a second application is a no-op');
    assert.ok(armed.endsWith(TRAP_MARKER));
  }
  const nested = rewriteSource(plan, 'src/fx/typeof.js',
    fs.readFileSync(path.join(root, 'src/fx/typeof.js'), 'utf8')).split('\n')[16];
  assert.match(nested, /: \(\(__lagrangeNecessityTrap\("ty\.[0-9a-f]{12}\.0#0"\),a\.p \|\| \(__lagrangeNecessityTrap\("ts\.[0-9a-f]{12}\.0#1"\),b\.p\)\)\);$/u,
    'nested arms nest: the conditional arm wraps the chain whose term is armed');
});

test('a planned file whose slice no longer matches is refused, naming the site', () => {
  const root = writeCheckout();
  const plan = planFor(root);
  const text = fs.readFileSync(path.join(root, 'src/fx/chain.js'), 'utf8');
  const drifted = text.replace('b.y', 'b.q');
  const id = siteIdAt(root, 'src/fx/chain.js', 2, 'two_source_fallback_reads');
  assert.throws(() => rewriteSource(plan, 'src/fx/chain.js', drifted), (error) =>
    error instanceof NecessityTrapPlanDriftError && error.code === 'LAGRANGE_NECESSITY_TRAP_DRIFT' &&
      error.siteIds.length === 1 && error.siteIds[0] === id);
  assert.equal(rewriteSource(plan, 'src/other.js', text), text, 'unplanned files load unchanged');
});

test('the syntax gate refuses a rewrite that does not parse and keeps the rest', () => {
  const text = 'export const a = 1;\nexport const b = 2;\n';
  const good = {site: 'good', edits: [{at: 17, kind: 2, span: 1, text: '(0,'},
    {at: 18, kind: 0, span: 1, text: ')'}]};
  const bad = {site: 'bad', edits: [{at: 37, kind: 2, span: 1, text: '(('}]};
  const {accepted, rejected} = gateParsableArms(text, 'src/x.js', [good, bad]);
  assert.deepEqual(accepted, [good]);
  assert.deepEqual(rejected.map(({one, reason}) => [one.site, reason]),
    [['bad', UNINSTRUMENTED.DOES_NOT_PARSE]]);
});

test('observe mode records exactly the arms that ran and changes no result', () => {
  const root = writeCheckout();
  const plan = planFor(root);
  const planFile = writePlan(root, plan);
  const plain = runChild(root, DRIVER, {...process.env, NODE_OPTIONS: ''});
  assert.equal(plain.status, 0, plain.stderr);
  const outDir = temporaryDirectory('necessity-obs-');
  const observed = runChild(root, DRIVER, childEnvironment(root, planFile, outDir));
  assert.equal(observed.status, 0, observed.stderr);
  assert.equal(observed.stdout, plain.stdout, 'observe mode changes no behaviour');
  const [doc] = observations(outDir);
  const id = (file, line, row) => siteIdAt(root, file, line, row);
  const ts = 'two_source_fallback_reads';
  const ty = 'typeof_dual_paths';
  const ca = 'catch_returns_default';
  const expected = {
    [`${id('src/fx/chain.js', 2, ts)}#1`]: 1,
    [`${id('src/fx/chain.js', 2, ts)}#2`]: 1,
    [`${id('src/fx/chain.js', 5, ts)}#1`]: 1,
    [`${id('src/fx/typeof.js', 2, ty)}#0`]: 1,
    [`${id('src/fx/typeof.js', 5, ty)}#0`]: 1,
    [`${id('src/fx/typeof.js', 17, ty)}#0`]: 1,
    [`${id('src/fx/typeof.js', 17, ts)}#1`]: 1,
    [`${id('src/fx/catch.js', 4, ca)}#0`]: 1,
    [`${id('src/fx/async.js', 3, ts)}#1`]: 1,
    [`${id('src/fx/async.js', 6, ts)}#1`]: 1,
  };
  assert.deepEqual(Object.fromEntries(Object.entries(doc.arms).map(([arm, hit]) =>
    [arm, hit.count])), expected, 'the first chain term, unbraced if primary, noParam try ' +
    'success and every unexecuted arm stay unrecorded');
  assert.deepEqual(doc.loaded, ['src/fx/async.js', 'src/fx/catch.js', 'src/fx/chain.js',
    'src/fx/typeof.js']);
  const later = doc.arms[`${id('src/fx/async.js', 3, ts)}#1`];
  assert.equal(later.async, true, 'an arm reached after an await is attributed through it');
  assert.match(later.caller, /^entry-[^ ]+\.mjs:\d+:\d+$/u);
  const timer = doc.arms[`${id('src/fx/async.js', 6, ts)}#1`];
  assert.deepEqual([timer.caller, timer.detached], [null, true], 'a timer arm has no caller');
  assert.match(doc.arms[`${id('src/fx/chain.js', 5, ts)}#1`].caller, /^entry-.*\.mjs:\d+:\d+$/u);
  assert.equal(doc.arms[`${id('src/fx/typeof.js', 2, ty)}#0`].bucket, 'N2');
});

test('throw mode throws at exactly the selected arm, with the original error as cause', () => {
  const root = writeCheckout();
  const plan = planFor(root);
  const planFile = writePlan(root, plan);
  const chain = siteIdAt(root, 'src/fx/chain.js', 2, 'two_source_fallback_reads');
  const parse = siteIdAt(root, 'src/fx/catch.js', 4, 'catch_returns_default');
  const script = [
    'import {chain, inCall} from \'./src/fx/chain.js\';',
    'import {parse} from \'./src/fx/catch.js\';',
    'const out = {inCall: inCall({}, {name: \'b\'}), first: chain({x: 1}, {}, {})};',
    'for (const [name, run] of [[\'chain\', () => chain({}, {y: 2}, {})],',
    '  [\'parse\', () => parse(\'{bad\')]]) {',
    '  try { out[name] = run(); } catch (error) {',
    '    out[name] = {name: error.name, code: error.code, siteId: error.siteId,',
    '      armId: error.armId, cause: error.cause?.name ?? null};',
    '  }',
    '}',
    'console.log(JSON.stringify(out));',
    '',
  ].join('\n');
  const outDir = temporaryDirectory('necessity-throw-');
  const result = runChild(root, script, childEnvironment(root, planFile, outDir, {
    LAGRANGE_NECESSITY_TRAP_MODE: 'throw',
    LAGRANGE_NECESSITY_TRAP_SELECT: `site:${chain},site:${parse},!arm:${chain}#2`,
  }));
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout);
  assert.equal(out.inCall, 'b', 'an unselected arm runs');
  assert.equal(out.first, 1, 'an arm that is not reached does not throw');
  assert.deepEqual(out.chain, {name: 'NecessityTrapError', code: 'LAGRANGE_NECESSITY_TRAP',
    siteId: chain, armId: `${chain}#1`, cause: null});
  assert.deepEqual(out.parse, {name: 'NecessityTrapError', code: 'LAGRANGE_NECESSITY_TRAP',
    siteId: parse, armId: `${parse}#0`, cause: 'SyntaxError'});
  const [doc] = observations(outDir);
  assert.equal(doc.arms[`${chain}#1`].thrown, 1);
  assert.equal(doc.arms[`${chain}#2`], undefined, 'the trapped term stops the chain');
  assert.equal(Object.values(doc.arms).filter((arm) => arm.thrown > 0).length, 2);
  const unselected = runChild(root, script, childEnvironment(root, planFile,
    temporaryDirectory('necessity-throw-'), {LAGRANGE_NECESSITY_TRAP_MODE: 'throw',
      LAGRANGE_NECESSITY_TRAP_SELECT: `site:${chain},!arm:${chain}#1,!arm:${chain}#2`}));
  assert.equal(JSON.parse(unselected.stdout).chain, 2, 'an excluded arm runs');
});

test('throw mode without a selection and an unknown mode refuse the process', () => {
  const root = writeCheckout();
  const planFile = writePlan(root, planFor(root));
  for (const mode of ['throw', 'trace']) {
    const result = runChild(root, 'console.log("ran");\n', childEnvironment(root, planFile,
      temporaryDirectory('necessity-refuse-'), {LAGRANGE_NECESSITY_TRAP_MODE: mode}));
    assert.notEqual(result.status, 0, mode);
    assert.equal(result.stdout, '', `${mode}: nothing runs`);
  }
  assert.throws(() => parseSelection('sites:x'), /unrecognised selection token: sites:x/u);
});

test('a drifted file refuses to load and the refusal is recorded', () => {
  const root = writeCheckout();
  const planFile = writePlan(root, planFor(root));
  const chainFile = path.join(root, 'src/fx/chain.js');
  fs.writeFileSync(chainFile, fs.readFileSync(chainFile, 'utf8').replace('b.y', 'b.q'));
  const outDir = temporaryDirectory('necessity-drift-');
  const result = runChild(root, 'import \'./src/fx/chain.js\';\n',
    childEnvironment(root, planFile, outDir));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /LAGRANGE_NECESSITY_TRAP_DRIFT|refused src\/fx\/chain\.js/u);
  assert.deepEqual(observations(outDir)[0].refused,
    [{file: 'src/fx/chain.js', reason: 'slice-hash-mismatch'}]);
});

test('worker threads are armed and write their own observation file', () => {
  const root = writeCheckout();
  const planFile = writePlan(root, planFor(root));
  fs.writeFileSync(path.join(root, 'worker.mjs'), [
    'import {inCall} from \'./src/fx/chain.js\';',
    'inCall({}, {name: \'w\'});',
    '',
  ].join('\n'));
  const outDir = temporaryDirectory('necessity-worker-');
  const result = runChild(root, [
    'import {Worker} from \'node:worker_threads\';',
    'const worker = new Worker(new URL(\'./worker.mjs\', import.meta.url));',
    'await new Promise((resolve) => worker.once(\'exit\', resolve));',
    '',
  ].join('\n'), childEnvironment(root, planFile, outDir));
  assert.equal(result.status, 0, result.stderr);
  const docs = observations(outDir);
  assert.equal(docs.length, 2, 'one file for the main thread, one for the worker');
  const worker = docs.find((doc) => Object.keys(doc.arms).length > 0);
  assert.deepEqual(worker.loaded, ['src/fx/chain.js']);
  assert.match(worker.process, /:[1-9]\d*:/u, 'the worker names its thread');
});

test('the census pre-kill flush signal writes the counts so far', async () => {
  const root = writeCheckout();
  const planFile = writePlan(root, planFor(root));
  const outDir = temporaryDirectory('necessity-signal-');
  const entry = path.join(root, 'signal.mjs');
  fs.writeFileSync(entry, [
    'import {inCall} from \'./src/fx/chain.js\';',
    'inCall({}, {name: 1}); inCall({}, {name: 2}); inCall({}, {name: 3});',
    'console.log(\'ready\');',
    'setInterval(() => {}, 1000);',
    '',
  ].join('\n'));
  const child = spawn(process.execPath, [entry], {cwd: root,
    env: childEnvironment(root, planFile, outDir), stdio: ['ignore', 'pipe', 'pipe']});
  try {
    await new Promise((resolve) => child.stdout.once('data', resolve));
    const count = () => Object.values(observations(outDir)[0].arms)[0].count;
    assert.equal(count(), 1, 'the first hit is on disk at once');
    child.kill('SIGURG');
    const deadline = Date.now() + 5_000;
    while (count() !== 3 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(count(), 3);
  } finally {
    child.kill('SIGKILL');
  }
});

function observation(process, arms, extra = {}) {
  return {schema: 'fallback-necessity-trap-observation/1', plan: 'p1', head: 'h', mode: 'observe',
    selection: '', process, entry: null, loaded: ['src/a.js'], refused: [], arms, ...extra};
}

function hit(count, caller, extra = {}) {
  return {site: 'ts.aaaaaaaaaaaa.0', file: 'src/a.js', line: 3, bucket: 'N5',
    row: 'two_source_fallback_reads', term: 1, count, thrown: 0, caller, async: false,
    detached: caller === null, ...extra};
}

test('merge is deterministic, sums arms, unions callers and refuses bad inputs', () => {
  const left = temporaryDirectory('necessity-merge-');
  const right = temporaryDirectory('necessity-merge-');
  fs.writeFileSync(path.join(left, 'trap-1-0.json'), JSON.stringify(
    observation('h:1:0:t', {'ts.aaaaaaaaaaaa.0#1': hit(2, 'b.js:1:1')})));
  fs.writeFileSync(path.join(left, 'trap-2-0.json'), JSON.stringify(
    observation('h:2:0:t', {'ts.aaaaaaaaaaaa.0#1': hit(1, 'a.js:1:1')})));
  fs.writeFileSync(path.join(left, 'trap-9-0.json.tmp'), '{partial');
  fs.writeFileSync(path.join(right, 'trap-3-0.json'), JSON.stringify(
    observation('g:3:0:t', {'ts.aaaaaaaaaaaa.0#1': hit(4, null)}, {loaded: []})));
  const forward = mergeObservations(readMergeInputs([left, right]));
  const backward = mergeObservations(readMergeInputs([right, left]));
  assert.equal(JSON.stringify(forward), JSON.stringify(backward));
  const hostLevel = mergeObservations(readMergeInputs([left]));
  const merged = path.join(left, 'merged-left.json');
  fs.writeFileSync(merged, JSON.stringify(hostLevel));
  const twoLevel = mergeObservations([...readMergeInputs([right]),
    {doc: hostLevel, source: merged}]);
  assert.equal(JSON.stringify(twoLevel), JSON.stringify(forward), 'merging merged files is a union');
  const arm = forward.arms['ts.aaaaaaaaaaaa.0#1'];
  assert.deepEqual([arm.count, arm.processes, arm.callers, arm.detached],
    [7, 3, ['a.js:1:1', 'b.js:1:1'], true]);
  assert.deepEqual(forward.loaded, {'src/a.js': 2});
  assert.equal(forward.summary.processes, 3);
  assert.throws(() => mergeObservations([...readMergeInputs([left]), ...readMergeInputs([left])]),
    /a process is counted twice: h:1:0:t/u);
  assert.throws(() => mergeObservations([{doc: observation('x:1:0:t', {}, {plan: 'p2'}),
    source: 'x'}, ...readMergeInputs([right])]), /inputs disagree on plan/u);
  assert.throws(() => mergeObservations([{doc: {schema: 'other'}, source: 'odd.json'}]),
    /not a trap observation or merged trap file: odd\.json/u);
  const bound = mergeObservations(readMergeInputs([right]), {id: 'r1', lane: 'unit',
    laneExitCode: 1});
  assert.deepEqual(bound.run, {id: 'r1', lane: 'unit', laneExitCode: 1});
  assert.throws(() => mergeObservations([{doc: bound, source: 'bound.json'}]),
    /a run-bound trap result cannot be merged again/u);
});

test('the recorder refuses an unknown mode and records an unplanned arm without a site', () => {
  const outDir = temporaryDirectory('necessity-recorder-');
  const options = {plan: {head: 'h', files: {}}, planDigest: 'd', selection: parseSelection(''),
    outDir, root: outDir, processKey: 'k', entry: null, fileName: 'trap-0-0.json'};
  assert.throws(() => createTrapRecorder({...options, mode: 'trace'}), /must be one of/u);
  const recorder = createTrapRecorder({...options, mode: 'observe'});
  recorder.trap('ts.ffffffffffff.0#1');
  assert.equal(recorder.snapshot().arms['ts.ffffffffffff.0#1'].site, null);
});
