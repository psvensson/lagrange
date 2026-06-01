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
const FLAG_CHECK_CONTINUATION = '--check-continuation';
const STATUS_ACTIVE = 'active';
const STATUS_DONE = 'done';
const PROCESS_ARG_SCRIPT_INDEX = 1;
const SCRIPT_FILE_NAME = 'work-sprint-advance.js';
const THEORY_LOOP_SUCCESS_EVIDENCE_HEADING =
  '## Theory Loop Success Evidence';
const THEORY_LOOP_EVIDENCE_ANCHOR_HEADING = '## Evidence Anchor';
const THEORY_LOOP_TERMINATION_HEADING = '## Theory Loop Termination';
const THEORY_LOOP_TERMINATION_LOOP_STATUS_LABEL = 'Loop status';
const THEORY_LOOP_TERMINATION_REASON_LABEL = 'Termination reason';
const THEORY_LOOP_TERMINATION_EVIDENCE_LABEL = 'Evidence';
const THEORY_LOOP_TERMINATION_HUMAN_OVERRIDE_LABEL = 'Human override ref';
const THEORY_LOOP_TERMINATION_BLOCKED_FROZEN =
  'blocked-frozen-decision';
const THEORY_LOOP_TERMINATION_BLOCKED_REASONS = new Set([
  THEORY_LOOP_TERMINATION_BLOCKED_FROZEN,
  'blocked-external-dependency',
]);
const THEORY_LOOP_TERMINATION_TERMINATED = 'terminated';
const THEORY_LOOP_SUCCESS_RESULT_VALUE = 'success-condition-met';
const THEORY_LOOP_FORBIDDEN_SUCCESS_CONDITION_PATTERN =
  /\b(?:architecture[-\s]+gap|architecture[-\s]+stop|owner[-\s]+boundary[-\s]+migration|same[-\s]+frontier|classification[-\s]+only|needs[-\s]+rerun|route[-\s]+selection|human[-\s]+escalation)\b/iu;
const THEORY_LOOP_UNFINISHED_RESULT_PATTERN =
  /\b(?:same-frontier|classification-only|needs-rerun|pending|unknown|not[-\s]+met)\b/iu;
const THEORY_LOOP_EMPTY_TERMINATION_FIELD_PATTERN =
  /^(?:tbd|todo|pending|unknown|n\/a|none|-|<[^>]+>)$/iu;
