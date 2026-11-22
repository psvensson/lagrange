// Input resolution and artifact parsing for P6 lab evidence reports.
//
// Owns repository git ref inspection, symlink-safe job directory reading,
// placement log/NDJSON cross-checking, and the canonical P6 vocabulary.

import fs from 'node:fs';
import path from 'node:path';

import {spawnGit} from './git-invocation.js';
import {gitProcessEnvironment} from './git-process-environment.js';

const stringTrim = Function.call.bind(String.prototype.trim);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringIndexOf = Function.call.bind(String.prototype.indexOf);
const stringToLowerCase = Function.call.bind(String.prototype.toLowerCase);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arraySome = Function.call.bind(Array.prototype.some);
const arrayEvery = Function.call.bind(Array.prototype.every);
const regexExec = Function.call.bind(RegExp.prototype.exec);
const regexTest = Function.call.bind(RegExp.prototype.test);

const LAB_EVIDENCE_SCHEMA = 'lagrange-p6-lab-evidence-report/v1';

const OUTCOME = Object.freeze({
  ADMITTED: 'ADMITTED',
  REFUSED: 'REFUSED',
  UNAVAILABLE: 'UNAVAILABLE',
});

const REMOTE_STATE = Object.freeze({
  PUSHED_MATCH: 'PUSHED_MATCH',
  REMOTE_DIVERGED: 'REMOTE_DIVERGED',
  UNPUSHED: 'UNPUSHED',
  UNAVAILABLE: 'UNAVAILABLE',
});

const CLAIM_KIND = Object.freeze({
  CROSS_NODE_CDC_PROPAGATION: 'cross-node-cdc-propagation',
  MULTI_HOST_FORMATION: 'multi-host-formation',
  COMPOSED_LAB_PROOF: 'composed-lab-proof',
  FOCUSED_SUITE: 'focused-suite',
});

const ARTIFACT_STATUS = Object.freeze({
  APPLICABLE: 'applicable',
  NOT_APPLICABLE: 'not_applicable',
});

const PROBLEM_CODE = Object.freeze({
  CLAIMED_SHA_INVALID: 'claimed_sha_invalid',
  GIT_STATE_UNAVAILABLE: 'git_state_unavailable',
  TARGET_REF_SHA_MISMATCH: 'target_ref_sha_mismatch',
  REMOTE_REF_NOT_PUSHED: 'remote_ref_not_pushed',
  JOBS_MISSING: 'jobs_missing',
  JOB_PATH_UNSAFE: 'job_path_unsafe',
  JOB_EXIT_MISSING: 'job_exit_missing',
  JOB_FAILED: 'job_failed',
  SELECTION_MISSING: 'selection_missing',
  SELECTION_SHA_MISMATCH: 'selection_sha_mismatch',
  PLACEMENT_LOG_MISSING: 'placement_log_missing',
  EXECUTION_SHA_MISMATCH: 'execution_sha_mismatch',
  PLACEMENT_SUMMARY_FAILED: 'placement_summary_failed',
  TEST_CASE_FAILED: 'test_case_failed',
  RESULTS_MISMATCH: 'results_mismatch',
  REQUIRED_FILE_MISSING_OR_FAILED: 'required_file_missing_or_failed',
  RETRY_POLICY_VIOLATED: 'retry_policy_violated',
  HOST_MANIFEST_MISSING: 'host_manifest_missing',
  HOST_MANIFEST_SHA_MISMATCH: 'host_manifest_sha_mismatch',
  HOST_RUNTIME_MISMATCH: 'host_runtime_mismatch',
  HOST_BACKEND_MISMATCH: 'host_backend_mismatch',
  HOST_ARTIFACT_MISMATCH: 'host_artifact_mismatch',
  HOST_CONFIG_MISMATCH: 'host_config_mismatch',
  TOPOLOGY_SCOPE_MISSING: 'topology_scope_missing',
  SHARED_CACHE_SUBSTITUTION_REFUSED: 'shared_cache_substitution_refused',
  APPLICABILITY_REFUSED: 'applicability_refused',
  EXECUTION_REPORT_REFUSED: 'execution_report_refused',
});

