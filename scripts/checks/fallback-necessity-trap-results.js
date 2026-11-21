/**
 * What a trap run's observation files add up to (fallback-necessity-trap.js
 * documents the experiment): `merge` folds them with the lane's roster into
 * one deterministic file, and `report` classifies every planned arm against
 * the plan and the lane's outcome. Neither ever reads a missing observation
 * as "the arm did not run".
 *
 * merge: per directory, the observation files (`trap-*.json`, one per
 * process start) and the census roster (`roster-<pid>-<thread>.json`, written
 * by the census preload in roster-only mode for every Node child and worker
 * the lane launched). A rostered process with no observation is UNOBSERVED; an
 * observation that ran without the roster, or reached merge without its
 * directory, is UNROSTERED; a file a process refused to load is REFUSED. Any
 * of these makes the merge INCOMPLETE (`complete: false`, exit 1). Merged
 * files from several hosts merge again by union; a process counted twice, or
 * inputs of different plans, modes or selections, are refused.
 *
 * report: every planned arm is HIT (it ran), NOT-REACHED (its file loaded in
 * some process and the arm never ran) or NOT-LOADED (no process loaded its
 * file: nothing is known). In a throw run each armed arm that threw is
 * SURFACED (the lane failed and its marker error reached the lane's output
 * or a process's uncaught handler) or SWALLOWED (it threw and the lane stayed
 * green, or its error appears nowhere): a swallowed arm is a finding of its
 * own - an outer handler eats errors - and never means "not needed". Verdict:
 * INCOMPLETE (merge incomplete), COMPLETE (observe), UNBOUND (throw run with
 * no lane outcome), SWALLOWED, SURFACED, or NOT-REACHED (no armed arm ran).
 * The report records the lane's failed test files (`not ok test/...test.js`
 * lines or result records with `ok: false`) for the kept-arm rule
 * (fallback-read-closure.js).
 *
 * Governed by the ambient-intrinsic audit: prototype methods are captured at
 * module load.
 */
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {ROSTER_MARKER} from './fallback-branch-census-constants.js';
import {
  OBSERVATION_PREFIX, OBSERVATION_SCHEMA, OBSERVATION_SUFFIX, TRAP_MODE, armRecords,
  parseSelection, selectedArmIds,
} from './fallback-necessity-trap-runtime.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const regexpExec = Function.call.bind(RegExp.prototype.exec);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);

const MERGED_SCHEMA = 'fallback-necessity-trap-merged/2';
const REPORT_SCHEMA = 'fallback-necessity-trap-report/1';
const TEXT_ENCODING = 'utf8';
const DIGEST_ALGORITHM = 'sha256';
const DIGEST_ENCODING = 'hex';
const LINE_SEPARATOR = '\n';
const KEY_SEPARATOR = ':';
const RECORD_OPEN = '{';
const ROSTER_FILE = /^roster-(\d+)-(\d+)\.json$/u;
const FAILED_TEST_LINE = /(?:^|[\s\]])not ok (test\/\S+?\.test\.js)/u;
const MERGE_KEYS = Object.freeze(['plan', 'head', 'mode', 'selection', 'armed']);
const VERDICT = Object.freeze({
  INCOMPLETE: 'INCOMPLETE', COMPLETE: 'COMPLETE', UNBOUND: 'UNBOUND',
  SWALLOWED: 'SWALLOWED', SURFACED: 'SURFACED', NOT_REACHED: 'NOT-REACHED',
});
const PASSING_VERDICTS = Object.freeze(new Set([
  VERDICT.COMPLETE, VERDICT.SURFACED, VERDICT.NOT_REACHED,
]));
const PROBLEM = Object.freeze({
  SCHEMA: 'not a trap observation or merged trap file: ',
  MIXED: 'inputs disagree on ',
  DUPLICATE: 'a process is counted twice: ',
  EMPTY: 'no observation files in the inputs',
  OTHER_PLAN: 'the merged result was produced under another plan than ',
  UNOBSERVED_DIRECTORY: 'a directory with roster entries holds no observation at all: ',
});

function sortedObject(table, value = (item) => item) {
  const sorted = {};
  for (const key of objectKeys(table).sort()) sorted[key] = value(table[key]);
  return sorted;
}

