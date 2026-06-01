#!/usr/bin/env node

import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {promisify} from 'node:util';
import {
  findActivePackage,
  parsePackageMetadata,
} from './work-tracker.js';

const execFileAsync = promisify(execFile);
const ENCODING_UTF8 = 'utf8';
const NEWLINE = '\n';
const EMPTY_TEXT = '';
const NUM_ZERO = 0;
const NUM_ONE = 1;
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const FLAG_DIRTY_SCOPE = '--dirty-scope';
const FLAG_PACKAGE = '--package';
const DEFAULT_UNKNOWN = 'unknown';
const GIT_COMMAND = 'git';
const GIT_STATUS_ARGS = Object.freeze(['status', '--short']);
const PACKAGE_METADATA_OPEN = '<!-- work-package';
const PACKAGE_METADATA_CLOSE = '-->';
const TRACKER_GENERATED_PATHS = Object.freeze([
  path.join('work', 'sprints', 'current-blocker.json'),
  path.join('work', 'sprints', 'current-blocker.md'),
]);

function normalizeText(value) {
  return String(value || EMPTY_TEXT).trim();
}

function asList(values) {
  return Array.isArray(values) ? values.map(normalizeText).filter(Boolean) : [];
}

async function readText(filePath) {
  return fs.readFile(filePath, ENCODING_UTF8);
}

async function loadPackage(filePath) {
  const content = await readText(filePath);
  const metadata = parsePackageMetadata(content, filePath);
  if (!metadata) {
    throw new Error(`${filePath}: missing work-package metadata.`);
  }
  return {filePath, content, metadata};
}

function parseArgs(args) {
  const options = {dirtyScope: false, packagePath: EMPTY_TEXT};
  for (let index = NUM_ZERO; index < args.length; index += NUM_ONE) {
    const value = args[index];
    if (value === FLAG_DIRTY_SCOPE) {
      options.dirtyScope = true;
      continue;
    }
    if (value === FLAG_PACKAGE) {
      options.packagePath = args[index + NUM_ONE] || EMPTY_TEXT;
      index += NUM_ONE;
    }
  }
  return options;
}

async function gitStatus() {
  try {
    const result = await execFileAsync(GIT_COMMAND, GIT_STATUS_ARGS);
    return result.stdout
      .split(NEWLINE)
      .map((line) => line.trimEnd())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function statusPath(statusLine) {
  return statusLine.slice(3).replace(/^"|"$/gu, EMPTY_TEXT);
}

function isTrackerGenerated(statusLine) {
  const filePath = statusPath(statusLine);
  return TRACKER_GENERATED_PATHS.includes(filePath);
}

function isPackageOwned(statusLine, packageInfo) {
  if (!packageInfo) {
    return false;
  }
  const filePath = statusPath(statusLine);
  if (filePath === packageInfo.filePath) {
    return true;
  }
  return asList(packageInfo.metadata.touchedFiles).some((touchedFile) => {
    return filePath === touchedFile || filePath.startsWith(`${touchedFile}/`);
  });
}

function groupDirtyStatus(statusLines, packageInfo) {
  const groups = {
    packageOwned: [],
    trackerGenerated: [],
    unrelated: [],
  };
  for (const line of statusLines) {
    if (isPackageOwned(line, packageInfo)) {
      groups.packageOwned.push(line);
      continue;
    }
    if (isTrackerGenerated(line)) {
      groups.trackerGenerated.push(line);
      continue;
    }
    groups.unrelated.push(line);
  }
  return groups;
}

function appendKey(lines, label, value) {
  lines.push(`- ${label}: ${normalizeText(value) || DEFAULT_UNKNOWN}`);
}

function appendList(lines, values, fallback) {
  const normalized = asList(values);
  if (normalized.length === NUM_ZERO) {
    lines.push(`- ${fallback}`);
    return;
  }
  for (const value of normalized) {
    lines.push(`- ${value}`);
  }
}

function firstFiles(packageInfo) {
  const files = [
    'AGENTS.md',
    'steering/llm/README.md',
    'steering/llm/core.md',
    'steering/llm/governance.md',
    'work/README.md',
  ];
  if (packageInfo) {
    files.push(packageInfo.filePath, ...asList(packageInfo.metadata.touchedFiles));
  }
  return [...new Set(files)];
}

function renderDirtyGroups(lines, groups) {
  lines.push('## Worktree Summary');
  lines.push(`- Dirty entries: ${groups.packageOwned.length + groups.trackerGenerated.length + groups.unrelated.length}`);
  lines.push(`- Package-owned dirty entries: ${groups.packageOwned.length}`);
  appendList(lines, groups.packageOwned.map((line) => `\`${line}\``), 'No package-owned dirty entries.');
  lines.push(`- Tracker-generated dirty entries: ${groups.trackerGenerated.length}`);
  appendList(lines, groups.trackerGenerated.map((line) => `\`${line}\``), 'No tracker-generated dirty entries.');
  lines.push(`- Unrelated dirty entries: ${groups.unrelated.length}`);
  appendList(lines, groups.unrelated.map((line) => `\`${line}\``), 'No unrelated dirty entries.');
}

function renderContext(packageInfo, statusLines, dirtyScopeOnly = false) {
  const groups = groupDirtyStatus(statusLines, packageInfo);
  const metadata = packageInfo ? packageInfo.metadata : {};
  const lines = [dirtyScopeOnly ? '# Worktree Package Scope' : '# Work Context', EMPTY_TEXT];
  lines.push('## Current Package');
  if (!packageInfo) {
    lines.push('- No active work package found.');
  } else {
    appendKey(lines, 'Package', packageInfo.filePath);
    appendKey(lines, 'Owner', metadata.owner);
    appendKey(lines, 'Boundary', metadata.boundary);
    appendKey(lines, 'Dominant reason', metadata.dominantReason);
    appendKey(lines, 'Current state', metadata.currentState);
    appendKey(lines, 'Next action', metadata.nextAction);
  }
  lines.push(EMPTY_TEXT);
  if (!dirtyScopeOnly) {
    lines.push('## First Files To Read');
    appendList(lines, firstFiles(packageInfo), 'No first files identified.');
    lines.push(EMPTY_TEXT);
    lines.push('## Proof Ladder');
    appendList(lines, metadata.proof, 'No proof ladder recorded.');
    lines.push(EMPTY_TEXT);
    lines.push('## Useful Commands');
    appendList(lines, [
      'npm run commands',
      'npm run work:validate',
      'npm run work:model-ledger -- summary',
      'npm run work:dirty-scope',
    ], 'No commands recorded.');
    lines.push(EMPTY_TEXT);
  }
  renderDirtyGroups(lines, groups);
  return lines.join(NEWLINE);
}

async function resolvePackage(packagePath) {
  if (packagePath) {
    return loadPackage(packagePath);
  }
  return findActivePackage();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const packageInfo = await resolvePackage(options.packagePath);
  const statusLines = await gitStatus();
  console.log(renderContext(packageInfo, statusLines, options.dirtyScope));
  process.exit(EXIT_SUCCESS);
}

if (process.argv[1] && process.argv[1].endsWith('work-context.js')) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(EXIT_FAILURE);
  });
}

export {
  groupDirtyStatus,
  renderContext,
};
