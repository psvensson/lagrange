// Short-lived authorization for Solver-owned checkpoint and landing commits.
//
// While this worktree holds a Quest lease, an ordinary source-changing commit
// would split the active source epoch behind Solver's back. The pre-commit hook
// calls `check`; only handoff.js issues an authorization, after staging the
// exact Quest pathspec. The authorization is bound to worktree, Quest, exact
// would-be commit tree, mode, and a short expiry, then removed after the commit
// invocation.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {requiresSourceVerification} from './change-artifact.js';
import {
  currentWorktree,
  sessionKeyForWorktree,
  sessionsDir,
} from './session-registry.js';

const AUTHORIZATION_SUBDIRECTORY = 'commit-authorizations';
const AUTHORIZATION_TTL_MS = 60_000;
const SCHEMA_VERSION = 1;
const TEXT_ENCODING = 'utf8';
const AUTHORIZED_OUTPUT = 'solver-authorized';
const NOT_REQUIRED_OUTPUT = 'not-required';
const VALID_MODES = new Set(['checkpoint', 'land']);
const GIT_COMMAND = 'git';
const LINE_SEPARATOR = '\n';
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const GIT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
const CHECK_VERB = 'check';
const FILE_NOT_FOUND_CODE = 'ENOENT';
const AUTHORIZATION_PATHS_FIELD = 'paths';
const QUEST_ID_REQUIRED_PROBLEM =
  'commit authorization requires a Quest id';
const MODE_REQUIRED_PROBLEM =
  'commit authorization mode must be checkpoint|land';
const AUTHORIZATION_REQUIRED_PROBLEM =
  'active Quest source commits require Solver checkpoint or land authorization';
const USAGE = 'usage: commit-authorization.js check\n';
const PATH_SEPARATOR = ', ';
const UNAVAILABLE_PATHSPEC = 'commit pathspec unavailable';
const GIT_STAGED_PATH_ARGUMENTS = Object.freeze([
  'diff', '--cached', '--name-only',
]);
const GIT_WORKING_PATH_ARGUMENTS = Object.freeze([
  'diff', '--name-only', 'HEAD',
]);
const GIT_DIFF_ARGUMENTS = Object.freeze([
  'diff', 'HEAD', '--binary', '--full-index', '--no-ext-diff',
]);
const GIT_STAGED_DIFF_ARGUMENTS = Object.freeze([
  'diff', '--cached', '--binary', '--full-index', '--no-ext-diff',
]);
const GIT_WRITE_TREE_ARGUMENTS = Object.freeze(['write-tree']);
const GIT_READ_HEAD_ARGUMENTS = Object.freeze(['read-tree', 'HEAD']);
const GIT_ADD_PATHS_PREFIX = Object.freeze(['add', '--all', '--']);
const SESSION_FILE_EXTENSION = '.json';
const TEMPORARY_INDEX_PREFIX = 'lagrange-solver-index-';
const GIT_INDEX_ENVIRONMENT = 'GIT_INDEX_FILE';
const REQUIRED_AUTHORIZATION_FIELDS = Object.freeze([
  'schemaVersion',
  'questId',
  'mode',
  'worktree',
  'paths',
  'indexFingerprint',
  'indexTree',
  'worktreeFingerprint',
  'expiresAt',
]);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayIsArray = Array.isArray;
const arrayPush = Function.call.bind(Array.prototype.push);
const arraySort = Function.call.bind(Array.prototype.sort);
const DateConstructor = Date;
const dateNow = Date.now.bind(Date);
const dateParse = Function.call.bind(Date.parse, Date);
const dateToISOString = Function.call.bind(Date.prototype.toISOString);
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const objectCreate = Object.create;
const objectHasOwn = Function.call.bind(Object.prototype.hasOwnProperty);
const setHas = Function.call.bind(Set.prototype.has);
const stringSplit = Function.call.bind(String.prototype.split);
const stringTrim = Function.call.bind(String.prototype.trim);

function authorizationFile(root, worktree = currentWorktree(root)) {
  return path.join(
    sessionsDir(root),
    AUTHORIZATION_SUBDIRECTORY,
    `${sessionKeyForWorktree(worktree)}.json`,
  );
}

function gitOutput(root, args) {
  return stringTrim(execFileSync(GIT_COMMAND, args, {
    cwd: root,
    encoding: TEXT_ENCODING,
    maxBuffer: GIT_MAX_BUFFER_BYTES,
  }));
}

function stagedPaths(root) {
  return arrayFilter(
    stringSplit(gitOutput(root, GIT_STAGED_PATH_ARGUMENTS), LINE_SEPARATOR),
    (filePath) => filePath !== '',
  );
}

