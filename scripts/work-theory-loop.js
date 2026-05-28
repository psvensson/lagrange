#!/usr/bin/env node

import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const ENCODING_UTF8 = 'utf8';
const EMPTY = '';
const NEWLINE = '\n';
const SPACE = ' ';
const NUM_ZERO = 0;
const NUM_ONE = 1;
const NUM_TWO = 2;
const NUM_FOUR = 4;
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const FLAG_PREFIX = '--';
const PACKAGES_DIR = path.join('work', 'packages');
const SPRINTS_DIR = path.join('work', 'sprints');
const THEORY_LEDGER_PATH = path.join('work', 'theory-ledger.md');
const CURRENT_BLOCKER_JSON = path.join('work', 'sprints', 'current-blocker.json');
const PACKAGE_METADATA_OPEN = '<!-- work-package';
const PACKAGE_METADATA_CLOSE = '-->';
const COMMAND_START = 'start';
const COMMAND_NEXT = 'next';
const COMMAND_RECORD = 'record';
const COMMAND_FIX = 'fix';
const FLAG_WRITE = 'write';
const FLAG_SPRINT = 'sprint';
const FLAG_PACKAGE = 'package';
const FLAG_TITLE = 'title';
const FLAG_SLUG = 'slug';
const FLAG_PROBLEM = 'problem';
const FLAG_ARTIFACT = 'artifact';
const FLAG_SUCCESS = 'success';
const FLAG_OWNER = 'owner';
const FLAG_BOUNDARY = 'boundary';
const FLAG_DOMINANT_REASON = 'dominant-reason';
const FLAG_MECHANISM = 'mechanism';
const FLAG_STABLE_FACT = 'stable-fact';
const FLAG_CHANGED_FACT = 'changed-fact';
const FLAG_REJECTED_ALTERNATIVE = 'rejected-alternative';
const FLAG_CURRENT_ACTION = 'current-action';
const FLAG_MISSING_EDGE = 'missing-edge';
const FLAG_EXPECTED_MOVEMENT = 'expected-movement';
const FLAG_NEGATIVE_RESULT = 'negative-result';
const FLAG_ESCALATION = 'escalation';
const FLAG_THEORY = 'theory';
const FLAG_MOVE = 'move';
const FLAG_DISCRIMINATOR = 'discriminator';
const FLAG_INSPECT = 'inspect';
const FLAG_WRITE_SCOPE = 'write-scope';
const FLAG_VALIDATION = 'validation';
const FLAG_RESULT = 'result';
const FLAG_EVIDENCE = 'evidence';
const FLAG_FILES = 'files';
const FLAG_NEXT_ACTION = 'next-action';
const FLAG_LEDGER_STATUS = 'ledger-status';
const FLAG_FIRST_RUN_REASON = 'first-run-reason';
const DEFAULT_STATUS = 'todo';
const DEFAULT_LANE = 'causal-escalation';
const PLACEHOLDER_NONE = 'none';
const DEFAULT_SCENARIO = PLACEHOLDER_NONE;
const DEFAULT_RESULT = 'supported';
const RESULT_FIXED = 'fixed';
const RESULT_AVOIDED = 'avoided';
const RESULT_SUPPORTED = 'supported';
const RESULT_FALSIFIED = 'falsified';
const RESULT_MIGRATED = 'migrated';
const RESULT_GREEN = 'representative-green';
const RESULT_ARCHITECTURE_GAP = 'architecture-gap';
const RESULT_NEEDS_RERUN = 'needs-rerun';
const VALID_RESULTS = Object.freeze([
  RESULT_FIXED,
  RESULT_AVOIDED,
  RESULT_SUPPORTED,
  RESULT_FALSIFIED,
  RESULT_MIGRATED,
  RESULT_GREEN,
  RESULT_ARCHITECTURE_GAP,
  RESULT_NEEDS_RERUN,
]);
const LEDGER_STATUS_BY_RESULT = Object.freeze({
  [RESULT_AVOIDED]: 'avoided',
  [RESULT_SUPPORTED]: 'supported',
  [RESULT_FIXED]: 'supported',
  [RESULT_FALSIFIED]: 'falsified',
  [RESULT_MIGRATED]: 'avoided',
  [RESULT_GREEN]: 'supported',
  [RESULT_ARCHITECTURE_GAP]: 'stale',
  [RESULT_NEEDS_RERUN]: 'needs-rerun',
});
const THEORY_ID_PATTERN = /^theory-[0-9]{8}-[a-z0-9-]+$/u;
const OPTION_REQUIRED_FIELDS = Object.freeze([
  'mechanism',
  'intervention',
  'modification',
  'discriminator',
  'promotion',
  'rejection',
  'layer',
]);
const OPTION_LAYER_VOCABULARY = Object.freeze([
  'protocol',
  'scheduling',
  'ownership',
  'observation',
  'topology',
  'model',
]);
const THEORY_LOOP_FIELD = 'theoryLoop';
const THEORY_LOOP_SOURCE_PACKAGE_ENFORCEMENT =
  'source-code-package-required';
