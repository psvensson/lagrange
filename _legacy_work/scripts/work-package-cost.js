#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {normalizeMetadata} from './work-package-schema.js';

const ENCODING_UTF8 = 'utf8';
const EMPTY_TEXT = '';
const NEWLINE = '\n';
const NUM_ZERO = 0;
const NUM_ONE = 1;
const NUM_TWO = 2;
const DECIMAL_PLACES = 2;
const HIGH_COST_FRONTIER_THRESHOLD = 2;
const WORK_PACKAGES_DIR = path.join('work', 'packages');
const PACKAGE_METADATA_OPEN = '<!-- work-package';
const PACKAGE_METADATA_CLOSE = '-->';
const DONE_PACKAGE_PATTERN = /^done-.+\.md$/u;
const MOVEMENT_RESULTS = Object.freeze([
  'representative-green',
  'reduced',
  'migrated',
]);
const NON_MOVEMENT_RESULTS = Object.freeze([
  'same-frontier',
  'classification-only',
  'architecture-gap',
  'contradictory',
]);
const PREDICTION_MATCH_RESULTS = Object.freeze(['matched']);
const PREDICTION_MISS_RESULTS = Object.freeze(['missed', 'contradicted']);
const NUMERIC_MOVEMENT_FIELDS = Object.freeze([
  ['observablePrediction', 'metricDelta'],
  ['representativeMovement', 'pointsMoved'],
]);

function normalizeText(value) {
  return String(value || EMPTY_TEXT).trim();
}

function normalizeRelativePath(filePath) {
  return path.normalize(filePath).split(path.sep).join('/');
}

async function listDonePackageFiles(root = process.cwd()) {
  const packageDir = path.join(root, WORK_PACKAGES_DIR);
  const entries = await fs.readdir(packageDir, {withFileTypes: true});
  return entries
    .filter((entry) => entry.isFile() && DONE_PACKAGE_PATTERN.test(entry.name))
    .map((entry) => path.join(packageDir, entry.name))
    .sort();
}

function parsePackageMetadata(content, filePath) {
  const openIndex = content.indexOf(PACKAGE_METADATA_OPEN);
  if (openIndex < NUM_ZERO) {
    return null;
  }
  const jsonStart = openIndex + PACKAGE_METADATA_OPEN.length;
  const closeIndex = content.indexOf(PACKAGE_METADATA_CLOSE, jsonStart);
  if (closeIndex < NUM_ZERO) {
    return null;
  }
  try {
    const rawMetadata = JSON.parse(content.slice(jsonStart, closeIndex).trim());
    return normalizeMetadata(rawMetadata, filePath);
  } catch {
    return null;
  }
}

function scenarioResult(metadata = {}) {
  return normalizeText(
    metadata.closureSummary?.resultClassification ||
      metadata.scenarioCausalClosure?.resultClassification ||
      metadata.causalGovernance?.representativeOutcome ||
      metadata.representativeResidual?.status,
  ).toLowerCase();
}

function predictionAccuracy(metadata = {}) {
  return normalizeText(
    metadata.closureSummary?.predictionAccuracy ||
      metadata.observablePrediction?.accuracy,
  ).toLowerCase();
}

function numericMovementPoints(metadata = {}) {
  for (const [containerField, valueField] of NUMERIC_MOVEMENT_FIELDS) {
    const container = metadata[containerField];
    if (!container || typeof container !== 'object' || Array.isArray(container)) {
      continue;
    }
    const rawValue = container[valueField];
    if (rawValue === null || rawValue === undefined || normalizeText(rawValue).length === NUM_ZERO) {
      continue;
    }
    const numericValue = Number(rawValue);
    if (Number.isFinite(numericValue) && numericValue > NUM_ZERO) {
      return numericValue;
    }
  }
  return NUM_ZERO;
}

function ownerBoundaryKey(metadata = {}) {
  const owner = normalizeText(metadata.owner) || 'unknown-owner';
  const boundary = normalizeText(metadata.boundary) || 'unknown-boundary';
  return `${owner} / ${boundary}`;
}

function incrementCounter(counters, key) {
  const normalizedKey = normalizeText(key) || 'unknown';
  counters.set(normalizedKey, (counters.get(normalizedKey) || NUM_ZERO) + NUM_ONE);
}

