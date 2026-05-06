#!/usr/bin/env node

import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);

const ENCODING_UTF8 = 'utf8';
const EXIT_FAILURE = 1;
const EXIT_SUCCESS = 0;
const NUM_ZERO = 0;
const NUM_ONE = 1;
const MAX_GIT_STATUS_LINES = 30;
const CURRENT_BLOCKER_JSON_PATH = path.join(
  'work',
  'sprints',
  'current-blocker.json',
);
const AGENTS_PATH = 'AGENTS.md';
const STEERING_PATHS = Object.freeze([
  path.join('.kiro', 'steering', 'system guidelines.md'),
  path.join('.kiro', 'steering', 'doctrine.md'),
  path.join('.kiro', 'steering', 'code-style.md'),
  path.join('.kiro', 'steering', 'testing-guidelines.md'),
]);
const WORK_README_PATH = path.join('work', 'README.md');
const GIT_COMMAND = 'git';
const GIT_STATUS_ARGS = Object.freeze(['status', '--short']);
const NPM_RUN_WORK_CURRENT_BLOCKER_COMMAND = 'npm run work:current-blocker';
const NPM_RUN_WORK_VALIDATE_COMMAND = 'npm run work:validate';
const CHECK_LITERAL_COMMAND = 'node scripts/check-guideline-literals.js';
const CHECK_DECISION_BOUNDARY_COMMAND =
  'node scripts/check-guideline-decision-boundaries.js';
const CHECK_RUNTIME_GRAMMAR_COMMAND =
  'node scripts/check-runtime-grammar-contracts.js';
const GIT_DIFF_CHECK_COMMAND = 'git diff --check --';
const SOURCE_DIRECTORY_PREFIX = 'src/';
const JAVASCRIPT_EXTENSION = '.js';
const MARKDOWN_HEADING_PREFIX = '# ';
const SECTION_HEADING_PREFIX = '## ';
const CHECKBOX_OPEN_PREFIX = '- [ ]';
const CHECKBOX_ANY_PREFIX = '- [';
const MARKDOWN_LIST_PREFIX = '- ';
const NUMBERED_LIST_PATTERN = /^\d+\.\s+/u;
const LABEL_SEPARATOR = ': ';
const EMPTY_STRING = '';
const SPACE = ' ';
const NEWLINE = '\n';
const PATH_PRESENT = 'present';
const PATH_MISSING = 'missing';
const OPTIONAL_TEXT_PRESENT = 'optional-text-present';
const OPTIONAL_TEXT_MISSING = 'optional-text-missing';
const GIT_STATUS_AVAILABLE = 'git-status-available';
const GIT_STATUS_UNAVAILABLE_STATE = 'git-status-unavailable';
const DEFAULT_UNKNOWN = 'unknown';
const OUTPUT_TITLE = '# Work Context';
const SECTION_CURRENT_BLOCKER = 'Current Blocker';
const SECTION_CURRENT_STATE = 'Current State';
const SECTION_NEXT_ACTION = 'Next Action';
const SECTION_FIRST_FILES = 'First Files To Read';
const SECTION_TOUCHED_FILES = 'Touched Files';
const SECTION_PROOF_LADDER = 'Proof Ladder';
const SECTION_OPEN_CHECKLIST = 'Open Package Checklist';
const SECTION_OUT_OF_SCOPE = 'Out Of Scope';
const SECTION_USEFUL_COMMANDS = 'Useful Commands';
const SECTION_WORKTREE = 'Worktree Summary';
const PACKAGE_SECTION_OUT_OF_SCOPE = 'Out Of Scope';
const MESSAGE_CURRENT_BLOCKER_MISSING =
  'No current blocker handoff was found.';
const MESSAGE_CURRENT_BLOCKER_HINT =
  `Run \`${NPM_RUN_WORK_CURRENT_BLOCKER_COMMAND}\` first.`;
const MESSAGE_NO_OPEN_CHECKLIST = 'No open checklist items found in package.';
const MESSAGE_NO_OUT_OF_SCOPE = 'No Out Of Scope section found in package.';
const MESSAGE_NO_GIT_STATUS = 'No dirty git status entries.';
const MESSAGE_GIT_STATUS_UNAVAILABLE = 'Git status unavailable.';
const FIELD_LABELS = Object.freeze({
  ARTIFACT: 'Artifact',
  BOUNDARY: 'Boundary',
  DIRTY_ENTRIES: 'Dirty entries',
  DOMINANT_REASON: 'Dominant reason',
  OWNER: 'Owner',
  PACKAGE: 'Package',
  PACKAGE_TITLE: 'Package title',
  PLAYBACK: 'Playback',
  PREDECESSOR: 'Predecessor',
  SCENARIO: 'Scenario',
  SPRINT: 'Sprint',
  STATUS: 'Status',
});
const SHELL_SAFE_PATTERN = /^[A-Za-z0-9_./:@%+=,-]+$/u;
const SINGLE_QUOTE = '\'';
const SINGLE_QUOTE_ESCAPE = '\'\\\'\'';

