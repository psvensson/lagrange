// Input resolution and artifact parsing for P6 lab evidence reports.
//
// Owns symlink-safe job directory reading, placement log/NDJSON cross-checking,
// and original per-host execution validation.

import fs from 'node:fs';
import path from 'node:path';

import {
  EXIT_JSON_NAME,
  FOURTH_INDEX,
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
  isAdmissibleExecutionRow,
  isPlainObject,
  isPositiveFiniteNumber,
  isSingleAttempt,
  isValidSha,
  numberIsFinite,
  regexExec,
  stringEndsWith,
  stringIndexOf,
  stringSlice,
  stringSplit,
  stringStartsWith,
  stringTrim,
} from './lab-evidence-report-constants.js';

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
    const entry = {
      total: Number.parseInt(totalsMatch[ONE], TEN),
      pass: Number.parseInt(totalsMatch[TWO], TEN),
      fail: Number.parseInt(totalsMatch[THREE], TEN),
      assertions: Number.parseInt(totalsMatch[FOURTH_INDEX], TEN),
    };
    state.summaryTotals = entry;
    state.summaryTotalsList.push(entry);
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
    summaryTotalsList: [],
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

function validateSingleSummaryEntry(entry, ctx, problems) {
  const {total, pass, fail, assertions} = entry;
  const hasFailure = fail !== ZERO || pass !== total;
  const missingAssertions = total > ZERO && assertions <= ZERO;
  if (!hasFailure && !missingAssertions) return true;
  addProblem(
    problems,
    PROBLEM_CODE.PLACEMENT_SUMMARY_FAILED,
    `${ctx.jobName}/${ctx.host}: summary total=${total} pass=${pass} fail=${fail} ` +
    `assertions=${assertions}`,
    {host: ctx.host, job: ctx.jobName},
  );
  return false;
}

function validatePlacementSummaryTotals(summaryTotalsList, executedCount, ctx, problems) {
  if (summaryTotalsList.length === ZERO) return true;
  let allValid = true;
  let totalSum = ZERO;
  for (const entry of summaryTotalsList) {
    if (!validateSingleSummaryEntry(entry, ctx, problems)) allValid = false;
    totalSum += entry.total;
  }
  if (totalSum !== executedCount) {
    addProblem(
      problems,
      PROBLEM_CODE.RESULTS_MISMATCH,
      `${ctx.jobName}/${ctx.host}: summary total (${totalSum}) != executed rows (${executedCount})`,
      {host: ctx.host, job: ctx.jobName},
    );
    allValid = false;
  }
  return allValid;
}

function validateRowPassed(row, ctx, problems) {
  const safeRow = isPlainObject(row) ? row : {};
  const passed = safeRow.ok === true && isPositiveFiniteNumber(safeRow.assertions);
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
  const singleAttempt = safeRow.retriedOnce === false && isSingleAttempt(safeRow.attempt);
  if (singleAttempt) return;
  const fileLabel = safeRow.file || TEXT.UNKNOWN;
  addProblem(
    problems,
    PROBLEM_CODE.RETRY_POLICY_VIOLATED,
    `${ctx.jobName}/${ctx.host}: retry or invalid attempt for ${fileLabel} ` +
    `(attempt=${safeRow.attempt}, retriedOnce=${safeRow.retriedOnce})`,
    {host: ctx.host, job: ctx.jobName, file: safeRow.file},
  );
}

function validateSingleResultRow(row, ctx, allowRetries, problems) {
  validateRowPassed(row, ctx, problems);
  validateRowRetryPolicy(row, ctx, allowRetries, problems);
}

function validateLogHeadAndErrors(parsedLog, ctx, claimedSha, problems) {
  let valid = true;
  const foundHead = parsedLog.placementHead || TEXT.UNAVAILABLE;
  if (!isValidSha(parsedLog.placementHead) || parsedLog.placementHead !== claimedSha) {
    addProblem(
      problems,
      PROBLEM_CODE.EXECUTION_SHA_MISMATCH,
      `${ctx.jobName}/${ctx.host}: placement-head=${foundHead} != ${claimedSha}`,
      {host: ctx.host, job: ctx.jobName},
    );
    valid = false;
  }
  for (const err of parsedLog.parseErrors) {
    addProblem(
      problems,
      PROBLEM_CODE.JOB_FAILED,
      `${ctx.jobName}/${ctx.host}: ${err}`,
      {host: ctx.host, job: ctx.jobName},
    );
    valid = false;
  }
  return valid;
}

