#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {normalizeMetadata} from './work-package-schema.js';
import {
  computeLoopMetrics,
  detectCompositionalSignals,
  filterAndSummarizeHistory,
  parsePackageFile,
} from './work-frontier-history.js';

const DEFAULT_PACKAGE_DIR = 'work/packages';
const EXIT_FAILURE = 2;
const EXIT_SUCCESS = 0;
const HELP_TEXT = [
  'Usage: npm run work:loop-health -- --owner <owner> --boundary <boundary> [--limit 12] [--json]',
  '',
  'Summarizes ping-pong risk, route progress, supersede ratio, and next legal move',
  'for one owner/boundary pair.',
].join('\n');

function parseArgs(args) {
  let packageDir = DEFAULT_PACKAGE_DIR;
  let owner = '';
  let boundary = '';
  let limit = 12;
  let json = false;
  let help = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--package-dir') {
      packageDir = args[++index] || packageDir;
    } else if (arg === '--owner') {
      owner = args[++index] || owner;
    } else if (arg === '--boundary') {
      boundary = args[++index] || boundary;
    } else if (arg === '--limit') {
      limit = Number.parseInt(args[++index], 10) || limit;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--help' || arg === '-h') {
      help = true;
    }
  }
  return {boundary, help, json, limit, owner, packageDir};
}

function extractMetadata(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(/<!--\s*work-package\s*\n([\s\S]*?)\n\s*-->/iu);
    if (!match) {
      return {};
    }
    return normalizeMetadata(JSON.parse(match[1].trim()), filePath);
  } catch {
    return {};
  }
}

function pairMatches(metadata, owner, boundary) {
  const metadataOwner = metadata.intent?.owner || metadata.owner || '';
  const metadataBoundary = metadata.intent?.boundary || metadata.boundary || '';
  return (!owner || metadataOwner === owner) && (!boundary || metadataBoundary === boundary);
}

function packageMetadata(packageDir, owner, boundary) {
  const resolvedDir = path.resolve(packageDir);
  if (!fs.existsSync(resolvedDir)) {
    return [];
  }
  return fs.readdirSync(resolvedDir)
    .filter((fileName) => fileName.endsWith('.md'))
    .filter((fileName) =>
      /^(?:active|todo|done|superseded)-/u.test(fileName))
    .map((fileName) => {
      const filePath = path.join(resolvedDir, fileName);
      return {fileName, filePath, metadata: extractMetadata(filePath)};
    })
    .filter((entry) => pairMatches(entry.metadata, owner, boundary));
}

function selectedLayer(metadata) {
  return metadata.theoryLoop?.architectureRoute?.selectedLayer ||
    metadata.architectureRoute?.selectedLayer ||
    '';
}

