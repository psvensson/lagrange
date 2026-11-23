// Canonical constants, vocabularies, patterns, and captured intrinsics for P6
// lab-evidence reports.

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
const numberIsFinite = Number.isFinite;

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
  UNBACKED_MERGED_RESULT: 'unbacked_merged_result',
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
  TYPE_NUMBER: 'number',
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

function isSingleAttempt(attempt) {
  return typeof attempt === TEXT.TYPE_NUMBER &&
    numberIsFinite(attempt) &&
    attempt >= ZERO &&
    attempt <= ONE;
}

function isPositiveFiniteNumber(value) {
  return typeof value === TEXT.TYPE_NUMBER &&
    numberIsFinite(value) &&
    value > ZERO;
}

function isAdmissibleExecutionRow(row, allowRetries) {
  if (!isPlainObject(row)) return false;
  if (row.ok !== true || !isPositiveFiniteNumber(row.assertions)) return false;
  if (allowRetries) return true;
  return row.retriedOnce === false && isSingleAttempt(row.attempt);
}

export {
  ARTIFACT_STATUS,
  CLAIM_KIND,
  CLI_FLAGS,
  EXIT_ADMITTED,
  EXIT_JSON_NAME,
  EXIT_REFUSED,
  EXIT_USAGE_OR_UNAVAILABLE,
  FORMAT_MODES,
  FOURTH_INDEX,
  GIT_ARGS,
  LAB_EVIDENCE_SCHEMA,
  LABEL,
  LINE_BREAK_PATTERN,
  LOG_HEADER,
  LOG_HOST_PATTERN,
  MERGED_NDJSON_NAME,
  MESSAGE,
  MIN_ISOLATED_NODES,
  NDJSON_EXT,
  NDJSON_PREFIX,
  ONE,
  OUTCOME,
  PLACEMENT_ENV_KEYS,
  PLACEMENT_LOG_EXT,
  PLANNED_LINE_PATTERN,
  PROBLEM_CODE,
  REMOTE_STATE,
  REPORT_TITLES,
  SELECTION_JSON_NAME,
  TEN,
  TEXT,
  THREE,
  TOTALS_LINE_PATTERN,
  TWO,
  WHITESPACE_SPLIT_PATTERN,
  ZERO,
  addProblem,
  arrayEvery,
  arrayFilter,
  arrayJoin,
  arrayMap,
  arraySome,
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
  stringToLowerCase,
  stringTrim,
};
