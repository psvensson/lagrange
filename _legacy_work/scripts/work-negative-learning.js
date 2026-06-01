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
  'Usage: npm run work:negative-learning -- [--package-dir <dir>] [--limit <num>] [--json]',
  '',
  'Scans package files to extract and summarize recent lessons, ruled out failure',
  'mechanisms, invariant facts, and next proposed mechanisms to test.',
].join('\n');

function parseCliArgs(args) {
  let packageDir = 'work/packages';
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
    } else if (arg === '--limit') {
      limit = parseInt(args[++i], 10) || limit;
    }
  }

  return {helpRequested, packageDir, limit, isJsonFormat};
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
    statusRank,
    timestamp || EMPTY_TIMESTAMP,
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

    // Extract date from filename if possible: e.g. active-20260528-title.md
    const dateRegex = /\d{8}/;
    const dateMatch = fileName.match(dateRegex);
    const opened = metadata.intent?.opened || metadata.opened || 'unknown';
    const owner = metadata.intent?.owner || metadata.owner || 'unknown';
    const boundary = metadata.intent?.boundary || metadata.boundary || 'unknown';
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

    // Ruled out mechanisms
    const whyNot = cardFields.whynotthealternatives || metadata.mechanismCard?.rejectedAlternatives || '';
    const negMeans = closureSummary.successorReason || cardFields.negativeresultmeans || metadata.mechanismCard?.negativeResultMeans || '';

    // Stable invariants
    const stableFacts = cardFields.stablefacts || metadata.mechanismCard?.stableFacts || '';

    // Next mechanism to test
    const nextMech = closureSummary.nextOwnerBoundary || cardFields.expectedmovement || metadata.mechanismCard?.expectedMovement || '';

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
      currentState: closureSummary.observedMovement || metadata.intent?.currentState || 'unknown',
      nextAction: metadata.intent?.nextAction || 'unknown',
      whyNotAlternatives: whyNot,
      negativeResultMeans: negMeans,
      stableFacts,
      expectedMovement: nextMech,
    };
    parsed.sortKey = packageSortKey(parsed);
    return parsed;
  } catch (_error) {
    return null;
  }
}

function summarizeLessons(parsedPackages, limit) {
  // Sort newest first, including same-day artifact timestamps when available.
  const sorted = parsedPackages
    .filter(Boolean)
    .sort((a, b) => packageSortKey(b).localeCompare(packageSortKey(a)));

  const limited = sorted.slice(0, limit);
  const lessons = [];

  for (const pkg of limited) {
    const ruledOut = [];
    if (pkg.whyNotAlternatives && pkg.whyNotAlternatives !== 'unknown') {
      ruledOut.push(pkg.whyNotAlternatives);
    }
    if (pkg.negativeResultMeans && pkg.negativeResultMeans !== 'unknown') {
      ruledOut.push(pkg.negativeResultMeans);
    }

    lessons.push({
      package: pkg.fileName,
      title: pkg.title,
      status: pkg.status,
      opened: pkg.opened,
      lane: pkg.lane,
      owner: pkg.owner,
      boundary: pkg.boundary,
      lesson: pkg.currentState !== 'unknown' ? pkg.currentState : pkg.nextAction,
      ruledOutMechanisms: ruledOut.length > 0 ? ruledOut.join('; ') : 'none',
      invariantFacts: pkg.stableFacts !== 'unknown' ? pkg.stableFacts : 'none',
      nextMechanismProposed: pkg.expectedMovement !== 'unknown' ? pkg.expectedMovement : 'none',
    });
  }

  return lessons;
}

function renderTextSummary(lessons) {
  const lines = [
    '================================================================================',
    '                           NEGATIVE LEARNING SUMMARY                            ',
    '================================================================================',
  ];

  if (lessons.length === 0) {
    lines.push('No packages with valid metadata found.');
  } else {
    for (const item of lessons) {
      lines.push(`Package: ${item.package} [${item.status}]`);
      lines.push(`Title: ${item.title}`);
      lines.push(`Owner / Boundary: ${item.owner} / ${item.boundary}`);
      lines.push(`Current State / Lesson: ${item.lesson}`);
      lines.push(`Ruled Out Mechanisms: ${item.ruledOutMechanisms}`);
      lines.push(`Invariant Facts: ${item.invariantFacts}`);
      lines.push(`Next Proposed: ${item.nextMechanismProposed}`);
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
    const lessons = summarizeLessons(parsed, parsedArgs.limit);

    const output = parsedArgs.isJsonFormat ?
      JSON.stringify(lessons, null, 2) :
      renderTextSummary(lessons);

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
  summarizeLessons,
  renderTextSummary,
};
