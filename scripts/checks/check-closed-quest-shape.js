#!/usr/bin/env node
/**
 * Closed quests hold their minimal terminal proof
 * (`npm run audit:closed-quest-shape`).
 *
 * The original criterion said a closed quest contains exactly `quest.json`
 * and `log.ndjson`. That confused minimal storage shape with reproducible
 * terminal proof: a quest whose sealed `doneWhen` cites a receipt or an
 * oracle cannot delete that file without making its own terminal claim
 * unverifiable. The invariant is therefore:
 *
 *   a closed quest contains exactly its canonical record, its append-only
 *   log, and the proof artifacts its sealed terminal claim requires, and
 *   those artifacts are neither deleted nor modified after closure.
 *
 * Which artifacts a sealed claim requires is derived structurally, by the
 * probe owner, from the sealed `doneWhen`. Nothing is inferred from prose or
 * from a filename, so mentioning `something.json` in a log entry grants it
 * nothing. Retained proof stays counted in the active footprint; this check
 * governs what may exist, not what it costs.
 *
 * Ownership: the store owns quest layout, sealed acceptance owns what proof
 * is required, the probe owner classifies the artifacts, this check enforces
 * the composition, and the size accounting counts them.
 *
 * `--base <ref>` overrides the admitted range, `--metric` prints the number
 * of offending quests and nothing else.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  LOG_FILE, QUESTS_DIR, QUEST_FILE,
} from '../solve/schema.js';
import {
  listQuestIds, questDir, questState, readLog, readQuest,
} from '../solve/store.js';
import {requiredProofArtifacts} from '../solve/probes.js';
import {
  HEAD_REV, admittedEdges, baseFromArgv, changedPathsBetween, publicationBase,
  readBlobs, reportRecordOffences, trackedAt,
} from './quest-record-transitions.js';
import {resolvedCheckBase} from './changed-paths.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PATH_SEPARATOR = '/';
const ARGV_OFFSET = 2;
const WORKING_TREE = 'working tree';
const STATUS_ADDED = 'A';
const STATUS_DELETED = 'D';
const OFFENCE = Object.freeze({
  UNREQUIRED: 'is not required by the sealed terminal claim',
  MISSING: 'is required by the sealed terminal claim and is gone',
  MUTATED: 'is required by the sealed terminal claim and was modified after closure',
});
const CLEAN_MESSAGE = 'closed-quest shape: clean';
const OFFENCE_HEADER = 'closed-quest shape: refusing closed quests that are ' +
  'not their minimal terminal proof';
const REMEDIATION = 'A closed quest holds its record, its log, and exactly ' +
  'the artifacts its sealed doneWhen requires. Remove what the claim does ' +
  'not need; never remove or rewrite what it does.';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFlatMap = Function.call.bind(Array.prototype.flatMap);
const arrayMap = Function.call.bind(Array.prototype.map);
const bufferEquals = Function.call.bind(Buffer.prototype.equals);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

function walk(root, relative) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return [];
  return arrayFlatMap(fs.readdirSync(absolute, {withFileTypes: true}), (entry) => {
    const child = `${relative}${PATH_SEPARATOR}${entry.name}`;
    return entry.isDirectory() ? walk(root, child) : [child];
  });
}

// The paths a quest is allowed to hold once closed: its record, its log, and
// whatever the probe owner derives from the sealed claim that lives inside
// the quest's own directory.
function allowedPaths(root, id) {
  const quest = readQuest(root, id);
  const directory = `${QUESTS_DIR}${PATH_SEPARATOR}${id}`;
  const prefix = `${directory}${PATH_SEPARATOR}`;
  const required = arrayFilter(requiredProofArtifacts(quest.doneWhen),
    (file) => stringStartsWith(file, prefix));
  return {
    directory,
    required,
    allowed: new Set([
      `${prefix}${QUEST_FILE}`, `${prefix}${LOG_FILE}`, ...required,
    ]),
  };
}

function isClosed(root, id) {
  return questState(readLog(root, id)).terminal;
}

// Composition: every file the closed quest holds must be one the sealed
// claim justifies, and every artifact it justifies must still be there.
function compositionOffences(root, id) {
  const {directory, required, allowed} = allowedPaths(root, id);
  const present = walk(root, directory);
  const offences = arrayMap(arrayFilter(present, (file) => !allowed.has(file)),
    (file) => ({quest: id, path: file, reason: OFFENCE.UNREQUIRED, at: WORKING_TREE}));
  for (const file of required) {
    if (!fs.existsSync(path.join(root, file))) {
      offences.push({quest: id, path: file, reason: OFFENCE.MISSING, at: WORKING_TREE});
    }
  }
  return offences;
}

// Immutability: once a quest is closed, a commit may not change an artifact
// its sealed claim requires. Deletion is caught by composition; this catches
// rewriting, which would otherwise leave the terminal claim standing on
// evidence that no longer says what it said.
function mutationOffences(root, edge, closedRequirements) {
  const changed = arrayFilter(changedPathsBetween(root, edge.parent, edge.child),
    (entry) => entry.status !== STATUS_ADDED && closedRequirements.has(entry.path));
  if (changed.length === 0) return [];
  const blobs = readBlobs(root, arrayFlatMap(changed, (entry) => [
    {key: `${edge.parent}:${entry.path}`, rev: `${edge.parent}:${entry.path}`},
    {key: `${edge.child}:${entry.path}`, rev: `${edge.child}:${entry.path}`},
  ]));
  const offences = [];
  for (const entry of changed) {
    const before = blobs.get(`${edge.parent}:${entry.path}`);
    if (!before) continue;
    const after = entry.status === STATUS_DELETED ? null :
      blobs.get(`${edge.child}:${entry.path}`) || null;
    if (after === null || !bufferEquals(after, before)) {
      offences.push({quest: closedRequirements.get(entry.path), path: entry.path,
        reason: after === null ? OFFENCE.MISSING : OFFENCE.MUTATED, at: edge.child});
    }
  }
  return offences;
}

// Every artifact required by a quest that is already closed at `rev`, mapped
// to the quest that requires it.
function closedRequirementsAt(root, rev) {
  const requirements = new Map();
  const questFiles = trackedAt(root, rev, (file) =>
    stringStartsWith(file, `${QUESTS_DIR}${PATH_SEPARATOR}`) &&
    stringEndsWith(file, `${PATH_SEPARATOR}${QUEST_FILE}`));
  for (const file of questFiles) {
    const id = stringSlice(file, `${QUESTS_DIR}${PATH_SEPARATOR}`.length,
      file.length - `${PATH_SEPARATOR}${QUEST_FILE}`.length);
    if (stringIncludes(id, PATH_SEPARATOR) ||
      !fs.existsSync(questDir(root, id))) continue;
    if (!isClosed(root, id)) continue;
    for (const artifact of requiredProofArtifacts(readQuest(root, id).doneWhen)) {
      requirements.set(artifact, id);
    }
  }
  return requirements;
}

/**
 * Every closed quest that is not exactly its minimal terminal proof.
 * @param {{root?: string, base?: string}} [options]
 * @return {Array<{quest: string, path: string, reason: string, at: string}>}
 */
function closedQuestShapeOffences(options = {}) {
  const root = options.root || REPO_ROOT;
  const base = options.base || publicationBase(root);
  const composition = arrayFlatMap(
    arrayFilter(listQuestIds(root), (id) => isClosed(root, id)),
    (id) => compositionOffences(root, id));
  const requirements = closedRequirementsAt(root, HEAD_REV);
  const mutations = requirements.size === 0 ? [] :
    arrayFlatMap(admittedEdges(root, base),
      (edge) => mutationOffences(root, edge, requirements));
  return [...composition, ...mutations];
}

function main(argv) {
  const base = baseFromArgv(argv) || resolvedCheckBase();
  return reportRecordOffences({argv,
    offences: closedQuestShapeOffences(base ? {base} : {}),
    cleanMessage: CLEAN_MESSAGE, header: OFFENCE_HEADER, remediation: REMEDIATION});
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(ARGV_OFFSET));
}

export {OFFENCE, closedQuestShapeOffences};
