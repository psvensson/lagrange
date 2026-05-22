#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

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
const STATUS_ACTIVE = 'active';
const STATUS_SUPPORTED = 'supported';
const STATUS_FALSIFIED = 'falsified';
const STATUS_SUPERSEDED = 'superseded';
const STATUS_STALE = 'stale';
const STATUS_NEEDS_RERUN = 'needs-rerun';
const STATUS_VALUES = Object.freeze([
  STATUS_ACTIVE,
  STATUS_SUPPORTED,
  STATUS_FALSIFIED,
  STATUS_SUPERSEDED,
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

export function validateTheoryLedgerContent(content) {
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
  const content = await readLedgerFile(ledgerPath);
  const {entries, errors} = validateTheoryLedgerContent(content);
  if (errors.length > NUM_ZERO) {
    throw new Error(errors.join(NEWLINE));
  }
  return `Theory ledger validation OK for ${entries.length} entr${entries.length === NUM_ONE ? 'y' : 'ies'}.`;
}

async function runList(flags) {
  const ledgerPath = ledgerPathFromFlags(flags);
  const content = await readLedgerFile(ledgerPath);
  const {entries, errors} = validateTheoryLedgerContent(content);
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
  const content = await readLedgerFile(ledgerPath);
  const entry = buildEntryFromFlags(flags);
  const nextContent = appendTheoryLedgerEntry(content, entry);
  const validation = validateTheoryLedgerContent(nextContent);
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
