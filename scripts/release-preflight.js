/**
 * Pre-tag release preflight (`npm run release:preflight`).
 *
 *   node scripts/release-preflight.js [--json] [--remote <name>]
 *
 * The whole release exit, as five facts about the current checkout, none of
 * which this script changes:
 *   1. the release content is clean (porcelain status outside solve/);
 *   2. HEAD is exactly <remote>/main after a fetch;
 *   3. the `ci` workflow's gate job concluded success for that exact sha;
 *   4. every version literal (package.json, package-lock.json, CLI,
 *      entrypoint, Helm chart version and appVersion) agrees and the
 *      changelog carries a non-empty section for that version;
 *   5. no local or remote tag exists for the version yet.
 * It prints the two commands that perform the release (an annotated tag and
 * its push, which starts the release.yml workflow: the only artifact
 * publisher) and never runs them. Everything after the tag is proven by the
 * workflow on the tagged sha, so nothing is re-run here.
 */

import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {CLI_VERSION} from '../src/cli/cli-constants.js';
import {ENTRYPOINT_VERSION} from '../src/constants/entrypoint.js';
import {extractChangelogSection} from './release-notes.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEXT_ENCODING = 'utf8';
const ARGV_OFFSET = 2;
const EXIT_OK = 0;
const EXIT_BLOCKED = 1;
const DEFAULT_REMOTE = 'origin';
const MAIN_BRANCH = 'main';
const TAG_PREFIX = 'v';
const PACKAGE_JSON = 'package.json';
const PACKAGE_LOCK = 'package-lock.json';
const CHANGELOG = 'CHANGELOG.md';
const CHART_YAML = 'charts/lagrange-node/Chart.yaml';
const CI_WORKFLOW_PATH = '.github/workflows/ci.yml';
const RUN_STATUS_COMPLETED = 'completed';
const RUN_CONCLUSION_SUCCESS = 'success';
const RUNS_PER_PAGE = 50;
const GIT_BINARY = 'git';
const GH_BINARY = 'gh';
const SOLVE_EXCLUSION = ':!solve';
const LINE_SEPARATOR = '\n';
const ABSENT_LABEL = 'absent';
const GIT_FETCH_ARGS = Object.freeze(['fetch', '--quiet']);
const GIT_REV_PARSE = 'rev-parse';
const GIT_HEAD_REF = 'HEAD';
const GIT_STATUS_ARGS = Object.freeze([
  'status', '--porcelain', '--', '.', SOLVE_EXCLUSION,
]);
const GIT_TAG_LIST_ARGS = Object.freeze(['tag', '--list']);
const GIT_LS_REMOTE_TAGS_ARGS = Object.freeze(['ls-remote', '--tags']);
const GH_API_ARGS = Object.freeze(['api']);
const READY_HINT =
  'release with (the tag workflow proves and publishes the rest):';
const BLOCKED_HINT = 'fix the failing checks; nothing was tagged';
const CHART_VERSION_PATTERN = /^version:\s*"?([^"\s]+)"?\s*$/mu;
const CHART_APP_VERSION_PATTERN = /^appVersion:\s*"?([^"\s]+)"?\s*$/mu;
const REPOSITORY_URL_PATTERN = /github\.com[/:]([^/]+\/[^/.]+)/u;
const VERSION_ABSENT = '';
const JSON_INDENT = 2;
const OK_MARK = 'ok  ';
const FAIL_MARK = 'FAIL';

const ARG = Object.freeze({JSON: '--json', REMOTE: '--remote'});

const CHECK = Object.freeze({
  CLEAN_TREE: 'clean_release_content',
  HEAD_IS_REMOTE_MAIN: 'head_is_remote_main',
  CI_GATE_GREEN: 'ci_gate_green_on_exact_sha',
  VERSIONS_AGREE: 'versions_and_changelog_agree',
  TAG_ABSENT: 'tag_absent',
});

function parseArguments(argv) {
  const options = {json: false, remote: DEFAULT_REMOTE};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === ARG.JSON) {
      options.json = true;
    } else if (argv[index] === ARG.REMOTE) {
      options.remote = argv[index + 1] || DEFAULT_REMOTE;
      index += 1;
    }
  }
  return options;
}

