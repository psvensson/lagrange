#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {
  buildSprintRemainingSummary,
} from './work-sprint-remaining.js';

const ENCODING_UTF8 = 'utf8';
const EMPTY_TEXT = '';
const NEWLINE = '\n';
const ACTIVE_PREFIX = 'active-';
const DONE_PREFIX = 'done-';
const MARKDOWN_EXTENSION = '.md';
const WORK_DIRECTORY = 'work';
const SPRINTS_DIRECTORY = path.join(WORK_DIRECTORY, 'sprints');
const TRACKS_DIRECTORY = path.join(WORK_DIRECTORY, 'tracks');
const RELEASES_DIRECTORY = path.join(WORK_DIRECTORY, 'releases');
const FLAG_WRITE = '--write';
const FLAG_DRY_RUN = '--dry-run';
const FLAG_FORCE = '--force';
const FLAG_SPRINT = '--sprint';
const FLAG_HELP = '--help';
const STATUS_ACTIVE = 'active';
const STATUS_DONE = 'done';
const PROCESS_ARG_SCRIPT_INDEX = 1;
const SCRIPT_FILE_NAME = 'work-sprint-advance.js';
const THEORY_LOOP_SUCCESS_EVIDENCE_HEADING =
  '## Theory Loop Success Evidence';
const THEORY_LOOP_SUCCESS_RESULT_VALUES = Object.freeze([
  'representative-green',
  'owner-boundary-migration',
  'architecture-gap',
  'success-condition-met',
]);
const THEORY_LOOP_UNFINISHED_RESULT_PATTERN =
  /\b(?:same-frontier|classification-only|needs-rerun|pending|unknown|not[-\s]+met|no)\b/iu;
const HELP_TEXT = [
  'Usage: node scripts/work-sprint-advance.js [--dry-run|--write] [--sprint <active-sprint.md>] [--force]',
  '',
  'Closes the active sprint only when no active or todo packages remain.',
  'Theory-loop sprints also require ## Theory Loop Success Evidence with Success condition met: yes.',
  'With --write, renames active-*.md to done-*.md and updates track/release references.',
  'Without --write, runs as a dry run.',
].join(NEWLINE);

function normalizeRelativePath(filePath) {
  return path.normalize(filePath).split(path.sep).join('/');
}

function parseOptionValue(args, flagName) {
  const index = args.indexOf(flagName);
  return index >= 0 ? args[index + 1] : EMPTY_TEXT;
}

function sprintDonePath(activeSprintPath) {
  const directory = path.dirname(activeSprintPath);
  const fileName = path.basename(activeSprintPath);
  if (!fileName.startsWith(ACTIVE_PREFIX)) {
    throw new Error(`Sprint path must start with ${ACTIVE_PREFIX}: ${activeSprintPath}`);
  }
  return normalizeRelativePath(path.join(
    directory,
    fileName.replace(ACTIVE_PREFIX, DONE_PREFIX),
  ));
}

