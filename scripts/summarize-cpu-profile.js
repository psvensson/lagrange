#!/usr/bin/env node

// Text summary of a V8 .cpuprofile (what `node --cpu-prof` writes, and what
// `--profile-node` collects from a distributed run), so that a profile can
// be read without a browser:
//
//   - where the sampled time went overall (idle, garbage collection, code);
//   - the functions with the most SELF time;
//   - the files with the most self and inclusive time;
//   - the call paths, as chains of files, that carry the most time.
//
// Reads one file and prints; it starts nothing.
//
// Usage:
//   npm run analyze:cpu-profile -- <file.cpuprofile> [--top N] [--depth N] [--json]

import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const DEFAULT_TOP = 25;
// A call path is the last few distinct files of a stack: enough to say who
// called the hot file, short enough that paths aggregate.
const DEFAULT_PATH_DEPTH = 4;
const FLAG = Object.freeze({TOP: '--top', DEPTH: '--depth', JSON: '--json'});
const LINE_BREAK = '\n';
const HEADING = Object.freeze({
  SELF_FUNCTIONS: 'Top self-time functions (percent of busy time):',
  SELF_FILES: 'Top files by self time:',
  INCLUSIVE_FILES: 'Top files by inclusive time (the file is somewhere on the stack):',
  CALL_PATHS: 'Top call paths by file (caller > ... > running file):',
});
const FLAG_PREFIX = '--';
const VALUE_FLAGS = Object.freeze([FLAG.TOP, FLAG.DEPTH]);
const MICROSECONDS_PER_MILLISECOND = 1000;
const PERCENT = 100;
const JSON_INDENT = 2;
const TEXT_ENCODING = 'utf8';
const ANONYMOUS_FUNCTION = '(anonymous)';
const NATIVE_FILE = '(native)';
const FILE_URL_PREFIX = 'file://';
// The image's application root, and a dependency's path up to its package.
const APPLICATION_ROOT = '/app/';
const NODE_MODULES_MARKER = '/node_modules/';
const PATH_ARROW = ' > ';
const SPECIAL_FRAME = Object.freeze({
  IDLE: '(idle)',
  PROGRAM: '(program)',
  GARBAGE_COLLECTOR: '(garbage collector)',
  ROOT: '(root)',
});
const USAGE = 'usage: summarize-cpu-profile <file.cpuprofile> [--top N] [--depth N] [--json]\n';

function shortFile(url) {
  if (typeof url !== 'string' || url.length === 0) return NATIVE_FILE;
  const path = url.startsWith(FILE_URL_PREFIX) ? url.slice(FILE_URL_PREFIX.length) : url;
  const modulesAt = path.lastIndexOf(NODE_MODULES_MARKER);
  if (modulesAt >= 0) return path.slice(modulesAt + 1);
  const rootAt = path.indexOf(APPLICATION_ROOT);
  return rootAt >= 0 ? path.slice(rootAt + APPLICATION_ROOT.length) : path;
}

function frameOf(node) {
  const frame = node.callFrame ?? {};
  const name = frame.functionName ? frame.functionName : ANONYMOUS_FUNCTION;
  const file = shortFile(frame.url);
  return {name, file, line: frame.lineNumber >= 0 ? frame.lineNumber + 1 : null};
}

function add(map, key, value, describe) {
  const entry = map.get(key);
  if (entry === undefined) map.set(key, {...describe(), ms: value});
  else entry.ms += value;
}

function top(map, count, totalMs) {
  return [...map.values()].sort((left, right) => right.ms - left.ms).slice(0, count)
    .map((entry) => ({...entry, ms: Number(entry.ms.toFixed(1)),
      percent: totalMs > 0 ? Number((entry.ms / totalMs * PERCENT).toFixed(1)) : 0}));
}

/**
 * Summarize a parsed .cpuprofile.
 * @param {Object} profile - {nodes, samples, timeDeltas}.
 * @param {Object} [options] - {top, pathDepth}.
 * @return {Object} The summary.
 */