const MESSAGE = Object.freeze({
  JOBS_REQUIRED: 'at least one lab job directory is required',
  CONTRADICTORY_TOPOLOGY:
    'contradictory topologyScope: isolatedNodeCaches and sharedCache cannot both be true',
});

const SHA_HEX_PATTERN = /^[0-9a-f]{40}$/u;
const PLACEMENT_LOG_EXT = '.log';
const NDJSON_PREFIX = 'test-results-';
const NDJSON_EXT = '.ndjson';
const MERGED_NDJSON_NAME = 'test-results.ndjson';
const EXIT_JSON_NAME = 'exit.json';
const SELECTION_JSON_NAME = 'selection.json';
const LOG_HOST_PATTERN = /^[0-9a-f]{7,40}-[a-z0-9]+-[0-9]+-(.+)\.log$/u;
const TOTALS_LINE_PATTERN =
  /^# test-files total=(\d+) pass=(\d+) fail=(\d+) assertions=(\d+)$/u;
const PLANNED_LINE_PATTERN = /^# test-files planned=(\d+)$/u;

const LOG_HEADER = Object.freeze({
  PLACEMENT_HEAD: 'placement-head=',
  PLACEMENT_PID: 'placement-pid=',
  PLACEMENT_SHELL: 'placement-shell=',
  PLACEMENT_ENV: 'placement-env=',
  PLACEMENT_HOST: 'placement-host=',
  PLACEMENT_RESULTS: 'placement-results=',
});

const GIT_ARGS = Object.freeze({
  HEAD_REV: Object.freeze(['rev-parse', 'HEAD']),
  HEAD_BRANCH: Object.freeze(['symbolic-ref', '--quiet', '--short', 'HEAD']),
  REV_PARSE: 'rev-parse',
  VERIFY: '--verify',
  LS_REMOTE: 'ls-remote',
  COMMIT_SUFFIX: '^{commit}',
  ORIGIN: 'origin',
  HEAD_REF: 'HEAD',
  ORIGIN_MAIN_REF: 'refs/heads/main',
});

const PLACEMENT_ENV_KEYS = Object.freeze({
  MODE: 'mode',
  RETRY: 'retry',
});

const CLI_FLAGS = Object.freeze({
  REPO: '--repo',
  CLAIMED_SHA: '--claimed-sha',
  TARGET_REF: '--target-ref',
  REMOTE: '--remote',
  REMOTE_REF: '--remote-ref',
  ORIGIN_MAIN_REF: '--origin-main-ref',
  REQUIRE_REMOTE_PUSHED: '--require-remote-pushed',
  JOB_DIR: '--job-dir',
  HOST_MANIFEST: '--host-manifest',
  EXPECTED_HOST: '--expected-host',
  CLAIM_KIND: '--claim-kind',
  TOPOLOGY_JSON: '--topology-json',
  REQUIRED_FILES: '--required-files',
  FORMAT: '--format',
  OUT: '--out',
  ALLOW_RETRIES: '--allow-retries',
});

const FORMAT_MODES = Object.freeze({
  JSON: 'json',
  MARKDOWN: 'markdown',
});

const TEXT = Object.freeze({
  UTF8: 'utf8',
  EMPTY: '',
  NEWLINE: '\n',
  COMMA: ',',
  COLON: ':',
  TAB: '\t',
  SLASH: '/',
  DETACHED: 'DETACHED',
  UNAVAILABLE: 'unavailable',
  UNVERIFIED: 'unverified',
  UNKNOWN: 'unknown',
  TYPE_STRING: 'string',
  TYPE_OBJECT: 'object',
});

