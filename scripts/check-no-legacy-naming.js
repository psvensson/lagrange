#!/usr/bin/env node

// Guard: the pre-release `ddb` CLI naming was retired (ddb-admin ->
// lagrange-admin, ~/.ddb-admin -> ~/.lagrange-admin, DDB_* CLI env vars ->
// LAGRANGE_*, SEA binary ddb-cli -> lagrange-cli). This check fails if a
// tracked file reintroduces one of those legacy tokens outside whitelisted
// historical/immutable locations, so the old naming cannot creep back into
// newcomer-facing surfaces.
//
// Deliberately NOT matched: bare `ddb` (harness image tag distributed-db:test,
// addBudget-style identifiers) and the internal plumbing tokens
// __DDB_INPROC_MESSAGE_ROUTER__ / DDB_TEST_PORT_ALLOCATOR_NAMESPACE, which are
// not newcomer-facing and are renamed on their own schedule.
//
// Run via `npm run audit:no-legacy-naming` (wired into test:static).

import {execFileSync} from 'node:child_process';

const LEGACY_TOKENS = Object.freeze([
  'ddb-admin',
  'ddb-cli',
  'DDB_NODE_ADDRESS',
  'DDB_REFRESH_INTERVAL',
  'DDB_CLI_DEBUG',
]);

// Locations where a legacy token is allowed because the content is an
// immutable historical record or a parallel working copy.
const ALLOWED_PREFIXES = Object.freeze([
  'CHANGELOG.md', // release history may name removed commands
  '_legacy_work/', // pruned archive remainder
  'solve/changes/', // recorded historical diffs of past Quest work
  'solve/log/', // append-only event logs (immutable)
  'solve/report/', // terminal Quest reports (historical)
  'solve/autonomous/', // autorun state (historical)
  '.claude/worktrees/', // parallel git worktrees
  'scripts/check-no-legacy-naming.js', // this guard necessarily names the tokens
]);

// The CLI docs each carry one "the pre-rename `ddb-admin` alias was removed"
// note; only there may a line explain the rename by naming the old command.
const HISTORICAL_NOTE = /pre-rename/u;
const HISTORICAL_NOTE_PREFIX = 'src/cli/';

const PATTERN = new RegExp(LEGACY_TOKENS.join('|'), 'u');

function trackedHits() {
  let out = '';
  try {
    out = execFileSync(
      'git',
      ['grep', '-nI', '-E', '--', LEGACY_TOKENS.join('|')],
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
    .filter((line) => PATTERN.test(line))
    .filter((line) => {
      const file = line.slice(0, line.indexOf(':'));
      if (file.startsWith(HISTORICAL_NOTE_PREFIX) && HISTORICAL_NOTE.test(line)) {
        return false;
      }
      return !isAllowed(file);
    });

  if (violations.length === 0) {
    console.log('no-legacy-naming guard: clean (no live `ddb` CLI naming).');
    return;
  }

  console.error(
    'no-legacy-naming guard FAILED: the pre-release ddb CLI naming is ' +
    'retired. Use lagrange-admin / lagrange-cli / LAGRANGE_* instead.\n',
  );
  for (const line of violations) console.error(`  ${line}`);
  console.error(
    `\n${violations.length} disallowed reference(s). ` +
    'If a reference is a genuine historical record, place it under a ' +
    'whitelisted path in scripts/check-no-legacy-naming.js.',
  );
  process.exit(1);
}

main();