const DEFAULT_CREATIVE_MOVES = Object.freeze([
  'invert ownership: ask which owner would make the blocker impossible',
  'minimal trace: capture the smallest event that would prove progress',
  'opposite intervention: prove the system should wait instead of push',
  'boundary swap: test whether the named owner lacks authority',
]);
const HELP_TEXT = [
  'Usage:',
  '  node scripts/work-theory-loop.js start --problem <text> --artifact <path> --success <text> --owner <owner> --mechanism <term> --stable-fact <text> --changed-fact <text> --rejected-alternative <text> --current-action <text> --missing-edge <text> --discriminator <command> --expected-movement <text> --negative-result <text> --escalation <text> --theory <structured-option> --theory <structured-option> [--theory <structured-option>] [--theory <structured-option>] [--move <move>] [--write]',
  '  node scripts/work-theory-loop.js next --title <title> --slug <slug> --problem <text> --artifact <path> --success <text> --owner <owner> --boundary <boundary> --dominant-reason <reason> --mechanism <term> --stable-fact <text> --changed-fact <text> --rejected-alternative <text> --current-action <text> --missing-edge <text> --discriminator <command> --expected-movement <text> --negative-result <text> --escalation <text> --theory <structured-option> --theory <structured-option> [--theory <structured-option>] [--theory <structured-option>] --write-scope <src-file> [--write-scope <src-file>] [--move <move>] [--write]',
  '  node scripts/work-theory-loop.js record --theory <id-or-label> --result <result> --evidence <text> [--package <path>] [--ledger-status <status>] [--write]',
  '  node scripts/work-theory-loop.js fix --theory <id-or-label> --evidence <text> --files <paths> --validation <command> [--package <path>] [--write]',
  '',
  'Structured option fields: mechanism:, intervention:, modification:, discriminator:, promotion:, rejection:',
  'Results: fixed, avoided, supported, falsified, migrated, representative-green, architecture-gap, needs-rerun',
].join(NEWLINE);

function normalizeText(value) {
  return String(value || EMPTY).trim();
}

function normalizeWhitespace(value) {
  return normalizeText(value).replace(/\s+/gu, SPACE);
}

function parseArgs(args = []) {
  const command = args[NUM_ZERO] || EMPTY;
  const flags = {};
  for (let index = NUM_ONE; index < args.length; index += NUM_ONE) {
    const raw = args[index];
    if (!raw.startsWith(FLAG_PREFIX)) {
      throw new Error(`Unexpected argument "${raw}".`);
    }
    const key = raw.slice(FLAG_PREFIX.length);
    if (key === FLAG_WRITE || key === 'help') {
      flags[key] = ['true'];
      continue;
    }
    const value = args[index + NUM_ONE];
    if (value === undefined || value.startsWith(FLAG_PREFIX)) {
      throw new Error(`Flag --${key} requires a value.`);
    }
    index += NUM_ONE;
    flags[key] = [...(flags[key] || []), value];
  }
  return {command, flags};
}

function firstFlag(flags, key, fallback = EMPTY) {
  return normalizeText(flags[key]?.[NUM_ZERO] || fallback);
}

function repeatedFlag(flags, key) {
  return (flags[key] || []).map(normalizeText).filter(Boolean);
}

function hasFlag(flags, key) {
  return Boolean(flags[key]);
}

function requireFlag(flags, key) {
  const value = firstFlag(flags, key);
  if (!value) {
    throw new Error(`Missing required flag --${key}.`);
  }
  return value;
}

function todayIsoDate() {
  return new Date().toISOString().slice(NUM_ZERO, 10);
}

function packagePathFor(status, opened, slug) {
  return path.join(PACKAGES_DIR, `${status}-${opened.replaceAll('-', EMPTY)}-${slug}.md`);
}

function quoteCliArg(value) {
  const normalized = String(value);
  if (/^[A-Za-z0-9_./:@=-]+$/u.test(normalized)) {
    return normalized;
  }
  return JSON.stringify(normalized);
}

function renderWriteCommand(args) {
  return ['node', ...args, `--${FLAG_WRITE}`].map(quoteCliArg).join(SPACE);
}

function sprintPackageLink(packagePath) {
  const normalized = packagePath.replace(/\\/gu, '/');
  const workPackagesPrefix = 'work/packages/';
  if (normalized.startsWith(workPackagesPrefix)) {
    return `../packages/${normalized.slice(workPackagesPrefix.length)}`;
  }
  if (normalized.startsWith('../')) {
    return normalized;
  }
  return `../${normalized}`;
}

function renderMarkdownList(values, fallback = 'none') {
  if (!values.length) {
    return `- ${fallback}`;
  }
  return values.map((value) => `- ${value}`).join(NEWLINE);
}

