#!/usr/bin/env node

// dt-prove: prove a deterministic/directed test is RED-ON-REVERT — it passes with the
// fix and FAILS when the fix is reverted — without ever mutating the live working tree.
//
// The proof runs inside a throwaway snapshot worktree (session-worktree.js): build it
// with the full live fix, run the test (expect GREEN), revert only the --src paths there,
// run again (expect RED), restore and run once more (expect GREEN). A test that stays
// green after revert does NOT bind the mechanism it claims to prove.
//
//   npm run dt:prove -- --test <file> --src <path...> [--record --id <q> --frontier <f>]

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {createSnapshotWorktree, removeWorktree} from './session-worktree.js';

const DEFAULT_ENCODING = 'utf8';
const ARTIFACT_DIR = path.join('solve', 'changes', 'dt-prove');
const NODE_BIN = process.execPath;
const TAP_BIN = path.join('node_modules', '.bin', 'tap');

const VERDICT_FIX_NOT_PASSING = 'fix-not-passing';
const VERDICT_REVERT_NOOP = 'revert-noop';
const VERDICT_NOT_BOUND = 'not-bound';
const VERDICT_RESTORE_FAILED = 'restore-failed';
const VERDICT_PROVEN = 'red-on-revert-proven';

// Pure decision: given the three run exit codes and whether the revert actually changed
// the --src bytes, classify the proof. Separated from all git/fs IO so it is unit-tested.
function classifyProof({fixRunExit, srcChanged, revertRunExit, restoreRunExit}) {
  if (fixRunExit !== 0) {
    return {verdict: VERDICT_FIX_NOT_PASSING, ok: false,
      detail: 'test does not pass WITH the fix; nothing to prove'};
  }
  if (!srcChanged) {
    return {verdict: VERDICT_REVERT_NOOP, ok: false,
      detail: 'reverting --src changed no bytes; the test does not exercise --src'};
  }
  if (revertRunExit === 0) {
    return {verdict: VERDICT_NOT_BOUND, ok: false,
      detail: 'test still PASSES with the fix reverted; it does not bind the mechanism'};
  }
  if (restoreRunExit !== 0) {
    return {verdict: VERDICT_RESTORE_FAILED, ok: false,
      detail: 'test did not return to GREEN after restore; result is not trustworthy'};
  }
  return {verdict: VERDICT_PROVEN, ok: true,
    detail: 'GREEN with fix, RED on revert, GREEN on restore'};
}

function parseArgs(argv) {
  const parsed = {test: null, src: [], record: false, id: null, frontier: null};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--test') {
      parsed.test = argv[++i] || null;
    } else if (arg === '--src') {
      while (argv[i + 1] && !argv[i + 1].startsWith('--')) {
        parsed.src.push(argv[++i]);
      }
    } else if (arg === '--record') {
      parsed.record = true;
    } else if (arg === '--id') {
      parsed.id = argv[++i] || null;
    } else if (arg === '--frontier') {
      parsed.frontier = argv[++i] || null;
    }
  }
  return parsed;
}

// Run the test INSIDE the worktree (cwd = worktree, repo-relative test path) so tap reads
// the worktree's .taprc, resolves the symlinked node_modules, and writes its output dirs
// within the throwaway tree. The test's relative imports load the worktree's src.
function runTap(worktreePath, testFile) {
  const result = spawnSync(NODE_BIN, [TAP_BIN, '--disable-coverage', testFile],
    {cwd: worktreePath, encoding: DEFAULT_ENCODING, env: process.env});
  return typeof result.status === 'number' ? result.status : 1;
}

function headHasPath(root, relPath) {
  // Confirm a BLOB (file) at HEAD, not a tree — `cat-file -e` returns 0 for directories too.
  const result = spawnSync('git', ['-C', root, 'cat-file', '-t', `HEAD:${relPath}`],
    {encoding: DEFAULT_ENCODING});
  return result.status === 0 && result.stdout.trim() === 'blob';
}

// Revert each --src path inside the worktree to its HEAD state; new (untracked) files are
// removed. Returns the saved fixed content so the caller can restore afterwards.
function revertSrcInWorktree(root, worktreePath, srcPaths) {
  const saved = [];
  for (const rel of srcPaths) {
    const abs = path.join(worktreePath, rel);
    const existed = fs.existsSync(abs);
    saved.push({rel, existed, content: existed ? fs.readFileSync(abs) : null});
    if (headHasPath(root, rel)) {
      spawnSync('git', ['-C', worktreePath, 'checkout', 'HEAD', '--', rel], {encoding: DEFAULT_ENCODING});
    } else if (existed) {
      fs.rmSync(abs, {force: true});
    }
  }
  return saved;
}