function summarizeCpuProfile(profile, {top: topCount = DEFAULT_TOP,
  pathDepth = DEFAULT_PATH_DEPTH} = {}) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parentOf = new Map();
  for (const node of profile.nodes) {
    for (const child of node.children ?? []) parentOf.set(child, node.id);
  }
  // Each node's stack as a chain of files, root first, repeats collapsed.
  const fileChains = new Map();
  const fileChainOf = (id) => {
    if (fileChains.has(id)) return fileChains.get(id);
    const parent = parentOf.get(id);
    const inherited = parent === undefined ? [] : fileChainOf(parent);
    const frame = frameOf(nodes.get(id));
    const chain = frame.name === SPECIAL_FRAME.ROOT || inherited.at(-1) === frame.file ?
      inherited : [...inherited, frame.file];
    fileChains.set(id, chain);
    return chain;
  };
  const selfByFunction = new Map();
  const selfByFile = new Map();
  const inclusiveByFile = new Map();
  const byPath = new Map();
  const special = {idleMs: 0, programMs: 0, garbageCollectorMs: 0};
  let totalMs = 0;
  profile.samples.forEach((id, index) => {
    const ms = Math.max(0, profile.timeDeltas[index] ?? 0) / MICROSECONDS_PER_MILLISECOND;
    totalMs += ms;
    const frame = frameOf(nodes.get(id));
    if (frame.name === SPECIAL_FRAME.IDLE) {
      special.idleMs += ms;
      return;
    }
    if (frame.name === SPECIAL_FRAME.PROGRAM) special.programMs += ms;
    if (frame.name === SPECIAL_FRAME.GARBAGE_COLLECTOR) special.garbageCollectorMs += ms;
    add(selfByFunction, `${frame.name}\n${frame.file}\n${frame.line}`, ms, () => frame);
    add(selfByFile, frame.file, ms, () => ({file: frame.file}));
    const chain = fileChainOf(id);
    for (const file of new Set(chain)) add(inclusiveByFile, file, ms, () => ({file}));
    const path = chain.slice(-pathDepth).join(PATH_ARROW);
    add(byPath, path, ms, () => ({path}));
  });
  const busyMs = totalMs - special.idleMs;
  const round = (value) => Number(value.toFixed(1));
  return {
    samples: profile.samples.length,
    sampledMs: round(totalMs),
    idleMs: round(special.idleMs),
    busyMs: round(busyMs),
    busyPercent: totalMs > 0 ? round(busyMs / totalMs * PERCENT) : 0,
    garbageCollectorMs: round(special.garbageCollectorMs),
    programMs: round(special.programMs),
    // Percentages below are of the BUSY time: an idle loop is not a cost.
    topSelfFunctions: top(selfByFunction, topCount, busyMs),
    topSelfFiles: top(selfByFile, topCount, busyMs),
    topInclusiveFiles: top(inclusiveByFile, topCount, busyMs),
    topCallPathsByFile: top(byPath, topCount, busyMs),
  };
}

function column(value, width) {
  return String(value).padStart(width);
}

/**
 * @param {Object} summary - summarizeCpuProfile's result.
 * @return {string} The summary as text.
 */
function formatCpuProfileSummary(summary) {
  const row = (entry, label) => `${column(entry.ms, 10)} ms ${column(entry.percent, 5)} %  ${label}`;
  return [
    `sampled ${summary.sampledMs} ms in ${summary.samples} samples: busy ${summary.busyMs} ms ` +
      `(${summary.busyPercent} %), idle ${summary.idleMs} ms, garbage collector ` +
      `${summary.garbageCollectorMs} ms, (program) ${summary.programMs} ms`,
    '',
    HEADING.SELF_FUNCTIONS,
    ...summary.topSelfFunctions.map((entry) => row(entry,
      `${entry.name}  ${entry.file}${entry.line === null ? '' : `:${entry.line}`}`)),
    '',
    HEADING.SELF_FILES,
    ...summary.topSelfFiles.map((entry) => row(entry, entry.file)),
    '',
    HEADING.INCLUSIVE_FILES,
    ...summary.topInclusiveFiles.map((entry) => row(entry, entry.file)),
    '',
    HEADING.CALL_PATHS,
    ...summary.topCallPathsByFile.map((entry) => row(entry, entry.path)),
    '',
  ].join(LINE_BREAK);
}

function numberFlag(argv, flag, fallback) {
  const at = argv.indexOf(flag);
  const value = at >= 0 ? Number(argv[at + 1]) : Number.NaN;
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/**
 * @param {Array<string>} argv
 * @param {Function} [write]
 * @return {number} Exit code: 0 summarized, 2 usage.
 */
function main(argv, write = (text) => process.stdout.write(text)) {
  const file = argv.find((arg, index) => !arg.startsWith(FLAG_PREFIX) &&
    !VALUE_FLAGS.includes(argv[index - 1]));
  if (file === undefined) {
    process.stderr.write(USAGE);
    return 2;
  }
  const summary = summarizeCpuProfile(JSON.parse(readFileSync(resolve(file), TEXT_ENCODING)), {
    top: numberFlag(argv, FLAG.TOP, DEFAULT_TOP),
    pathDepth: numberFlag(argv, FLAG.DEPTH, DEFAULT_PATH_DEPTH),
  });
  write(argv.includes(FLAG.JSON) ?
    `${JSON.stringify(summary, null, JSON_INDENT)}\n` : formatCpuProfileSummary(summary));
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}

export {formatCpuProfileSummary, main, summarizeCpuProfile};