function appendSection(lines, title) {
  lines.push(EMPTY_STRING, `${SECTION_HEADING_PREFIX}${title}`);
}

function normalizeString(value) {
  return String(value || EMPTY_STRING).trim();
}

function normalizeStringList(values = []) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map(normalizeString)
        .filter((value) => value.length > NUM_ZERO),
    ),
  ];
}

function appendKeyValue(lines, label, value) {
  const normalizedValue = normalizeString(value) || DEFAULT_UNKNOWN;
  lines.push(`${MARKDOWN_LIST_PREFIX}${label}${LABEL_SEPARATOR}${normalizedValue}`);
}

function appendList(lines, values, fallback) {
  const normalizedValues = normalizeStringList(values);
  if (normalizedValues.length === NUM_ZERO) {
    lines.push(`${MARKDOWN_LIST_PREFIX}${fallback}`);
    return;
  }
  for (const value of normalizedValues) {
    lines.push(`${MARKDOWN_LIST_PREFIX}${value}`);
  }
}

function shellQuote(value) {
  const normalizedValue = normalizeString(value);
  if (SHELL_SAFE_PATTERN.test(normalizedValue)) {
    return normalizedValue;
  }
  return SINGLE_QUOTE +
    normalizedValue.replaceAll(SINGLE_QUOTE, SINGLE_QUOTE_ESCAPE) +
    SINGLE_QUOTE;
}

function commandWithPaths(command, paths = []) {
  const normalizedPaths = normalizeStringList(paths);
  if (normalizedPaths.length === NUM_ZERO) {
    return command;
  }
  return [
    command,
    ...normalizedPaths.map(shellQuote),
  ].join(SPACE);
}

async function readTextFile(filePath) {
  return fs.readFile(filePath, ENCODING_UTF8);
}

async function readJsonFile(filePath) {
  const content = await readTextFile(filePath);
  return JSON.parse(content);
}

