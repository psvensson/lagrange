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
      architectureGap: packageMetadataIsArchitectureGap(metadata, fileName),
      architectureRoute: Boolean(
        metadata?.theoryLoop?.architectureRoute ||
        metadata?.architectureRoute,
      ),
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
    lane: pkg.lane,
    owner: pkg.owner,
    boundary: pkg.boundary,
    artifact: pkg.artifact,
    failureMechanism: pkg.failureMechanism,
    expectedMovement: pkg.expectedMovement,
    outcome: pkg.outcome,
    resultClassification: pkg.resultClassification,
    predictionAccuracy: pkg.predictionAccuracy,
    nextOwnerBoundary: pkg.nextOwnerBoundary,
    architectureGap: pkg.architectureGap === true,
    architectureRoute: pkg.architectureRoute === true,
  }));
}

const EMERGENT_MECHANISM_TERMS = Object.freeze([
  'coupled_invariants',
  'emergent_oscillation',
  'protocol_mismatch',
  'feedback_amplification',
]);
const COMPOSITIONAL_PAIRS = Object.freeze([
  ['transition_gap', 'scheduling_gap'],
  ['contract_gap', 'ownership_gap'],
  ['concurrency_gap', 'budget_gap'],
]);
const COMPOSITIONAL_MIN_REPEAT = 3;
const REDERIVE_REVISION_SLUG_PATTERNS = Object.freeze([
  /system-theory-rederive/iu,
  /system-theory-revision/iu,
  /system-theory-rev\b/iu,
  /whole-system-theory/iu,
]);
const REDERIVE_LANE_VALUES = new Set([
  'system-theory-rederive',
  'system-theory-revision',
  'theory-rederive',
]);
const MECHANISM_TAXONOMY_PATTERN =
  /\b(?:observation_gap|selection_gap|admission_gap|transition_gap|scheduling_gap|budget_gap|concurrency_gap|contract_gap|ownership_gap|downstream_symptom|coupled_invariants|emergent_oscillation|protocol_mismatch|feedback_amplification)\b/iu;

function extractMechanismTerm(value) {
  if (!value || typeof value !== 'string') return null;
  const match = value.match(MECHANISM_TAXONOMY_PATTERN);
  return match ? match[0].toLowerCase() : null;
}

function packageIsRederive(item) {
  if (!item) return false;
  const lane = String(item.lane || '').toLowerCase();
  if (REDERIVE_LANE_VALUES.has(lane)) return true;
  const slug = String(item.package || item.fileName || '').toLowerCase();
  return REDERIVE_REVISION_SLUG_PATTERNS.some((re) => re.test(slug));
}

const ARCHITECTURE_GAP_HISTORY_SLUG_PATTERN = /architecture[-_]gap/iu;

// Metadata-aware detector used while parsing a package file (full metadata
// available). Mirrors metadataIsArchitectureGapAnalysis in work-tracker.js.
function packageMetadataIsArchitectureGap(metadata, fileName) {
  if (!metadata || typeof metadata !== 'object') return false;
  if (metadata.architectureGapAnalysis === true) return true;
  const packageClass = String(metadata.modelFit?.packageClass || '')
    .trim().toLowerCase();
  if (packageClass && /^architecture-gap(?:[-\s]|$)/iu.test(packageClass)) {
    return true;
  }
  const lane = String(metadata.intent?.lane || metadata.lane || '')
    .trim().toLowerCase();
  const slug = String(fileName || '').toLowerCase();
  if (ARCHITECTURE_GAP_HISTORY_SLUG_PATTERN.test(slug)) {
    return lane === 'architecture-gap-analysis' || lane === 'causal-escalation';
  }
  return lane === 'architecture-gap-analysis';
}

// History-item detector (summarised item; relies on the architectureGap flag
// captured at parse time, with a slug fallback for legacy entries).
function packageIsArchitectureGap(item) {
  if (!item) return false;
  if (item.architectureGap === true) return true;
  const slug = String(item.package || item.fileName || '').toLowerCase();
  return ARCHITECTURE_GAP_HISTORY_SLUG_PATTERN.test(slug);
}

