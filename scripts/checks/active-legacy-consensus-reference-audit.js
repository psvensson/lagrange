#!/usr/bin/env node
/**
 * Active legacy consensus reference audit.
 *
 * The cutover target is zero references to the retired JS consensus backend in
 * every active repository surface. Historical append-only solve logs/evidence
 * are preserved as provenance and are the only semantic exclusions.
 *
 * The retired backend token is assembled rather than written literally so this
 * checker does not make its own target permanently non-zero.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const RETIRED_TOKEN = ['life', 'raft'].join('').toLowerCase();
const SKIP_DIRECTORY_NAMES = new Set([
  '.git',
  'node_modules',
  'coverage',
  'dist',
  'build',
  'test-output',
]);
const HISTORICAL_SOLVE_SEGMENTS = new Set([
  'evidence',
]);
const HISTORICAL_SOLVE_FILENAMES = new Set([
  'log.ndjson',
]);
const BINARY_NUL = 0;
const EXIT_OK = 0;
const EXIT_REFERENCES_FOUND = 1;

function normalize(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function isHistoricalSolvePath(relativePath) {
  const normalized = normalize(relativePath);
  if (!normalized.startsWith('solve/')) {
    return false;
  }
  const segments = normalized.split('/');
  if (HISTORICAL_SOLVE_FILENAMES.has(segments.at(-1))) {
    return true;
  }
  return segments.some((segment) => HISTORICAL_SOLVE_SEGMENTS.has(segment));
}

function shouldSkipDirectory(relativePath) {
  const name = path.basename(relativePath);
  return SKIP_DIRECTORY_NAMES.has(name) || isHistoricalSolvePath(relativePath);
}

function looksBinary(buffer) {
  return buffer.includes(BINARY_NUL);
}

function collectFiles(relativeDirectory = '.') {
  const absoluteDirectory = path.join(ROOT, relativeDirectory);
  const files = [];
  for (const entry of fs.readdirSync(absoluteDirectory, {withFileTypes: true})) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      if (!shouldSkipDirectory(relativePath)) {
        files.push(...collectFiles(relativePath));
      }
      continue;
    }
    if (entry.isFile() && !isHistoricalSolvePath(relativePath)) {
      files.push(relativePath);
    }
  }
  return files;
}

function matchesForFile(relativePath) {
  const normalized = normalize(relativePath);
  const matches = [];
  if (normalized.toLowerCase().includes(RETIRED_TOKEN)) {
    matches.push({kind: 'filename', line: 0});
  }
  const buffer = fs.readFileSync(path.join(ROOT, relativePath));
  if (looksBinary(buffer)) {
    return matches;
  }
  const lines = buffer.toString('utf8').split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].toLowerCase().includes(RETIRED_TOKEN)) {
      matches.push({kind: 'content', line: index + 1});
    }
  }
  return matches;
}

const findings = [];
for (const relativePath of collectFiles()) {
  const matches = matchesForFile(relativePath);
  if (matches.length > 0) {
    findings.push({
      path: normalize(relativePath),
      matches,
    });
  }
}

const metric = findings.reduce((sum, item) => sum + item.matches.length, 0);
process.stdout.write(JSON.stringify({
  schema: 'active-legacy-consensus-reference-audit/1',
  metric,
  target: 0,
  fileCount: findings.length,
  findings,
}, null, 2) + '\n');

process.exitCode = metric === 0 ? EXIT_OK : EXIT_REFERENCES_FOUND;
