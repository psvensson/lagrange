#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const ENCODING_UTF8 = 'utf8';
const NEWLINE = '\n';
const EMPTY_TEXT = '';
const NUM_ZERO = 0;
const NUM_ONE = 1;
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const PROCESS_ARG_SCRIPT_INDEX = 1;
const COMMAND_VALIDATE = 'validate';
const COMMAND_CURRENT_BLOCKER = 'current-blocker';
const FLAG_WRITE = '--write';
const WORK_PACKAGES_DIR = path.join('work', 'packages');
const CURRENT_BLOCKER_JSON = path.join('work', 'sprints', 'current-blocker.json');
const CURRENT_BLOCKER_MARKDOWN = path.join('work', 'sprints', 'current-blocker.md');
const PACKAGE_METADATA_OPEN = '<!-- work-package';
const PACKAGE_METADATA_CLOSE = '-->';
const MARKDOWN_EXTENSION = '.md';
const PACKAGE_STATE_PATTERN =
  /^(idea|todo|active|done|superseded)-\d{8}-.+\.md$/u;
const CHECKED_ITEM_PREFIX = '- [x]';
const OPEN_ITEM_PREFIX = '- [ ]';
const SUBAGENT_SECTION = 'Subagent Sequencing Ledger';
const COMMIT_SECTION = 'Commit And Push Ledger';
const INVALID_PROOF_PATTERN =
  /<[^>]+>|pending|current-session|parent\s+codex|manual|local|session/iu;

function normalizeText(value) {
  return String(value || EMPTY_TEXT).trim();
}

