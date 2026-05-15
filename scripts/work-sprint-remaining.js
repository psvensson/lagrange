#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ENCODING_UTF8 = 'utf8';
const EMPTY_TEXT = '';
const NEWLINE = '\n';
const SPACE = ' ';
const MARKDOWN_EXTENSION = '.md';
const WORK_DIRECTORY = 'work';
const PACKAGES_DIRECTORY = path.join(WORK_DIRECTORY, 'packages');
const SPRINTS_DIRECTORY = path.join(WORK_DIRECTORY, 'sprints');
const CURRENT_BLOCKER_JSON_PATH = path.join(
  SPRINTS_DIRECTORY,
  'current-blocker.json',
);
const PACKAGE_METADATA_OPEN = '<!-- work-package';
const PACKAGE_METADATA_CLOSE = '-->';
const STATUS_ACTIVE = 'active';
const STATUS_TODO = 'todo';
const STATUS_DONE = 'done';
const STATUS_SUPERSEDED = 'superseded';
const LEFT_PACKAGE_STATUSES = Object.freeze([STATUS_ACTIVE, STATUS_TODO]);
const KNOWN_PACKAGE_STATUSES = Object.freeze([
  STATUS_ACTIVE,
  STATUS_TODO,
  STATUS_DONE,
  STATUS_SUPERSEDED,
]);
const ACTIVE_SPRINT_PATTERN = /^active-.+\.md$/u;
const PACKAGE_LINK_PATTERN =
  /\[[^\]]+\]\(([^)]*(?:^|\/|\.\.\/)packages\/[^)\s]+\.md)\)/gu;
const MARKDOWN_HEADING_PATTERN = /^#\s+(.+)$/mu;
const TABLE_DELIMITER = '|';
const TABLE_SEPARATOR = '---';
const UNKNOWN_VALUE = 'unknown';
const OUTPUT_TITLE = '# Sprint Packages Left';
const PROCESS_ARG_SCRIPT_INDEX = 1;
const SCRIPT_FILE_NAME = 'work-sprint-remaining.js';

function normalizeWhitespace(value = EMPTY_TEXT) {
  return String(value).trim().replace(/\s+/gu, SPACE);
}

function normalizeRelativePath(filePath) {
  return path.normalize(filePath).split(path.sep).join('/');
}

function packageStatusFromPath(filePath) {
  const fileName = path.basename(filePath, MARKDOWN_EXTENSION);
  const [status] = fileName.split('-');
  return KNOWN_PACKAGE_STATUSES.includes(status) ? status : UNKNOWN_VALUE;
}

function parsePackageMetadata(content) {
  const openIndex = content.indexOf(PACKAGE_METADATA_OPEN);
  if (openIndex < 0) {
    return undefined;
  }
  const jsonStart = openIndex + PACKAGE_METADATA_OPEN.length;
  const closeIndex = content.indexOf(PACKAGE_METADATA_CLOSE, jsonStart);
  if (closeIndex < 0) {
    return undefined;
  }
  try {
    return JSON.parse(content.slice(jsonStart, closeIndex).trim());
  } catch {
    return undefined;
  }
}

function parsePackageTitle(content, packagePath) {
  const heading = MARKDOWN_HEADING_PATTERN.exec(content)?.[1];
  return normalizeWhitespace(heading || path.basename(packagePath, MARKDOWN_EXTENSION));
}

function normalizePackageLink(sprintPath, linkTarget) {
  const sprintDirectory = path.dirname(sprintPath);
  const normalizedTarget = linkTarget.replace(/^\.?\//u, EMPTY_TEXT);
  if (normalizedTarget.startsWith(WORK_DIRECTORY + '/')) {
    return normalizeRelativePath(normalizedTarget);
  }
  return normalizeRelativePath(path.join(sprintDirectory, linkTarget));
}

function extractPackageLinks(sprintPath, content) {
  const packages = [];
  const seen = new Set();
  for (const match of content.matchAll(PACKAGE_LINK_PATTERN)) {
    const packagePath = normalizePackageLink(sprintPath, match[1]);
    if (!packagePath.startsWith(PACKAGES_DIRECTORY + '/') || seen.has(packagePath)) {
      continue;
    }
    seen.add(packagePath);
    packages.push(packagePath);
  }
  return packages;
}

async function readTextIfPresent(root, relativePath) {
  try {
    return await fs.readFile(path.join(root, relativePath), ENCODING_UTF8);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return EMPTY_TEXT;
    }
    throw error;
  }
}

async function readCurrentBlockerPackage(root, sprintPath) {
  const content = await readTextIfPresent(root, CURRENT_BLOCKER_JSON_PATH);
  if (!content) {
    return undefined;
  }
  try {
    const currentBlocker = JSON.parse(content);
    if (normalizeRelativePath(currentBlocker.sprint || EMPTY_TEXT) !== sprintPath) {
      return undefined;
    }
    const packagePath = normalizeRelativePath(currentBlocker.package || EMPTY_TEXT);
    return packagePath.startsWith(PACKAGES_DIRECTORY + '/') ? packagePath : undefined;
  } catch {
    return undefined;
  }
}