function processKeyOf(doc) {
  return `${doc.pid}${KEY_SEPARATOR}${doc.threadId}`;
}

function emptyRoster() {
  return {expected: 0, unobserved: [], unrostered: []};
}

// One observation file as a merged-shape document; `roster` is its
// directory's accounting, or null when the file arrived without it.
function observationAsMerged(doc, source, roster) {
  if (doc?.schema !== OBSERVATION_SCHEMA) throw new Error(`${PROBLEM.SCHEMA}${source}`);
  const arms = {};
  for (const id of objectKeys(doc.arms)) {
    const {caller, ...arm} = doc.arms[id];
    arms[id] = {...arm, processes: 1, callers: caller ? [caller] : []};
  }
  const loaded = {};
  for (const file of doc.loaded) loaded[file] = 1;
  const accounted = roster && doc.roster === true;
  return {schema: MERGED_SCHEMA, plan: doc.plan, head: doc.head, mode: doc.mode,
    selection: doc.selection, armed: doc.armed, processes: [doc.process],
    roster: {...emptyRoster(), unrostered: accounted ? [] : [doc.process]}, loaded,
    refused: arrayMap(doc.refused, (item) => ({...item, processes: 1})), arms};
}

function addArm(into, arm) {
  if (!into) return {...arm, callers: [...arm.callers]};
  return {...into, count: into.count + arm.count, thrown: into.thrown + arm.thrown,
    surfaced: into.surfaced + arm.surfaced, processes: into.processes + arm.processes,
    async: into.async || arm.async, detached: into.detached || arm.detached,
    callers: [...new Set([...into.callers, ...arm.callers])]};
}

function mergedSummary(arms) {
  const sites = new Set();
  const byBucket = {};
  let thrownArms = 0;
  for (const id of objectKeys(arms)) {
    const arm = arms[id];
    if (arm.thrown > 0) thrownArms += 1;
    if (!objectHasOwn(byBucket, arm.bucket)) byBucket[arm.bucket] = {arms: 0, sites: 0};
    byBucket[arm.bucket].arms += 1;
    if (!sites.has(arm.site)) byBucket[arm.bucket].sites += 1;
    sites.add(arm.site);
  }
  return {armsHit: objectKeys(arms).length, sitesHit: sites.size, thrownArms,
    byBucket: sortedObject(byBucket)};
}

function assertMergeable(docs) {
  if (docs.length === 0) throw new Error(PROBLEM.EMPTY);
  for (const key of MERGE_KEYS) {
    if (arraySome(docs, (doc) => doc[key] !== docs[0][key])) {
      throw new Error(`${PROBLEM.MIXED}${key}`);
    }
  }
}

function foldDocument(totals, doc) {
  for (const key of doc.processes) {
    if (totals.processes.has(key)) throw new Error(`${PROBLEM.DUPLICATE}${key}`);
    totals.processes.add(key);
  }
  for (const file of objectKeys(doc.loaded)) {
    totals.loaded[file] = (totals.loaded[file] ?? 0) + doc.loaded[file];
  }
  for (const item of doc.refused) {
    const key = jsonStringify([item.file, item.reason]);
    totals.refused.set(key, {file: item.file, reason: item.reason,
      processes: (totals.refused.get(key)?.processes ?? 0) + item.processes});
  }
  for (const id of objectKeys(doc.arms)) totals.arms[id] = addArm(totals.arms[id], doc.arms[id]);
  totals.roster.expected += doc.roster.expected;
  totals.roster.unobserved.push(...doc.roster.unobserved);
  totals.roster.unrostered.push(...doc.roster.unrostered);
}

function compareEntries(left, right) {
  const leftKey = jsonStringify(left);
  const rightKey = jsonStringify(right);
  if (leftKey === rightKey) return 0;
  return leftKey < rightKey ? -1 : 1;
}