const HELP_TEXT = [
  'Usage: node scripts/work-sprint-advance.js [--dry-run|--write|--check-continuation] [--sprint <active-sprint.md>] [--force]',
  '',
  'Closes the active sprint only when no active or todo packages remain.',
  'Theory-loop sprints also require ## Theory Loop Success Evidence proving the original success condition is met.',
  'With --check-continuation, fails if a running theory-loop sprint has no active/todo package and no terminal evidence.',
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
    /^## Theory Loop Shape\b/mu.test(content) ||
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

function isConcreteTheoryLoopTerminationValue(value) {
  const normalized = normalizeLedgerFieldValue(value);
  return normalized.length > 0 &&
    !THEORY_LOOP_EMPTY_TERMINATION_FIELD_PATTERN.test(normalized);
}

function validateBlockedTheoryLoopTerminationEvidence(content, sprintPath) {
  const section = extractMarkdownLevelTwoSection(
    content,
    THEORY_LOOP_TERMINATION_HEADING,
  );
  if (!section) {
    return [
      `${sprintPath}: active theory-loop sprint has no active/todo ` +
      `packages and lacks ${THEORY_LOOP_TERMINATION_HEADING}.`,
    ];
  }
  const loopStatus = findMarkdownField(
    section,
    THEORY_LOOP_TERMINATION_LOOP_STATUS_LABEL,
  ).toLowerCase();
  const reason = findMarkdownField(
    section,
    THEORY_LOOP_TERMINATION_REASON_LABEL,
  ).toLowerCase();
  const evidence = findMarkdownField(
    section,
    THEORY_LOOP_TERMINATION_EVIDENCE_LABEL,
  );
  const humanOverride = findMarkdownField(
    section,
    THEORY_LOOP_TERMINATION_HUMAN_OVERRIDE_LABEL,
  );
  const errors = [];
  if (loopStatus !== THEORY_LOOP_TERMINATION_TERMINATED) {
    errors.push(
      `${sprintPath}: ${THEORY_LOOP_TERMINATION_HEADING} ` +
      `${THEORY_LOOP_TERMINATION_LOOP_STATUS_LABEL} must be ` +
      `${THEORY_LOOP_TERMINATION_TERMINATED} before the package queue can be empty.`,
    );
  }
  if (!THEORY_LOOP_TERMINATION_BLOCKED_REASONS.has(reason)) {
    errors.push(
      `${sprintPath}: empty active theory-loop queue requires blocked ` +
      `${THEORY_LOOP_TERMINATION_REASON_LABEL} to be ` +
      'blocked-frozen-decision or blocked-external-dependency, or else ' +
      `record ${THEORY_LOOP_SUCCESS_EVIDENCE_HEADING} and close the sprint.`,
    );
  }
  if (!isConcreteTheoryLoopTerminationValue(evidence)) {
    errors.push(
      `${sprintPath}: ${THEORY_LOOP_TERMINATION_HEADING} requires concrete ` +
      `${THEORY_LOOP_TERMINATION_EVIDENCE_LABEL} for a blocked handoff.`,
    );
  }
  if (
    reason === THEORY_LOOP_TERMINATION_BLOCKED_FROZEN &&
    !isConcreteTheoryLoopTerminationValue(humanOverride)
  ) {
    errors.push(
      `${sprintPath}: ${THEORY_LOOP_TERMINATION_HEADING} with ` +
      `${THEORY_LOOP_TERMINATION_REASON_LABEL} ` +
      `${THEORY_LOOP_TERMINATION_BLOCKED_FROZEN} requires concrete ` +
      `${THEORY_LOOP_TERMINATION_HUMAN_OVERRIDE_LABEL}.`,
    );
  }
  return errors;
}

function validateTheoryLoopSuccessEvidence(content, sprintPath) {
  if (!isTheoryLoopSprint(content, sprintPath)) {
    return [];
  }
  const evidenceAnchorSection = extractMarkdownLevelTwoSection(
    content,
    THEORY_LOOP_EVIDENCE_ANCHOR_HEADING,
  );
  const originalSuccessCondition = evidenceAnchorSection ?
    findMarkdownField(evidenceAnchorSection, 'Success condition') :
    EMPTY_TEXT;
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
  const matchedSuccessCondition = findMarkdownField(
    section,
    'Matched success condition',
  );
  const continuationStopped = findMarkdownField(
    section,
    'Continuation stopped because',
  );
  const errors = [];
  if (!originalSuccessCondition) {
    errors.push(
      `${sprintPath}: theory-loop sprint closure requires an original ` +
      'Evidence Anchor Success condition.',
    );
  } else if (
    THEORY_LOOP_FORBIDDEN_SUCCESS_CONDITION_PATTERN.test(originalSuccessCondition)
  ) {
    errors.push(
      `${sprintPath}: theory-loop sprint Evidence Anchor Success condition ` +
      'must name the original representative or release success metric, not an alternate stop such as architecture-gap, owner-boundary-migration, classification, or route selection.',
    );
  }
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
  if (result.toLowerCase() !== THEORY_LOOP_SUCCESS_RESULT_VALUE) {
    errors.push(
      `${sprintPath}: theory-loop sprint closure result must be ` +
      `${THEORY_LOOP_SUCCESS_RESULT_VALUE}; architecture-gap, migration, ` +
      'classification, or route selection are package learning outcomes, not sprint success.',
    );
  }
  if (!matchedSuccessCondition) {
    errors.push(
      `${sprintPath}: theory-loop sprint closure requires Matched success condition.`,
    );
  } else if (
    originalSuccessCondition &&
    matchedSuccessCondition !== originalSuccessCondition
  ) {
    errors.push(
      `${sprintPath}: theory-loop sprint closure Matched success condition ` +
      'must exactly match the original Evidence Anchor Success condition.',
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
      matchedSuccessCondition,
      continuationStopped,
    ].join(' '))
  ) {
    errors.push(
      `${sprintPath}: theory-loop sprint closure still describes unfinished work; keep the sprint active and create the next successor package.`,
    );
  }
  return errors;
}

