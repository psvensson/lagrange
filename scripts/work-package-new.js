#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {buildSummary, readLedgerEntries} from './model-ledger.js';
import {
  LANE_LIGHTWEIGHT_MAINTENANCE,
  SCOPE_FIELD_CANDIDATE_RUNTIME_FILES,
  SCOPE_FIELD_COMMIT_SCOPE,
  SCOPE_FIELD_GENERATED_FILES,
  SCOPE_FIELD_HANDOFF_FILES,
  SCOPE_FIELD_WRITE_SCOPE,
  VALID_PACKAGE_STATUSES,
  WORKFLOW_LANES,
  WORK_PACKAGE_METADATA_SCHEMA,
  defaultModelFitForLane,
  renderSchemaReference,
} from './work-package-schema.js';

const ENCODING_UTF8 = 'utf8';
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const NUM_ZERO = 0;
const NUM_ONE = 1;
const NUM_TWO = 2;
const DATE_SLICE_END = 10;
const JSON_INDENT_SPACES = 2;
const DEFAULT_STATUS = 'todo';
const DEFAULT_SCENARIO = 'none';
const DEFAULT_ARTIFACT = 'none';
const DEFAULT_PLAYBACK = 'none';
const DEFAULT_LEDGER_PATH = path.join('work', 'model-ledger.jsonl');
const WORK_PACKAGES_DIRECTORY = path.join('work', 'packages');
const FLAG_WRITE = 'write';
const FLAG_TITLE = 'title';
const FLAG_SLUG = 'slug';
const FLAG_LANE = 'lane';
const FLAG_STATUS = 'status';
const FLAG_OPENED = 'opened';
const FLAG_SCENARIO = 'scenario';
const FLAG_ARTIFACT = 'artifact';
const FLAG_PLAYBACK = 'playback';
const FLAG_OWNER = 'owner';
const FLAG_BOUNDARY = 'boundary';
const FLAG_DOMINANT_REASON = 'dominant-reason';
const FLAG_CURRENT_STATE = 'current-state';
const FLAG_NEXT_ACTION = 'next-action';
const FLAG_PROOF = 'proof';
const FLAG_TOUCHED_FILE = 'touched-file';
const FLAG_OWNED_FILE = 'owned-file';
const FLAG_WRITE_SCOPE = 'write-scope';
const FLAG_HANDOFF_FILE = 'handoff-file';
const FLAG_GENERATED_FILE = 'generated-file';
const FLAG_CANDIDATE_RUNTIME_FILE = 'candidate-runtime-file';
const FLAG_COMMIT_SCOPE = 'commit-scope';
const FLAG_FORBIDDEN_FILE = 'forbidden-file';
const FLAG_PREDECESSOR = 'predecessor';
const FLAG_PACKAGE_CLASS = 'package-class';
const FLAG_INTENDED_MINIMUM_MODEL = 'intended-minimum-model';
const FLAG_SCOPE_SHAPE = 'scope-shape';
const FLAG_LEDGER = 'ledger';
const FLAG_SCHEMA = 'schema';
const FLAG_HELP = 'help';
const EMPTY_TEXT = '';
const NEWLINE = '\n';
const FLAG_PREFIX = '--';
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const REQUIRED_FLAGS = Object.freeze([
  FLAG_TITLE,
  FLAG_SLUG,
  FLAG_OWNER,
  FLAG_BOUNDARY,
  FLAG_DOMINANT_REASON,
  FLAG_NEXT_ACTION,
]);
const REPEATED_FLAGS = Object.freeze([
  FLAG_PROOF,
  FLAG_TOUCHED_FILE,
  FLAG_OWNED_FILE,
  FLAG_WRITE_SCOPE,
  FLAG_HANDOFF_FILE,
  FLAG_GENERATED_FILE,
  FLAG_CANDIDATE_RUNTIME_FILE,
  FLAG_COMMIT_SCOPE,
  FLAG_FORBIDDEN_FILE,
]);
const HELP_TEXT = [
  'Usage:',
  '  node scripts/work-package-new.js --title <title> --slug <slug> --owner <owner> --boundary <boundary> --dominant-reason <reason> --next-action <action> [--lane <lane>] [--write]',
  '',
  'Repeated options:',
  '  --proof <command>',
  '  --write-scope <path>',
  '  --handoff-file <path>',
  '  --generated-file <path>',
  '  --candidate-runtime-file <path>',
  '  --commit-scope <path>',
  '  --touched-file <path>  Legacy alias for --write-scope',
  '  --owned-file <path>    Legacy alias for --write-scope and Model Fit',
  '  --forbidden-file <path>',
  '',
  'Use --schema to print the shared work-package schema reference.',
].join(NEWLINE);

function normalizeText(value) {
  return String(value || EMPTY_TEXT).trim();
}

function todayIsoDate() {
  return new Date().toISOString().slice(NUM_ZERO, DATE_SLICE_END);
}