// A directory's observations and roster as merged-shape documents, with the
// rostered processes that left no observation charged to the first.
function directoryAsMerged(input) {
  if (input.docs.length === 0 && input.roster.length > 0) {
    throw new Error(`${PROBLEM.UNOBSERVED_DIRECTORY}${input.source}`);
  }
  const docs = arrayMap(input.docs, ({doc, source}) => observationAsMerged(doc, source, true));
  const observed = new Set(arrayMap(input.docs, ({doc}) => processKeyOf(doc)));
  const host = input.docs.length > 0 ?
    stringSplit(input.docs[0].doc.process, KEY_SEPARATOR)[0] : os.hostname();
  const unobserved = arrayMap(arrayFilter(input.roster, (entry) =>
    !observed.has(processKeyOf(entry))), (entry) => ({host, pid: entry.pid,
    threadId: entry.threadId, kind: entry.kind ?? null, entry: entry.entry ?? null}));
  if (docs.length > 0) {
    docs[0].roster = {...docs[0].roster, expected: input.roster.length, unobserved};
  }
  return docs;
}

function asMergedDocs(input) {
  if (input.docs) return directoryAsMerged(input);
  if (input.doc?.schema === MERGED_SCHEMA) return [input.doc];
  return [observationAsMerged(input.doc, input.source, false)];
}

/**
 * Fold observation files, directories of them and merged files into one
 * merged document (deterministic for the same inputs).
 * @param {Array<Object>} inputs readMergeInputs's answer, or `{doc, source}`
 * @return {Object} the merged document; `complete` is false when any process
 *   is unobserved or unrostered or any file was refused
 */
function mergeObservations(inputs) {
  const docs = [];
  for (const input of inputs) docs.push(...asMergedDocs(input));
  assertMergeable(docs);
  const totals = {processes: new Set(), loaded: {}, refused: new Map(), arms: {},
    roster: emptyRoster()};
  for (const doc of docs) foldDocument(totals, doc);
  const sortedArms = sortedObject(totals.arms, (arm) => sortedObject({...arm,
    callers: [...arm.callers].sort()}));
  const roster = {expected: totals.roster.expected,
    unobserved: totals.roster.unobserved.sort(compareEntries),
    unrostered: totals.roster.unrostered.sort()};
  const refused = arrayMap([...totals.refused.keys()].sort(), (key) => totals.refused.get(key));
  return {
    schema: MERGED_SCHEMA, plan: docs[0].plan, head: docs[0].head, mode: docs[0].mode,
    selection: docs[0].selection, armed: docs[0].armed,
    complete: roster.unobserved.length === 0 && roster.unrostered.length === 0 &&
      refused.length === 0,
    summary: {processes: totals.processes.size, ...mergedSummary(sortedArms)},
    processes: [...totals.processes].sort(), roster, loaded: sortedObject(totals.loaded),
    refused, arms: sortedArms,
  };
}

function isObservationName(name) {
  return stringStartsWith(name, OBSERVATION_PREFIX) && stringEndsWith(name, OBSERVATION_SUFFIX);
}

function readJson(file) {
  return jsonParse(fs.readFileSync(file, TEXT_ENCODING));
}

function readDirectory(directory) {
  const names = fs.readdirSync(directory).sort();
  const docs = arrayMap(arrayFilter(names, isObservationName), (name) =>
    ({doc: readJson(path.join(directory, name)), source: path.join(directory, name)}));
  const roster = [];
  for (const name of names) {
    if (!stringStartsWith(name, ROSTER_MARKER.PREFIX) || !regexpExec(ROSTER_FILE, name)) continue;
    roster.push(readJson(path.join(directory, name)));
  }
  return {source: directory, docs, roster};
}

/**
 * Read merge inputs: a directory as its observations plus its roster, a file
 * as one document.
 * @param {string[]} paths directories or files
 * @return {Array<Object>} the inputs
 */
function readMergeInputs(paths) {
  return arrayMap(paths, (given) => fs.statSync(given).isDirectory() ? readDirectory(given) :
    {doc: readJson(given), source: given});
}

/**
 * The planned arm ids a selection arms, sorted (the throw run's dry run).
 * @param {Object} plan a trap plan
 * @param {string} spec a selection
 * @return {string[]} the armed arm ids
 */
function selectArms(plan, spec) {
  return selectedArmIds(plan, parseSelection(spec));
}

/**
 * The test files a lane's output names as failed.
 * @param {string[]} texts the lane's logs (runner output, result records)
 * @return {string[]} the failed test files, sorted
 */