function counterRows(counters) {
  return [...counters.entries()].sort((left, right) =>
    right[NUM_ONE] - left[NUM_ONE] || left[NUM_ZERO].localeCompare(right[NUM_ZERO]));
}

function formatCountRows(counters) {
  const rows = counterRows(counters);
  if (rows.length === NUM_ZERO) {
    return '1. None recorded';
  }
  return rows
    .map(([key, count], index) => `${index + NUM_ONE}. \`${key}\`: ${count}`)
    .join(NEWLINE);
}

function emptyOwnerBoundarySummary() {
  return {
    total: NUM_ZERO,
    movement: NUM_ZERO,
    nonMovement: NUM_ZERO,
    predictionRecorded: NUM_ZERO,
    predictionMatched: NUM_ZERO,
    predictionMissed: NUM_ZERO,
    numericMovementPoints: NUM_ZERO,
  };
}

function formatOwnerBoundaryRows(ownerBoundaryCosts) {
  const rows = [...ownerBoundaryCosts.entries()].sort((left, right) =>
    right[NUM_ONE].total - left[NUM_ONE].total ||
    left[NUM_ZERO].localeCompare(right[NUM_ZERO]));
  if (rows.length === NUM_ZERO) {
    return '1. None recorded';
  }
  return rows
    .map(([key, cost], index) => {
      const ratio = cost.movement === NUM_ZERO ?
        'n/a' :
        (cost.total / cost.movement).toFixed(DECIMAL_PLACES);
      const numericRatio = cost.numericMovementPoints === NUM_ZERO ?
        'n/a' :
        (cost.total / cost.numericMovementPoints).toFixed(DECIMAL_PLACES);
      return `${index + NUM_ONE}. \`${key}\`: total=${cost.total}; ` +
        `movement=${cost.movement}; nonMovement=${cost.nonMovement}; ` +
        `packagesPerMovement=${ratio}; numericPoints=${cost.numericMovementPoints}; ` +
        `packagesPerNumericPoint=${numericRatio}; predictions=${cost.predictionRecorded}; ` +
        `matched=${cost.predictionMatched}; missed=${cost.predictionMissed}`;
    })
    .join(NEWLINE);
}

function formatHighCostFrontierRows(ownerBoundaryCosts) {
  const rows = [...ownerBoundaryCosts.entries()]
    .filter(([, cost]) => cost.nonMovement >= HIGH_COST_FRONTIER_THRESHOLD)
    .sort((left, right) =>
      right[NUM_ONE].nonMovement - left[NUM_ONE].nonMovement ||
      left[NUM_ZERO].localeCompare(right[NUM_ZERO]));
  if (rows.length === NUM_ZERO) {
    return '1. None above threshold';
  }
  return rows
    .map(([key, cost], index) =>
      `${index + NUM_ONE}. \`${key}\`: ${cost.nonMovement} non-movement ` +
      `packages; threshold=${HIGH_COST_FRONTIER_THRESHOLD}; action=warn`)
    .join(NEWLINE);
}

async function readPackageEntry(root, filePath) {
  const content = await fs.readFile(filePath, ENCODING_UTF8);
  return {
    path: normalizeRelativePath(path.relative(root, filePath)),
    metadata: parsePackageMetadata(content, filePath),
  };
}