function parseArgs(args = []) {
  const flags = {};
  for (let index = NUM_ZERO; index < args.length; index += NUM_ONE) {
    const rawArg = args[index];
    if (!rawArg.startsWith(FLAG_PREFIX)) {
      throw new Error(`Unexpected argument "${rawArg}".`);
    }
    const flagName = rawArg.slice(FLAG_PREFIX.length);
    if ([FLAG_WRITE, FLAG_SCHEMA, FLAG_HELP].includes(flagName)) {
      flags[flagName] = true;
      continue;
    }
    const value = args[index + NUM_ONE];
    if (value === undefined || value.startsWith(FLAG_PREFIX)) {
      throw new Error(`Missing value for ${rawArg}.`);
    }
    if (REPEATED_FLAGS.includes(flagName)) {
      flags[flagName] = [...(flags[flagName] || []), value];
    } else {
      flags[flagName] = value;
    }
    index += NUM_ONE;
  }
  return flags;
}

function validateFlags(flags = {}) {
  const missing = REQUIRED_FLAGS.filter((flagName) =>
    normalizeText(flags[flagName]).length === NUM_ZERO);
  if (missing.length > NUM_ZERO) {
    throw new Error(
      `Missing required flags: ${missing
        .map((flagName) => `${FLAG_PREFIX}${flagName}`)
        .join(', ')}.`,
    );
  }
  const lane = normalizeText(flags[FLAG_LANE]) || LANE_LIGHTWEIGHT_MAINTENANCE;
  if (!WORKFLOW_LANES.includes(lane)) {
    throw new Error(
      `--${FLAG_LANE} must be one of ${WORKFLOW_LANES.join(', ')}.`,
    );
  }
  const status = normalizeText(flags[FLAG_STATUS]) || DEFAULT_STATUS;
  if (!VALID_PACKAGE_STATUSES.includes(status)) {
    throw new Error(
      `--${FLAG_STATUS} must be one of ${VALID_PACKAGE_STATUSES.join(', ')}.`,
    );
  }
  const slug = normalizeText(flags[FLAG_SLUG]);
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error('--slug must use lowercase dash-separated words.');
  }
}

function markdownList(values = [], fallback) {
  const normalized = values.map(normalizeText).filter(Boolean);
  if (normalized.length === NUM_ZERO) {
    return `1. ${fallback}`;
  }
  return normalized.map((value, index) => `${index + NUM_ONE}. ${value}`).join(NEWLINE);
}

function markdownInlineCodeList(values = [], fallback) {
  const normalized = values.map(normalizeText).filter(Boolean);
  if (normalized.length === NUM_ZERO) {
    return fallback;
  }
  return normalized.map((value) => `\`${value}\``).join(', ');
}

function buildPackagePath(status, opened, slug) {
  const packageDate = opened.replaceAll('-', EMPTY_TEXT);
  return path.join(WORK_PACKAGES_DIRECTORY, `${status}-${packageDate}-${slug}.md`);
}

async function buildModelLedgerSummary(flags = {}) {
  const ledgerPath = normalizeText(flags[FLAG_LEDGER]) || DEFAULT_LEDGER_PATH;
  const entries = await readLedgerEntries(ledgerPath);
  return buildSummary(entries);
}

