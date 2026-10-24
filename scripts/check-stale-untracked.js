#!/usr/bin/env node
// Stale-untracked check: possibly-finished work left uncommitted by an earlier
// session. Incident class: a completed, tested tool (a retired v1 solver module + its
// test) sat untracked overnight in the shared tree — the commit-on-completion
// posture depends on end-of-session attention, which is exactly when it fails.
// Quest attempts are auto-committed by the step machinery; this covers the gap
// (tool/process work done outside a step). Warn-only: every staleness verdict
// exits 0, and the one nonzero exit is the check's own read failing (an
// untracked list past the git output bound). The shared
// tree is legitimately dirty across parallel sessions, so "finished" cannot be
// gated mechanically — this only surfaces UNTRACKED source/test/script files old
// enough (>12h) that no live session is plausibly still working on them. Run via
// `npm run check:stale-untracked`; surfaced at boot as a SessionStart hook in
// .claude/settings.json.

import fs from 'node:fs';
import {execGit, isGitOutputTooLarge} from './checks/git-invocation.js';

const GIT_UNTRACKED_ARGUMENTS = Object.freeze([
  'ls-files',
  '--others',
  '--exclude-standard',
  '--',
]);
const TEXT_ENCODING = 'utf8';
const CHILD_PROCESS_STDIO = Object.freeze(['ignore', 'pipe', 'ignore']);
const LINE_SEPARATOR = '\n';
const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;
const STALE_AFTER_MS = 12 * MILLISECONDS_PER_HOUR;
const WATCHED_ROOTS = ['src', 'scripts', 'test'];
const STALE_WARNING =
  'stale-untracked check (warn-only): possibly finished work from a previous ' +
  'session left uncommitted - commit it (local gates first) or delete it.';

let output;
try {
  output = execGit(
    [...GIT_UNTRACKED_ARGUMENTS, ...WATCHED_ROOTS],
    {encoding: TEXT_ENCODING, stdio: CHILD_PROCESS_STDIO},
  );
} catch (error) {
  // An untracked list past the git output bound is a failure of its own.
  if (isGitOutputTooLarge(error)) throw error;
  process.exit(0); // Not a repo / git unavailable — nothing to check.
}

const now = Date.now();
const stale = [];
for (const file of output.split(LINE_SEPARATOR)
  .map((line) => line.trim()).filter(Boolean)) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    continue; // Raced away since ls-files — not our problem.
  }
  const ageMs = now - stat.mtimeMs;
  if (ageMs > STALE_AFTER_MS) {
    stale.push({file, hours: Math.round(ageMs / MILLISECONDS_PER_HOUR)});
  }
}

if (stale.length > 0) {
  process.stdout.write(`${STALE_WARNING}${LINE_SEPARATOR}`);
  for (const entry of stale) {
    process.stdout.write(
      `  - ${entry.file} (untracked for ~${entry.hours}h)${LINE_SEPARATOR}`,
    );
  }
}
process.exit(0);