function validateLogNdjsonAndCounts(parsedLog, ndjsonRows, effectiveRows, ctx, problems) {
  let valid = true;
  if (ndjsonRows !== null) {
    const mismatch = summarizeResultsMatch(parsedLog.results, ndjsonRows);
    if (mismatch.length > ZERO) {
      addProblem(
        problems,
        PROBLEM_CODE.RESULTS_MISMATCH,
        `${ctx.jobName}/${ctx.host}: ${mismatch}`,
        {host: ctx.host, job: ctx.jobName},
      );
      valid = false;
    }
  }
  if (parsedLog.plannedCount === null || parsedLog.plannedCount !== effectiveRows.length) {
    addProblem(
      problems,
      PROBLEM_CODE.RESULTS_MISMATCH,
      `${ctx.jobName}/${ctx.host}: planned count (${parsedLog.plannedCount}) != ` +
      `executed rows (${effectiveRows.length})`,
      {host: ctx.host, job: ctx.jobName},
    );
    valid = false;
  }
  return valid;
}

function validateHostExecutionFacts(hostRecord, options, problems) {
  const ctx = {host: hostRecord.host, jobName: options.jobName};
  const {parsedLog, ndjsonRows} = hostRecord;
  const effectiveRows = ndjsonRows !== null ? ndjsonRows : parsedLog.results;
  const headOk = validateLogHeadAndErrors(parsedLog, ctx, options.claimedSha, problems);
  const summaryOk = validatePlacementSummaryTotals(
    parsedLog.summaryTotalsList,
    effectiveRows.length,
    ctx,
    problems,
  );
  const countsOk = validateLogNdjsonAndCounts(
    parsedLog,
    ndjsonRows,
    effectiveRows,
    ctx,
    problems,
  );
  const allowRetries = options.allowRetries === true;
  for (const row of effectiveRows) {
    validateSingleResultRow(row, ctx, allowRetries, problems);
  }
  return {
    effectiveRows,
    plannedCount: parsedLog.plannedCount,
    logValid: headOk && summaryOk && countsOk,
  };
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

function recordHostEntry(hosts, hostsByName, hostEntry, jobName, problems) {
  if (hostsByName.has(hostEntry.host)) {
    hostsByName.get(hostEntry.host).logValid = false;
    hostEntry.logValid = false;
    addProblem(
      problems,
      PROBLEM_CODE.RESULTS_MISMATCH,
      `${jobName}/${hostEntry.host}: duplicate placement log ${hostEntry.logFile}`,
      {host: hostEntry.host, job: jobName},
    );
  } else {
    hostsByName.set(hostEntry.host, hostEntry);
  }
  hosts.push(hostEntry);
}

function validateOrphanHostNdjson(jobName, ndjsonByHost, hostsByName, problems) {
  for (const host of ndjsonByHost.keys()) {
    if (!hostsByName.has(host)) {
      addProblem(
        problems,
        PROBLEM_CODE.PLACEMENT_LOG_MISSING,
        `${jobName}/${host}: ${NDJSON_PREFIX}${host}${NDJSON_EXT} has no matching placement log`,
        {host, job: jobName},
      );
    }
  }
}

function readJobHostLogs(jobDir, jobName, ndjsonByHost, logFiles, options, problems) {
  const knownHosts = [...ndjsonByHost.keys()];
  const hosts = [];
  const hostsByName = new Map();
  const executedFiles = new Map();
  const allowRetries = options.allowRetries === true;

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
    const factOutcome = validateHostExecutionFacts(
      {host: parsedLog.host, logFile, parsedLog, ndjsonRows},
      {...options, jobName},
      problems,
    );
    const hostEntry = {
      job: jobName,
      host: parsedLog.host,
      logFile,
      placementHead: parsedLog.placementHead,
      placementPid: parsedLog.placementPid,
      placementEnv: parsedLog.placementEnv,
      placementEnvRaw: parsedLog.placementEnvRaw,
      summaryTotals: parsedLog.summaryTotals,
      plannedCount: factOutcome.plannedCount,
      executedRows: factOutcome.effectiveRows,
      logValid: factOutcome.logValid,
    };
    recordHostEntry(hosts, hostsByName, hostEntry, jobName, problems);
    if (hostEntry.logValid) {
      for (const row of factOutcome.effectiveRows) {
        if (row?.file && isAdmissibleExecutionRow(row, allowRetries)) {
          executedFiles.set(row.file, row);
        }
      }
    }
  }

  validateOrphanHostNdjson(jobName, ndjsonByHost, hostsByName, problems);
  return {hosts, hostsByName, executedFiles};
}

