import path from 'node:path';

const STEERING_DIR = Object.freeze(['.kiro', 'steering']);
const ARCHIVED_SPECS_DIR = Object.freeze(['.kiro', 'specs', 'archived']);

export const ENV_FILE = Object.freeze({
  DEFAULT: '.env',
  LOCAL: '.env.local',
});

export const EXIT_CODE = Object.freeze({
  SUCCESS: 0,
  FAILURE: 1,
  USAGE: 2,
});

export const GUIDELINE_POSITION = Object.freeze({
  DEFAULT_LINE: 1,
  DEFAULT_COLUMN: 1,
});

export const GUIDELINE_LLM_DEFAULT = Object.freeze({
  MODEL: 'gpt-4.1-mini',
  BASE_URL: 'https://api.openai.com/v1',
  TIMEOUT_MS: 30000,
  MAX_FILE_CHARS: 14000,
  API_PATH: '/chat/completions',
});

export const GUIDELINE_LLM_ENV_KEY = Object.freeze({
  MODEL: 'GUIDELINE_LLM_MODEL',
  BASE_URL: 'GUIDELINE_LLM_BASE_URL',
  API_KEY: 'GUIDELINE_LLM_API_KEY',
  OPENAI_API_KEY: 'OPENAI_API_KEY',
  TIMEOUT_MS: 'GUIDELINE_LLM_TIMEOUT_MS',
  MAX_FILE_CHARS: 'GUIDELINE_LLM_MAX_FILE_CHARS',
});

export const GUIDELINE_LLM_HEADER = Object.freeze({
  CONTENT_TYPE: 'Content-Type',
  AUTHORIZATION: 'Authorization',
  JSON: 'application/json',
  BEARER_PREFIX: 'Bearer ',
});

export const GUIDELINE_LLM_REQUEST = Object.freeze({
  METHOD_POST: 'POST',
  ROLE_SYSTEM: 'system',
  ROLE_USER: 'user',
});

export const GUIDELINE_LLM_MESSAGE = Object.freeze({
  USAGE: 'Usage: node scripts/check-guidelines-llm.js <file> [more-files]',
  MISSING_API_KEY:
    'Missing API key. Set GUIDELINE_LLM_API_KEY or OPENAI_API_KEY.',
  SYSTEM_PROMPT: 'You are a strict system-guideline compliance checker.',
  CHECK_FAILED_PREFIX: 'Check failed: ',
  FATAL_PREFIX: 'fatal: ',
  DEFAULT_TITLE: 'Guideline violation',
  DEFAULT_DESCRIPTION: 'Violation detected.',
  DEFAULT_RULE_REFERENCE: 'system guidelines.md',
  DEFAULT_SUGGESTED_FIX: 'Refactor to satisfy the rule.',
});

export const SCRIPT_TEXT = Object.freeze({
  ENCODING_UTF8: 'utf8',
  NEWLINE: '\n',
});

export const GUIDELINE_LLM_PROMPT = Object.freeze({
  INTRO: 'Evaluate this file against the provided SYSTEM GUIDELINES only.',
  JSON_SHAPE:
    'Return strict JSON with this exact shape and no extra keys:',
  JSON_SCHEMA:
    '{"violations":[{"title":"string","description":"string",' +
    '"rule_reference":"string","line":number,"suggested_fix":"string"}],' +
    '"summary":"string"}',
  NO_VIOLATION_SCHEMA:
    'If there are no violations, return {"violations":[],"summary":"ok"}.',
  HIGH_CONFIDENCE_ONLY: 'Only report clear, high-confidence violations.',
  FILE_LABEL: 'FILE:',
  SYSTEM_GUIDELINES_LABEL: 'SYSTEM GUIDELINES:',
  FILE_CONTENT_LABEL: 'FILE CONTENT:',
  TRUNCATED_MARKER: '[TRUNCATED]',
  JSON_FENCE_PATTERN: /```json\s*([\s\S]*?)\s*```/i,
});

export const GUIDELINE_LLM_PATH = Object.freeze({
  GUIDELINES_FILE: 'system guidelines.md',
  FULL_CONTENT_PREFIXES: Object.freeze([
    path.join(...STEERING_DIR) + path.sep,
    'architecture.md',
  ]),
  ARCHIVED_SPECS_PREFIX: path.join(...ARCHIVED_SPECS_DIR) + path.sep,
  SELF_TOOLING_PREFIXES: Object.freeze([
    path.join('.githooks') + path.sep,
    path.join('scripts', 'check-guidelines-llm.js'),
    path.join('scripts', 'check-guidelines-staged.js'),
    path.join('scripts', 'guideline-check-constants.js'),
  ]),
});

export const GUIDELINE_LLM_SKIP_PATH_PART = Object.freeze([
  'node_modules',
  '.git',
  '.tap',
  'dist',
  'test-output',
  'data',
  'data2',
  'data3',
]);

export const GUIDELINE_STAGED = Object.freeze({
  GIT_BIN: 'git',
  CHECK_SCRIPT: 'scripts/check-guidelines-llm.js',
  DIFF_ARGS: Object.freeze([
    'diff',
    '--cached',
    '--name-only',
    '--diff-filter=ACMR',
  ]),
  GIT_READ_FAILED: 'Unable to read staged files from git.',
  PRE_COMMIT_PREFIX: '[pre-commit] ',
  STDIO_GIT: Object.freeze(['ignore', 'pipe', 'pipe']),
  STDIO_CHECK: 'inherit',
});
