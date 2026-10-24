// The one way a repository script or test starts a `git` child process.
//
// Node buffers a child's whole output up to `maxBuffer`, 1 MiB by default,
// and past it kills the child and reports ENOBUFS: `spawnSync` returns a
// null status, `execFileSync` throws a generic error. Git output scales with
// the repository: the tracked-file list of the rs-raft lineage measured
// 1,283,212 bytes on 2026-10-24, so every unbounded `git ls-files` or
// `git diff --name-only` read went red at once, and a spawnSync caller read
// the null status as an ordinary git failure. The executable, the bound and
// the overflow outcome therefore live here and nowhere else: a caller names
// the git arguments and its own options, the bound is always this module's,
// and output past it is the named GitOutputTooLargeError, never a null
// status, a swallowed exception or a truncated read.
//
// Which repository git addresses (no inherited GIT_DIR and friends) is owned
// by git-process-environment.js; a caller that needs that passes
// `env: gitProcessEnvironment()` exactly as before.

import {execFile, execFileSync, spawnSync} from 'node:child_process';

const GIT_EXECUTABLE = 'git';

// Output bounds, by the read they admit. COMMAND admits any single git
// command's output: 64 MiB is fifty times the largest tracked-file list
// measured on any lineage, and it is the bound most bounded callers already
// used. HISTORY_BLOB_BATCH admits one `git cat-file --batch` answer carrying
// every quest record revision a publication range touched; it measured
// 31,618,742 bytes on the rs-raft lineage on 2026-10-24 and kept the 512 MiB
// bound its owner (quest-record-transitions.js) chose when it was written.
const GIT_OUTPUT_BOUND = Object.freeze({
  COMMAND: 64 * 1024 * 1024,
  HISTORY_BLOB_BATCH: 512 * 1024 * 1024,
});
const ADMITTED_BOUNDS = new Set(Object.values(GIT_OUTPUT_BOUND));

const GIT_OUTPUT_TOO_LARGE = 'git-output-too-large';
const UNNAMED_BOUND = 'git-output-bound-unnamed';
const SYNC_OVERFLOW_CODE = 'ENOBUFS';
const ASYNC_OVERFLOW_CODE = 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
const ARGUMENT_SEPARATOR = ' ';

/** Git output that exceeded its named bound: a failure of its own. */
class GitOutputTooLargeError extends Error {
  /**
   * @param {string[]} args
   * @param {number} maxBytes
   * @param {Error} cause
   */
  constructor(args, maxBytes, cause) {
    super(`${GIT_EXECUTABLE} ${[...args].join(ARGUMENT_SEPARATOR)}: output exceeded the ` +
      `git output bound of ${maxBytes} bytes`, {cause});
    this.name = new.target.name;
    this.code = GIT_OUTPUT_TOO_LARGE;
    this.args = Object.freeze([...args]);
    this.maxBytes = maxBytes;
  }
}

/**
 * @param {unknown} error
 * @return {boolean}
 */
function isGitOutputTooLarge(error) {
  return error instanceof GitOutputTooLargeError;
}

function boundedOptions(options) {
  const {bound = GIT_OUTPUT_BOUND.COMMAND, ...rest} = options;
  if (!ADMITTED_BOUNDS.has(bound)) {
    const error = new Error(`${GIT_EXECUTABLE}: ${bound} is not a named git output bound`);
    error.code = UNNAMED_BOUND;
    throw error;
  }
  return {bound, childOptions: {...rest, maxBuffer: bound}};
}

/**
 * spawnSync semantics: a nonzero exit is the returned status, never thrown.
 * Output past the bound throws GitOutputTooLargeError.
 * @param {string[]} args
 * @param {object} [options] child_process options plus an optional `bound`
 *   from GIT_OUTPUT_BOUND; `maxBuffer` is always the bound.
 * @return {import('node:child_process').SpawnSyncReturns<string|Buffer>}
 */
function spawnGit(args, options = {}) {
  const {bound, childOptions} = boundedOptions(options);
  const result = spawnSync(GIT_EXECUTABLE, args, childOptions);
  if (result.error?.code === SYNC_OVERFLOW_CODE) {
    throw new GitOutputTooLargeError(args, bound, result.error);
  }
  return result;
}

/**
 * execFileSync semantics: returns stdout and throws on a nonzero exit.
 * Output past the bound throws GitOutputTooLargeError instead.
 * @param {string[]} args
 * @param {object} [options] child_process options plus an optional `bound`.
 * @return {string|Buffer}
 */
function execGit(args, options = {}) {
  const {bound, childOptions} = boundedOptions(options);
  try {
    return execFileSync(GIT_EXECUTABLE, args, childOptions);
  } catch (error) {
    if (error?.code === SYNC_OVERFLOW_CODE) {
      throw new GitOutputTooLargeError(args, bound, error);
    }
    throw error;
  }
}

/**
 * Promisified execFile semantics: resolves `{stdout, stderr}` and rejects on
 * a nonzero exit with the child-process error. Output past the bound rejects
 * with GitOutputTooLargeError instead.
 * @param {string[]} args
 * @param {object} [options] child_process options plus an optional `bound`.
 * @return {Promise<{stdout: string|Buffer, stderr: string|Buffer}>}
 */
function execGitAsync(args, options = {}) {
  let bounded;
  try {
    bounded = boundedOptions(options);
  } catch (error) {
    return Promise.reject(error);
  }
  return new Promise((resolve, reject) => {
    execFile(GIT_EXECUTABLE, args, bounded.childOptions, (error, stdout, stderr) => {
      if (error?.code === ASYNC_OVERFLOW_CODE) {
        reject(new GitOutputTooLargeError(args, bounded.bound, error));
        return;
      }
      if (error) {
        Object.assign(error, {stdout, stderr});
        reject(error);
        return;
      }
      resolve({stdout, stderr});
    });
  });
}

export {
  GIT_OUTPUT_BOUND,
  GIT_OUTPUT_TOO_LARGE,
  GitOutputTooLargeError,
  execGit,
  execGitAsync,
  isGitOutputTooLarge,
  spawnGit,
};