function collectValidatedHostRows(hosts) {
  const hostRows = [];
  let plannedTotal = ZERO;
  for (const hostEntry of hosts) {
    if (!hostEntry.logValid) continue;
    if (numberIsFinite(hostEntry.plannedCount)) {
      plannedTotal += hostEntry.plannedCount;
    }
    for (const row of hostEntry.executedRows) hostRows.push(row);
  }
  return {hostRows, plannedTotal};
}

function findAndConsumeMatchingRow(targetRow, hostRows, consumedIndices) {
  for (let i = ZERO; i < hostRows.length; i += ONE) {
    if (consumedIndices.has(i)) continue;
    if (rowsMatchExactly(hostRows[i], targetRow)) {
      consumedIndices.add(i);
      return true;
    }
  }
  return false;
}

function checkMergedRowCounts(jobName, mergedCount, hostCount, plannedTotal, problems) {
  if (mergedCount <= plannedTotal && mergedCount === hostCount) return;
  addProblem(
    problems,
    PROBLEM_CODE.UNBACKED_MERGED_RESULT,
    `${jobName}/${MERGED_NDJSON_NAME}: row count (${mergedCount}) does not match ` +
    `validated per-host records (${hostCount}, planned=${plannedTotal})`,
    {job: jobName},
  );
}

function crossCheckMergedRows(jobName, mergedRows, hostRows, allowRetries, problems) {
  const ctx = {host: MERGED_NDJSON_NAME, jobName};
  const consumedIndices = new Set();
  for (const row of mergedRows) {
    if (findAndConsumeMatchingRow(row, hostRows, consumedIndices)) continue;
    const fileLabel = row?.file || TEXT.UNKNOWN;
    addProblem(
      problems,
      PROBLEM_CODE.UNBACKED_MERGED_RESULT,
      `${jobName}/${MERGED_NDJSON_NAME}: ${fileLabel} has no matching validated per-host record`,
      {job: jobName, file: row?.file},
    );
    validateSingleResultRow(row, ctx, allowRetries, problems);
  }
}

function reconcileMergedNdjson(jobDir, jobName, hosts, options, problems) {
  const mergedPath = path.join(jobDir, MERGED_NDJSON_NAME);
  if (!fs.existsSync(mergedPath)) return;
  const mergedRaw = readVerifiedFile(jobDir, mergedPath);
  if (!mergedRaw.ok) {
    addProblem(
      problems,
      PROBLEM_CODE.JOB_PATH_UNSAFE,
      `${jobName}/${MERGED_NDJSON_NAME}: ${mergedRaw.reason}`,
      {job: jobName},
    );
    return;
  }
  const parsedMerged = parseNdjsonContent(mergedRaw.content);
  for (const err of parsedMerged.parseErrors) {
    addProblem(
      problems,
      PROBLEM_CODE.JOB_FAILED,
      `${jobName}/${MERGED_NDJSON_NAME}: ${err}`,
      {job: jobName},
    );
  }
  const {hostRows, plannedTotal} = collectValidatedHostRows(hosts);
  checkMergedRowCounts(jobName, parsedMerged.rows.length, hostRows.length, plannedTotal, problems);
  crossCheckMergedRows(
    jobName,
    parsedMerged.rows,
    hostRows,
    options.allowRetries === true,
    problems,
  );
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

  const {hosts, hostsByName, executedFiles} = readJobHostLogs(
    jobDir,
    jobName,
    ndjsonByHost,
    logFiles,
    options,
    problems,
  );
  reconcileMergedNdjson(jobDir, jobName, hosts, options, problems);

  return {
    jobName,
    jobDir,
    ...meta,
    hosts,
    hostsByName,
    executedFiles,
  };
}

export {
  inspectLabJobDirectory,
};
