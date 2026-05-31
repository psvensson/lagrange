#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {normalizeMetadata} from './work-package-schema.js';

const ENCODING_UTF8 = 'utf8';
const EMPTY_TEXT = '';
const NEWLINE = '\n';
const SPACE = ' ';
const DONE_PREFIX = 'done-';
const MARKDOWN_EXTENSION = '.md';
const WORK_PACKAGES_DIRECTORY = path.join('work', 'packages');
const PACKAGE_METADATA_OPEN = '<!-- work-package';
const PACKAGE_METADATA_CLOSE = '-->';
const FLAG_CLUSTER = '--cluster';
const FLAG_DETAILS = '--details';
const FLAG_HELP = '--help';
const FLAG_INCLUDE_ADMIN = '--include-admin';
const FLAG_LIMIT = '--limit';
const FLAG_MIN_SHARED = '--min-shared';
const FLAG_OWNER = '--owner';
const FLAG_BOUNDARY = '--boundary';
const FLAG_SINCE = '--since';
const FLAG_THRESHOLD = '--threshold';
const DEFAULT_THRESHOLD = 0.8;
const DEFAULT_LIMIT = 25;
const DEFAULT_MIN_SHARED = 1;
const NO_LIMIT = 0;
const NUM_ZERO = 0;
const NUM_ONE = 1;
const NUM_TWO = 2;
const PROCESS_ARG_SCRIPT_INDEX = 1;
const DATE_YEAR_LENGTH = 4;
const DATE_MONTH_START = 4;
const DATE_MONTH_END = 6;
const DATE_DAY_START = 6;
const DATE_DAY_END = 8;
const ADMIN_PATH_PREFIXES = Object.freeze([
  'work/packages/',
  'work/sprints/',
  'work/tracks/',
]);
const ADMIN_PATHS = Object.freeze([
  'work/RULES.md',
  'work/README.md',
  'work/sprints/current-blocker.json',
  'work/sprints/current-blocker.md',
]);
const HELP_TEXT = [
  'Usage: node scripts/work-audit-siblings.js [--threshold N] [--min-shared N] [--cluster] [--since YYYY-MM-DD] [--owner OWNER] [--boundary BOUNDARY] [--include-admin] [--details] [--limit N]',
  '',
  'Finds closed packages with overlapping non-admin write scopes.',
  'Default output is pair-based and bounded. Add --cluster to group connected matches.',
].join(NEWLINE);

function normalizeWhitespace(value = EMPTY_TEXT) {
  return String(value).trim().replace(/\s+/gu, SPACE);
}

function normalizePackagePath(filePath) {
  return normalizeWhitespace(filePath).replace(/\\/gu, '/');
}

function parseOptionValue(args, flagName) {
  const index = args.indexOf(flagName);
  return index >= NUM_ZERO ? args[index + NUM_ONE] : EMPTY_TEXT;
}

function parseIntegerOption(value, fallback) {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= NUM_ZERO ? parsed : fallback;
}

function parseNumberOption(value, fallback) {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > NUM_ZERO ? parsed : fallback;
}

function parseArgs(args = []) {
  return {
    threshold: parseNumberOption(
      parseOptionValue(args, FLAG_THRESHOLD),
      DEFAULT_THRESHOLD,
    ),
    minShared: parseIntegerOption(
      parseOptionValue(args, FLAG_MIN_SHARED),
      DEFAULT_MIN_SHARED,
    ),
    sinceDate: normalizeWhitespace(parseOptionValue(args, FLAG_SINCE)),
    owner: normalizeWhitespace(parseOptionValue(args, FLAG_OWNER)),
    boundary: normalizeWhitespace(parseOptionValue(args, FLAG_BOUNDARY)),
    includeAdmin: args.includes(FLAG_INCLUDE_ADMIN),
    cluster: args.includes(FLAG_CLUSTER),
    details: args.includes(FLAG_DETAILS),
    limit: parseIntegerOption(parseOptionValue(args, FLAG_LIMIT), DEFAULT_LIMIT),
    help: args.includes(FLAG_HELP),
  };
}

