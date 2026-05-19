#!/usr/bin/env node

import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {
  FILE_SIZE_SCOPE,
  buildFileSizeEntries,
  buildOwnerBoundaryGuidanceEntries,
} from './check-file-size-thresholds.js';

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const NUM_ZERO = 0;
const NUM_ONE = 1;
const NUM_TWO = 2;
const DEFAULT_TOP = 8;
const FLAG_TOP = '--top';
const FLAG_MARKDOWN = '--markdown';
const FLAG_HELP = '--help';
const EMPTY_TEXT = '';
const NEWLINE = '\n';
const JSON_INDENT_SPACES = 2;
const SCHEMA_VERSION = 'oversized-file-extraction-candidates-v1';
const SEMANTIC_HELPER_PLACEHOLDER = 'semantic-helper-concern';
const SEMANTIC_PACKAGE_TITLE_PLACEHOLDER =
  'Extract semantic owner-boundary helper';
const SEMANTIC_NAMING_RULE =
  'Replace semantic-helper-concern with the real owner concern; name new helper and package files for the semantic concern they own; do not use digit characters; do not derive new filenames from segment, stage, part, or batch ordinals.';
const HELP_TEXT = [
  'Usage:',
  '  node scripts/work-oversized-next.js [--top <count>] [--markdown]',
  '',
  'Prints package-ready extraction candidates for oversized owner-boundary files.',
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

function parseTop(args = []) {
  const parsed = Number.parseInt(parseOptionValue(args, FLAG_TOP), 10);
  return Number.isInteger(parsed) && parsed > NUM_ZERO ? parsed : DEFAULT_TOP;
}

function buildCandidate(entry) {
  const slug = `extract-${SEMANTIC_HELPER_PLACEHOLDER}`;
  return {
    path: entry.path,
    lines: entry.lines,
    threshold: entry.threshold,
    scope: entry.scope,
    slug,
    semanticNamingRule: SEMANTIC_NAMING_RULE,
    packageCommand: [
      'npm run work:package:new --',
      '--lane lightweight-maintenance',
      '--title',
      JSON.stringify(`${SEMANTIC_PACKAGE_TITLE_PLACEHOLDER} from ${entry.path}`),
      '--slug',
      slug,
      '--owner workflow_tooling_owner',
      '--boundary file_size_extraction',
      '--dominant-reason oversized_file_ratchet',
      '--next-action',
      JSON.stringify(
        'Extract one semantically named owner/boundary helper without changing runtime behavior.',
      ),
      '--write-scope',
      entry.path,
      '--proof',
      JSON.stringify(`npm run audit:owner-boundary-segments -- ${entry.path}`),
    ].join(' '),
  };
}

async function buildOversizedNext(top = DEFAULT_TOP) {
  const sourceEntries = await buildFileSizeEntries(FILE_SIZE_SCOPE.SOURCE, 'src');
  const testEntries = await buildFileSizeEntries(FILE_SIZE_SCOPE.TEST, 'test');
  const guidanceEntries = buildOwnerBoundaryGuidanceEntries([
    ...sourceEntries,
    ...testEntries,
  ]);
  return {
    schemaVersion: SCHEMA_VERSION,
    sourceOversizedCount: sourceEntries.length,
    testOversizedCount: testEntries.length,
    candidateCount: guidanceEntries.length,
    candidates: guidanceEntries
      .slice(NUM_ZERO, top)
      .map(buildCandidate),
  };
}

function renderMarkdown(summary) {
  const lines = [
    '# Oversized File Extraction Candidates',
    EMPTY_TEXT,
    `- Source oversized files: \`${summary.sourceOversizedCount}\``,
    `- Test oversized files: \`${summary.testOversizedCount}\``,
    `- Owner-boundary segment candidates: \`${summary.candidateCount}\``,
    EMPTY_TEXT,
    '## Candidates',
    EMPTY_TEXT,
  ];
  if (summary.candidates.length === NUM_ZERO) {
    lines.push('- No owner-boundary segment candidates found.');
    return lines.join(NEWLINE);
  }
  for (const candidate of summary.candidates) {
    lines.push(
      `- \`${candidate.path}\` ${candidate.lines}/${candidate.threshold}: ` +
      `${candidate.semanticNamingRule} Command template: ` +
      `\`${candidate.packageCommand}\``,
    );
  }
  return lines.join(NEWLINE);
}

async function runCli(args = process.argv.slice(NUM_TWO)) {
  if (args.includes(FLAG_HELP)) {
    return `${HELP_TEXT}${NEWLINE}`;
  }
  const summary = await buildOversizedNext(parseTop(args));
  return args.includes(FLAG_MARKDOWN) ?
    `${renderMarkdown(summary)}${NEWLINE}` :
    `${JSON.stringify(summary, null, JSON_INDENT_SPACES)}${NEWLINE}`;
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
  buildCandidate,
  buildOversizedNext,
  renderMarkdown,
  runCli,
};
