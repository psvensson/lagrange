/**
 * Record the GitHub `ci / gate` job conclusion for one exact commit sha.
 *
 *   node scripts/checks/record-github-gate-receipt.js --sha <sha> \
 *     [--repo <owner/name>] [--out <path>]
 *
 * Queries `gh api repos/<owner>/<name>/actions/runs?head_sha=<sha>` (the
 * workflow runs, which carry the workflow file path) and each run's
 * `/actions/runs/<id>/jobs`, then writes
 * test-output/reports/release-gate-receipts/github-ci-gate.json recording
 * EVERY job named `gate` found for that sha under its own honest workflow
 * label (full-gate.yml also owns a job id `gate`), and as `gateJob` the
 * newest completed one: workflowName, workflowPath, runId, jobId,
 * conclusion, status, completedAt, headSha, htmlUrl. The receipt is a fact;
 * whether it satisfies the release gate (the ci.yml gate job concluded
 * success on the exact current HEAD) is decided only by
 * run-release-0-2-verification-scenarios.js. Both queries are injectable so
 * the witness never touches the network. The porcelain-clean state of the
 * recording tree is recorded as `treeClean`.
 */

import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {
  REPO_ROOT,
  resolveReleaseCandidateIdentity,
} from './release-candidate-identity.js';
import {
  GITHUB_GATE_RECEIPT_FILENAME,
  GITHUB_GATE_RECEIPT_SCHEMA,
  GITHUB_REQUIRED_CHECK,
  RELEASE_GATE_RECEIPT_DIR,
  VERIFICATION_ARG,
} from './release-0-2-verification-constants.js';

const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);

const ARGV_COMMAND_OFFSET = 2;
const NOT_FOUND = -1;
const TEXT_ENCODING = 'utf8';
const PACKAGE_JSON = 'package.json';
const GH_BINARY = 'gh';
const GH_API_ARG = 'api';
const REPOS_PATH_PREFIX = 'repos/';
const ACTIONS_RUNS_SEGMENT = '/actions/runs';
const RUNS_BY_SHA_QUERY_PREFIX = '?head_sha=';
const RUNS_BY_SHA_QUERY_SUFFIX = '&per_page=50';
const RUN_JOBS_SUFFIX = '/jobs?per_page=100';
const PATH_SEPARATOR = '/';
const REPOSITORY_URL_PATTERN = /github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?/u;
const EMPTY = '';
const NEWLINE = '\n';
const EXIT_OK = 0;
const EXIT_USAGE = 2;
const USAGE =
  'usage: record-github-gate-receipt --sha <sha> [--repo <owner/name>] ' +
  '[--out <path>]' + NEWLINE;
const RECEIPT_LINE_PREFIX = 'receipt: ';
const ABSENT_GATE_JOB = Object.freeze({
  found: false,
  name: GITHUB_REQUIRED_CHECK.JOB,
  workflowName: EMPTY,
  workflowPath: EMPTY,
  runId: 0,
  jobId: 0,
  conclusion: EMPTY,
  status: EMPTY,
  completedAt: EMPTY,
  headSha: EMPTY,
  htmlUrl: EMPTY,
});

function flagValue(argv, flag) {
  const index = arrayIndexOf(argv, flag);
  return index !== NOT_FOUND && argv[index + 1] ? argv[index + 1] : EMPTY;
}

function parseGithubRepository(url) {
  const match = REPOSITORY_URL_PATTERN.exec(String(url || EMPTY));
  return match ? match[1] + PATH_SEPARATOR + match[2] : EMPTY;
}

function repositoryFromPackageJson(root) {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(root, PACKAGE_JSON), TEXT_ENCODING),
  );
  return parseGithubRepository(packageJson?.repository?.url);
}

function workflowRunsApiPath(repository, sha) {
  return REPOS_PATH_PREFIX + repository + ACTIONS_RUNS_SEGMENT +
    RUNS_BY_SHA_QUERY_PREFIX + sha + RUNS_BY_SHA_QUERY_SUFFIX;
}

function runJobsApiPath(repository, runId) {
  return REPOS_PATH_PREFIX + repository + ACTIONS_RUNS_SEGMENT +
    PATH_SEPARATOR + runId + RUN_JOBS_SUFFIX;
}

function ghApi(apiPath) {
  return JSON.parse(
    execFileSync(GH_BINARY, [GH_API_ARG, apiPath], {encoding: TEXT_ENCODING}),
  );
}

function queryWorkflowRunsViaGh(repository, sha) {
  return ghApi(workflowRunsApiPath(repository, sha));
}

function queryRunJobsViaGh(repository, runId) {
  return ghApi(runJobsApiPath(repository, runId));
}

// The recorded projection of one `gate` job, labelled by the workflow run
// that owns it: only the fields the producer's exact-sha decision reads.
function projectGateJob(run, job) {
  return {
    found: true,
    name: String(job.name),
    workflowName: String(run.name || EMPTY),
    workflowPath: String(run.path || EMPTY),
    runId: Number(run.id) || 0,
    jobId: Number(job.id) || 0,
    conclusion: String(job.conclusion || EMPTY),
    status: String(job.status || EMPTY),
    completedAt: String(job.completed_at || EMPTY),
    headSha: String(job.head_sha || run.head_sha || EMPTY),
    htmlUrl: String(job.html_url || EMPTY),
  };
}