function renderNumberedList(values) {
  return values.map((value, index) => `${index + NUM_ONE}. ${value}`).join(NEWLINE);
}

function requireConcreteArtifact(value) {
  const artifact = normalizeWhitespace(value);
  if (!artifact || artifact === PLACEHOLDER_NONE) {
    throw new Error('Theory-loop requires a concrete representative artifact.');
  }
  return artifact;
}

function requireList(values, label) {
  const normalized = (values || []).map(normalizeWhitespace).filter(Boolean);
  if (!normalized.length) {
    throw new Error(`Theory-loop requires at least one ${label}.`);
  }
  return normalized;
}

function requireConcreteContext(options = {}) {
  const context = {
    artifact: requireConcreteArtifact(options.artifact),
    owner: normalizeWhitespace(options.owner),
    mechanism: normalizeWhitespace(options.mechanism),
    stableFacts: requireList(options.stableFacts, 'stable fact'),
    changedFacts: requireList(options.changedFacts, 'changed fact'),
    rejectedAlternatives: requireList(options.rejectedAlternatives, 'rejected alternative'),
    currentAction: normalizeWhitespace(options.currentAction),
    missingEdge: normalizeWhitespace(options.missingEdge),
    discriminator: normalizeWhitespace(options.discriminator),
    expectedMovement: normalizeWhitespace(options.expectedMovement),
    negativeResult: normalizeWhitespace(options.negativeResult),
    escalation: normalizeWhitespace(options.escalation),
  };
  for (const [label, value] of Object.entries(context)) {
    if (Array.isArray(value)) {
      continue;
    }
    if (!value) {
      throw new Error(`Theory-loop requires concrete ${label}.`);
    }
  }
  return context;
}

function isSourceCodePath(filePath) {
  const normalized = normalizeWhitespace(filePath).replace(/\\/gu, '/');
  return normalized.startsWith('src/');
}

function requireRealModificationScope(writeScope = []) {
  const normalized = (writeScope || []).map(normalizeWhitespace).filter(Boolean);
  if (!normalized.some(isSourceCodePath)) {
    throw new Error(
      'Theory-loop work packages require at least one --write-scope src/ source code file.',
    );
  }
  return normalized;
}

function validateTheories(theories) {
  if (theories.length < NUM_TWO || theories.length > NUM_FOUR) {
    throw new Error('Theory-loop option sets require 2-4 --theory values.');
  }
  const layersSeen = new Set();
  for (const theory of theories) {
    const missing = OPTION_REQUIRED_FIELDS.filter((field) =>
      !new RegExp(`\\b${field}\\s*:`, 'iu').test(theory));
    if (missing.length) {
      throw new Error(
        `Theory-loop option "${theory}" must include ${OPTION_REQUIRED_FIELDS.join(', ')} fields.`,
      );
    }
    const layerMatch = theory.match(/\blayer\s*:\s*([a-z]+)/iu);
    const layerValue = layerMatch ? layerMatch[1].toLowerCase() : '';
    if (!OPTION_LAYER_VOCABULARY.includes(layerValue)) {
      throw new Error(
        `Theory-loop option "${theory}" must declare layer: as one of ` +
        `${OPTION_LAYER_VOCABULARY.join(', ')}.`,
      );
    }
    layersSeen.add(layerValue);
  }
  if (layersSeen.size < NUM_TWO) {
    throw new Error(
      'Theory-loop option set must span at least two distinct layers ' +
      `from {${OPTION_LAYER_VOCABULARY.join(', ')}}; a single-layer option set ` +
      'cannot represent a holistic alternative.',
    );
  }
}

