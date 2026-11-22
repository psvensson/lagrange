// Input resolution and artifact parsing for P6 lab evidence reports.
//
// Owns repository git ref inspection, symlink-safe job directory reading,
// placement log/NDJSON cross-checking, and the canonical P6 vocabulary.

import fs from 'node:fs';
import path from 'node:path';

import {spawnGit} from './git-invocation.js';
import {gitProcessEnvironment} from './git-process-environment.js';

import {
  EXIT_JSON_NAME,
  FOURTH_INDEX,
  GIT_ARGS,
  LINE_BREAK_PATTERN,
  LOG_HEADER,
  LOG_HOST_PATTERN,
  MERGED_NDJSON_NAME,
  NDJSON_EXT,
  NDJSON_PREFIX,
  ONE,
  PLACEMENT_LOG_EXT,
  PLANNED_LINE_PATTERN,
  PROBLEM_CODE,
  REMOTE_STATE,
  SELECTION_JSON_NAME,
  TEN,
  TEXT,
  THREE,
  TOTALS_LINE_PATTERN,
  TWO,
  WHITESPACE_SPLIT_PATTERN,
  ZERO,
  addProblem,
  arrayFilter,
  isPlainObject,
  isValidSha,
  regexExec,
  stringEndsWith,
  stringIndexOf,
  stringSlice,
  stringSplit,
  stringStartsWith,
  stringTrim,
} from './lab-evidence-report-constants.js';

function runDefaultGit(cwd, args) {
  return spawnGit(args, {
    cwd,
    encoding: TEXT.UTF8,
    env: gitProcessEnvironment(),
  });
}

function readVerifiedFile(rootDir, filePath) {
  try {
    const resolvedRoot = fs.realpathSync(rootDir);
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink()) {
      return {ok: false, reason: `refusing symbolic link artifact ${filePath}`};
    }
    const resolvedFile = fs.realpathSync(filePath);
    const rootPrefix = stringEndsWith(resolvedRoot, TEXT.SLASH) ?
      resolvedRoot : `${resolvedRoot}${TEXT.SLASH}`;
    const insideRoot = resolvedFile === resolvedRoot ||
      stringStartsWith(resolvedFile, rootPrefix);
    return insideRoot ?
      {ok: true, content: fs.readFileSync(resolvedFile, TEXT.UTF8)} :
      {ok: false, reason: `artifact resolves outside directory: ${filePath}`};
  } catch (error) {
    return {ok: false, reason: String(error?.message ?? error)};
  }
}

function readJsonArtifact(rootDir, filePath) {
  if (!fs.existsSync(filePath)) {
    return {ok: false, missing: true, reason: `missing file ${filePath}`, value: null};
  }
  const readResult = readVerifiedFile(rootDir, filePath);
  return readResult.ok ?
    parseJsonContent(filePath, readResult.content) :
    {ok: false, missing: false, reason: readResult.reason, value: null};
}

