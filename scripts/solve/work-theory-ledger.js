#!/usr/bin/env node

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {normalizeMetadata} from './work-package-schema.js';

const ENCODING_UTF8 = 'utf8';
const EMPTY_TEXT = '';
const NEWLINE = '\n';
const SPACE = ' ';
const NUM_ZERO = 0;
const NUM_ONE = 1;
const NUM_TWO = 2;
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const DEFAULT_LEDGER_PATH = path.join('work', 'theory-ledger.md');
const COMMAND_VALIDATE = 'validate';
const COMMAND_LIST = 'list';
const COMMAND_NEW = 'new';
const FLAG_PREFIX = '--';
const FLAG_LEDGER = 'ledger';
const FLAG_PACKAGES_DIR = 'packages-dir';
const FLAG_STATUS = 'status';
const FLAG_OWNER = 'owner';
const FLAG_ID = 'id';
const FLAG_SCENARIO_GATE = 'scenario-gate';
const FLAG_OWNER_BOUNDARY = 'owner-boundary';
const FLAG_HYPOTHESIS = 'hypothesis';
const FLAG_PROBE = 'probe';
const FLAG_ARTIFACT_RESULT = 'artifact-result';
const FLAG_REPRESENTATIVE_MOVEMENT = 'representative-movement';
const FLAG_LINKED_PACKAGE = 'linked-package';
const FLAG_SUPERSEDES = 'supersedes';
const FLAG_SUPERSEDED_BY = 'superseded-by';
const FLAG_NEXT_IMPLICATION = 'next-implication';
const FIELD_STATUS = 'Status';
const FIELD_SCENARIO_GATE = 'Scenario/gate';
const FIELD_OWNER_BOUNDARY = 'Owner/boundary';
const FIELD_HYPOTHESIS = 'Hypothesis';
const FIELD_PROBE = 'Probe';
const FIELD_ARTIFACT_RESULT = 'Artifact/result';
const FIELD_REPRESENTATIVE_MOVEMENT = 'Representative movement';
const FIELD_LINKED_PACKAGES = 'Linked packages';
const FIELD_SUPERSEDES = 'Supersedes';
const FIELD_SUPERSEDED_BY = 'Superseded by';
const FIELD_NEXT_IMPLICATION = 'Next implication';
const FIELD_NAMES = Object.freeze([
  FIELD_STATUS,
  FIELD_SCENARIO_GATE,
  FIELD_OWNER_BOUNDARY,
  FIELD_HYPOTHESIS,
  FIELD_PROBE,
  FIELD_ARTIFACT_RESULT,
  FIELD_REPRESENTATIVE_MOVEMENT,
  FIELD_LINKED_PACKAGES,
  FIELD_SUPERSEDES,
  FIELD_SUPERSEDED_BY,
  FIELD_NEXT_IMPLICATION,
]);
export const THEORY_LEDGER_FIELDS = Object.freeze({
  STATUS: FIELD_STATUS,
  SCENARIO_GATE: FIELD_SCENARIO_GATE,
  OWNER_BOUNDARY: FIELD_OWNER_BOUNDARY,
  HYPOTHESIS: FIELD_HYPOTHESIS,
  PROBE: FIELD_PROBE,
  ARTIFACT_RESULT: FIELD_ARTIFACT_RESULT,
  REPRESENTATIVE_MOVEMENT: FIELD_REPRESENTATIVE_MOVEMENT,
  LINKED_PACKAGES: FIELD_LINKED_PACKAGES,
  SUPERSEDES: FIELD_SUPERSEDES,
  SUPERSEDED_BY: FIELD_SUPERSEDED_BY,
  NEXT_IMPLICATION: FIELD_NEXT_IMPLICATION,
});
const STATUS_ACTIVE = 'active';
const STATUS_SUPPORTED = 'supported';
const STATUS_FALSIFIED = 'falsified';
const STATUS_SUPERSEDED = 'superseded';
const STATUS_AVOIDED = 'avoided';
const STATUS_STALE = 'stale';
const STATUS_NEEDS_RERUN = 'needs-rerun';
const STATUS_VALUES = Object.freeze([
  STATUS_ACTIVE,
  STATUS_SUPPORTED,
  STATUS_FALSIFIED,
  STATUS_SUPERSEDED,
  STATUS_AVOIDED,
  STATUS_STALE,
  STATUS_NEEDS_RERUN,
]);
const NONE_VALUE = 'none';
const ENTRY_HEADING_PATTERN = /^##\s+(theory-[a-z0-9]+(?:-[a-z0-9]+)*)\s*$/u;
const ANY_ENTRY_HEADING_PATTERN = /^##\s+/u;
const FIELD_PATTERN = /^-\s+([^:]+):\s*(.*)$/u;
const BACKTICK_VALUE_PATTERN = /`([^`]+)`/gu;
const PACKAGE_REFERENCE_PATTERN = /\bwork\/packages\/[a-z0-9][a-z0-9-]*\.md\b/gu;
const ARTIFACT_REFERENCE_PATTERN = /\b(?:test-output|work|scripts|test)\/[^\s`,)]+/gu;
const DEFAULT_RELATED_ENTRY_LIMIT = 5;
const RELATED_SCORE_OWNER = 4;
const RELATED_SCORE_BOUNDARY = 4;
const RELATED_SCORE_SCENARIO = 3;
const RELATED_SCORE_DOMINANT_REASON = 1;
const NO_CONTEXT_VALUES = Object.freeze(['', 'none', 'unknown']);
const HELP_TEXT = [
  'Usage:',
  '  node scripts/work-theory-ledger.js validate [--ledger <path>]',
  '  node scripts/work-theory-ledger.js list [--status <status>] [--owner <owner>] [--ledger <path>]',
  '  node scripts/work-theory-ledger.js new --id <id> --status <status> --scenario-gate <text> --owner-boundary <text> --hypothesis <text> --probe <command> --artifact-result <text> --representative-movement <text> --linked-package <path> --next-implication <text> [--ledger <path>]',
].join(NEWLINE);

