#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {normalizeMetadata} from './work-package-schema.js';

const ENCODING_UTF8 = 'utf8';
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 2;
const EMPTY_TIMESTAMP = '00000000T000000Z';
const STATUS_SORT_RANK = Object.freeze({
  active: '4',
  done: '3',
  todo: '2',
  superseded: '1',
  unknown: '0',
});

const HELP_TEXT = [
  'Usage: npm run work:frontier-history -- [--package-dir <dir>] [--owner <owner>] [--boundary <boundary>] [--limit <num>] [--json]',
  '',
  'Scans package files to filter and summarize repeated history of active/todo/done',
  'packages targeting a specific owner and boundary.',
].join('\n');

function parseCliArgs(args) {
  let packageDir = 'work/packages';
  let owner = '';
  let boundary = '';
  let limit = 12;
  let isJsonFormat = false;
  let helpRequested = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') {
      helpRequested = true;
    } else if (arg === '--json') {
      isJsonFormat = true;
    } else if (arg === '--package-dir') {
      packageDir = args[++i] || packageDir;
    } else if (arg === '--owner') {
      owner = args[++i] || owner;
    } else if (arg === '--boundary') {
      boundary = args[++i] || boundary;
    } else if (arg === '--limit') {
      limit = parseInt(args[++i], 10) || limit;
    }
  }

  return {helpRequested, packageDir, owner, boundary, limit, isJsonFormat};
}

function normalizeDateKey(value) {
  const match = String(value || '').match(/\b(20\d{2})-?(\d{2})-?(\d{2})\b/u);
  return match ? `${match[1]}${match[2]}${match[3]}` : '';
}

function extractSortableTimestamp(...values) {
  for (const value of values) {
    const match = String(value || '').match(/\b(20\d{6}T\d{6}Z)\b/u);
    if (match) {
      return match[1];
    }
  }
  return '';
}

function packageSortKey(pkg = {}) {
  const timestamp = pkg.evidenceTimestamp ||
    extractSortableTimestamp(pkg.artifact, pkg.fileName, pkg.filePath);
  const dateKey =
    (timestamp ? timestamp.slice(0, 8) : '') ||
    normalizeDateKey(pkg.dateStr) ||
    normalizeDateKey(pkg.opened);
  const statusRank = STATUS_SORT_RANK[pkg.status] || STATUS_SORT_RANK.unknown;
  return [
    dateKey,
    timestamp || EMPTY_TIMESTAMP,
    statusRank,
    pkg.fileName || '',
  ].join('|');
}

function parsePackageFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, ENCODING_UTF8);
    const fileName = path.basename(filePath);

    // Parse metadata JSON
    const metadataRegex = /<!--\s*work-package\s*\n([\s\S]*?)\n\s*-->/i;
    const metadataMatch = content.match(metadataRegex);
    let metadata = {};
    if (metadataMatch && metadataMatch[1]) {
      try {
        metadata = normalizeMetadata(JSON.parse(metadataMatch[1].trim()), filePath);
      } catch (_e) {
        // Ignored
      }
    }
    const closureSummary = metadata.closureSummary || {};

    // Extract Mechanism Card fields
    const cardSectionRegex = /## Mechanism Card\s*\n([\s\S]*?)(?=\n##|$)/i;
    const cardMatch = content.match(cardSectionRegex);
    const cardFields = {};
    if (cardMatch && cardMatch[1]) {
      const lines = cardMatch[1].split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
          const colonIndex = trimmed.indexOf(':');
          if (colonIndex > 0) {
            const keyRaw = trimmed.slice(1, colonIndex).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            const valRaw = trimmed.slice(colonIndex + 1).trim();
            cardFields[keyRaw] = valRaw;
          }
        }
      }
    }

    const dateRegex = /\d{8}/;
    const dateMatch = fileName.match(dateRegex);
    const owner = metadata.intent?.owner || metadata.owner || 'unknown';
    const boundary = metadata.intent?.boundary || metadata.boundary || 'unknown';
    const opened = metadata.intent?.opened || metadata.opened || 'unknown';
    const artifact =
      closureSummary.evidenceArtifact ||
      metadata.intent?.artifact ||
      metadata.artifact ||
      'none';
    const evidenceTimestamp = extractSortableTimestamp(
      closureSummary.evidenceArtifact,
      metadata.intent?.artifact,
      metadata.artifact,
      fileName,
    );
    const dateStr = dateMatch ? dateMatch[0] : opened;

    const parsed = {
      fileName,
      filePath,
      status: metadata.status || 'unknown',
      opened,
      dateStr,
      title: fileName.replace(/^(done|active|todo|superseded)-\d{8}-/, '').replace(/\.md$/, '').replace(/-/g, ' '),
      lane: metadata.intent?.lane || metadata.lane || 'unknown',
      owner,
      boundary,
      artifact,
      evidenceTimestamp,
      failureMechanism: cardFields.failuremechanism || metadata.mechanismCard?.failureMechanism || 'unknown',
      expectedMovement: closureSummary.observedMovement || cardFields.expectedmovement || metadata.mechanismCard?.expectedMovement || 'unknown',
      outcome: closureSummary.successorReason || cardFields.negativeresultmeans || metadata.mechanismCard?.negativeResultMeans || 'unknown',
      resultClassification: closureSummary.resultClassification || 'unknown',
      predictionAccuracy: closureSummary.predictionAccuracy || 'unknown',
      nextOwnerBoundary: closureSummary.nextOwnerBoundary || 'unknown',
    };
    parsed.sortKey = packageSortKey(parsed);
    return parsed;
  } catch (_error) {
    return null;
  }
}