function summarizePackageCost(entries = []) {
  const lanes = new Map();
  const results = new Map();
  const predictionAccuracyCounts = new Map();
  const ownerBoundaryCosts = new Map();
  let movementPackages = NUM_ZERO;
  let nonMovementPackages = NUM_ZERO;
  let predictionRecorded = NUM_ZERO;
  let predictionMatched = NUM_ZERO;
  let predictionMissed = NUM_ZERO;
  let totalNumericMovementPoints = NUM_ZERO;

  for (const entry of entries) {
    const metadata = entry.metadata || {};
    incrementCounter(lanes, metadata.lane);
    const result = scenarioResult(metadata);
    incrementCounter(results, result);
    const key = ownerBoundaryKey(metadata);
    const ownerBoundaryCost =
      ownerBoundaryCosts.get(key) || emptyOwnerBoundarySummary();
    ownerBoundaryCost.total += NUM_ONE;
    const packageNumericMovementPoints = numericMovementPoints(metadata);
    totalNumericMovementPoints += packageNumericMovementPoints;
    ownerBoundaryCost.numericMovementPoints += packageNumericMovementPoints;
    if (MOVEMENT_RESULTS.includes(result)) {
      movementPackages += NUM_ONE;
      ownerBoundaryCost.movement += NUM_ONE;
    }
    if (NON_MOVEMENT_RESULTS.includes(result)) {
      nonMovementPackages += NUM_ONE;
      ownerBoundaryCost.nonMovement += NUM_ONE;
    }
    const accuracy = predictionAccuracy(metadata);
    if (accuracy.length > NUM_ZERO) {
      predictionRecorded += NUM_ONE;
      ownerBoundaryCost.predictionRecorded += NUM_ONE;
      incrementCounter(predictionAccuracyCounts, accuracy);
      if (PREDICTION_MATCH_RESULTS.includes(accuracy)) {
        predictionMatched += NUM_ONE;
        ownerBoundaryCost.predictionMatched += NUM_ONE;
      }
      if (PREDICTION_MISS_RESULTS.includes(accuracy)) {
        predictionMissed += NUM_ONE;
        ownerBoundaryCost.predictionMissed += NUM_ONE;
      }
    }
    ownerBoundaryCosts.set(key, ownerBoundaryCost);
  }

  return {
    totalDonePackages: entries.length,
    movementPackages,
    nonMovementPackages,
    packagesPerMovementPoint: movementPackages === NUM_ZERO ?
      null :
      entries.length / movementPackages,
    totalNumericMovementPoints,
    packagesPerNumericMovementPoint: totalNumericMovementPoints === NUM_ZERO ?
      null :
      entries.length / totalNumericMovementPoints,
    predictionRecorded,
    predictionMatched,
    predictionMissed,
    lanes,
    results,
    predictionAccuracyCounts,
    ownerBoundaryCosts,
  };
}

function formatRatio(value) {
  return value === null ? 'n/a' : value.toFixed(DECIMAL_PLACES);
}

function renderPackageCostSummary(summary) {
  return [
    '# Work Package Cost',
    EMPTY_TEXT,
    `Done packages scanned: ${summary.totalDonePackages}`,
    `Movement packages: ${summary.movementPackages}`,
    `Non-movement packages: ${summary.nonMovementPackages}`,
    `Packages per movement-classified package: ${formatRatio(summary.packagesPerMovementPoint)}`,
    `Numeric representative points moved: ${summary.totalNumericMovementPoints}`,
    `Packages per numeric representative point moved: ${formatRatio(summary.packagesPerNumericMovementPoint)}`,
    `Observable predictions recorded: ${summary.predictionRecorded}`,
    `Observable predictions matched: ${summary.predictionMatched}`,
    `Observable predictions missed or contradicted: ${summary.predictionMissed}`,
    EMPTY_TEXT,
    '## Result Counts',
    EMPTY_TEXT,
    formatCountRows(summary.results),
    EMPTY_TEXT,
    '## Prediction Accuracy',
    EMPTY_TEXT,
    formatCountRows(summary.predictionAccuracyCounts),
    EMPTY_TEXT,
    '## Owner Boundary Cost',
    EMPTY_TEXT,
    formatOwnerBoundaryRows(summary.ownerBoundaryCosts),
    EMPTY_TEXT,
    '## High-Cost Frontiers',
    EMPTY_TEXT,
    formatHighCostFrontierRows(summary.ownerBoundaryCosts),
    EMPTY_TEXT,
    '## Lane Counts',
    EMPTY_TEXT,
    formatCountRows(summary.lanes),
  ].join(NEWLINE);
}

async function buildPackageCostLines(options = {}) {
  const root = options.root || process.cwd();
  const files = await listDonePackageFiles(root);
  const entries = [];
  for (const filePath of files) {
    entries.push(await readPackageEntry(root, filePath));
  }
  return renderPackageCostSummary(summarizePackageCost(entries)).split(NEWLINE);
}

async function runCli() {
  return `${(await buildPackageCostLines()).join(NEWLINE)}${NEWLINE}`;
}

function isDirectRun() {
  return process.argv[NUM_ONE] === fileURLToPath(import.meta.url);
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
  buildPackageCostLines,
  renderPackageCostSummary,
  summarizePackageCost,
};
