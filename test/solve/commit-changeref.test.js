import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

import tap from 'tap';

import {
  canonicalCommitDelta,
  commitDeltaChangedPaths,
} from '../../scripts/solve/content-addressed-change-artifact.js';
import {
  parseCommitChangeRef,
  isCommitChangeRef,
  inspectChangeArtifact,
  changeArtifactIdentity,
  changeArtifactIdentityIsSealed,
  inspectCommitChangeRefAdmission,
} from '../../scripts/solve/change-artifact.js';

function git(root, args) {
  return execFileSync('git', args, {cwd: root, encoding: 'utf8'});
}

// Build a two-commit repo: base, then a source-changing head.
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-changeref-'));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'solver@example.com']);
  git(root, ['config', 'user.name', 'Solver']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.writeFileSync(path.join(root, 'src/a.js'), 'export const a = 1;\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'base']);
  const base = git(root, ['rev-parse', 'HEAD']).trim();
  fs.writeFileSync(path.join(root, 'src/a.js'), 'export const a = 2;\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'source change']);
  const head = git(root, ['rev-parse', 'HEAD']).trim();
  const quest = {
    id: 'q', class: 'process', statement: 'runtime source work',
  };
  return {root, base, head, quest, ref: `commit:${base}:${head}`};
}

tap.test('parseCommitChangeRef parses and rejects non-commit refs', (t) => {
  const sha = 'a'.repeat(40);
  t.same(parseCommitChangeRef(`commit:${sha}:${sha}`), {base: sha, head: sha});
  t.equal(parseCommitChangeRef('diff:solve/changes/q/a.diff'), null);
  t.equal(parseCommitChangeRef(`commit:${sha}:notasha`), null);
  t.equal(isCommitChangeRef(`commit:${sha}:${sha}`), true);
  t.equal(isCommitChangeRef('diff:x'), false);
  t.end();
});

tap.test('canonicalCommitDelta reproduces a stable tree-to-tree fingerprint', (t) => {
  const fx = fixture();
  const first = canonicalCommitDelta(fx.root, fx.base, fx.head, []);
  const second = canonicalCommitDelta(fx.root, fx.base, fx.head, []);
  t.equal(first.ok, true);
  t.equal(first.fingerprint, second.fingerprint, 'fingerprint is reproducible');
  t.ok(first.content.includes('src/a.js'), 'delta names the changed path');
  t.same(commitDeltaChangedPaths(fx.root, fx.base, fx.head), ['src/a.js']);
  t.end();
});

tap.test('canonicalCommitDelta refuses reversed and unknown ranges', (t) => {
  const fx = fixture();
  const reversed = canonicalCommitDelta(fx.root, fx.head, fx.base, []);
  t.equal(reversed.ok, false);
  t.match(reversed.problem, /ancestor/);
  const unknown = canonicalCommitDelta(fx.root, '0'.repeat(40), fx.head, []);
  t.equal(unknown.ok, false);
  t.end();
});

tap.test('inspectChangeArtifact validates a commit ref and classifies paths', (t) => {
  const fx = fixture();
  const inspection = inspectChangeArtifact(fx.root, fx.quest, fx.ref);
  t.equal(inspection.valid, true, `problems: ${inspection.problems}`);
  t.same(inspection.changedPaths, ['src/a.js']);
  t.ok(inspection.payloadBytes > 0, 'payloadBytes populated for scope gate');
  const reversed = inspectChangeArtifact(
    fx.root, fx.quest, `commit:${fx.head}:${fx.base}`);
  t.equal(reversed.valid, false);
  t.end();
});

tap.test('changeArtifactIdentity seals a commit ref', (t) => {
  const fx = fixture();
  const identity = changeArtifactIdentity(fx.root, fx.quest.id, fx.ref);
  t.equal(identity.exists, true);
  t.equal(changeArtifactIdentityIsSealed(identity), true);
  const delta = canonicalCommitDelta(fx.root, fx.base, fx.head, []);
  t.equal(identity.sha256, delta.fingerprint.slice('sha256:'.length));
  t.end();
});

tap.test('inspectCommitChangeRefAdmission enforces clean tree + ancestry', (t) => {
  const fx = fixture();
  const inspection = inspectChangeArtifact(fx.root, fx.quest, fx.ref);
  // Clean tree, head == HEAD: admissible.
  t.same(
    inspectCommitChangeRefAdmission(fx.root, fx.ref, inspection),
    {applicable: true, ok: true},
  );
  // Dirty the claimed path: refused.
  fs.writeFileSync(path.join(fx.root, 'src/a.js'), 'export const a = 3;\n');
  t.match(
    inspectCommitChangeRefAdmission(fx.root, fx.ref, inspection).problem,
    /uncommitted changes/);
  t.end();
});

// A checkpoint commit bundles the quest's source paths together with the
// quest's OWN solve/ bookkeeping (attempt diffs, event log, report). That
// bookkeeping is what the Solver itself writes on every checkpoint, so it must
// not turn the committed range into a workflow-scope changeRef; only genuinely
// foreign workflow paths may still refuse.
function bookkeepingFixture(extraFile) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-changeref-bk-'));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'solver@example.com']);
  git(root, ['config', 'user.name', 'Solver']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.writeFileSync(path.join(root, 'src/a.js'), 'export const a = 1;\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'base']);
  const base = git(root, ['rev-parse', 'HEAD']).trim();
  // The checkpoint commit: a source change plus this quest's own bookkeeping.
  fs.writeFileSync(path.join(root, 'src/a.js'), 'export const a = 2;\n');
  fs.mkdirSync(path.join(root, 'solve/changes/q'), {recursive: true});
  fs.mkdirSync(path.join(root, 'solve/log'), {recursive: true});
  fs.mkdirSync(path.join(root, 'solve/report'), {recursive: true});
  fs.writeFileSync(path.join(root, 'solve/changes/q/attempt-1.diff'), 'diff\n');
  fs.writeFileSync(path.join(root, 'solve/log/q.ndjson'), '{}\n');
  fs.writeFileSync(path.join(root, 'solve/report/q.md'), '# report\n');
  if (extraFile) extraFile(root);
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'checkpoint(quest): q']);
  const head = git(root, ['rev-parse', 'HEAD']).trim();
  const quest = {
    id: 'q', class: 'process', statement: 'runtime source work',
  };
  return {root, base, head, quest, ref: `commit:${base}:${head}`};
}

tap.test('commit ref excluding own-quest solve/ bookkeeping is admissible', (t) => {
  const fx = bookkeepingFixture();
  const inspection = inspectChangeArtifact(fx.root, fx.quest, fx.ref);
  t.equal(
    inspection.valid, true,
    `own-quest bookkeeping must not scope-refuse: ${inspection.problems}`);
  t.ok(
    inspection.changedPaths.includes('src/a.js'),
    'source path still classified');
  t.end();
});

tap.test('commit ref still refuses foreign workflow paths in the range', (t) => {
  const fx = bookkeepingFixture((root) => {
    // Another quest's solve/ tree is foreign, not this quest's own bookkeeping.
    fs.mkdirSync(path.join(root, 'solve/changes/other-quest'), {recursive: true});
    fs.writeFileSync(
      path.join(root, 'solve/changes/other-quest/attempt-1.diff'), 'diff\n');
  });
  const inspection = inspectChangeArtifact(fx.root, fx.quest, fx.ref);
  t.equal(inspection.valid, false, 'foreign workflow path must still refuse');
  t.match(inspection.problems.join('; '), /workflow/);
  t.end();
});
