#!/usr/bin/env node

import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {validateSubagentSequencingLedger} from './work-tracker.js';

const execFileAsync = promisify(execFile);

const ENCODING_UTF8 = 'utf8';
const EXIT_FAILURE = 1;
const EXIT_SUCCESS = 0;
const NUM_ZERO = 0;
const NUM_ONE = 1;
const NUM_TWO = 2;
const NUM_THREE = 3;
const MAX_GIT_STATUS_LINES = 30;
const PROCESS_ARG_SCRIPT_INDEX = 1;
const CLI_FLAG_DIRTY_SCOPE = '--dirty-scope';
const CLI_FLAG_PACKAGE = '--package';
const CURRENT_BLOCKER_JSON_PATH = path.join(
  'work',
  'sprints',
  'current-blocker.json',
);
const AGENTS_PATH = 'AGENTS.md';
const LLM_STEERING_DIRECTORY = path.join('.kiro', 'steering', 'llm');
const LLM_STEERING_README_PATH = path.join(LLM_STEERING_DIRECTORY, 'README.md');
const LLM_STEERING_CORE_PATH = path.join(LLM_STEERING_DIRECTORY, 'core.md');
const LLM_STEERING_ARCHITECTURE_PATH = path.join(
  LLM_STEERING_DIRECTORY,
  'architecture.md',
);
const LLM_STEERING_TESTING_PATH = path.join(LLM_STEERING_DIRECTORY, 'testing.md');
const LLM_STEERING_STYLE_PATH = path.join(LLM_STEERING_DIRECTORY, 'style.md');
const LLM_STEERING_GOVERNANCE_PATH = path.join(
  LLM_STEERING_DIRECTORY,
  'governance.md',
);
const COMPACT_STEERING_BASE_PATHS = Object.freeze([
  LLM_STEERING_README_PATH,
  LLM_STEERING_CORE_PATH,
]);
const WORK_README_PATH = path.join('work', 'README.md');
const GIT_COMMAND = 'git';
const GIT_STATUS_ARGS = Object.freeze(['status', '--short']);
const NPM_RUN_WORK_CURRENT_BLOCKER_COMMAND = 'npm run work:current-blocker';
const NPM_RUN_WORK_VALIDATE_COMMAND = 'npm run work:validate';
const NPM_RUN_WORK_PACKAGE_DOCTOR_COMMAND = 'npm run work:package:doctor --';
const NPM_RUN_WORK_EVIDENCE_SUMMARY_COMMAND = 'npm run work:evidence-summary --';
const ANALYZE_DISTRIBUTED_FAILURE_COMMAND =
  'npm run analyze:distributed-failure -- --report';
const ANALYZE_TOPOLOGY_CONVERGENCE_COMMAND =
  'npm run analyze:topology-convergence --';
const ANALYZE_CAUSAL_MODEL_COMMAND =
  'npm --silent run analyze:causal-model --';
const SUMMARIZE_HARNESS_COMMAND =
  'npm run summarize:harness -- --report-dir test-output/reports';
const CHECK_LITERAL_COMMAND = 'node scripts/check-guideline-literals.js';
const CHECK_DECISION_BOUNDARY_COMMAND =
  'node scripts/check-guideline-decision-boundaries.js';
const CHECK_RUNTIME_GRAMMAR_FILE_COMMAND =
  'npm run audit:runtime-grammar:file --';
const GIT_DIFF_CHECK_COMMAND = 'git diff --check --';
const SOURCE_DIRECTORY_PREFIX = 'src/';
const TEST_DIRECTORY_PREFIX = 'test/';
const SCRIPT_DIRECTORY_PREFIX = 'scripts/';
const WORK_DIRECTORY_PREFIX = 'work/';
const JAVASCRIPT_EXTENSION = '.js';
const README_FILE_NAME = 'README.md';
const PLAYBACK_FAILURE_BUNDLE_FILE = 'failure-bundle.json';
const MARKDOWN_HEADING_PREFIX = '# ';
const SECTION_HEADING_PREFIX = '## ';
const CHECKBOX_OPEN_PREFIX = '- [ ]';
const CHECKBOX_ANY_PREFIX = '- [';
const PACKAGE_METADATA_OPEN = '<!-- work-package';
const PACKAGE_METADATA_CLOSE = '-->';
const MARKDOWN_LIST_PREFIX = '- ';
const NUMBERED_LIST_PATTERN = /^\d+\.\s+/u;
const LABEL_SEPARATOR = ': ';
const EMPTY_STRING = '';
const SPACE = ' ';
const NEWLINE = '\n';
const PATH_PRESENT = 'present';
const PATH_MISSING = 'missing';
const PATH_PATTERN = 'pattern';
const PATH_NONE = 'none';
const OPTIONAL_TEXT_PRESENT = 'optional-text-present';
const OPTIONAL_TEXT_MISSING = 'optional-text-missing';
const GIT_STATUS_AVAILABLE = 'git-status-available';
const GIT_STATUS_UNAVAILABLE_STATE = 'git-status-unavailable';
const GIT_GROUP_PACKAGE_OWNED = 'packageOwned';
const GIT_GROUP_TRACKER_GENERATED = 'trackerGenerated';
const GIT_GROUP_UNRELATED = 'unrelated';
const DEFAULT_UNKNOWN = 'unknown';
const OUTPUT_TITLE = '# Work Context';
const DIRTY_SCOPE_OUTPUT_TITLE = '# Worktree Package Scope';
const SECTION_CURRENT_BLOCKER = 'Current Blocker';
const SECTION_CURRENT_STATE = 'Current State';
const SECTION_NEXT_ACTION = 'Next Action';
const SECTION_FIRST_FILES = 'First Files To Read';
const SECTION_TOUCHED_FILES = 'Touched Files';
const SECTION_PROOF_LADDER = 'Proof Ladder';
const SECTION_SUBAGENT_SEQUENCING = 'Subagent Sequencing';
const SECTION_MODEL_FIT = 'Model Fit';
const SECTION_CAUSAL_GOVERNANCE = 'Causal Governance';
const SECTION_OPEN_CHECKLIST = 'Open Package Checklist';
const SECTION_OUT_OF_SCOPE = 'Out Of Scope';
const SECTION_USEFUL_COMMANDS = 'Useful Commands';
const SECTION_WORKTREE = 'Worktree Summary';
const PACKAGE_SECTION_OUT_OF_SCOPE = 'Out Of Scope';
const PACKAGE_SECTION_SUBAGENT_LEDGER = 'Subagent Sequencing Ledger';
const PACKAGE_SECTION_MODEL_FIT = 'Model Fit';
const MESSAGE_CURRENT_BLOCKER_MISSING =
  'No current blocker handoff was found.';
const MESSAGE_CURRENT_BLOCKER_HINT =
  `Run \`${NPM_RUN_WORK_CURRENT_BLOCKER_COMMAND}\` first.`;
const MESSAGE_NO_OPEN_CHECKLIST = 'No open checklist items found in package.';
const MESSAGE_NO_OUT_OF_SCOPE = 'No Out Of Scope section found in package.';
const MESSAGE_NO_GIT_STATUS = 'No dirty git status entries.';
const MESSAGE_GIT_STATUS_UNAVAILABLE = 'Git status unavailable.';
const SUBAGENT_LEDGER_REVIEW_LABEL = 'Review subagent recorded';
const SUBAGENT_LEDGER_FIX_LABEL =
  'Fix subagent recorded or explicitly not needed';
