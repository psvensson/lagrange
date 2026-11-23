// Repository git reference and remote branch inspection for P6 lab evidence
// reports.

import {spawnGit} from './git-invocation.js';
import {gitProcessEnvironment} from './git-process-environment.js';

import {
  GIT_ARGS,
  LINE_BREAK_PATTERN,
  PROBLEM_CODE,
  REMOTE_STATE,
  TEXT,
  ZERO,
  addProblem,
  stringIndexOf,
  stringSlice,
  stringSplit,
  stringTrim,
} from './lab-evidence-report-constants.js';

function runDefaultGit(cwd, args) {
  return spawnGit(args, {
    cwd,
    encoding: TEXT.UTF8,
    env: gitProcessEnvironment(),
  });
}

function parseLsRemoteSha(stdout) {
  const trimmed = stringTrim(String(stdout || TEXT.EMPTY));
  if (trimmed.length === ZERO) return TEXT.EMPTY;
  const firstLine = stringSplit(trimmed, LINE_BREAK_PATTERN)[ZERO] || TEXT.EMPTY;
  const tabIndex = stringIndexOf(firstLine, TEXT.TAB);
  if (tabIndex <= ZERO) return stringTrim(firstLine);
  return stringTrim(stringSlice(firstLine, ZERO, tabIndex));
}

function classifyRemoteState(lsRemoteResult, claimedSha) {
  let classified = null;
  if (lsRemoteResult.status !== ZERO) {
    const errText = lsRemoteResult.stderr || lsRemoteResult.error?.message || TEXT.UNKNOWN;
    classified = {
      remoteState: REMOTE_STATE.UNAVAILABLE,
      remoteSha: TEXT.UNAVAILABLE,
      detail: stringTrim(String(errText)),
    };
  } else {
    const remoteSha = parseLsRemoteSha(lsRemoteResult.stdout);
    if (remoteSha.length === ZERO) {
      classified = {remoteState: REMOTE_STATE.UNPUSHED, remoteSha: TEXT.EMPTY, detail: TEXT.EMPTY};
    } else if (remoteSha === claimedSha) {
      classified = {remoteState: REMOTE_STATE.PUSHED_MATCH, remoteSha, detail: TEXT.EMPTY};
    } else {
      classified = {remoteState: REMOTE_STATE.REMOTE_DIVERGED, remoteSha, detail: TEXT.EMPTY};
    }
  }
  return classified;
}

function unavailableGitState(targetRef, remote, remoteRef) {
  return {
    available: false,
    headSha: TEXT.UNAVAILABLE,
    headBranch: TEXT.UNAVAILABLE,
    targetRef,
    targetRefSha: TEXT.UNAVAILABLE,
    remote,
    remoteRef,
    remoteState: REMOTE_STATE.UNAVAILABLE,
    remoteSha: TEXT.UNAVAILABLE,
    originMainSha: TEXT.UNAVAILABLE,
    pushed: false,
  };
}

function readGitStdout(gitRunner, repoRoot, args, fallbackValue) {
  const res = gitRunner(repoRoot, args);
  return res.status === ZERO ? stringTrim(String(res.stdout || TEXT.EMPTY)) : fallbackValue;
}

function inspectRemoteBranchRefs(gitRunner, repoRoot, options, problems) {
  const {remote, refToCheck, originMainRef, claimedSha, requireRemotePushed} = options;
  const lsRemoteRes = gitRunner(repoRoot, [GIT_ARGS.LS_REMOTE, remote, refToCheck]);
  const remoteInfo = classifyRemoteState(lsRemoteRes, claimedSha);
  const pushed = remoteInfo.remoteState === REMOTE_STATE.PUSHED_MATCH;

  if (requireRemotePushed && !pushed) {
    addProblem(
      problems,
      PROBLEM_CODE.REMOTE_REF_NOT_PUSHED,
      `remote ${remote} ${refToCheck} state=${remoteInfo.remoteState} sha=${remoteInfo.remoteSha}`,
    );
  }

  const mainRes = gitRunner(repoRoot, [GIT_ARGS.LS_REMOTE, remote, originMainRef]);
  const mainSha = mainRes.status === ZERO ? parseLsRemoteSha(mainRes.stdout) : TEXT.UNAVAILABLE;
  return {
    remoteState: remoteInfo.remoteState,
    remoteSha: remoteInfo.remoteSha,
    remoteDetail: remoteInfo.detail,
    originMainSha: mainSha.length > ZERO ? mainSha : TEXT.UNAVAILABLE,
    pushed,
  };
}

function normalizeGitInspectOptions(options) {
  return {
    repoRoot: options.repoRoot,
    claimedSha: options.claimedSha,
    targetRef: options.targetRef || GIT_ARGS.HEAD_REF,
    remote: options.remote || GIT_ARGS.ORIGIN,
    remoteRef: options.remoteRef || TEXT.EMPTY,
    originMainRef: options.originMainRef || GIT_ARGS.ORIGIN_MAIN_REF,
    requireRemotePushed: options.requireRemotePushed === true,
    gitRunner: options.gitRunner || runDefaultGit,
  };
}

function inspectGitBranchState(options, problems) {
  const opts = normalizeGitInspectOptions(options);
  const headRes = opts.gitRunner(opts.repoRoot, GIT_ARGS.HEAD_REV);
  if (headRes.status !== ZERO) {
    const errText = headRes.stderr || headRes.error?.message || TEXT.UNKNOWN;
    addProblem(
      problems,
      PROBLEM_CODE.GIT_STATE_UNAVAILABLE,
      `git rev-parse HEAD failed: ${stringTrim(String(errText))}`,
    );
    return unavailableGitState(opts.targetRef, opts.remote, opts.remoteRef);
  }

  const headSha = stringTrim(String(headRes.stdout || TEXT.EMPTY));
  const headBranch = readGitStdout(
    opts.gitRunner,
    opts.repoRoot,
    GIT_ARGS.HEAD_BRANCH,
    TEXT.DETACHED,
  );
  const targetRevArgs = [
    GIT_ARGS.REV_PARSE,
    GIT_ARGS.VERIFY,
    `${opts.targetRef}${GIT_ARGS.COMMIT_SUFFIX}`,
  ];
  const targetRefSha = readGitStdout(
    opts.gitRunner,
    opts.repoRoot,
    targetRevArgs,
    TEXT.UNAVAILABLE,
  );

  if (targetRefSha !== opts.claimedSha) {
    addProblem(
      problems,
      PROBLEM_CODE.TARGET_REF_SHA_MISMATCH,
      `target ref ${opts.targetRef} resolved to ${targetRefSha}, expected ${opts.claimedSha}`,
    );
  }

  const refToCheck = opts.remoteRef.length > ZERO ? opts.remoteRef : opts.targetRef;
  const remoteFacts = inspectRemoteBranchRefs(
    opts.gitRunner,
    opts.repoRoot,
    {
      remote: opts.remote,
      refToCheck,
      originMainRef: opts.originMainRef,
      claimedSha: opts.claimedSha,
      requireRemotePushed: opts.requireRemotePushed,
    },
    problems,
  );

  return {
    available: true,
    headSha,
    headBranch,
    targetRef: opts.targetRef,
    targetRefSha,
    remote: opts.remote,
    remoteRef: refToCheck,
    ...remoteFacts,
  };
}

export {
  inspectGitBranchState,
};