function statusFromFileName(filePath) {
  return path.basename(filePath).split('-')[NUM_ZERO] || EMPTY_TEXT;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readText(filePath) {
  return fs.readFile(filePath, ENCODING_UTF8);
}

async function listMarkdownFiles(directoryPath) {
  if (!(await fileExists(directoryPath))) {
    return [];
  }
  const entries = await fs.readdir(directoryPath, {withFileTypes: true});
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listMarkdownFiles(entryPath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(MARKDOWN_EXTENSION)) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

function parsePackageMetadata(content, filePath) {
  const openIndex = content.indexOf(PACKAGE_METADATA_OPEN);
  if (openIndex < NUM_ZERO) {
    return null;
  }
  const jsonStart = openIndex + PACKAGE_METADATA_OPEN.length;
  const closeIndex = content.indexOf(PACKAGE_METADATA_CLOSE, jsonStart);
  if (closeIndex < NUM_ZERO) {
    throw new Error(`${filePath}: work-package metadata closing marker is missing.`);
  }
  return JSON.parse(content.slice(jsonStart, closeIndex).trim());
}

function extractSection(content, title) {
  const pattern = new RegExp(`^##\\s+${title.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\s*$`, 'mu');
  const match = pattern.exec(content);
  if (!match) {
    return EMPTY_TEXT;
  }
  const start = match.index + match[NUM_ZERO].length;
  const rest = content.slice(start);
  const next = /^##\s+/mu.exec(rest);
  return (next ? rest.slice(NUM_ZERO, next.index) : rest).trim();
}

function checkedSectionLines(sectionText) {
  return sectionText
    .split(NEWLINE)
    .map((line) => line.trim())
    .filter((line) => line.startsWith(CHECKED_ITEM_PREFIX));
}

function openChecklistLines(content) {
  return content
    .split(NEWLINE)
    .map((line) => line.trim())
    .filter((line) => line.startsWith(OPEN_ITEM_PREFIX));
}

function validateSubagentSection(content, filePath, errors) {
  const section = extractSection(content, SUBAGENT_SECTION);
  if (section.length === NUM_ZERO) {
    return;
  }
  const checked = checkedSectionLines(section);
  for (const line of checked) {
    if (INVALID_PROOF_PATTERN.test(line)) {
      errors.push(`${filePath}: checked subagent ledger item contains invalid proof: ${line}`);
    }
  }
}

function validateCommitSection(content, filePath, errors) {
  const section = extractSection(content, COMMIT_SECTION);
  if (section.length === NUM_ZERO) {
    errors.push(`${filePath}: closed metadata-bearing package is missing Commit And Push Ledger.`);
    return;
  }
  if (INVALID_PROOF_PATTERN.test(section)) {
    errors.push(`${filePath}: Commit And Push Ledger contains placeholders or non-proof labels.`);
  }
  if (!/Pushed to:\s+\S+/u.test(section)) {
    errors.push(`${filePath}: Commit And Push Ledger is missing push target.`);
  }
  if (!/only package-owned files.*yes/iu.test(section)) {
    errors.push(`${filePath}: Commit And Push Ledger must affirm package-owned commit scope.`);
  }
}

async function validatePackageFile(filePath) {
  const errors = [];
  const content = await readText(filePath);
  const metadata = parsePackageMetadata(content, filePath);
  if (!metadata) {
    return errors;
  }
  const fileStatus = statusFromFileName(filePath);
  if (!PACKAGE_STATE_PATTERN.test(path.basename(filePath))) {
    errors.push(`${filePath}: filename must start with idea/todo/active/done/superseded and date.`);
  }
  if (metadata.status !== fileStatus) {
    errors.push(`${filePath}: metadata status ${metadata.status} does not match filename ${fileStatus}.`);
  }
  validateSubagentSection(content, filePath, errors);
  if ((fileStatus === 'done' || fileStatus === 'superseded') && openChecklistLines(content).length > NUM_ZERO) {
    errors.push(`${filePath}: closed package still contains open checklist items.`);
  }
  if (fileStatus === 'done' || fileStatus === 'superseded') {
    validateCommitSection(content, filePath, errors);
  }
  return errors;
}

async function validatePackages(paths) {
  const files = paths.length > NUM_ZERO ? paths : await listMarkdownFiles(WORK_PACKAGES_DIR);
  const nestedErrors = await Promise.all(files.map(validatePackageFile));
  return nestedErrors.flat();
}

async function loadMetadataPackage(filePath) {
  const content = await readText(filePath);
  const metadata = parsePackageMetadata(content, filePath);
  return metadata ? {filePath, content, metadata} : null;
}

async function findActivePackage() {
  const files = await listMarkdownFiles(WORK_PACKAGES_DIR);
  const activeFiles = files.filter((filePath) => {
    return path.basename(filePath).startsWith('active-');
  });
  if (activeFiles.length === NUM_ZERO) {
    return null;
  }
  const candidate = activeFiles[activeFiles.length - NUM_ONE];
  return loadMetadataPackage(candidate);
}

function renderCurrentBlockerMarkdown(packageInfo) {
  if (!packageInfo) {
    return '# Current Blocker\n\nNo active work package found.\n';
  }
  const metadata = packageInfo.metadata;
  return [
    '# Current Blocker',
    EMPTY_TEXT,
    `- Package: ${packageInfo.filePath}`,
    `- Owner: ${normalizeText(metadata.owner) || 'unknown'}`,
    `- Boundary: ${normalizeText(metadata.boundary) || 'unknown'}`,
    `- Dominant reason: ${normalizeText(metadata.dominantReason) || 'unknown'}`,
    `- Current state: ${normalizeText(metadata.currentState) || 'unknown'}`,
    `- Next action: ${normalizeText(metadata.nextAction) || 'unknown'}`,
  ].join(NEWLINE);
}

async function writeCurrentBlocker(packageInfo) {
  await fs.mkdir(path.dirname(CURRENT_BLOCKER_JSON), {recursive: true});
  const payload = packageInfo ? {
    package: packageInfo.filePath,
    ...packageInfo.metadata,
  } : {
    package: 'none',
    status: 'none',
  };
  await fs.writeFile(CURRENT_BLOCKER_JSON, `${JSON.stringify(payload, null, 2)}${NEWLINE}`);
  await fs.writeFile(CURRENT_BLOCKER_MARKDOWN, renderCurrentBlockerMarkdown(packageInfo));
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === COMMAND_VALIDATE) {
    const paths = args.filter((arg) => !arg.startsWith('--'));
    const errors = await validatePackages(paths);
    if (errors.length > NUM_ZERO) {
      console.error(errors.join(NEWLINE));
      process.exit(EXIT_FAILURE);
    }
    console.log(`Work tracker validation OK for ${paths.length || 'all'} package file(s).`);
    process.exit(EXIT_SUCCESS);
  }
  if (command === COMMAND_CURRENT_BLOCKER) {
    const packageInfo = await findActivePackage();
    if (args.includes(FLAG_WRITE)) {
      await writeCurrentBlocker(packageInfo);
    }
    console.log(renderCurrentBlockerMarkdown(packageInfo));
    process.exit(EXIT_SUCCESS);
  }
  console.error('Usage: node scripts/work-tracker.js <validate|current-blocker> [--write]');
  process.exit(EXIT_FAILURE);
}

function isDirectRun() {
  return path.resolve(process.argv[PROCESS_ARG_SCRIPT_INDEX] || EMPTY_TEXT) ===
    fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(EXIT_FAILURE);
  });
}

export {
  findActivePackage,
  parsePackageMetadata,
  renderCurrentBlockerMarkdown,
  validatePackages,
};
