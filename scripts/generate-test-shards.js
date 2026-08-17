#!/usr/bin/env node

// Shard generator + completeness gate for the sharded test lanes.
//
// The integration/bootstrap shard files under test/shards/ were historically
// hand-maintained and drifted: files added after the shards were written were
// silently absent from every `test:integration:N` / `test:bootstrap:N` lane
// (112 files by 2026-07-02), and one shard referenced a deleted test. Bare
// `npm test` still discovered everything, so the sharded lanes and the full
// run covered different universes without any signal.
//
// This script is the single source of truth for the GENERATED shards:
//   node scripts/generate-test-shards.js                  # rewrite shard files
//   node scripts/generate-test-shards.js --check          # gate: fail on drift
//   node scripts/generate-test-shards.js --update-timings # refresh timings.json
//
// Deterministic layout: discovered *.test.js files are weighted by the
// COMMITTED duration snapshot (test/shards/timings.json) plus a fixed
// per-file spawn overhead, then packed longest-processing-time-first into a
// fixed number of lanes per root. Inputs are the tree plus the committed
// snapshot only — never live .tap output (which is gitignored and absent on a
// fresh checkout) — so the same tree always produces byte-identical shard
// files. Balanced lanes matter because the lanes can run concurrently; the
// wall-clock is the heaviest lane.
//
// `--update-timings` is the explicit refresh step: it sums the top-level
// `# time=` lines from .tap/test-results/**/*.tap for lane files and rewrites
// the snapshot (keeping existing entries for files with no fresh result).
// Run it occasionally after a full local run, commit the snapshot, and
// regenerate.
//
// Curated shards (safety-pregate, pgwire-*) are deliberate hand-picked lanes,
// NOT generated here. The completeness guarantee lives entirely in the
// generated lanes; curated lanes may overlap them. The --check mode still
// fails if a curated shard references a file that no longer exists.

import process from 'node:process';
import {readdirSync, readFileSync, writeFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  PRIMARY_CLASS_BOOTSTRAP,
  PRIMARY_CLASS_INTEGRATION,
  derivePrimaryClasses,
} from './checks/test-primary-classification.js';

const REPO_ROOT = '.';

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const NEWLINE = '\n';
const SHARD_DIR = 'test/shards';
const TIMINGS_FILE = 'test/shards/timings.json';
// Every lane file pays roughly this much wall-clock beyond its test bodies
// (node spawn + module-graph import under tap); weighting it keeps lanes
// with many small files from looking free.
const PER_FILE_OVERHEAD_MS = 1000;
// Weight for a file absent from the committed snapshot (new/renamed tests).
const DEFAULT_BODY_MS = 500;

// Discovery is by PRIMARY CLASS, never by directory. Walking `test/integration`
// re-created the very drift this generator exists to prevent: 14 files named
// `*.integration.test.js` living outside that directory (test/cdc, test/query,
// test/debug-runtime, test/control-plane, test/rebalancer) are classified
// `integration` by the classification owner, yet no directory walk could find
// them, so they were in no lane here and ran only inside the parallel
// `test:fast` glob. Asking the classifier makes the two surfaces agree by
// construction.
const GENERATED_SHARD_GROUPS = [
  // `exclude` re-homes files OUT of the blocking lanes into a curated shard
  // (they stay existence-checked via CURATED_SHARDS below, so they cannot
  // silently vanish). Current exclusions: in-process tests that assert
  // bounded-time convergence — the project's sealed position
  // (docs/convergence-donewhen-metric.md) is that bounded-time convergence
  // is a statistical, hardware-relative property certified by a Wilson bar
  // over N runs, not a per-run guarantee, so these cannot be deterministic
  // gate tests. They run on demand via `npm run test:convergence-probes`.
  {
    primaryClass: PRIMARY_CLASS_INTEGRATION,
    prefix: 'integration',
    lanes: 3,
    exclude: [
      'test/integration/message-group-multi-join-formation.integration.test.js',
      'test/integration/node-join-convergence-slo.integration.test.js',
      'test/integration/user-table-metadata-fanout.integration.test.js',
    ],
  },
  {primaryClass: PRIMARY_CLASS_BOOTSTRAP, prefix: 'bootstrap', lanes: 2},
];

