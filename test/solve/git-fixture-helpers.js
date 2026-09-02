// Shared temp-git-repo scaffold for solver workflow tests. Extracted from
// three byte-identical copies (solver-preflight, solver-reattempt,
// solver-land-generated-output-coverage) the test duplication ratchet caught
// at the push gate: one owner for the scaffold, per-file fixtures keep only
// what differs.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEXT_ENCODING = 'utf8';

function gitRaw(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: TEXT_ENCODING,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function git(root, args) {
  return gitRaw(root, args).trim();
}

function writeFile(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
}

/**
 * One disposable git repository for a solver-workflow fixture: mkdtemp under
 * the given prefix, cleanup registered on the test, init with a deterministic
 * committer identity and signing off.
 *
 * @param {Object} t node:test context (t.after cleanup)
 * @param {string} tmpPrefix per-suite temp directory prefix
 * @return {string} repository root
 */
function initializeGitFixtureRoot(t, tmpPrefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), tmpPrefix));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'solver@example.com']);
  git(root, ['config', 'user.name', 'Solver']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  return root;
}

export {git, gitRaw, initializeGitFixtureRoot, writeFile};