function normalizeText(value) {
  return String(value || EMPTY_TEXT).trim();
}

function normalizeWhitespace(value) {
  return normalizeText(value).replace(/\s+/gu, SPACE);
}

function normalizeContextValue(value) {
  const normalized = normalizeWhitespace(value).toLowerCase();
  return NO_CONTEXT_VALUES.includes(normalized) ? EMPTY_TEXT : normalized;
}

function parseArgs(args = []) {
  const command = args[NUM_ZERO] || COMMAND_VALIDATE;
  const flags = {};
  for (let index = NUM_ONE; index < args.length; index += NUM_ONE) {
    const rawFlag = args[index];
    if (!rawFlag.startsWith(FLAG_PREFIX)) {
      throw new Error(`Unexpected argument "${rawFlag}".`);
    }
    const flagName = rawFlag.slice(FLAG_PREFIX.length);
    const value = args[index + NUM_ONE];
    if (value === undefined || value.startsWith(FLAG_PREFIX)) {
      throw new Error(`Flag --${flagName} requires a value.`);
    }
    index += NUM_ONE;
    if (flags[flagName] === undefined) {
      flags[flagName] = [];
    }
    flags[flagName].push(value);
  }
  return {command, flags};
}

function firstFlag(flags, flagName, fallback = EMPTY_TEXT) {
  return flags[flagName]?.[NUM_ZERO] || fallback;
}

function repeatedFlag(flags, flagName) {
  return flags[flagName] || [];
}

function ledgerPathFromFlags(flags = {}) {
  return firstFlag(flags, FLAG_LEDGER, DEFAULT_LEDGER_PATH);
}

function extractBacktickValues(value) {
  return [...String(value || EMPTY_TEXT).matchAll(BACKTICK_VALUE_PATTERN)]
    .map((match) => normalizeText(match[NUM_ONE]))
    .filter(Boolean);
}

function extractInlineReferences(value) {
  const text = String(value || EMPTY_TEXT);
  return [
    ...text.matchAll(PACKAGE_REFERENCE_PATTERN),
    ...text.matchAll(ARTIFACT_REFERENCE_PATTERN),
  ].map((match) => normalizeText(match[NUM_ZERO])).filter(Boolean);
}

function extractEvidenceReferences(value) {
  return [...new Set([
    ...extractBacktickValues(value),
    ...extractInlineReferences(value),
  ])].filter((reference) => reference !== NONE_VALUE);
}

function parseTheoryReferenceList(value) {
  const normalized = normalizeText(value);
  if (!normalized || normalized.toLowerCase() === NONE_VALUE) {
    return [];
  }
  return normalized
    .split(',')
    .map((item) => normalizeText(item).replace(/^`|`$/gu, EMPTY_TEXT))
    .filter(Boolean);
}

function entryField(entry, fieldName) {
  return normalizeWhitespace(entry?.fields?.[fieldName]);
}

