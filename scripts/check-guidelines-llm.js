#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {pathToFileURL} from 'node:url';
import {
  ENV_FILE,
  EXIT_CODE,
  GUIDELINE_LLM_DEFAULT,
  GUIDELINE_LLM_ENV_KEY,
  GUIDELINE_LLM_HEADER,
  GUIDELINE_LLM_MESSAGE,
  GUIDELINE_LLM_PATH,
  GUIDELINE_LLM_PROMPT,
  GUIDELINE_LLM_REQUEST,
  GUIDELINE_LLM_SKIP_PATH_PART,
  GUIDELINE_POSITION,
  SCRIPT_TEXT,
} from './guideline-check-constants.js';

const WORKSPACE_ROOT = process.cwd();
const GUIDELINES_PATH = path.join(
  WORKSPACE_ROOT,
  '.kiro',
  'steering',
  GUIDELINE_LLM_PATH.GUIDELINES_FILE,
);

let DEFAULT_MODEL;
let BASE_URL;
let API_KEY;
let REQUEST_TIMEOUT_MS;
let MAX_FILE_CHARS;
let REQUEST_CONCURRENCY;
const AbortController = globalThis.AbortController;
const FULL_CONTENT_PREFIXES = GUIDELINE_LLM_PATH.FULL_CONTENT_PREFIXES;
const CACHE_FILE_PATH = path.join(
  WORKSPACE_ROOT,
  GUIDELINE_LLM_PATH.CACHE_FILE,
);

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const separatorIndex = trimmed.indexOf('=');
  if (separatorIndex <= 0) {
    return null;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  if (!key) {
    return null;
  }

  let value = trimmed.slice(separatorIndex + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith('\'') && value.endsWith('\''))
  ) {
    value = value.slice(1, -1);
  }

  return {key, value};
}

