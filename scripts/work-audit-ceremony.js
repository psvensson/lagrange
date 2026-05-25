#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const ENCODING_UTF8 = 'utf8';
const EMPTY_TEXT = '';
const NEWLINE = '\n';
const SPACE = ' ';
const WORK_PACKAGES_DIRECTORY = path.join('work', 'packages');
const DONE_PREFIX = 'done-';
const MARKDOWN_EXTENSION = '.md';
const PACKAGE_METADATA_OPEN = '<!-- work-package';
const PACKAGE_METADATA_CLOSE = '-->';
const SOURCE_PREFIX = 'src/';
const FLAG_SINCE = '--since';
const FLAG_LIMIT = '--limit';
const FLAG_DETAILS = '--details';
const FLAG_SUMMARY = '--summary';
const FLAG_BY_LANE = '--by-lane';
const FLAG_BY_OWNER = '--by-owner';
const FLAG_HELP = '--help';
const DEFAULT_DETAIL_LIMIT = 25;
const NO_LIMIT = 0;
const DATE_YEAR_LENGTH = 4;
const DATE_MONTH_START = 4;
const DATE_MONTH_END = 6;
const DATE_DAY_START = 6;
const DATE_DAY_END = 8;
const PROCESS_ARG_SCRIPT_INDEX = 1;
const SCRIPT_FILE_NAME = 'work-audit-ceremony.js';
const HELP_TEXT = [
  'Usage: node scripts/work-audit-ceremony.js [--since YYYY-MM-DD] [--summary] [--details] [--limit N] [--by-lane] [--by-owner]',
  '',
  'Finds done packages with no runtime write scope and no theory-ledger refs.',
  'Default output is a bounded summary; add --details for package examples.',
  'Use --limit 0 with --details to print all matching packages.',
].join(NEWLINE);

function normalizeWhitespace(value = EMPTY_TEXT) {
  return String(value).trim().replace(/\s+/gu, SPACE);
}

function parseOptionValue(args, flagName) {
  const index = args.indexOf(flagName);
  return index >= 0 ? args[index + 1] : EMPTY_TEXT;
}

function parseIntegerOption(value, fallback) {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseArgs(args = []) {
  return {
    sinceDate: normalizeWhitespace(parseOptionValue(args, FLAG_SINCE)),
    limit: parseIntegerOption(parseOptionValue(args, FLAG_LIMIT), DEFAULT_DETAIL_LIMIT),
    details: args.includes(FLAG_DETAILS),
    summary: args.includes(FLAG_SUMMARY) || !args.includes(FLAG_DETAILS),
    byLane: args.includes(FLAG_BY_LANE),
    byOwner: args.includes(FLAG_BY_OWNER),
    help: args.includes(FLAG_HELP),
  };
}

function parseMetadata(content) {
  try {
    const openIndex = content.indexOf(PACKAGE_METADATA_OPEN);
    const closeIndex = content.indexOf(PACKAGE_METADATA_CLOSE, openIndex);
    if (openIndex === -1 || closeIndex === -1) {
      return undefined;
    }
    const jsonText = content.slice(
      openIndex + PACKAGE_METADATA_OPEN.length,
      closeIndex,
    ).trim();
    return JSON.parse(jsonText);
  } catch {
    return undefined;
  }
}

function packageDateFromFileName(fileName) {
  const match = fileName.match(/^done-(\d{8})-/u);
  if (!match) {
    return EMPTY_TEXT;
  }
  const raw = match[1];
  return [
    raw.slice(0, DATE_YEAR_LENGTH),
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

function metadataLane(metadata) {
  return normalizeWhitespace(metadata?.intent?.lane || metadata?.lane || 'unknown');
}

function metadataOwner(metadata) {
  return normalizeWhitespace(metadata?.intent?.owner || metadata?.owner || 'unknown');
}

function metadataTheoryLedgerRefs(metadata) {
  const refs = metadata?.execution?.theoryLedgerRefs ?? metadata?.theoryLedgerRefs;
  return Array.isArray(refs) ? refs : [];
}

function metadataWriteScope(metadata) {
  const writeScope = metadata?.scope?.writeScope ?? metadata?.writeScope;
  return Array.isArray(writeScope) ? writeScope : [];
}

function shouldIncludeByDate(packageDate, sinceDate) {
  return !sinceDate || !packageDate || packageDate >= sinceDate;
}

function isPureCeremonyPackage(metadata) {
  const hasTheoryRefs = metadataTheoryLedgerRefs(metadata).length > 0;
  const hasRuntimeChanges = metadataWriteScope(metadata)
    .some((filePath) => normalizeWhitespace(filePath).startsWith(SOURCE_PREFIX));
  return !hasTheoryRefs && !hasRuntimeChanges;
}

async function buildCeremonyAudit(options = {}) {
  const root = options.root ?? process.cwd();
  const packagesDir = path.join(root, WORK_PACKAGES_DIRECTORY);
  let entries;
  try {
    entries = await fs.readdir(packagesDir, {withFileTypes: true});
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {scanned: 0, packages: []};
    }
    throw error;
  }
  const packages = [];
  let scanned = 0;
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) =>
      fileName.startsWith(DONE_PREFIX) && fileName.endsWith(MARKDOWN_EXTENSION))
    .sort();
  for (const fileName of files) {
    const filePath = path.join(WORK_PACKAGES_DIRECTORY, fileName);
    const metadata = parseMetadata(
      await fs.readFile(path.join(root, filePath), ENCODING_UTF8),
    );
    if (!metadata) {
      continue;
    }
    const packageDate = metadataDate(metadata, fileName);
    if (!shouldIncludeByDate(packageDate, options.sinceDate)) {
      continue;
    }
    scanned += 1;
    if (isPureCeremonyPackage(metadata)) {
      packages.push({
        file: fileName,
        path: filePath,
        owner: metadataOwner(metadata),
        lane: metadataLane(metadata),
        date: packageDate || 'unknown',
      });
    }
  }
  return {scanned, packages};
}