export function renderTheoryLoopSprintSection(options = {}) {
  const problem = normalizeWhitespace(options.problem);
  const success = normalizeWhitespace(options.success);
  const theories = options.theories || [];
  const moves = options.moves?.length ? options.moves : DEFAULT_CREATIVE_MOVES;
  const context = requireConcreteContext(options);
  validateTheories(theories);
  if (!problem || !success) {
    throw new Error('Theory-loop sprint start requires problem and success text.');
  }
  return [
    '## Theory Loop Sprint',
    '',
    `- Evidence anchor: central problem = ${problem}; representative artifact = ${context.artifact}; success condition = ${success}.`,
    '- Success condition invariant: the Evidence Anchor success condition is the original representative or release success metric, not an architecture-gap, owner-boundary migration, classification, or route-selection stop.',
    '- Stable facts:',
    renderMarkdownList(context.stableFacts),
    '- Changed facts:',
    renderMarkdownList(context.changedFacts),
    `- Mechanism card: mechanism = ${context.mechanism}; deciding owner = ${context.owner}; current action = ${context.currentAction}; missing transition or observation = ${context.missingEdge}; smallest falsifier = \`${context.discriminator}\`; expected movement = ${context.expectedMovement}; negative result means = ${context.negativeResult}; escalation rule = ${context.escalation}.`,
    '- Rejected alternatives:',
    renderMarkdownList(context.rejectedAlternatives),
    '- Theory option set: options are hypotheses to compare, not future packages; each option names mechanism, intervention, src/ source-code modification, discriminator, promotion, and rejection.',
    renderNumberedList(theories),
    '- Creative move menu:',
    renderMarkdownList(moves),
    '- Discriminator first: run or name the cheapest discriminator for each viable option before code edits; the active package executes only the promoted option.',
    '- Real package rule: a theory-loop work package exists only for a promoted theory with an in-scope src/ source-code modification, a falsifying verification command, result recording, and successor package creation. Evidence-only discriminators stay in the sprint until they promote real source work.',
    '- Promotion rule: create or activate one executable package only when fresh evidence or a discriminator selects one option with explicit owner, boundary, write scope, proof, and stop rule.',
    '- Learning rule: record each option as supported, avoided, falsified, fixed, migrated, representative-green, architecture-gap, or needs-rerun, then revise the option set before another patch.',
    '- Queue discipline: keep one active executable package and no speculative package queue; successor packages are created only from fresh route evidence.',
    '- Closure invariant: the sprint continues indefinitely until the original success condition is met; close only after `## Theory Loop Success Evidence` records `Success condition met: yes`, `Matched success condition` equal to the Evidence Anchor success condition, fresh representative evidence, and `Result: success-condition-met`.',
    '- Ceremony budget: use `npm run work:theory-loop -- next|record|fix` for package and ledger updates before hand-editing markdown.',
  ].join(NEWLINE);
}

export function renderTheoryLoopPackageSection(options = {}) {
  const problem = normalizeWhitespace(options.problem);
  const success = normalizeWhitespace(options.success);
  const theories = options.theories || [];
  const moves = options.moves?.length ? options.moves : DEFAULT_CREATIVE_MOVES;
  const context = requireConcreteContext(options);
  const writeScope = requireRealModificationScope(options.writeScope);
  validateTheories(theories);
  if (!problem || !success) {
    throw new Error('Theory-loop package requires problem and success text.');
  }
  return [
    '## Theory Loop',
    '',
    `- Evidence anchor: central problem = ${problem}; representative artifact = ${context.artifact}; success condition = ${success}.`,
    '- Success condition invariant: the Evidence Anchor success condition is the original representative or release success metric, not an architecture-gap, owner-boundary migration, classification, or route-selection stop.',
    '- Stable facts:',
    renderMarkdownList(context.stableFacts),
    '- Changed facts:',
    renderMarkdownList(context.changedFacts),
    `- Mechanism card: mechanism = ${context.mechanism}; deciding owner = ${context.owner}; current action = ${context.currentAction}; missing transition or observation = ${context.missingEdge}; smallest falsifier = \`${context.discriminator}\`; expected movement = ${context.expectedMovement}; negative result means = ${context.negativeResult}; escalation rule = ${context.escalation}.`,
    '- Rejected alternatives:',
    renderMarkdownList(context.rejectedAlternatives),
    '- Source/log inspection targets:',
    renderMarkdownList(options.inspect || []),
    '- Promoted modification scope:',
    renderMarkdownList(writeScope),
    '- Theory option set: first option is the promoted path; remaining options stay as alternatives until evidence selects them. Each option names mechanism, intervention, src/ source-code modification, discriminator, promotion, and rejection.',
    renderNumberedList(theories),
    '- Creative move menu:',
    renderMarkdownList(moves),
    '- Discriminator first: inspect evidence and run the promoted discriminator before code edits.',
    '- Real package rule: this package must test the promoted theory by changing src/ source code inside the promoted modification scope, then verify whether the theory was correct. If no source-code modification remains, close the option as avoided or falsified in the sprint instead of treating it as a work package.',
    '- Promotion rule: this package may change code only for the promoted option; alternatives become packages only after fresh evidence selects them.',
    '- Learning rule: record supported, avoided, falsified, fixed, migrated, representative-green, architecture-gap, or needs-rerun before selecting any successor.',
    '- Result recording: use `npm run work:theory-loop -- record --theory <id-or-label> --result <result> --evidence <text> --write` after each discriminator or fix.',
  ].join(NEWLINE);
}

