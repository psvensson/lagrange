/**
 * Release-candidate identity shared by the release-0-2 verification
 * producer and the two receipt-recording helpers: the exact git HEAD sha,
 * the boot-scope source fingerprint (src/diagnostics/source-fingerprint.js,
 * the same digest the node stamps as SRC_FINGERPRINT), and the five places
 * the 0.2.0 version literal lives. Helpers record this identity as a fact;
 * only the producer decides whether a receipt's identity matches.
 */

import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {
  computeSourceFingerprint,
} from '../../src/diagnostics/source-fingerprint.js';
import {CLI_VERSION} from '../../src/cli/cli-constants.js';
import {ENTRYPOINT_VERSION} from '../../src/constants/entrypoint.js';
import {RELEASE_VERSION} from './release-0-2-verification-constants.js';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const SOURCE_TREE = 'src';
const PACKAGE_JSON = 'package.json';
const CHART_YAML = 'charts/lagrange-node/Chart.yaml';
const TEXT_ENCODING = 'utf8';
const GIT_BINARY = 'git';
const GIT_HEAD_ARGS = Object.freeze(['rev-parse', 'HEAD']);
// Porcelain status of the release content: Solver bookkeeping under solve/
// is excluded exactly as release-content-digest.js excludes it.
const GIT_STATUS_ARGS = Object.freeze([
  'status', '--porcelain', '--', '.', ':!solve',
]);
const CHART_VERSION_PATTERN = /^version:\s*"?([^"\s]+)"?\s*$/mu;
const CHART_APP_VERSION_PATTERN = /^appVersion:\s*"?([^"\s]+)"?\s*$/mu;
const VERSION_ABSENT = '';

const stringTrim = Function.call.bind(String.prototype.trim);

function readChartVersion(chartText, pattern) {
  const match = pattern.exec(chartText);
  return match ? match[1] : VERSION_ABSENT;
}

function resolveHeadSha(root) {
  return stringTrim(
    execFileSync(GIT_BINARY, GIT_HEAD_ARGS, {cwd: root})
      .toString(TEXT_ENCODING),
  );
}

// True iff no tracked release-content path is modified, staged, or
// untracked; a receipt recorded on a dirty tree cannot be bound to HEAD.
function resolveTreeClean(root) {
  return stringTrim(
    execFileSync(GIT_BINARY, GIT_STATUS_ARGS, {cwd: root})
      .toString(TEXT_ENCODING),
  ) === VERSION_ABSENT;
}

// The version sources that must agree with RELEASE_VERSION before any
// release verification scenario may pass (RELEASE.md "Bump the version").
function resolveVersionSources(root) {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(root, PACKAGE_JSON), TEXT_ENCODING),
  );
  const chartText = fs.readFileSync(path.join(root, CHART_YAML), TEXT_ENCODING);
  return {
    packageJson: String(packageJson.version || VERSION_ABSENT),
    cli: CLI_VERSION,
    entrypoint: ENTRYPOINT_VERSION,
    chart: readChartVersion(chartText, CHART_VERSION_PATTERN),
    chartApp: readChartVersion(chartText, CHART_APP_VERSION_PATTERN),
  };
}

function versionSourcesConsistent(sources) {
  let consistent = true;
  for (const value of Object.values(sources)) {
    consistent = consistent && value === RELEASE_VERSION;
  }
  return consistent;
}

/**
 * Resolve the current release-candidate identity of a repository root.
 * @param {string} [root] repository root (defaults to this checkout)
 * @return {Promise<Object>} {headSha, treeClean, sourceFingerprint,
 *   releaseVersion, versionSources, versionConsistent}
 */
async function resolveReleaseCandidateIdentity(root = REPO_ROOT) {
  const versionSources = resolveVersionSources(root);
  return {
    headSha: resolveHeadSha(root),
    treeClean: resolveTreeClean(root),
    sourceFingerprint:
      await computeSourceFingerprint(path.join(root, SOURCE_TREE)),
    releaseVersion: RELEASE_VERSION,
    versionSources,
    versionConsistent: versionSourcesConsistent(versionSources),
  };
}

export {
  REPO_ROOT,
  resolveReleaseCandidateIdentity,
  versionSourcesConsistent,
};