function parseMetadata(content, filePath) {
  try {
    const openIndex = content.indexOf(PACKAGE_METADATA_OPEN);
    const closeIndex = content.indexOf(PACKAGE_METADATA_CLOSE, openIndex);
    if (openIndex === -1 || closeIndex === -1) {
      return null;
    }
    const jsonText = content.slice(
      openIndex + PACKAGE_METADATA_OPEN.length,
      closeIndex,
    ).trim();
    return normalizeMetadata(JSON.parse(jsonText), filePath);
  } catch {
    return null;
  }
}

function packageDateFromFileName(fileName) {
  const match = fileName.match(/^done-(\d{8})-/u);
  if (!match) {
    return EMPTY_TEXT;
  }
  const raw = match[NUM_ONE];
  return [
    raw.slice(NUM_ZERO, DATE_YEAR_LENGTH),
    raw.slice(DATE_MONTH_START, DATE_MONTH_END),
    raw.slice(DATE_DAY_START, DATE_DAY_END),
  ].join('-');
}

function metadataDate(metadata, fileName) {
  return normalizeWhitespace(
    metadata?.closed ||
    metadata?.intent?.closed ||
    metadata?.opened ||
    metadata?.intent?.opened ||
    packageDateFromFileName(fileName),
  );
}

function metadataOwner(metadata) {
  return normalizeWhitespace(metadata?.owner || metadata?.intent?.owner);
}

function metadataBoundary(metadata) {
  return normalizeWhitespace(metadata?.boundary || metadata?.intent?.boundary);
}

function metadataWriteScope(metadata) {
  const writeScope = metadata?.writeScope ?? metadata?.scope?.writeScope;
  return Array.isArray(writeScope) ? writeScope : [];
}

function shouldIncludeByDate(packageDate, sinceDate) {
  return !sinceDate || !packageDate || packageDate >= sinceDate;
}

function isAdminPath(filePath) {
  const normalizedPath = normalizePackagePath(filePath);
  return ADMIN_PATHS.includes(normalizedPath) ||
    ADMIN_PATH_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix));
}

function normalizedScope(writeScope, options = {}) {
  const scope = writeScope
    .map(normalizePackagePath)
    .filter(Boolean)
    .filter((filePath) => options.includeAdmin || !isAdminPath(filePath));
  return [...new Set(scope)].sort();
}

async function readPackageRecords(options = {}) {
  const root = options.root ?? process.cwd();
  const packagesDir = path.join(root, WORK_PACKAGES_DIRECTORY);
  let entries;
  try {
    entries = await fs.readdir(packagesDir, {withFileTypes: true});
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  const records = [];
  const fileNames = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) =>
      fileName.startsWith(DONE_PREFIX) && fileName.endsWith(MARKDOWN_EXTENSION))
    .sort();
  for (const fileName of fileNames) {
    const relativePath = path.join(WORK_PACKAGES_DIRECTORY, fileName);
    const metadata = parseMetadata(
      await fs.readFile(path.join(root, relativePath), ENCODING_UTF8),
      relativePath,
    );
    if (!metadata) {
      continue;
    }
    const packageDate = metadataDate(metadata, fileName);
    const owner = metadataOwner(metadata);
    const boundary = metadataBoundary(metadata);
    if (!shouldIncludeByDate(packageDate, options.sinceDate)) {
      continue;
    }
    if (options.owner && owner !== options.owner) {
      continue;
    }
    if (options.boundary && boundary !== options.boundary) {
      continue;
    }
    const scope = normalizedScope(metadataWriteScope(metadata), options);
    if (scope.length === NUM_ZERO) {
      continue;
    }
    records.push({
      file: fileName,
      path: relativePath,
      date: packageDate || 'unknown',
      owner: owner || 'unknown',
      boundary: boundary || 'unknown',
      scope,
    });
  }
  return records;
}

function intersection(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value));
}