export function upsertSection(content, heading, section) {
  const normalizedHeading = `## ${heading}`;
  const lines = String(content || EMPTY).split(/\r?\n/u);
  const start = lines.findIndex((line) => line.trim() === normalizedHeading);
  if (start >= NUM_ZERO) {
    let end = lines.length;
    for (let index = start + NUM_ONE; index < lines.length; index += NUM_ONE) {
      if (/^##\s+/u.test(lines[index])) {
        end = index;
        break;
      }
    }
    const replacement = section.split(NEWLINE);
    if (end < lines.length && replacement[replacement.length - NUM_ONE] !== EMPTY) {
      replacement.push(EMPTY);
    }
    lines.splice(start, end - start, ...replacement);
    return lines.join(NEWLINE);
  }
  const insertBefore = lines.findIndex((line) =>
    ['## Current Edge Card', '## Package Queue', '## Execution Evidence']
      .includes(line.trim()));
  if (insertBefore >= NUM_ZERO) {
    lines.splice(insertBefore, NUM_ZERO, ...section.split(NEWLINE), EMPTY);
    return lines.join(NEWLINE);
  }
  const trimmed = String(content || EMPTY).replace(/\s+$/u, EMPTY);
  return `${trimmed}${NEWLINE}${NEWLINE}${section}${NEWLINE}`;
}

function parsePackageMetadataBlock(content) {
  const openIndex = String(content || EMPTY).indexOf(PACKAGE_METADATA_OPEN);
  if (openIndex < NUM_ZERO) {
    return null;
  }
  const jsonStart = openIndex + PACKAGE_METADATA_OPEN.length;
  const closeIndex = String(content).indexOf(PACKAGE_METADATA_CLOSE, jsonStart);
  if (closeIndex < NUM_ZERO) {
    return null;
  }
  const jsonText = String(content).slice(jsonStart, closeIndex).trim();
  return {
    closeIndex,
    jsonStart,
    metadata: JSON.parse(jsonText),
  };
}

function replacePackageMetadataBlock(content, parsed, metadata) {
  return [
    content.slice(NUM_ZERO, parsed.jsonStart),
    NEWLINE,
    JSON.stringify(metadata, null, NUM_TWO),
    NEWLINE,
    content.slice(parsed.closeIndex),
  ].join(EMPTY);
}

function upsertTheoryLoopMetadata(content, patch = {}) {
  const parsed = parsePackageMetadataBlock(content);
  if (!parsed) {
    return content;
  }
  const metadata = parsed.metadata;
  metadata[THEORY_LOOP_FIELD] = {
    enforcement: THEORY_LOOP_SOURCE_PACKAGE_ENFORCEMENT,
    promotedTheory:
      metadata[THEORY_LOOP_FIELD]?.promotedTheory ||
      metadata.intent?.nextAction ||
      'promoted theory selected by the theory-loop discriminator',
    sprintGoalDelta:
      metadata[THEORY_LOOP_FIELD]?.sprintGoalDelta ||
      metadata.intent?.nextAction ||
      'source change should move the sprint toward the recorded success condition',
    sourceChangeRequired: true,
    successorRequired: true,
    ...(metadata[THEORY_LOOP_FIELD] || {}),
    ...patch,
  };
  if (patch.successorPackage) {
    metadata.intent = {
      ...(metadata.intent || {}),
      successor: patch.successorPackage,
    };
  }
  return replacePackageMetadataBlock(content, parsed, metadata);
}

export function appendSprintQueueItem(content, item = {}) {
  const packagePath = normalizeText(item.packagePath);
  if (!packagePath) {
    throw new Error('Queued theory-loop package path is required.');
  }
  const link = sprintPackageLink(packagePath);
  if (String(content || EMPTY).includes(link)) {
    return content;
  }
  const title = normalizeText(item.title) || packagePath;
  const lane = normalizeText(item.lane) || DEFAULT_LANE;
  const purpose = normalizeText(item.purpose) || 'Run a compact theory loop iteration.';
  const firstRunReason = normalizeText(item.firstRunReason) ||
    'Fresh evidence promoted one theory option and selected the cheapest discriminator.';
  const queueItem = [
    `1. [${title}](${link})`,
    `   - Lane: \`${lane}\``,
    `   - Purpose: ${purpose}`,
    `   - First-run reason: ${firstRunReason}`,
  ].join(NEWLINE);
  const lines = String(content || EMPTY).split(/\r?\n/u);
  const queueIndex = lines.findIndex((line) => line.trim() === '## Package Queue');
  if (queueIndex < NUM_ZERO) {
    return `${content.replace(/\s+$/u, EMPTY)}${NEWLINE}${NEWLINE}## Package Queue${NEWLINE}${NEWLINE}${queueItem}${NEWLINE}`;
  }
  let insertIndex = lines.length;
  for (let index = queueIndex + NUM_ONE; index < lines.length; index += NUM_ONE) {
    if (/^##\s+/u.test(lines[index])) {
      insertIndex = index;
      break;
    }
  }
  const prefix = insertIndex > NUM_ZERO && lines[insertIndex - NUM_ONE] === EMPTY ? [] : [EMPTY];
  lines.splice(insertIndex, NUM_ZERO, ...prefix, ...queueItem.split(NEWLINE));
  return lines.join(NEWLINE);
}