function entryText(entry, fieldNames = FIELD_NAMES) {
  return fieldNames
    .map((fieldName) => entryField(entry, fieldName))
    .join(SPACE)
    .toLowerCase();
}

export function findMissingTheoryLedgerRefs(entries = [], refs = []) {
  const ids = new Set(entries.map((entry) => entry.id));
  return refs
    .map((ref) => normalizeText(ref))
    .filter(Boolean)
    .filter((ref) => !ids.has(ref));
}

function scoreRelatedTheoryLedgerEntry(entry, context = {}) {
  const owner = normalizeContextValue(context.owner);
  const boundary = normalizeContextValue(context.boundary);
  const scenario = normalizeContextValue(context.scenario);
  const dominantReason = normalizeContextValue(context.dominantReason);
  const ownerBoundary = entryField(entry, FIELD_OWNER_BOUNDARY).toLowerCase();
  const scenarioGate = entryField(entry, FIELD_SCENARIO_GATE).toLowerCase();
  const fullText = entryText(entry, [
    FIELD_SCENARIO_GATE,
    FIELD_OWNER_BOUNDARY,
    FIELD_HYPOTHESIS,
    FIELD_ARTIFACT_RESULT,
    FIELD_REPRESENTATIVE_MOVEMENT,
    FIELD_NEXT_IMPLICATION,
  ]);
  let score = NUM_ZERO;
  if (owner && ownerBoundary.includes(owner)) {
    score += RELATED_SCORE_OWNER;
  }
  if (boundary && ownerBoundary.includes(boundary)) {
    score += RELATED_SCORE_BOUNDARY;
  }
  if (scenario && scenarioGate.includes(scenario)) {
    score += RELATED_SCORE_SCENARIO;
  }
  if (dominantReason && fullText.includes(dominantReason)) {
    score += RELATED_SCORE_DOMINANT_REASON;
  }
  return score;
}

export function findRelatedTheoryLedgerEntries(entries = [], context = {}, options = {}) {
  const limit = options.limit || DEFAULT_RELATED_ENTRY_LIMIT;
  const excludedRefs = new Set((options.excludeRefs || [])
    .map((ref) => normalizeText(ref))
    .filter(Boolean));
  return entries
    .map((entry) => ({
      entry,
      score: scoreRelatedTheoryLedgerEntry(entry, context),
    }))
    .filter((candidate) =>
      candidate.score > NUM_ZERO && !excludedRefs.has(candidate.entry.id))
    .sort((left, right) =>
      right.score - left.score || left.entry.line - right.entry.line)
    .slice(NUM_ZERO, limit)
    .map((candidate) => candidate.entry);
}

export function summarizeTheoryLedgerEntry(entry) {
  const status = entryField(entry, FIELD_STATUS) || 'unknown';
  const ownerBoundary = entryField(entry, FIELD_OWNER_BOUNDARY) || 'unknown';
  const nextImplication = entryField(entry, FIELD_NEXT_IMPLICATION) || 'unknown';
  return `${entry.id} [${status}] ${ownerBoundary} - ${nextImplication}`;
}

export function extractTheoryLedgerEntries(content) {
  const lines = String(content || EMPTY_TEXT).split(/\r?\n/u);
  const entries = [];
  let currentEntry = {};
  let currentFields = {};
  let currentStartLine = NUM_ZERO;

  function flushEntry() {
    if (!currentEntry.id) {
      return;
    }
    entries.push({
      id: currentEntry.id,
      fields: currentFields,
      line: currentStartLine,
    });
    currentEntry = {};
    currentFields = {};
    currentStartLine = NUM_ZERO;
  }

  for (let index = NUM_ZERO; index < lines.length; index += NUM_ONE) {
    const line = lines[index];
    const headingMatch = ENTRY_HEADING_PATTERN.exec(line);
    if (headingMatch) {
      flushEntry();
      currentEntry = {id: headingMatch[NUM_ONE]};
      currentFields = {};
      currentStartLine = index + NUM_ONE;
      continue;
    }
    if (ANY_ENTRY_HEADING_PATTERN.test(line)) {
      flushEntry();
      continue;
    }
    if (!currentEntry.id) {
      continue;
    }
    const fieldMatch = FIELD_PATTERN.exec(line);
    if (!fieldMatch) {
      continue;
    }
    currentFields[normalizeWhitespace(fieldMatch[NUM_ONE])] =
      normalizeWhitespace(fieldMatch[NUM_TWO]);
  }
  flushEntry();
  return entries;
}