async function loadEnvFile(fileName) {
  const filePath = path.join(WORKSPACE_ROOT, fileName);
  let fileContent;
  try {
    fileContent = await fs.readFile(filePath, SCRIPT_TEXT.ENCODING_UTF8);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  const lines = fileContent.split(/\r?\n/u);
  for (const line of lines) {
    const parsed = parseEnvLine(line);
    if (!parsed) {
      continue;
    }

    if (typeof process.env[parsed.key] === 'undefined') {
      process.env[parsed.key] = parsed.value;
    }
  }
}

async function initializeConfig() {
  await loadEnvFile(ENV_FILE.DEFAULT);
  await loadEnvFile(ENV_FILE.LOCAL);

  DEFAULT_MODEL = process.env[GUIDELINE_LLM_ENV_KEY.MODEL] ||
    GUIDELINE_LLM_DEFAULT.MODEL;
  BASE_URL = (process.env[GUIDELINE_LLM_ENV_KEY.BASE_URL] ||
    GUIDELINE_LLM_DEFAULT.BASE_URL).replace(/\/$/, '');
  API_KEY = process.env[GUIDELINE_LLM_ENV_KEY.API_KEY] ||
    process.env[GUIDELINE_LLM_ENV_KEY.OPENAI_API_KEY];
  REQUEST_TIMEOUT_MS = Number(
    process.env[GUIDELINE_LLM_ENV_KEY.TIMEOUT_MS] ||
    GUIDELINE_LLM_DEFAULT.TIMEOUT_MS,
  );
  MAX_FILE_CHARS = Number(
    process.env[GUIDELINE_LLM_ENV_KEY.MAX_FILE_CHARS] ||
    GUIDELINE_LLM_DEFAULT.MAX_FILE_CHARS,
  );
  REQUEST_CONCURRENCY = Number(
    process.env[GUIDELINE_LLM_ENV_KEY.CONCURRENCY] ||
    GUIDELINE_LLM_DEFAULT.CONCURRENCY,
  );
}

const IGNORED_PATH_PARTS = new Set(GUIDELINE_LLM_SKIP_PATH_PART);
const IGNORED_RELATIVE_PREFIXES = [
  GUIDELINE_LLM_PATH.ARCHIVED_SPECS_PREFIX,
  ...GUIDELINE_LLM_PATH.SELF_TOOLING_PREFIXES,
];

function printUsage() {
  console.error(GUIDELINE_LLM_MESSAGE.USAGE);
}

function formatGuidelineLocation(relativePath, line = GUIDELINE_POSITION.DEFAULT_LINE,
  column = GUIDELINE_POSITION.DEFAULT_COLUMN) {
  return `${relativePath}:${line}:${column}`;
}

function isProbablyBinary(content) {
  for (let index = 0; index < content.length; index++) {
    if (content.charCodeAt(index) === 0) {
      return true;
    }
  }
  return false;
}

function normalizePath(filePath) {
  const absolutePath = path.isAbsolute(filePath) ? filePath :
    path.resolve(WORKSPACE_ROOT, filePath);
  return path.normalize(absolutePath);
}

function shouldSkipPath(absolutePath) {
  const relativePath = path.relative(WORKSPACE_ROOT, absolutePath);
  if (relativePath.startsWith('..')) {
    return true;
  }

  const normalizedRelativePath = path.normalize(relativePath);
  if (IGNORED_RELATIVE_PREFIXES.some((prefix) =>
    normalizedRelativePath.startsWith(prefix)
  )) {
    return true;
  }

  const pathParts = normalizedRelativePath.split(path.sep);
  return pathParts.some((part) => IGNORED_PATH_PARTS.has(part));
}

function extractJsonObject(rawText) {
  if (!rawText) {
    return null;
  }

  const trimmed = rawText.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const fencedMatch = trimmed.match(GUIDELINE_LLM_PROMPT.JSON_FENCE_PATTERN);
  if (fencedMatch && fencedMatch[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return null;
}

async function readGuidelines() {
  return fs.readFile(GUIDELINES_PATH, SCRIPT_TEXT.ENCODING_UTF8);
}

function hashText(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

async function readCacheFile() {
  try {
    const raw = await fs.readFile(CACHE_FILE_PATH, SCRIPT_TEXT.ENCODING_UTF8);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {entries: {}};
    }
    const entries = parsed.entries && typeof parsed.entries === 'object' ?
      parsed.entries :
      {};
    return {entries};
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {entries: {}};
    }
    return {entries: {}};
  }
}

async function writeCacheFile(cache) {
  const directory = path.dirname(CACHE_FILE_PATH);
  await fs.mkdir(directory, {recursive: true});
  await fs.writeFile(
    CACHE_FILE_PATH,
    JSON.stringify(cache, null, 2) + SCRIPT_TEXT.NEWLINE,
    SCRIPT_TEXT.ENCODING_UTF8,
  );
}

function buildCacheKey(relativePath, fileContent, guidelines) {
  return [
    `v${GUIDELINE_LLM_DEFAULT.CACHE_SCHEMA_VERSION}`,
    DEFAULT_MODEL,
    hashText(guidelines),
    relativePath,
    hashText(fileContent),
  ].join(':');
}

async function readFileSafe(absolutePath) {
  const content = await fs.readFile(absolutePath, SCRIPT_TEXT.ENCODING_UTF8);
  if (isProbablyBinary(content)) {
    return null;
  }
  return content;
}

function buildPrompt(relativePath, fileContent, guidelines) {
  const normalizedRelativePath = path.normalize(relativePath);
  const shouldPreserveFullContent = FULL_CONTENT_PREFIXES.some((prefix) =>
    normalizedRelativePath.startsWith(prefix),
  );
  const truncatedContent = !shouldPreserveFullContent &&
    fileContent.length > MAX_FILE_CHARS ?
    `${fileContent.slice(0, MAX_FILE_CHARS)}\n\n${GUIDELINE_LLM_PROMPT.TRUNCATED_MARKER}` :
    fileContent;
  const fileClassification = buildFileClassification(normalizedRelativePath);

  return [
    GUIDELINE_LLM_PROMPT.INTRO,
    GUIDELINE_LLM_PROMPT.NO_SPECULATION,
    GUIDELINE_LLM_PROMPT.CONSTANT_OWNER_HINT,
    GUIDELINE_LLM_PROMPT.FILE_LOCAL_CONSTANT_HINT,
    GUIDELINE_LLM_PROMPT.FILE_LOCAL_ENUM_HINT,
    GUIDELINE_LLM_PROMPT.TEST_CONSTANT_OWNER_HINT,
    GUIDELINE_LLM_PROMPT.TEST_LITERAL_HINT,
    GUIDELINE_LLM_PROMPT.NO_DUPLICATE_INFERENCE,
    GUIDELINE_LLM_PROMPT.NO_STRUCTURAL_OVERREACH,
    GUIDELINE_LLM_PROMPT.NO_LANGUAGE_PRIMITIVES,
    GUIDELINE_LLM_PROMPT.NO_COMMENT_LITERALS,
    GUIDELINE_LLM_PROMPT.NO_EPHEMERAL_STATE_FLAG,
    GUIDELINE_LLM_PROMPT.NO_TRUNCATION_FLAG,
    GUIDELINE_LLM_PROMPT.JSON_SHAPE,
    GUIDELINE_LLM_PROMPT.JSON_SCHEMA,
    GUIDELINE_LLM_PROMPT.NO_VIOLATION_SCHEMA,
    GUIDELINE_LLM_PROMPT.HIGH_CONFIDENCE_ONLY,
    '',
    `${GUIDELINE_LLM_PROMPT.FILE_LABEL} ${relativePath}`,
    `${GUIDELINE_LLM_PROMPT.FILE_CLASSIFICATION_LABEL} ${fileClassification}`,
    '',
    GUIDELINE_LLM_PROMPT.SYSTEM_GUIDELINES_LABEL,
    guidelines,
    '',
    GUIDELINE_LLM_PROMPT.FILE_CONTENT_LABEL,
    truncatedContent,
  ].join('\n');
}

function buildFileClassification(normalizedRelativePath) {
  const basename = path.basename(normalizedRelativePath);
  if (
    normalizedRelativePath.startsWith(path.join('src', 'constants') + path.sep) ||
    basename.includes('constants') ||
    basename.includes('catalog') ||
    basename.includes('registry') ||
    basename.includes('affinity') ||
    basename.includes('artifact')
  ) {
    return 'canonical constants-owner module';
  }

  if (normalizedRelativePath.startsWith('test' + path.sep)) {
    return basename.includes('constants') ?
      'test-local constants-owner module' :
      'test file';
  }

  if (basename.startsWith('check-guidelines-')) {
    return 'guideline checker implementation';
  }

  return 'regular source file';
}

function isSpeculativeText(text) {
  const normalizedText = String(text || '').toLowerCase();
  return (
    normalizedText.includes('likely') ||
    normalizedText.includes('potential') ||
    normalizedText.includes('appear to be') ||
    normalizedText.includes('appears to be') ||
    normalizedText.includes('seems') ||
    normalizedText.includes('typically') ||
    normalizedText.includes('not clearly') ||
    normalizedText.includes('from this file alone') ||
    normalizedText.includes('if this is') ||
    normalizedText.includes('if a') ||
    normalizedText.includes('if an') ||
    normalizedText.includes('if the codebase') ||
    normalizedText.includes('search the codebase') ||
    normalizedText.includes('verify this module') ||
    normalizedText.includes('possible duplication risk')
  );
}

function buildFalsePositiveContext(violation) {
  const title = String(violation.title || '').toLowerCase();
  const description = String(violation.description || '').toLowerCase();
  const suggestedFix = String(violation.suggestedFix || '').toLowerCase();
  return {
    title,
    description,
    suggestedFix,
    combined: `${title} ${description} ${suggestedFix}`,
  };
}

function matchesFalsePositiveRuleGroup(context, rules) {
  return rules.some((rule) => rule(context));
}

const LANGUAGE_AND_SYNTAX_FALSE_POSITIVE_RULES = [
  ({combined}) => combined.includes('date.now()') || combined.includes('date.now'),
  ({combined}) => combined.includes('raw boolean') ||
    combined.includes('magic boolean'),
  ({combined}) => combined.includes('infinity') &&
    (combined.includes('magic') || combined.includes('literal')),
  ({combined}) => combined.includes('in a comment') ||
    combined.includes('in comments') ||
    combined.includes('comment hard-codes') ||
    combined.includes('comment to denote'),
  ({combined}) => combined.includes('parseint') && combined.includes('radix'),
  ({combined}) => combined.includes('template string') &&
    combined.includes('still a string literal'),
  ({combined}) => combined.includes('null') &&
    combined.includes('default') &&
    (combined.includes('magic') || combined.includes('literal')),
  ({combined}) => combined.includes('jsdoc') &&
    (combined.includes('type annotation') ||
      combined.includes('type comment')),
  ({combined}) => combined.includes('regex') &&
    combined.includes('literal') &&
    (combined.includes('file-local') || combined.includes('inline')),
  ({combined}) => combined.includes('string(') &&
    combined.includes('conversion') &&
    combined.includes('magic'),
  ({combined}) => combined.includes('threshold') &&
    combined.includes('multiplier') &&
    combined.includes('comment'),
  ({combined}) => combined.includes(':memory:') ||
    combined.includes('in-memory path'),
  ({combined}) => combined.includes('sql') &&
    (combined.includes('query string') ||
      combined.includes('query definition') ||
      combined.includes('string literal')) &&
    combined.includes('file'),
  ({combined}) => combined.includes('log level') &&
    combined.includes('raw string'),
  ({combined}) => combined.includes('default') &&
    combined.includes('retrycount') &&
    combined.includes('0'),
  ({combined}) => combined.includes('default') &&
    combined.includes('port') &&
    (combined.includes('file-local') || combined.includes('constant')),
  ({combined}) => combined.includes('comment') &&
    combined.includes('states') &&
    combined.includes('constant'),
  ({combined}) => combined.includes('+= 1') ||
    (combined.includes('increment') &&
      combined.includes('1') &&
      combined.includes('magic')),
  ({combined}) => combined.includes('arithmetic') &&
    combined.includes('increment') &&
    combined.includes('literal'),
  ({combined}) => combined.includes('empty') &&
    combined.includes('string') &&
    (combined.includes('fallback') || combined.includes('default')),
  ({combined}) => combined.includes('console') &&
    (combined.includes('warn') || combined.includes('error')) &&
    combined.includes('magic string'),
  ({combined}) => combined.includes('console.warn') &&
    combined.includes('literal'),
  ({combined}) => combined.includes('[0]') ||
    (combined.includes('index') &&
      combined.includes('0') &&
      combined.includes('first')),
  ({combined}) => combined.includes('error') &&
    combined.includes('metadata') &&
    combined.includes('category') &&
    combined.includes('raw string'),
  ({combined}) => combined.includes('category') &&
    (combined.includes('magic string') ||
      combined.includes('raw string')) &&
    (combined.includes('error') || combined.includes('budget')),
  ({combined}) => combined.includes('numeric literal') &&
    combined.includes('0') &&
    (combined.includes('index') ||
      combined.includes('first') ||
      combined.includes('select')),
  ({combined}) => combined.includes('regex') &&
    (combined.includes('magic') || combined.includes('literal')) &&
    !combined.includes('duplicat'),
  ({combined}) => combined.includes('length') &&
    combined.includes('0') &&
    (combined.includes('non-empty') ||
      combined.includes('nonempty') ||
      combined.includes('empty string') ||
      combined.includes('threshold')),
  ({combined}) => combined.includes('error message') &&
    (combined.includes('template') || combined.includes('format')) &&
    (combined.includes('magic string') ||
      combined.includes('string literal')),
  ({combined}) => combined.includes('message') &&
    combined.includes('fragment') &&
    combined.includes('string literal'),
  ({combined}) => (combined.includes('missing') ||
      combined.includes('mismatch') ||
      combined.includes('expected')) &&
    combined.includes('error') &&
    combined.includes('string literal') &&
    combined.includes('format'),
  ({combined}) => combined.includes('sql') &&
    combined.includes('table name') &&
    (combined.includes('literal') ||
      combined.includes('embed') ||
      combined.includes('direct')),
  ({combined}) => combined.includes('event name') &&
    (combined.includes('magic string') ||
      combined.includes('raw literal') ||
      combined.includes('string literal')) &&
    !combined.includes('duplicat'),
  ({combined}) => combined.includes('set to') &&
    combined.includes('literal') &&
    (combined.includes('file-local') ||
      combined.includes('regular source file')) &&
    !combined.includes('duplicat'),
  ({combined}) => combined.includes('jsdoc') ||
    (combined.includes('@param') && combined.includes('{string}')),
  ({combined}) => combined.includes('type') &&
    combined.includes('annotation') &&
    (combined.includes('jsdoc') ||
      combined.includes('documentation') ||
      combined.includes('@param') ||
      combined.includes('@return')),
  ({combined}) => combined.includes('try/catch') &&
    (combined.includes('rethrown') ||
      combined.includes('rethrow') ||
      combined.includes('re-thrown')),
  ({combined}) => combined.includes('catch') &&
    combined.includes('even though') &&
    (combined.includes('rethrown') ||
      combined.includes('rethrow')),
  ({combined}) => combined.includes('{}') &&
    (combined.includes('magic') ||
      combined.includes('literal') ||
      combined.includes('fallback')),
  ({combined}) => combined.includes('json.stringify') &&
    (combined.includes('magic') ||
      combined.includes('literal') ||
      combined.includes('inline')),
  ({combined}) => combined.includes('object') &&
    (combined.includes('key') || combined.includes('property')) &&
    (combined.includes('raw string') ||
      combined.includes('magic string') ||
      combined.includes('string literal')) &&
    !combined.includes('duplicat'),
  ({combined}) => (combined.includes('payload') ||
      combined.includes('snapshot') ||
      combined.includes('tracehook')) &&
    combined.includes('string') &&
    (combined.includes('key') || combined.includes('literal')),
  ({combined}) => combined.includes('template') &&
    (combined.includes('concatenat') ||
      combined.includes('construct') ||
      combined.includes('build')) &&
    (combined.includes('constant') || combined.includes('prefix')),
  ({combined}) => combined.includes('key') &&
    (combined.includes('construction') ||
      combined.includes('separator') ||
      combined.includes('format')) &&
    (combined.includes('magic') || combined.includes('literal')),
];

const OWNER_AND_CONSTANT_FALSE_POSITIVE_RULES = [
  ({combined}) => combined.includes('in-memory map') &&
    (combined.includes('transaction') ||
      combined.includes('request-scoped') ||
      combined.includes('session')),
  ({combined}) => combined.includes('exported') &&
    combined.includes('registry') &&
    combined.includes('raw string'),
  ({combined}) => combined.includes('initlogger') &&
    (combined.includes('fallback') || combined.includes('console')),
  ({combined}) => combined.includes('logger') &&
    combined.includes('fallback') &&
    combined.includes('console'),
  ({combined}) => combined.includes('exported') &&
    combined.includes('map') &&
    combined.includes('embeds raw string'),
  ({title, combined}) => title.includes('unused') &&
    (combined.includes('file-local constant') ||
      combined.includes('unused import')),
  ({combined}) => combined.includes('exported') &&
    combined.includes('constants') &&
    combined.includes('embed'),
  ({combined}) => combined.includes('file-local constant') &&
    (combined.includes('raw string') ||
      combined.includes('without clear local-only') ||
      combined.includes('without justification')),
  ({combined}) => combined.includes('ownership label') &&
    combined.includes('file-local'),
  ({combined}) => combined.includes('file defines') &&
    (combined.includes('raw string literal') ||
      combined.includes('raw numeric literal') ||
      combined.includes('raw string constant') ||
      combined.includes('raw number')),
  ({combined}) => combined.includes('defines') &&
    combined.includes('raw') &&
    combined.includes('literal') &&
    !combined.includes('exported'),
  ({title, combined}) => title.includes('magic') &&
    (combined.includes('file-local constant') ||
      combined.includes('file defines') ||
      combined.includes('module-level constant')),
  ({title, combined}) => title.includes('magic number') &&
    (combined.includes('delay') ||
      combined.includes('interval') ||
      combined.includes('timeout') ||
      combined.includes('retry')),
  ({combined}) => combined.includes('registry') &&
    combined.includes('map') &&
    (combined.includes('cache') || combined.includes('topology')),
  ({combined}) => combined.includes('export') &&
    combined.includes('literal') &&
    (combined.includes('regular source file') ||
      combined.includes('shared vocabulary')),
  ({combined}) => combined.includes('export') &&
    (combined.includes('enum') ||
      combined.includes('set') ||
      combined.includes('field') ||
      combined.includes('error_msg')) &&
    (combined.includes('only used internally') ||
      combined.includes('file-local') ||
      combined.includes('cross-file api')),
  ({combined}) => combined.includes('export') &&
    (combined.includes('set') || combined.includes('constant')) &&
    combined.includes('regular source file') &&
    !combined.includes('duplicat'),
];

const TEST_INFRASTRUCTURE_FALSE_POSITIVE_RULES = [
  ({combined}) => combined.includes('systemtablecache') &&
    combined.includes('test'),
  ({combined}) => combined.includes('direct mutation') &&
    combined.includes('test'),
  ({combined}) => combined.includes('in-process') &&
    combined.includes('inject'),
  ({combined}) => combined.includes('overriding') &&
    combined.includes('method') &&
    combined.includes('parallel implementation'),
  ({combined}) => combined.includes('upsert') &&
    combined.includes('mock') &&
    combined.includes('test'),
  ({combined}) => combined.includes('test assert') &&
    combined.includes('insert or replace'),
  ({combined}) => combined.includes('test spy') ||
    combined.includes('test mock') ||
    combined.includes('spy logger'),
  ({combined}) => combined.includes('allowlist') &&
    combined.includes('duplicate') &&
    combined.includes('class'),
  ({combined}) => combined.includes('duplicate') &&
    combined.includes('helper') &&
    combined.includes('test'),
  ({combined}) => combined.includes('cleanup') &&
    (combined.includes('aftereach') ||
      combined.includes('after each')) &&
    combined.includes('log'),
  ({combined}) => combined.includes('shutdown') &&
    combined.includes('catch') &&
    combined.includes('test'),
  ({combined}) => combined.includes('configurationmanager') &&
    combined.includes('test') &&
    (combined.includes('initialization') ||
      combined.includes('module scope')),
  ({combined}) => combined.includes('cdc') &&
    combined.includes('subscription') &&
    combined.includes('test'),
  ({combined}) => combined.includes('cleanup') &&
    (combined.includes('rmsync') ||
      combined.includes('rmdir') ||
      combined.includes('filesystem')),
  ({combined}) => combined.includes('private') &&
    combined.includes('field') &&
    combined.includes('test') &&
    (combined.includes('direct access') ||
      combined.includes('mutate')),
  ({combined}) => combined.includes('underscore') &&
    combined.includes('internal') &&
    combined.includes('test'),
  ({combined}) => combined.includes('cleanup') &&
    combined.includes('error') &&
    (combined.includes('logged') || combined.includes('log')) &&
    (combined.includes('swallow') ||
      combined.includes('not rethrown') ||
      combined.includes('not thrown') ||
      combined.includes('continues')),
  ({combined}) => combined.includes('overrid') &&
    combined.includes('method') &&
    combined.includes('restor') &&
    combined.includes('test'),
  ({combined}) => combined.includes('overrid') &&
    (combined.includes('not restor') ||
      combined.includes('without restor') ||
      combined.includes('leaving overridden')),
  ({combined}) => combined.includes('mock') &&
    combined.includes('cdc') &&
    (combined.includes('upsert') ||
      combined.includes('insert') ||
      combined.includes('parallel')),
  ({combined}) => combined.includes('mock') &&
    combined.includes('semantic') &&
    combined.includes('test'),
  ({combined}) => combined.includes('try') &&
    combined.includes('catch') &&
    combined.includes('retry') &&
    (combined.includes('eaddrinuse') ||
      combined.includes('port') ||
      combined.includes('test')),
  ({combined}) => combined.includes('try/catch') &&
    combined.includes('control flow') &&
    combined.includes('retry'),
  ({combined}) => combined.includes('json.parse') &&
    (combined.includes('logged') || combined.includes('log')) &&
    (combined.includes('probe') ||
      combined.includes('bootstrap') ||
      combined.includes('test') ||
      combined.includes('health')),
  ({combined}) => combined.includes('parse') &&
    combined.includes('error') &&
    combined.includes('catch') &&
    combined.includes('control flow') &&
    (combined.includes('json') || combined.includes('response')),
  ({combined}) => combined.includes('try/catch') &&
    combined.includes('test') &&
    (combined.includes('assert') ||
      combined.includes('throw') ||
      combined.includes('expect')),
  ({combined}) => combined.includes('catch') &&
    combined.includes('test') &&
    !combined.includes('rethrow') &&
    (combined.includes('assert') || combined.includes('verify')),
];

const ARCHITECTURE_FALSE_POSITIVE_RULES = [
  ({combined}) => combined.includes('parallel') &&
    combined.includes('node state') &&
    combined.includes('cache'),
  ({combined}) => combined.includes('insert or replace') &&
    combined.includes('raft'),
  ({combined}) => combined.includes('parallel constant') &&
    combined.includes('same concept'),
  ({combined}) => combined.includes('introduces') &&
    combined.includes('parallel owner'),
  ({combined}) => combined.includes('system-table') &&
    combined.includes('row lifecycle') &&
    (combined.includes('owner') || combined.includes('ownership')),
  ({combined}) => combined.includes('upsert') &&
    combined.includes('system') &&
    combined.includes('table') &&
    (combined.includes('owner') ||
      combined.includes('lifecycle') ||
      combined.includes('full-row')),
  ({combined}) => combined.includes('fallback') &&
    combined.includes('write') &&
    (combined.includes('path') || combined.includes('mechanism')),
  ({combined}) => combined.includes('cache') &&
    (combined.includes('where clause') ||
      combined.includes('where-clause')) &&
    combined.includes('authoritative'),
  ({combined}) => combined.includes('field ownership') &&
    combined.includes('overlap') &&
    combined.includes('helper'),
  ({combined}) => combined.includes('cache') &&
    combined.includes('config') &&
    (combined.includes('parallel') ||
      combined.includes('duplicate') ||
      combined.includes('shadow')),
  ({combined}) => combined.includes('writing') &&
    combined.includes('field') &&
    (combined.includes('owned subset') ||
      combined.includes('outside') ||
      combined.includes('leader identity')),
  ({combined}) => combined.includes('canonical') &&
    combined.includes('owner') &&
    (combined.includes('row') ||
      combined.includes('identity') ||
      combined.includes('field')),
  ({combined}) => combined.includes('alias') &&
    (combined.includes('parallel naming') ||
      combined.includes('duplicate') ||
      combined.includes('single naming')),
  ({combined}) => combined.includes('fallback') &&
    combined.includes('code path') &&
    (combined.includes('resolution') ||
      combined.includes('address') ||
      combined.includes('target')),
  ({combined}) => combined.includes('fallback') &&
    combined.includes('try') &&
    (combined.includes('first') || combined.includes('then')),
  ({combined}) => combined.includes('parallel naming') &&
    (combined.includes('synonym') ||
      combined.includes('multiple') ||
      combined.includes('access')),
  ({combined}) => combined.includes('multiple') &&
    combined.includes('name') &&
    combined.includes('same concept'),
  ({combined}) => combined.includes('map') &&
    combined.includes('cdc') &&
    (combined.includes('node state') ||
      combined.includes('event') ||
      combined.includes('timestamp')),
  ({combined}) => combined.includes('in-memory') &&
    combined.includes('cache') &&
    combined.includes('system') &&
    (combined.includes('node state') ||
      combined.includes('event')),
];

const META_FALSE_POSITIVE_RULES = [
  ({title}) => title.includes('truncated') || title.includes('incomplete'),
  ({combined}) => combined.includes('no violation can be reported') ||
    combined.includes('no direct string/number magic') ||
    combined.includes('therefore no violation'),
  ({combined}) => combined.includes('not a violation') ||
    combined.includes('no fix needed') ||
    combined.includes('explicitly exempt'),
  ({combined}) => combined.includes('multiple') &&
    (combined.includes('responsibilit') ||
      combined.includes('component') ||
      combined.includes('class')) &&
    combined.includes('file'),
  ({title, combined}) => title.includes('file organization') ||
    title.includes('single responsibility') ||
    (combined.includes('split') &&
      combined.includes('file') &&
      combined.includes('responsibilit')),
  ({title, combined}) => title.includes('line exceeds') ||
    title.includes('line length') ||
    (combined.includes('100 character') &&
      combined.includes('line')),
];

/**
 * Detect false-positive violation patterns that the LLM
 * commonly generates but that do not represent real guideline
 * violations.
 *
 * @param {Object} violation - Violation object from LLM.
 * @return {boolean} True when the violation is a known
 *   false-positive pattern.
 */
function isFalsePositivePattern(violation) {
  const context = buildFalsePositiveContext(violation);
  return matchesFalsePositiveRuleGroup(
    context,
    LANGUAGE_AND_SYNTAX_FALSE_POSITIVE_RULES,
  ) ||
    matchesFalsePositiveRuleGroup(
      context,
      OWNER_AND_CONSTANT_FALSE_POSITIVE_RULES,
    ) ||
    matchesFalsePositiveRuleGroup(
      context,
      TEST_INFRASTRUCTURE_FALSE_POSITIVE_RULES,
    ) ||
    matchesFalsePositiveRuleGroup(
      context,
      ARCHITECTURE_FALSE_POSITIVE_RULES,
    ) ||
    matchesFalsePositiveRuleGroup(context, META_FALSE_POSITIVE_RULES);
}

function isConstantsRuleViolation(violation) {
  const rule = String(violation.ruleReference || '').toLowerCase();
  const title = String(violation.title || '').toLowerCase();
  const description = String(violation.description || '').toLowerCase();
  return (
    rule.includes('4.1') ||
    rule.includes('constants, not literals') ||
    title.includes('magic literal') ||
    title.includes('magic string') ||
    title.includes('magic number') ||
    title.includes('raw literal') ||
    description.includes('magic literal') ||
    description.includes('raw string literal') ||
    description.includes('raw numeric literal') ||
    description.includes('constants-owner')
  );
}

function isCommitBlockingViolation(classification, violation) {
  if (classification === 'test file' && isConstantsRuleViolation(violation)) {
    return false;
  }

  if (
    classification === 'canonical constants-owner module' &&
    isConstantsRuleViolation(violation)
  ) {
    return false;
  }

  return true;
}

function filterViolations(relativePath, violations) {
  const classification = buildFileClassification(path.normalize(relativePath));
  return violations.filter((violation) => isCommitBlockingViolation(
    classification,
    violation,
  )).filter((violation) => !(
    isSpeculativeText(violation.title) ||
    isSpeculativeText(violation.description) ||
    isSpeculativeText(violation.suggestedFix)
  )).filter((violation) => !isFalsePositivePattern(violation));
}

async function checkWithLlm(relativePath, fileContent, guidelines) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE_URL}${GUIDELINE_LLM_DEFAULT.API_PATH}`, {
      method: GUIDELINE_LLM_REQUEST.METHOD_POST,
      headers: {
        [GUIDELINE_LLM_HEADER.CONTENT_TYPE]: GUIDELINE_LLM_HEADER.JSON,
        [GUIDELINE_LLM_HEADER.AUTHORIZATION]:
          `${GUIDELINE_LLM_HEADER.BEARER_PREFIX}${API_KEY}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        temperature: 0,
        messages: [
          {
            role: GUIDELINE_LLM_REQUEST.ROLE_SYSTEM,
            content: GUIDELINE_LLM_MESSAGE.SYSTEM_PROMPT,
          },
          {
            role: GUIDELINE_LLM_REQUEST.ROLE_USER,
            content: buildPrompt(relativePath, fileContent, guidelines),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`LLM API request failed (${response.status}): ${errorBody}`);
    }

    const payload = await response.json();
    const messageContent = payload?.choices?.[0]?.message?.content || '';
    const jsonText = extractJsonObject(messageContent);
    if (!jsonText) {
      throw new Error('LLM response did not contain parseable JSON output.');
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (error) {
      throw new Error(`Failed to parse LLM JSON output: ${error.message}`);
    }

    const violations = Array.isArray(parsed.violations) ? parsed.violations : [];
    return filterViolations(relativePath, violations.map((violation) => ({
      title: String(violation.title || GUIDELINE_LLM_MESSAGE.DEFAULT_TITLE),
      description: String(
        violation.description || GUIDELINE_LLM_MESSAGE.DEFAULT_DESCRIPTION,
      ),
      ruleReference: String(
        violation.rule_reference || GUIDELINE_LLM_MESSAGE.DEFAULT_RULE_REFERENCE,
      ),
      line: Number.isInteger(violation.line) && violation.line > 0 ?
        violation.line :
        GUIDELINE_POSITION.DEFAULT_LINE,
      suggestedFix: String(
        violation.suggested_fix || GUIDELINE_LLM_MESSAGE.DEFAULT_SUGGESTED_FIX,
      ),
    })));
  } finally {
    clearTimeout(timeoutId);
  }
}