export function buildPackageNewArgs(options = {}) {
  const title = normalizeText(options.title);
  const slug = normalizeText(options.slug);
  const owner = normalizeText(options.owner);
  const boundary = normalizeText(options.boundary);
  const dominantReason = normalizeText(options.dominantReason);
  const discriminator = normalizeText(options.discriminator);
  const problem = normalizeText(options.problem);
  const artifact = requireConcreteArtifact(options.artifact);
  const writeScope = requireRealModificationScope(options.writeScope);
  const validation = normalizeText(options.validation) || discriminator;
  for (const [label, value] of Object.entries({
    title,
    slug,
    owner,
    boundary,
    'dominant-reason': dominantReason,
    discriminator,
    problem,
    artifact,
  })) {
    if (!value) {
      throw new Error(`Theory-loop next requires ${label}.`);
    }
  }
  const args = [
    'scripts/work-package-new.js',
    '--theory-loop',
    '--status',
    DEFAULT_STATUS,
    '--lane',
    DEFAULT_LANE,
    '--title',
    title,
    '--slug',
    slug,
    '--owner',
    owner,
    '--boundary',
    boundary,
    '--dominant-reason',
    dominantReason,
    '--next-action',
    normalizeText(options.nextAction) ||
      'Run the promoted discriminator, inspect source/log evidence, and record option learning before any successor package is created.',
    '--current-state',
    `Promoted theory-loop package for ${problem}.`,
    '--artifact',
    artifact,
    '--proof',
    `falsifier: ${discriminator}`,
    '--proof',
    `regression: ${validation}`,
    '--proof',
    `supporting: npm run work:frontier-history -- --owner ${owner} --boundary ${boundary} --limit 12`,
  ];
  for (const writePath of writeScope) {
    args.push('--write-scope', writePath);
  }
  if (normalizeText(options.predecessor)) {
    args.push('--predecessor', normalizeText(options.predecessor));
  }
  for (const inspectPath of options.inspect || []) {
    args.push('--candidate-runtime-file', inspectPath);
  }
  return args;
}

export function renderTheoryLoopResultLine(options = {}) {
  const theory = normalizeWhitespace(options.theory);
  const result = normalizeWhitespace(options.result || DEFAULT_RESULT);
  const evidence = normalizeWhitespace(options.evidence);
  if (!theory || !evidence) {
    throw new Error('Theory-loop record requires theory and evidence.');
  }
  if (!VALID_RESULTS.includes(result)) {
    throw new Error(`--result must be one of ${VALID_RESULTS.join(', ')}.`);
  }
  const files = normalizeWhitespace(options.files || 'none');
  const validation = normalizeWhitespace(options.validation || 'none');
  const nextAction = normalizeWhitespace(options.nextAction || 'continue theory loop');
  return `- [x] theory: ${theory}; result: ${result}; evidence: ${evidence}; files: ${files}; validation: ${validation}; next: ${nextAction}.`;
}

export function appendTheoryLoopResult(content, options = {}) {
  const line = renderTheoryLoopResultLine(options);
  const sectionHeading = '## Theory Loop Results';
  const lines = String(content || EMPTY).split(/\r?\n/u);
  const start = lines.findIndex((item) => item.trim() === sectionHeading);
  if (start < NUM_ZERO) {
    const section = [sectionHeading, EMPTY, line].join(NEWLINE);
    return upsertSection(content, 'Theory Loop Results', section);
  }
  let insertIndex = lines.length;
  for (let index = start + NUM_ONE; index < lines.length; index += NUM_ONE) {
    if (/^##\s+/u.test(lines[index])) {
      insertIndex = index;
      break;
    }
  }
  lines.splice(insertIndex, NUM_ZERO, line);
  return lines.join(NEWLINE);
}

export function updateTheoryLedgerEntryStatus(content, theoryId, status) {
  const normalizedId = normalizeText(theoryId);
  const normalizedStatus = normalizeText(status);
  if (!THEORY_ID_PATTERN.test(normalizedId) || !normalizedStatus) {
    return content;
  }
  const lines = String(content || EMPTY).split(/\r?\n/u);
  const headingIndex = lines.findIndex((line) => line.trim() === `## ${normalizedId}`);
  if (headingIndex < NUM_ZERO) {
    return content;
  }
  for (let index = headingIndex + NUM_ONE; index < lines.length; index += NUM_ONE) {
    if (/^##\s+/u.test(lines[index])) {
      return content;
    }
    if (/^-\s+Status:/u.test(lines[index])) {
      lines[index] = `- Status: ${normalizedStatus}`;
      return lines.join(NEWLINE);
    }
  }
  return content;
}

async function findActiveSprintFile() {
  const entries = await fs.readdir(SPRINTS_DIR, {withFileTypes: true});
  const active = entries
    .filter((entry) => entry.isFile() && /^active-.+\.md$/u.test(entry.name))
    .map((entry) => path.join(SPRINTS_DIR, entry.name))
    .sort();
  if (active.length !== NUM_ONE) {
    throw new Error(`Expected one active sprint, found ${active.length}.`);
  }
  return active[NUM_ZERO];
}