function parseJsonContent(filePath, content) {
  try {
    return {ok: true, missing: false, reason: TEXT.EMPTY, value: JSON.parse(content)};
  } catch (error) {
    return {
      ok: false,
      missing: false,
      reason: `malformed JSON in ${filePath}: ${String(error?.message ?? error)}`,
      value: null,
    };
  }
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

function parsePlacementEnv(rawEnv) {
  const parsed = {};
  const tokens = arrayFilter(
    stringSplit(stringTrim(rawEnv), WHITESPACE_SPLIT_PATTERN),
    (token) => token.length > ZERO,
  );
  for (const token of tokens) {
    const colonAt = stringIndexOf(token, TEXT.COLON);
    if (colonAt > ZERO) {
      parsed[stringSlice(token, ZERO, colonAt)] = stringSlice(token, colonAt + ONE);
    }
  }
  return parsed;
}

function inferHostFromLogName(fileName, knownHosts) {
  for (const host of knownHosts) {
    if (stringEndsWith(fileName, `-${host}${PLACEMENT_LOG_EXT}`)) return host;
  }
  const match = regexExec(LOG_HOST_PATTERN, fileName);
  if (match && match[ONE]) return match[ONE];
  return stringSlice(fileName, ZERO, fileName.length - PLACEMENT_LOG_EXT.length);
}

function applyLogHeaderLine(state, line) {
  if (stringStartsWith(line, LOG_HEADER.PLACEMENT_HEAD)) {
    state.placementHead = stringTrim(stringSlice(line, LOG_HEADER.PLACEMENT_HEAD.length));
    return true;
  }
  if (stringStartsWith(line, LOG_HEADER.PLACEMENT_PID)) {
    state.placementPid = Number.parseInt(stringSlice(line, LOG_HEADER.PLACEMENT_PID.length), TEN);
    return true;
  }
  if (stringStartsWith(line, LOG_HEADER.PLACEMENT_SHELL)) {
    state.placementShell = Number.parseInt(
      stringSlice(line, LOG_HEADER.PLACEMENT_SHELL.length),
      TEN,
    );
    return true;
  }
  if (stringStartsWith(line, LOG_HEADER.PLACEMENT_HOST)) {
    state.host = stringTrim(stringSlice(line, LOG_HEADER.PLACEMENT_HOST.length));
    return true;
  }
  if (stringStartsWith(line, LOG_HEADER.PLACEMENT_ENV)) {
    state.placementEnvRaw = stringTrim(stringSlice(line, LOG_HEADER.PLACEMENT_ENV.length));
    return true;
  }
  return false;
}

function applyLogBodyLine(state, line) {
  if (stringStartsWith(line, LOG_HEADER.PLACEMENT_RESULTS)) {
    const jsonText = stringSlice(line, LOG_HEADER.PLACEMENT_RESULTS.length);
    try {
      state.results.push(JSON.parse(jsonText));
    } catch (error) {
      state.parseErrors.push(`malformed placement-results JSON: ${String(error?.message ?? error)}`);
    }
    return;
  }
  const plannedMatch = regexExec(PLANNED_LINE_PATTERN, line);
  if (plannedMatch) {
    state.plannedCount = Number.parseInt(plannedMatch[ONE], TEN);
    return;
  }
  const totalsMatch = regexExec(TOTALS_LINE_PATTERN, line);
  if (totalsMatch) {
    state.summaryTotals = {
      total: Number.parseInt(totalsMatch[ONE], TEN),
      pass: Number.parseInt(totalsMatch[TWO], TEN),
      fail: Number.parseInt(totalsMatch[THREE], TEN),
      assertions: Number.parseInt(totalsMatch[FOURTH_INDEX], TEN),
    };
  }
}

function parsePlacementLogContent(content, defaultHost) {
  const state = {
    host: defaultHost,
    placementHead: TEXT.EMPTY,
    placementPid: null,
    placementShell: null,
    placementEnvRaw: TEXT.EMPTY,
    plannedCount: null,
    summaryTotals: null,
    results: [],
    parseErrors: [],
  };

  for (const line of stringSplit(content, LINE_BREAK_PATTERN)) {
    if (!applyLogHeaderLine(state, line)) {
      applyLogBodyLine(state, line);
    }
  }

  return {
    ...state,
    placementEnv: parsePlacementEnv(state.placementEnvRaw),
  };
}

function parseNdjsonContent(content) {
  const lines = arrayFilter(
    stringSplit(content, LINE_BREAK_PATTERN),
    (line) => stringTrim(line).length > ZERO,
  );
  const rows = [];
  const parseErrors = [];
  for (const line of lines) {
    try {
      rows.push(JSON.parse(line));
    } catch (error) {
      parseErrors.push(`malformed NDJSON row: ${String(error?.message ?? error)}`);
    }
  }
  return {rows, parseErrors};
}

function rowIdentityMatches(a, b) {
  return Boolean(a) && Boolean(b) && a.file === b.file && a.ok === b.ok &&
    a.assertions === b.assertions;
}

function rowAttemptMatches(a, b) {
  return a.attempt === b.attempt && Boolean(a.retriedOnce) === Boolean(b.retriedOnce);
}

function rowsMatchExactly(a, b) {
  return rowIdentityMatches(a, b) && rowAttemptMatches(a, b);
}

function summarizeResultsMatch(logResults, ndjsonRows) {
  if (logResults.length !== ndjsonRows.length) {
    return `log placement-results count (${logResults.length}) != ndjson count (${ndjsonRows.length})`;
  }
  for (let i = ZERO; i < logResults.length; i += ONE) {
    const a = logResults[i];
    const b = ndjsonRows[i];
    if (!rowsMatchExactly(a, b)) {
      return `result mismatch at entry ${i}: log=${JSON.stringify(a)} ndjson=${JSON.stringify(b)}`;
    }
  }
  return TEXT.EMPTY;
}

function validatePlacementSummaryTotals(summaryTotals, ctx, problems) {
  if (summaryTotals === null) return;
  const {total, pass, fail, assertions} = summaryTotals;
  const hasFailure = fail !== ZERO || pass !== total;
  const missingAssertions = total > ZERO && assertions <= ZERO;
  if (hasFailure || missingAssertions) {
    addProblem(
      problems,
      PROBLEM_CODE.PLACEMENT_SUMMARY_FAILED,
      `${ctx.jobName}/${ctx.host}: summary total=${total} pass=${pass} fail=${fail} ` +
      `assertions=${assertions}`,
      {host: ctx.host, job: ctx.jobName},
    );
  }
}

function validateRowPassed(row, ctx, problems) {
  const safeRow = isPlainObject(row) ? row : {};
  const passed = safeRow.ok === true && Number(safeRow.assertions) > ZERO;
  if (passed) return;
  const fileLabel = safeRow.file || TEXT.UNKNOWN;
  addProblem(
    problems,
    PROBLEM_CODE.TEST_CASE_FAILED,
    `${ctx.jobName}/${ctx.host}: file=${fileLabel} ok=${safeRow.ok} assertions=${safeRow.assertions}`,
    {host: ctx.host, job: ctx.jobName, file: safeRow.file},
  );
}

function validateRowRetryPolicy(row, ctx, allowRetries, problems) {
  if (allowRetries) return;
  const safeRow = isPlainObject(row) ? row : {};
  const retried = safeRow.retriedOnce === true || Number(safeRow.attempt) > ONE;
  if (!retried) return;
  const fileLabel = safeRow.file || TEXT.UNKNOWN;
  addProblem(
    problems,
    PROBLEM_CODE.RETRY_POLICY_VIOLATED,
    `${ctx.jobName}/${ctx.host}: retry observed for ${fileLabel} (attempt=${safeRow.attempt})`,
    {host: ctx.host, job: ctx.jobName, file: safeRow.file},
  );
}

function validateSingleResultRow(row, ctx, allowRetries, problems) {
  validateRowPassed(row, ctx, problems);
  validateRowRetryPolicy(row, ctx, allowRetries, problems);
}

function validateHostExecutionFacts(hostRecord, options, problems) {
  const ctx = {host: hostRecord.host, jobName: options.jobName};
  const {parsedLog, ndjsonRows} = hostRecord;
  const foundHead = parsedLog.placementHead || TEXT.UNAVAILABLE;

  if (!isValidSha(parsedLog.placementHead) || parsedLog.placementHead !== options.claimedSha) {
    addProblem(
      problems,
      PROBLEM_CODE.EXECUTION_SHA_MISMATCH,
      `${ctx.jobName}/${ctx.host}: placement-head=${foundHead} != ${options.claimedSha}`,
      {host: ctx.host, job: ctx.jobName},
    );
  }
  for (const err of parsedLog.parseErrors) {
    addProblem(
      problems,
      PROBLEM_CODE.JOB_FAILED,
      `${ctx.jobName}/${ctx.host}: ${err}`,
      {host: ctx.host, job: ctx.jobName},
    );
  }
  validatePlacementSummaryTotals(parsedLog.summaryTotals, ctx, problems);

  if (parsedLog.results.length > ZERO && ndjsonRows !== null) {
    const mismatch = summarizeResultsMatch(parsedLog.results, ndjsonRows);
    if (mismatch.length > ZERO) {
      addProblem(
        problems,
        PROBLEM_CODE.RESULTS_MISMATCH,
        `${ctx.jobName}/${ctx.host}: ${mismatch}`,
        {host: ctx.host, job: ctx.jobName},
      );
    }
  }

  const effectiveRows = ndjsonRows !== null ? ndjsonRows : parsedLog.results;
  const allowRetries = options.allowRetries === true;
  for (const row of effectiveRows) {
    validateSingleResultRow(row, ctx, allowRetries, problems);
  }
  return effectiveRows;
}

function readJobNdjsonByHost(jobDir, jobName, dirEntries, problems) {
  const ndjsonFiles = arrayFilter(
    dirEntries,
    (name) => stringStartsWith(name, NDJSON_PREFIX) && stringEndsWith(name, NDJSON_EXT),
  );
  const ndjsonByHost = new Map();
  for (const ndFile of ndjsonFiles) {
    const host = stringSlice(ndFile, NDJSON_PREFIX.length, ndFile.length - NDJSON_EXT.length);
    const raw = readVerifiedFile(jobDir, path.join(jobDir, ndFile));
    if (!raw.ok) {
      addProblem(problems, PROBLEM_CODE.JOB_PATH_UNSAFE, `${jobName}/${ndFile}: ${raw.reason}`);
      continue;
    }
    const parsed = parseNdjsonContent(raw.content);
    for (const err of parsed.parseErrors) {
      addProblem(problems, PROBLEM_CODE.JOB_FAILED, `${jobName}/${ndFile}: ${err}`);
    }
    ndjsonByHost.set(host, parsed.rows);
  }
  return ndjsonByHost;
}

function readJobExitStatus(jobDir, jobName, problems) {
  const exitRead = readJsonArtifact(jobDir, path.join(jobDir, EXIT_JSON_NAME));
  if (!exitRead.ok) {
    const code = exitRead.missing ? PROBLEM_CODE.JOB_EXIT_MISSING : PROBLEM_CODE.JOB_PATH_UNSAFE;
    addProblem(problems, code, `${jobName}: ${exitRead.reason}`);
    return {exitStatus: TEXT.UNAVAILABLE, finishedAt: TEXT.EMPTY};
  }
  const exitVal = isPlainObject(exitRead.value) ? exitRead.value : {};
  if (exitVal.status !== ZERO) {
    addProblem(problems, PROBLEM_CODE.JOB_FAILED, `${jobName}: exit.json status=${exitVal.status}`);
  }
  return {exitStatus: exitVal.status, finishedAt: exitVal.finishedAt || TEXT.EMPTY};
}

function readJobSelectionInfo(jobDir, jobName, claimedSha, problems) {
  const selectionRead = readJsonArtifact(jobDir, path.join(jobDir, SELECTION_JSON_NAME));
  if (!selectionRead.ok) {
    addProblem(problems, PROBLEM_CODE.SELECTION_MISSING, `${jobName}: ${selectionRead.reason}`);
    return {selectionSha: TEXT.EMPTY, plannedFiles: []};
  }
  const selVal = isPlainObject(selectionRead.value) ? selectionRead.value : {};
  if (selVal.sha !== claimedSha) {
    addProblem(
      problems,
      PROBLEM_CODE.SELECTION_SHA_MISMATCH,
      `${jobName}: selection.json sha=${selVal.sha} != ${claimedSha}`,
    );
  }
  const plannedFiles = Array.isArray(selVal.files) ? [...selVal.files] : [];
  return {selectionSha: selVal.sha || TEXT.EMPTY, plannedFiles};
}

function readJobExitAndSelection(jobDir, jobName, claimedSha, problems) {
  const exitInfo = readJobExitStatus(jobDir, jobName, problems);
  const selectionInfo = readJobSelectionInfo(jobDir, jobName, claimedSha, problems);
  return {...exitInfo, ...selectionInfo};
}

function readJobHostLogs(jobDir, jobName, ndjsonByHost, logFiles, options, problems) {
  const knownHosts = [...ndjsonByHost.keys()];
  const hosts = [];
  const executedFiles = new Map();

  for (const logFile of logFiles) {
    const rawLog = readVerifiedFile(jobDir, path.join(jobDir, logFile));
    if (!rawLog.ok) {
      addProblem(problems, PROBLEM_CODE.JOB_PATH_UNSAFE, `${jobName}/${logFile}: ${rawLog.reason}`);
      continue;
    }
    const parsedLog = parsePlacementLogContent(
      rawLog.content,
      inferHostFromLogName(logFile, knownHosts),
    );
    const ndjsonRows = ndjsonByHost.get(parsedLog.host) || null;
    const effectiveRows = validateHostExecutionFacts(
      {host: parsedLog.host, logFile, parsedLog, ndjsonRows},
      {...options, jobName},
      problems,
    );
    for (const row of effectiveRows) {
      if (row?.file) executedFiles.set(row.file, row);
    }
    hosts.push({
      job: jobName,
      host: parsedLog.host,
      logFile,
      placementHead: parsedLog.placementHead,
      placementPid: parsedLog.placementPid,
      placementEnv: parsedLog.placementEnv,
      placementEnvRaw: parsedLog.placementEnvRaw,
      summaryTotals: parsedLog.summaryTotals,
      executedRows: effectiveRows,
    });
  }

  return {hosts, executedFiles};
}

function mergeFallbackNdjson(jobDir, ndjsonByHost, executedFiles) {
  const mergedPath = path.join(jobDir, MERGED_NDJSON_NAME);
  if (ndjsonByHost.size > ZERO || !fs.existsSync(mergedPath)) return;
  const mergedRaw = readVerifiedFile(jobDir, mergedPath);
  if (!mergedRaw.ok) return;
  for (const row of parseNdjsonContent(mergedRaw.content).rows) {
    if (row?.file && !executedFiles.has(row.file)) executedFiles.set(row.file, row);
  }
}

function inspectLabJobDirectory(jobDir, options, problems) {
  const jobName = path.basename(jobDir);
  if (!fs.existsSync(jobDir)) {
    addProblem(problems, PROBLEM_CODE.JOBS_MISSING, `job directory does not exist: ${jobDir}`);
    return null;
  }

  const meta = readJobExitAndSelection(jobDir, jobName, options.claimedSha, problems);
  const dirEntries = fs.readdirSync(jobDir);
  const ndjsonByHost = readJobNdjsonByHost(jobDir, jobName, dirEntries, problems);
  const logFiles = arrayFilter(dirEntries, (name) => stringEndsWith(name, PLACEMENT_LOG_EXT));
  if (logFiles.length === ZERO) {
    addProblem(problems, PROBLEM_CODE.PLACEMENT_LOG_MISSING, `${jobName}: no placement *.log files`);
  }

  const {hosts, executedFiles} = readJobHostLogs(
    jobDir,
    jobName,
    ndjsonByHost,
    logFiles,
    options,
    problems,
  );
  mergeFallbackNdjson(jobDir, ndjsonByHost, executedFiles);

  return {
    jobName,
    jobDir,
    ...meta,
    hosts,
    executedFiles,
  };
}

export {
  inspectGitBranchState,
  inspectLabJobDirectory,
};