function buildPairMatches(records, options = {}) {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const minShared = options.minShared ?? DEFAULT_MIN_SHARED;
  const matches = [];
  for (let leftIndex = NUM_ZERO; leftIndex < records.length; leftIndex += NUM_ONE) {
    for (
      let rightIndex = leftIndex + NUM_ONE;
      rightIndex < records.length;
      rightIndex += NUM_ONE
    ) {
      const left = records[leftIndex];
      const right = records[rightIndex];
      const sharedScope = intersection(left.scope, right.scope);
      if (sharedScope.length < minShared) {
        continue;
      }
      const minimumScope = Math.min(left.scope.length, right.scope.length);
      const overlapRatio = sharedScope.length / minimumScope;
      if (overlapRatio < threshold) {
        continue;
      }
      matches.push({
        left,
        right,
        overlapRatio,
        sharedScope,
      });
    }
  }
  return matches.sort((left, right) =>
    right.overlapRatio - left.overlapRatio ||
    right.sharedScope.length - left.sharedScope.length ||
    left.left.file.localeCompare(right.left.file) ||
    left.right.file.localeCompare(right.right.file));
}

function buildClusters(records, matches, options = {}) {
  const minSize = options.minSize ?? NUM_TWO;
  const adjacency = new Map(records.map((record) => [record.file, new Set()]));
  for (const match of matches) {
    adjacency.get(match.left.file).add(match.right.file);
    adjacency.get(match.right.file).add(match.left.file);
  }
  const byFile = new Map(records.map((record) => [record.file, record]));
  const seen = new Set();
  const clusters = [];
  for (const record of records) {
    if (seen.has(record.file)) {
      continue;
    }
    const stack = [record.file];
    const files = [];
    seen.add(record.file);
    while (stack.length > NUM_ZERO) {
      const file = stack.pop();
      files.push(file);
      for (const nextFile of adjacency.get(file) || []) {
        if (!seen.has(nextFile)) {
          seen.add(nextFile);
          stack.push(nextFile);
        }
      }
    }
    if (files.length < minSize) {
      continue;
    }
    const clusterRecords = files.map((file) => byFile.get(file)).sort((left, right) =>
      left.file.localeCompare(right.file));
    const pathCounts = new Map();
    for (const clusterRecord of clusterRecords) {
      for (const filePath of clusterRecord.scope) {
        pathCounts.set(filePath, (pathCounts.get(filePath) || NUM_ZERO) + NUM_ONE);
      }
    }
    const sharedScope = [...pathCounts.entries()]
      .filter(([, count]) => count > NUM_ONE)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
    clusters.push({
      packages: clusterRecords,
      sharedScope,
      ownerBoundaryKeys: [...new Set(clusterRecords.map((entry) =>
        `${entry.owner}/${entry.boundary}`))].sort(),
    });
  }
  return clusters.sort((left, right) =>
    right.packages.length - left.packages.length ||
    right.sharedScope.length - left.sharedScope.length ||
    left.packages[NUM_ZERO].file.localeCompare(right.packages[NUM_ZERO].file));
}

async function buildSiblingAudit(options = {}) {
  const records = await readPackageRecords(options);
  const matches = buildPairMatches(records, options);
  const clusters = buildClusters(records, matches);
  return {records, matches, clusters};
}

function visibleValues(values, limit) {
  return limit === NO_LIMIT ? values : values.slice(NUM_ZERO, limit);
}

function renderScopeList(values, limit) {
  const visible = visibleValues(values, limit);
  const lines = visible.map((value) => `    - \`${value}\``);
  if (visible.length < values.length) {
    lines.push(`    - ... ${values.length - visible.length} more`);
  }
  return lines;
}

function renderPairDetails(lines, matches, options = {}) {
  if (matches.length === NUM_ZERO) {
    lines.push('No highly-overlapping sibling package pairs found.');
    return;
  }
  const visibleMatches = visibleValues(matches, options.limit);
  for (const match of visibleMatches) {
    lines.push(
      `- Pair: \`${match.left.path}\` <-> \`${match.right.path}\``,
      `  - overlap: ${(match.overlapRatio * 100).toFixed(1)}% (${match.sharedScope.length} shared paths)`,
      `  - owner/boundary: \`${match.left.owner}/${match.left.boundary}\` and \`${match.right.owner}/${match.right.boundary}\``,
    );
    if (options.details) {
      lines.push('  - shared scope:');
      lines.push(...renderScopeList(match.sharedScope, options.limit));
    }
  }
  if (visibleMatches.length < matches.length) {
    lines.push(`- ... ${matches.length - visibleMatches.length} more pairs`);
  }
}

