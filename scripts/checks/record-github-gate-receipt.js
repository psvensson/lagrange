/**
 * Record the GitHub `ci / gate` check conclusion for one exact commit sha.
 *
 *   node scripts/checks/record-github-gate-receipt.js --sha <sha> \
 *     [--repo <owner/name>] [--out <path>]
 *
 * Queries `gh api repos/<owner>/<name>/commits/<sha>/check-runs` (owner and
 * name from package.json `repository`, or --repo) and writes
 * test-output/reports/release-gate-receipts/github-ci-gate.json recording the
 * newest completed `gate` check run of the GitHub Actions app for that sha:
 * its conclusion, status, id, url, completed_at and head_sha. The receipt
 * is a fact; whether it satisfies the release gate (conclusion success on
 * the exact current HEAD) is decided only by
 * run-release-0-2-verification-scenarios.js. The query is injectable so the
 * witness never touches the network.
 */

import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {REPO_ROOT} from './release-candidate-identity.js';
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
const CHECK_RUNS_PATH_PREFIX = 'repos/';
const CHECK_RUNS_COMMITS_SEGMENT = '/commits/';
const CHECK_RUNS_QUERY_SUFFIX = '/check-runs?per_page=100';
const REPOSITORY_URL_PATTERN = /github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?/u;
const REPOSITORY_SEPARATOR = '/';
const EMPTY = '';
const NEWLINE = '\n';
const EXIT_OK = 0;
const EXIT_USAGE = 2;
const USAGE =
  'usage: record-github-gate-receipt --sha <sha> [--repo <owner/name>] ' +
  '[--out <path>]' + NEWLINE;
const RECEIPT_LINE_PREFIX = 'receipt: ';
const ABSENT_CHECK_RUN = Object.freeze({
  found: false,
  name: GITHUB_REQUIRED_CHECK.JOB,
  conclusion: EMPTY,
  status: EMPTY,
  id: 0,
  htmlUrl: EMPTY,
  completedAt: EMPTY,
  headSha: EMPTY,
});

function flagValue(argv, flag) {
  const index = arrayIndexOf(argv, flag);
  return index !== NOT_FOUND && argv[index + 1] ? argv[index + 1] : EMPTY;
}

function parseGithubRepository(url) {
  const match = REPOSITORY_URL_PATTERN.exec(String(url || EMPTY));
  return match ? match[1] + REPOSITORY_SEPARATOR + match[2] : EMPTY;
}

function repositoryFromPackageJson(root) {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(root, PACKAGE_JSON), TEXT_ENCODING),
  );
  return parseGithubRepository(packageJson?.repository?.url);
}

function checkRunsApiPath(repository, sha) {
  return CHECK_RUNS_PATH_PREFIX + repository + CHECK_RUNS_COMMITS_SEGMENT +
    sha + CHECK_RUNS_QUERY_SUFFIX;
}

function queryCheckRunsViaGh(repository, sha) {
  const stdout = execFileSync(
    GH_BINARY,
    [GH_API_ARG, checkRunsApiPath(repository, sha)],
    {encoding: TEXT_ENCODING},
  );
  return JSON.parse(stdout);
}

function isRequiredCheckRun(run) {
  return run?.name === GITHUB_REQUIRED_CHECK.JOB &&
    run?.app?.slug === GITHUB_REQUIRED_CHECK.APP_SLUG;
}

function newerCheckRun(current, candidate) {
  return String(candidate.completed_at || EMPTY) >=
    String(current.completed_at || EMPTY) ?
    candidate :
    current;
}

// The recorded projection of one API check run: only the fields the
// producer's exact-sha decision reads, in the receipt's own vocabulary.
function projectCheckRun(run) {
  return {
    found: true,
    name: String(run.name),
    conclusion: String(run.conclusion || EMPTY),
    status: String(run.status || EMPTY),
    id: Number(run.id) || 0,
    htmlUrl: String(run.html_url || EMPTY),
    completedAt: String(run.completed_at || EMPTY),
    headSha: String(run.head_sha || EMPTY),
  };
}

// The newest completed `gate` check run of the GitHub Actions app; a rerun
// supersedes an earlier attempt on the same sha.
function selectRequiredCheckRun(payload) {
  const runs = Array.isArray(payload?.check_runs) ? payload.check_runs : [];
  const matching = [];
  for (const run of runs) {
    if (isRequiredCheckRun(run)) matching.push(run);
  }
  let selected = ABSENT_CHECK_RUN;
  for (const run of matching) {
    selected = selected === ABSENT_CHECK_RUN ?
      run :
      newerCheckRun(selected, run);
  }
  return selected === ABSENT_CHECK_RUN ?
    ABSENT_CHECK_RUN :
    projectCheckRun(selected);
}

/**
 * Build the GitHub gate receipt from a check-runs API payload (pure).
 * @param {Object} input {sha, repository, payload, recordedAt}
 * @return {Object} the receipt
 */
function buildGithubGateReceipt(input) {
  const runs = Array.isArray(input.payload?.check_runs) ?
    input.payload.check_runs.length :
    0;
  return {
    schema: GITHUB_GATE_RECEIPT_SCHEMA,
    sha: input.sha,
    repository: input.repository,
    query: checkRunsApiPath(input.repository, input.sha),
    requiredCheck: GITHUB_REQUIRED_CHECK.DISPLAY_NAME,
    recordedAt: input.recordedAt,
    checkRunCount: runs,
    checkRun: selectRequiredCheckRun(input.payload),
  };
}

/**
 * Query the check runs for one sha and write the receipt.
 * @param {Object} options {sha, repository, outPath, queryCheckRuns,
 *   recordedAt}
 * @return {Object} {receipt, receiptPath}
 */
function recordGithubGateReceipt(options) {
  const query = options.queryCheckRuns || queryCheckRunsViaGh;
  const receipt = buildGithubGateReceipt({
    sha: options.sha,
    repository: options.repository,
    payload: query(options.repository, options.sha),
    recordedAt: options.recordedAt || new Date().toISOString(),
  });
  const receiptPath = path.resolve(REPO_ROOT, options.outPath);
  fs.mkdirSync(path.dirname(receiptPath), {recursive: true});
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + NEWLINE);
  return {receipt, receiptPath};
}

function main(argv) {
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
  const {receiptPath} = recordGithubGateReceipt({sha, repository, outPath});
  process.stdout.write(
    RECEIPT_LINE_PREFIX + path.relative(REPO_ROOT, receiptPath) + NEWLINE,
  );
  return EXIT_OK;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(ARGV_COMMAND_OFFSET));
}

export {buildGithubGateReceipt, recordGithubGateReceipt};
