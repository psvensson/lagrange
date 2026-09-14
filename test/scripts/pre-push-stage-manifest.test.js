// The pre-push gate's stages are declared in test/manifests/pre-push-stages.json
// and the hook runs exactly those, in that order; every stage that reads
// repository content is declared to read the pushed sha, and the hook reaches
// no content-reading stage before it has materialised that sha (or is already
// inside an exact checkout). The budget row gate_stages_off_pushed_sha reads
// the manifest; this witness is what makes the manifest true of the hook.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

const root = process.cwd();
const UTF8 = 'utf8';
const MANIFEST_PATH = 'test/manifests/pre-push-stages.json';
const HOOK_PATH = '.githooks/pre-push';
const TREE_PUSHED_SHA = 'pushed-sha';
const TREE_NONE = 'none';
const STAGE_LINE = /^\s*stage "([^"]+)"/u;
const MATERIALIZE_STAGE = 'materialize-pushed-tree';
const MATERIALIZER_FLAG = '--gate';
const INJECTION_GUARD = /-z "\$\{LAGRANGE_WORKSPACE_INJECTIONS:-\}"/u;
const WORKING_TREE_RATCHET = /push-gate-corpus-worktree\.js --ref/u;

function manifest() {
  return JSON.parse(fs.readFileSync(path.join(root, MANIFEST_PATH), UTF8));
}

function hookStageIds() {
  const lines = fs.readFileSync(path.join(root, HOOK_PATH), UTF8).split('\n');
  const ids = [];
  for (const line of lines) {
    const match = STAGE_LINE.exec(line);
    if (match) ids.push(match[1]);
  }
  return {ids, lines};
}

test('the hook runs exactly the declared stages, in the declared order', () => {
  const declared = manifest().stages.map((stage) => stage.id);
  assert.deepEqual(hookStageIds().ids, declared,
    'stage ids in .githooks/pre-push must equal the manifest, in order');
});

test('every stage reads the pushed sha or nothing', () => {
  for (const stage of manifest().stages) {
    assert.ok([TREE_PUSHED_SHA, TREE_NONE].includes(stage.tree),
      `${stage.id} declares tree ${stage.tree}; the working tree is never a ` +
      'proof input');
  }
});

test('no content-reading stage precedes the materialisation of the pushed sha', () => {
  const stages = manifest().stages;
  const materializeAt = stages.findIndex(
    (stage) => stage.id === MATERIALIZE_STAGE);
  assert.ok(materializeAt >= 0, 'the materialisation stage is declared');
  for (const stage of stages.slice(0, materializeAt)) {
    assert.equal(stage.tree, TREE_NONE,
      `${stage.id} runs before the pushed sha exists as a checkout`);
  }
  assert.ok(stages.slice(materializeAt + 1).some(
    (stage) => stage.tree === TREE_PUSHED_SHA),
  'the stages after materialisation read the pushed sha');
});

test('the hook materialises through the declared materializer, guarded by the injection variable', () => {
  const {lines} = hookStageIds();
  const materializeLine = lines.findIndex(
    (line) => STAGE_LINE.exec(line)?.[1] === MATERIALIZE_STAGE);
  assert.ok(materializeLine >= 0);
  const guard = lines.slice(0, materializeLine).findLastIndex(
    (line) => INJECTION_GUARD.test(line));
  assert.ok(guard >= 0,
    'the materialisation branch is entered only outside an exact checkout');
  const after = lines.slice(materializeLine, materializeLine + 8).join('\n');
  assert.match(after, new RegExp(MATERIALIZER_FLAG, 'u'),
    'the hook re-runs itself through the --gate materializer');
  assert.ok(!lines.some((line) => WORKING_TREE_RATCHET.test(line)),
    'no stage still materialises a second, ratchet-only copy of the tree');
});

test('the identity the gate proves is named by the manifest and exported by the materializer', () => {
  const {identity} = manifest();
  assert.equal(typeof identity.pushedSha, 'string');
  assert.equal(typeof identity.pushedRef, 'string');
  assert.equal(typeof identity.remoteBase, 'string');
  const materializer = fs.readFileSync(
    path.join(root, 'scripts/checks/push-gate-corpus-worktree.js'), UTF8);
  assert.ok(materializer.includes(identity.pushedSha),
    'the materializer exports the pushed sha under the declared name');
  const hook = fs.readFileSync(path.join(root, HOOK_PATH), UTF8);
  assert.ok(hook.includes(identity.pushedRef),
    'the hook exports the pushed ref under the declared name');
  assert.ok(hook.includes(`export ${identity.remoteBase}=`),
    'the hook exports the remote base under the declared name');
});
