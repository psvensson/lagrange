#!/usr/bin/env node
/**
 * The frozen steering corpus, derived (`node scripts/checks/steering-baseline-inventory.js`).
 *
 * The steering diet is only honest if the corpus it claims to have disposed of
 * is enumerated from the baseline itself rather than transcribed by hand. A
 * hand-written inventory can be silent about a file, and a ledger that sums to
 * a total it also declares cannot detect that silence. So this module reads
 * the frozen commit and derives, for every authored steering file, one entry
 * per section, with line counts that sum exactly to each file's own length.
 *
 * "Authored" excludes the generated pack under `docs/steering/llm` with two
 * exceptions: `core.md` and `boot.md` were hand-curated, which the baseline
 * generator states in the README it emits ("`core.md` and `boot.md` are
 * manually curated so the always-load contract stays memorable") and which the
 * baseline pack config repeats by marking the `core` output `manual` and never
 * declaring `boot` at all. They were steps 2 and 3 of the baseline load order,
 * so leaving them out would omit the always-load layer this work exists to
 * shrink. The generator is retired, so the fact is pinned here against the
 * frozen commit rather than re-derived from a deleted script.
 *
 * A section is a level-two heading and the lines beneath it; whatever precedes
 * the first heading is the front matter section. Line counts follow one
 * convention, owned by `countLines`, so no two counters can disagree.
 */

import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE = '60bd588f5ea3e8635d87cbdc9572f9bddf4dff2b';
const STEERING_DIR = 'docs/steering';
const GENERATED_DIR = 'docs/steering/llm/';
// Hand-curated despite living under the generated directory; see the header.
const AUTHORED_IN_GENERATED_DIR = Object.freeze([
  'docs/steering/llm/core.md',
  'docs/steering/llm/boot.md',
]);
const MARKDOWN_SUFFIX = '.md';
// A data sidecar has no headings; it is disposed of as one unit.
const WHOLE_FILE_SECTION = '(whole file)';
const AUTHORED_SUFFIXES = Object.freeze(['.md', '.json']);
const TEXT_ENCODING = 'utf8';
const LINE_SEPARATOR = '\n';
const EMPTY_TEXT = '';
const SECTION_HEADING = /^## (.+)$/u;
const FRONT_MATTER_SECTION = '(front matter)';
const SECTION_SEPARATOR = '#';
const MAX_BUFFER = 64 * 1024 * 1024;
const GIT = 'git';
const GIT_ROOT_FLAG = '-C';
const JSON_INDENT = 2;
const ARGV_OFFSET = 2;

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

/**
 * The one line convention in this repository's steering measurements: the
 * number of physical lines, so a file ending in a newline is not counted as
 * having one more line than it shows.
 * @param {string} text
 * @return {number}
 */
function countLines(text) {
  if (text === EMPTY_TEXT) return 0;
  const parts = stringSplit(text, LINE_SEPARATOR);
  return stringEndsWith(text, LINE_SEPARATOR) ? parts.length - 1 : parts.length;
}

function git(args) {
  return execFileSync(GIT, [GIT_ROOT_FLAG, REPO_ROOT, ...args],
    {encoding: TEXT_ENCODING, maxBuffer: MAX_BUFFER});
}

/**
 * Every authored steering file at the frozen baseline.
 * @return {string[]}
 */
function authoredFiles() {
  const tracked = arrayFilter(
    stringSplit(git(['ls-tree', '-r', '--name-only', BASELINE, '--', STEERING_DIR]),
      LINE_SEPARATOR),
    (file) => file !== EMPTY_TEXT &&
      arraySome(AUTHORED_SUFFIXES, (suffix) => stringEndsWith(file, suffix)));
  return arrayFilter(tracked, (file) =>
    !stringStartsWith(file, GENERATED_DIR) ||
    arrayIncludes(AUTHORED_IN_GENERATED_DIR, file)).sort();
}

// One entry per level-two section, in file order, whose lines sum to the file.
function sectionsOf(file) {
  const text = git(['show', `${BASELINE}:${file}`]);
  const lines = stringSplit(text, LINE_SEPARATOR);
  const trailing = stringEndsWith(text, LINE_SEPARATOR) ? 1 : 0;
  const body = lines.slice(0, lines.length - trailing);
  if (!stringEndsWith(file, MARKDOWN_SUFFIX)) {
    return [{file, section: WHOLE_FILE_SECTION, lines: countLines(text)}];
  }
  const sections = [{file, section: FRONT_MATTER_SECTION, lines: 0}];
  for (const line of body) {
    const heading = SECTION_HEADING.exec(line);
    if (heading) sections.push({file, section: heading[1], lines: 0});
    sections[sections.length - 1].lines += 1;
  }
  return arrayFilter(sections, (section) => section.lines > 0);
}

/**
 * The frozen corpus: every authored steering section at the baseline, with
 * the identity the disposition ledger addresses it by.
 * @return {{baseline: string, entries: Object[], total: number}}
 */
function baselineInventory() {
  const entries = [];
  for (const file of authoredFiles()) {
    for (const section of sectionsOf(file)) {
      entries.push({
        id: `${section.file}${SECTION_SEPARATOR}${section.section}`,
        file: section.file,
        section: section.section,
        lines: section.lines,
      });
    }
  }
  return {
    baseline: BASELINE,
    entries,
    total: entries.reduce((sum, entry) => sum + entry.lines, 0),
  };
}

function main() {
  const inventory = baselineInventory();
  process.stdout.write(`${JSON.stringify({
    baseline: inventory.baseline,
    files: new Set(arrayMap(inventory.entries, (entry) => entry.file)).size,
    sections: inventory.entries.length,
    total: inventory.total,
  }, null, JSON_INDENT)}${LINE_SEPARATOR}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(ARGV_OFFSET));
}

export {AUTHORED_IN_GENERATED_DIR, BASELINE, authoredFiles, baselineInventory, countLines};
