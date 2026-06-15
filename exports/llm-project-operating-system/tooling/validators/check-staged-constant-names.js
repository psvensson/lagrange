#!/usr/bin/env node

// Pre-commit gate: reject NEWLY ADDED opaque (hash-named) constants without
// blocking on the ~976 inherited ones. Scans only the added lines of the
// staged diff, so editing a file that already contains legacy hash names
// never fails — only introducing a new one does.

import {spawnSync} from 'node:child_process';
import process from 'node:process';

import {isOpaqueConstantName} from './check-guideline-constant-names.js';
import {EXIT_CODE, SCRIPT_TEXT} from './guideline-check-constants.js';

const GIT_COMMAND = 'git';
const GIT_DIFF_ARGS = Object.freeze([
  'diff',
  '--cached',
  '--unified=0',
  '--diff-filter=ACM',
  '--',
  '*.js',
  '*.mjs',
  '*.cjs',
]);
const DIFF_FILE_HEADER_PATTERN = /^\+\+\+ b\/(.+)$/u;
const DIFF_ADDED_LINE_PREFIX = '+';
const DIFF_ADDED_HEADER_PREFIX = '+++';
const CONSTANT_DECLARATION_PATTERN =
  /\bconst\s+((?:LOCAL|TEST)_(?:STR|NUM)_[A-Z0-9_]+)\s*=/gu;
const SCRIPT_BASENAME = 'check-staged-constant-names.js';
const GUIDANCE_TEXT =
  'New constants must describe their semantic owner (system guidelines.md ' +
  '§4.1). Rename the constant; SKIP_GATE_HOOKS=1 bypasses in an ' +
  'emergency.';

function collectOpaqueAddedConstants(diffText) {
  const findings = [];
  let currentFile = null;
  for (const line of diffText.split(SCRIPT_TEXT.NEWLINE)) {
    const fileHeaderMatch = DIFF_FILE_HEADER_PATTERN.exec(line);
    if (fileHeaderMatch) {
      currentFile = fileHeaderMatch[1];
      continue;
    }
    if (!currentFile ||
        !line.startsWith(DIFF_ADDED_LINE_PREFIX) ||
        line.startsWith(DIFF_ADDED_HEADER_PREFIX)) {
      continue;
    }
    for (const match of line.matchAll(CONSTANT_DECLARATION_PATTERN)) {
      const constantName = match[1];
      if (isOpaqueConstantName(constantName)) {
        findings.push({filePath: currentFile, constantName});
      }
    }
  }
  return findings;
}

function readStagedDiff() {
  const result = spawnSync(GIT_COMMAND, GIT_DIFF_ARGS, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== EXIT_CODE.SUCCESS) {
    throw new Error(result.stderr?.trim() || 'git diff --cached failed');
  }
  return result.stdout || '';
}

function main() {
  const findings = collectOpaqueAddedConstants(readStagedDiff());
  if (findings.length === EXIT_CODE.SUCCESS) {
    return EXIT_CODE.SUCCESS;
  }
  for (const finding of findings) {
    process.stderr.write(
      `${finding.filePath}: staged change adds opaque constant name ` +
        `${finding.constantName}${SCRIPT_TEXT.NEWLINE}`,
    );
  }
  process.stderr.write(GUIDANCE_TEXT + SCRIPT_TEXT.NEWLINE);
  return EXIT_CODE.FAILURE;
}

if (process.argv[1] && process.argv[1].endsWith(SCRIPT_BASENAME)) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(String(error?.stack || error) + SCRIPT_TEXT.NEWLINE);
    process.exitCode = EXIT_CODE.FAILURE;
  }
}

export {collectOpaqueAddedConstants};
