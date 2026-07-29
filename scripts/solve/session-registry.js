// Cross-worktree session registry with quest leases.
//
// Parallel sessions coordinate through one shared location: the git COMMON
// dir, which every worktree of a repository resolves to the same path
// (solve/state/ is gitignored, and gitignored means per-worktree — invisible
// to exactly the sessions it should coordinate). Each live session is one
// JSON file naming its worktree, branch, claimed quest, and declared scope.
//
// The lease rule this exists to enforce: ONE live session per quest id.
// Nothing else stops two sessions opening the same quest in two worktrees
// and forking its append-only solve/log/<id>.ndjson, whose divergent-history
// merge is undefined (parallel-session-architecture epic, item 3).
//
// Liveness is worktree-based, not pid-based: solver commands are short-lived
// processes, so a session is live while its worktree exists AND its
// heartbeat is fresh. Stale entries are GC'd on every read (tmp worktrees
// vanish on reboot and leave stranded registrations).
//
// CLI:
//   node scripts/solve/session-registry.js claim --quest <id> [--scope p ...]
//   node scripts/solve/session-registry.js release [--quest <id>]
//   node scripts/solve/session-registry.js list
//   node scripts/solve/session-registry.js gc

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const SESSIONS_DIR_SEGMENTS = ['lagrange-sessions', 'sessions'];
const TEXT_ENCODING = 'utf8';
const JSON_EXTENSION = '.json';
const GIT_BINARY = 'git';
const GIT_COMMON_DIR_ARGUMENTS = Object.freeze(
  ['rev-parse', '--git-common-dir']);
const GIT_TOPLEVEL_ARGUMENTS = Object.freeze(
  ['rev-parse', '--show-toplevel']);
const GIT_BRANCH_ARGUMENTS = Object.freeze(
  ['rev-parse', '--abbrev-ref', 'HEAD']);
const SESSION_KEY_HASH = 'sha256';
const SESSION_KEY_LENGTH = 16;
// A worktree that has not run a solve command in a day is not a live
// coordination peer even if its directory survives.
const DEFAULT_HEARTBEAT_TTL_MS = 24 * 60 * 60 * 1000;
const LEASE_BYPASS_ENVIRONMENT_FLAG = 'LAGRANGE_SESSION_LEASE_BYPASS';
// Callers key their fail-closed rethrow on this code, never on message
// prose: a wording edit must not silently flip a refusal into a warning.
const QUEST_LEASE_CONFLICT_CODE = 'QUEST_LEASE_CONFLICT';
export {QUEST_LEASE_CONFLICT_CODE};
const TEMP_FILE_SUFFIX = '.tmp';
const VERB_CLAIM = 'claim';
const VERB_RELEASE = 'release';
const VERB_LIST = 'list';
const VERB_GC = 'gc';
const QUEST_FLAG = '--quest';
const SCOPE_FLAG = '--scope';
const EXIT_USAGE = 2;
const HEX_DIGEST = 'hex';
const UNKNOWN_BRANCH_LABEL = 'unknown';
const PATH_LIST_SEPARATOR = ' ';
const LEASE_REFUSAL_SUFFIX =
  'you are certain the claim is abandoned';
const OVERLAP_NOTICE_PREFIX =
  'session-registry: declared scope overlaps the live session in ';
const USAGE_TEXT =
  'usage: session-registry.js claim --quest <id> [--scope <path> ...] | ' +
  'release [--quest <id>] | list | gc\n';

function gitOutput(cwd, args) {
  return execFileSync(GIT_BINARY, [...args], {cwd, encoding: TEXT_ENCODING})
    .trim();
}

export function sessionsDir(root) {
  const commonDir = path.resolve(
    root, gitOutput(root, GIT_COMMON_DIR_ARGUMENTS));
  return path.join(commonDir, ...SESSIONS_DIR_SEGMENTS);
}

// A session IS a worktree: solver commands are short-lived, so the durable
// identity coordinating peers care about is "which checkout".
export function sessionKeyForWorktree(worktreePath) {
  return crypto.createHash(SESSION_KEY_HASH)
    .update(String(worktreePath))
    .digest(HEX_DIGEST)
    .slice(0, SESSION_KEY_LENGTH);
}

function sessionFilePath(root, worktreePath) {
  return path.join(sessionsDir(root),
    `${sessionKeyForWorktree(worktreePath)}${JSON_EXTENSION}`);
}

function readSessionFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, TEXT_ENCODING));
  } catch {
    return null;
  }
}

export function sessionIsLive(session,
  {now = Date.now(), heartbeatTtlMs = DEFAULT_HEARTBEAT_TTL_MS} = {}) {
  if (!session || typeof session.worktree !== 'string') return false;
  if (!fs.existsSync(session.worktree)) return false;
  const heartbeat = Date.parse(session.heartbeatAt || '');
  if (!Number.isFinite(heartbeat)) return false;
  return now - heartbeat <= heartbeatTtlMs;
}

// All registered sessions; stale ones are deleted as they are discovered so
// every reader doubles as the GC sweep.
export function listSessions(root, options = {}) {
  const dir = sessionsDir(root);
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const live = [];
  for (const name of names) {
    if (!name.endsWith(JSON_EXTENSION)) continue;
    const filePath = path.join(dir, name);
    const session = readSessionFile(filePath);
    if (sessionIsLive(session, options)) {
      live.push(session);
      continue;
    }
    fs.rmSync(filePath, {force: true});
  }
  return live;
}

export function currentWorktree(root) {
  return gitOutput(root, GIT_TOPLEVEL_ARGUMENTS);
}

function currentBranch(root) {
  try {
    return gitOutput(root, GIT_BRANCH_ARGUMENTS);
  } catch {
    return null;
  }
}

// Atomic write: listSessions GC-deletes any unparsable file, so a reader
// racing a plain writeFileSync could prune a mid-write session record
// (silent lease loss). Temp-then-rename makes every visible state parsable.
function writeSessionFile(filePath, session) {
  const tempPath = `${filePath}${TEMP_FILE_SUFFIX}-${process.pid}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(session)}\n`);
  fs.renameSync(tempPath, filePath);
}

// Upsert this worktree's registration; refreshes the heartbeat every call.
// Declared scope carries over only while the quest is unchanged — switching
// quests must not bleed the previous quest's scope into the new claim.
export function registerSession(root, {questId = null, scopePaths = []} = {}) {
  const worktree = currentWorktree(root);
  const dir = sessionsDir(root);
  fs.mkdirSync(dir, {recursive: true});
  const existing = readSessionFile(sessionFilePath(root, worktree));
  const nextQuestId = questId ?? existing?.questId ?? null;
  const sameQuest = nextQuestId === (existing?.questId ?? null);
  const session = {
    key: sessionKeyForWorktree(worktree),
    worktree,
    branch: currentBranch(root),
    questId: nextQuestId,
    // The lease-arbitration timestamp: an established holder keeps its
    // original claimedAt across heartbeats, so it always outranks a
    // newcomer; only a genuinely simultaneous claim falls to the key
    // tie-break.
    claimedAt: nextQuestId === null ? null :
      (sameQuest && existing?.claimedAt ?
        existing.claimedAt : new Date().toISOString()),
    scopePaths: scopePaths.length > 0 ?
      [...new Set(scopePaths)].sort() :
      (sameQuest ? existing?.scopePaths || [] : []),
    startedAt: existing?.startedAt || new Date().toISOString(),
    heartbeatAt: new Date().toISOString(),
  };
  writeSessionFile(sessionFilePath(root, worktree), session);
  return session;
}

export function releaseSession(root, {questOnly = false} = {}) {
  const worktree = currentWorktree(root);
  const filePath = sessionFilePath(root, worktree);
  if (!questOnly) {
    fs.rmSync(filePath, {force: true});
    return null;
  }
  const existing = readSessionFile(filePath);
  if (!existing) return null;
  const session = {
    ...existing,
    questId: null,
    scopePaths: [],
    heartbeatAt: new Date().toISOString(),
  };
  writeSessionFile(filePath, session);
  return session;
}

function questLeaseConflictError(questId, holder) {
  const error = new Error(
    `session-registry: quest ${questId} is claimed by the live session ` +
    `in ${holder.worktree} ` +
    `(branch ${holder.branch || UNKNOWN_BRANCH_LABEL}, ` +
    `heartbeat ${holder.heartbeatAt}); release it there, wait for its ` +
    `heartbeat to lapse, or set ${LEASE_BYPASS_ENVIRONMENT_FLAG}=1 if ` +
    LEASE_REFUSAL_SUFFIX);
  error.code = QUEST_LEASE_CONFLICT_CODE;
  return error;
}

