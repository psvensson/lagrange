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
  CONCURRENCY: 4,
  CACHE_SCHEMA_VERSION: 2,
  API_PATH: '/chat/completions',
});

export const GUIDELINE_LLM_ENV_KEY = Object.freeze({
  MODEL: 'GUIDELINE_LLM_MODEL',
  BASE_URL: 'GUIDELINE_LLM_BASE_URL',
  API_KEY: 'GUIDELINE_LLM_API_KEY',
  OPENAI_API_KEY: 'OPENAI_API_KEY',
  TIMEOUT_MS: 'GUIDELINE_LLM_TIMEOUT_MS',
  MAX_FILE_CHARS: 'GUIDELINE_LLM_MAX_FILE_CHARS',
  CONCURRENCY: 'GUIDELINE_LLM_CONCURRENCY',
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
  NO_SPECULATION:
    'Do not speculate. Report a violation only when the file content itself ' +
    'clearly and directly conflicts with the guidelines.',
  CONSTANT_OWNER_HINT:
    'If the file is a canonical constants-owner module, it may define the ' +
    'literal values it owns once. Do not flag that ownership as a violation.',
  FILE_LOCAL_CONSTANT_HINT:
    'A regular source file may define file-local private constants when the ' +
    'value is only used inside that file and is not a shared cross-file concept ' +
    'or public API token. Do not require promotion of purely local helper values.',
  FILE_LOCAL_ENUM_HINT:
    'Do not flag a private, non-exported file-local enum/object solely because ' +
    'it groups literals used only inside that file.',
  TEST_CONSTANT_OWNER_HINT:
    'A test-local constants-owner file or the test file itself may own ' +
    'suite-unique fixture values. Do not require a separate sidecar constants ' +
    'file unless the file itself shows cross-suite reuse.',
  TEST_LITERAL_HINT:
    'For tests, do not require exhaustive hoisting of one-off fixture literals. ' +
    'Report constants issues only for repeated or semantically important values ' +
    'that should clearly be named and reused.',
  NO_DUPLICATE_INFERENCE:
    'Do not infer duplication or non-canonicity from likelihood or style. ' +
    'Only report duplicate ownership when the file itself shows parallel names ' +
    'or the guidelines explicitly make the conflict clear.',
  NO_STRUCTURAL_OVERREACH:
    'Do not require decomposition into ever-smaller constants unless the file ' +
    'still embeds raw literals inside composed structures contrary to the guidelines.',
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
  FILE_CLASSIFICATION_LABEL: 'FILE CLASSIFICATION:',
  SYSTEM_GUIDELINES_LABEL: 'SYSTEM GUIDELINES:',
  FILE_CONTENT_LABEL: 'FILE CONTENT:',
  TRUNCATED_MARKER: '[TRUNCATED]',
  JSON_FENCE_PATTERN: /```json\s*([\s\S]*?)\s*```/i,
});

export const GUIDELINE_LLM_PATH = Object.freeze({
  GUIDELINES_FILE: 'system guidelines.md',
  CACHE_FILE: path.join('.git', 'guideline-llm-cache.json'),
  FULL_CONTENT_PREFIXES: Object.freeze([
    path.join(...STEERING_DIR) + path.sep,
    'architecture.md',
    path.join('architecture') + path.sep,
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