function renderClusterDetails(lines, clusters, options = {}) {
  if (clusters.length === NUM_ZERO) {
    lines.push('No overlapping sibling package clusters found.');
    return;
  }
  const visibleClusters = visibleValues(clusters, options.limit);
  for (const cluster of visibleClusters) {
    lines.push(
      `- Cluster: ${cluster.packages.length} packages; ` +
        `owner/boundary keys: ${cluster.ownerBoundaryKeys.map((key) => `\`${key}\``).join(', ')}`,
      '  - packages:',
    );
    for (const packageRecord of visibleValues(cluster.packages, options.limit)) {
      lines.push(`    - \`${packageRecord.path}\``);
    }
    if (options.details) {
      lines.push('  - shared scope:');
      lines.push(...renderScopeList(
        cluster.sharedScope.map(([filePath, count]) => `${filePath} (${count})`),
        options.limit,
      ));
    }
  }
  if (visibleClusters.length < clusters.length) {
    lines.push(`- ... ${clusters.length - visibleClusters.length} more clusters`);
  }
}

function renderSiblingAudit(audit, options = {}) {
  const lines = [
    '# Sibling Packages Consolidation Audit Report',
    EMPTY_TEXT,
    `Scanned scoped packages: ${audit.records.length}`,
    `Pair matches: ${audit.matches.length}`,
    `Clusters: ${audit.clusters.length}`,
    `Threshold: ${(options.threshold ?? DEFAULT_THRESHOLD) * 100}%`,
    `Minimum shared paths: ${options.minShared ?? DEFAULT_MIN_SHARED}`,
    `Admin paths included: ${options.includeAdmin === true ? 'yes' : 'no'}`,
  ];
  if (options.sinceDate) {
    lines.push(`Since: \`${options.sinceDate}\``);
  }
  if (options.owner) {
    lines.push(`Owner filter: \`${options.owner}\``);
  }
  if (options.boundary) {
    lines.push(`Boundary filter: \`${options.boundary}\``);
  }
  lines.push(
    EMPTY_TEXT,
    'Action: merge repeated sibling leaves into one epic/frontier package when the shared scope names the same durable owner-boundary work.',
    EMPTY_TEXT,
    options.cluster ? '## Clusters' : '## Pair Matches',
    EMPTY_TEXT,
  );
  if (options.cluster) {
    renderClusterDetails(lines, audit.clusters, options);
  } else {
    renderPairDetails(lines, audit.matches, options);
  }
  return `${lines.join(NEWLINE)}${NEWLINE}`;
}

async function runCli(args = process.argv.slice(NUM_TWO), options = {}) {
  const parsed = parseArgs(args);
  if (parsed.help) {
    return `${HELP_TEXT}${NEWLINE}`;
  }
  const audit = await buildSiblingAudit({
    root: options.root,
    threshold: parsed.threshold,
    minShared: parsed.minShared,
    sinceDate: parsed.sinceDate,
    owner: parsed.owner,
    boundary: parsed.boundary,
    includeAdmin: parsed.includeAdmin,
  });
  return renderSiblingAudit(audit, parsed);
}

function isDirectRun() {
  return process.argv[PROCESS_ARG_SCRIPT_INDEX] === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  runCli()
    .then((output) => {
      process.stdout.write(output);
    })
    .catch((error) => {
      process.stderr.write(`${error.message}${NEWLINE}`);
      process.exitCode = 1;
    });
}

export {
  buildClusters,
  buildPairMatches,
  buildSiblingAudit,
  isAdminPath,
  normalizedScope,
  parseArgs,
  renderSiblingAudit,
  runCli,
};
