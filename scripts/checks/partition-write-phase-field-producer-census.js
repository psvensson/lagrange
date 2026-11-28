#!/usr/bin/env node
/**
 * Partition write-phase timing payload: every field has a producer
 * (`--metric` prints the count of fields without one).
 *
 * `buildWritePhaseTimingPayload` emits `phaseTimings?.[FIELD] || 0` for the
 * phase fields. A field that no code ever assigns reports a default zero that a
 * reader takes for a measurement. This census reads the tree only (R27): a
 * payload field read from `phaseTimings` is produced when its constant appears
 * in `src` anywhere other than its definition, an import or export list entry,
 * or the payload builder itself.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEXT_ENCODING = 'utf8';
const LINE_SEPARATOR = '\n';
const SRC_DIR = 'src';
const SHARED_PATH = 'src/partition/partition-service-shared.js';
const BUILDER_PATH = 'src/partition/partition-service-write-metrics-base.js';
const BUILDER_NAME = 'buildWritePhaseTimingPayload(';
const BUILDER_END = '\n  }\n';
const NOT_PRESENT = -1;
const EXIT_OK = 0;
const EXIT_VIOLATION = 1;
const EXIT_NOT_MEASURED = 2;
const ARGV_OFFSET = 2;
const METRIC_FLAG = '--metric';
const REGEX_FLAGS = 'u';
const SOURCE_SUFFIX = '.js';
const PHASE_READ = /phaseTimings\?\.\[(WRITE_PHASE_FIELD_[A-Z_]+)\]/gu;
const CONSTANT_DEFINITION = /^const (WRITE_PHASE_FIELD_[A-Z_]+) = '([^']+)';$/u;

const arrayFlatMap = Function.call.bind(Array.prototype.flatMap);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringIndexOf = Function.call.bind(String.prototype.indexOf);
const stringSplit = Function.call.bind(String.prototype.split);
const regexTest = Function.call.bind(RegExp.prototype.test);
const stringMatchAll = Function.call.bind(String.prototype.matchAll);

const ERROR_NAME = 'CensusNotMeasuredError';
const CENSUS_ERROR = Object.freeze({
  BUILDER_ABSENT: 'payload builder not found: nothing was measured',
  NO_PHASE_READ: 'payload builder reads no phaseTimings field: nothing was measured',
  UNDEFINED_CONSTANT: 'phase field constant has no definition line: ',
});

class CensusNotMeasuredError extends Error {
  constructor(reason) {
    super(reason);
    this.name = ERROR_NAME;
  }
}

function builderBodyRange(text) {
  const start = stringIndexOf(text, BUILDER_NAME);
  if (start === NOT_PRESENT) return null;
  const end = stringIndexOf(text, BUILDER_END, start);
  return {start, end: end === NOT_PRESENT ? text.length : end + BUILDER_END.length};
}

function withoutBuilderBody(text) {
  const range = builderBodyRange(text);
  if (range === null) return text;
  return stringSlice(text, 0, range.start) + stringSlice(text, range.end);
}

// A producer assigns the field: either as the field argument of
// `recordWritePhaseDuration(phaseTimings, FIELD, ...)` or by `[FIELD] = ...`.
function mentionsAsProducer(text, constant) {
  const recorded = new RegExp(
    `recordWritePhaseDuration\\(\\s*[\\w.?]+,\\s*${constant}\\b`, REGEX_FLAGS);
  const assigned = new RegExp(`\\[${constant}\\]\\s*=[^=]`, REGEX_FLAGS);
  return regexTest(recorded, text) || regexTest(assigned, text);
}

/**
 * Payload field names read from `phaseTimings` that no source file assigns.
 * @param {{sharedText: string, builderText: string, sources: {path: string, text: string}[]}} input
 *   `sources` holds every src file's text; the builder file is among them.
 * @return {string[]}
 */
function unproducedWritePhaseFields({sharedText, builderText, sources}) {
  const range = builderBodyRange(builderText);
  if (range === null) throw new CensusNotMeasuredError(CENSUS_ERROR.BUILDER_ABSENT);
  const body = stringSlice(builderText, range.start, range.end);
  const names = new Map();
  for (const line of stringSplit(sharedText, LINE_SEPARATOR)) {
    const match = CONSTANT_DEFINITION.exec(line);
    if (match) names.set(match[1], match[2]);
  }
  const read = arrayMap([...stringMatchAll(body, PHASE_READ)], (match) => match[1]);
  if (read.length === 0) throw new CensusNotMeasuredError(CENSUS_ERROR.NO_PHASE_READ);
  for (const constant of read) {
    if (!names.has(constant)) {
      throw new CensusNotMeasuredError(CENSUS_ERROR.UNDEFINED_CONSTANT + constant);
    }
  }
  const scanned = arrayMap(sources, (source) =>
    source.path === BUILDER_PATH ? withoutBuilderBody(source.text) : source.text);
  return arrayFlatMap(read, (constant) =>
    arraySome(scanned, (text) => mentionsAsProducer(text, constant)) ?
      [] : [names.get(constant)]);
}

function walk(root, relative) {
  const absolute = path.join(root, relative);
  return arrayFlatMap(fs.readdirSync(absolute, {withFileTypes: true}), (entry) => {
    const child = `${relative}/${entry.name}`;
    if (entry.isDirectory()) return walk(root, child);
    return stringEndsWith(entry.name, SOURCE_SUFFIX) ? [child] : [];
  });
}

function readTree(root = REPO_ROOT) {
  const sources = arrayMap(walk(root, SRC_DIR), (relative) => ({
    path: relative,
    text: fs.readFileSync(path.join(root, relative), TEXT_ENCODING),
  }));
  const textOf = (relative) =>
    fs.readFileSync(path.join(root, relative), TEXT_ENCODING);
  return {sharedText: textOf(SHARED_PATH), builderText: textOf(BUILDER_PATH), sources};
}

function main(argv) {
  let fields;
  try {
    fields = unproducedWritePhaseFields(readTree());
  } catch (error) {
    if (!(error instanceof CensusNotMeasuredError)) throw error;
    process.stderr.write(`${error.message}${LINE_SEPARATOR}`);
    return EXIT_NOT_MEASURED;
  }
  if (arrayIncludes(argv, METRIC_FLAG)) {
    process.stdout.write(`${fields.length}${LINE_SEPARATOR}`);
  } else {
    process.stdout.write(`${JSON.stringify({unproduced: fields}, null, 2)}${LINE_SEPARATOR}`);
  }
  return fields.length === 0 ? EXIT_OK : EXIT_VIOLATION;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(ARGV_OFFSET));
}

export {CensusNotMeasuredError, readTree, unproducedWritePhaseFields};
