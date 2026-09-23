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

import {Buffer} from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';

const arrayAt = Function.call.bind(Array.prototype.at);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayReduce = Function.call.bind(Array.prototype.reduce);
const arraySome = Function.call.bind(Array.prototype.some);
const bufferIncludes = Function.call.bind(Buffer.prototype.includes);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringToLowerCase = Function.call.bind(String.prototype.toLowerCase);

const RETIRED_TOKEN_PARTS = Object.freeze({
  HEAD: 'life',
  TAIL: 'raft',
  SEPARATOR: '',
});
const AUDIT_TEXT = Object.freeze({
  POSIX_SEPARATOR: '/',
  SOLVE_PREFIX: 'solve/',
  ROOT_DIRECTORY: '.',
  LINE_SEPARATOR: '\n',
  UTF8: 'utf8',
});
const MATCH_KIND = Object.freeze({
  FILENAME: 'filename',
  CONTENT: 'content',
});
const REPORT_SCHEMA = 'active-legacy-consensus-reference-audit/1';

const ROOT = process.cwd();
const RETIRED_TOKEN = stringToLowerCase(arrayJoin(
  [RETIRED_TOKEN_PARTS.HEAD, RETIRED_TOKEN_PARTS.TAIL],
  RETIRED_TOKEN_PARTS.SEPARATOR,
));
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
const LAST_INDEX = -1;
const FIRST_LINE_OFFSET = 1;
const FILENAME_LINE = 0;
const JSON_INDENT = 2;

function normalize(relativePath) {
  return arrayJoin(stringSplit(relativePath, path.sep), AUDIT_TEXT.POSIX_SEPARATOR);
}

function isHistoricalSolvePath(relativePath) {
  const normalized = normalize(relativePath);
  if (!stringStartsWith(normalized, AUDIT_TEXT.SOLVE_PREFIX)) {
    return false;
  }
  const segments = stringSplit(normalized, AUDIT_TEXT.POSIX_SEPARATOR);
  if (HISTORICAL_SOLVE_FILENAMES.has(arrayAt(segments, LAST_INDEX))) {
    return true;
  }
  return arraySome(
    segments,
    (segment) => HISTORICAL_SOLVE_SEGMENTS.has(segment),
  );
}

function shouldSkipDirectory(relativePath) {
  const name = path.basename(relativePath);
  return SKIP_DIRECTORY_NAMES.has(name) || isHistoricalSolvePath(relativePath);
}

function looksBinary(buffer) {
  return bufferIncludes(buffer, BINARY_NUL);
}

function collectFiles(relativeDirectory = AUDIT_TEXT.ROOT_DIRECTORY) {
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
  if (stringIncludes(stringToLowerCase(normalized), RETIRED_TOKEN)) {
    matches.push({kind: MATCH_KIND.FILENAME, line: FILENAME_LINE});
  }
  const buffer = fs.readFileSync(path.join(ROOT, relativePath));
  if (looksBinary(buffer)) {
    return matches;
  }
  const lines = stringSplit(
    buffer.toString(AUDIT_TEXT.UTF8),
    AUDIT_TEXT.LINE_SEPARATOR,
  );
  for (let index = 0; index < lines.length; index += 1) {
    if (stringIncludes(stringToLowerCase(lines[index]), RETIRED_TOKEN)) {
      matches.push({kind: MATCH_KIND.CONTENT, line: index + FIRST_LINE_OFFSET});
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

const metric = arrayReduce(
  findings,
  (sum, item) => sum + item.matches.length,
  0,
);
process.stdout.write(JSON.stringify({
  schema: REPORT_SCHEMA,
  metric,
  target: 0,
  fileCount: findings.length,
  findings,
}, null, JSON_INDENT) + AUDIT_TEXT.LINE_SEPARATOR);

process.exitCode = metric === 0 ? EXIT_OK : EXIT_REFERENCES_FOUND;