function countBy(packages, key) {
  const counts = new Map();
  for (const workPackage of packages) {
    const value = workPackage[key] || 'unknown';
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}

function renderCountSection(lines, title, counts, limit = DEFAULT_DETAIL_LIMIT) {
  lines.push(EMPTY_TEXT, `## ${title}`, EMPTY_TEXT);
  if (counts.length === 0) {
    lines.push('- none');
    return;
  }
  const visibleCounts = limit === NO_LIMIT ? counts : counts.slice(0, limit);
  for (const [value, count] of visibleCounts) {
    lines.push(`- ${value}: ${count}`);
  }
  if (visibleCounts.length < counts.length) {
    lines.push(`- ... ${counts.length - visibleCounts.length} more`);
  }
}

function renderPackageDetails(lines, packages, limit) {
  lines.push(EMPTY_TEXT, '## Package Examples', EMPTY_TEXT);
  if (packages.length === 0) {
    lines.push('No pure-ceremony packages detected.');
    return;
  }
  const visiblePackages = limit === NO_LIMIT ? packages : packages.slice(0, limit);
  for (const workPackage of visiblePackages) {
    lines.push(
      `- \`${workPackage.path}\` - owner: \`${workPackage.owner}\`; ` +
      `lane: \`${workPackage.lane}\`; date: \`${workPackage.date}\``,
    );
  }
  if (visiblePackages.length < packages.length) {
    lines.push(
      `- ... ${packages.length - visiblePackages.length} more ` +
      '(use `--details --limit 0` to print all).',
    );
  }
}

function renderCeremonyAudit(audit, options = {}) {
  const lines = [
    '# Ceremony Audit Report',
    EMPTY_TEXT,
  ];
  if (options.sinceDate) {
    lines.push(`Filtering packages since: \`${options.sinceDate}\``, EMPTY_TEXT);
  }
  lines.push(
    `Scanned done packages: ${audit.scanned}`,
    `Pure-ceremony packages: ${audit.packages.length}`,
  );
  if (audit.packages.length > 0) {
    lines.push(
      'Action: inspect the largest owner/lane clusters first; convert repeated sibling work to an epic/frontier package or keep it package-local when no durable truth changed.',
    );
  }
  if (options.summary !== false) {
    renderCountSection(lines, 'By Lane', countBy(audit.packages, 'lane'), options.limit);
    renderCountSection(lines, 'By Owner', countBy(audit.packages, 'owner'), options.limit);
  }
  if (options.byLane && options.summary === false) {
    renderCountSection(lines, 'By Lane', countBy(audit.packages, 'lane'), options.limit);
  }
  if (options.byOwner && options.summary === false) {
    renderCountSection(lines, 'By Owner', countBy(audit.packages, 'owner'), options.limit);
  }
  if (options.details) {
    renderPackageDetails(lines, audit.packages, options.limit);
  } else {
    lines.push(
      EMPTY_TEXT,
      'Use `--details --limit N` for bounded examples.',
    );
  }
  return `${lines.join(NEWLINE)}${NEWLINE}`;
}

async function runCli(args = process.argv.slice(2), options = {}) {
  const parsed = parseArgs(args);
  if (parsed.help) {
    return `${HELP_TEXT}${NEWLINE}`;
  }
  const audit = await buildCeremonyAudit({
    root: options.root,
    sinceDate: parsed.sinceDate,
  });
  return renderCeremonyAudit(audit, parsed);
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
  buildCeremonyAudit,
  isPureCeremonyPackage,
  parseArgs,
  renderCeremonyAudit,
  runCli,
};