function printViolations(relativePath, violations) {
  for (const violation of violations) {
    console.error(
      `${formatGuidelineLocation(relativePath, violation.line)}: error [SYS-GUIDELINE] ` +
        `${violation.title} - ${violation.description}`,
    );
    console.error(`  rule: ${violation.ruleReference}`);
    console.error(`  fix: ${violation.suggestedFix}`);
  }
}

async function collectPendingChecks(fileArgs, guidelines, cache) {
  const pendingChecks = [];
  const fileErrors = [];
  for (const argPath of fileArgs) {
    const absolutePath = normalizePath(argPath);
    if (shouldSkipPath(absolutePath)) {
      continue;
    }

    const relativePath = path.relative(WORKSPACE_ROOT, absolutePath);
    let fileContent;
    try {
      fileContent = await readFileSafe(absolutePath);
    } catch (error) {
      fileErrors.push({relativePath, error});
      continue;
    }

    if (fileContent === null) {
      continue;
    }

    const cacheKey = buildCacheKey(relativePath, fileContent, guidelines);
    const cachedEntry = cache.entries[cacheKey];
    if (cachedEntry && Array.isArray(cachedEntry.violations)) {
      pendingChecks.push({
        relativePath,
        cached: true,
        violations: cachedEntry.violations,
      });
      continue;
    }

    pendingChecks.push({
      relativePath,
      cached: false,
      cacheKey,
      fileContent,
    });
  }

  return {fileErrors, pendingChecks};
}