function filterAndSummarizeHistory(parsedPackages, ownerFilter, boundaryFilter, limit) {
  // Sort newest first, including same-day artifact timestamps when available.
  const sorted = parsedPackages
    .filter(Boolean)
    .sort((a, b) => packageSortKey(b).localeCompare(packageSortKey(a)));

  const filtered = sorted.filter((pkg) => {
    let match = true;
    if (ownerFilter) {
      match = match && pkg.owner.toLowerCase().includes(ownerFilter.toLowerCase());
    }
    if (boundaryFilter) {
      match = match && pkg.boundary.toLowerCase().includes(boundaryFilter.toLowerCase());
    }
    return match;
  });

  const limited = filtered.slice(0, limit);

  return limited.map((pkg) => ({
    package: pkg.fileName,
    title: pkg.title,
    status: pkg.status,
    opened: pkg.opened,
    owner: pkg.owner,
    boundary: pkg.boundary,
    artifact: pkg.artifact,
    failureMechanism: pkg.failureMechanism,
    expectedMovement: pkg.expectedMovement,
    outcome: pkg.outcome,
    resultClassification: pkg.resultClassification,
    predictionAccuracy: pkg.predictionAccuracy,
    nextOwnerBoundary: pkg.nextOwnerBoundary,
  }));
}

function renderTextHistory(history, owner, boundary) {
  const lines = [
    '================================================================================',
    `                       FRONTIER HISTORY: ${owner || 'ANY'} / ${boundary || 'ANY'}`,
    '================================================================================',
  ];

  if (history.length === 0) {
    lines.push('No packages matching owner/boundary criteria found.');
  } else {
    for (const item of history) {
      lines.push(`Package: ${item.package} [${item.status}]`);
      lines.push(`Title: ${item.title}`);
      lines.push(`Owner / Boundary: ${item.owner} / ${item.boundary}`);
      lines.push(`Artifact Cited: ${item.artifact}`);
      lines.push(`Mechanism Class: ${item.failureMechanism}`);
      if (item.resultClassification && item.resultClassification !== 'unknown') {
        lines.push(`Result Classification: ${item.resultClassification}`);
      }
      if (item.predictionAccuracy && item.predictionAccuracy !== 'unknown') {
        lines.push(`Prediction Accuracy: ${item.predictionAccuracy}`);
      }
      lines.push(`Expected Movement: ${item.expectedMovement}`);
      lines.push(`Outcome: ${item.outcome}`);
      if (item.nextOwnerBoundary && item.nextOwnerBoundary !== 'unknown') {
        lines.push(`Next Owner / Boundary: ${item.nextOwnerBoundary}`);
      }
      lines.push('--------------------------------------------------------------------------------');
    }
  }

  return lines.join('\n');
}

function main(argv) {
  const parsedArgs = parseCliArgs(argv.slice(2));
  if (parsedArgs.helpRequested) {
    process.stdout.write(`${HELP_TEXT}\n`);
    return EXIT_SUCCESS;
  }

  const resolvedDir = path.resolve(parsedArgs.packageDir);
  if (!fs.existsSync(resolvedDir)) {
    process.stderr.write(`Error: Package directory does not exist: ${parsedArgs.packageDir}\n`);
    return EXIT_FAILURE;
  }

  try {
    const files = fs.readdirSync(resolvedDir);
    const mdFiles = files.filter((f) =>
      f.endsWith('.md') &&
      (f.startsWith('done-') ||
       f.startsWith('active-') ||
       f.startsWith('todo-') ||
       f.startsWith('superseded-')),
    );

    const parsed = mdFiles.map((f) => parsePackageFile(path.join(resolvedDir, f))).filter(Boolean);
    const history = filterAndSummarizeHistory(
      parsed,
      parsedArgs.owner,
      parsedArgs.boundary,
      parsedArgs.limit,
    );

    const output = parsedArgs.isJsonFormat ?
      JSON.stringify(history, null, 2) :
      renderTextHistory(history, parsedArgs.owner, parsedArgs.boundary);

    process.stdout.write(`${output}\n`);
    return EXIT_SUCCESS;
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    return EXIT_FAILURE;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv);
}

export {
  parsePackageFile,
  filterAndSummarizeHistory,
  renderTextHistory,
};