async function findActivePackageFile() {
  const entries = await fs.readdir(PACKAGES_DIR, {withFileTypes: true});
  const active = entries
    .filter((entry) => entry.isFile() && /^active-.+\.md$/u.test(entry.name))
    .map((entry) => path.join(PACKAGES_DIR, entry.name))
    .sort();
  if (active.length !== NUM_ONE) {
    throw new Error(`Expected one active package, found ${active.length}.`);
  }
  return active[NUM_ZERO];
}

async function findOptionalActiveTheoryLoopPackageFile() {
  try {
    const packagePath = await findActivePackageFile();
    const content = await fs.readFile(packagePath, ENCODING_UTF8);
    if (
      /^## Theory Loop\b/mu.test(content) ||
      /"theoryLoop"\s*:/u.test(content)
    ) {
      return packagePath;
    }
  } catch {
    return EMPTY;
  }
  return EMPTY;
}

async function runStart(flags) {
  const sprintPath = firstFlag(flags, FLAG_SPRINT) || await findActiveSprintFile();
  const section = renderTheoryLoopSprintSection({
    problem: requireFlag(flags, FLAG_PROBLEM),
    artifact: requireFlag(flags, FLAG_ARTIFACT),
    success: requireFlag(flags, FLAG_SUCCESS),
    owner: requireFlag(flags, FLAG_OWNER),
    mechanism: requireFlag(flags, FLAG_MECHANISM),
    stableFacts: repeatedFlag(flags, FLAG_STABLE_FACT),
    changedFacts: repeatedFlag(flags, FLAG_CHANGED_FACT),
    rejectedAlternatives: repeatedFlag(flags, FLAG_REJECTED_ALTERNATIVE),
    currentAction: requireFlag(flags, FLAG_CURRENT_ACTION),
    missingEdge: requireFlag(flags, FLAG_MISSING_EDGE),
    discriminator: requireFlag(flags, FLAG_DISCRIMINATOR),
    expectedMovement: requireFlag(flags, FLAG_EXPECTED_MOVEMENT),
    negativeResult: requireFlag(flags, FLAG_NEGATIVE_RESULT),
    escalation: requireFlag(flags, FLAG_ESCALATION),
    theories: repeatedFlag(flags, FLAG_THEORY),
    moves: repeatedFlag(flags, FLAG_MOVE),
  });
  if (!hasFlag(flags, FLAG_WRITE)) {
    return section;
  }
  const content = await fs.readFile(sprintPath, ENCODING_UTF8);
  await fs.writeFile(
    sprintPath,
    upsertSection(content, 'Theory Loop Sprint', section),
    ENCODING_UTF8,
  );
  return `Updated ${sprintPath} with theory-loop sprint intent.`;
}