function workingPaths(root) {
  return arrayFilter(
    stringSplit(gitOutput(root, GIT_WORKING_PATH_ARGUMENTS), LINE_SEPARATOR),
    (filePath) => filePath !== '',
  );
}

function uniqueSortedPaths(...pathGroups) {
  const seen = objectCreate(null);
  const unique = [];
  for (let groupIndex = 0; groupIndex < pathGroups.length; groupIndex += 1) {
    const group = pathGroups[groupIndex] || [];
    for (let pathIndex = 0; pathIndex < group.length; pathIndex += 1) {
      const filePath = group[pathIndex];
      if (objectHasOwn(seen, filePath)) continue;
      seen[filePath] = true;
      arrayPush(unique, filePath);
    }
  }
  return arraySort(unique);
}

function commitFingerprint(root, paths) {
  const content = execFileSync(
    GIT_COMMAND,
    [...GIT_DIFF_ARGUMENTS, '--', ...paths],
    {cwd: root, maxBuffer: GIT_MAX_BUFFER_BYTES},
  );
  return crypto.createHash(HASH_ALGORITHM)
    .update(content).digest(HASH_ENCODING);
}

function stagedFingerprint(root, paths) {
  const content = execFileSync(
    GIT_COMMAND,
    [...GIT_STAGED_DIFF_ARGUMENTS, '--', ...paths],
    {cwd: root, maxBuffer: GIT_MAX_BUFFER_BYTES},
  );
  return crypto.createHash(HASH_ALGORITHM)
    .update(content).digest(HASH_ENCODING);
}

function stagedIndexTree(root) {
  return gitOutput(root, GIT_WRITE_TREE_ARGUMENTS);
}

function appendArguments(prefix, values) {
  const result = [];
  for (let index = 0; index < prefix.length; index += 1) {
    arrayPush(result, prefix[index]);
  }
  for (let index = 0; index < values.length; index += 1) {
    arrayPush(result, values[index]);
  }
  return result;
}

// `git commit --only -- <paths>` presents its hook with a temporary index
// containing HEAD plus exactly those paths. Reproduce that tree at issuance:
// hashing the caller's real index would either authorize staged hitchhikers or
// reject a legitimate scope-safe commit that deliberately leaves them alone.
function candidateCommitTree(root, paths) {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), TEMPORARY_INDEX_PREFIX),
  );
  const indexFile = path.join(temporaryDirectory, 'index');
  const environment = {...process.env, [GIT_INDEX_ENVIRONMENT]: indexFile};
  try {
    execFileSync(GIT_COMMAND, GIT_READ_HEAD_ARGUMENTS, {
      cwd: root,
      env: environment,
      maxBuffer: GIT_MAX_BUFFER_BYTES,
    });
    if (paths.length > 0) {
      execFileSync(GIT_COMMAND, appendArguments(GIT_ADD_PATHS_PREFIX, paths), {
        cwd: root,
        env: environment,
        maxBuffer: GIT_MAX_BUFFER_BYTES,
      });
    }
    return stringTrim(execFileSync(GIT_COMMAND, GIT_WRITE_TREE_ARGUMENTS, {
      cwd: root,
      encoding: TEXT_ENCODING,
      env: environment,
      maxBuffer: GIT_MAX_BUFFER_BYTES,
    }));
  } finally {
    fs.rmSync(temporaryDirectory, {recursive: true, force: true});
  }
}

function currentSession(root, worktree) {
  const file = path.join(
    sessionsDir(root),
    `${sessionKeyForWorktree(worktree)}${SESSION_FILE_EXTENSION}`,
  );
  const session = readAuthorization(file);
  return session?.worktree === worktree &&
    typeof session.questId === 'string' && session.questId !== '' ?
    session : null;
}

function readAuthorization(file) {
  try {
    return jsonParse(fs.readFileSync(file, TEXT_ENCODING));
  } catch {
    return null;
  }
}

function claimAuthorization(file) {
  const claimFile = `${file}.${process.pid}.${crypto.randomUUID()}.claim`;
  try {
    fs.renameSync(file, claimFile);
  } catch (error) {
    if (error?.code === FILE_NOT_FOUND_CODE) return null;
    throw error;
  }
  return {file: claimFile, authorization: readAuthorization(claimFile)};
}

function authorizationPaths(authorization) {
  return objectHasOwn(authorization || {}, AUTHORIZATION_PATHS_FIELD) &&
    arrayIsArray(authorization.paths) ? authorization.paths : [];
}