function getEffectiveConcurrency() {
  return Math.max(1, Number.isFinite(REQUEST_CONCURRENCY) ?
    Math.floor(REQUEST_CONCURRENCY) :
    GUIDELINE_LLM_DEFAULT.CONCURRENCY);
}

async function runPendingChecks(pendingChecks, guidelines, cache) {
  const results = new Array(pendingChecks.length);
  const concurrency = Math.min(
    getEffectiveConcurrency(),
    Math.max(1, pendingChecks.length),
  );
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < pendingChecks.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const pending = pendingChecks[currentIndex];
      if (pending.cached) {
        results[currentIndex] = pending;
        continue;
      }

      try {
        const violations = await checkWithLlm(
          pending.relativePath,
          pending.fileContent,
          guidelines,
        );
        cache.entries[pending.cacheKey] = {violations};
        results[currentIndex] = {
          relativePath: pending.relativePath,
          cached: false,
          violations,
        };
      } catch (error) {
        results[currentIndex] = {
          relativePath: pending.relativePath,
          error,
        };
      }
    }
  }

  await Promise.all(Array.from({length: concurrency}, () => worker()));
  return results;
}

function reportFileReadErrors(fileErrors) {
  let hasViolations = false;
  for (const {relativePath, error} of fileErrors) {
    console.error(
      `${formatGuidelineLocation(relativePath)}: error [SYS-GUIDELINE] ${error.message}`,
    );
    hasViolations = true;
  }
  return hasViolations;
}