const LINE_BREAK_PATTERN = /\r?\n/u;
const WHITESPACE_SPLIT_PATTERN = /\s+/u;
const ZERO = 0;
const ONE = 1;
const TWO = 2;
const THREE = 3;
const FOURTH_INDEX = 4;
const TEN = 10;
const EXIT_ADMITTED = 0;
const EXIT_REFUSED = 1;
const EXIT_USAGE_OR_UNAVAILABLE = 2;
const MIN_ISOLATED_NODES = 2;

const REPORT_TITLES = Object.freeze({
  HEADING: '## P6 Lab Evidence & Branch Admission Report',
  META_HEADER: '| Field | Value |',
  META_SEP: '| --- | --- |',
  HOSTS_HEADING: '### Per-Host Execution & Configuration Facts',
  HOSTS_HEADER:
    '| Job | Host | Placement Head | PID | Env | Runtime | Backend | Artifact | Results |',
  HOSTS_SEP: '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  PROBLEMS_HEADING: '### Admission Refusal / Unavailable Reasons',
  PROBLEMS_HEADER: '| Code | Detail |',
  PROBLEMS_SEP: '| --- | --- |',
});

const LABEL = Object.freeze({
  OUTCOME: 'Outcome',
  CLAIMED_SHA: 'Claimed SHA',
  HEAD_REF: 'Observed HEAD',
  TARGET_REF: 'Observed Target Ref',
  REMOTE_STATE: 'Remote Ref State',
  ORIGIN_MAIN: 'Origin Main SHA',
  CLAIM_KIND: 'Claim Kind',
  TOPOLOGY: 'Topology & Cache Isolation',
  TOTALS: 'Verified Totals',
});

function isPlainObject(value) {
  return value !== null && typeof value === TEXT.TYPE_OBJECT && !Array.isArray(value);
}

function isValidSha(value) {
  return typeof value === TEXT.TYPE_STRING && regexTest(SHA_HEX_PATTERN, value);
}

function addProblem(problems, code, detail, extra = {}) {
  problems.push({code, detail, ...extra});
}

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