const SUBAGENT_LEDGER_IMPLEMENTATION_LABEL = 'Implementation subagent recorded';
const SUBAGENT_ROLE_REVIEW = 'review';
const SUBAGENT_ROLE_FIX = 'fix';
const SUBAGENT_ROLE_IMPLEMENTATION = 'implementation';
const SUBAGENT_ROLE_NONE = 'none';
const SUBAGENT_STATUS_LEDGER_MISSING =
  'Subagent Sequencing Ledger missing; assign a real review subagent before implementation.';
const SUBAGENT_STATUS_REVIEW_MISSING =
  'Review proof missing; assign a real review subagent before implementation.';
const SUBAGENT_STATUS_FIX_REQUIRED =
  'Review found fixes-required; assign a separate real fix subagent before implementation.';
const SUBAGENT_STATUS_FIX_NOT_NEEDED_MISSING =
  'Review is clean; record fix as not-needed before implementation.';
const SUBAGENT_STATUS_FIX_MISSING =
  'Fix proof missing; assign or record the required fix subagent before implementation.';
const SUBAGENT_STATUS_IMPLEMENTATION_MISSING =
  'Review/fix proof recorded; assign a separate real implementation subagent before implementation.';
const SUBAGENT_STATUS_IMPLEMENTATION_RECORDED =
  'Review, fix, and implementation proof recorded.';
const SUBAGENT_STATUS_STRICT_VALIDATION_FAILED =
  'Subagent Sequencing Ledger strict validation failed; repair the recorded proof before implementation.';
const SUBAGENT_REVIEW_RESULT_CLEAN = 'clean';
const SUBAGENT_REVIEW_RESULT_FIXES_REQUIRED = 'fixes-required';
const SUBAGENT_FIX_NOT_NEEDED = 'not-needed';
const SUBAGENT_REVIEW_NOT_NEEDED_REASON_FIRST_PACKAGE =
  'first-package-in-sprint';
const SUBAGENT_REVIEW_RESULT_PATTERN =
  /result\s+`?(clean|fixes-required)`?/iu;
const SUBAGENT_AGENT_ID_PATTERN =
  /\(`?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`?\)/iu;
const SUBAGENT_NON_REAL_IDENTITY_PATTERN =
  /\b(?:current-session|current session|parent\s+codex|manual|local|session)\b/iu;
const SUBAGENT_SEQUENCE_ORDER_ERROR_PATTERN = /entries must appear/iu;
const SUBAGENT_FIX_ERROR_PATTERN =
  /fix (?:entry|package|agent)|not-needed/iu;
const SUBAGENT_IMPLEMENTATION_ERROR_PATTERN = /implementation/iu;
const LEDGER_VALIDATION_REQUIRES_LEDGER = 'requiresLedger';
const LEDGER_VALIDATION_REQUIRES_STRICT_ENTRIES = 'requiresStrictEntries';
const FIELD_LABELS = Object.freeze({
  ARTIFACT: 'Artifact',
  BOUNDARY: 'Boundary',
  DIRTY_ENTRIES: 'Dirty entries',
  DOMINANT_REASON: 'Dominant reason',
  ESCALATION_TRIGGERS: 'Escalation triggers',
  EXPECTED_CAUSAL_MODEL_CHANGE: 'Expected causal-model change',
  INTENDED_MINIMUM_MODEL: 'Intended minimum model',
  CAUSAL_DEBT: 'Causal debt',
  CAUSAL_HYPOTHESIS: 'Causal hypothesis',
  CROSS_BOUNDARY_REVIEW: 'Cross-boundary review',
  MODEL_FIT_PACKAGE_CLASS: 'Package class',
  OWNER: 'Owner',
  PACKAGE: 'Package',
  PACKAGE_TITLE: 'Package title',
  PLAYBACK: 'Playback',
  PREDECESSOR: 'Predecessor',
  SCENARIO: 'Scenario',
  SCOPE_SHAPE: 'Scope shape',
  SPRINT: 'Sprint',
  STATUS: 'Status',
  STOP_CONDITION_CHECK: 'Stop-condition check',
  SUBAGENT_ROLE: 'Next required subagent role',
  SUBAGENT_STATUS: 'Subagent sequencing status',
  REPRESENTATIVE_OUTCOME: 'Representative outcome',
});
const GIT_GROUP_LABELS = Object.freeze({
  [GIT_GROUP_PACKAGE_OWNED]: 'Package-owned dirty entries',
  [GIT_GROUP_TRACKER_GENERATED]: 'Tracker-generated dirty entries',
  [GIT_GROUP_UNRELATED]: 'Unrelated dirty entries',
});
const GIT_GROUP_EMPTY_MESSAGES = Object.freeze({
  [GIT_GROUP_PACKAGE_OWNED]: 'No package-owned dirty entries.',
  [GIT_GROUP_TRACKER_GENERATED]: 'No tracker-generated dirty entries.',
  [GIT_GROUP_UNRELATED]: 'No unrelated dirty entries.',
});
const TRACKER_GENERATED_PATHS = Object.freeze([
  path.join('work', 'sprints', 'current-blocker.json'),
  path.join('work', 'sprints', 'current-blocker.md'),
]);
const SHELL_SAFE_PATTERN = /^[A-Za-z0-9_./:@%+=,-]+$/u;
const SINGLE_QUOTE = '\'';
const SINGLE_QUOTE_ESCAPE = '\'\\\'\'';
const GIT_RENAME_SEPARATOR = ' -> ';
const DOUBLE_QUOTE = '"';
const FORWARD_SLASH = '/';
const REGEXP_ESCAPE_REPLACEMENT = '\\$&';
const GLOB_ANY_PATH_SEGMENT = '*';
const GLOB_SINGLE_CHARACTER = '?';
const GLOB_PATTERN_MARKERS = Object.freeze([
  GLOB_ANY_PATH_SEGMENT,
  GLOB_SINGLE_CHARACTER,
  '[',
  ']',
  '{',
  '}',
]);
const METADATA_FIELD_STATUS = 'status';
const METADATA_FIELD_SCENARIO = 'scenario';
const METADATA_FIELD_ARTIFACT = 'artifact';
const METADATA_FIELD_PLAYBACK = 'playback';
const METADATA_FIELD_OWNER = 'owner';
const METADATA_FIELD_BOUNDARY = 'boundary';
const METADATA_FIELD_DOMINANT_REASON = 'dominantReason';
const METADATA_FIELD_CURRENT_STATE = 'currentState';
const METADATA_FIELD_NEXT_ACTION = 'nextAction';
const METADATA_FIELD_PROOF = 'proof';
const METADATA_FIELD_TOUCHED_FILES = 'touchedFiles';
const METADATA_FIELD_PREDECESSOR = 'predecessor';
const METADATA_FIELD_MODEL_FIT = 'modelFit';
const METADATA_FIELD_CAUSAL_GOVERNANCE = 'causalGovernance';
const MODEL_FIT_FIELD_PACKAGE_CLASS = 'packageClass';
const MODEL_FIT_FIELD_INTENDED_MINIMUM_MODEL = 'intendedMinimumModel';
const MODEL_FIT_FIELD_SCOPE_SHAPE = 'scopeShape';
const MODEL_FIT_FIELD_ESCALATION_TRIGGERS = 'escalationTriggers';
const MODEL_FIT_LABEL_PACKAGE_CLASS = 'Package class';
const MODEL_FIT_LABEL_INTENDED_MINIMUM_MODEL = 'Intended minimum model';
const MODEL_FIT_LABEL_SCOPE_SHAPE = 'Scope shape';
const MODEL_FIT_LABEL_ESCALATION_TRIGGERS = 'Escalation triggers';
const CAUSAL_GOVERNANCE_FIELD_HYPOTHESIS = 'hypothesis';
const CAUSAL_GOVERNANCE_FIELD_STOP_CONDITION_CHECK = 'stopConditionCheck';
const CAUSAL_GOVERNANCE_FIELD_EXPECTED_CAUSAL_MODEL_CHANGE =
  'expectedCausalModelChange';