function failedTestsOf(texts) {
  const failed = new Set();
  for (const text of texts) {
    for (const raw of stringSplit(String(text), LINE_SEPARATOR)) {
      const line = stringTrim(raw);
      const match = regexpExec(FAILED_TEST_LINE, line);
      if (match) failed.add(match[1]);
      if (!stringStartsWith(line, RECORD_OPEN)) continue;
      try {
        const record = jsonParse(line);
        if (record?.ok === false && typeof record.file === 'string') failed.add(record.file);
      } catch (_error) {
        // Not a result record: only `not ok` lines name a failure here.
        continue;
      }
    }
  }
  return [...failed].sort();
}

function classifyPlanned(plan, merged) {
  const sets = {hit: [], notReached: [], notLoaded: []};
  for (const arm of armRecords(plan).values()) {
    const hit = merged.arms[arm.id];
    if (hit && hit.count > 0) sets.hit.push(arm.id);
    else if ((merged.loaded[arm.file] ?? 0) > 0) sets.notReached.push(arm.id);
    else sets.notLoaded.push(arm.id);
  }
  for (const key of objectKeys(sets)) sets[key].sort();
  return sets;
}

function classifyThrown(armed, merged, run, logText) {
  const sets = {surfaced: [], swallowed: [], thrownUnbound: []};
  for (const id of armed) {
    const hit = merged.arms[id];
    if (!hit || hit.thrown === 0) continue;
    if (!run) {
      sets.thrownUnbound.push(id);
      continue;
    }
    const surfaced = run.laneExitCode !== 0 &&
      (hit.surfaced > 0 || stringIncludes(logText, id));
    (surfaced ? sets.surfaced : sets.swallowed).push(id);
  }
  return sets;
}

function verdictOf(merged, run, thrown) {
  if (!merged.complete) return VERDICT.INCOMPLETE;
  if (merged.mode !== TRAP_MODE.THROW) return VERDICT.COMPLETE;
  if (!run) return VERDICT.UNBOUND;
  if (thrown.swallowed.length > 0) return VERDICT.SWALLOWED;
  return thrown.surfaced.length > 0 ? VERDICT.SURFACED : VERDICT.NOT_REACHED;
}

/**
 * Classify every planned arm of a merged run and, for a throw run with its
 * lane outcome, every armed arm that threw.
 * @param {Object} options `{plan, planDigest, merged, run, laneLogs}`: run
 *   `{id, lane, laneExitCode}` or null; laneLogs the lane's output texts
 * @return {Object} the report (REPORT_SCHEMA)
 */
function reportRun({plan, planDigest, merged, run = null, laneLogs = []}) {
  if (merged.plan !== planDigest) throw new Error(`${PROBLEM.OTHER_PLAN}${planDigest}`);
  const armed = merged.mode === TRAP_MODE.THROW ?
    selectedArmIds(plan, parseSelection(merged.selection)) : [];
  const logText = laneLogs.join(LINE_SEPARATOR);
  const planned = classifyPlanned(plan, merged);
  const thrown = classifyThrown(armed, merged, run, logText);
  const boundRun = run ? {...run, failedTests: failedTestsOf(laneLogs),
    laneLogDigest: createHash(DIGEST_ALGORITHM).update(logText).digest(DIGEST_ENCODING)} : null;
  return {
    schema: REPORT_SCHEMA, plan: merged.plan, head: merged.head, mode: merged.mode,
    selection: merged.selection, run: boundRun, verdict: verdictOf(merged, run, thrown),
    incomplete: {unobserved: merged.roster.unobserved, unrostered: merged.roster.unrostered,
      refused: merged.refused},
    counts: {planned: planned.hit.length + planned.notReached.length + planned.notLoaded.length,
      hit: planned.hit.length, notReached: planned.notReached.length,
      notLoaded: planned.notLoaded.length, armed: armed.length,
      surfaced: thrown.surfaced.length, swallowed: thrown.swallowed.length},
    armed, surfaced: thrown.surfaced, swallowed: thrown.swallowed,
    thrownUnbound: thrown.thrownUnbound, ...planned,
  };
}

function isPassingVerdict(verdict) {
  return PASSING_VERDICTS.has(verdict);
}

export {
  MERGED_SCHEMA,
  REPORT_SCHEMA,
  VERDICT,
  failedTestsOf,
  isPassingVerdict,
  mergeObservations,
  readMergeInputs,
  reportRun,
  selectArms,
};