function detectCompositionalSignals(history) {
  // history is newest-first per filterAndSummarizeHistory; reorder oldest-first for sequence reasoning.
  const ordered = [...history].reverse();
  const mechanisms = ordered
    .map((item) => extractMechanismTerm(item.failureMechanism))
    .filter(Boolean);

  const signals = [];

  // Pattern 1: emergent-class term present anywhere in window
  for (const term of EMERGENT_MECHANISM_TERMS) {
    if (mechanisms.includes(term)) {
      signals.push({
        pattern: 'emergent-class-present',
        mechanism: term,
        recommendation: 'auto-promote-systemTheory-rev',
        reason: `Emergent-class mechanism ${term} present in frontier history; ` +
          `local slice cannot resolve emergent dynamics.`,
      });
    }
  }

  // Pattern 2: same mechanism repeated 3+ in a row
  for (let i = 0; i + COMPOSITIONAL_MIN_REPEAT <= mechanisms.length; i++) {
    const window = mechanisms.slice(i, i + COMPOSITIONAL_MIN_REPEAT);
    if (window.every((m) => m === window[0]) && window[0]) {
      signals.push({
        pattern: 'same-mechanism-repeat',
        mechanism: window[0],
        recommendation: 'auto-promote-systemTheory-rev',
        reason: `Mechanism ${window[0]} selected in ${COMPOSITIONAL_MIN_REPEAT} ` +
          `consecutive packages without invariant movement.`,
      });
      break;
    }
  }

  // Pattern 3: alternating pair from COMPOSITIONAL_PAIRS
  for (const [a, b] of COMPOSITIONAL_PAIRS) {
    for (let i = 0; i + COMPOSITIONAL_MIN_REPEAT <= mechanisms.length; i++) {
      const window = mechanisms.slice(i, i + COMPOSITIONAL_MIN_REPEAT);
      const hasA = window.includes(a);
      const hasB = window.includes(b);
      const onlyAB = window.every((m) => m === a || m === b);
      if (hasA && hasB && onlyAB) {
        signals.push({
          pattern: 'compositional-pair-alternation',
          mechanism: `${a}+${b}`,
          recommendation: 'auto-promote-systemTheory-rev',
          reason: `Mechanisms ${a} and ${b} alternate across ` +
            `${COMPOSITIONAL_MIN_REPEAT} consecutive packages; this pair ` +
            'indicates a systemic coupling rather than two independent gaps.',
        });
        break;
      }
    }
  }

  // Pattern 4 (R7): pair-alternation-post-rederive — alternation persists
  // AFTER the most recent closed rederive on this owner/boundary window.
  // history is filtered by owner+boundary already; locate the last rederive
  // index in oldest-first order, then check whether the alternation window
  // sits at or after that index.
  const lastRederiveOrderedIndex = (() => {
    let lastIndex = -1;
    for (let i = 0; i < ordered.length; i++) {
      if (packageIsRederive(ordered[i])) lastIndex = i;
    }
    return lastIndex;
  })();
  if (lastRederiveOrderedIndex >= 0) {
    const mechanismsAfter = ordered
      .slice(lastRederiveOrderedIndex + 1)
      .map((item) => extractMechanismTerm(item.failureMechanism))
      .filter(Boolean);
    for (const [a, b] of COMPOSITIONAL_PAIRS) {
      let fired = false;
      for (let i = 0; i + COMPOSITIONAL_MIN_REPEAT <= mechanismsAfter.length; i++) {
        const window = mechanismsAfter.slice(i, i + COMPOSITIONAL_MIN_REPEAT);
        const hasA = window.includes(a);
        const hasB = window.includes(b);
        const onlyAB = window.every((m) => m === a || m === b);
        if (hasA && hasB && onlyAB) {
          fired = true;
          break;
        }
      }
      // Also detect same-mechanism-repeat after rederive — equally bad.
      let repeatAfter = null;
      for (let i = 0; i + COMPOSITIONAL_MIN_REPEAT <= mechanismsAfter.length; i++) {
        const window = mechanismsAfter.slice(i, i + COMPOSITIONAL_MIN_REPEAT);
        if (window.every((m) => m === window[0]) && window[0]) {
          repeatAfter = window[0];
          break;
        }
      }
      if (fired) {
        signals.push({
          pattern: 'pair-alternation-post-rederive',
          mechanism: `${a}+${b}`,
          recommendation: 'escalate-to-architecture-gap',
          reason: `Mechanisms ${a} and ${b} continue to alternate after the ` +
            'most recent system-theory-rederive on this owner/boundary; the ' +
            'rederive did not change the loop trajectory and architecture-gap ' +
            'escalation is now required.',
        });
      } else if (repeatAfter && [a, b].includes(repeatAfter)) {
        signals.push({
          pattern: 'pair-alternation-post-rederive',
          mechanism: `${repeatAfter}-repeat`,
          recommendation: 'escalate-to-architecture-gap',
          reason: `Mechanism ${repeatAfter} continues to repeat after the most ` +
            'recent system-theory-rederive on this owner/boundary; the rederive ' +
            'did not move the loop and architecture-gap escalation is now ' +
            'required.',
        });
      }
    }
  }

  // De-duplicate by pattern+mechanism
  const dedup = new Map();
  for (const sig of signals) {
    const key = `${sig.pattern}|${sig.mechanism}`;
    if (!dedup.has(key)) dedup.set(key, sig);
  }
  return Array.from(dedup.values());
}