async function findActiveSprint(root) {
  const sprintDirectory = path.join(root, SPRINTS_DIRECTORY);
  const entries = await fs.readdir(sprintDirectory, {withFileTypes: true});
  const activeSprints = entries
    .filter((entry) => entry.isFile() && ACTIVE_SPRINT_PATTERN.test(entry.name))
    .map((entry) => normalizeRelativePath(path.join(SPRINTS_DIRECTORY, entry.name)))
    .sort();
  if (activeSprints.length === 0) {
    throw new Error('No active sprint file found under work/sprints/.');
  }
  if (activeSprints.length > 1) {
    throw new Error(
      'Multiple active sprint files found: ' + activeSprints.join(', '),
    );
  }
  return activeSprints[0];
}

async function readPackage(root, packagePath, source) {
  const content = await readTextIfPresent(root, packagePath);
  const metadata = parsePackageMetadata(content);
  const fileStatus = packageStatusFromPath(packagePath);
  return {
    path: packagePath,
    title: parsePackageTitle(content, packagePath),
    status: fileStatus,
    metadataStatus: normalizeWhitespace(metadata?.status || EMPTY_TEXT),
    lane: normalizeWhitespace(metadata?.lane || UNKNOWN_VALUE),
    owner: normalizeWhitespace(metadata?.owner || UNKNOWN_VALUE),
    boundary: normalizeWhitespace(metadata?.boundary || UNKNOWN_VALUE),
    dominantReason: normalizeWhitespace(metadata?.dominantReason || UNKNOWN_VALUE),
    nextAction: normalizeWhitespace(metadata?.nextAction || UNKNOWN_VALUE),
    source,
  };
}

function addPackagePath(paths, seen, packagePath) {
  if (!packagePath || seen.has(packagePath)) {
    return;
  }
  seen.add(packagePath);
  paths.push(packagePath);
}

async function buildSprintRemainingSummary(options = {}) {
  const root = options.root ?? process.cwd();
  const sprintPath = options.sprintPath ?
    normalizeRelativePath(options.sprintPath) :
    await findActiveSprint(root);
  const sprintContent = await readTextIfPresent(root, sprintPath);
  if (!sprintContent) {
    throw new Error(`Active sprint file not found: ${sprintPath}`);
  }

  const packagePaths = [];
  const seen = new Set();
  for (const packagePath of extractPackageLinks(sprintPath, sprintContent)) {
    addPackagePath(packagePaths, seen, packagePath);
  }
  addPackagePath(
    packagePaths,
    seen,
    await readCurrentBlockerPackage(root, sprintPath),
  );

  const packages = await Promise.all(
    packagePaths.map((packagePath) => readPackage(root, packagePath, 'sprint')),
  );
  const leftPackages = packages.filter((workPackage) =>
    LEFT_PACKAGE_STATUSES.includes(workPackage.status));

  return {
    sprintPath,
    totalLinkedPackages: packages.length,
    leftPackages,
    counts: {
      active: leftPackages.filter((workPackage) =>
        workPackage.status === STATUS_ACTIVE).length,
      todo: leftPackages.filter((workPackage) =>
        workPackage.status === STATUS_TODO).length,
      left: leftPackages.length,
    },
  };
}

function escapeTableCell(value) {
  return String(value).replace(/\|/gu, '\\|');
}

function renderMarkdownTable(headers, rows) {
  const lines = [
    `${TABLE_DELIMITER} ${headers.join(` ${TABLE_DELIMITER} `)} ${TABLE_DELIMITER}`,
    `${TABLE_DELIMITER} ${headers.map(() => TABLE_SEPARATOR).join(` ${TABLE_DELIMITER} `)} ${TABLE_DELIMITER}`,
  ];
  for (const row of rows) {
    lines.push(
      `${TABLE_DELIMITER} ${row.map(escapeTableCell).join(` ${TABLE_DELIMITER} `)} ${TABLE_DELIMITER}`,
    );
  }
  return lines.join(NEWLINE);
}

function renderSprintRemainingSummary(summary) {
  const lines = [
    OUTPUT_TITLE,
    EMPTY_TEXT,
    `Sprint: \`${summary.sprintPath}\``,
    `Packages left: ${summary.counts.left} ` +
      `(active=${summary.counts.active}, todo=${summary.counts.todo})`,
    `Linked packages scanned: ${summary.totalLinkedPackages}`,
    EMPTY_TEXT,
  ];
  if (summary.leftPackages.length === 0) {
    lines.push('No active or todo packages remain in the current sprint.');
    return lines.join(NEWLINE);
  }
  const rows = summary.leftPackages.map((workPackage) => [
    workPackage.status,
    workPackage.title,
    workPackage.lane,
    `${workPackage.owner} / ${workPackage.boundary}`,
    workPackage.dominantReason,
    workPackage.nextAction,
    `\`${workPackage.path}\``,
  ]);
  lines.push(renderMarkdownTable([
    'Status',
    'Package',
    'Lane',
    'Owner / boundary',
    'Reason',
    'Next action',
    'Path',
  ], rows));
  return lines.join(NEWLINE);
}

async function main() {
  const summary = await buildSprintRemainingSummary();
  process.stdout.write(renderSprintRemainingSummary(summary) + NEWLINE);
}

function isDirectRun() {
  return process.argv[PROCESS_ARG_SCRIPT_INDEX] &&
    process.argv[PROCESS_ARG_SCRIPT_INDEX].endsWith(SCRIPT_FILE_NAME);
}

if (isDirectRun()) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

export {
  buildSprintRemainingSummary,
  extractPackageLinks,
  renderSprintRemainingSummary,
};
