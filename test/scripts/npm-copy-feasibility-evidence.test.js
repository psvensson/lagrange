import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {test} from 'node:test';
import {spawnSync, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {stage} from '../../scripts/npm-package-copy-diagnostic.js';
import {refuseUnderProbe} from '../../src/test-helpers/probe-guard.js';
import {verifyStage, verifyPacked, verifyCollisions, GraphRefusal,
  LIMITS, outcomeFor, inventory, digest, ENTRIES, CONTROLS, hash,
} from '../../scripts/checks/npm-copy-feasibility-evidence.js';

refuseUnderProbe('npm native-copy diagnostic controls');
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'lagrange-npm-copy-controls-'));
console.log(`native-copy control evidence: ${ROOT}`);
const TIMEOUT = 10000;
const TOKEN = 'src/raw/token.js';
const CHILD = 'src/raw/child.js';
const DIRECT = 'src/raw/direct.js';
const UNSEEN = 'src/raw/unseen.js';
const SHARED = 'src/compiled/shared.js';
const ASSET = 'src/admin/static/playback-viewer.html';
const SCRIPT = fileURLToPath(new URL('../../scripts/npm-package-copy-diagnostic.js',
  import.meta.url));
function save(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', {flag: 'wx'});
}
function write(root, name, bytes) {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, bytes, {flag: 'wx'});
}
function relative(from, to) {
  const result = path.posix.relative(path.posix.dirname(from), to);
  return result.startsWith('.') ? result : `./${result}`;
}
function fixture() {
  const inputRoot = path.join(ROOT, 'input');
  const outputRoot = path.join(ROOT, 'output');
  write(inputRoot, 'package.json', JSON.stringify({name: 'lagrange-copy-control',
    version: '0.0.0', type: 'module', files: ['src/'], dependencies: {}}));
  write(inputRoot, TOKEN, 'import {child} from \'./child.js\'; export const token = {child};\n');
  write(inputRoot, CHILD, 'export const child = {value: 42};\n');
  write(inputRoot, DIRECT, 'export const direct = {value: 7};\n');
  write(inputRoot, UNSEEN, 'export const unseen = {};\n');
  write(inputRoot, ASSET, '<html>preserved canonical asset</html>\n');
  write(inputRoot, SHARED, `export {token} from '${relative(SHARED, TOKEN)}';\n`);
  const edges = [{from: SHARED, to: TOKEN}, {from: TOKEN, to: CHILD}];
  for (const entry of ENTRIES) {
    write(inputRoot, entry, `export {token} from '${relative(entry, SHARED)}';\n` +
      `export {direct} from '${relative(entry, DIRECT)}';\n`);
    edges.push({from: entry, to: SHARED}, {from: entry, to: DIRECT});
  }
  const raw = [TOKEN, CHILD, DIRECT, UNSEEN].sort();
  const compiled = [...ENTRIES, SHARED].sort();
  return {inputRoot, outputRoot, graph: {modules: [...raw, ...compiled].sort(), raw,
    compiled, edges, computed: [], violations: [], unclassified: [UNSEEN]}};
}
function rejects(controls, name, fn, expected) {
  let reason;
  assert.throws(fn, (error) => {
    reason = error.message;
    return error instanceof GraphRefusal && reason.includes(expected);
  }, name);
  controls.push({name, rejected: true, reason});
}
function altered(subject, name, file, content) {
  const root = path.join(ROOT, 'variants', name, 'package');
  fs.cpSync(subject.outputRoot, root, {recursive: true});
  const target = path.join(root, file);
  if (content === null) fs.unlinkSync(target);
  else fs.writeFileSync(target, content);
  return root;
}
function checkAlteration(subject, staged, controls, name, file, content, reason) {
  const root = altered(subject, name, file, content);
  rejects(controls, name, () => verifyStage(subject.inputRoot, root, subject.graph,
    staged.metafile, staged.copyLoads), reason);
}
function checkPreservationControls(subject, staged, controls) {
  checkAlteration(subject, staged, controls, 'missing-worker', ENTRIES[3], null, 'missing-entry:');
  checkAlteration(subject, staged, controls, 'missing-computed', ENTRIES[6], null, 'missing-entry:');
  checkAlteration(subject, staged, controls, 'changed-asset', ASSET, 'counterfeit', 'preserved-bytes:');
  checkAlteration(subject, staged, controls, 'input-root-external', ENTRIES[0],
    `export * from '${subject.inputRoot}/${ENTRIES[0]}';`, 'root-leak:');
  checkAlteration(subject, staged, controls, 'missing-raw-child', CHILD, null,
    `missing-preserved:${CHILD}`);
}
function checkRepresentationControls(subject, staged, controls) {
  const check = (meta) => verifyStage(subject.inputRoot, subject.outputRoot,
    subject.graph, meta, staged.copyLoads);
  const overlap = structuredClone(staged.metafile);
  overlap.inputs[CHILD] = {bytes: 1, imports: []};
  save(path.join(ROOT, 'raw-compiled-overlap-metafile.json'), overlap);
  rejects(controls, 'raw-compiled-overlap', () => check(overlap), 'raw-compiled-overlap:');
  const asJs = structuredClone(staged.metafile);
  asJs.inputs[CHILD] = {bytes: fs.statSync(path.join(subject.inputRoot, CHILD)).size, imports: []};
  asJs.outputs[ENTRIES[0]].inputs[CHILD] = {bytesInOutput: asJs.inputs[CHILD].bytes};
  save(path.join(ROOT, 'raw-as-js-metafile.json'), asJs);
  rejects(controls, 'raw-as-js', () => check(asJs), `raw-output-body:${CHILD}`);
  const renamed = structuredClone(staged.metafile);
  renamed.outputs['src/raw/renamed-token.js'] = renamed.outputs[TOKEN];
  delete renamed.outputs[TOKEN];
  save(path.join(ROOT, 'renamed-copy-metafile.json'), renamed);
  rejects(controls, 'renamed-copy', () => check(renamed), `renamed-copy:${TOKEN}`);
}
function checkCollision(subject, staged, controls) {
  const root = altered(subject, 'conflicting-output', TOKEN, 'wrong existing bytes');
  const row = staged.emissions.planned.find((item) => item.path === TOKEN);
  const before = digest(inventory(root));
  rejects(controls, 'conflicting-output', () =>
    verifyCollisions(subject.inputRoot, root, subject.graph, [row]), 'conflicting-output:');
  assert.equal(digest(inventory(root)), before, 'refusal performs no writes');
  assert.throws(() => verifyCollisions(subject.inputRoot, subject.outputRoot,
    subject.graph, [row, row]), /competing-output-identity:/u);
}
function packedFixture(subject, positive, controls) {
  const packedRoot = path.join(ROOT, 'packed');
  fs.mkdirSync(packedRoot);
  const packed = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts',
    '--offline', '--pack-destination', packedRoot], {cwd: subject.outputRoot,
    timeout: TIMEOUT, env: {...process.env, npm_config_offline: 'true',
      npm_config_audit: 'false', npm_config_fund: 'false',
      npm_config_update_notifier: 'false'}}))[0];
  save(path.join(ROOT, 'npm-pack.json'), packed);
  const tarball = path.join(packedRoot, packed.filename);
  const extracted = path.join(ROOT, 'extracted');
  fs.mkdirSync(extracted);
  execFileSync('tar', ['-xzf', tarball, '-C', extracted], {timeout: TIMEOUT});
  const tarRows = inventory(path.join(extracted, 'package'));
  save(path.join(ROOT, 'tar-inventory.json'), tarRows);
  const tarBytes = fs.readFileSync(tarball);
  const stats = verifyPacked(packed, positive.inventory, tarBytes, tarRows);
  rejects(controls, 'forged-count', () => verifyPacked({...packed,
    entryCount: packed.entryCount - 1}, positive.inventory, tarBytes, tarRows), 'packed-count');
  rejects(controls, 'forged-hash', () => verifyPacked({...packed, integrity: 'sha512-forged'},
    positive.inventory, tarBytes, tarRows), 'packed-hash');
  assert.equal(outcomeFor({...stats, entries: LIMITS.entries + 1}), 'budget_exceeded');
  assert.equal(outcomeFor(stats, 1), 'graph_refused');
  return stats;
}
test('native copy representation and named counterfeits at the real checker boundary', async () => {
  // This small nine-entry graph calibrates the verifier; it is not product feasibility evidence.
  const subject = fixture();
  const staged = await stage(subject.inputRoot, subject.outputRoot, subject.graph);
  save(path.join(ROOT, 'fixture.json'), subject);
  save(path.join(ROOT, 'staged.json'), staged);
  const positive = verifyStage(subject.inputRoot, subject.outputRoot,
    subject.graph, staged.metafile, staged.copyLoads);
  save(path.join(ROOT, 'verified-stage.json'), positive);
  assert.deepEqual(positive.violations, []);
  assert.deepEqual(staged.copyLoads.map((load) => load.path), [DIRECT, TOKEN]);
  assert.equal(staged.copyLoads.some((load) => load.path === CHILD), false);
  assert.equal(staged.copyLoads.some((load) => load.path === UNSEEN), false);
  assert.ok(positive.edges.some((edge) => edge.from === TOKEN && edge.to === CHILD));
  const controls = [];
  checkPreservationControls(subject, staged, controls);
  checkRepresentationControls(subject, staged, controls);
  checkCollision(subject, staged, controls);
  const stats = packedFixture(subject, positive, controls);
  assert.deepEqual(controls.map((control) => control.name).sort(), [...CONTROLS].sort());
  save(path.join(ROOT, 'controls.json'), {ceiling: 'verifier calibration only', controls, stats});
  const cliControls = [];
  existingControls(cliControls);
  freshControls(cliControls);
  save(path.join(ROOT, 'cli-controls.json'), cliControls);
});
function invoke(name, root, env) {
  const result = spawnSync(process.execPath, [SCRIPT, root], {env: {...process.env,
    LAGRANGE_PROBE: '0', ...env}, encoding: 'utf8', timeout: TIMEOUT});
  save(path.join(ROOT, 'cli', `${name}.json`), {command: [process.execPath, SCRIPT, root],
    env, status: result.status, signal: result.signal, error: result.error?.message,
    stdout: result.stdout, stderr: result.stderr});
  assert.equal(result.status, 1, name);
  return result;
}
function existingControls(controls) {
  const root = path.join(ROOT, 'existing-failure');
  fs.mkdirSync(root);
  write(root, 'first-unexpected.json', 'preserved-first-failure\n');
  const before = inventory(root);
  assert.match(invoke('existing-failure', root, {}).stderr, /EEXIST/u);
  assert.deepEqual(inventory(root), before);
  controls.push({name: 'existing-failure', passed: true});
  assert.match(invoke('probe-existing', root, {LAGRANGE_PROBE: '1'}).stderr,
    /refused under LAGRANGE_PROBE/u);
  assert.deepEqual(inventory(root), before);
  controls.push({name: 'probe-existing', passed: true});
  const empty = path.join(ROOT, 'existing-empty');
  fs.mkdirSync(empty);
  assert.match(invoke('existing-empty', empty, {}).stderr, /EEXIST/u);
  assert.deepEqual(fs.readdirSync(empty), []);
  controls.push({name: 'existing-empty', passed: true});
}
function freshControls(controls) {
  const absent = path.join(ROOT, 'probe-fresh');
  assert.match(invoke('probe-fresh', absent, {LAGRANGE_PROBE: '1'}).stderr,
    /refused under LAGRANGE_PROBE/u);
  assert.equal(fs.existsSync(absent), false);
  controls.push({name: 'probe-fresh', passed: true});
  const admitted = path.join(ROOT, 'fresh-postadmission');
  invoke('fresh-postadmission', admitted, {PATH: path.join(ROOT, 'no-tools')});
  const recorded = path.join(admitted, 'first-unexpected.json');
  const original = fs.readFileSync(recorded);
  assert.match(JSON.parse(original).message, /git.*ENOENT/u);
  assert.equal(typeof JSON.parse(original).stack, 'string');
  assert.equal(inventory(admitted).length, 1);
  controls.push({name: 'fresh-postadmission', passed: true, firstFailureSha256: hash(original)});
  assert.match(invoke('postadmission-retry', admitted, {}).stderr, /EEXIST/u);
  assert.deepEqual(fs.readFileSync(recorded), original);
  assert.equal(inventory(admitted).length, 1);
  controls.push({name: 'postadmission-retry', passed: true});
}