function findAlternatingPairBoundaries(parsedPackages, owner, boundary, limit = 24) {
  // Walks the recent N packages globally (no owner/boundary filter) and finds
  // the second boundary whose mechanism participates in a compositional pair
  // with the given owner/boundary's mechanism. Returns up to two boundary
  // descriptors {owner, boundary} sorted by recency.
  const sorted = [...parsedPackages]
    .filter(Boolean)
    .sort((a, b) => packageSortKey(b).localeCompare(packageSortKey(a)));
  const window = sorted.slice(0, limit);
  const ourSet = new Set();
  const otherSet = new Map();
  for (const pkg of window) {
    const mech = extractMechanismTerm(pkg.failureMechanism);
    if (!mech) continue;
    const key = `${pkg.owner}::${pkg.boundary}`;
    if (
      pkg.owner.toLowerCase().includes((owner || '').toLowerCase()) &&
      pkg.boundary.toLowerCase().includes((boundary || '').toLowerCase())
    ) {
      ourSet.add(mech);
      continue;
    }
    for (const [a, b] of COMPOSITIONAL_PAIRS) {
      if (mech !== a && mech !== b) continue;
      // Pair candidate; record once
      if (!otherSet.has(key)) {
        otherSet.set(key, {owner: pkg.owner, boundary: pkg.boundary, mechanism: mech});
      }
    }
  }
  // Only emit pairs whose mechanism partners ours via COMPOSITIONAL_PAIRS.
  const ourMechs = Array.from(ourSet);
  const result = [];
  for (const candidate of otherSet.values()) {
    const partnersOurs = ourMechs.some((om) =>
      COMPOSITIONAL_PAIRS.some(([a, b]) =>
        (om === a && candidate.mechanism === b) ||
        (om === b && candidate.mechanism === a) ||
        (om === a && candidate.mechanism === a) ||
        (om === b && candidate.mechanism === b),
      ),
    );
    if (partnersOurs) result.push(candidate);
  }
  return result.slice(0, 2);
}

