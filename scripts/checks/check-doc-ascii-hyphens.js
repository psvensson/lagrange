// Public documentation must use ASCII hyphens, not em dashes (Peter,
// 2026-08-03). Scope is deliberately the PUBLIC-facing surfaces only:
// README.md, roadmap.md, examples/**, and docs/** excluding the internal
// steering and development zones - there is little value in forcing a
// cleanup of Solver records, generated agent packs, or internal source
// comments. New public docs must comply from the start.

import fs from 'node:fs';
import path from 'node:path';

const EM_DASH = '—';
const SCAN_ROOTS = Object.freeze(['README.md', 'roadmap.md', 'examples', 'docs']);
const EXCLUDED_DIRECTORIES = Object.freeze([
  path.join('docs', 'steering'),
  path.join('docs', 'development'),
]);
const FAILURE_MESSAGE =
  'Public documentation must use ASCII hyphens, not em dashes.';
const SUCCESS_MESSAGE = 'Public documentation is em-dash free.';
const TEXT_ENCODING_UTF8 = 'utf8';
const LINE_SEPARATOR = '\n';

function isExcluded(relativePath) {
  return EXCLUDED_DIRECTORIES.some((excluded) =>
    relativePath === excluded ||
    relativePath.startsWith(excluded + path.sep));
}

function* walkFiles(root) {
  const stat = fs.statSync(root, {throwIfNoEntry: false});
  if (!stat) return;
  if (stat.isFile()) {
    yield root;
    return;
  }
  for (const entry of fs.readdirSync(root, {withFileTypes: true})) {
    const entryPath = path.join(root, entry.name);
    if (isExcluded(entryPath)) continue;
    if (entry.isDirectory()) {
      yield* walkFiles(entryPath);
    } else if (entry.isFile()) {
      yield entryPath;
    }
  }
}

function findEmDashLines(filePath) {
  let text;
  try {
    text = fs.readFileSync(filePath, TEXT_ENCODING_UTF8);
  } catch {
    return [];
  }
  if (!text.includes(EM_DASH)) return [];
  const hits = [];
  text.split(LINE_SEPARATOR).forEach((line, index) => {
    if (line.includes(EM_DASH)) {
      hits.push(`${filePath}:${index + 1}: ${line.trim()}`);
    }
  });
  return hits;
}

const violations = [];
for (const root of SCAN_ROOTS) {
  for (const filePath of walkFiles(root)) {
    violations.push(...findEmDashLines(filePath));
  }
}

if (violations.length > 0) {
  for (const violation of violations) console.error(violation);
  console.error(FAILURE_MESSAGE);
  process.exit(1);
}
console.log(SUCCESS_MESSAGE);
