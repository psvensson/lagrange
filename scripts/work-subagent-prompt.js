#!/usr/bin/env node

import fs from 'node:fs/promises';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {
  VALID_OUTPUT_PROFILES,
  defaultOutputProfileForLane,
} from './work-package-schema.js';

const ENCODING_UTF8 = 'utf8';
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const NUM_ZERO = 0;
const NUM_ONE = 1;
const NUM_TWO = 2;
const ROLE_REVIEW = 'review';
const ROLE_FIX = 'fix';
const ROLE_IMPLEMENTATION = 'implementation';
const FLAG_ROLE = '--role';
const FLAG_PACKAGE = '--package';
const FLAG_AGENT_NAME = '--agent-name';
const FLAG_AGENT_ID = '--agent-id';
const FLAG_HELP = '--help';
const EMPTY_TEXT = '';
const NEWLINE = '\n';
const PACKAGE_METADATA_OPEN = '<!-- work-package';
const PACKAGE_METADATA_CLOSE = '-->';
const METADATA_FIELD_TOUCHED_FILES = 'touchedFiles';
const METADATA_FIELD_WRITE_SCOPE = 'writeScope';
const METADATA_FIELD_HANDOFF_FILES = 'handoffFiles';
const METADATA_FIELD_CANDIDATE_RUNTIME_FILES = 'candidateRuntimeFiles';
const METADATA_FIELD_COMMIT_SCOPE = 'commitScope';
const MODEL_FIT_FIELD_OUTPUT_PROFILE = 'outputProfile';
const OUTPUT_PROFILE_SMALL = 'small';
const OUTPUT_PROFILE_MEDIUM = 'medium';
const OUTPUT_PROFILE_HIGH = 'high';
const OUTPUT_PROFILE_EXTRA_HIGH = 'extra-high';
const VALID_ROLES = Object.freeze([
  ROLE_REVIEW,
  ROLE_FIX,
  ROLE_IMPLEMENTATION,
]);
const OUTPUT_GUIDANCE_BY_PROFILE = Object.freeze({
  [OUTPUT_PROFILE_SMALL]:
    'Return only findings or changes, validation, and blockers.',
  [OUTPUT_PROFILE_MEDIUM]:
    'Keep the final response compact: summarize changes, validation, and blockers; avoid long background.',
  [OUTPUT_PROFILE_HIGH]:
    'Use more detail only for explicit audit, architecture, or retrospective findings.',
  [OUTPUT_PROFILE_EXTRA_HIGH]:
    'Reserve full audit-level narrative for packages that explicitly request it.',
});
const HELP_TEXT = [
  'Usage:',
  '  node scripts/work-subagent-prompt.js --role review|fix|implementation --package <package.md>',
  '',
  'Optional:',
  '  --agent-name <name> --agent-id <uuid>  Print the exact ledger line to record.',
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

function parseMetadata(content, filePath) {
  const openIndex = content.indexOf(PACKAGE_METADATA_OPEN);
  if (openIndex < NUM_ZERO) {
    throw new Error(`${filePath}: work-package metadata is required.`);
  }
  const closeIndex = content.indexOf(
    PACKAGE_METADATA_CLOSE,
    openIndex + PACKAGE_METADATA_OPEN.length,
  );
  if (closeIndex < NUM_ZERO) {
    throw new Error(`${filePath}: work-package metadata closing marker is missing.`);
  }
  return JSON.parse(
    content.slice(openIndex + PACKAGE_METADATA_OPEN.length, closeIndex).trim(),
  );
}

function list(values = [], fallback = 'None recorded.') {
  const normalized = Array.isArray(values) ?
    values.map(normalizeText).filter(Boolean) :
    [];
  if (normalized.length === NUM_ZERO) {
    return `- ${fallback}`;
  }
  return normalized.map((value) => `- \`${value}\``).join(NEWLINE);
}

function scopeList(metadata, fieldName, fallbackFieldName = null) {
  if (Array.isArray(metadata[fieldName])) {
    return metadata[fieldName];
  }
  return fallbackFieldName && Array.isArray(metadata[fallbackFieldName]) ?
    metadata[fallbackFieldName] :
    [];
}

function outputProfileForMetadata(metadata = {}) {
  const explicitProfile = normalizeText(
    metadata.modelFit?.[MODEL_FIT_FIELD_OUTPUT_PROFILE],
  );
  if (VALID_OUTPUT_PROFILES.includes(explicitProfile)) {
    return explicitProfile;
  }
  return defaultOutputProfileForLane(metadata.lane);
}

function outputGuidance(profile) {
  return OUTPUT_GUIDANCE_BY_PROFILE[profile] ||
    OUTPUT_GUIDANCE_BY_PROFILE[OUTPUT_PROFILE_MEDIUM];
}

function packageTitle(content) {
  const firstHeading = content
    .split(/\r?\n/u)
    .find((line) => line.startsWith('# '));
  return firstHeading ? firstHeading.slice(NUM_TWO).trim() : 'Work Package';
}

function roleTask(role, metadata, packagePath) {
  if (role === ROLE_REVIEW) {
    return [
      'Review the predecessor or most recently executed package named by this',
      'package. Focus on package proof, residual inventory, guardrail ledger,',
      'blocker migration notes, sprint snapshot consistency, and whether the',
      'stated next action still matches artifact evidence.',
    ].join(' ');
  }
  if (role === ROLE_FIX) {
    return [
      'Fix only the actionable findings from the review subagent. Keep the',
      'write scope to the reviewed package and directly related tracker proof.',
      'Do not implement the new package yet.',
    ].join(' ');
  }
  return [
    'Implement only this current package after review/fix proof is clean:',
    packagePath + '.',
    'Do not widen beyond the write scope, forbidden files, frozen decisions,',
    'and proof ladder recorded below.',
  ].join(' ');
}

function ledgerLine(role, packagePath, flags = {}) {
  const agentName = parseOptionValue(flags, FLAG_AGENT_NAME);
  const agentId = parseOptionValue(flags, FLAG_AGENT_ID);
  if (!agentName || !agentId) {
    return 'Add the real returned agent name and id after the subagent completes.';
  }
  if (role === ROLE_REVIEW) {
    return `Agent ${agentName} (${agentId}) reviewed ${packagePath}; result <clean|fixes-required>`;
  }
  if (role === ROLE_FIX) {
    return `Agent ${agentName} (${agentId}) fixed ${packagePath}`;
  }
  return `Agent ${agentName} (${agentId}) implemented ${packagePath}`;
}

function buildSubagentPrompt(role, packagePath, content, args = []) {
  const metadata = parseMetadata(content, packagePath);
  const outputProfile = outputProfileForMetadata(metadata);
  return [
    `# ${role} Subagent Prompt`,
    EMPTY_TEXT,
    'You are not alone in the codebase. Do not revert edits made by others;',
    'adjust your work to accommodate existing changes.',
    EMPTY_TEXT,
    `Package: \`${packagePath}\``,
    `Title: \`${packageTitle(content)}\``,
    `Lane: \`${metadata.lane || 'unknown'}\``,
    `Owner: \`${metadata.owner || 'unknown'}\``,
    `Boundary: \`${metadata.boundary || 'unknown'}\``,
    `Dominant reason: \`${metadata.dominantReason || 'unknown'}\``,
    `Predecessor: \`${metadata.predecessor || 'none'}\``,
    EMPTY_TEXT,
    '## Task',
    EMPTY_TEXT,
    roleTask(role, metadata, packagePath),
    EMPTY_TEXT,
    '## Current State',
    EMPTY_TEXT,
    metadata.currentState || 'Unknown.',
    EMPTY_TEXT,
    '## Next Action',
    EMPTY_TEXT,
    metadata.nextAction || 'Unknown.',
    EMPTY_TEXT,
    '## Output Budget',
    EMPTY_TEXT,
    `Profile: \`${outputProfile}\``,
    outputGuidance(outputProfile),
    'More output is not evidence; prefer canonical tool output and package proof over narrative volume.',
    EMPTY_TEXT,
    '## Tool-First Workflow',
    EMPTY_TEXT,
    'Use canonical workflow tools before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`:',
    EMPTY_TEXT,
    '- `npm run work:package:doctor -- --suggest <package>` or `npm run work:package:doctor -- --fix-dry-run <package>` before package metadata or ledger edits.',
    '- `npm run work:package:schema` and `npm run work:package:new -- ...` before inventing package enum values or new package shape.',
    '- `npm run work:evidence-summary -- <artifact>` plus focused scenario extractors before raw distributed report JSON or logs.',
    '- `npm run analyze:owner-files -- <owner> [boundary]` before broad owner file search.',
    '- `npm run work:oversized-next -- --markdown` before creating broad file-size cleanup packages.',
    EMPTY_TEXT,
    'If fallback to raw JSON, raw logs, or ad hoc `jq` is necessary, record which canonical extractor was tried and why it was insufficient.',
    EMPTY_TEXT,
    '## Write Scope',
    EMPTY_TEXT,
    list(scopeList(metadata, METADATA_FIELD_WRITE_SCOPE, METADATA_FIELD_TOUCHED_FILES)),
    EMPTY_TEXT,
    '## Handoff Files',
    EMPTY_TEXT,
    list(scopeList(metadata, METADATA_FIELD_HANDOFF_FILES)),
    EMPTY_TEXT,
    '## Candidate Runtime Files',
    EMPTY_TEXT,
    list(scopeList(metadata, METADATA_FIELD_CANDIDATE_RUNTIME_FILES)),
    EMPTY_TEXT,
    '## Commit Scope',
    EMPTY_TEXT,
    list(scopeList(metadata, METADATA_FIELD_COMMIT_SCOPE, METADATA_FIELD_TOUCHED_FILES)),
    EMPTY_TEXT,
    '## Proof Ladder',
    EMPTY_TEXT,
    list(metadata.proof),
    EMPTY_TEXT,
    '## Escalation Triggers',
    EMPTY_TEXT,
    list(metadata.modelFit?.escalationTriggers),
    EMPTY_TEXT,
    '## Ledger Line',
    EMPTY_TEXT,
    ledgerLine(role, packagePath, args),
    EMPTY_TEXT,
  ].join(NEWLINE);
}

async function runCli(args = process.argv.slice(NUM_TWO)) {
  if (args.includes(FLAG_HELP)) {
    return `${HELP_TEXT}${NEWLINE}`;
  }
  const role = parseOptionValue(args, FLAG_ROLE);
  const packagePath = parseOptionValue(args, FLAG_PACKAGE);
  if (!VALID_ROLES.includes(role)) {
    throw new Error(`--role must be one of ${VALID_ROLES.join(', ')}.`);
  }
  if (!packagePath) {
    throw new Error('--package is required.');
  }
  return `${buildSubagentPrompt(
    role,
    packagePath,
    await fs.readFile(packagePath, ENCODING_UTF8),
    args,
  )}${NEWLINE}`;
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
  buildSubagentPrompt,
  runCli,
};
