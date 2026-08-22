#!/usr/bin/env node

// dt-prove: prove a deterministic/directed test is RED-ON-REVERT — it passes with the
// fix and FAILS when the fix is reverted — without ever mutating the live working tree.
//
// The proof runs inside a throwaway snapshot worktree (session-worktree.js): build it
// with the full live fix, run the test (expect GREEN), revert only the --src paths there,
// run again (expect RED), restore and run once more (expect GREEN). A test that stays
// green after revert does NOT bind the mechanism it claims to prove.
//
//   npm run dt:prove -- --test <file> --src <path...> [--base <ref>]
//     [--record --id <q> --frontier <f>]
//
// --base (default HEAD) selects the revert target: for a fix that only lives in
// the working tree the default reverts to HEAD; for a mechanism already
// committed, pass the pre-mechanism commit so the revert restores the last
// broken state instead of no-oping against identical HEAD bytes.

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {createSnapshotWorktree, removeWorktree} from './session-worktree.js';

const DEFAULT_ENCODING = 'utf8';
const ARTIFACT_DIR = path.join('solve', 'changes', 'dt-prove');
const NODE_BIN = process.execPath;
const TEST_RUNNER = path.join('scripts', 'run-test-files.js');

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

const DEFAULT_BASE_REF = 'HEAD';
const ARG_BASE = '--base';
// rev-parse peel syntax: <ref>^{commit} verifies the ref names a commit.
const COMMIT_PEEL_SUFFIX = '^{commit}';
const GIT_REV_PARSE_VERIFY_ARGS = Object.freeze(['rev-parse', '--verify', '--quiet']);
const USAGE_TEXT = 'usage: dt-prove --test <file> --src <path...> [--base <ref>] ' +
  '[--record --id <q> --frontier <f>]\n';

function parseArgs(argv) {
  const parsed = {test: null, src: [], record: false, id: null, frontier: null,
    base: DEFAULT_BASE_REF};
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
    } else if (arg === ARG_BASE) {
      parsed.base = argv[++i] || DEFAULT_BASE_REF;
    }
  }
  return parsed;
}

const OUTPUT_TAIL_LINES = 40;
const NEWLINE = '\n';
const TAP_FAILURE_MARKER = 'not ok';

// Run the test INSIDE the worktree so relative imports load the worktree's src
// and the fail-closed runner writes its evidence there. The output tail is
// kept so the artifact can show WHICH assertions failed on the revert run —
// an exit code alone cannot distinguish behavior-red from import-red.
function runTap(worktreePath, testFile) {
  const result = spawnSync(NODE_BIN, [TEST_RUNNER, '--jobs=1', testFile],
    {cwd: worktreePath, encoding: DEFAULT_ENCODING, env: process.env});
  const combined = `${result.stdout || ''}${result.stderr || ''}`;
  const lines = combined.split(NEWLINE);
  return {
    status: typeof result.status === 'number' ? result.status : 1,
    outputTail: lines.slice(-OUTPUT_TAIL_LINES).join(NEWLINE),
    failureLines: lines.filter((line) => line.includes(TAP_FAILURE_MARKER)),
  };
}

function refHasPath(root, ref, relPath) {
  // Confirm a BLOB (file) at the ref, not a tree — `cat-file -e` returns 0 for directories too.
  const result = spawnSync('git', ['-C', root, 'cat-file', '-t', `${ref}:${relPath}`],
    {encoding: DEFAULT_ENCODING});
  return result.status === 0 && result.stdout.trim() === 'blob';
}

// Revert each --src path inside the worktree to its state at the base ref; files absent
// there (untracked or added since the base) are removed. Returns the saved fixed content
// so the caller can restore afterwards.
function revertSrcInWorktree(root, worktreePath, srcPaths, baseRef) {
  const saved = [];
  for (const rel of srcPaths) {
    const abs = path.join(worktreePath, rel);
    const existed = fs.existsSync(abs);
    saved.push({rel, existed, content: existed ? fs.readFileSync(abs) : null});
    if (refHasPath(root, baseRef, rel)) {
      spawnSync('git', ['-C', worktreePath, 'checkout', baseRef, '--', rel], {encoding: DEFAULT_ENCODING});
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

function recordFinding(root, {id, frontier, test, base, artifactPath}) {
  const result = spawnSync(NODE_BIN, [path.join('scripts', 'solve.js'), 'finding',
    '--id', id, '--frontier', frontier,
    '--claim', `DT red-on-revert proven for ${test} (revert base ${base})`,
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
    const fixRun = runTap(worktreePath, args.test);
    const saved = revertSrcInWorktree(root, worktreePath, args.src, args.base);
    const srcChanged = srcBytesChanged(worktreePath, saved);
    const revertRun = runTap(worktreePath, args.test);
    restoreSrcInWorktree(worktreePath, saved);
    const restoreRun = srcChanged ? runTap(worktreePath, args.test) :
      {status: 1, outputTail: ''};
    const classification = classifyProof({fixRunExit: fixRun.status, srcChanged,
      revertRunExit: revertRun.status, restoreRunExit: restoreRun.status});
    return {
      test: args.test, src: args.src, base: args.base,
      runs: {fixRunExit: fixRun.status, revertRunExit: revertRun.status,
        restoreRunExit: restoreRun.status},
      srcChanged,
      revertRunOutputTail: revertRun.outputTail,
      revertRunFailureLines: revertRun.failureLines,
      ...classification, timestamp: new Date().toISOString(),
    };
  } finally {
    removeWorktree(root, worktreePath);
  }
}

function main(argv = process.argv, root = process.cwd()) {
  const args = parseArgs(argv.slice(2));
  if (!args.test || args.src.length === 0) {
    process.stderr.write(USAGE_TEXT);
    return 2;
  }
  // A base that does not resolve to a commit would silently no-op every checkout and
  // masquerade as revert-noop; fail loudly instead.
  const baseResolves = spawnSync('git', ['-C', root, ...GIT_REV_PARSE_VERIFY_ARGS,
    `${args.base}${COMMIT_PEEL_SUFFIX}`], {encoding: DEFAULT_ENCODING}).status === 0;
  if (!baseResolves) {
    process.stderr.write(`--base does not resolve to a commit: ${args.base}\n`);
    return 2;
  }
  // --src must be files: a directory would revert the whole subtree and crash the byte-compare.
  const directories = directorySrcPaths(args.src);
  if (directories.length > 0) {
    process.stderr.write(`--src must name files, not directories: ${directories.join(', ')}\n`);
    return 2;
  }
  // Reverting an --src file absent at the base ref deletes it, so any test that imports it
  // goes red on import-existence alone — not on the behavior under test. Warn so the verdict
  // is read honestly; dt:prove binds behavior only when --src MODIFIES files present at base.
  const absentAtBase = args.src.filter((rel) => !refHasPath(root, args.base, rel));
  if (absentAtBase.length > 0) {
    process.stderr.write(`WARNING: --src not present at ${args.base} (revert = delete, proof may ` +
      `reflect import-existence not behavior): ${absentAtBase.join(', ')}\n`);
  }
  const payload = prove(root, args);
  const artifactPath = writeArtifact(payload);
  payload.artifactPath = artifactPath;
  if (args.record && payload.ok && args.id && args.frontier) {
    const recording = recordFinding(root, {id: args.id, frontier: args.frontier,
      test: args.test, base: args.base, artifactPath});
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