function hasRequiredAuthorizationFields(authorization) {
  if (!authorization || typeof authorization !== 'object') return false;
  for (let index = 0; index < REQUIRED_AUTHORIZATION_FIELDS.length; index += 1) {
    if (!objectHasOwn(authorization, REQUIRED_AUTHORIZATION_FIELDS[index])) {
      return false;
    }
  }
  return true;
}

function allSourcePathsAuthorized(sourcePaths, authorizedPaths) {
  for (let index = 0; index < sourcePaths.length; index += 1) {
    if (!arrayIncludes(authorizedPaths, sourcePaths[index])) return false;
  }
  return true;
}

function authorizationMatches(
  root,
  {authorization, session, worktree, sourcePaths, authorizedPaths},
) {
  return hasRequiredAuthorizationFields(authorization) &&
    authorization.schemaVersion === SCHEMA_VERSION &&
    authorization.questId === session.questId &&
    authorization.worktree === worktree &&
    setHas(VALID_MODES, authorization.mode) &&
    allSourcePathsAuthorized(sourcePaths, authorizedPaths) &&
    authorization.indexFingerprint === stagedFingerprint(root, authorizedPaths) &&
    authorization.indexTree === stagedIndexTree(root) &&
    authorization.worktreeFingerprint === commitFingerprint(root, authorizedPaths) &&
    dateParse(authorization.expiresAt || '') >= dateNow();
}

export function issueCommitAuthorization(root, {questId, mode, paths = null}) {
  if (!questId) throw new Error(QUEST_ID_REQUIRED_PROBLEM);
  if (!setHas(VALID_MODES, mode)) {
    throw new Error(MODE_REQUIRED_PROBLEM);
  }
  const worktree = currentWorktree(root);
  const file = authorizationFile(root, worktree);
  const authorizedPaths = paths ? uniqueSortedPaths(paths) :
    uniqueSortedPaths(stagedPaths(root), workingPaths(root));
  const issuedAtMs = dateNow();
  const authorization = {
    schemaVersion: SCHEMA_VERSION,
    nonce: crypto.randomUUID(),
    questId,
    mode,
    worktree,
    paths: authorizedPaths,
    indexFingerprint: stagedFingerprint(root, authorizedPaths),
    indexTree: candidateCommitTree(root, authorizedPaths),
    worktreeFingerprint: commitFingerprint(root, authorizedPaths),
    issuedAt: dateToISOString(new DateConstructor(issuedAtMs)),
    expiresAt: dateToISOString(
      new DateConstructor(issuedAtMs + AUTHORIZATION_TTL_MS),
    ),
  };
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${jsonStringify(authorization)}\n`);
  return {file, authorization};
}

export function clearCommitAuthorization(root) {
  fs.rmSync(authorizationFile(root), {force: true});
}

export function checkCommitAuthorization(root) {
  const worktree = currentWorktree(root);
  const session = currentSession(root, worktree);
  const sourcePaths = arrayFilter(
    uniqueSortedPaths(stagedPaths(root)),
    requiresSourceVerification,
  );
  if (!session?.questId || sourcePaths.length === 0) {
    return {required: false, authorized: true, output: NOT_REQUIRED_OUTPUT};
  }
  const claim = claimAuthorization(authorizationFile(root, worktree));
  const authorization = claim?.authorization;
  const authorizedPaths = authorizationPaths(authorization);
  let authorized = false;
  try {
    authorized = authorizationMatches(root, {
      authorization,
      session,
      worktree,
      sourcePaths,
      authorizedPaths,
    });
  } finally {
    if (claim) fs.rmSync(claim.file, {force: true});
  }
  return {
    required: true,
    authorized,
    output: authorized ? AUTHORIZED_OUTPUT : null,
    questId: session.questId,
    sourcePaths,
    reason: authorized ? null :
      AUTHORIZATION_REQUIRED_PROBLEM,
  };
}

function main() {
  if (process.argv[2] !== CHECK_VERB) {
    process.stderr.write(USAGE);
    process.exitCode = 2;
    return;
  }
  try {
    const result = checkCommitAuthorization(process.cwd());
    if (!result.authorized) {
      process.stderr.write(
        `pre-commit: ${result.reason} (${result.questId}; ` +
        `${result.sourcePaths.join(PATH_SEPARATOR) || UNAVAILABLE_PATHSPEC})\n`,
      );
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`${result.output}\n`);
  } catch (error) {
    process.stderr.write(
      `pre-commit: commit authorization check failed closed: ${error.message}\n`,
    );
    process.exitCode = 1;
  }
}

const IS_MAIN = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) main();
