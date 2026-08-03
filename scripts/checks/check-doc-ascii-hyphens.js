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

// Module-load intrinsic captures (governed-tree rule: no direct ambient
// prototype-method calls on data in scripts/checks).
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringSplit = Function.call.bind(String.prototype.split);
const stringTrim = Function.call.bind(String.prototype.trim);

function isExcluded(relativePath) {
  for (const excluded of EXCLUDED_DIRECTORIES) {
    if (relativePath === excluded ||
        stringStartsWith(relativePath, excluded + path.sep)) {
      return true;
    }
  }
  return false;
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
  if (!stringIncludes(text, EM_DASH)) return [];
  const hits = [];
  const lines = stringSplit(text, LINE_SEPARATOR);
  for (let index = 0; index < lines.length; index += 1) {
    if (stringIncludes(lines[index], EM_DASH)) {
      hits.push(`${filePath}:${index + 1}: ${stringTrim(lines[index])}`);
    }
  }
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