function readChartVersion(chartText, pattern) {
  const match = pattern.exec(chartText);
  return match ? match[1] : VERSION_ABSENT;
}

function resolveRepository(packageJson) {
  const url = String(packageJson?.repository?.url || packageJson?.repository ||
    VERSION_ABSENT);
  const match = REPOSITORY_URL_PATTERN.exec(url);
  return match ? match[1] : VERSION_ABSENT;
}

function readJson(root, relativePath) {
  return JSON.parse(
    fs.readFileSync(path.join(root, relativePath), TEXT_ENCODING),
  );
}

function readText(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), TEXT_ENCODING);
}

function gitViaChild(root) {
  return (args) => execFileSync(GIT_BINARY, args, {cwd: root})
    .toString(TEXT_ENCODING).trim();
}

function ghViaChild(root) {
  return (args) => execFileSync(GH_BINARY, args, {cwd: root})
    .toString(TEXT_ENCODING);
}

function changelogSectionState(changelogText, version) {
  try {
    extractChangelogSection(changelogText, version);
    return {present: true, problem: VERSION_ABSENT};
  } catch (error) {
    return {present: false, problem: error.message};
  }
}

/**
 * Gather the facts the checks read. Injectable git/gh for the witness.
 * @param {Object} options
 * @return {Object}
 */
function gatherReleaseFacts({
  root = REPO_ROOT,
  remote = DEFAULT_REMOTE,
  git = gitViaChild(root),
  gh = ghViaChild(root),
  sourceVersions = {cli: CLI_VERSION, entrypoint: ENTRYPOINT_VERSION},
} = {}) {
  const packageJson = readJson(root, PACKAGE_JSON);
  const packageLock = readJson(root, PACKAGE_LOCK);
  const chartText = readText(root, CHART_YAML);
  const version = String(packageJson.version || VERSION_ABSENT);
  const tag = `${TAG_PREFIX}${version}`;
  const repository = resolveRepository(packageJson);
  git([...GIT_FETCH_ARGS, remote]);
  const headSha = git([GIT_REV_PARSE, GIT_HEAD_REF]);
  const runsJson = gh([...GH_API_ARGS,
    `repos/${repository}/actions/runs?head_sha=${headSha}` +
    `&per_page=${RUNS_PER_PAGE}`]);
  return {
    version,
    tag,
    remote,
    repository,
    headSha,
    remoteMainSha: git([GIT_REV_PARSE, `${remote}/${MAIN_BRANCH}`]),
    statusLines: git([...GIT_STATUS_ARGS])
      .split(LINE_SEPARATOR).map((line) => line.trim()).filter(Boolean),
    workflowRuns: JSON.parse(runsJson).workflow_runs || [],
    versionSources: {
      packageJson: version,
      packageLock: String(packageLock.version || VERSION_ABSENT),
      cli: sourceVersions.cli,
      entrypoint: sourceVersions.entrypoint,
      chart: readChartVersion(chartText, CHART_VERSION_PATTERN),
      chartApp: readChartVersion(chartText, CHART_APP_VERSION_PATTERN),
    },
    changelog: changelogSectionState(readText(root, CHANGELOG), version),
    localTags: git([...GIT_TAG_LIST_ARGS, tag])
      .split(LINE_SEPARATOR).filter(Boolean),
    remoteTagLines: git([...GIT_LS_REMOTE_TAGS_ARGS, remote, `refs/tags/${tag}`])
      .split(LINE_SEPARATOR).filter(Boolean),
  };
}

function ciGateRun(facts) {
  return facts.workflowRuns.find((run) =>
    run.path === CI_WORKFLOW_PATH &&
    run.head_sha === facts.headSha &&
    run.status === RUN_STATUS_COMPLETED &&
    run.conclusion === RUN_CONCLUSION_SUCCESS) || null;
}

function versionDisagreements(facts) {
  return Object.entries(facts.versionSources)
    .filter(([, value]) => value !== facts.version)
    .map(([source, value]) => `${source}=${value || ABSENT_LABEL}`);
}