const CAUSAL_GOVERNANCE_FIELD_REPRESENTATIVE_OUTCOME =
  'representativeOutcome';
const CAUSAL_GOVERNANCE_FIELD_CAUSAL_DEBT = 'causalDebt';
const CAUSAL_GOVERNANCE_FIELD_CROSS_BOUNDARY_REVIEW = 'crossBoundaryReview';

function appendSection(lines, title) {
  lines.push(EMPTY_STRING, `${SECTION_HEADING_PREFIX}${title}`);
}

function normalizeString(value) {
  return String(value || EMPTY_STRING).trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, REGEXP_ESCAPE_REPLACEMENT);
}

function normalizeStringList(values = []) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map(normalizeString)
        .filter((value) => value.length > NUM_ZERO),
    ),
  ];
}

function appendKeyValue(lines, label, value) {
  const normalizedValue = normalizeString(value) || DEFAULT_UNKNOWN;
  lines.push(`${MARKDOWN_LIST_PREFIX}${label}${LABEL_SEPARATOR}${normalizedValue}`);
}

function appendList(lines, values, fallback) {
  const normalizedValues = normalizeStringList(values);
  if (normalizedValues.length === NUM_ZERO) {
    lines.push(`${MARKDOWN_LIST_PREFIX}${fallback}`);
    return;
  }
  for (const value of normalizedValues) {
    lines.push(`${MARKDOWN_LIST_PREFIX}${value}`);
  }
}

function shellQuote(value) {
  const normalizedValue = normalizeString(value);
  if (SHELL_SAFE_PATTERN.test(normalizedValue)) {
    return normalizedValue;
  }
  return SINGLE_QUOTE +
    normalizedValue.replaceAll(SINGLE_QUOTE, SINGLE_QUOTE_ESCAPE) +
    SINGLE_QUOTE;
}

function commandWithPaths(command, paths = []) {
  const normalizedPaths = normalizeStringList(paths);
  if (normalizedPaths.length === NUM_ZERO) {
    return command;
  }
  return [
    command,
    ...normalizedPaths.map(shellQuote),
  ].join(SPACE);
}

function parseOptionValue(args, optionName) {
  const optionIndex = args.indexOf(optionName);
  if (optionIndex < NUM_ZERO) {
    return EMPTY_STRING;
  }
  return normalizeString(args[optionIndex + NUM_ONE]);
}

async function readTextFile(filePath) {
  return fs.readFile(filePath, ENCODING_UTF8);
}

async function readJsonFile(filePath) {
  const content = await readTextFile(filePath);
  return JSON.parse(content);
}

async function readOptionalTextFile(filePath) {
  try {
    return {
      content: await readTextFile(filePath),
      status: OPTIONAL_TEXT_PRESENT,
    };
  } catch (_error) {
    return {
      content: EMPTY_STRING,
      status: OPTIONAL_TEXT_MISSING,
    };
  }
}

function parsePackageMetadata(content, filePath) {
  const openIndex = content.indexOf(PACKAGE_METADATA_OPEN);
  if (openIndex < NUM_ZERO) {
    throw new Error(`${filePath}: work-package metadata is required.`);
  }
  const jsonStart = openIndex + PACKAGE_METADATA_OPEN.length;
  const closeIndex = content.indexOf(PACKAGE_METADATA_CLOSE, jsonStart);
  if (closeIndex < NUM_ZERO) {
    throw new Error(`${filePath}: work-package metadata closing marker is missing.`);
  }
  return JSON.parse(content.slice(jsonStart, closeIndex).trim());
}

async function buildCurrentBlockerFromPackage(packagePath) {
  const content = await readTextFile(packagePath);
  const metadata = parsePackageMetadata(content, packagePath);
  return {
    currentBlocker: {
      sprint: DEFAULT_UNKNOWN,
      package: packagePath,
      status: metadataText(metadata, METADATA_FIELD_STATUS),
      scenario: metadataText(metadata, METADATA_FIELD_SCENARIO),
      artifact: metadataText(metadata, METADATA_FIELD_ARTIFACT),
      playback: metadataText(metadata, METADATA_FIELD_PLAYBACK),
      owner: metadataText(metadata, METADATA_FIELD_OWNER),
      boundary: metadataText(metadata, METADATA_FIELD_BOUNDARY),
      dominantReason: metadataText(metadata, METADATA_FIELD_DOMINANT_REASON),
      currentState: metadataText(metadata, METADATA_FIELD_CURRENT_STATE),
      nextAction: metadataText(metadata, METADATA_FIELD_NEXT_ACTION),
      proof: metadataList(metadata, METADATA_FIELD_PROOF),
      touchedFiles: metadataList(metadata, METADATA_FIELD_TOUCHED_FILES),
      modelFit: metadataModelFit(metadata),
      causalGovernance: metadataCausalGovernance(metadata),
      predecessor: metadataText(metadata, METADATA_FIELD_PREDECESSOR),
    },
    packageContent: content,
  };
}

function metadataText(metadata, fieldName) {
  return normalizeString(metadata[fieldName]) || DEFAULT_UNKNOWN;
}

function metadataList(metadata, fieldName) {
  return Array.isArray(metadata[fieldName]) ? metadata[fieldName] : [];
}