async function readOptionalTextFile(filePath) {
  try {
    return {
      content: await readTextFile(filePath),
      status: OPTIONAL_TEXT_PRESENT,
    };
  } catch (_error) {
    return {
      content: EMPTY_STRING,
      status: OPTIONAL_TEXT_MISSING,
    };
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (_error) {
    return false;
  }
}

function extractMarkdownTitle(content = EMPTY_STRING) {
  const titleLine = content
    .split(NEWLINE)
    .find((line) => line.startsWith(MARKDOWN_HEADING_PREFIX));
  return titleLine ?
    titleLine.slice(MARKDOWN_HEADING_PREFIX.length).trim() :
    DEFAULT_UNKNOWN;
}

function appendOpenChecklistItem(items, itemParts) {
  const item = normalizeString(itemParts.join(SPACE));
  itemParts.length = NUM_ZERO;
  if (item.length > NUM_ZERO) {
    items.push(item);
  }
}

function extractOpenChecklist(content = EMPTY_STRING) {
  const items = [];
  const currentItemParts = [];

  for (const rawLine of content.split(NEWLINE)) {
    const line = rawLine.trim();
    if (line.startsWith(CHECKBOX_OPEN_PREFIX)) {
      appendOpenChecklistItem(items, currentItemParts);
      currentItemParts.push(line.slice(CHECKBOX_OPEN_PREFIX.length).trim());
      continue;
    }
    if (
      line.length === NUM_ZERO ||
      line.startsWith(CHECKBOX_ANY_PREFIX) ||
      line.startsWith(SECTION_HEADING_PREFIX)
    ) {
      appendOpenChecklistItem(items, currentItemParts);
      continue;
    }
    if (currentItemParts.length > NUM_ZERO) {
      currentItemParts.push(line);
    }
  }

  appendOpenChecklistItem(items, currentItemParts);
  return items;
}

function startsMarkdownListItem(line) {
  return (
    NUMBERED_LIST_PATTERN.test(line) ||
    line.startsWith(MARKDOWN_LIST_PREFIX)
  );
}

function stripMarkdownListMarker(line) {
  if (NUMBERED_LIST_PATTERN.test(line)) {
    return line.replace(NUMBERED_LIST_PATTERN, EMPTY_STRING).trim();
  }
  if (line.startsWith(MARKDOWN_LIST_PREFIX)) {
    return line.slice(MARKDOWN_LIST_PREFIX.length).trim();
  }
  return line;
}

function appendMarkdownSectionItem(items, itemParts) {
  const item = normalizeString(itemParts.join(SPACE));
  itemParts.length = NUM_ZERO;
  if (item.length > NUM_ZERO) {
    items.push(item);
  }
}

function extractMarkdownSection(content = EMPTY_STRING, title) {
  const lines = content.split(NEWLINE);
  const heading = `${SECTION_HEADING_PREFIX}${title}`;
  const startIndex = lines.findIndex((line) => line.trim() === heading);
  if (startIndex < NUM_ZERO) {
    return [];
  }
  const sectionItems = [];
  const currentItemParts = [];
  for (const line of lines.slice(startIndex + NUM_ONE)) {
    if (line.startsWith(SECTION_HEADING_PREFIX)) {
      appendMarkdownSectionItem(sectionItems, currentItemParts);
      break;
    }
    const trimmedLine = line.trim();
    if (trimmedLine.length === NUM_ZERO) {
      appendMarkdownSectionItem(sectionItems, currentItemParts);
      continue;
    }
    if (startsMarkdownListItem(trimmedLine)) {
      appendMarkdownSectionItem(sectionItems, currentItemParts);
      currentItemParts.push(stripMarkdownListMarker(trimmedLine));
      continue;
    }
    if (currentItemParts.length > NUM_ZERO) {
      currentItemParts.push(trimmedLine);
      continue;
    }
    sectionItems.push(trimmedLine);
  }
  appendMarkdownSectionItem(sectionItems, currentItemParts);
  return sectionItems;
}

async function resolvePathPresenceLabel(filePath) {
  const exists = await fileExists(filePath);
  return `${filePath} (${exists ? PATH_PRESENT : PATH_MISSING})`;
}

async function buildFirstReadPathLabels(currentBlocker) {
  const currentPaths = [
    AGENTS_PATH,
    ...STEERING_PATHS,
    WORK_README_PATH,
    currentBlocker.package,
    currentBlocker.artifact,
    ...normalizeStringList(currentBlocker.touchedFiles),
  ].filter((filePath) => normalizeString(filePath).length > NUM_ZERO);
  const uniquePaths = normalizeStringList(currentPaths);
  return Promise.all(uniquePaths.map(resolvePathPresenceLabel));
}

function buildRuntimeTouchedFiles(currentBlocker) {
  return normalizeStringList(currentBlocker.touchedFiles).filter(
    (filePath) =>
      filePath.startsWith(SOURCE_DIRECTORY_PREFIX) &&
      filePath.endsWith(JAVASCRIPT_EXTENSION),
  );
}

function buildUsefulCommands(currentBlocker) {
  const touchedFiles = normalizeStringList(currentBlocker.touchedFiles);
  const runtimeTouchedFiles = buildRuntimeTouchedFiles(currentBlocker);
  const commands = [
    NPM_RUN_WORK_CURRENT_BLOCKER_COMMAND,
    NPM_RUN_WORK_VALIDATE_COMMAND,
  ];
  if (runtimeTouchedFiles.length > NUM_ZERO) {
    commands.push(commandWithPaths(CHECK_LITERAL_COMMAND, runtimeTouchedFiles));
    commands.push(
      commandWithPaths(CHECK_DECISION_BOUNDARY_COMMAND, runtimeTouchedFiles),
    );
    commands.push(
      commandWithPaths(CHECK_RUNTIME_GRAMMAR_COMMAND, runtimeTouchedFiles),
    );
  }
  if (touchedFiles.length > NUM_ZERO) {
    commands.push(commandWithPaths(GIT_DIFF_CHECK_COMMAND, touchedFiles));
  }
  return commands;
}

async function readGitStatus() {
  try {
    const result = await execFileAsync(GIT_COMMAND, GIT_STATUS_ARGS, {
      cwd: process.cwd(),
    });
    return {
      lines: result.stdout
        .split(NEWLINE)
        .map((line) => line.trimEnd())
        .filter((line) => line.length > NUM_ZERO),
      status: GIT_STATUS_AVAILABLE,
    };
  } catch (_error) {
    return {
      lines: [],
      status: GIT_STATUS_UNAVAILABLE_STATE,
    };
  }
}

function appendGitStatus(lines, gitStatus) {
  if (gitStatus.status === GIT_STATUS_UNAVAILABLE_STATE) {
    lines.push(`${MARKDOWN_LIST_PREFIX}${MESSAGE_GIT_STATUS_UNAVAILABLE}`);
    return;
  }
  const gitStatusLines = gitStatus.lines;
  appendKeyValue(
    lines,
    FIELD_LABELS.DIRTY_ENTRIES,
    String(gitStatusLines.length),
  );
  if (gitStatusLines.length === NUM_ZERO) {
    lines.push(`${MARKDOWN_LIST_PREFIX}${MESSAGE_NO_GIT_STATUS}`);
    return;
  }
  for (const line of gitStatusLines.slice(NUM_ZERO, MAX_GIT_STATUS_LINES)) {
    lines.push(`${MARKDOWN_LIST_PREFIX}\`${line}\``);
  }
  const remainingCount = gitStatusLines.length - MAX_GIT_STATUS_LINES;
  if (remainingCount > NUM_ZERO) {
    lines.push(`${MARKDOWN_LIST_PREFIX}${remainingCount} more entries omitted.`);
  }
}

async function buildContextLines(currentBlocker, packageContent) {
  const lines = [OUTPUT_TITLE];
  const packageTitle = extractMarkdownTitle(packageContent || EMPTY_STRING);
  const firstReadPaths = await buildFirstReadPathLabels(currentBlocker);
  const gitStatus = await readGitStatus();

  appendSection(lines, SECTION_CURRENT_BLOCKER);
  appendKeyValue(lines, FIELD_LABELS.SPRINT, currentBlocker.sprint);
  appendKeyValue(lines, FIELD_LABELS.PACKAGE, currentBlocker.package);
  appendKeyValue(lines, FIELD_LABELS.STATUS, currentBlocker.status);
  appendKeyValue(lines, FIELD_LABELS.SCENARIO, currentBlocker.scenario);
  appendKeyValue(lines, FIELD_LABELS.OWNER, currentBlocker.owner);
  appendKeyValue(lines, FIELD_LABELS.BOUNDARY, currentBlocker.boundary);
  appendKeyValue(
    lines,
    FIELD_LABELS.DOMINANT_REASON,
    currentBlocker.dominantReason,
  );
  appendKeyValue(lines, FIELD_LABELS.ARTIFACT, currentBlocker.artifact);
  appendKeyValue(lines, FIELD_LABELS.PLAYBACK, currentBlocker.playback);
  appendKeyValue(lines, FIELD_LABELS.PREDECESSOR, currentBlocker.predecessor);
  appendKeyValue(lines, FIELD_LABELS.PACKAGE_TITLE, packageTitle);

  appendSection(lines, SECTION_CURRENT_STATE);
  lines.push(normalizeString(currentBlocker.currentState) || DEFAULT_UNKNOWN);

  appendSection(lines, SECTION_NEXT_ACTION);
  lines.push(normalizeString(currentBlocker.nextAction) || DEFAULT_UNKNOWN);

  appendSection(lines, SECTION_FIRST_FILES);
  appendList(lines, firstReadPaths, DEFAULT_UNKNOWN);

  appendSection(lines, SECTION_TOUCHED_FILES);
  appendList(lines, currentBlocker.touchedFiles, DEFAULT_UNKNOWN);

  appendSection(lines, SECTION_PROOF_LADDER);
  appendList(lines, currentBlocker.proof, DEFAULT_UNKNOWN);

  appendSection(lines, SECTION_OPEN_CHECKLIST);
  appendList(
    lines,
    extractOpenChecklist(packageContent || EMPTY_STRING),
    MESSAGE_NO_OPEN_CHECKLIST,
  );

  appendSection(lines, SECTION_OUT_OF_SCOPE);
  appendList(
    lines,
    extractMarkdownSection(
      packageContent || EMPTY_STRING,
      PACKAGE_SECTION_OUT_OF_SCOPE,
    ),
    MESSAGE_NO_OUT_OF_SCOPE,
  );

  appendSection(lines, SECTION_USEFUL_COMMANDS);
  appendList(lines, buildUsefulCommands(currentBlocker), DEFAULT_UNKNOWN);

  appendSection(lines, SECTION_WORKTREE);
  appendGitStatus(lines, gitStatus);

  return lines;
}

async function main() {
  let currentBlocker;
  try {
    currentBlocker = await readJsonFile(CURRENT_BLOCKER_JSON_PATH);
  } catch (_error) {
    console.error(MESSAGE_CURRENT_BLOCKER_MISSING);
    console.error(MESSAGE_CURRENT_BLOCKER_HINT);
    return EXIT_FAILURE;
  }

  const packageRead = await readOptionalTextFile(currentBlocker.package);
  const lines = await buildContextLines(currentBlocker, packageRead.content);
  console.log(lines.join(NEWLINE));
  return EXIT_SUCCESS;
}

process.exitCode = await main();