function computeLoopMetrics(history) {
  // history is newest-first.
  const lastRederive = history.find((item) => packageIsRederive(item));
  const closuresSinceLastRederive = (() => {
    if (!lastRederive) return history.length;
    let count = 0;
    for (const item of history) {
      if (item === lastRederive) break;
      if (item.status === 'done') count += 1;
    }
    return count;
  })();
  const signals = detectCompositionalSignals(history);
  const postRederive = signals.some((s) =>
    s.pattern === 'pair-alternation-post-rederive',
  );
  const rederiveActive = history.some((item) =>
    item.status === 'active' && packageIsRederive(item),
  );
  let loopHealth = 'healthy';
  if (postRederive) loopHealth = 'exhausted';
  else if (rederiveActive) loopHealth = 'rederive-in-progress';
  else if (signals.length > 0) loopHealth = 'compositional-signal-active';
  // continuationRequired is the non-halting self-report: any non-healthy loop
  // state is non-terminal and obliges an autonomous redirect (next option,
  // successor package, rederive, or architecture-gap experiment). It must never
  // be read as a stopping point. The only legitimate stops are the closed
  // termination set (success-condition-met, blocked-frozen-decision,
  // blocked-external-dependency); none of those are inferable from history
  // alone, so a true stop is always recorded explicitly on the sprint.
  const continuationRequired = loopHealth !== 'healthy';
  // R13 self-report: detect whether the loop is waiting for the runtime
  // implementation of an already-selected architecture route. history is
  // newest-first. Find the most recent CLOSED architecture-gap analysis; if a
  // route implementation (architectureRoute marker) closed at/after it, the
  // route is implemented, otherwise the loop is implement-pending.
  const architectureRouteState = (() => {
    const closed = history.filter((item) => item.status === 'done');
    const gapIndex = closed.findIndex((item) => packageIsArchitectureGap(item));
    if (gapIndex === -1) return 'none';
    const gap = closed[gapIndex];
    // Newer-or-equal closures are those before gapIndex (newest-first order).
    const since = closed.slice(0, gapIndex);
    const implemented = since.some((item) => item.architectureRoute === true);
    return implemented ? 'implemented' : 'implement-pending';
  })();
  return {
    lastRederiveDateOnPair: lastRederive
      ? (lastRederive.opened || lastRederive.dateStr || 'unknown')
      : 'none',
    lastRederivePackage: lastRederive ? lastRederive.package : 'none',
    closuresSinceLastRederive,
    pairAlternationCyclesSinceRederive: signals.filter((s) =>
      s.pattern === 'pair-alternation-post-rederive',
    ).length,
    loopHealth,
    continuationRequired,
    architectureRouteState,
  };
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

    const signals = detectCompositionalSignals(history);
    lines.push('');
    lines.push('COMPOSITIONAL SIGNALS:');
    if (signals.length === 0) {
      lines.push('  - none (varied mechanisms, no saturation pattern detected)');
    } else {
      for (const sig of signals) {
        lines.push(`  - [${sig.pattern}] mechanism=${sig.mechanism}`);
        lines.push(`      recommendation: ${sig.recommendation}`);
        lines.push(`      reason: ${sig.reason}`);
      }
    }
    const metrics = computeLoopMetrics(history);
    lines.push('');
    lines.push('LOOP METRICS:');
    lines.push(`  - lastRederiveDateOnPair: ${metrics.lastRederiveDateOnPair}`);
    lines.push(`  - lastRederivePackage: ${metrics.lastRederivePackage}`);
    lines.push(`  - closuresSinceLastRederive: ${metrics.closuresSinceLastRederive}`);
    lines.push(`  - pairAlternationCyclesSinceRederive: ${metrics.pairAlternationCyclesSinceRederive}`);
    lines.push(`  - loopHealth: ${metrics.loopHealth}`);
    lines.push(`  - continuationRequired: ${metrics.continuationRequired}`);
    lines.push(`  - architectureRouteState: ${metrics.architectureRouteState}`);
    if (metrics.architectureRouteState === 'implement-pending') {
      lines.push(
        '      note: an architecture-gap analysis already SELECTED a route on ' +
        'this pair. The only valid next package is the runtime implementation ' +
        'of that route (declare theoryLoop.architectureRoute with selectedLayer, ' +
        'coupledInvariant, and the architecture-gap ledgerRef). Another rederive ' +
        'or architecture-gap analysis on this pair is NOT a valid redirect.',
      );
    }
    if (metrics.continuationRequired) {
      lines.push(
        metrics.architectureRouteState === 'implement-pending'
          ? '      note: loop is non-terminal AND a route is already selected; ' +
            'redirect specifically to the architecture-route implementation ' +
            'above. Do not stop unless a closed termination reason is recorded.'
          : '      note: loop is in a non-terminal state; redirect to the next ' +
            'option/successor/rederive/arch-gap. Do not stop unless a closed ' +
            'termination reason is recorded.',
      );
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
      JSON.stringify({
        history,
        compositionalSignals: detectCompositionalSignals(history),
        loopMetrics: computeLoopMetrics(history),
      }, null, 2) :
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
  detectCompositionalSignals,
  findAlternatingPairBoundaries,
  computeLoopMetrics,
  packageIsRederive,
  extractMechanismTerm,
  EMERGENT_MECHANISM_TERMS,
  COMPOSITIONAL_PAIRS,
};