/**
 * The five checks over gathered facts. Pure.
 * @param {Object} facts
 * @return {{ok: boolean, version: string, headSha: string, checks: Object[],
 *   commands: string[]}}
 */
function evaluateReleasePreflight(facts) {
  const gateRun = ciGateRun(facts);
  const disagreements = versionDisagreements(facts);
  const checks = [
    {
      id: CHECK.CLEAN_TREE,
      ok: facts.statusLines.length === 0,
      detail: facts.statusLines.length === 0 ?
        'release content clean' :
        `${facts.statusLines.length} dirty path(s): ` +
        facts.statusLines.join(', '),
    },
    {
      id: CHECK.HEAD_IS_REMOTE_MAIN,
      ok: facts.headSha === facts.remoteMainSha,
      detail: `HEAD ${facts.headSha} vs ${facts.remote}/${MAIN_BRANCH} ` +
        `${facts.remoteMainSha}`,
    },
    {
      id: CHECK.CI_GATE_GREEN,
      ok: gateRun !== null,
      detail: gateRun ?
        `ci gate run ${gateRun.id} succeeded on ${facts.headSha}` :
        `no completed successful ${CI_WORKFLOW_PATH} run for ${facts.headSha}`,
    },
    {
      id: CHECK.VERSIONS_AGREE,
      ok: disagreements.length === 0 && facts.changelog.present,
      detail: [
        disagreements.length === 0 ?
          `all version literals read ${facts.version}` :
          `disagree with ${facts.version}: ${disagreements.join(', ')}`,
        facts.changelog.present ?
          `changelog section [${facts.version}] present` :
          facts.changelog.problem,
      ].join('; '),
    },
    {
      id: CHECK.TAG_ABSENT,
      ok: facts.localTags.length === 0 && facts.remoteTagLines.length === 0,
      detail: facts.localTags.length === 0 && facts.remoteTagLines.length === 0 ?
        `${facts.tag} not yet tagged` :
        `${facts.tag} already exists (local ${facts.localTags.length}, ` +
        `remote ${facts.remoteTagLines.length})`,
    },
  ];
  return {
    ok: checks.every((check) => check.ok),
    version: facts.version,
    headSha: facts.headSha,
    checks,
    // The commands exist only for a READY result; a blocked preflight hands
    // out nothing an operator could paste.
    commands: checks.every((check) => check.ok) ? [
      `git tag -a ${facts.tag} -m "lagrange-server ${facts.version}" ` +
        facts.headSha,
      `git push ${facts.remote} ${facts.tag}`,
    ] : [],
  };
}

function renderPreflight(result) {
  const lines = [
    `release preflight for ${result.version} at ${result.headSha}: ` +
    `${result.ok ? 'READY' : 'BLOCKED'}`,
    ...result.checks.map((check) =>
      `  ${check.ok ? OK_MARK : FAIL_MARK} ${check.id}: ${check.detail}`),
  ];
  if (result.ok) {
    lines.push(READY_HINT, ...result.commands.map((command) => `  ${command}`));
  } else {
    lines.push(BLOCKED_HINT);
  }
  return lines.join(LINE_SEPARATOR);
}

function runReleasePreflight({
  json = false,
  log = (line) => process.stdout.write(`${line}${LINE_SEPARATOR}`),
  ...gatherOptions
} = {}) {
  const result = evaluateReleasePreflight(gatherReleaseFacts(gatherOptions));
  log(json ? JSON.stringify(result, null, JSON_INDENT) : renderPreflight(result));
  return {exitCode: result.ok ? EXIT_OK : EXIT_BLOCKED, result};
}

const isMainModule = process.argv[1] &&
  import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;

if (isMainModule) {
  process.exitCode =
    runReleasePreflight(parseArguments(process.argv.slice(ARGV_OFFSET)))
      .exitCode;
}

export {
  CHECK,
  evaluateReleasePreflight,
  gatherReleaseFacts,
  parseArguments,
  renderPreflight,
  runReleasePreflight,
};