function reportCheckResults(results) {
  let hasViolations = false;
  for (const result of results) {
    if (!result) {
      continue;
    }

    if (result.error) {
      hasViolations = true;
      console.error(
        `${formatGuidelineLocation(result.relativePath)}: error [SYS-GUIDELINE] ` +
        `${GUIDELINE_LLM_MESSAGE.CHECK_FAILED_PREFIX}${result.error.message}`,
      );
      continue;
    }

    if (result.violations.length > 0) {
      hasViolations = true;
      printViolations(result.relativePath, result.violations);
    }
  }
  return hasViolations;
}

async function main(argv = process.argv.slice(2)) {
  await initializeConfig();

  const fileArgs = argv.filter(Boolean);
  if (fileArgs.length === 0) {
    printUsage();
    process.exitCode = EXIT_CODE.USAGE;
    return;
  }

  if (!API_KEY) {
    console.error(GUIDELINE_LLM_MESSAGE.MISSING_API_KEY);
    process.exitCode = EXIT_CODE.USAGE;
    return;
  }

  const guidelines = await readGuidelines();
  const cache = await readCacheFile();
  const {fileErrors, pendingChecks} = await collectPendingChecks(
    fileArgs,
    guidelines,
    cache,
  );
  const results = await runPendingChecks(pendingChecks, guidelines, cache);
  const hasViolations = reportFileReadErrors(fileErrors) ||
    reportCheckResults(results);

  await writeCacheFile(cache);

  if (hasViolations) {
    process.exitCode = EXIT_CODE.FAILURE;
  }
}

const CHECK_GUIDELINES_LLM_IS_DIRECT_EXECUTION = Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (CHECK_GUIDELINES_LLM_IS_DIRECT_EXECUTION) {
  main().catch((error) => {
    console.error(`${GUIDELINE_LLM_MESSAGE.FATAL_PREFIX}${error.message}`);
    process.exit(EXIT_CODE.FAILURE);
  });
}

export {
  filterViolations,
  isFalsePositivePattern,
  main,
};
