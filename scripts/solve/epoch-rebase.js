// rebase-epoch — record a source-epoch boundary instead of resealing.
//
// A source epoch is anchored at the base of its first uncheckpointed attempt;
// when main lands commits that touch the epoch's reviewed paths, every later
// attempt is refused as drift and, before this verb, the only way forward
// was to park the quest and author a successor (2026-09-05: v2 -> v3 cost
// a reseal, a second scope override, three out-of-bar slugs re-recorded and
// the amendment budget reset). A literal re-pin is impossible — attempt
// artifacts are fingerprinted at their base and would not reproduce — so
// this verb records the boundary: the retired epoch's attempts stay visible
// but never count as verification, a covering attempt at the new base is
// demanded over every path the retired epoch reviewed, and a standing
// rejection transfers to the live-base coverage rule exactly as a dead base
// does. The verb never runs git write operations: the operator rebases or
// merges first, then records the boundary at HEAD.

import {spawnSync} from 'node:child_process';

import {EVENT_EPOCH_REBASED} from './constants.js';
import {loadPending} from './pending-step.js';
import {appendEvent, loadQuest, projectState, readLog} from './store.js';
import {
  activeSourceEpoch,
  sourceChangingAttempts,
  sourceEpochCommittedDriftPaths,
} from './verification.js';

const GIT_BINARY = 'git';
const TEXT_ENCODING = 'utf8';
const REMOTE_MAIN_REF = 'refs/remotes/origin/main';
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const LINE_SEPARATOR = '\n';
const ID_REQUIRED = 'rebase-epoch: --id <questId> is required';
const TO_REQUIRED = 'rebase-epoch: --to <commit> is required';
const REASON_REQUIRED = 'rebase-epoch: --reason "<why>" is required';
const PENDING_PROBLEM =
  'rebase-epoch: a step is pending; commit or abort it first';
const LANDED_PROBLEM =
  'rebase-epoch: the quest is exhausted or already landed; author a ' +
  'successor instead of moving a finished epoch';
const STATUS_EXHAUSTED = 'exhausted';
const LOG_SUBJECT_FORMAT = '--format=%s';
const LANDING_SUBJECT_SEPARATOR = ': ';
const NOT_HEAD_PROBLEM =
  'rebase-epoch: --to must be the current HEAD (rebase or merge first, ' +
  'then record the boundary): HEAD is ';
const REMOTE_MISSING_PROBLEM =
  `rebase-epoch: ${REMOTE_MAIN_REF} is not recorded; fetch origin first`;
const NOT_ON_MAIN_PROBLEM =
  `rebase-epoch: --to is not an ancestor of ${REMOTE_MAIN_REF}; only a base ` +
  'that main already contains can retire an epoch';
const NO_EPOCH_PROBLEM =
  'rebase-epoch: no active source epoch to rebase (no uncheckpointed ' +
  'source attempt)';
const NOTHING_TO_REBASE_PROBLEM =
  'rebase-epoch: nothing to rebase — HEAD is the epoch base';
const REBASED_PREFIX = 'rebased epoch of ';
const REBASED_ARROW = ' -> ';
const REBASED_INTERVENING_SUFFIX = ' intervening commit(s), ';
const REBASED_RETIRED_SUFFIX = ' attempt(s) retired) at ';
const REBASED_OBLIGATION_INFIX = '; a covering attempt at ';
const REBASED_OBLIGATION_SUFFIX = ' path(s) is now required';
const REBASED_OVER = ' over ';

function git(root, args) {
  return spawnSync(GIT_BINARY, args, {cwd: root, encoding: TEXT_ENCODING});
}

function resolveCommit(root, ref) {
  const result = git(root, ['rev-parse', '--verify', `${ref}^{commit}`]);
  const value = String(result.stdout || '').trim();
  return result.status === 0 && COMMIT_PATTERN.test(value) ? value : null;
}

// A landed quest has its landing commit in history (subject
// `<questId>: ...`, the shape solve land and handoff --commit write); its
// epoch is finished, never rebased.
function questLanded(root, questId) {
  const result = git(root, ['log', LOG_SUBJECT_FORMAT]);
  if (result.status !== 0) return false;
  const prefix = `${questId}${LANDING_SUBJECT_SEPARATOR}`;
  return String(result.stdout || '').split(LINE_SEPARATOR)
    .some((subject) => subject.startsWith(prefix));
}

function requireArgument(value, problem) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new Error(problem);
  return text;
}

export function runRebaseEpochCommand(root, args = {}) {
  const id = requireArgument(args.id || args._?.[0], ID_REQUIRED);
  const toRef = requireArgument(args.to, TO_REQUIRED);
  const reason = requireArgument(args.reason, REASON_REQUIRED);
  const quest = loadQuest(root, id);
  if (loadPending(root, id)) throw new Error(PENDING_PROBLEM);
  const log = readLog(root, id);
  const status = projectState(quest, log).questStatus;
  if (status === STATUS_EXHAUSTED || questLanded(root, id)) {
    throw new Error(LANDED_PROBLEM);
  }
  const head = resolveCommit(root, 'HEAD');
  const toBase = resolveCommit(root, toRef);
  if (!head || toBase !== head) throw new Error(`${NOT_HEAD_PROBLEM}${head}`);
  const remoteMain = resolveCommit(root, REMOTE_MAIN_REF);
  if (!remoteMain) throw new Error(REMOTE_MISSING_PROBLEM);
  const ancestry = git(root, ['merge-base', '--is-ancestor', toBase, remoteMain]);
  if (ancestry.status !== 0) throw new Error(NOT_ON_MAIN_PROBLEM);
  const epoch = activeSourceEpoch(root, quest, log);
  if (!epoch?.baseCommit) throw new Error(NO_EPOCH_PROBLEM);
  const range = git(root, ['rev-list', `${epoch.baseCommit}..${toBase}`]);
  const interveningCommits = String(range.stdout || '')
    .split(LINE_SEPARATOR).filter((line) => COMMIT_PATTERN.test(line));
  if (range.status !== 0 || interveningCommits.length === 0) {
    throw new Error(NOTHING_TO_REBASE_PROBLEM);
  }
  const retiredAttemptIndexes = sourceChangingAttempts(root, quest, log)
    .filter((attempt) => attempt.retired !== true)
    .map((attempt) => attempt.index);
  const stamped = appendEvent(root, id, {
    type: EVENT_EPOCH_REBASED,
    fromBase: epoch.baseCommit,
    toBase,
    remoteMain,
    interveningCommits,
    driftPaths: sourceEpochCommittedDriftPaths(root, epoch),
    retiredPaths: epoch.paths,
    retiredAttemptIndexes,
    reason,
  });
  return `${REBASED_PREFIX}${id}: ${epoch.baseCommit}${REBASED_ARROW}${toBase} ` +
    `(${interveningCommits.length}${REBASED_INTERVENING_SUFFIX}` +
    `${retiredAttemptIndexes.length}${REBASED_RETIRED_SUFFIX}${stamped.ts}` +
    `${REBASED_OBLIGATION_INFIX}${toBase}${REBASED_OVER}${epoch.paths.length}` +
    REBASED_OBLIGATION_SUFFIX;
}