function replaceSprintStatus(content) {
  return content.replace(/\bStatus:\s*active\b/u, 'Status: done');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function extractMarkdownLevelTwoSection(content, heading) {
  const headingPattern = new RegExp(
    `(^|${NEWLINE})${escapeRegExp(heading)}(?:${NEWLINE}|$)`,
    'u',
  );
  const headingMatch = headingPattern.exec(content);
  if (!headingMatch) {
    return null;
  }
  const headingIndex = headingMatch.index +
    (headingMatch[1] === NEWLINE ? 1 : 0);
  const nextHeadingIndex = content.indexOf(`${NEWLINE}## `, headingIndex + heading.length);
  return nextHeadingIndex < 0 ?
    content.slice(headingIndex) :
    content.slice(headingIndex, nextHeadingIndex);
}

function normalizeLedgerText(value) {
  return String(value || EMPTY_TEXT).replace(/\s+/gu, ' ').trim();
}

function normalizeLedgerFieldValue(value) {
  return normalizeLedgerText(value)
    .replace(/^`|`$/gu, '')
    .replace(/[.;]\s*$/u, '')
    .trim();
}

function findMarkdownField(section, label) {
  const fieldPattern = new RegExp(`${escapeRegExp(label)}:\\s*([^\\n]+)`, 'iu');
  const match = fieldPattern.exec(section);
  return match ? normalizeLedgerFieldValue(match[1]) : EMPTY_TEXT;
}

function isTheoryLoopSprint(content, filePath = EMPTY_TEXT) {
  return (
    /^## Theory Loop Sprint\b/mu.test(content) ||
    (
      /^## Theory Option Set\b/mu.test(content) &&
      /^## Discriminator First\b/mu.test(content) &&
      /^## Real Package Rule\b/mu.test(content)
    ) ||
    (
      /theory-loop/iu.test(normalizeLedgerText(filePath)) &&
      /^## Theory Loop Generative Brief\b/mu.test(content)
    )
  );
}

function validateTheoryLoopSuccessEvidence(content, sprintPath) {
  if (!isTheoryLoopSprint(content, sprintPath)) {
    return [];
  }
  const section = extractMarkdownLevelTwoSection(
    content,
    THEORY_LOOP_SUCCESS_EVIDENCE_HEADING,
  );
  if (!section) {
    return [
      `${sprintPath}: theory-loop sprint cannot close without ${THEORY_LOOP_SUCCESS_EVIDENCE_HEADING}.`,
    ];
  }
  const successConditionMet = findMarkdownField(section, 'Success condition met');
  const freshEvidence = findMarkdownField(section, 'Fresh representative evidence');
  const result = findMarkdownField(section, 'Result');
  const continuationStopped = findMarkdownField(
    section,
    'Continuation stopped because',
  );
  const errors = [];
  if (successConditionMet.toLowerCase() !== 'yes') {
    errors.push(
      `${sprintPath}: theory-loop sprint cannot close until Success condition met: yes.`,
    );
  }
  if (!freshEvidence) {
    errors.push(
      `${sprintPath}: theory-loop sprint closure requires fresh representative evidence.`,
    );
  }
  if (!THEORY_LOOP_SUCCESS_RESULT_VALUES.includes(result.toLowerCase())) {
    errors.push(
      `${sprintPath}: theory-loop sprint closure result must be one of ` +
      `${THEORY_LOOP_SUCCESS_RESULT_VALUES.join(', ')}.`,
    );
  }
  if (!continuationStopped) {
    errors.push(
      `${sprintPath}: theory-loop sprint closure must explain why continuation stops.`,
    );
  }
  if (
    THEORY_LOOP_UNFINISHED_RESULT_PATTERN.test([
      successConditionMet,
      freshEvidence,
      result,
      continuationStopped,
    ].join(' '))
  ) {
    errors.push(
      `${sprintPath}: theory-loop sprint closure still describes unfinished work; keep the sprint active and create the next successor package.`,
    );
  }
  return errors;
}

function updateReferenceContent(content, activeSprintPath, doneSprintPath) {
  const activeBase = path.basename(activeSprintPath, MARKDOWN_EXTENSION);
  const doneBase = path.basename(doneSprintPath, MARKDOWN_EXTENSION);
  return content
    .replaceAll(activeSprintPath, doneSprintPath)
    .replaceAll(`../sprints/${activeBase}${MARKDOWN_EXTENSION}`,
      `../sprints/${doneBase}${MARKDOWN_EXTENSION}`)
    .split(NEWLINE)
    .map((line) => {
      if (!line.includes(activeBase) && !line.includes(doneBase)) {
        return line;
      }
      return line.replace(/\|\s*active\s*\|/u, '| done |');
    })
    .join(NEWLINE);
}

async function listMarkdownFiles(root, relativeDirectory) {
  const directory = path.join(root, relativeDirectory);
  let entries;
  try {
    entries = await fs.readdir(directory, {withFileTypes: true});
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(MARKDOWN_EXTENSION))
    .map((entry) => normalizeRelativePath(path.join(relativeDirectory, entry.name)));
}

async function findReferenceUpdates(root, activeSprintPath, doneSprintPath) {
  const candidates = [
    ...await listMarkdownFiles(root, TRACKS_DIRECTORY),
    ...await listMarkdownFiles(root, RELEASES_DIRECTORY),
  ];
  const updates = [];
  for (const relativePath of candidates) {
    const absolutePath = path.join(root, relativePath);
    const content = await fs.readFile(absolutePath, ENCODING_UTF8);
    const nextContent = updateReferenceContent(
      content,
      activeSprintPath,
      doneSprintPath,
    );
    if (nextContent !== content) {
      updates.push({path: relativePath, content: nextContent});
    }
  }
  return updates;
}

async function assertTargetAbsent(root, relativePath) {
  try {
    await fs.stat(path.join(root, relativePath));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
  throw new Error(`Refusing to overwrite existing sprint file: ${relativePath}`);
}

async function buildSprintAdvancePlan(options = {}) {
  const root = options.root ?? process.cwd();
  const sprintPath = options.sprintPath ?
    normalizeRelativePath(options.sprintPath) :
    undefined;
  const summary = await buildSprintRemainingSummary({root, sprintPath});
  const activeSprintPath = summary.sprintPath;
  const doneSprintPath = sprintDonePath(activeSprintPath);
  if (summary.counts.left > 0 && options.force !== true) {
    throw new Error(
      `Sprint still has ${summary.counts.left} active/todo package(s); ` +
      'use --force only after recording an explicit handoff.',
    );
  }
  const sprintContent = await fs.readFile(
    path.join(root, activeSprintPath),
    ENCODING_UTF8,
  );
  const theoryLoopClosureErrors = validateTheoryLoopSuccessEvidence(
    sprintContent,
    activeSprintPath,
  );
  if (theoryLoopClosureErrors.length > 0) {
    throw new Error(
      [
        ...theoryLoopClosureErrors,
        'Theory-loop sprints continue indefinitely until the success condition is met; create or activate the successor package instead of closing the sprint.',
      ].join(NEWLINE),
    );
  }
  const nextSprintContent = replaceSprintStatus(sprintContent);
  const referenceUpdates = await findReferenceUpdates(
    root,
    activeSprintPath,
    doneSprintPath,
  );
  return {
    root,
    sprintPath: activeSprintPath,
    doneSprintPath,
    packagesLeft: summary.counts.left,
    force: options.force === true,
    nextSprintContent,
    referenceUpdates,
  };
}

async function applySprintAdvancePlan(plan) {
  await assertTargetAbsent(plan.root, plan.doneSprintPath);
  await fs.writeFile(
    path.join(plan.root, plan.sprintPath),
    plan.nextSprintContent,
    ENCODING_UTF8,
  );
  await fs.rename(
    path.join(plan.root, plan.sprintPath),
    path.join(plan.root, plan.doneSprintPath),
  );
  for (const update of plan.referenceUpdates) {
    await fs.writeFile(
      path.join(plan.root, update.path),
      update.content,
      ENCODING_UTF8,
    );
  }
}

function renderSprintAdvancePlan(plan, options = {}) {
  const mode = options.write ? 'write' : 'dry-run';
  const lines = [
    '# Sprint Advance',
    EMPTY_TEXT,
    `Mode: \`${mode}\``,
    `Sprint: \`${plan.sprintPath}\``,
    `Target: \`${plan.doneSprintPath}\``,
    `Packages left: ${plan.packagesLeft}`,
    `Force: ${plan.force ? 'yes' : 'no'}`,
    EMPTY_TEXT,
    '## Planned Changes',
    EMPTY_TEXT,
    `- Rename \`${plan.sprintPath}\` to \`${plan.doneSprintPath}\`.`,
    '- Set the sprint status line to `done`.',
  ];
  if (plan.referenceUpdates.length === 0) {
    lines.push('- No track or release references need updates.');
  } else {
    for (const update of plan.referenceUpdates) {
      lines.push(`- Update sprint references in \`${update.path}\`.`);
    }
  }
  if (!options.write) {
    lines.push(EMPTY_TEXT, 'Dry run only. Re-run with `--write` to apply.');
  }
  return `${lines.join(NEWLINE)}${NEWLINE}`;
}

async function runCli(args = process.argv.slice(2), options = {}) {
  if (args.includes(FLAG_HELP)) {
    return `${HELP_TEXT}${NEWLINE}`;
  }
  const write = args.includes(FLAG_WRITE);
  const dryRun = args.includes(FLAG_DRY_RUN) || !write;
  const sprintPath = parseOptionValue(args, FLAG_SPRINT);
  const plan = await buildSprintAdvancePlan({
    root: options.root,
    sprintPath,
    force: args.includes(FLAG_FORCE),
  });
  if (write && !dryRun) {
    await applySprintAdvancePlan(plan);
  }
  return renderSprintAdvancePlan(plan, {write: write && !dryRun});
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
  applySprintAdvancePlan,
  buildSprintAdvancePlan,
  renderSprintAdvancePlan,
  runCli,
  updateReferenceContent,
};
