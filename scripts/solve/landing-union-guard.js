// Landing union guard — the landing owner's source-coverage rule.
//
// A Quest landing may commit only source bytes that a RECORDED attempt covers.
// Before this guard the terminal `land` derived its scope-safe pathspec from
// every change artifact ON DISK under the Quest's change directory and judged
// "no source changes, no verifier needed" from the recorded attempt list
// alone. On 2026-08-30 (learner-promotion-proof-channel-wake) a diff artifact
// whose `solve attempt` had been refused by the scope-pressure guard
// (gate-decision blocked-scope, no attempt event) named 19 staged source
// paths that no attempt covered; the quest projected SOLVED on an already
// green receipt, and `land` swept the staged source into commit ce0e4942d
// with verdict not-required and no verifier approval.
//
// The rule this module owns, evaluated by `land` before any branch and by
// the terminal audit so `next` shows it:
//   - the recorded attempt union is the set of paths named by the change
//     artifacts of recorded attempt events — never by artifacts on disk;
//   - the working source delta is every path outside solve/ that differs
//     from HEAD in the index or working tree (staged, modified,
//     intent-to-add). Untracked files are not in the index and never enter
//     a scope-safe commit, so they are not part of the delta;
//   - any delta path absent from the union is a typed BLOCKED landing
//     problem naming the paths: no commit, no verdict, no automatic attempt.
// A refused attempt record needs no special case: its paths are simply
// uncovered until an attempt is honestly recorded and independently verified.
// An evidence-only landing (empty delta) is unaffected.

import {spawnSync} from 'node:child_process';

import {
  EVENT_ATTEMPT,
  LANDING_UNCOVERED_SOURCE_PATHS_CODE,
  LANDING_UNION_STATUS,
  SOLVE_DATA_DIR,
} from './constants.js';
import {inspectChangeArtifact} from './change-artifact.js';

export {LANDING_UNCOVERED_SOURCE_PATHS_CODE, LANDING_UNION_STATUS};
const GIT_BINARY = 'git';
const GIT_INSIDE_WORK_TREE_ARGUMENTS =
  Object.freeze(['rev-parse', '--is-inside-work-tree']);
const GIT_INSIDE_WORK_TREE = 'true';
const GIT_HEAD_COMMIT_ARGUMENTS =
  Object.freeze(['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']);
const GIT_STATUS_ARGUMENTS = Object.freeze(['status', '--porcelain', '-uall']);
const HEAD_UNRESOLVED_PROBLEM_PREFIX =
  'land: landing union guard could not resolve HEAD inside the work tree: ';
const STATUS_FAILED_PROBLEM_PREFIX =
  'land: landing union guard could not inspect Git status: ';
const GIT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
const TEXT_ENCODING = 'utf8';
const LINE_SEPARATOR = '\n';
// Porcelain v1: `XY <path>` (or `XY <orig> -> <path>` for renames).
const PORCELAIN_STATUS_LENGTH = 2;
const PORCELAIN_PATH_OFFSET = 3;
const PORCELAIN_RENAME_ARROW = ' -> ';
const PORCELAIN_UNTRACKED = '??';
const PORCELAIN_IGNORED = '!!';
const SOLVE_PATH_PREFIX = `${SOLVE_DATA_DIR}/`;
const PATH_LIST_SEPARATOR = ', ';
const UNCOVERED_PROBLEM_PREFIX =
  `land: blocked (${LANDING_UNCOVERED_SOURCE_PATHS_CODE}): `;
const UNCOVERED_PROBLEM_DETAIL =
  ' path(s) outside solve/ differ from HEAD in the index or working tree ' +
  'but no recorded attempt covers them: ';
const UNCOVERED_PROBLEM_ACTION =
  '; record an attempt covering these paths (or restore them to HEAD) and ' +
  'obtain its independent verification before landing — a green doneWhen ' +
  'receipt never authorizes a source landing';
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayPush = Function.call.bind(Array.prototype.push);
const arraySort = Function.call.bind(Array.prototype.sort);
const setAdd = Function.call.bind(Set.prototype.add);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);

function sortedUnique(values) {
  const seen = new Set();
  for (let index = 0; index < values.length; index += 1) {
    setAdd(seen, values[index]);
  }
  return arraySort([...seen]);
}

function porcelainEntryPath(line) {
  const rest = stringSlice(line, PORCELAIN_PATH_OFFSET);
  const arrow = rest.indexOf(PORCELAIN_RENAME_ARROW);
  return arrow === -1 ? rest :
    stringSlice(rest, arrow + PORCELAIN_RENAME_ARROW.length);
}

function gitQuery(root, gitArguments) {
  return spawnSync(GIT_BINARY, [...gitArguments], {
    cwd: root,
    encoding: TEXT_ENCODING,
    maxBuffer: GIT_MAX_BUFFER_BYTES,
  });
}

