#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const ENCODING_UTF8 = 'utf8';
const EMPTY_TEXT = '';
const NEWLINE = '\n';
const SPACE = ' ';
const WORK_TRACKER_PATH = path.join('scripts', 'work-tracker.js');
const TEST_DIRECTORY = path.join('test', 'scripts');
const FLAG_DETAILS = '--details';
const FLAG_HELP = '--help';
const FLAG_JSON = '--json';
const FLAG_LIMIT = '--limit';
const DEFAULT_LIMIT = 40;
const NO_LIMIT = 0;
const NUM_ZERO = 0;
const NUM_ONE = 1;
const PROCESS_ARG_SCRIPT_INDEX = 1;
const VALIDATOR_EXPORT_PATTERN =
  /export\s+function\s+(validate[A-Z][A-Za-z0-9_]*)\s*\(/gu;
const LOCAL_VALIDATOR_PATTERN =
  /function\s+(validate[A-Z][A-Za-z0-9_]*)\s*\(/gu;
const ERROR_MESSAGE_PATTERN =
  /(?:errors\.push\s*\(\s*|return\s+\[\s*)`([^`]*:\s[^`]+)`/gu;
const REPAIR_HINT_PATTERN = /\b(?:run npm|npm run|work:repair|work:validate|work:package|add `|record `|rerun)\b/iu;
const HELP_TEXT = [
  'Usage: node scripts/work-audit-validator-coverage.js [--details] [--limit N] [--json]',
  '',
  'Audits validator functions in scripts/work-tracker.js against test references and repair-hint coverage.',
].join(NEWLINE);

function normalizeWhitespace(value = EMPTY_TEXT) {
  return String(value).trim().replace(/\s+/gu, SPACE);
}

function parseOptionValue(args, flagName) {
  const index = args.indexOf(flagName);
  return index >= NUM_ZERO ? args[index + NUM_ONE] : EMPTY_TEXT;
}

function parseIntegerOption(value, fallback) {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= NUM_ZERO ? parsed : fallback;
}

function parseArgs(args = []) {
  return {
    details: args.includes(FLAG_DETAILS),
    json: args.includes(FLAG_JSON),
    limit: parseIntegerOption(parseOptionValue(args, FLAG_LIMIT), DEFAULT_LIMIT),
    help: args.includes(FLAG_HELP),
  };
}

function collectMatches(pattern, content) {
  pattern.lastIndex = NUM_ZERO;
  const matches = [];
  let match = pattern.exec(content);
  while (match) {
    matches.push(match);
    match = pattern.exec(content);
  }
  return matches;
}

function findMatchingBrace(content, openIndex) {
  let depth = NUM_ZERO;
  let inString = null;
  let escaped = false;
  for (let index = openIndex; index < content.length; index += NUM_ONE) {
    const char = content[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === inString) {
        inString = null;
      }
      continue;
    }
    if (char === '"' || char === '\'' || char === '`') {
      inString = char;
      continue;
    }
    if (char === '{') {
      depth += NUM_ONE;
    } else if (char === '}') {
      depth -= NUM_ONE;
      if (depth === NUM_ZERO) {
        return index;
      }
    }
  }
  return -NUM_ONE;
}

function extractFunctionBody(content, functionName) {
  const functionPattern = new RegExp(
    `(?:export\\s+)?function\\s+${functionName}\\s*\\([^)]*\\)\\s*\\{`,
    'u',
  );
  const match = functionPattern.exec(content);
  if (!match) {
    return EMPTY_TEXT;
  }
  const openIndex = match.index + match[NUM_ZERO].lastIndexOf('{');
  const closeIndex = findMatchingBrace(content, openIndex);
  return closeIndex >= NUM_ZERO ?
    content.slice(openIndex, closeIndex + NUM_ONE) :
    EMPTY_TEXT;
}

function extractValidatorFunctions(content) {
  const exported = new Set(
    collectMatches(VALIDATOR_EXPORT_PATTERN, content).map((match) => match[NUM_ONE]),
  );
  const allNames = new Set([
    ...exported,
    ...collectMatches(LOCAL_VALIDATOR_PATTERN, content)
      .map((match) => match[NUM_ONE]),
  ]);
  return [...allNames].sort().map((name) => {
    const body = extractFunctionBody(content, name);
    const errorMessages = collectMatches(ERROR_MESSAGE_PATTERN, body)
      .map((match) => normalizeWhitespace(match[NUM_ONE]))
      .filter(Boolean);
    return {
      name,
      exported: exported.has(name),
      errorMessages,
      repairHintCount: errorMessages.filter((message) =>
        REPAIR_HINT_PATTERN.test(message)).length,
    };
  });
}

async function listFilesRecursive(directoryPath) {
  let entries;
  try {
    entries = await fs.readdir(directoryPath, {withFileTypes: true});
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(fullPath)));
    } else if (entry.isFile() && fullPath.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

async function readTestIndex(root, testDirectory = TEST_DIRECTORY) {
  const testFiles = await listFilesRecursive(path.join(root, testDirectory));
  const entries = [];
  for (const testFile of testFiles) {
    entries.push({
      filePath: path.relative(root, testFile),
      content: await fs.readFile(testFile, ENCODING_UTF8),
    });
  }
  return entries;
}

function collectTestReferences(validators, testEntries) {
  const references = new Map(validators.map((validator) => [validator.name, []]));
  for (const validator of validators) {
    const pattern = new RegExp(`\\b${validator.name}\\b`, 'u');
    for (const entry of testEntries) {
      if (pattern.test(entry.content)) {
        references.get(validator.name).push(entry.filePath);
      }
    }
  }
  return references;
}

async function buildValidatorCoverageAudit(options = {}) {
  const root = options.root ?? process.cwd();
  const trackerPath = options.trackerPath ?? path.join(root, WORK_TRACKER_PATH);
  const trackerContent = await fs.readFile(trackerPath, ENCODING_UTF8);
  const validators = extractValidatorFunctions(trackerContent);
  const testEntries = await readTestIndex(root, options.testDirectory);
  const references = collectTestReferences(validators, testEntries);
  const results = validators.map((validator) => {
    const testFiles = references.get(validator.name) || [];
    return {
      ...validator,
      testFiles,
      hasTests: testFiles.length > NUM_ZERO,
      hasRepairHints:
        validator.errorMessages.length === NUM_ZERO ||
        validator.repairHintCount > NUM_ZERO,
    };
  });
  return {
    trackerPath: path.relative(root, trackerPath),
    validators: results,
    totals: {
      validators: results.length,
      exportedValidators: results.filter((result) => result.exported).length,
      validatorsWithTests: results.filter((result) => result.hasTests).length,
      validatorsWithoutTests: results.filter((result) => !result.hasTests).length,
      validatorsWithErrors: results.filter((result) =>
        result.errorMessages.length > NUM_ZERO).length,
      validatorsMissingRepairHints: results.filter((result) =>
        !result.hasRepairHints).length,
    },
  };
}

function visibleValues(values, limit) {
  return limit === NO_LIMIT ? values : values.slice(NUM_ZERO, limit);
}

function renderValidatorRow(result) {
  const status = result.hasTests ? 'tested' : 'needs-test-signal';
  const hintStatus = result.hasRepairHints ? 'repair-hint-ok' : 'needs-repair-hint';
  return `- \`${result.name}\`: ${status}; ${hintStatus}; ` +
    `${result.errorMessages.length} error template(s)`;
}

function renderValidatorCoverageAudit(audit, options = {}) {
  if (options.json) {
    return `${JSON.stringify(audit, null, 2)}${NEWLINE}`;
  }
  const untested = audit.validators.filter((result) => !result.hasTests);
  const missingHints = audit.validators.filter((result) => !result.hasRepairHints);
  const lines = [
    '# Validator Rule Coverage Audit Report',
    EMPTY_TEXT,
    `Tracker file: \`${audit.trackerPath}\``,
    `Validator functions: ${audit.totals.validators}`,
    `Exported validators: ${audit.totals.exportedValidators}`,
    `Validators with test references: ${audit.totals.validatorsWithTests}`,
    `Validators without test references: ${audit.totals.validatorsWithoutTests}`,
    `Validators missing repair-hint signal: ${audit.totals.validatorsMissingRepairHints}`,
    EMPTY_TEXT,
    'Action: add tests for high-risk unreferenced validators first; add repair hints where a rejection explains what failed but not the next command or metadata field to fix.',
    EMPTY_TEXT,
    '## Validators Without Test References',
    EMPTY_TEXT,
  ];
  if (untested.length === NUM_ZERO) {
    lines.push('- none');
  } else {
    lines.push(...visibleValues(untested, options.limit).map(renderValidatorRow));
    if (options.limit !== NO_LIMIT && options.limit < untested.length) {
      lines.push(`- ... ${untested.length - options.limit} more`);
    }
  }
  lines.push(EMPTY_TEXT, '## Validators Missing Repair Hints', EMPTY_TEXT);
  if (missingHints.length === NUM_ZERO) {
    lines.push('- none');
  } else {
    lines.push(...visibleValues(missingHints, options.limit).map(renderValidatorRow));
    if (options.limit !== NO_LIMIT && options.limit < missingHints.length) {
      lines.push(`- ... ${missingHints.length - options.limit} more`);
    }
  }
  if (options.details) {
    lines.push(EMPTY_TEXT, '## Details', EMPTY_TEXT);
    for (const result of visibleValues(audit.validators, options.limit)) {
      lines.push(renderValidatorRow(result));
      if (result.testFiles.length > NUM_ZERO) {
        lines.push(`  - tests: ${result.testFiles.map((filePath) => `\`${filePath}\``).join(', ')}`);
      }
      if (result.errorMessages.length > NUM_ZERO) {
        lines.push('  - sample errors:');
        for (const message of visibleValues(result.errorMessages, 3)) {
          lines.push(`    - ${message}`);
        }
      }
    }
  }
  return `${lines.join(NEWLINE)}${NEWLINE}`;
}

async function runCli(args = process.argv.slice(2), options = {}) {
  const parsed = parseArgs(args);
  if (parsed.help) {
    return `${HELP_TEXT}${NEWLINE}`;
  }
  const audit = await buildValidatorCoverageAudit({
    root: options.root,
    trackerPath: options.trackerPath,
    testDirectory: options.testDirectory,
  });
  return renderValidatorCoverageAudit(audit, parsed);
}

function isDirectRun() {
  return process.argv[PROCESS_ARG_SCRIPT_INDEX] === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  runCli()
    .then((output) => {
      process.stdout.write(output);
    })
    .catch((error) => {
      process.stderr.write(`${error.message}${NEWLINE}`);
      process.exitCode = 1;
    });
}

export {
  buildValidatorCoverageAudit,
  extractFunctionBody,
  extractValidatorFunctions,
  parseArgs,
  renderValidatorCoverageAudit,
  runCli,
};