function inspectGitBranchState(options, problems) {
  const {
    repoRoot,
    claimedSha,
    targetRef = GIT_ARGS.HEAD_REF,
    remote = GIT_ARGS.ORIGIN,
    remoteRef = TEXT.EMPTY,
    originMainRef = GIT_ARGS.ORIGIN_MAIN_REF,
    requireRemotePushed = false,
    gitRunner = runDefaultGit,
  } = options;

  const headRes = gitRunner(repoRoot, GIT_ARGS.HEAD_REV);
  if (headRes.status !== ZERO) {
    const errText = headRes.stderr || headRes.error?.message || TEXT.UNKNOWN;
    addProblem(
      problems,
      PROBLEM_CODE.GIT_STATE_UNAVAILABLE,
      `git rev-parse HEAD failed: ${stringTrim(String(errText))}`,
    );
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

  const headSha = stringTrim(String(headRes.stdout || TEXT.EMPTY));
  const branchRes = gitRunner(repoRoot, GIT_ARGS.HEAD_BRANCH);
  const headBranch = branchRes.status === ZERO ?
    stringTrim(String(branchRes.stdout || TEXT.EMPTY)) : TEXT.DETACHED;

  const targetRes = gitRunner(
    repoRoot,
    [GIT_ARGS.REV_PARSE, GIT_ARGS.VERIFY, `${targetRef}${GIT_ARGS.COMMIT_SUFFIX}`],
  );
  const targetRefSha = targetRes.status === ZERO ?
    stringTrim(String(targetRes.stdout || TEXT.EMPTY)) : TEXT.UNAVAILABLE;

  if (targetRefSha !== claimedSha) {
    addProblem(
      problems,
      PROBLEM_CODE.TARGET_REF_SHA_MISMATCH,
      `target ref ${targetRef} resolved to ${targetRefSha}, expected ${claimedSha}`,
    );
  }

  const refToCheck = remoteRef.length > ZERO ? remoteRef : targetRef;
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
    available: true,
    headSha,
    headBranch,
    targetRef,
    targetRefSha,
    remote,
    remoteRef: refToCheck,
    remoteState: remoteInfo.remoteState,
    remoteSha: remoteInfo.remoteSha,
    remoteDetail: remoteInfo.detail,
    originMainSha: mainSha.length > ZERO ? mainSha : TEXT.UNAVAILABLE,
    pushed,
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

function parsePlacementLogContent(content, defaultHost) {
  const lines = stringSplit(content, LINE_BREAK_PATTERN);
  const results = [];
  const parseErrors = [];
  let placementHead = TEXT.EMPTY;
  let placementPid = null;
  let placementShell = null;
  let placementEnvRaw = TEXT.EMPTY;
  let placementHost = defaultHost;
  let plannedCount = null;
  let summaryTotals = null;

  for (const line of lines) {
    if (stringStartsWith(line, LOG_HEADER.PLACEMENT_HEAD)) {
      placementHead = stringTrim(stringSlice(line, LOG_HEADER.PLACEMENT_HEAD.length));
    } else if (stringStartsWith(line, LOG_HEADER.PLACEMENT_PID)) {
      placementPid = Number.parseInt(stringSlice(line, LOG_HEADER.PLACEMENT_PID.length), TEN);
    } else if (stringStartsWith(line, LOG_HEADER.PLACEMENT_SHELL)) {
      placementShell = Number.parseInt(stringSlice(line, LOG_HEADER.PLACEMENT_SHELL.length), TEN);
    } else if (stringStartsWith(line, LOG_HEADER.PLACEMENT_HOST)) {
      placementHost = stringTrim(stringSlice(line, LOG_HEADER.PLACEMENT_HOST.length));
    } else if (stringStartsWith(line, LOG_HEADER.PLACEMENT_ENV)) {
      placementEnvRaw = stringTrim(stringSlice(line, LOG_HEADER.PLACEMENT_ENV.length));
    } else if (stringStartsWith(line, LOG_HEADER.PLACEMENT_RESULTS)) {
      const jsonText = stringSlice(line, LOG_HEADER.PLACEMENT_RESULTS.length);
      try {
        results.push(JSON.parse(jsonText));
      } catch (error) {
        parseErrors.push(`malformed placement-results JSON: ${String(error?.message ?? error)}`);
      }
    } else {
      const plannedMatch = regexExec(PLANNED_LINE_PATTERN, line);
      if (plannedMatch) {
        plannedCount = Number.parseInt(plannedMatch[ONE], TEN);
      } else {
        const totalsMatch = regexExec(TOTALS_LINE_PATTERN, line);
        if (totalsMatch) {
          summaryTotals = {
            total: Number.parseInt(totalsMatch[ONE], TEN),
            pass: Number.parseInt(totalsMatch[TWO], TEN),
            fail: Number.parseInt(totalsMatch[THREE], TEN),
            assertions: Number.parseInt(totalsMatch[FOURTH_INDEX], TEN),
          };
        }
      }
    }
  }

  return {
    host: placementHost,
    placementHead,
    placementPid,
    placementShell,
    placementEnvRaw,
    placementEnv: parsePlacementEnv(placementEnvRaw),
    plannedCount,
    summaryTotals,
    results,
    parseErrors,
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

function summarizeResultsMatch(logResults, ndjsonRows) {
  if (logResults.length !== ndjsonRows.length) {
    return `log placement-results count (${logResults.length}) != ndjson count (${ndjsonRows.length})`;
  }
  for (let i = ZERO; i < logResults.length; i += ONE) {
    const a = logResults[i];
    const b = ndjsonRows[i];
    if (a?.file !== b?.file || a?.ok !== b?.ok || a?.assertions !== b?.assertions ||
        a?.attempt !== b?.attempt || Boolean(a?.retriedOnce) !== Boolean(b?.retriedOnce)) {
      return `result mismatch at entry ${i}: log=${JSON.stringify(a)} ndjson=${JSON.stringify(b)}`;
    }
  }
  return TEXT.EMPTY;
}

function validateHostExecutionFacts(hostRecord, options, problems) {
  const {claimedSha, allowRetries = false, jobName} = options;
  const {host, parsedLog, ndjsonRows} = hostRecord;
  const foundHead = parsedLog.placementHead || TEXT.UNAVAILABLE;

  if (!isValidSha(parsedLog.placementHead) || parsedLog.placementHead !== claimedSha) {
    addProblem(
      problems,
      PROBLEM_CODE.EXECUTION_SHA_MISMATCH,
      `${jobName}/${host}: placement-head=${foundHead} != ${claimedSha}`,
      {host, job: jobName},
    );
  }

  for (const err of parsedLog.parseErrors) {
    addProblem(problems, PROBLEM_CODE.JOB_FAILED, `${jobName}/${host}: ${err}`, {host, job: jobName});
  }

  if (parsedLog.summaryTotals !== null) {
    const {total, pass, fail, assertions} = parsedLog.summaryTotals;
    if (fail !== ZERO || pass !== total || (total > ZERO && assertions <= ZERO)) {
      addProblem(
        problems,
        PROBLEM_CODE.PLACEMENT_SUMMARY_FAILED,
        `${jobName}/${host}: summary total=${total} pass=${pass} fail=${fail} assertions=${assertions}`,
        {host, job: jobName},
      );
    }
  }

  if (parsedLog.results.length > ZERO && ndjsonRows !== null) {
    const mismatch = summarizeResultsMatch(parsedLog.results, ndjsonRows);
    if (mismatch.length > ZERO) {
      addProblem(
        problems,
        PROBLEM_CODE.RESULTS_MISMATCH,
        `${jobName}/${host}: ${mismatch}`,
        {host, job: jobName},
      );
    }
  }

  const effectiveRows = ndjsonRows !== null ? ndjsonRows : parsedLog.results;
  for (const row of effectiveRows) {
    if (row?.ok !== true || !(Number(row?.assertions) > ZERO)) {
      addProblem(
        problems,
        PROBLEM_CODE.TEST_CASE_FAILED,
        `${jobName}/${host}: file=${row?.file || TEXT.UNKNOWN} ok=${row?.ok} assertions=${row?.assertions}`,
        {host, job: jobName, file: row?.file},
      );
    }
    if (!allowRetries && (row?.retriedOnce === true || Number(row?.attempt) > ONE)) {
      addProblem(
        problems,
        PROBLEM_CODE.RETRY_POLICY_VIOLATED,
        `${jobName}/${host}: retry observed for ${row?.file || TEXT.UNKNOWN} (attempt=${row?.attempt})`,
        {host, job: jobName, file: row?.file},
      );
    }
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

function inspectLabJobDirectory(jobDir, options, problems) {
  const jobName = path.basename(jobDir);
  if (!fs.existsSync(jobDir)) {
    addProblem(problems, PROBLEM_CODE.JOBS_MISSING, `job directory does not exist: ${jobDir}`);
    return null;
  }

  const exitRead = readJsonArtifact(jobDir, path.join(jobDir, EXIT_JSON_NAME));
  if (!exitRead.ok) {
    addProblem(
      problems,
      exitRead.missing ? PROBLEM_CODE.JOB_EXIT_MISSING : PROBLEM_CODE.JOB_PATH_UNSAFE,
      `${jobName}: ${exitRead.reason}`,
    );
  } else if (!Number.isInteger(exitRead.value?.status) || exitRead.value.status !== ZERO) {
    addProblem(
      problems,
      PROBLEM_CODE.JOB_FAILED,
      `${jobName}: exit.json status=${exitRead.value?.status}`,
    );
  }

  const selectionRead = readJsonArtifact(jobDir, path.join(jobDir, SELECTION_JSON_NAME));
  let plannedFiles = [];
  if (!selectionRead.ok) {
    addProblem(problems, PROBLEM_CODE.SELECTION_MISSING, `${jobName}: ${selectionRead.reason}`);
  } else {
    if (selectionRead.value?.sha !== options.claimedSha) {
      addProblem(
        problems,
        PROBLEM_CODE.SELECTION_SHA_MISMATCH,
        `${jobName}: selection.json sha=${selectionRead.value?.sha} != ${options.claimedSha}`,
      );
    }
    if (Array.isArray(selectionRead.value?.files)) {
      plannedFiles = [...selectionRead.value.files];
    }
  }

  const dirEntries = fs.readdirSync(jobDir);
  const ndjsonByHost = readJobNdjsonByHost(jobDir, jobName, dirEntries, problems);
  const knownHosts = [...ndjsonByHost.keys()];
  const logFiles = arrayFilter(dirEntries, (name) => stringEndsWith(name, PLACEMENT_LOG_EXT));
  if (logFiles.length === ZERO) {
    addProblem(problems, PROBLEM_CODE.PLACEMENT_LOG_MISSING, `${jobName}: no placement *.log files`);
  }

  const hosts = [];
  const executedFiles = new Map();
  for (const logFile of logFiles) {
    const rawLog = readVerifiedFile(jobDir, path.join(jobDir, logFile));
    if (!rawLog.ok) {
      addProblem(problems, PROBLEM_CODE.JOB_PATH_UNSAFE, `${jobName}/${logFile}: ${rawLog.reason}`);
      continue;
    }
    const defaultHost = inferHostFromLogName(logFile, knownHosts);
    const parsedLog = parsePlacementLogContent(rawLog.content, defaultHost);
    const ndjsonRows = ndjsonByHost.has(parsedLog.host) ?
      ndjsonByHost.get(parsedLog.host) : null;
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

  if (ndjsonByHost.size === ZERO && fs.existsSync(path.join(jobDir, MERGED_NDJSON_NAME))) {
    const mergedRaw = readVerifiedFile(jobDir, path.join(jobDir, MERGED_NDJSON_NAME));
    if (mergedRaw.ok) {
      const mergedParsed = parseNdjsonContent(mergedRaw.content);
      for (const row of mergedParsed.rows) {
        if (row?.file && !executedFiles.has(row.file)) executedFiles.set(row.file, row);
      }
    }
  }

  return {
    jobName,
    jobDir,
    exitStatus: exitRead.ok ? exitRead.value?.status : null,
    finishedAt: exitRead.ok ? exitRead.value?.finishedAt || TEXT.EMPTY : TEXT.EMPTY,
    selectionSha: selectionRead.ok ? selectionRead.value?.sha || TEXT.EMPTY : TEXT.EMPTY,
    plannedFiles,
    hosts,
    executedFiles,
  };
}

export {
  ARTIFACT_STATUS,
  CLAIM_KIND,
  CLI_FLAGS,
  EXIT_ADMITTED,
  EXIT_REFUSED,
  EXIT_USAGE_OR_UNAVAILABLE,
  FORMAT_MODES,
  LAB_EVIDENCE_SCHEMA,
  LABEL,
  MESSAGE,
  MIN_ISOLATED_NODES,
  ONE,
  OUTCOME,
  PLACEMENT_ENV_KEYS,
  PROBLEM_CODE,
  REMOTE_STATE,
  REPORT_TITLES,
  TEXT,
  TWO,
  ZERO,
  addProblem,
  arrayEvery,
  arrayFilter,
  arrayJoin,
  arrayMap,
  arraySome,
  inspectGitBranchState,
  inspectLabJobDirectory,
  isPlainObject,
  isValidSha,
  stringSplit,
  stringToLowerCase,
  stringTrim,
};