const CURATED_SHARDS = [
  'safety-pregate.txt',
  'pgwire-unit.txt',
  'pgwire-integration.txt',
  'convergence-probes.txt',
];

// Pure: recursively collect *.test.js paths under a root, sorted.
function collectTestFiles(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.test.js')) {
        found.push(full);
      }
    }
  };
  walk(root);
  return found.sort();
}

function loadTimings() {
  if (!existsSync(TIMINGS_FILE)) {
    return {};
  }
  return JSON.parse(readFileSync(TIMINGS_FILE, 'utf8'));
}

// Pure: weight of one lane file — snapshot body time (or the default for
// unknown files) plus the fixed spawn overhead.
function fileWeightMs(file, timings) {
  const body = Number.isFinite(timings[file]) && timings[file] >= 0 ?
    timings[file] :
    DEFAULT_BODY_MS;
  return body + PER_FILE_OVERHEAD_MS;
}

// Pure: pack files into `lanes` buckets, longest-processing-time-first.
// Deterministic: files sort by weight desc then name asc; ties between lanes
// resolve to the lowest lane index. Each bucket is emitted sorted by name so
// snapshot refreshes only reshuffle membership, not intra-lane order. An
// empty lane is refused: `tap $(cat empty.txt)` degrades to bare `tap`, which
// silently runs tap's WHOLE default discovery instead of nothing.
function dealIntoLanes(files, lanes, timings = {}) {
  if (files.length < lanes) {
    throw new Error(
      `only ${files.length} test file(s) for ${lanes} lanes — an empty lane ` +
      'file would make its npm script run the full default tap discovery',
    );
  }
  const byWeight = [...files].sort((a, b) => {
    const diff = fileWeightMs(b, timings) - fileWeightMs(a, timings);
    return diff !== 0 ? diff : (a < b ? -1 : 1);
  });
  const buckets = Array.from({length: lanes}, () => []);
  const loads = new Array(lanes).fill(0);
  for (const file of byWeight) {
    let lightest = 0;
    for (let lane = 1; lane < lanes; lane++) {
      if (loads[lane] < loads[lightest]) {
        lightest = lane;
      }
    }
    buckets[lightest].push(file);
    loads[lightest] += fileWeightMs(file, timings);
  }
  return buckets.map((bucket) => bucket.sort());
}

// Pure: expected shard-file contents for one group, keyed by filename.
function buildGroupShards(group, files, timings) {
  const shards = {};
  dealIntoLanes(files, group.lanes, timings).forEach((bucket, laneIndex) => {
    const name = `${group.prefix}-${laneIndex + 1}.txt`;
    shards[name] = bucket.join(NEWLINE) + NEWLINE;
  });
  return shards;
}

// Pure: the group's candidate files. `primaryClass` asks the classification
// owner (which sees suffix-classified files anywhere in the tree); `root`
// remains for any group that is genuinely directory-shaped.
function collectGroupFiles(group) {
  if (group.primaryClass) {
    const {classes} = derivePrimaryClasses(REPO_ROOT);
    return Object.keys(classes)
      .filter((file) => classes[file] === group.primaryClass)
      .sort();
  }
  return collectTestFiles(group.root);
}

function buildExpectedShards() {
  const timings = loadTimings();
  const expected = {};
  for (const group of GENERATED_SHARD_GROUPS) {
    const excluded = new Set(group.exclude || []);
    const files = collectGroupFiles(group)
      .filter((file) => !excluded.has(file));
    Object.assign(expected, buildGroupShards(group, files, timings));
  }
  return expected;
}

