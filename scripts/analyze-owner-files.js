#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const ENCODING_UTF8 = 'utf8';
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const NUM_ZERO = 0;
const NUM_ONE = 1;
const NUM_TWO = 2;
const DEFAULT_ROOT = '.';
const DEFAULT_TOP = 40;
const MAX_MATCHES_PER_FILE = 5;
const FLAG_ROOT = '--root';
const FLAG_TOP = '--top';
const FLAG_MARKDOWN = '--markdown';
const FLAG_HELP = '--help';
const EMPTY_TEXT = '';
const NEWLINE = '\n';
const JSON_INDENT_SPACES = 2;
const SCHEMA_VERSION = 'owner-file-index-v1';
const SEARCH_DIRECTORIES = Object.freeze([
  'src',
  'test',
  'scripts',
  'architecture',
  'work/packages',
  'work/sprints',
]);
const SEARCH_EXTENSIONS = Object.freeze([
  '.js',
  '.mjs',
  '.cjs',
  '.md',
  '.json',
]);
const SKIP_DIRECTORIES = Object.freeze([
  '.git',
  'node_modules',
  'dist',
  'data',
  'data2',
  'data3',
  'test-output',
  '.tmp',
  '.tap',
]);
const HELP_TEXT = [
  'Usage:',
  '  node scripts/analyze-owner-files.js <owner> [boundary] [--markdown]',
  '',
  'Options:',
  '  --root <path>  Search root for tests or alternate worktrees.',
  '  --top <count>  Maximum files to return. Defaults to 40.',
].join(NEWLINE);

function normalizeText(value) {
  return String(value || EMPTY_TEXT).trim();
}

function parseOptionValue(args, optionName) {
  const optionIndex = args.indexOf(optionName);
  if (optionIndex < NUM_ZERO) {
    return EMPTY_TEXT;
  }
  return normalizeText(args[optionIndex + NUM_ONE]);
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(normalizeText(value), 10);
  return Number.isInteger(parsed) && parsed > NUM_ZERO ? parsed : fallback;
}

function parseCliArgs(args = []) {
  if (args.includes(FLAG_HELP)) {
    return {help: true};
  }
  const positional = [];
  for (let index = NUM_ZERO; index < args.length; index += NUM_ONE) {
    const arg = args[index];
    if (arg === FLAG_ROOT || arg === FLAG_TOP) {
      index += NUM_ONE;
      continue;
    }
    if (arg === FLAG_MARKDOWN) {
      continue;
    }
    positional.push(arg);
  }
  return {
    help: false,
    owner: normalizeText(positional[NUM_ZERO]),
    boundary: normalizeText(positional[NUM_ONE]),
    root: parseOptionValue(args, FLAG_ROOT) || DEFAULT_ROOT,
    top: parsePositiveInteger(parseOptionValue(args, FLAG_TOP), DEFAULT_TOP),
    markdown: args.includes(FLAG_MARKDOWN),
  };
}

function shouldSkipDirectory(name) {
  return SKIP_DIRECTORIES.includes(name);
}

async function listSearchFiles(rootPath) {
  const files = [];
  for (const directory of SEARCH_DIRECTORIES) {
    const directoryPath = path.join(rootPath, directory);
    try {
      files.push(...(await listFilesRecursive(directoryPath)));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
  return [...new Set(files)].sort();
}

async function listFilesRecursive(directoryPath) {
  const entries = await fs.readdir(directoryPath, {withFileTypes: true});
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!shouldSkipDirectory(entry.name)) {
        files.push(...(await listFilesRecursive(path.join(directoryPath, entry.name))));
      }
      continue;
    }
    if (
      entry.isFile() &&
      SEARCH_EXTENSIONS.includes(path.extname(entry.name))
    ) {
      files.push(path.join(directoryPath, entry.name));
    }
  }
  return files;
}

function countOccurrences(content, token) {
  if (!token) {
    return NUM_ZERO;
  }
  return content.split(token).length - NUM_ONE;
}

function collectLineMatches(content, tokens) {
  const matches = [];
  const lines = content.split(/\r?\n/u);
  for (let index = NUM_ZERO; index < lines.length; index += NUM_ONE) {
    const line = lines[index];
    if (tokens.some((token) => token && line.includes(token))) {
      matches.push({
        line: index + NUM_ONE,
        text: line.trim().slice(NUM_ZERO, 180),
      });
    }
    if (matches.length >= MAX_MATCHES_PER_FILE) {
      break;
    }
  }
  return matches;
}

function scoreMatch(content, owner, boundary) {
  const ownerCount = countOccurrences(content, owner);
  const boundaryCount = countOccurrences(content, boundary);
  const bonus = ownerCount > NUM_ZERO && (!boundary || boundaryCount > NUM_ZERO) ?
    NUM_TWO :
    NUM_ZERO;
  return ownerCount + boundaryCount + bonus;
}

async function buildOwnerFileIndex(options = {}) {
  const rootPath = path.resolve(options.root || DEFAULT_ROOT);
  const owner = normalizeText(options.owner);
  const boundary = normalizeText(options.boundary);
  if (!owner) {
    throw new Error('Owner is required.');
  }
  const files = await listSearchFiles(rootPath);
  const matches = [];
  for (const filePath of files) {
    const content = await fs.readFile(filePath, ENCODING_UTF8);
    const score = scoreMatch(content, owner, boundary);
    if (score === NUM_ZERO) {
      continue;
    }
    matches.push({
      path: path.relative(rootPath, filePath),
      score,
      ownerMatches: countOccurrences(content, owner),
      boundaryMatches: countOccurrences(content, boundary),
      lineMatches: collectLineMatches(content, [owner, boundary]),
    });
  }
  matches.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.path.localeCompare(right.path);
  });
  return {
    schemaVersion: SCHEMA_VERSION,
    owner,
    boundary: boundary || null,
    root: path.relative(process.cwd(), rootPath) || '.',
    matchCount: matches.length,
    files: matches.slice(NUM_ZERO, options.top || DEFAULT_TOP),
  };
}

function renderMarkdown(index) {
  const lines = [
    '# Owner File Index',
    EMPTY_TEXT,
    `- Owner: \`${index.owner}\``,
    `- Boundary: \`${index.boundary || 'none'}\``,
    `- Matches: \`${index.matchCount}\``,
    EMPTY_TEXT,
    '## Files',
    EMPTY_TEXT,
  ];
  if (index.files.length === NUM_ZERO) {
    lines.push('- No matches found.');
    return lines.join(NEWLINE);
  }
  for (const file of index.files) {
    lines.push(
      `- \`${file.path}\` score=${file.score} owner=${file.ownerMatches} ` +
      `boundary=${file.boundaryMatches}`,
    );
  }
  return lines.join(NEWLINE);
}

async function runCli(args = process.argv.slice(NUM_TWO)) {
  const options = parseCliArgs(args);
  if (options.help) {
    return `${HELP_TEXT}${NEWLINE}`;
  }
  const index = await buildOwnerFileIndex(options);
  return options.markdown ?
    `${renderMarkdown(index)}${NEWLINE}` :
    `${JSON.stringify(index, null, JSON_INDENT_SPACES)}${NEWLINE}`;
}

function isDirectRun() {
  return process.argv[NUM_ONE] === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  runCli()
    .then((output) => {
      process.stdout.write(output);
      process.exitCode = EXIT_SUCCESS;
    })
    .catch((error) => {
      process.stderr.write(`${error.message}${NEWLINE}`);
      process.exitCode = EXIT_FAILURE;
    });
}

export {
  buildOwnerFileIndex,
  parseCliArgs,
  renderMarkdown,
  runCli,
};