function gitFailureDetail(result) {
  return stringTrim(String(result.stderr || result.error?.message || ''));
}

// Every path outside solve/ whose index or working-tree bytes differ from
// HEAD. A root outside a Git work tree has no delta a landing could sweep
// (autoCommitQuest never commits there), which is the covered variant. Inside
// a work tree the guard fails loudly when HEAD does not resolve or status
// cannot run: a corrupt repository reads as "everything is new", and a
// misleading uncovered-path block must never mask that genuine Git failure.
export function workingSourceDelta(root) {
  const inside = gitQuery(root, GIT_INSIDE_WORK_TREE_ARGUMENTS);
  if (inside.status !== 0 ||
    stringTrim(String(inside.stdout || '')) !== GIT_INSIDE_WORK_TREE) {
    return {inWorkTree: false, paths: []};
  }
  const head = gitQuery(root, GIT_HEAD_COMMIT_ARGUMENTS);
  if (head.status !== 0) {
    throw new Error(HEAD_UNRESOLVED_PROBLEM_PREFIX + gitFailureDetail(head));
  }
  const result = gitQuery(root, GIT_STATUS_ARGUMENTS);
  if (result.status !== 0) {
    throw new Error(STATUS_FAILED_PROBLEM_PREFIX + gitFailureDetail(result));
  }
  const paths = [];
  const lines = String(result.stdout || '').split(LINE_SEPARATOR);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!stringTrim(line)) continue;
    const status = stringSlice(line, 0, PORCELAIN_STATUS_LENGTH);
    if (status === PORCELAIN_UNTRACKED || status === PORCELAIN_IGNORED) continue;
    const filePath = porcelainEntryPath(line);
    if (stringStartsWith(filePath, SOLVE_PATH_PREFIX)) continue;
    arrayPush(paths, filePath);
  }
  return {inWorkTree: true, paths: sortedUnique(paths)};
}

// Paths and content-addressed objects named by the change artifacts of the
// Quest's RECORDED attempt events. An artifact on disk that no attempt event
// references (for example one whose `solve attempt` the scope guard refused)
// contributes nothing: scope is recorded history, never the dirty tree.
export function recordedAttemptScope(root, quest, log) {
  const referenced = [];
  const contentObjects = [];
  for (let index = 0; index < log.length; index += 1) {
    const event = log[index];
    if (event.type !== EVENT_ATTEMPT || !event.changeRef) continue;
    const inspection = inspectChangeArtifact(root, quest, event.changeRef);
    if (inspection.contentObjectPath) {
      arrayPush(contentObjects, inspection.contentObjectPath);
    }
    const changedPaths = inspection.changedPaths || [];
    for (let pathIndex = 0; pathIndex < changedPaths.length; pathIndex += 1) {
      arrayPush(referenced, changedPaths[pathIndex]);
    }
  }
  return {
    diffReferenced: sortedUnique(referenced),
    contentObjects: sortedUnique(contentObjects),
  };
}

export function recordedAttemptUnion(root, quest, log) {
  return recordedAttemptScope(root, quest, log).diffReferenced;
}

function uncoveredProblemMessage(uncoveredPaths) {
  return UNCOVERED_PROBLEM_PREFIX + uncoveredPaths.length +
    UNCOVERED_PROBLEM_DETAIL +
    arrayJoin(uncoveredPaths, PATH_LIST_SEPARATOR) +
    UNCOVERED_PROBLEM_ACTION;
}

export function landingUnionGuard(root, quest, log) {
  const union = recordedAttemptUnion(root, quest, log);
  const delta = workingSourceDelta(root);
  const uncoveredPaths = arrayFilter(delta.paths,
    (filePath) => !arrayIncludes(union, filePath));
  if (uncoveredPaths.length === 0) {
    return {
      status: LANDING_UNION_STATUS.COVERED,
      union,
      delta: delta.paths,
      uncoveredPaths,
    };
  }
  return {
    status: LANDING_UNION_STATUS.UNCOVERED,
    code: LANDING_UNCOVERED_SOURCE_PATHS_CODE,
    message: uncoveredProblemMessage(uncoveredPaths),
    union,
    delta: delta.paths,
    uncoveredPaths,
  };
}

// Audit-channel projection of the guard: zero problems when covered, one
// typed problem (code + requiredPaths) when uncovered, so the terminal audit,
// commit gate, terminal readiness, and `next` all report the same block.
export function landingUnionGuardProblems(root, quest, log) {
  const guard = landingUnionGuard(root, quest, log);
  if (guard.status !== LANDING_UNION_STATUS.UNCOVERED) return [];
  return [{
    message: guard.message,
    ts: null,
    frontier: null,
    code: guard.code,
    requiredPaths: guard.uncoveredPaths,
  }];
}

export function landingUnionGuardError(guard) {
  const error = new Error(guard.message);
  error.code = guard.code;
  error.uncoveredPaths = guard.uncoveredPaths;
  return error;
}