function validateEntryFields(entry) {
  const errors = [];
  for (const fieldName of FIELD_NAMES) {
    if (!entry.fields[fieldName]) {
      errors.push(`${entry.id}: missing required field ${fieldName}.`);
    }
  }
  return errors;
}

function validateEntryStatus(entry) {
  const status = normalizeText(entry.fields[FIELD_STATUS]);
  if (!STATUS_VALUES.includes(status)) {
    return [
      `${entry.id}: invalid status ${status || '<empty>'}; expected one of ` +
        `${STATUS_VALUES.join(', ')}.`,
    ];
  }
  return [];
}

function validateEntryEvidence(entry) {
  const errors = [];
  if (extractEvidenceReferences(entry.fields[FIELD_ARTIFACT_RESULT]).length === NUM_ZERO) {
    errors.push(`${entry.id}: Artifact/result must include an evidence link.`);
  }
  if (extractEvidenceReferences(entry.fields[FIELD_LINKED_PACKAGES]).length === NUM_ZERO) {
    errors.push(`${entry.id}: Linked packages must include a package link.`);
  }
  return errors;
}

function validateSupersessionReferences(entries) {
  const errors = [];
  const entryIds = new Set(entries.map((entry) => entry.id));
  for (const entry of entries) {
    for (const fieldName of [FIELD_SUPERSEDES, FIELD_SUPERSEDED_BY]) {
      for (const reference of parseTheoryReferenceList(entry.fields[fieldName])) {
        if (!entryIds.has(reference)) {
          errors.push(`${entry.id}: ${fieldName} references missing ${reference}.`);
        }
      }
    }
  }
  return errors;
}

function getPackagesMetadataSync(packagesDir) {
  const dir = packagesDir || path.join('work', 'packages');
  try {
    if (!fsSync.existsSync(dir)) {
      return [];
    }
    const files = fsSync.readdirSync(dir);
    const packages = [];
    for (const file of files) {
      if (file.endsWith('.md')) {
        const content = fsSync.readFileSync(path.join(dir, file), 'utf8');
        const match = content.match(/<!--\s*work-package\s*(\{[\s\S]*?\})\s*-->/u);
        if (match) {
          try {
            const rawMetadata = JSON.parse(match[1]);
            const metadata = normalizeMetadata(rawMetadata, path.join(dir, file));
            packages.push({
              filename: file,
              status: file.split('-')[0],
              metadata,
            });
          } catch (_e) {
            // ignore
          }
        }
      }
    }
    return packages;
  } catch (_e) {
    return [];
  }
}

function validateStaleActiveTheories(entries, packagesDir) {
  const errors = [];
  const packages = getPackagesMetadataSync(packagesDir);
  for (const entry of entries) {
    const status = entryField(entry, FIELD_STATUS);
    if (status !== 'active') {
      continue;
    }
    const ownerBoundary = entryField(entry, FIELD_OWNER_BOUNDARY);
    const parts = ownerBoundary.split('/');
    if (parts.length < NUM_TWO) {
      continue;
    }
    const theoryOwner = parts[NUM_ZERO].trim().toLowerCase();
    const theoryBoundary = parts[NUM_ONE].trim().toLowerCase();

    // Parse theory date from entry ID: theory-YYYYMMDD-slug
    const dateMatch = entry.id.match(/^theory-(\d{8})-/u);
    if (!dateMatch) {
      continue;
    }
    const theoryDateStr = dateMatch[NUM_ONE]; // YYYYMMDD

    for (const pkg of packages) {
      if (pkg.status !== 'done') {
        continue;
      }
      // Parse package date from filename: done-YYYYMMDD-slug.md
      const pkgDateMatch = pkg.filename.match(/^done-(\d{8})-/u);
      if (!pkgDateMatch) {
        continue;
      }
      const pkgDateStr = pkgDateMatch[NUM_ONE];

      // If package is newer than or equal to theory date
      if (pkgDateStr >= theoryDateStr) {
        const pkgOwner = String(pkg.metadata.owner || EMPTY_TEXT).trim().toLowerCase();
        const pkgBoundary = String(pkg.metadata.boundary || EMPTY_TEXT).trim().toLowerCase();

        const matchesOwnerBoundary = (pkgOwner === theoryOwner && pkgBoundary === theoryBoundary);
        const citesTheory = Array.isArray(pkg.metadata.theoryLedgerRefs) &&
                            pkg.metadata.theoryLedgerRefs.includes(entry.id);

        if (matchesOwnerBoundary || citesTheory) {
          // Check if this closed package is linked in the theory
          const linkedPackages = parseTheoryReferenceList(entry.fields[FIELD_LINKED_PACKAGES]);
          const isLinked = linkedPackages.some((ref) => {
            const cleanRef = ref.replace(/^`|`$/gu, EMPTY_TEXT);
            return pkg.filename.includes(cleanRef) || cleanRef.includes(pkg.filename);
          });

          if (!isLinked) {
            errors.push(`${entry.id}: active theory is stale because newer closed package ${pkg.filename} in same owner/boundary is not linked in the ledger.`);
          }
        }
      }
    }
  }
  return errors;
}