async function buildPackageContent(flags = {}) {
  const lane = normalizeText(flags[FLAG_LANE]) || LANE_LIGHTWEIGHT_MAINTENANCE;
  const modelLedgerSummary = await buildModelLedgerSummary(flags);
  const modelFitDefaults = defaultModelFitForLane(lane, modelLedgerSummary);
  const opened = normalizeText(flags[FLAG_OPENED]) || todayIsoDate();
  const status = normalizeText(flags[FLAG_STATUS]) || DEFAULT_STATUS;
  const proof = flags[FLAG_PROOF] || [];
  const legacyTouchedFiles = flags[FLAG_TOUCHED_FILE] || [];
  const writeScope = [
    ...(flags[FLAG_WRITE_SCOPE] || []),
    ...(flags[FLAG_OWNED_FILE] || []),
    ...legacyTouchedFiles,
  ];
  const handoffFiles = flags[FLAG_HANDOFF_FILE] || [];
  const generatedFiles = flags[FLAG_GENERATED_FILE] || [];
  const candidateRuntimeFiles = flags[FLAG_CANDIDATE_RUNTIME_FILE] || [];
  const commitScope = flags[FLAG_COMMIT_SCOPE] || [
    ...writeScope,
    ...generatedFiles,
  ];
  const ownedFiles = writeScope;
  const forbiddenFiles = flags[FLAG_FORBIDDEN_FILE] || [];
  const metadata = {
    schema: WORK_PACKAGE_METADATA_SCHEMA,
    status,
    opened,
    lane,
    scenario: normalizeText(flags[FLAG_SCENARIO]) || DEFAULT_SCENARIO,
    artifact: normalizeText(flags[FLAG_ARTIFACT]) || DEFAULT_ARTIFACT,
    playback: normalizeText(flags[FLAG_PLAYBACK]) || DEFAULT_PLAYBACK,
    owner: normalizeText(flags[FLAG_OWNER]),
    boundary: normalizeText(flags[FLAG_BOUNDARY]),
    dominantReason: normalizeText(flags[FLAG_DOMINANT_REASON]),
    currentState:
      normalizeText(flags[FLAG_CURRENT_STATE]) ||
      'New package scaffolded from the shared work-package schema.',
    nextAction: normalizeText(flags[FLAG_NEXT_ACTION]),
    proof,
    [SCOPE_FIELD_WRITE_SCOPE]: writeScope,
    [SCOPE_FIELD_HANDOFF_FILES]: handoffFiles,
    [SCOPE_FIELD_GENERATED_FILES]: generatedFiles,
    [SCOPE_FIELD_CANDIDATE_RUNTIME_FILES]: candidateRuntimeFiles,
    [SCOPE_FIELD_COMMIT_SCOPE]: commitScope,
    modelFit: {
      packageClass:
        normalizeText(flags[FLAG_PACKAGE_CLASS]) ||
        modelFitDefaults.packageClass,
      intendedMinimumModel:
        normalizeText(flags[FLAG_INTENDED_MINIMUM_MODEL]) ||
        modelFitDefaults.intendedMinimumModel,
      scopeShape:
        normalizeText(flags[FLAG_SCOPE_SHAPE]) ||
        modelFitDefaults.scopeShape,
      escalationTriggers: [
        'owned files expand beyond this package',
        'a frozen decision must be reopened',
      ],
    },
  };
  const predecessor = normalizeText(flags[FLAG_PREDECESSOR]);
  if (predecessor) {
    metadata.predecessor = predecessor;
  }

  return [
    `# ${normalizeText(flags[FLAG_TITLE])}`,
    EMPTY_TEXT,
    '<!-- work-package',
    JSON.stringify(metadata, null, JSON_INDENT_SPACES),
    '-->',
    EMPTY_TEXT,
    '## Why',
    EMPTY_TEXT,
    'State the focused concern and why this package owns it.',
    EMPTY_TEXT,
    '## Scope Basis',
    EMPTY_TEXT,
    'Approved maintenance scope or roadmap row.',
    EMPTY_TEXT,
    '## Workflow Lane',
    EMPTY_TEXT,
    `- Selected lane: \`${lane}\``,
    '- Why this lane is sufficient: bounded workflow/tooling scope unless changed.',
    '- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.',
    EMPTY_TEXT,
    '## LLM Tool-First Contract',
    EMPTY_TEXT,
    'Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:',
    EMPTY_TEXT,
    '1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.',
    '2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.',
    '3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.',
    '4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.',
    '5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.',
    EMPTY_TEXT,
    'If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.',
    EMPTY_TEXT,
    '## In Scope',
    EMPTY_TEXT,
    markdownList(ownedFiles, 'Focused package-owned edit.'),
    EMPTY_TEXT,
    '## Out Of Scope',
    EMPTY_TEXT,
    markdownList(forbiddenFiles, 'Runtime ownership changes.'),
    EMPTY_TEXT,
    '## Model Fit',
    EMPTY_TEXT,
    `- Package class: \`${metadata.modelFit.packageClass}\``,
    `- Intended minimum model: \`${metadata.modelFit.intendedMinimumModel}\``,
    `- Scope shape: \`${metadata.modelFit.scopeShape}\``,
    `- Owned files: ${markdownInlineCodeList(ownedFiles, '`work/packages/<this-package>.md`')}`,
    `- Forbidden files: ${markdownInlineCodeList(forbiddenFiles, '`src/`')}`,
    '- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.',
    '- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.',
    `- Focused proof: ${markdownInlineCodeList(proof, '`git diff --check`')}`,
    `- Model ledger advisory: \`${modelFitDefaults.ledgerRecommendation}\``,
    EMPTY_TEXT,
    '## Validation',
    EMPTY_TEXT,
    markdownList(proof, '`git diff --check -- <files>`'),
    EMPTY_TEXT,
  ].join(NEWLINE);
}

async function runCli(args = process.argv.slice(NUM_TWO)) {
  const flags = parseArgs(args);
  if (flags[FLAG_HELP]) {
    return `${HELP_TEXT}${NEWLINE}`;
  }
  if (flags[FLAG_SCHEMA]) {
    return renderSchemaReference();
  }
  validateFlags(flags);
  const opened = normalizeText(flags[FLAG_OPENED]) || todayIsoDate();
  const status = normalizeText(flags[FLAG_STATUS]) || DEFAULT_STATUS;
  const packagePath = buildPackagePath(status, opened, normalizeText(flags[FLAG_SLUG]));
  const content = await buildPackageContent(flags);
  if (flags[FLAG_WRITE]) {
    await fs.mkdir(path.dirname(packagePath), {recursive: true});
    try {
      await fs.writeFile(packagePath, `${content}${NEWLINE}`, {
        encoding: ENCODING_UTF8,
        flag: 'wx',
      });
    } catch (error) {
      if (error.code === 'EEXIST') {
        throw new Error(`${packagePath} already exists.`);
      }
      throw error;
    }
    return `Created ${packagePath}.${NEWLINE}`;
  }
  return [
    `Path: ${packagePath}`,
    EMPTY_TEXT,
    content,
    EMPTY_TEXT,
  ].join(NEWLINE);
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
  buildPackageContent,
  parseArgs,
  runCli,
};