function metadataObject(metadata, fieldName) {
  const value = metadata[fieldName];
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function metadataModelFit(metadata) {
  const modelFit = metadataObject(metadata, METADATA_FIELD_MODEL_FIT);
  return {
    [MODEL_FIT_FIELD_PACKAGE_CLASS]:
      metadataText(modelFit, MODEL_FIT_FIELD_PACKAGE_CLASS),
    [MODEL_FIT_FIELD_INTENDED_MINIMUM_MODEL]:
      metadataText(modelFit, MODEL_FIT_FIELD_INTENDED_MINIMUM_MODEL),
    [MODEL_FIT_FIELD_SCOPE_SHAPE]:
      metadataText(modelFit, MODEL_FIT_FIELD_SCOPE_SHAPE),
    [MODEL_FIT_FIELD_ESCALATION_TRIGGERS]:
      metadataList(modelFit, MODEL_FIT_FIELD_ESCALATION_TRIGGERS),
  };
}

function metadataCausalGovernance(metadata) {
  const causalGovernance = metadataObject(
    metadata,
    METADATA_FIELD_CAUSAL_GOVERNANCE,
  );
  return {
    [CAUSAL_GOVERNANCE_FIELD_HYPOTHESIS]:
      metadataText(causalGovernance, CAUSAL_GOVERNANCE_FIELD_HYPOTHESIS),
    [CAUSAL_GOVERNANCE_FIELD_STOP_CONDITION_CHECK]:
      metadataText(
        causalGovernance,
        CAUSAL_GOVERNANCE_FIELD_STOP_CONDITION_CHECK,
      ),
    [CAUSAL_GOVERNANCE_FIELD_EXPECTED_CAUSAL_MODEL_CHANGE]:
      metadataText(
        causalGovernance,
        CAUSAL_GOVERNANCE_FIELD_EXPECTED_CAUSAL_MODEL_CHANGE,
      ),
    [CAUSAL_GOVERNANCE_FIELD_REPRESENTATIVE_OUTCOME]:
      metadataText(
        causalGovernance,
        CAUSAL_GOVERNANCE_FIELD_REPRESENTATIVE_OUTCOME,
      ),
    [CAUSAL_GOVERNANCE_FIELD_CAUSAL_DEBT]:
      metadataText(causalGovernance, CAUSAL_GOVERNANCE_FIELD_CAUSAL_DEBT),
    [CAUSAL_GOVERNANCE_FIELD_CROSS_BOUNDARY_REVIEW]:
      metadataText(
        causalGovernance,
        CAUSAL_GOVERNANCE_FIELD_CROSS_BOUNDARY_REVIEW,
      ),
  };
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (_error) {
    return false;
  }
}

function extractMarkdownTitle(content = EMPTY_STRING) {
  const titleLine = content
    .split(NEWLINE)
    .find((line) => line.startsWith(MARKDOWN_HEADING_PREFIX));
  return titleLine ?
    titleLine.slice(MARKDOWN_HEADING_PREFIX.length).trim() :
    DEFAULT_UNKNOWN;
}

function appendOpenChecklistItem(items, itemParts) {
  const item = normalizeString(itemParts.join(SPACE));
  itemParts.length = NUM_ZERO;
  if (item.length > NUM_ZERO) {
    items.push(item);
  }
}

function extractOpenChecklist(content = EMPTY_STRING) {
  const items = [];
  const currentItemParts = [];

  for (const rawLine of content.split(NEWLINE)) {
    const line = rawLine.trim();
    if (line.startsWith(CHECKBOX_OPEN_PREFIX)) {
      appendOpenChecklistItem(items, currentItemParts);
      currentItemParts.push(line.slice(CHECKBOX_OPEN_PREFIX.length).trim());
      continue;
    }
    if (
      line.length === NUM_ZERO ||
      line.startsWith(CHECKBOX_ANY_PREFIX) ||
      line.startsWith(SECTION_HEADING_PREFIX)
    ) {
      appendOpenChecklistItem(items, currentItemParts);
      continue;
    }
    if (currentItemParts.length > NUM_ZERO) {
      currentItemParts.push(line);
    }
  }

  appendOpenChecklistItem(items, currentItemParts);
  return items;
}

function startsMarkdownListItem(line) {
  return (
    NUMBERED_LIST_PATTERN.test(line) ||
    line.startsWith(MARKDOWN_LIST_PREFIX)
  );
}

function stripMarkdownListMarker(line) {
  if (NUMBERED_LIST_PATTERN.test(line)) {
    return line.replace(NUMBERED_LIST_PATTERN, EMPTY_STRING).trim();
  }
  if (line.startsWith(MARKDOWN_LIST_PREFIX)) {
    return line.slice(MARKDOWN_LIST_PREFIX.length).trim();
  }
  return line;
}

function appendMarkdownSectionItem(items, itemParts) {
  const item = normalizeString(itemParts.join(SPACE));
  itemParts.length = NUM_ZERO;
  if (item.length > NUM_ZERO) {
    items.push(item);
  }
}

function extractMarkdownSection(content = EMPTY_STRING, title) {
  const lines = content.split(NEWLINE);
  const heading = `${SECTION_HEADING_PREFIX}${title}`;
  const startIndex = lines.findIndex((line) => line.trim() === heading);
  if (startIndex < NUM_ZERO) {
    return [];
  }
  const sectionItems = [];
  const currentItemParts = [];
  for (const line of lines.slice(startIndex + NUM_ONE)) {
    if (line.startsWith(SECTION_HEADING_PREFIX)) {
      appendMarkdownSectionItem(sectionItems, currentItemParts);
      break;
    }
    const trimmedLine = line.trim();
    if (trimmedLine.length === NUM_ZERO) {
      appendMarkdownSectionItem(sectionItems, currentItemParts);
      continue;
    }
    if (startsMarkdownListItem(trimmedLine)) {
      appendMarkdownSectionItem(sectionItems, currentItemParts);
      currentItemParts.push(stripMarkdownListMarker(trimmedLine));
      continue;
    }
    if (currentItemParts.length > NUM_ZERO) {
      currentItemParts.push(trimmedLine);
      continue;
    }
    sectionItems.push(trimmedLine);
  }
  appendMarkdownSectionItem(sectionItems, currentItemParts);
  return sectionItems;
}

function extractMarkdownSectionText(content = EMPTY_STRING, title) {
  const heading = `${SECTION_HEADING_PREFIX}${title}`;
  const startIndex = content.indexOf(heading);
  if (startIndex < NUM_ZERO) {
    return EMPTY_STRING;
  }
  const nextHeadingIndex = content.indexOf(
    `${NEWLINE}${SECTION_HEADING_PREFIX}`,
    startIndex + heading.length,
  );
  return nextHeadingIndex < NUM_ZERO ?
    content.slice(startIndex) :
    content.slice(startIndex, nextHeadingIndex);
}

function findMarkdownFieldValue(section, label) {
  const fieldPrefix = `${label}${LABEL_SEPARATOR}`;
  const itemParts = [];
  for (const rawLine of section.split(NEWLINE)) {
    const line = rawLine.trim();
    if (startsMarkdownListItem(line)) {
      if (itemParts.length > NUM_ZERO) {
        break;
      }
      const item = stripMarkdownListMarker(line);
      if (item.toLowerCase().startsWith(fieldPrefix.toLowerCase())) {
        itemParts.push(item.slice(fieldPrefix.length).trim());
      }
      continue;
    }
    if (
      itemParts.length > NUM_ZERO &&
      line.length > NUM_ZERO &&
      !line.startsWith(SECTION_HEADING_PREFIX)
    ) {
      itemParts.push(line);
    }
  }
  if (itemParts.length === NUM_ZERO) {
    const pattern = new RegExp(
      `${escapeRegExp(label)}:\\s*([^\\n]+)`,
      'iu',
    );
    const match = pattern.exec(section);
    if (!match) {
      return EMPTY_STRING;
    }
    itemParts.push(match[NUM_ONE]);
  }
  return normalizeString(itemParts.join(SPACE)).replace(/^`|`$/gu, EMPTY_STRING);
}

function buildModelFitContext(currentBlocker = {}, packageContent = EMPTY_STRING) {
  const metadataModel = currentBlocker.modelFit || {};
  const section = extractMarkdownSectionText(packageContent, PACKAGE_SECTION_MODEL_FIT);
  const sectionTriggers = findMarkdownFieldValue(
    section,
    MODEL_FIT_LABEL_ESCALATION_TRIGGERS,
  );
  const triggers = sectionTriggers ?
    normalizeStringList([sectionTriggers]) :
    normalizeStringList(metadataModel[MODEL_FIT_FIELD_ESCALATION_TRIGGERS]);
  return {
    [MODEL_FIT_FIELD_PACKAGE_CLASS]:
      findMarkdownFieldValue(section, MODEL_FIT_LABEL_PACKAGE_CLASS) ||
      metadataModel[MODEL_FIT_FIELD_PACKAGE_CLASS] ||
      DEFAULT_UNKNOWN,
    [MODEL_FIT_FIELD_INTENDED_MINIMUM_MODEL]:
      findMarkdownFieldValue(section, MODEL_FIT_LABEL_INTENDED_MINIMUM_MODEL) ||
      metadataModel[MODEL_FIT_FIELD_INTENDED_MINIMUM_MODEL] ||
      DEFAULT_UNKNOWN,
    [MODEL_FIT_FIELD_SCOPE_SHAPE]:
      findMarkdownFieldValue(section, MODEL_FIT_LABEL_SCOPE_SHAPE) ||
      metadataModel[MODEL_FIT_FIELD_SCOPE_SHAPE] ||
      DEFAULT_UNKNOWN,
    [MODEL_FIT_FIELD_ESCALATION_TRIGGERS]: triggers,
  };
}

function findCheckedLedgerItem(ledger, label) {
  const pattern = new RegExp(
    `- \\[[xX]\\] ${escapeRegExp(label)}:([\\s\\S]*?)(?=\\n- \\[|$)`,
    'u',
  );
  const match = pattern.exec(ledger);
  return match ? normalizeString(match[NUM_ZERO].replace(/\s+/gu, SPACE)) : null;
}

function findReviewResult(reviewItem) {
  if (isNotNeededReview(reviewItem)) {
    return SUBAGENT_REVIEW_RESULT_CLEAN;
  }
  const match = SUBAGENT_REVIEW_RESULT_PATTERN.exec(reviewItem || EMPTY_STRING);
  return match ? match[NUM_ONE].toLowerCase() : EMPTY_STRING;
}

function isNotNeededReview(reviewItem) {
  const normalizedItem = normalizeString(reviewItem).toLowerCase();
  return normalizedItem.includes(SUBAGENT_FIX_NOT_NEEDED) &&
    normalizedItem.includes(SUBAGENT_REVIEW_NOT_NEEDED_REASON_FIRST_PACKAGE);
}

function isNotNeededFix(fixItem) {
  return normalizeString(fixItem).includes(SUBAGENT_FIX_NOT_NEEDED);
}

function hasRealAgentProof(ledgerItem) {
  const normalizedItem = normalizeString(ledgerItem);
  return SUBAGENT_AGENT_ID_PATTERN.test(normalizedItem) &&
    !SUBAGENT_NON_REAL_IDENTITY_PATTERN.test(normalizedItem);
}

function findStrictValidationRole(errors) {
  const firstError = errors[NUM_ZERO] || EMPTY_STRING;
  if (SUBAGENT_SEQUENCE_ORDER_ERROR_PATTERN.test(firstError)) {
    return SUBAGENT_ROLE_REVIEW;
  }
  if (
    firstError.includes(SUBAGENT_LEDGER_FIX_LABEL) ||
    SUBAGENT_FIX_ERROR_PATTERN.test(firstError)
  ) {
    return SUBAGENT_ROLE_FIX;
  }
  if (
    firstError.includes(SUBAGENT_LEDGER_IMPLEMENTATION_LABEL) ||
    SUBAGENT_IMPLEMENTATION_ERROR_PATTERN.test(firstError)
  ) {
    return SUBAGENT_ROLE_IMPLEMENTATION;
  }
  return SUBAGENT_ROLE_REVIEW;
}

function buildStrictValidationStatus(errors) {
  const firstError = normalizeString(errors[NUM_ZERO]);
  return firstError.length === NUM_ZERO ?
    SUBAGENT_STATUS_STRICT_VALIDATION_FAILED :
    `${SUBAGENT_STATUS_STRICT_VALIDATION_FAILED} ${firstError}`;
}

function buildSubagentRoleStatus(role, status) {
  return {role, status};
}

function buildSubagentSequencingStatus(
  packageContent = EMPTY_STRING,
  packagePath = EMPTY_STRING,
) {
  const ledger = extractMarkdownSectionText(
    packageContent,
    PACKAGE_SECTION_SUBAGENT_LEDGER,
  );
  if (ledger.length === NUM_ZERO) {
    return buildSubagentRoleStatus(
      SUBAGENT_ROLE_REVIEW,
      SUBAGENT_STATUS_LEDGER_MISSING,
    );
  }
  const reviewItem = findCheckedLedgerItem(ledger, SUBAGENT_LEDGER_REVIEW_LABEL);
  if (!reviewItem) {
    return buildSubagentRoleStatus(
      SUBAGENT_ROLE_REVIEW,
      SUBAGENT_STATUS_REVIEW_MISSING,
    );
  }
  if (!isNotNeededReview(reviewItem) && !hasRealAgentProof(reviewItem)) {
    return buildSubagentRoleStatus(
      SUBAGENT_ROLE_REVIEW,
      SUBAGENT_STATUS_REVIEW_MISSING,
    );
  }
  const fixItem = findCheckedLedgerItem(ledger, SUBAGENT_LEDGER_FIX_LABEL);
  const reviewResult = findReviewResult(reviewItem);
  if (!reviewResult) {
    return buildSubagentRoleStatus(
      SUBAGENT_ROLE_REVIEW,
      SUBAGENT_STATUS_REVIEW_MISSING,
    );
  }
  if (!fixItem) {
    return buildSubagentRoleStatus(
      SUBAGENT_ROLE_FIX,
      reviewResult === SUBAGENT_REVIEW_RESULT_FIXES_REQUIRED ?
        SUBAGENT_STATUS_FIX_REQUIRED :
        SUBAGENT_STATUS_FIX_NOT_NEEDED_MISSING,
    );
  }
  if (
    reviewResult === SUBAGENT_REVIEW_RESULT_FIXES_REQUIRED &&
    isNotNeededFix(fixItem)
  ) {
    return buildSubagentRoleStatus(
      SUBAGENT_ROLE_FIX,
      SUBAGENT_STATUS_FIX_REQUIRED,
    );
  }
  if (!isNotNeededFix(fixItem) && !hasRealAgentProof(fixItem)) {
    return buildSubagentRoleStatus(
      SUBAGENT_ROLE_FIX,
      SUBAGENT_STATUS_FIX_MISSING,
    );
  }
  if (
    reviewResult === SUBAGENT_REVIEW_RESULT_CLEAN &&
    !isNotNeededFix(fixItem)
  ) {
    return buildSubagentRoleStatus(
      SUBAGENT_ROLE_FIX,
      SUBAGENT_STATUS_FIX_NOT_NEEDED_MISSING,
    );
  }
  const implementationItem = findCheckedLedgerItem(
    ledger,
    SUBAGENT_LEDGER_IMPLEMENTATION_LABEL,
  );
  if (!implementationItem) {
    return buildSubagentRoleStatus(
      SUBAGENT_ROLE_IMPLEMENTATION,
      SUBAGENT_STATUS_IMPLEMENTATION_MISSING,
    );
  }
  if (!hasRealAgentProof(implementationItem)) {
    return buildSubagentRoleStatus(
      SUBAGENT_ROLE_IMPLEMENTATION,
      SUBAGENT_STATUS_IMPLEMENTATION_MISSING,
    );
  }
  const normalizedPackagePath = normalizeString(packagePath);
  if (normalizedPackagePath.length > NUM_ZERO) {
    const strictErrors = validateSubagentSequencingLedger(
      packageContent,
      normalizedPackagePath,
      {
        [LEDGER_VALIDATION_REQUIRES_LEDGER]: true,
        [LEDGER_VALIDATION_REQUIRES_STRICT_ENTRIES]: true,
      },
    );
    if (strictErrors.length > NUM_ZERO) {
      return buildSubagentRoleStatus(
        findStrictValidationRole(strictErrors),
        buildStrictValidationStatus(strictErrors),
      );
    }
  }
  return buildSubagentRoleStatus(
    SUBAGENT_ROLE_NONE,
    SUBAGENT_STATUS_IMPLEMENTATION_RECORDED,
  );
}

async function resolvePathPresenceLabel(filePath) {
  if (isGlobPattern(filePath)) {
    return `${filePath} (${PATH_PATTERN})`;
  }
  const exists = await fileExists(filePath);
  return `${filePath} (${exists ? PATH_PRESENT : PATH_MISSING})`;
}

function isGlobPattern(filePath) {
  const normalizedPath = normalizeString(filePath);
  return GLOB_PATTERN_MARKERS.some((marker) => normalizedPath.includes(marker));
}

function pathHasRealValue(filePath) {
  const normalizedPath = normalizeString(filePath);
  return normalizedPath.length > NUM_ZERO && normalizedPath !== PATH_NONE;
}

function buildOwnerCardPaths(currentBlocker) {
  const touchedFiles = normalizeStringList(currentBlocker.touchedFiles);
  const ownerCards = [];

  for (const filePath of touchedFiles) {
    if (!filePath.startsWith(SOURCE_DIRECTORY_PREFIX)) {
      continue;
    }
    const parts = filePath.split(path.sep);
    if (parts.length < NUM_TWO) {
      continue;
    }
    ownerCards.push(path.join(SOURCE_DIRECTORY_PREFIX, parts[NUM_ONE], README_FILE_NAME));
  }

  return normalizeStringList(ownerCards);
}

function buildRelevantLlmDomainPackPaths(currentBlocker) {
  const touchedFiles = normalizeStringList(currentBlocker.touchedFiles);
  const scenario = normalizeString(currentBlocker.scenario);
  const domainPacks = [];
  if (touchedFiles.some((filePath) => filePath.startsWith(SOURCE_DIRECTORY_PREFIX))) {
    domainPacks.push(LLM_STEERING_ARCHITECTURE_PATH);
  }
  if (
    touchedFiles.some((filePath) => filePath.startsWith(TEST_DIRECTORY_PREFIX)) ||
    pathHasRealValue(currentBlocker.artifact) ||
    pathHasRealValue(currentBlocker.playback) ||
    (scenario.length > NUM_ZERO &&
      scenario !== DEFAULT_UNKNOWN &&
      scenario !== PATH_NONE)
  ) {
    domainPacks.push(LLM_STEERING_TESTING_PATH);
  }
  if (touchedFiles.some((filePath) => filePath.startsWith(SCRIPT_DIRECTORY_PREFIX))) {
    domainPacks.push(LLM_STEERING_STYLE_PATH);
  }
  if (
    touchedFiles.some((filePath) => filePath.startsWith(WORK_README_PATH)) ||
    touchedFiles.some((filePath) => filePath.startsWith(WORK_DIRECTORY_PREFIX))
  ) {
    domainPacks.push(LLM_STEERING_GOVERNANCE_PATH);
  }
  return normalizeStringList(
    domainPacks.length > NUM_ZERO ? domainPacks : [LLM_STEERING_GOVERNANCE_PATH],
  );
}

function buildPlaybackEvidencePaths(currentBlocker) {
  if (!pathHasRealValue(currentBlocker.playback)) {
    return [];
  }
  return [
    currentBlocker.playback,
    path.join(currentBlocker.playback, PLAYBACK_FAILURE_BUNDLE_FILE),
  ];
}

function buildFirstReadPaths(currentBlocker) {
  const currentPaths = [
    AGENTS_PATH,
    ...COMPACT_STEERING_BASE_PATHS,
    ...buildRelevantLlmDomainPackPaths(currentBlocker),
    WORK_README_PATH,
    currentBlocker.package,
    ...buildOwnerCardPaths(currentBlocker),
    ...(pathHasRealValue(currentBlocker.artifact) ? [currentBlocker.artifact] : []),
    ...buildPlaybackEvidencePaths(currentBlocker),
    ...normalizeStringList(currentBlocker.touchedFiles),
  ].filter(pathHasRealValue);
  return normalizeStringList(currentPaths);
}

async function buildFirstReadPathLabels(currentBlocker) {
  const uniquePaths = buildFirstReadPaths(currentBlocker);
  return Promise.all(uniquePaths.map(resolvePathPresenceLabel));
}

function buildRuntimeTouchedFiles(currentBlocker) {
  return normalizeStringList(currentBlocker.touchedFiles).filter(
    (filePath) =>
      filePath.startsWith(SOURCE_DIRECTORY_PREFIX) &&
      filePath.endsWith(JAVASCRIPT_EXTENSION),
  );
}

function buildUsefulCommands(currentBlocker) {
  const touchedFiles = normalizeStringList(currentBlocker.touchedFiles);
  const runtimeTouchedFiles = buildRuntimeTouchedFiles(currentBlocker);
  const commands = [
    NPM_RUN_WORK_CURRENT_BLOCKER_COMMAND,
    NPM_RUN_WORK_VALIDATE_COMMAND,
  ];
  if (pathHasRealValue(currentBlocker.package)) {
    commands.push(
      commandWithPaths(NPM_RUN_WORK_PACKAGE_DOCTOR_COMMAND, [
        currentBlocker.package,
      ]),
    );
  }
  if (pathHasRealValue(currentBlocker.artifact)) {
    commands.push(
      commandWithPaths(NPM_RUN_WORK_EVIDENCE_SUMMARY_COMMAND, [
        currentBlocker.artifact,
      ]),
    );
    commands.push(
      commandWithPaths(ANALYZE_DISTRIBUTED_FAILURE_COMMAND, [
        currentBlocker.artifact,
      ]),
    );
    commands.push(
      commandWithPaths(ANALYZE_TOPOLOGY_CONVERGENCE_COMMAND, [
        currentBlocker.artifact,
      ]),
    );
    commands.push(
      commandWithPaths(ANALYZE_CAUSAL_MODEL_COMMAND, [
        currentBlocker.artifact,
      ]),
    );
  }
  if (pathHasRealValue(currentBlocker.playback)) {
    commands.push(
      commandWithPaths(NPM_RUN_WORK_EVIDENCE_SUMMARY_COMMAND, [
        path.join(currentBlocker.playback, PLAYBACK_FAILURE_BUNDLE_FILE),
      ]),
    );
    commands.push(
      commandWithPaths(ANALYZE_TOPOLOGY_CONVERGENCE_COMMAND, [
        path.join(currentBlocker.playback, PLAYBACK_FAILURE_BUNDLE_FILE),
      ]),
    );
    commands.push(
      commandWithPaths(ANALYZE_CAUSAL_MODEL_COMMAND, [
        path.join(currentBlocker.playback, PLAYBACK_FAILURE_BUNDLE_FILE),
      ]),
    );
  }
  commands.push(SUMMARIZE_HARNESS_COMMAND);
  if (runtimeTouchedFiles.length > NUM_ZERO) {
    commands.push(commandWithPaths(CHECK_LITERAL_COMMAND, runtimeTouchedFiles));
    commands.push(
      commandWithPaths(CHECK_DECISION_BOUNDARY_COMMAND, runtimeTouchedFiles),
    );
    commands.push(
      commandWithPaths(CHECK_RUNTIME_GRAMMAR_FILE_COMMAND, runtimeTouchedFiles),
    );
  }
  if (touchedFiles.length > NUM_ZERO) {
    commands.push(commandWithPaths(GIT_DIFF_CHECK_COMMAND, touchedFiles));
  }
  return commands;
}

function extractGitStatusPaths(line) {
  const pathText = line.slice(NUM_THREE).trim();
  if (pathText.includes(GIT_RENAME_SEPARATOR)) {
    return pathText
      .split(GIT_RENAME_SEPARATOR)
      .map(normalizeGitStatusPath)
      .map(normalizeString)
      .filter((filePath) => filePath.length > NUM_ZERO);
  }
  const normalizedPath = normalizeGitStatusPath(pathText);
  return normalizedPath.length > NUM_ZERO ? [normalizedPath] : [];
}

function buildPackageOwnedPaths(currentBlocker = {}) {
  return new Set(normalizeStringList([
    currentBlocker.package,
    currentBlocker.predecessor,
    currentBlocker.sprint,
    ...normalizeStringList(currentBlocker.touchedFiles),
  ]));
}

function pathMatchesAny(filePath, pathSet) {
  if (pathSet.has(filePath)) {
    return true;
  }
  const directoryPrefix = filePath.endsWith(FORWARD_SLASH) ?
    filePath :
    `${filePath}${FORWARD_SLASH}`;
  for (const ownedPath of pathSet) {
    if (isGlobPattern(ownedPath) && globPatternToRegExp(ownedPath).test(filePath)) {
      return true;
    }
    if (ownedPath.startsWith(directoryPrefix)) {
      return true;
    }
  }
  return false;
}

function globPatternToRegExp(pattern) {
  let expression = '^';
  for (let index = NUM_ZERO; index < pattern.length; index += NUM_ONE) {
    const character = pattern[index];
    const nextCharacter = pattern[index + NUM_ONE];
    if (
      character === GLOB_ANY_PATH_SEGMENT &&
      nextCharacter === GLOB_ANY_PATH_SEGMENT
    ) {
      expression += '.*';
      index += NUM_ONE;
      continue;
    }
    if (character === GLOB_ANY_PATH_SEGMENT) {
      expression += '[^/]*';
      continue;
    }
    if (character === GLOB_SINGLE_CHARACTER) {
      expression += '[^/]';
      continue;
    }
    expression += escapeRegExp(character);
  }
  return new RegExp(`${expression}$`, 'u');
}

function normalizeGitStatusPath(filePath) {
  const normalizedPath = normalizeString(filePath);
  if (
    normalizedPath.startsWith(DOUBLE_QUOTE) &&
    normalizedPath.endsWith(DOUBLE_QUOTE)
  ) {
    try {
      return JSON.parse(normalizedPath);
    } catch (_error) {
      return normalizedPath.slice(NUM_ONE, -NUM_ONE);
    }
  }
  return normalizedPath;
}

function groupGitStatusLines(gitStatusLines = [], currentBlocker = {}) {
  const packageOwnedPaths = buildPackageOwnedPaths(currentBlocker);
  const trackerGeneratedPaths = new Set(TRACKER_GENERATED_PATHS);
  const groups = {
    [GIT_GROUP_PACKAGE_OWNED]: [],
    [GIT_GROUP_TRACKER_GENERATED]: [],
    [GIT_GROUP_UNRELATED]: [],
  };

  for (const line of gitStatusLines) {
    const paths = extractGitStatusPaths(line);
    if (paths.some((filePath) => pathMatchesAny(filePath, packageOwnedPaths))) {
      groups[GIT_GROUP_PACKAGE_OWNED].push(line);
      continue;
    }
    if (paths.some((filePath) => pathMatchesAny(filePath, trackerGeneratedPaths))) {
      groups[GIT_GROUP_TRACKER_GENERATED].push(line);
      continue;
    }
    groups[GIT_GROUP_UNRELATED].push(line);
  }

  return groups;
}

async function readGitStatus() {
  try {
    const result = await execFileAsync(GIT_COMMAND, GIT_STATUS_ARGS, {
      cwd: process.cwd(),
    });
    return {
      lines: result.stdout
        .split(NEWLINE)
        .map((line) => line.trimEnd())
        .filter((line) => line.length > NUM_ZERO),
      status: GIT_STATUS_AVAILABLE,
    };
  } catch (_error) {
    return {
      lines: [],
      status: GIT_STATUS_UNAVAILABLE_STATE,
    };
  }
}

function appendGitStatusGroup(lines, groupKey, groupLines) {
  appendKeyValue(lines, GIT_GROUP_LABELS[groupKey], String(groupLines.length));
  if (groupLines.length === NUM_ZERO) {
    lines.push(`${MARKDOWN_LIST_PREFIX}${GIT_GROUP_EMPTY_MESSAGES[groupKey]}`);
    return;
  }
  for (const line of groupLines.slice(NUM_ZERO, MAX_GIT_STATUS_LINES)) {
    lines.push(`${MARKDOWN_LIST_PREFIX}\`${line}\``);
  }
  const remainingCount = groupLines.length - MAX_GIT_STATUS_LINES;
  if (remainingCount > NUM_ZERO) {
    lines.push(`${MARKDOWN_LIST_PREFIX}${remainingCount} more entries omitted.`);
  }
}

function appendGitStatus(lines, gitStatus, currentBlocker) {
  if (gitStatus.status === GIT_STATUS_UNAVAILABLE_STATE) {
    lines.push(`${MARKDOWN_LIST_PREFIX}${MESSAGE_GIT_STATUS_UNAVAILABLE}`);
    return;
  }
  const gitStatusLines = gitStatus.lines;
  appendKeyValue(
    lines,
    FIELD_LABELS.DIRTY_ENTRIES,
    String(gitStatusLines.length),
  );
  if (gitStatusLines.length === NUM_ZERO) {
    lines.push(`${MARKDOWN_LIST_PREFIX}${MESSAGE_NO_GIT_STATUS}`);
    return;
  }
  const groupedStatus = groupGitStatusLines(gitStatusLines, currentBlocker);
  appendGitStatusGroup(lines, GIT_GROUP_PACKAGE_OWNED, groupedStatus.packageOwned);
  appendGitStatusGroup(
    lines,
    GIT_GROUP_TRACKER_GENERATED,
    groupedStatus.trackerGenerated,
  );
  appendGitStatusGroup(lines, GIT_GROUP_UNRELATED, groupedStatus.unrelated);
}

async function resolveOptionalPathPresenceValue(filePath) {
  if (!pathHasRealValue(filePath)) {
    return filePath;
  }
  return resolvePathPresenceLabel(filePath);
}

async function buildContextLines(currentBlocker, packageContent) {
  const lines = [OUTPUT_TITLE];
  const packageTitle = extractMarkdownTitle(packageContent || EMPTY_STRING);
  const firstReadPaths = await buildFirstReadPathLabels(currentBlocker);
  const gitStatus = await readGitStatus();
  const artifactLabel = await resolveOptionalPathPresenceValue(currentBlocker.artifact);
  const playbackLabel = await resolveOptionalPathPresenceValue(currentBlocker.playback);
  const subagentStatus = buildSubagentSequencingStatus(
    packageContent || EMPTY_STRING,
    currentBlocker.package,
  );
  const modelFit = buildModelFitContext(
    currentBlocker,
    packageContent || EMPTY_STRING,
  );

  appendSection(lines, SECTION_CURRENT_BLOCKER);
  appendKeyValue(lines, FIELD_LABELS.SPRINT, currentBlocker.sprint);
  appendKeyValue(lines, FIELD_LABELS.PACKAGE, currentBlocker.package);
  appendKeyValue(lines, FIELD_LABELS.STATUS, currentBlocker.status);
  appendKeyValue(lines, FIELD_LABELS.SCENARIO, currentBlocker.scenario);
  appendKeyValue(lines, FIELD_LABELS.OWNER, currentBlocker.owner);
  appendKeyValue(lines, FIELD_LABELS.BOUNDARY, currentBlocker.boundary);
  appendKeyValue(
    lines,
    FIELD_LABELS.DOMINANT_REASON,
    currentBlocker.dominantReason,
  );
  appendKeyValue(lines, FIELD_LABELS.ARTIFACT, artifactLabel);
  appendKeyValue(lines, FIELD_LABELS.PLAYBACK, playbackLabel);
  appendKeyValue(lines, FIELD_LABELS.PREDECESSOR, currentBlocker.predecessor);
  appendKeyValue(lines, FIELD_LABELS.PACKAGE_TITLE, packageTitle);

  appendSection(lines, SECTION_SUBAGENT_SEQUENCING);
  appendKeyValue(lines, FIELD_LABELS.SUBAGENT_ROLE, subagentStatus.role);
  appendKeyValue(lines, FIELD_LABELS.SUBAGENT_STATUS, subagentStatus.status);

  appendSection(lines, SECTION_MODEL_FIT);
  appendKeyValue(
    lines,
    FIELD_LABELS.MODEL_FIT_PACKAGE_CLASS,
    modelFit[MODEL_FIT_FIELD_PACKAGE_CLASS],
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.INTENDED_MINIMUM_MODEL,
    modelFit[MODEL_FIT_FIELD_INTENDED_MINIMUM_MODEL],
  );
  appendKeyValue(lines, FIELD_LABELS.SCOPE_SHAPE, modelFit[MODEL_FIT_FIELD_SCOPE_SHAPE]);
  appendKeyValue(
    lines,
    FIELD_LABELS.ESCALATION_TRIGGERS,
    normalizeStringList(modelFit[MODEL_FIT_FIELD_ESCALATION_TRIGGERS]).join(', '),
  );

  appendSection(lines, SECTION_CAUSAL_GOVERNANCE);
  const causalGovernance = currentBlocker.causalGovernance || {};
  appendKeyValue(
    lines,
    FIELD_LABELS.CAUSAL_HYPOTHESIS,
    causalGovernance[CAUSAL_GOVERNANCE_FIELD_HYPOTHESIS],
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.STOP_CONDITION_CHECK,
    causalGovernance[CAUSAL_GOVERNANCE_FIELD_STOP_CONDITION_CHECK],
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.EXPECTED_CAUSAL_MODEL_CHANGE,
    causalGovernance[CAUSAL_GOVERNANCE_FIELD_EXPECTED_CAUSAL_MODEL_CHANGE],
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.REPRESENTATIVE_OUTCOME,
    causalGovernance[CAUSAL_GOVERNANCE_FIELD_REPRESENTATIVE_OUTCOME],
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.CAUSAL_DEBT,
    causalGovernance[CAUSAL_GOVERNANCE_FIELD_CAUSAL_DEBT],
  );
  appendKeyValue(
    lines,
    FIELD_LABELS.CROSS_BOUNDARY_REVIEW,
    causalGovernance[CAUSAL_GOVERNANCE_FIELD_CROSS_BOUNDARY_REVIEW],
  );

  appendSection(lines, SECTION_CURRENT_STATE);
  lines.push(normalizeString(currentBlocker.currentState) || DEFAULT_UNKNOWN);

  appendSection(lines, SECTION_NEXT_ACTION);
  lines.push(normalizeString(currentBlocker.nextAction) || DEFAULT_UNKNOWN);

  appendSection(lines, SECTION_USEFUL_COMMANDS);
  appendList(lines, buildUsefulCommands(currentBlocker), DEFAULT_UNKNOWN);

  appendSection(lines, SECTION_FIRST_FILES);
  appendList(lines, firstReadPaths, DEFAULT_UNKNOWN);

  appendSection(lines, SECTION_TOUCHED_FILES);
  appendList(lines, currentBlocker.touchedFiles, DEFAULT_UNKNOWN);

  appendSection(lines, SECTION_PROOF_LADDER);
  appendList(lines, currentBlocker.proof, DEFAULT_UNKNOWN);

  appendSection(lines, SECTION_OPEN_CHECKLIST);
  appendList(
    lines,
    extractOpenChecklist(packageContent || EMPTY_STRING),
    MESSAGE_NO_OPEN_CHECKLIST,
  );

  appendSection(lines, SECTION_OUT_OF_SCOPE);
  appendList(
    lines,
    extractMarkdownSection(
      packageContent || EMPTY_STRING,
      PACKAGE_SECTION_OUT_OF_SCOPE,
    ),
    MESSAGE_NO_OUT_OF_SCOPE,
  );

  appendSection(lines, SECTION_WORKTREE);
  appendGitStatus(lines, gitStatus, currentBlocker);

  return lines;
}

async function buildDirtyScopeLines(currentBlocker, gitStatusOverride = null) {
  const lines = [DIRTY_SCOPE_OUTPUT_TITLE];
  const gitStatus = gitStatusOverride || (await readGitStatus());

  appendSection(lines, SECTION_CURRENT_BLOCKER);
  appendKeyValue(lines, FIELD_LABELS.PACKAGE, currentBlocker.package);
  appendKeyValue(lines, FIELD_LABELS.OWNER, currentBlocker.owner);
  appendKeyValue(lines, FIELD_LABELS.BOUNDARY, currentBlocker.boundary);

  appendSection(lines, SECTION_WORKTREE);
  appendGitStatus(lines, gitStatus, currentBlocker);

  return lines;
}

async function main() {
  let currentBlocker;
  let packageContent = EMPTY_STRING;
  const packageOverride = parseOptionValue(process.argv, CLI_FLAG_PACKAGE);
  if (packageOverride) {
    try {
      const packageBlocker = await buildCurrentBlockerFromPackage(packageOverride);
      currentBlocker = packageBlocker.currentBlocker;
      packageContent = packageBlocker.packageContent;
    } catch (error) {
      console.error(error.message);
      return EXIT_FAILURE;
    }
  } else {
    try {
      currentBlocker = await readJsonFile(CURRENT_BLOCKER_JSON_PATH);
    } catch (_error) {
      console.error(MESSAGE_CURRENT_BLOCKER_MISSING);
      console.error(MESSAGE_CURRENT_BLOCKER_HINT);
      return EXIT_FAILURE;
    }
  }

  if (process.argv.includes(CLI_FLAG_DIRTY_SCOPE)) {
    const lines = await buildDirtyScopeLines(currentBlocker);
    console.log(lines.join(NEWLINE));
    return EXIT_SUCCESS;
  }

  if (!packageContent) {
    const packageRead = await readOptionalTextFile(currentBlocker.package);
    packageContent = packageRead.content;
  }
  const lines = await buildContextLines(currentBlocker, packageContent);
  console.log(lines.join(NEWLINE));
  return EXIT_SUCCESS;
}

function isDirectRun() {
  return path.resolve(process.argv[PROCESS_ARG_SCRIPT_INDEX] || EMPTY_STRING) ===
    fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  process.exitCode = await main();
}

export {
  buildContextLines,
  buildCurrentBlockerFromPackage,
  buildDirtyScopeLines,
  buildFirstReadPaths,
  buildModelFitContext,
  buildOwnerCardPaths,
  buildSubagentSequencingStatus,
  buildUsefulCommands,
  groupGitStatusLines,
};