export function validateTheoryLedgerContent(content, options = {}) {
  const entries = extractTheoryLedgerEntries(content);
  const errors = [];
  const seenIds = new Set();
  for (const entry of entries) {
    if (seenIds.has(entry.id)) {
      errors.push(`${entry.id}: duplicate theory id.`);
    }
    seenIds.add(entry.id);
    errors.push(...validateEntryFields(entry));
    errors.push(...validateEntryStatus(entry));
    errors.push(...validateEntryEvidence(entry));
  }
  errors.push(...validateSupersessionReferences(entries));
  errors.push(...validateStaleActiveTheories(entries, options.packagesDir));
  return {entries, errors};
}

export function filterTheoryLedgerEntries(entries, filters = {}) {
  const statusFilter = normalizeText(filters.status);
  const ownerFilter = normalizeText(filters.owner);
  return entries.filter((entry) => {
    const statusMatches = !statusFilter ||
      entry.fields[FIELD_STATUS] === statusFilter;
    const ownerMatches = !ownerFilter ||
      entry.fields[FIELD_OWNER_BOUNDARY]?.includes(ownerFilter);
    return statusMatches && ownerMatches;
  });
}

export function renderTheoryLedgerList(entries) {
  if (entries.length === NUM_ZERO) {
    return 'No theory ledger entries found.';
  }
  return entries.map((entry) =>
    [
      '-',
      entry.id,
      `[${entry.fields[FIELD_STATUS] || 'unknown'}]`,
      entry.fields[FIELD_OWNER_BOUNDARY] || 'unknown',
      '-',
      entry.fields[FIELD_NEXT_IMPLICATION] || 'unknown',
    ].join(SPACE),
  ).join(NEWLINE);
}

export function buildTheoryLedgerEntryBlock(entry) {
  return [
    `## ${entry.id}`,
    '',
    `- ${FIELD_STATUS}: ${entry.status}`,
    `- ${FIELD_SCENARIO_GATE}: ${entry.scenarioGate}`,
    `- ${FIELD_OWNER_BOUNDARY}: ${entry.ownerBoundary}`,
    `- ${FIELD_HYPOTHESIS}: ${entry.hypothesis}`,
    `- ${FIELD_PROBE}: \`${entry.probe}\``,
    `- ${FIELD_ARTIFACT_RESULT}: ${entry.artifactResult}`,
    `- ${FIELD_REPRESENTATIVE_MOVEMENT}: ${entry.representativeMovement}`,
    `- ${FIELD_LINKED_PACKAGES}: ${entry.linkedPackages.join(', ')}`,
    `- ${FIELD_SUPERSEDES}: ${entry.supersedes}`,
    `- ${FIELD_SUPERSEDED_BY}: ${entry.supersededBy}`,
    `- ${FIELD_NEXT_IMPLICATION}: ${entry.nextImplication}`,
  ].join(NEWLINE);
}

function buildEntryFromFlags(flags) {
  const linkedPackages = repeatedFlag(flags, FLAG_LINKED_PACKAGE)
    .map((packagePath) => `\`${packagePath}\``);
  return {
    id: firstFlag(flags, FLAG_ID),
    status: firstFlag(flags, FLAG_STATUS, STATUS_ACTIVE),
    scenarioGate: firstFlag(flags, FLAG_SCENARIO_GATE, 'none / none'),
    ownerBoundary: firstFlag(flags, FLAG_OWNER_BOUNDARY, 'unknown / unknown'),
    hypothesis: firstFlag(flags, FLAG_HYPOTHESIS),
    probe: firstFlag(flags, FLAG_PROBE),
    artifactResult: firstFlag(flags, FLAG_ARTIFACT_RESULT),
    representativeMovement: firstFlag(flags, FLAG_REPRESENTATIVE_MOVEMENT, NONE_VALUE),
    linkedPackages,
    supersedes: firstFlag(flags, FLAG_SUPERSEDES, NONE_VALUE),
    supersededBy: firstFlag(flags, FLAG_SUPERSEDED_BY, NONE_VALUE),
    nextImplication: firstFlag(flags, FLAG_NEXT_IMPLICATION),
  };
}

