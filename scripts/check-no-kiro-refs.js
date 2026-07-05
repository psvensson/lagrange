#!/usr/bin/env node

// Guard: the `.kiro/` namespace was retired (steering -> docs/steering,
// epics/specs -> solve/{epics,specs}; archived specs lived in _legacy_work
// until that directory was removed — history has them if ever needed). This
// check fails if a tracked file reintroduces a `.kiro/` path reference outside
// the whitelisted historical/immutable/external locations, so the old Kiro way
// of working cannot creep back in.
//
// Run via `npm run audit:no-kiro` (wired into test:static).

import {execFileSync} from 'node:child_process';

// Locations where a `.kiro/` reference is allowed because the content is an
// immutable historical record, a deliberate external snapshot, or a parallel
// working copy — none of which is the live operating surface.
const ALLOWED_PREFIXES = Object.freeze([
  '.claude/worktrees/', // parallel git worktrees
  'solve/changes/', // recorded historical diffs of past Quest work
  'solve/log/', // append-only event logs (immutable)
  'solve/report/', // terminal Quest reports (historical)
  'solve/autonomous/', // autorun state (historical)
  'solve/specs/raft-logic-migration/reports/', // generated benchmark data
  'scripts/check-no-kiro-refs.js', // this guard necessarily names the token
  // Generated guideline baselines capture violation VALUES verbatim — the
  // literals baseline includes this guard's own message string.
  'scripts/check-guideline-literals-baseline.json',
]);

const PATH_PATTERN = /\.kiro\//u;

function trackedHits() {
  let out = '';
  try {
    // -I skips binary files; list "file:line:text" for the literal token.
    out = execFileSync(
      'git',
      ['grep', '-nI', '--', '.kiro/'],
      {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024},
    );
  } catch (err) {
    // git grep exits 1 when there are no matches — that is the success path.
    if (err.status === 1 && !err.stdout) return [];
    throw err;
  }
  return out.split('\n').filter(Boolean);
}

function isAllowed(file) {
  return ALLOWED_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function main() {
  const violations = trackedHits()
    .filter((line) => PATH_PATTERN.test(line))
    .filter((line) => {
      const file = line.slice(0, line.indexOf(':'));
      return !isAllowed(file);
    });

  if (violations.length === 0) {
    console.log('no-kiro guard: clean (no live `.kiro/` references).');
    return;
  }

  console.error(
    'no-kiro guard FAILED: the `.kiro/` namespace is retired. ' +
    'Use docs/steering, solve/epics, or solve/specs instead.\n',
  );
  for (const line of violations) console.error(`  ${line}`);
  console.error(
    `\n${violations.length} disallowed reference(s). ` +
    'If a reference is a genuine historical record, place it under a ' +
    'whitelisted path in scripts/check-no-kiro-refs.js.',
  );
  process.exit(1);
}

main();
