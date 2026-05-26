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
const NUM_THREE = 3;
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const FLAG_PREFIX = '--';
const PACKAGES_DIR = path.join('work', 'packages');
const SPRINTS_DIR = path.join('work', 'sprints');
const THEORY_LEDGER_PATH = path.join('work', 'theory-ledger.md');
const CURRENT_BLOCKER_JSON = path.join('work', 'sprints', 'current-blocker.json');
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
const FLAG_THEORY = 'theory';
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
const DEFAULT_SCENARIO = 'none';
const DEFAULT_ARTIFACT = 'none';
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
const HELP_TEXT = [
  'Usage:',
  '  node scripts/work-theory-loop.js start --problem <text> --artifact <path> --success <text> [--write]',
  '  node scripts/work-theory-loop.js next --title <title> --slug <slug> --problem <text> --owner <owner> --boundary <boundary> --dominant-reason <reason> --theory <text> [--theory <text>] [--theory <text>] --discriminator <command> [--write]',
  '  node scripts/work-theory-loop.js record --theory <id-or-label> --result <result> --evidence <text> [--package <path>] [--ledger-status <status>] [--write]',
  '  node scripts/work-theory-loop.js fix --theory <id-or-label> --evidence <text> --files <paths> --validation <command> [--package <path>] [--write]',
  '',
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

function validateTheories(theories) {
  if (theories.length < NUM_ONE || theories.length > NUM_THREE) {
    throw new Error('Theory-loop packages require 1-3 --theory values.');
  }
}

export function renderTheoryLoopSprintSection(options = {}) {
  const problem = normalizeWhitespace(options.problem);
  const artifact = normalizeWhitespace(options.artifact || DEFAULT_ARTIFACT);
  const success = normalizeWhitespace(options.success);
  if (!problem || !success) {
    throw new Error('Theory-loop sprint start requires problem and success text.');
  }
  return [
    '## Theory Loop Sprint',
    '',
    `- Central problem: ${problem}`,
    `- Representative artifact: ${artifact}`,
    `- Success condition: ${success}`,
    '- Iteration rule: create or update one compact theory package with 1-3 theories, read source/log evidence first, implement only confirmed bugs, then record each theory as supported, avoided, falsified, fixed, migrated, or needs-rerun.',
    '- Ceremony budget: use `npm run work:theory-loop -- next|record|fix` for package and ledger updates before hand-editing markdown.',
  ].join(NEWLINE);
}

export function renderTheoryLoopPackageSection(options = {}) {
  const problem = normalizeWhitespace(options.problem);
  const artifact = normalizeWhitespace(options.artifact || DEFAULT_ARTIFACT);
  const discriminator = normalizeWhitespace(options.discriminator);
  const theories = options.theories || [];
  validateTheories(theories);
  if (!problem || !discriminator) {
    throw new Error('Theory-loop package requires problem and discriminator text.');
  }
  return [
    '## Theory Loop',
    '',
    `- Central problem: ${problem}`,
    `- Representative artifact: ${artifact}`,
    `- Cheap discriminator: \`${discriminator}\``,
    '- Source/log inspection targets:',
    renderMarkdownList(options.inspect || []),
    '- Theory batch:',
    ...theories.map((theory, index) => `${index + NUM_ONE}. ${theory}`),
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
    'Central problem needs a small theory batch and cheap discriminator.';
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
  const validation = normalizeText(options.validation) || discriminator;
  for (const [label, value] of Object.entries({
    title,
    slug,
    owner,
    boundary,
    'dominant-reason': dominantReason,
    discriminator,
    problem,
  })) {
    if (!value) {
      throw new Error(`Theory-loop next requires ${label}.`);
    }
  }
  const args = [
    'scripts/work-package-new.js',
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
      'Run the theory-loop discriminator, inspect source/log evidence, and record each theory result.',
    '--current-state',
    `Theory-loop package for ${problem}.`,
    '--artifact',
    normalizeText(options.artifact) || DEFAULT_ARTIFACT,
    '--proof',
    `falsifier: ${discriminator}`,
    '--proof',
    `regression: ${validation}`,
  ];
  for (const writePath of options.writeScope || []) {
    args.push('--write-scope', writePath);
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

async function runStart(flags) {
  const sprintPath = firstFlag(flags, FLAG_SPRINT) || await findActiveSprintFile();
  const section = renderTheoryLoopSprintSection({
    problem: requireFlag(flags, FLAG_PROBLEM),
    artifact: firstFlag(flags, FLAG_ARTIFACT, DEFAULT_ARTIFACT),
    success: requireFlag(flags, FLAG_SUCCESS),
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
  const options = {
    title: requireFlag(flags, FLAG_TITLE),
    slug,
    problem: requireFlag(flags, FLAG_PROBLEM),
    artifact: firstFlag(flags, FLAG_ARTIFACT, DEFAULT_ARTIFACT),
    owner: requireFlag(flags, FLAG_OWNER),
    boundary: requireFlag(flags, FLAG_BOUNDARY),
    dominantReason: requireFlag(flags, FLAG_DOMINANT_REASON),
    discriminator: requireFlag(flags, FLAG_DISCRIMINATOR),
    validation: firstFlag(flags, FLAG_VALIDATION),
    nextAction: firstFlag(flags, FLAG_NEXT_ACTION),
    theories,
    inspect: repeatedFlag(flags, FLAG_INSPECT),
    writeScope: repeatedFlag(flags, FLAG_WRITE_SCOPE),
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
      `Test ${theories.length} theories with ${options.discriminator}.`,
  });
  await fs.writeFile(sprintPath, nextSprintContent, ENCODING_UTF8);
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
    appendTheoryLoopResult(content, record),
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