function metricDelta(metadata) {
  const value = metadata.observablePrediction?.metricDelta;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function contractRefs(metadata) {
  const refs = [
    metadata.systemContractRef,
    metadata.sliceTheory?.systemTheoryRef,
    metadata.modelTheory?.linkedSystemTheoryRef,
  ].filter((value) =>
    typeof value === 'string' &&
    value.startsWith('architecture/contracts/'));
  return [...new Set(refs)];
}

function computeHealthSummary(history, metadataEntries) {
  const metrics = computeLoopMetrics(history);
  const signals = detectCompositionalSignals(history);
  const total = metadataEntries.length;
  const doneCount = metadataEntries.filter((entry) =>
    entry.metadata.status === 'done').length;
  const supersededCount = metadataEntries.filter((entry) =>
    entry.metadata.status === 'superseded').length;
  const sameFrontierCount = history.filter((entry) =>
    entry.resultClassification === 'same-frontier').length;
  const routeNoProgressCount = metadataEntries.filter((entry) =>
    selectedLayer(entry.metadata) && metricDelta(entry.metadata) !== null &&
    metricDelta(entry.metadata) <= 0).length;
  const contractRefSet = new Set();
  for (const entry of metadataEntries) {
    for (const ref of contractRefs(entry.metadata)) {
      contractRefSet.add(ref);
    }
  }
  const supersedeRatio = total === 0 ? 0 : supersededCount / total;
  const riskScore =
    (sameFrontierCount >= 2 ? 1 : 0) +
    (routeNoProgressCount >= 2 ? 1 : 0) +
    (supersedeRatio >= 0.25 ? 1 : 0) +
    (signals.length > 0 ? 1 : 0);
  const pingPongRisk = riskScore >= 3 ? 'high' : riskScore >= 1 ? 'medium' : 'low';
  let nextLegalMove = 'continue with the lightest package selected by current evidence';
  if (metrics.architectureRouteState === 'implement-pending') {
    nextLegalMove = 'open the architecture-route implementation package for the selected layer';
  } else if (metrics.loopHealth === 'exhausted') {
    nextLegalMove = 'open architecture-gap-analysis or rotate owner/layer before another local patch';
  } else if (pingPongRisk === 'high') {
    nextLegalMove = 'run contract-level discriminator before another runtime package';
  }
  return {
    doneCount,
    loopMetrics: metrics,
    nextLegalMove,
    pingPongRisk,
    routeNoProgressCount,
    sameFrontierCount,
    signals,
    supersedeRatio: Number(supersedeRatio.toFixed(2)),
    supersededCount,
    systemContractRefs: [...contractRefSet].sort(),
    totalPackages: total,
  };
}

function loadHistory(packageDir, owner, boundary, limit) {
  const resolvedDir = path.resolve(packageDir);
  const files = fs.readdirSync(resolvedDir)
    .filter((fileName) => fileName.endsWith('.md'))
    .filter((fileName) =>
      /^(?:active|todo|done|superseded)-/u.test(fileName));
  const parsed = files
    .map((fileName) => parsePackageFile(path.join(resolvedDir, fileName)))
    .filter(Boolean);
  return filterAndSummarizeHistory(parsed, owner, boundary, limit);
}

function renderText(summary, owner, boundary) {
  const lines = [
    '# Work Loop Health',
    '',
    `Owner: ${owner || 'all'}`,
    `Boundary: ${boundary || 'all'}`,
    `Ping-pong risk: ${summary.pingPongRisk}`,
    `Next legal move: ${summary.nextLegalMove}`,
    '',
    '## Metrics',
    `- totalPackages: ${summary.totalPackages}`,
    `- doneCount: ${summary.doneCount}`,
    `- supersededCount: ${summary.supersededCount}`,
    `- supersedeRatio: ${summary.supersedeRatio}`,
    `- sameFrontierCount: ${summary.sameFrontierCount}`,
    `- routeNoProgressCount: ${summary.routeNoProgressCount}`,
    `- loopHealth: ${summary.loopMetrics.loopHealth}`,
    `- architectureRouteState: ${summary.loopMetrics.architectureRouteState}`,
    '',
    '## System Contract Refs',
  ];
  if (summary.systemContractRefs.length === 0) {
    lines.push('- none recorded');
  } else {
    for (const ref of summary.systemContractRefs) {
      lines.push(`- ${ref}`);
    }
  }
  lines.push('', '## Compositional Signals');
  if (summary.signals.length === 0) {
    lines.push('- none');
  } else {
    for (const signal of summary.signals) {
      lines.push(`- ${signal.pattern}: ${signal.mechanism}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function main(argv) {
  const args = parseArgs(argv.slice(2));
  if (args.help) {
    process.stdout.write(`${HELP_TEXT}\n`);
    return EXIT_SUCCESS;
  }
  const resolvedDir = path.resolve(args.packageDir);
  if (!fs.existsSync(resolvedDir)) {
    process.stderr.write(`Package directory does not exist: ${args.packageDir}\n`);
    return EXIT_FAILURE;
  }
  const history = loadHistory(args.packageDir, args.owner, args.boundary, args.limit);
  const metadataEntries = packageMetadata(args.packageDir, args.owner, args.boundary);
  const summary = computeHealthSummary(history, metadataEntries);
  if (args.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    process.stdout.write(renderText(summary, args.owner, args.boundary));
  }
  return EXIT_SUCCESS;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv);
}

export {
  computeHealthSummary,
  packageMetadata,
};