async function runNext(flags) {
  const theories = repeatedFlag(flags, FLAG_THEORY);
  validateTheories(theories);
  const opened = todayIsoDate();
  const slug = requireFlag(flags, FLAG_SLUG);
  const packagePath = packagePathFor(DEFAULT_STATUS, opened, slug);
  const predecessorPackage =
    firstFlag(flags, FLAG_PACKAGE) ||
    await findOptionalActiveTheoryLoopPackageFile();
  const options = {
    title: requireFlag(flags, FLAG_TITLE),
    slug,
    problem: requireFlag(flags, FLAG_PROBLEM),
    artifact: requireFlag(flags, FLAG_ARTIFACT),
    success: requireFlag(flags, FLAG_SUCCESS),
    owner: requireFlag(flags, FLAG_OWNER),
    boundary: requireFlag(flags, FLAG_BOUNDARY),
    dominantReason: requireFlag(flags, FLAG_DOMINANT_REASON),
    mechanism: requireFlag(flags, FLAG_MECHANISM),
    stableFacts: repeatedFlag(flags, FLAG_STABLE_FACT),
    changedFacts: repeatedFlag(flags, FLAG_CHANGED_FACT),
    rejectedAlternatives: repeatedFlag(flags, FLAG_REJECTED_ALTERNATIVE),
    currentAction: requireFlag(flags, FLAG_CURRENT_ACTION),
    missingEdge: requireFlag(flags, FLAG_MISSING_EDGE),
    discriminator: requireFlag(flags, FLAG_DISCRIMINATOR),
    expectedMovement: requireFlag(flags, FLAG_EXPECTED_MOVEMENT),
    negativeResult: requireFlag(flags, FLAG_NEGATIVE_RESULT),
    escalation: requireFlag(flags, FLAG_ESCALATION),
    validation: firstFlag(flags, FLAG_VALIDATION),
    nextAction: firstFlag(flags, FLAG_NEXT_ACTION),
    theories,
    moves: repeatedFlag(flags, FLAG_MOVE),
    inspect: repeatedFlag(flags, FLAG_INSPECT),
    writeScope: repeatedFlag(flags, FLAG_WRITE_SCOPE),
    predecessor: predecessorPackage,
  };
  const section = renderTheoryLoopPackageSection(options);
  const args = buildPackageNewArgs(options);
  if (!hasFlag(flags, FLAG_WRITE)) {
    return [
      `Would create ${packagePath}.`,
      renderWriteCommand(args),
      '',
      section,
    ].join(NEWLINE);
  }
  execFileSync(process.execPath, [...args, '--write'], {stdio: 'pipe'});
  const packageContent = await fs.readFile(packagePath, ENCODING_UTF8);
  await fs.writeFile(
    packagePath,
    upsertSection(packageContent, 'Theory Loop', section),
    ENCODING_UTF8,
  );
  const sprintPath = firstFlag(flags, FLAG_SPRINT) || await findActiveSprintFile();
  const sprintContent = await fs.readFile(sprintPath, ENCODING_UTF8);
  const nextSprintContent = appendSprintQueueItem(sprintContent, {
    packagePath,
    title: options.title,
    lane: DEFAULT_LANE,
    purpose: `Theory loop: ${options.problem}`,
    firstRunReason: firstFlag(flags, FLAG_FIRST_RUN_REASON) ||
      `Fresh evidence promoted option 1 from ${theories.length} theory options; discriminator: ${options.discriminator}.`,
  });
  await fs.writeFile(sprintPath, nextSprintContent, ENCODING_UTF8);
  if (predecessorPackage && predecessorPackage !== packagePath) {
    const predecessorContent = await fs.readFile(predecessorPackage, ENCODING_UTF8);
    await fs.writeFile(
      predecessorPackage,
      upsertTheoryLoopMetadata(predecessorContent, {
        successorPackage: packagePath,
      }),
      ENCODING_UTF8,
    );
  }
  return `Created ${packagePath} and queued it in ${sprintPath}.`;
}

async function runRecord(flags, forcedResult = EMPTY) {
  const packagePath = firstFlag(flags, FLAG_PACKAGE) || await findActivePackageFile();
  const result = forcedResult || firstFlag(flags, FLAG_RESULT, DEFAULT_RESULT);
  const record = {
    theory: requireFlag(flags, FLAG_THEORY),
    result,
    evidence: requireFlag(flags, FLAG_EVIDENCE),
    files: firstFlag(flags, FLAG_FILES, 'none'),
    validation: firstFlag(flags, FLAG_VALIDATION, 'none'),
    nextAction: firstFlag(flags, FLAG_NEXT_ACTION, 'continue theory loop'),
  };
  const line = renderTheoryLoopResultLine(record);
  const ledgerStatus = firstFlag(
    flags,
    FLAG_LEDGER_STATUS,
    LEDGER_STATUS_BY_RESULT[result] || EMPTY,
  );
  if (!hasFlag(flags, FLAG_WRITE)) {
    return line;
  }
  const content = await fs.readFile(packagePath, ENCODING_UTF8);
  await fs.writeFile(
    packagePath,
    upsertTheoryLoopMetadata(appendTheoryLoopResult(content, record), {result}),
    ENCODING_UTF8,
  );
  if (ledgerStatus && THEORY_ID_PATTERN.test(record.theory)) {
    const ledger = await fs.readFile(THEORY_LEDGER_PATH, ENCODING_UTF8);
    await fs.writeFile(
      THEORY_LEDGER_PATH,
      updateTheoryLedgerEntryStatus(ledger, record.theory, ledgerStatus),
      ENCODING_UTF8,
    );
  }
  return `Recorded theory-loop result in ${packagePath}.`;
}

async function runFix(flags) {
  return runRecord(flags, RESULT_FIXED);
}

export async function runCli(args = process.argv.slice(NUM_TWO)) {
  const {command, flags} = parseArgs(args);
  if (command === 'help' || command === '--help' || hasFlag(flags, 'help')) {
    return HELP_TEXT;
  }
  if (command === COMMAND_START) {
    return runStart(flags);
  }
  if (command === COMMAND_NEXT) {
    return runNext(flags);
  }
  if (command === COMMAND_RECORD) {
    return runRecord(flags);
  }
  if (command === COMMAND_FIX) {
    return runFix(flags);
  }
  throw new Error(`Unknown command "${command || '<empty>'}".${NEWLINE}${HELP_TEXT}`);
}

function isDirectRun() {
  return process.argv[NUM_ONE] === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  runCli()
    .then((output) => {
      process.stdout.write(`${output}${NEWLINE}`);
      process.exit(EXIT_SUCCESS);
    })
    .catch((error) => {
      process.stderr.write(`Error: ${error.message}${NEWLINE}`);
      process.exit(EXIT_FAILURE);
    });
}
