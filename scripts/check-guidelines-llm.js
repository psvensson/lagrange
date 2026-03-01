#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
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
const AbortController = globalThis.AbortController;
const FULL_CONTENT_PREFIXES = GUIDELINE_LLM_PATH.FULL_CONTENT_PREFIXES;

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
    GUIDELINE_LLM_PROMPT.TEST_CONSTANT_OWNER_HINT,
    GUIDELINE_LLM_PROMPT.NO_DUPLICATE_INFERENCE,
    GUIDELINE_LLM_PROMPT.NO_STRUCTURAL_OVERREACH,
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
  if (normalizedRelativePath.startsWith(path.join('src', 'constants') + path.sep)) {
    return 'canonical shared constants-owner module';
  }

  if (
    normalizedRelativePath.startsWith('test' + path.sep) &&
    basename.includes('constants')
  ) {
    return 'test-local constants-owner module';
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

function filterSpeculativeViolations(violations) {
  return violations.filter((violation) => !(
    isSpeculativeText(violation.title) ||
    isSpeculativeText(violation.description) ||
    isSpeculativeText(violation.suggestedFix)
  ));
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
    return filterSpeculativeViolations(violations.map((violation) => ({
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

async function main() {
  await initializeConfig();

  const fileArgs = process.argv.slice(2).filter(Boolean);
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

  let hasViolations = false;
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
      console.error(
        `${formatGuidelineLocation(relativePath)}: error [SYS-GUIDELINE] ${error.message}`,
      );
      hasViolations = true;
      continue;
    }

    if (fileContent === null) {
      continue;
    }

    try {
      const violations = await checkWithLlm(relativePath, fileContent, guidelines);
      if (violations.length > 0) {
        hasViolations = true;
        printViolations(relativePath, violations);
      }
    } catch (error) {
      hasViolations = true;
      console.error(
        `${formatGuidelineLocation(relativePath)}: error [SYS-GUIDELINE] ` +
        `${GUIDELINE_LLM_MESSAGE.CHECK_FAILED_PREFIX}${error.message}`,
      );
    }
  }

  if (hasViolations) {
    process.exitCode = EXIT_CODE.FAILURE;
  }
}

main().catch((error) => {
  console.error(`${GUIDELINE_LLM_MESSAGE.FATAL_PREFIX}${error.message}`);
  process.exit(EXIT_CODE.FAILURE);
});
