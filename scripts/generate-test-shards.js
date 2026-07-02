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
//   node scripts/generate-test-shards.js          # rewrite shard files
//   node scripts/generate-test-shards.js --check  # gate: fail on any drift
//
// Deterministic layout: discovered *.test.js files are sorted and dealt
// round-robin into a fixed number of lanes per root, so the same tree always
// produces byte-identical shard files.
//
// Curated shards (safety-pregate, pgwire-*) are deliberate hand-picked lanes,
// NOT generated here. The completeness guarantee lives entirely in the
// generated lanes; curated lanes may overlap them. The --check mode still
// fails if a curated shard references a file that no longer exists.

import process from 'node:process';
import {readdirSync, readFileSync, writeFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const NEWLINE = '\n';
const SHARD_DIR = 'test/shards';

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
    root: 'test/integration',
    prefix: 'integration',
    lanes: 3,
    exclude: [
      'test/integration/message-group-multi-join-formation.integration.test.js',
      'test/integration/node-join-convergence-slo.integration.test.js',
      'test/integration/user-table-metadata-fanout.integration.test.js',
    ],
  },
  {root: 'test/bootstrap', prefix: 'bootstrap', lanes: 2},
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

// Pure: deal sorted files round-robin into `lanes` buckets. An empty lane is
// refused: `tap $(cat empty.txt)` degrades to bare `tap`, which silently runs
// tap's WHOLE default discovery instead of nothing.
function dealIntoLanes(files, lanes) {
  if (files.length < lanes) {
    throw new Error(
      `only ${files.length} test file(s) for ${lanes} lanes — an empty lane ` +
      'file would make its npm script run the full default tap discovery',
    );
  }
  const buckets = Array.from({length: lanes}, () => []);
  files.forEach((file, index) => {
    buckets[index % lanes].push(file);
  });
  return buckets;
}

// Pure: expected shard-file contents for one group, keyed by filename.
function buildGroupShards(group, files) {
  const shards = {};
  dealIntoLanes(files, group.lanes).forEach((bucket, laneIndex) => {
    const name = `${group.prefix}-${laneIndex + 1}.txt`;
    shards[name] = bucket.join(NEWLINE) + NEWLINE;
  });
  return shards;
}

function buildExpectedShards() {
  const expected = {};
  for (const group of GENERATED_SHARD_GROUPS) {
    const excluded = new Set(group.exclude || []);
    const files = collectTestFiles(group.root)
      .filter((file) => !excluded.has(file));
    Object.assign(expected, buildGroupShards(group, files));
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

function isDirectRun() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  const checkMode = process.argv.includes('--check');
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
