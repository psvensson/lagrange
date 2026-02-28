#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const WORKSPACE_ROOT = process.cwd();
const GUIDELINES_PATH = path.join(
    WORKSPACE_ROOT,
    '.kiro',
    'steering',
    'system guidelines.md',
);

let DEFAULT_MODEL;
let BASE_URL;
let API_KEY;
let REQUEST_TIMEOUT_MS;
let MAX_FILE_CHARS;

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
    fileContent = await fs.readFile(filePath, 'utf8');
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
  await loadEnvFile('.env');
  await loadEnvFile('.env.local');

  DEFAULT_MODEL = process.env.GUIDELINE_LLM_MODEL || 'gpt-4.1-mini';
  BASE_URL = (process.env.GUIDELINE_LLM_BASE_URL ||
    'https://api.openai.com/v1').replace(/\/$/, '');
  API_KEY = process.env.GUIDELINE_LLM_API_KEY || process.env.OPENAI_API_KEY;
  REQUEST_TIMEOUT_MS = Number(process.env.GUIDELINE_LLM_TIMEOUT_MS || 30000);
  MAX_FILE_CHARS = Number(process.env.GUIDELINE_LLM_MAX_FILE_CHARS || 14000);
}

const IGNORED_PATH_PARTS = new Set([
  'node_modules',
  '.git',
  'dist',
  'test-output',
  'data',
  'data2',
  'data3',
]);

function printUsage() {
  console.error('Usage: node scripts/check-guidelines-llm.js <file> [more-files]');
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

  const pathParts = relativePath.split(path.sep);
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

  const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
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
  return fs.readFile(GUIDELINES_PATH, 'utf8');
}

async function readFileSafe(absolutePath) {
  const content = await fs.readFile(absolutePath, 'utf8');
  if (isProbablyBinary(content)) {
    return null;
  }
  return content;
}

function buildPrompt(relativePath, fileContent, guidelines) {
  const truncatedContent = fileContent.length > MAX_FILE_CHARS ?
    `${fileContent.slice(0, MAX_FILE_CHARS)}\n\n[TRUNCATED]` : fileContent;

  return [
    'Evaluate this file against the provided SYSTEM GUIDELINES only.',
    'Return strict JSON with this exact shape and no extra keys:',
    '{"violations":[{"title":"string","description":"string",' +
      '"rule_reference":"string","line":number,"suggested_fix":"string"}],'+
      '"summary":"string"}',
    'If there are no violations, return {"violations":[],"summary":"ok"}.',
    'Only report clear, high-confidence violations.',
    '',
    `FILE: ${relativePath}`,
    '',
    'SYSTEM GUIDELINES:',
    guidelines,
    '',
    'FILE CONTENT:',
    truncatedContent,
  ].join('\n');
}

async function checkWithLlm(relativePath, fileContent, guidelines) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: 'You are a strict system-guideline compliance checker.',
          },
          {
            role: 'user',
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
    return violations.map((violation) => ({
      title: String(violation.title || 'Guideline violation'),
      description: String(violation.description || 'Violation detected.'),
      ruleReference: String(violation.rule_reference || 'system guidelines.md'),
      line: Number.isInteger(violation.line) && violation.line > 0 ? violation.line : 1,
      suggestedFix: String(violation.suggested_fix || 'Refactor to satisfy the rule.'),
    }));
  } finally {
    clearTimeout(timeoutId);
  }
}

function printViolations(relativePath, violations) {
  for (const violation of violations) {
    console.error(
        `${relativePath}:${violation.line}:1: error [SYS-GUIDELINE] ` +
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
    process.exitCode = 2;
    return;
  }

  if (!API_KEY) {
    console.error(
        'Missing API key. Set GUIDELINE_LLM_API_KEY or OPENAI_API_KEY.',
    );
    process.exitCode = 2;
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
      console.error(`${relativePath}:1:1: error [SYS-GUIDELINE] ${error.message}`);
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
          `${relativePath}:1:1: error [SYS-GUIDELINE] Check failed: ${error.message}`,
      );
    }
  }

  if (hasViolations) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`fatal: ${error.message}`);
  process.exit(1);
});