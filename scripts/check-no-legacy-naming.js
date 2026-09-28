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
import {fileURLToPath} from 'node:url';

import {isQuestLogPath} from './solve/store.js';

const LEGACY_TOKENS = Object.freeze([
  'ddb-admin',
  'ddb-cli',
  'DDB_NODE_ADDRESS',
  'DDB_REFRESH_INTERVAL',
  'DDB_CLI_DEBUG',
]);

const RETIRED_SERVICE_SURFACE_TOKENS = Object.freeze([
  'native_js',
  'js_wasm_component_v1',
  'JavaScript-envelope',
  '.lagrange/oci',
]);

const SERVICE_SURFACE_PREFIXES = Object.freeze([
  'README.md',
  'architecture/',
  'docs/',
  'examples/',
  'src/cli/service-command-router.js',
  'src/cli/service-wasm-scaffold.js',
]);

// Locations where a legacy token is allowed because the content is an
// immutable historical record or a parallel working copy.
// A quest's append-only log is the immutable historical record; the store
// owns which path that is (see isAllowed), so this guard carries no
// quest-layout knowledge of its own.
const ALLOWED_PREFIXES = Object.freeze([
  'CHANGELOG.md', // release history may name removed commands
  '.claude/worktrees/', // parallel git worktrees
  'scripts/check-no-legacy-naming.js', // this guard necessarily names the tokens
]);

// The CLI docs each carry one "the pre-rename `ddb-admin` alias was removed"
// note; only there may a line explain the rename by naming the old command.
const HISTORICAL_NOTE = /pre-rename/u;
const HISTORICAL_NOTE_PREFIX = 'src/cli/';

const PATTERN = new RegExp(LEGACY_TOKENS.join('|'), 'u');

function trackedHits(tokens) {
  let out = '';
  try {
    out = execFileSync(
      'git',
      ['grep', '-nI', '-E', '--', tokens.join('|')],
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
  return isQuestLogPath(file) ||
    ALLOWED_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function main() {
  const violations = trackedHits(LEGACY_TOKENS)
    .filter((line) => PATTERN.test(line))
    .filter((line) => {
      const file = line.slice(0, line.indexOf(':'));
      if (file.startsWith(HISTORICAL_NOTE_PREFIX) && HISTORICAL_NOTE.test(line)) {
        return false;
      }
      return !isAllowed(file);
    });

  const serviceSurfaceViolations = trackedHits(RETIRED_SERVICE_SURFACE_TOKENS)
    .filter((line) => {
      const file = line.slice(0, line.indexOf(':'));
      return SERVICE_SURFACE_PREFIXES.some((prefix) =>
        file === prefix || file.startsWith(prefix));
    });

  if (violations.length === 0 && serviceSurfaceViolations.length === 0) {
    console.log(
      'no-legacy-naming guard: clean (CLI naming and public service surface).',
    );
    return;
  }

  if (serviceSurfaceViolations.length > 0) {
    console.error(
      'no-legacy-naming guard FAILED: retired service-runtime details are ' +
      'not allowed in public docs, examples, CLI help, or generated scaffold docs.\n',
    );
    for (const line of serviceSurfaceViolations) console.error(`  ${line}`);
  }

  if (violations.length > 0) {
    console.error(
      'no-legacy-naming guard FAILED: the pre-release ddb CLI naming is ' +
      'retired. Use lagrange-admin / lagrange-cli / LAGRANGE_* instead.\n',
    );
    for (const line of violations) console.error(`  ${line}`);
  }
  const violationCount =
    violations.length + serviceSurfaceViolations.length;
  console.error(
    `\n${violationCount} disallowed reference(s). ` +
    'Historical solver records may retain old terms; public service surfaces may not.',
  );
  process.exit(1);
}

// Only scan when run directly; importing for tests must not execute it.
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export {ALLOWED_PREFIXES, isAllowed};