// Every job named `gate` across every workflow run of the sha, each under
// its own honest workflow label.
function collectGateJobs(repository, sha, queries) {
  const runsPayload = queries.queryWorkflowRuns(repository, sha);
  const runs = Array.isArray(runsPayload?.workflow_runs) ?
    runsPayload.workflow_runs :
    [];
  const gateJobs = [];
  for (const run of runs) {
    const jobsPayload = queries.queryRunJobs(repository, Number(run.id) || 0);
    const jobs = Array.isArray(jobsPayload?.jobs) ? jobsPayload.jobs : [];
    for (const job of jobs) {
      if (job?.name === GITHUB_REQUIRED_CHECK.JOB) {
        gateJobs.push(projectGateJob(run, job));
      }
    }
  }
  return {workflowRunCount: runs.length, gateJobs};
}

function newerGateJob(current, candidate) {
  return candidate.completedAt >= current.completedAt ? candidate : current;
}

// The newest COMPLETED gate job of any workflow: what actually ran last for
// the sha. The derivation, not this helper, requires it to be ci.yml's.
function selectNewestCompletedGateJob(gateJobs) {
  let selected = ABSENT_GATE_JOB;
  for (const job of gateJobs) {
    if (job.status !== GITHUB_REQUIRED_CHECK.COMPLETED_STATUS) continue;
    selected = selected === ABSENT_GATE_JOB ?
      job :
      newerGateJob(selected, job);
  }
  return selected;
}

/**
 * Build the GitHub gate receipt from injected workflow-run and job
 * queries (pure apart from the queries).
 * @param {Object} input {sha, repository, queries: {queryWorkflowRuns,
 *   queryRunJobs}, recordedAt, treeClean}
 * @return {Object} the receipt
 */
function buildGithubGateReceipt(input) {
  const collected = collectGateJobs(input.repository, input.sha, input.queries);
  return {
    schema: GITHUB_GATE_RECEIPT_SCHEMA,
    sha: input.sha,
    repository: input.repository,
    requiredCheck: GITHUB_REQUIRED_CHECK.DISPLAY_NAME,
    requiredWorkflowPath: GITHUB_REQUIRED_CHECK.WORKFLOW_PATH,
    query: workflowRunsApiPath(input.repository, input.sha),
    recordedAt: input.recordedAt,
    treeClean: input.treeClean === true,
    workflowRunCount: collected.workflowRunCount,
    gateJobs: collected.gateJobs,
    gateJob: selectNewestCompletedGateJob(collected.gateJobs),
  };
}

/**
 * Query the workflow runs and jobs for one sha and write the receipt.
 * @param {Object} options {sha, repository, outPath, queryWorkflowRuns,
 *   queryRunJobs, recordedAt, treeClean}
 * @return {Promise<Object>} {receipt, receiptPath}
 */
async function recordGithubGateReceipt(options) {
  const identity = await resolveReleaseCandidateIdentity(REPO_ROOT);
  const receipt = buildGithubGateReceipt({
    sha: options.sha,
    repository: options.repository,
    queries: {
      queryWorkflowRuns: options.queryWorkflowRuns || queryWorkflowRunsViaGh,
      queryRunJobs: options.queryRunJobs || queryRunJobsViaGh,
    },
    recordedAt: options.recordedAt || new Date().toISOString(),
    treeClean: identity.treeClean,
  });
  const receiptPath = path.resolve(REPO_ROOT, options.outPath);
  fs.mkdirSync(path.dirname(receiptPath), {recursive: true});
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + NEWLINE);
  return {receipt, receiptPath};
}

async function main(argv) {
  const sha = flagValue(argv, VERIFICATION_ARG.SHA);
  const repoFlag = flagValue(argv, VERIFICATION_ARG.REPO);
  const repository = repoFlag === EMPTY ?
    repositoryFromPackageJson(REPO_ROOT) :
    repoFlag;
  if (sha === EMPTY || repository === EMPTY) {
    process.stderr.write(USAGE);
    return EXIT_USAGE;
  }
  const outFlag = flagValue(argv, VERIFICATION_ARG.OUT);
  const outPath = outFlag === EMPTY ?
    path.join(RELEASE_GATE_RECEIPT_DIR, GITHUB_GATE_RECEIPT_FILENAME) :
    outFlag;
  const {receiptPath} =
    await recordGithubGateReceipt({sha, repository, outPath});
  process.stdout.write(
    RECEIPT_LINE_PREFIX + path.relative(REPO_ROOT, receiptPath) + NEWLINE,
  );
  return EXIT_OK;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(ARGV_COMMAND_OFFSET));
}

export {buildGithubGateReceipt, recordGithubGateReceipt};
