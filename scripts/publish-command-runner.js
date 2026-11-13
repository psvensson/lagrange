// Publisher command results and checkout cleanup preserve their first cause.
// Git execution and removal delegate to the existing canonical owners.

import {spawnGit} from './checks/git-invocation.js';
import {removeWorktree} from './session-worktree.js';
import {
  ARG_SEPARATOR, INHERIT_STDIO, NEWLINE, PIPE_STDIO, PUBLISH_CLEANUP_UNAVAILABLE,
  PUBLISH_RECEIPT_AT, PUBLISH_RECEIPT_UNAVAILABLE, PUBLISH_VERIFIED_HEAD, UTF8,
} from './publish-execution-constants.js';

function childOptions(options) {
  return {
    cwd: options.cwd,
    env: options.env || process.env,
    input: options.input,
    encoding: UTF8,
    // Stream long-running child output (the gate's own [pre-push] stage
    // lines) straight to the operator instead of buffering it into the
    // captured result - a 30-minute silent gate is not a user experience
    // (operator report 2026-09-02). stdin stays a pipe for `input`.
    ...(options.streamOutput === true ?
      {stdio: [PIPE_STDIO, INHERIT_STDIO, INHERIT_STDIO]} :
      {}),
  };
}

function checkedResult(result, commandLine, options) {
  if (result.error) throw result.error;
  if (result.status !== 0 && options.allowFailure !== true) {
    const detail = String(result.stderr || result.stdout || '').trim();
    throw new Error(`${commandLine} failed${detail ? `: ${detail}` : ''}`);
  }
  return result;
}

function checked(run, command, args, options = {}) {
  return checkedResult(run(command, args, childOptions(options)),
    `${command} ${args.join(ARG_SEPARATOR)}`, options);
}

// Git is never routed through the injectable runner: it is started by the
// git invocation owner, whose output bound and overflow failure hold here.
function checkedGit(args, options = {}) {
  return checkedResult(spawnGit(args, childOptions(options)),
    `git ${args.join(ARG_SEPARATOR)}`, options);
}

function git(root, args, options = {}) {
  return String(checkedGit(args, {cwd: root, ...options}).stdout || '').trim();
}

// The canonical remover owns the Git operation. This publisher retains its
// actual outward result even when its temporary checkout cannot be removed.
function removePublishCheckout(root, worktree, published) {
  try {
    removeWorktree(root, worktree);
  } catch (cause) {
    const publication = published ? PUBLISH_VERIFIED_HEAD + published.head +
      (published.receipt ? PUBLISH_RECEIPT_AT + published.receipt :
        PUBLISH_RECEIPT_UNAVAILABLE) : '';
    const error = new Error(`${PUBLISH_CLEANUP_UNAVAILABLE}${worktree}: ` +
      `${cause.message}${publication}`, {cause});
    error.worktreePath = worktree;
    if (published) error.published = published;
    try {
      process.stderr.write(`${error.message}${NEWLINE}`);
    } catch (reportingError) {
      error.reportingError = reportingError;
    }
    throw error;
  }
}

export {checked, checkedGit, git, removePublishCheckout};