// Every live session holding this quest, arbitration order first: earliest
// claimedAt wins (the established holder outranks any newcomer), and only a
// same-instant claim falls to the deterministic key tie-break.
function liveQuestHolders(root, questId, options = {}) {
  return listSessions(root, options)
    .filter((session) => session.questId === questId)
    .sort((left, right) =>
      String(left.claimedAt || left.heartbeatAt)
        .localeCompare(String(right.claimedAt || right.heartbeatAt)) ||
      String(left.key).localeCompare(String(right.key)));
}

// The lease check: which OTHER live session, if any, holds this quest.
export function questLeaseHolder(root, questId, options = {}) {
  const worktree = currentWorktree(root);
  return listSessions(root, options).find((session) =>
    session.questId === questId && session.worktree !== worktree) || null;
}

// Declared-scope overlap against every other live session. Advisory input
// for the operator: overlapping claims are how two sessions end up editing
// one owner module from two worktrees.
export function scopeOverlaps(root, scopePaths, options = {}) {
  const worktree = currentWorktree(root);
  const claimed = new Set(scopePaths || []);
  const overlaps = [];
  for (const session of listSessions(root, options)) {
    if (session.worktree === worktree) continue;
    const shared = (session.scopePaths || [])
      .filter((scopePath) => claimed.has(scopePath));
    if (shared.length > 0) {
      overlaps.push({session, paths: shared});
    }
  }
  return overlaps;
}

// Claim a quest for this worktree. Fail-closed on a live conflicting lease
// unless the bypass environment flag is set (the operator judgment escape,
// mirroring the solver's recorded-reason overrides).
//
// Write-then-verify, no pre-check: the naive check-then-write claim is a
// proven race (measured 2026-07-29: two worktrees claiming simultaneously
// BOTH won, 8/8 rounds). Every claimant writes its claim first and then
// arbitrates against all live holders, so simultaneous racers each see the
// other and exactly one backs off; an established holder keeps its earlier
// claimedAt, so a newcomer always loses to it, and the previous holder of a
// dropped claim re-arbitrates cleanly instead of stalemating on a stale
// record of its own.
export function claimQuest(root, questId, {scopePaths = [], ...options} = {}) {
  const bypass = Boolean(process.env[LEASE_BYPASS_ENVIRONMENT_FLAG]);
  const session = registerSession(root, {questId, scopePaths});
  if (!bypass) {
    const holders = liveQuestHolders(root, questId, options);
    if (holders.length > 1 && holders[0].key !== session.key) {
      releaseSession(root, {questOnly: true});
      throw questLeaseConflictError(questId, holders[0]);
    }
  }
  return {session, overlaps: scopeOverlaps(root, session.scopePaths, options)};
}

function parseCliArguments(argv) {
  const verb = argv[0];
  let questId = null;
  const scopePaths = [];
  for (let index = 1; index < argv.length; index += 1) {
    if (argv[index] === QUEST_FLAG && argv[index + 1]) {
      questId = argv[index + 1];
      index += 1;
      continue;
    }
    if (argv[index] === SCOPE_FLAG && argv[index + 1]) {
      scopePaths.push(argv[index + 1]);
      index += 1;
    }
  }
  return {verb, questId, scopePaths};
}

function main() {
  const root = process.cwd();
  const {verb, questId, scopePaths} = parseCliArguments(process.argv.slice(2));
  if (verb === VERB_LIST) {
    process.stdout.write(`${JSON.stringify(listSessions(root))}\n`);
    return;
  }
  if (verb === VERB_GC) {
    const survivors = listSessions(root);
    process.stdout.write(`${survivors.length} live session(s) after gc\n`);
    return;
  }
  if (verb === VERB_CLAIM && questId) {
    const {session, overlaps} = claimQuest(root, questId, {scopePaths});
    process.stdout.write(`${JSON.stringify(session)}\n`);
    for (const overlap of overlaps) {
      process.stderr.write(OVERLAP_NOTICE_PREFIX +
        `${overlap.session.worktree} on: ` +
        `${overlap.paths.join(PATH_LIST_SEPARATOR)}\n`);
    }
    return;
  }
  if (verb === VERB_RELEASE) {
    releaseSession(root, {questOnly: Boolean(questId)});
    return;
  }
  process.stderr.write(USAGE_TEXT);
  process.exitCode = EXIT_USAGE;
}

const IS_MAIN = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) main();
