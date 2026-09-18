#!/usr/bin/env node

// Per-release notes renderer: makes CHANGELOG.md the single source of the
// "what changed in this release" prose on the GitHub release surface.
//
// release.yml runs this before publication:
//   --mode check  validates the tagged version has a non-empty CHANGELOG
//                 section and matches package.json / Helm version metadata.
//   --mode notes  prints the GitHub release-page body for that version.
//
// Docker Hub has a different owner: the exact tagged root README.md. Do not
// add a Docker Hub rendering mode here; that would recreate a second authored
// product-overview path beside README.md.

import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join, resolve} from 'node:path';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, '..');
const CHANGELOG_PATH = join(REPO_ROOT, 'CHANGELOG.md');
const PACKAGE_JSON_PATH = join(REPO_ROOT, 'package.json');
const CHART_PATH = join(REPO_ROOT, 'charts/lagrange-node/Chart.yaml');

const REPO_URL = 'https://github.com/psvensson/lagrange';
const DOCKERHUB_URL = 'https://hub.docker.com/r/psvensson/lagrange';
const DOCKERHUB_IMAGE = 'docker.io/psvensson/lagrange';

const SECTION_HEADING_PATTERN = /^## \[([^\]]+)\](?:\s*[—–-]+\s*(.*))?\s*$/u;
const LINK_DEFINITION_PATTERN = /^\[[^\]]+\]:\s+\S+\s*$/u;
const CODE_FENCE_PATTERN = /^\s*(```|~~~)/u;
const CHART_VERSION_PATTERN = /^version:\s*"?([^"\s#]+)"?\s*$/mu;
const CHART_APP_VERSION_PATTERN = /^appVersion:\s*"?([^"\s#]+)"?\s*$/mu;

export function assertReleaseVersions(version, packageVersion, chartText) {
  const chartVersion = CHART_VERSION_PATTERN.exec(chartText)?.[1] || '';
  const chartAppVersion = CHART_APP_VERSION_PATTERN.exec(chartText)?.[1] || '';
  const mismatches = [
    ['package.json', packageVersion],
    ['Chart.yaml version', chartVersion],
    ['Chart.yaml appVersion', chartAppVersion],
  ].filter(([, actual]) => actual !== version);
  if (mismatches.length > 0) {
    const details = mismatches
      .map(([source, actual]) => `${source}=${actual || '(missing)'}`)
      .join(', ');
    throw new Error(
      `Tag version ${version} does not match release metadata: ${details}.`,
    );
  }
}

/**
 * Parse every released section out of a Keep-a-Changelog document.
 * Returns [{version, date, body}] in file order (newest first).
 * `[Unreleased]` is skipped; trailing link-definition lines are trimmed.
 */
export function extractReleasedSections(changelogText) {
  const lines = changelogText.split('\n');
  const sections = [];
  let current = null;

  const finish = () => {
    if (!current) {
      return;
    }
    while (
      current.bodyLines.length > 0 &&
      (LINK_DEFINITION_PATTERN.test(current.bodyLines.at(-1)) ||
        current.bodyLines.at(-1).trim() === '')
    ) {
      current.bodyLines.pop();
    }
    sections.push({
      version: current.version,
      date: current.date,
      body: current.bodyLines.join('\n').trim(),
    });
    current = null;
  };

  let inFence = false;
  for (const line of lines) {
    if (CODE_FENCE_PATTERN.test(line)) {
      inFence = !inFence;
    }
    const match = inFence ? null : SECTION_HEADING_PATTERN.exec(line);
    if (match) {
      finish();
      const [, version, date] = match;
      if (version.toLowerCase() !== 'unreleased') {
        current = {version, date: date ? date.trim() : '', bodyLines: []};
      }
      continue;
    }
    if (current) {
      current.bodyLines.push(line);
    }
  }
  finish();
  return sections;
}

/**
 * The one version's section, or throw — a release tag without a written,
 * non-empty changelog section is a release-gate failure, not a soft default.
 */
export function extractChangelogSection(changelogText, version) {
  const section = extractReleasedSections(changelogText).find(
    (candidate) => candidate.version === version,
  );
  if (!section) {
    throw new Error(
      `CHANGELOG.md has no "## [${version}]" section. Move the [Unreleased] ` +
        'items under a dated section for this release before tagging.',
    );
  }
  if (section.body === '') {
    throw new Error(
      `CHANGELOG.md section "## [${version}]" is empty — a release must ` +
        'describe its changes.',
    );
  }
  return section;
}

/** The GitHub release-page body for one version. */
export function renderGitHubReleaseNotes(section) {
  const {version, date, body} = section;
  const dateSuffix = date ? ` — ${date}` : '';
  return [
    `Lagrange ${version}${dateSuffix} (experimental / alpha).`,
    '',
    body,
    '',
    '---',
    '',
    '**Docker images** (linux/amd64, distroless):',
    '',
    `- \`${DOCKERHUB_IMAGE}:${version}\` ([Docker Hub](${DOCKERHUB_URL}))`,
    '',
    `Full history: [CHANGELOG.md](${REPO_URL}/blob/v${version}/CHANGELOG.md)` +
      ` · process: [RELEASE.md](${REPO_URL}/blob/v${version}/RELEASE.md)`,
    '',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {mode: null, version: null};
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--mode') {
      args.mode = argv[++index];
    } else if (argv[index] === '--version') {
      args.version = argv[++index];
    } else {
      throw new Error(`Unknown argument: ${argv[index]}`);
    }
  }
  if (!['check', 'notes'].includes(args.mode)) {
    throw new Error('Usage: release-notes.js --mode check|notes --version x.y.z');
  }
  if (!args.version) {
    throw new Error('--version is required (bare semver, no leading "v")');
  }
  if (args.version.startsWith('v')) {
    throw new Error(
      `--version takes the bare semver (got "${args.version}" — drop the leading "v")`,
    );
  }
  return args;
}

function runCli(argv) {
  const {mode, version} = parseArgs(argv);
  const changelogText = readFileSync(CHANGELOG_PATH, 'utf8');
  const section = extractChangelogSection(changelogText, version);

  if (mode === 'check') {
    const packageVersion = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8')).version;
    assertReleaseVersions(
      version,
      packageVersion,
      readFileSync(CHART_PATH, 'utf8'),
    );
    process.stdout.write(
      `ok: CHANGELOG.md has a non-empty [${version}] section and release versions match\n`,
    );
    return;
  }

  process.stdout.write(renderGitHubReleaseNotes(section));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`release-notes: ${error.message}\n`);
    process.exit(1);
  }
}