function restoreSrcInWorktree(worktreePath, saved) {
  for (const entry of saved) {
    if (!entry.existed) {
      continue;
    }
    const abs = path.join(worktreePath, entry.rel);
    fs.mkdirSync(path.dirname(abs), {recursive: true});
    fs.writeFileSync(abs, entry.content);
  }
}

function srcBytesChanged(worktreePath, saved) {
  return saved.some((entry) => {
    const abs = path.join(worktreePath, entry.rel);
    const now = fs.existsSync(abs) ? fs.readFileSync(abs) : null;
    if (entry.content === null || now === null) {
      return entry.content !== now;
    }
    return !entry.content.equals(now);
  });
}

function writeArtifact(payload) {
  fs.mkdirSync(ARTIFACT_DIR, {recursive: true});
  const base = path.basename(payload.test).replace(/[^a-zA-Z0-9._-]/g, '_');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(ARTIFACT_DIR, `${base}-${stamp}.json`);
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  return file;
}

function recordFinding(root, {id, frontier, test, artifactPath}) {
  const result = spawnSync(NODE_BIN, [path.join('scripts', 'solve.js'), 'finding',
    '--id', id, '--frontier', frontier,
    '--claim', `DT red-on-revert proven for ${test}`,
    '--evidence', `dt:${artifactPath}`], {cwd: root, encoding: DEFAULT_ENCODING});
  return {ok: result.status === 0, stderr: (result.stderr || '').trim()};
}

function directorySrcPaths(srcPaths) {
  return srcPaths.filter((rel) => {
    try {
      return fs.statSync(rel).isDirectory();
    } catch (_error) {
      return false;
    }
  });
}

function prove(root, args) {
  const worktreePath = createSnapshotWorktree(root);
  try {
    const fixRunExit = runTap(worktreePath, args.test);
    const saved = revertSrcInWorktree(root, worktreePath, args.src);
    const srcChanged = srcBytesChanged(worktreePath, saved);
    const revertRunExit = runTap(worktreePath, args.test);
    restoreSrcInWorktree(worktreePath, saved);
    const restoreRunExit = srcChanged ? runTap(worktreePath, args.test) : 1;
    const classification = classifyProof({fixRunExit, srcChanged, revertRunExit, restoreRunExit});
    return {
      test: args.test, src: args.src,
      runs: {fixRunExit, revertRunExit, restoreRunExit}, srcChanged,
      ...classification, timestamp: new Date().toISOString(),
    };
  } finally {
    removeWorktree(root, worktreePath);
  }
}

function main(argv = process.argv, root = process.cwd()) {
  const args = parseArgs(argv.slice(2));
  if (!args.test || args.src.length === 0) {
    process.stderr.write('usage: dt-prove --test <file> --src <path...> [--record --id <q> --frontier <f>]\n');
    return 2;
  }
  // --src must be files: a directory would revert the whole subtree and crash the byte-compare.
  const directories = directorySrcPaths(args.src);
  if (directories.length > 0) {
    process.stderr.write(`--src must name files, not directories: ${directories.join(', ')}\n`);
    return 2;
  }
  // Reverting an untracked-NEW --src file deletes it, so any test that imports it goes red
  // on import-existence alone — not on the behavior under test. Warn so the verdict is read
  // honestly; dt:prove binds behavior only when --src MODIFIES files that exist at HEAD.
  const untrackedNew = args.src.filter((rel) => !headHasPath(root, rel));
  if (untrackedNew.length > 0) {
    process.stderr.write('WARNING: --src not present at HEAD (revert = delete, proof may reflect ' +
      `import-existence not behavior): ${untrackedNew.join(', ')}\n`);
  }
  const payload = prove(root, args);
  const artifactPath = writeArtifact(payload);
  payload.artifactPath = artifactPath;
  if (args.record && payload.ok && args.id && args.frontier) {
    const recording = recordFinding(root, {id: args.id, frontier: args.frontier,
      test: args.test, artifactPath});
    payload.recorded = recording.ok;
    if (!recording.ok) {
      process.stderr.write(`WARNING: finding not recorded: ${recording.stderr}\n`);
    }
  }
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.stdout.write(`\n${payload.ok ? 'PROVEN' : 'NOT PROVEN'}: ${payload.verdict} — ${payload.detail}\n`);
  process.stdout.write(`artifact: ${artifactPath}\n`);
  return payload.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}

export {
  classifyProof,
  prove,
};