function readShard(name) {
  const path = join(SHARD_DIR, name);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

// Pure-ish: compare expected vs on-disk generated shards; also verify every
// curated-shard entry still exists on disk. Returns {ok, problems[]}.
function checkShards(expected) {
  const problems = [];
  for (const [name, content] of Object.entries(expected)) {
    const actual = readShard(name);
    if (actual === null) {
      problems.push(`missing generated shard: ${SHARD_DIR}/${name}`);
      continue;
    }
    if (actual !== content) {
      const expectedSet = new Set(content.trim().split(NEWLINE));
      const actualSet = new Set(actual.trim().split(NEWLINE));
      const missing = [...expectedSet].filter((f) => !actualSet.has(f));
      const stale = [...actualSet].filter((f) => !expectedSet.has(f));
      problems.push(
        `${SHARD_DIR}/${name} is stale (` +
          `${missing.length} file(s) missing from lane, ${stale.length} stale entr(ies))`,
      );
    }
  }
  for (const name of CURATED_SHARDS) {
    const actual = readShard(name);
    if (actual === null) {
      problems.push(`missing curated shard: ${SHARD_DIR}/${name}`);
      continue;
    }
    for (const entry of actual.trim().split(NEWLINE)) {
      if (entry && !existsSync(entry)) {
        problems.push(`${SHARD_DIR}/${name} references a deleted file: ${entry}`);
      }
    }
  }
  return {ok: problems.length === 0, problems};
}

function writeShards(expected) {
  for (const [name, content] of Object.entries(expected)) {
    writeFileSync(join(SHARD_DIR, name), content);
  }
  return Object.keys(expected).sort();
}

// Sum the TOP-LEVEL (column-0) `# time=` lines of one saved tap result file.
function sumTapResultBodyMs(tapText) {
  let ms = 0;
  for (const line of tapText.split(NEWLINE)) {
    const match = /^(?:not )?ok \d+ .*# time=([\d.]+)(ms|s)\b/.exec(line);
    if (match) {
      ms += parseFloat(match[1]) * (match[2] === 's' ? 1000 : 1);
    }
  }
  return Math.round(ms);
}

// Refresh the committed snapshot from .tap/test-results (local, gitignored).
// Lane files with no fresh result keep their existing snapshot entry.
function updateTimings() {
  const laneFiles = new Set();
  for (const group of GENERATED_SHARD_GROUPS) {
    for (const file of collectTestFiles(group.root)) {
      laneFiles.add(file);
    }
  }
  const next = {...loadTimings()};
  let refreshed = 0;
  for (const file of laneFiles) {
    const resultPath = join('.tap/test-results', `${file}.tap`);
    if (!existsSync(resultPath)) {
      continue;
    }
    next[file] = Math.max(50, sumTapResultBodyMs(readFileSync(resultPath, 'utf8')));
    refreshed++;
  }
  for (const file of Object.keys(next)) {
    if (!laneFiles.has(file)) {
      delete next[file];
    }
  }
  const sorted = Object.fromEntries(
    Object.entries(next).sort(([a], [b]) => (a < b ? -1 : 1)),
  );
  writeFileSync(TIMINGS_FILE, JSON.stringify(sorted, null, 1) + NEWLINE);
  return {refreshed, total: Object.keys(sorted).length};
}

function isDirectRun() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  const checkMode = process.argv.includes('--check');
  if (process.argv.includes('--update-timings')) {
    const {refreshed, total} = updateTimings();
    process.stdout.write(
      `Refreshed ${refreshed} timing entr(ies) from .tap/test-results ` +
      `(${total} total in ${TIMINGS_FILE}); regenerate shards to apply.` +
      NEWLINE,
    );
    process.exit(EXIT_SUCCESS);
  }
  const expected = buildExpectedShards();
  if (checkMode) {
    const {ok, problems} = checkShards(expected);
    if (ok) {
      process.stdout.write(`Shards complete and current (${SHARD_DIR}/).` + NEWLINE);
      process.exitCode = EXIT_SUCCESS;
    } else {
      process.stderr.write(
        [
          'Shard drift detected — the sharded lanes would not run the full tree:',
          ...problems.map((p) => `  - ${p}`),
          '',
          'Regenerate with: node scripts/generate-test-shards.js',
          '(curated shards safety-pregate/pgwire-* are hand-maintained; fix those by hand)',
        ].join(NEWLINE) + NEWLINE,
      );
      process.exitCode = EXIT_FAILURE;
    }
  } else {
    const written = writeShards(expected);
    process.stdout.write(
      `Wrote ${written.length} shard file(s): ${written.join(', ')}` + NEWLINE,
    );
  }
}

export {buildExpectedShards, checkShards, collectTestFiles, dealIntoLanes};