function validateNewEntryInput(entry) {
  const requiredValues = [
    [FLAG_ID, entry.id],
    [FLAG_HYPOTHESIS, entry.hypothesis],
    [FLAG_PROBE, entry.probe],
    [FLAG_ARTIFACT_RESULT, entry.artifactResult],
    [FLAG_LINKED_PACKAGE, entry.linkedPackages.join(', ')],
    [FLAG_NEXT_IMPLICATION, entry.nextImplication],
  ];
  const missing = requiredValues
    .filter(([, value]) => normalizeText(value).length === NUM_ZERO)
    .map(([flagName]) => `--${flagName}`);
  if (missing.length > NUM_ZERO) {
    throw new Error(`Missing required flags: ${missing.join(', ')}.`);
  }
  if (!ENTRY_HEADING_PATTERN.test(`## ${entry.id}`)) {
    throw new Error(`${entry.id}: invalid theory id.`);
  }
  if (!STATUS_VALUES.includes(entry.status)) {
    throw new Error(`${entry.status}: invalid status.`);
  }
}

export function appendTheoryLedgerEntry(content, entry) {
  validateNewEntryInput(entry);
  const block = buildTheoryLedgerEntryBlock(entry);
  const trimmed = String(content || EMPTY_TEXT).replace(/\s+$/u, EMPTY_TEXT);
  return `${trimmed}${NEWLINE}${NEWLINE}${block}${NEWLINE}`;
}

async function readLedgerFile(ledgerPath) {
  return fs.readFile(ledgerPath, ENCODING_UTF8);
}

async function runValidate(flags) {
  const ledgerPath = ledgerPathFromFlags(flags);
  const packagesDir = firstFlag(flags, FLAG_PACKAGES_DIR);
  const content = await readLedgerFile(ledgerPath);
  const {entries, errors} = validateTheoryLedgerContent(content, {packagesDir});
  if (errors.length > NUM_ZERO) {
    throw new Error(errors.join(NEWLINE));
  }
  return `Theory ledger validation OK for ${entries.length} entr${entries.length === NUM_ONE ? 'y' : 'ies'}.`;
}

async function runList(flags) {
  const ledgerPath = ledgerPathFromFlags(flags);
  const packagesDir = firstFlag(flags, FLAG_PACKAGES_DIR);
  const content = await readLedgerFile(ledgerPath);
  const {entries, errors} = validateTheoryLedgerContent(content, {packagesDir});
  if (errors.length > NUM_ZERO) {
    throw new Error(errors.join(NEWLINE));
  }
  return renderTheoryLedgerList(filterTheoryLedgerEntries(entries, {
    status: firstFlag(flags, FLAG_STATUS),
    owner: firstFlag(flags, FLAG_OWNER),
  }));
}

async function runNew(flags) {
  const ledgerPath = ledgerPathFromFlags(flags);
  const packagesDir = firstFlag(flags, FLAG_PACKAGES_DIR);
  const content = await readLedgerFile(ledgerPath);
  const entry = buildEntryFromFlags(flags);
  const nextContent = appendTheoryLedgerEntry(content, entry);
  const validation = validateTheoryLedgerContent(nextContent, {packagesDir});
  if (validation.errors.length > NUM_ZERO) {
    throw new Error(validation.errors.join(NEWLINE));
  }
  await fs.writeFile(ledgerPath, nextContent, ENCODING_UTF8);
  return `Added ${entry.id} to ${ledgerPath}.`;
}

export async function runCli(args = process.argv.slice(NUM_TWO)) {
  const {command, flags} = parseArgs(args);
  if (command === COMMAND_VALIDATE) {
    return runValidate(flags);
  }
  if (command === COMMAND_LIST) {
    return runList(flags);
  }
  if (command === COMMAND_NEW) {
    return runNew(flags);
  }
  throw new Error(`${command}: unknown command.${NEWLINE}${HELP_TEXT}`);
}

async function main() {
  try {
    const output = await runCli();
    console.log(output);
    process.exitCode = EXIT_SUCCESS;
  } catch (error) {
    console.error(error.message);
    process.exitCode = EXIT_FAILURE;
  }
}

if (process.argv[NUM_ONE] === fileURLToPath(import.meta.url)) {
  await main();
}
