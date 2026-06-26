#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const NUM_ONE = 1;
const NUM_TWO = 2;
const NO_INDEX = -1;
const MAX_DOMAIN_FILE_LINES = 500;
const NEWLINE = '\n';
const EMPTY_TEXT = '';
const ROOT_ARCHITECTURE_PATH = 'architecture.md';
const ARCHITECTURE_INDEX_PATH = 'architecture/INDEX.md';
const DOMAIN_MARKER_START = '<!-- architecture-domain-files:start -->';
const DOMAIN_MARKER_END = '<!-- architecture-domain-files:end -->';
const MARKDOWN_LINK_PATTERN = /\[[^\]]+\]\(([^)]+)\)/gu;
const DOMAIN_ROW_PATTERN = /^- \[([^\]]+)\]\(([^)]+)\) - (.+)$/u;
const LOCAL_POINTER_FILES = Object.freeze([
  ROOT_ARCHITECTURE_PATH,
  'architecture/README.md',
  'docs/steering/architecture.md',
  'docs/steering/llm/README.md',
  'AGENTS.md',
]);
const LINK_CHECK_FILES = Object.freeze([
  ROOT_ARCHITECTURE_PATH,
  ARCHITECTURE_INDEX_PATH,
  'architecture/README.md',
  'docs/steering/architecture.md',
  'docs/steering/llm/README.md',
  'docs/steering/roadmap.md',
  'AGENTS.md',
]);
const LOCAL_ARCHITECTURE_INDEX_TEXT = 'architecture/INDEX.md';
const FILE_URL_PREFIX = 'file:';
const HTTP_URL_PREFIX = 'http:';
const HTTPS_URL_PREFIX = 'https:';
const MAILTO_URL_PREFIX = 'mailto:';
const HASH_PREFIX = '#';
const MARKDOWN_EXTENSION = '.md';

function readText(rootDir, relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function lineCount(text) {
  return text.split(/\r?\n/u).length - (text.endsWith(NEWLINE) ? NUM_ONE : 0);
}

function extractDomainRows(indexContent) {
  const startIndex = indexContent.indexOf(DOMAIN_MARKER_START);
  const endIndex = indexContent.indexOf(DOMAIN_MARKER_END);
  if (startIndex === NO_INDEX || endIndex === NO_INDEX || endIndex <= startIndex) {
    return {
      rows: [],
      errors: [`${ARCHITECTURE_INDEX_PATH}: missing architecture domain marker block`],
    };
  }

  const domainBlock = indexContent
    .slice(startIndex + DOMAIN_MARKER_START.length, endIndex)
    .trim();
  const errors = [];
  const rows = [];

  for (const line of domainBlock.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed === EMPTY_TEXT) {
      continue;
    }
    const match = DOMAIN_ROW_PATTERN.exec(trimmed);
    if (match === null) {
      errors.push(`${ARCHITECTURE_INDEX_PATH}: malformed domain row: ${trimmed}`);
      continue;
    }
    rows.push({
      title: match[NUM_ONE],
      href: match[NUM_TWO],
      description: match[3],
    });
  }

  return {rows, errors};
}

function stripFragment(href) {
  const hashIndex = href.indexOf(HASH_PREFIX);
  return hashIndex === NO_INDEX ? href : href.slice(0, hashIndex);
}

function isExternalHref(href) {
  return href.startsWith(FILE_URL_PREFIX) ||
    href.startsWith(HTTP_URL_PREFIX) ||
    href.startsWith(HTTPS_URL_PREFIX) ||
    href.startsWith(MAILTO_URL_PREFIX) ||
    href.startsWith(HASH_PREFIX);
}

function resolveLocalHref(sourceFile, href) {
  const withoutFragment = stripFragment(href);
  if (withoutFragment === EMPTY_TEXT || isExternalHref(href)) {
    return EMPTY_TEXT;
  }
  const decodedHref = decodeURIComponent(withoutFragment);
  return path.normalize(path.join(path.dirname(sourceFile), decodedHref));
}

function validateMarkdownLinks(rootDir, sourceFile) {
  const content = readText(rootDir, sourceFile);
  const errors = [];
  for (const match of content.matchAll(MARKDOWN_LINK_PATTERN)) {
    const href = match[NUM_ONE];
    const targetPath = resolveLocalHref(sourceFile, href);
    if (targetPath === EMPTY_TEXT) {
      continue;
    }
    const absoluteTarget = path.join(rootDir, targetPath);
    if (!fs.existsSync(absoluteTarget)) {
      errors.push(`${sourceFile}: broken local link ${href}`);
    }
  }
  return errors;
}

function validateArchitectureSlices(rootDir = process.cwd()) {
  const errors = [];
  const indexContent = readText(rootDir, ARCHITECTURE_INDEX_PATH);
  const {rows, errors: domainErrors} = extractDomainRows(indexContent);
  errors.push(...domainErrors);

  if (rows.length === 0) {
    errors.push(`${ARCHITECTURE_INDEX_PATH}: no domain files listed`);
  }

  for (const row of rows) {
    if (!row.href.endsWith(MARKDOWN_EXTENSION)) {
      errors.push(`${ARCHITECTURE_INDEX_PATH}: domain row is not markdown: ${row.href}`);
      continue;
    }
    if (row.description.trim() === EMPTY_TEXT) {
      errors.push(`${ARCHITECTURE_INDEX_PATH}: domain row lacks one-line description: ${row.href}`);
    }
    const domainPath = path.normalize(path.join('architecture', row.href));
    const absoluteDomainPath = path.join(rootDir, domainPath);
    if (!fs.existsSync(absoluteDomainPath)) {
      errors.push(`${ARCHITECTURE_INDEX_PATH}: listed domain file missing: ${row.href}`);
      continue;
    }
    const domainLines = lineCount(readText(rootDir, domainPath));
    if (domainLines > MAX_DOMAIN_FILE_LINES) {
      errors.push(`${domainPath}: ${domainLines} lines exceeds ${MAX_DOMAIN_FILE_LINES}`);
    }
  }

  for (const pointerFile of LOCAL_POINTER_FILES) {
    const content = readText(rootDir, pointerFile);
    if (!content.includes(LOCAL_ARCHITECTURE_INDEX_TEXT)) {
      errors.push(`${pointerFile}: missing ${LOCAL_ARCHITECTURE_INDEX_TEXT} pointer`);
    }
  }

  for (const sourceFile of LINK_CHECK_FILES) {
    errors.push(...validateMarkdownLinks(rootDir, sourceFile));
  }

  return {ok: errors.length === 0, errors, rows};
}

function isDirectRun() {
  return process.argv[NUM_ONE] === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  const result = validateArchitectureSlices();
  if (result.ok) {
    process.stdout.write(
      `Architecture slice check passed: ${result.rows.length} domain files under ${MAX_DOMAIN_FILE_LINES} lines.${NEWLINE}`,
    );
    process.exitCode = EXIT_SUCCESS;
  } else {
    process.stderr.write(result.errors.join(NEWLINE) + NEWLINE);
    process.exitCode = EXIT_FAILURE;
  }
}

export {
  ARCHITECTURE_INDEX_PATH,
  MAX_DOMAIN_FILE_LINES,
  extractDomainRows,
  lineCount,
  validateArchitectureSlices,
};
