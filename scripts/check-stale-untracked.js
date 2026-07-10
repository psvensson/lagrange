#!/usr/bin/env node
// Stale-untracked check: possibly-finished work left uncommitted by an earlier
// session. Incident class: a completed, tested tool (scripts/solve/park.js + its
// test) sat untracked overnight in the shared tree — the commit-on-completion
// posture depends on end-of-session attention, which is exactly when it fails.
// Quest attempts are auto-committed by the step machinery; this covers the gap
// (tool/process work done outside a step). Warn-only (always exits 0): the shared
// tree is legitimately dirty across parallel sessions, so "finished" cannot be
// gated mechanically — this only surfaces UNTRACKED source/test/script files old
// enough (>12h) that no live session is plausibly still working on them. Run via
// `npm run check:stale-untracked`; surfaced at boot as a SessionStart hook in
// .claude/settings.json.

import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const STALE_AFTER_MS = 12 * 60 * 60 * 1000;
const WATCHED_ROOTS = ['src', 'scripts', 'test'];

let output;
try {
  output = execFileSync(
    'git', ['ls-files', '--others', '--exclude-standard', '--', ...WATCHED_ROOTS],
    {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']});
} catch {
  process.exit(0); // Not a repo / git unavailable — nothing to check.
}

const now = Date.now();
const stale = [];
for (const file of output.split('\n').map((line) => line.trim()).filter(Boolean)) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    continue; // Raced away since ls-files — not our problem.
  }
  const ageMs = now - stat.mtimeMs;
  if (ageMs > STALE_AFTER_MS) {
    stale.push({file, hours: Math.round(ageMs / (60 * 60 * 1000))});
  }
}

if (stale.length > 0) {
  process.stdout.write(
    'stale-untracked check (warn-only): possibly finished work from a previous ' +
    'session left uncommitted — commit it (local gates first) or delete it.\n');
  for (const entry of stale) {
    process.stdout.write(`  - ${entry.file} (untracked for ~${entry.hours}h)\n`);
  }
}
process.exit(0);
