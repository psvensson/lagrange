#!/usr/bin/env node

// Curated lists are semantic subsets, not scheduling policy. Validate that
// each list is non-empty, duplicate-free, and points at live tests. Complete
// census ownership belongs to the primary/resource manifests; execution
// policy belongs to run-classified-test-files.js.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CURATED_SHARDS = Object.freeze([
  'test/shards/safety-pregate.txt',
  'test/shards/pgwire-unit.txt',
  'test/shards/pgwire-integration.txt',
  'test/shards/convergence-probes.txt',
]);
const NEWLINE = '\n';
const UTF8 = 'utf8';
const COMMENT_PREFIX = '#';
const SUCCESS_MESSAGE = 'curated test shards: current\n';

function shardEntries(root, shardPath) {
  const absolute = path.join(root, shardPath);
  if (!fs.existsSync(absolute)) return null;
  return fs.readFileSync(absolute, UTF8).split(NEWLINE)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith(COMMENT_PREFIX));
}

export function checkCuratedTestShards(root = process.cwd()) {
  const problems = [];
  for (const shardPath of CURATED_SHARDS) {
    const entries = shardEntries(root, shardPath);
    if (entries === null) {
      problems.push(`missing curated shard: ${shardPath}`);
      continue;
    }
    if (entries.length === 0) {
      problems.push(`empty curated shard: ${shardPath}`);
      continue;
    }
    if (new Set(entries).size !== entries.length) {
      problems.push(`duplicate entry in curated shard: ${shardPath}`);
    }
    for (const entry of entries) {
      if (!fs.existsSync(path.join(root, entry))) {
        problems.push(`${shardPath} references a missing test: ${entry}`);
      }
    }
  }
  return problems;
}

const problems = checkCuratedTestShards();
if (problems.length > 0) {
  process.stderr.write(`${problems.join(NEWLINE)}${NEWLINE}`);
  process.exitCode = 1;
} else {
  process.stdout.write(SUCCESS_MESSAGE);
}