function validateTheoryLoopQueueExhaustion(summary, sprintContent) {
  const sprintPath = summary.sprintPath;
  if (!isTheoryLoopSprint(sprintContent, sprintPath)) {
    return [];
  }
  if (summary.counts.left > 0) {
    return [];
  }
  const successErrors = validateTheoryLoopSuccessEvidence(
    sprintContent,
    sprintPath,
  );
  if (successErrors.length === 0) {
    return [];
  }
  const blockedTerminationErrors = validateBlockedTheoryLoopTerminationEvidence(
    sprintContent,
    sprintPath,
  );
  if (blockedTerminationErrors.length === 0) {
    return [];
  }
  return [
    `${sprintPath}: active theory-loop sprint has no active/todo ` +
    'packages but no terminal success evidence or blocked termination ' +
    'handoff. Create or activate the next successor package before ' +
    'stopping, or record valid terminal evidence.',
    ...successErrors,
    ...blockedTerminationErrors,
  ];
}

async function buildTheoryLoopContinuationGuard(options = {}) {
  const root = options.root ?? process.cwd();
  const sprintPath = options.sprintPath ?
    normalizeRelativePath(options.sprintPath) :
    undefined;
  const summary = await buildSprintRemainingSummary({root, sprintPath});
  const sprintContent = await fs.readFile(
    path.join(root, summary.sprintPath),
    ENCODING_UTF8,
  );
  const errors = validateTheoryLoopQueueExhaustion(summary, sprintContent);
  if (errors.length > 0) {
    throw new Error(errors.join(NEWLINE));
  }
  return {
    sprintPath: summary.sprintPath,
    packagesLeft: summary.counts.left,
    theoryLoop: isTheoryLoopSprint(sprintContent, summary.sprintPath),
  };
}

async function assertTheoryLoopQueueWillRemainValidAfterPackageClose(
  options = {},
) {
  const root = options.root ?? process.cwd();
  const closingPackagePath = normalizeRelativePath(options.packagePath || EMPTY_TEXT);
  const sprintPath = options.sprintPath ?
    normalizeRelativePath(options.sprintPath) :
    undefined;
  const summary = await buildSprintRemainingSummary({root, sprintPath});
  const remainingPackages = summary.leftPackages.filter((workPackage) =>
    workPackage.path !== closingPackagePath);
  if (remainingPackages.length > 0) {
    return;
  }
  const sprintContent = await fs.readFile(
    path.join(root, summary.sprintPath),
    ENCODING_UTF8,
  );
  const hypotheticalSummary = {
    ...summary,
    leftPackages: [],
    counts: {
      active: 0,
      todo: 0,
      left: 0,
    },
  };
  const errors = validateTheoryLoopQueueExhaustion(
    hypotheticalSummary,
    sprintContent,
  );
  if (errors.length > 0) {
    throw new Error([
      `Closing ${closingPackagePath} would exhaust the active theory-loop ` +
      'package queue.',
      ...errors,
    ].join(NEWLINE));
  }
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
        'Theory-loop sprints continue indefinitely until the original success condition is met; create or activate the successor package instead of closing the sprint.',
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

function renderTheoryLoopContinuationGuard(result) {
  return [
    '# Theory Loop Continuation Guard',
    EMPTY_TEXT,
    `Sprint: \`${result.sprintPath}\``,
    `Theory loop: ${result.theoryLoop ? 'yes' : 'no'}`,
    `Packages left: ${result.packagesLeft}`,
    'Status: valid',
    EMPTY_TEXT,
  ].join(NEWLINE);
}

async function runCli(args = process.argv.slice(2), options = {}) {
  if (args.includes(FLAG_HELP)) {
    return `${HELP_TEXT}${NEWLINE}`;
  }
  if (args.includes(FLAG_CHECK_CONTINUATION)) {
    const sprintPath = parseOptionValue(args, FLAG_SPRINT);
    const result = await buildTheoryLoopContinuationGuard({
      root: options.root,
      sprintPath,
    });
    return renderTheoryLoopContinuationGuard(result);
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
  assertTheoryLoopQueueWillRemainValidAfterPackageClose,
  buildSprintAdvancePlan,
  buildTheoryLoopContinuationGuard,
  renderSprintAdvancePlan,
  renderTheoryLoopContinuationGuard,
  runCli,
  updateReferenceContent,
  validateTheoryLoopQueueExhaustion,
};
