#!/usr/bin/env node

import fs from 'node:fs/promises';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {
  SUBAGENT_ATTEMPT_STATUSES,
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
const CORE_LOGIC_BRIEF_HEADING = '## Core Logic Brief';
const CAUSAL_DECISION_CONTRACT_HEADING = '## Causal Decision Contract';
const DECISION_EXPERIMENT_GATE_HEADING = '## Decision Experiment Gate';
const MARKDOWN_LEVEL_TWO_HEADING_PREFIX = '## ';
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

function extractMarkdownLevelTwoSection(content, heading) {
  const headingIndex = content.indexOf(heading);
  if (headingIndex < NUM_ZERO) {
    return EMPTY_TEXT;
  }
  const nextHeadingIndex = content.indexOf(
    `${NEWLINE}${MARKDOWN_LEVEL_TWO_HEADING_PREFIX}`,
    headingIndex + heading.length,
  );
  const section = nextHeadingIndex < NUM_ZERO ?
    content.slice(headingIndex) :
    content.slice(headingIndex, nextHeadingIndex);
  return section.replace(heading, EMPTY_TEXT).trim();
}

function coreLogicBrief(content) {
  return extractMarkdownLevelTwoSection(content, CORE_LOGIC_BRIEF_HEADING) ||
    'Not recorded.';
}

function causalDecisionContract(content) {
  return extractMarkdownLevelTwoSection(
    content,
    CAUSAL_DECISION_CONTRACT_HEADING,
  ) || 'Not recorded.';
}

function decisionExperimentGate(content) {
  return extractMarkdownLevelTwoSection(
    content,
    DECISION_EXPERIMENT_GATE_HEADING,
  ) || 'Not recorded.';
}

function roleTask(role, metadata, packagePath) {
  if (role === ROLE_REVIEW) {
    return [
      'Review the predecessor or most recently executed package named by this',
      'package. Focus on package proof, residual inventory, guardrail ledger,',
      'blocker migration notes, sprint snapshot consistency, and whether the',
      'stated next action still matches artifact evidence. If every finding is',
      'limited to package, sprint, tracker, current-blocker, ledger, or handoff',
      'metadata in the declared scope, fix it directly as the review agent and',
      'record the fix as review-fixed-metadata-only instead of requesting a',
      'separate fix subagent.',
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
  return `Agent ${agentName} (${agentId}) implemented ${packagePath}; parent revalidated focused proof: yes`;
}

function reviewMetadataFixLedgerLine(packagePath, flags = {}) {
  const agentName = parseOptionValue(flags, FLAG_AGENT_NAME);
  const agentId = parseOptionValue(flags, FLAG_AGENT_ID);
  if (!agentName || !agentId) {
    return 'If the review agent directly fixes metadata-only findings, record: `review-fixed-metadata-only by Agent <name> (<agent-id>) for <reviewed-package>; scope: metadata-only package/sprint/tracker/handoff edits`.';
  }
  return `review-fixed-metadata-only by Agent ${agentName} (${agentId}) for ${packagePath}; scope: metadata-only package/sprint/tracker/handoff edits`;
}

function validationCommandLines(role, packagePath, metadata) {
  const proofCommands = Array.isArray(metadata.proof) ?
    metadata.proof.map(normalizeText).filter(Boolean) :
    [];
  const lines = [
    `- \`npm run work:package:doctor -- --suggest ${packagePath}\``,
  ];
  if (role !== ROLE_REVIEW) {
    lines.push(`- \`npm run work:validate -- --pre-impl ${packagePath}\``);
  }
  for (const command of proofCommands) {
    lines.push(`- \`${command}\``);
  }
  if (role === ROLE_IMPLEMENTATION) {
    lines.push(`- \`npm run work:validate -- --closure ${packagePath}\``);
  }
  return lines.join(NEWLINE);
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
    '## Core Logic Brief',
    EMPTY_TEXT,
    coreLogicBrief(content),
    EMPTY_TEXT,
    '## Causal Decision Contract',
    EMPTY_TEXT,
    causalDecisionContract(content),
    EMPTY_TEXT,
    '## Decision Experiment Gate',
    EMPTY_TEXT,
    decisionExperimentGate(content),
    EMPTY_TEXT,
    '## Systemic Thinking Check',
    EMPTY_TEXT,
    '- Treat this role as part of the Decision Experiment Gate: test the decision question before treating implementation as justified.',
    '- Before edits, name at least two credible competing explanations for the same symptom, including one wrong-owner or instrumentation/staleness explanation.',
    '- The pre-edit focused probe must run before runtime edits unless it is impossible in this environment; record the blocker instead of substituting narrative.',
    '- Scan producer, consumer, admission/gating, retry/lifecycle, and evidence-generation interactions before assigning the next slice.',
    '- If evidence has not changed since the last package, do not bounce to an adjacent owner; record the ping-pong stop rule and return a split, rerun, architecture gate, or human-escalation handoff.',
    '- Treat local proof as a falsifier for this owner boundary, not as representative success.',
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
    '## Exact Validation Commands',
    EMPTY_TEXT,
    validationCommandLines(role, packagePath, metadata),
    EMPTY_TEXT,
    'Run the exact command shapes above unless the command is impossible in this environment. Do not add ad hoc Jest or TAP flags such as `--runInBand`, do not invent runner flags, and do not substitute broad raw-log sampling for the listed canonical commands. This repo uses `npm test -- test/path.test.js` for focused TAP test files.',
    'Worker-reported validation is handoff evidence only; the parent session must rerun focused proof locally before recording final implementation completion.',
    EMPTY_TEXT,
    '## Escalation Triggers',
    EMPTY_TEXT,
    list(metadata.modelFit?.escalationTriggers),
    EMPTY_TEXT,
    '## Checkpoint Ledger Updates',
    EMPTY_TEXT,
    'Append one checked `## Subagent Progress And Attempt Ledger` checkpoint in the package after every completed subtask. If the package already uses separate Progress and Attempt ledgers, mirror the same checkpoint facts into those existing sections instead of inventing extra prose.',
    'Each checked checkpoint must include Agent name/id, status, last checkpoint, parent action, evidence, and next or blocker. Before edits, include a falsification checkpoint naming what evidence would prove this package is the wrong slice.',
    role === ROLE_REVIEW ?
      'If review findings are metadata-only, apply those edits directly and add a checked checkpoint naming the metadata-only files fixed before final review validation.' :
      EMPTY_TEXT,
    EMPTY_TEXT,
    'Use this shape:',
    EMPTY_TEXT,
    `- [x] Agent <name> (<agent-id>) ${role} checkpoint: status: \`<started|running|interrupted|partial-unvalidated|validated|superseded>\`; last checkpoint: <completed checkpoint>; parent action: \`<pending|accepted|revalidated|discarded|superseded>\`; evidence: <command/result/files>; next: <next step>.`,
    `- [x] Agent <name> (<agent-id>) ${role} falsification checkpoint: status: running; last checkpoint: wrong-slice check complete; parent action: pending; wrong-slice evidence would be <owner/boundary/result change>; evidence: <command/result/files>; next: edit, validate, split, or blocker handoff.`,
    EMPTY_TEXT,
    'If blocked, append `blocker:` instead of `next:` and stop for the parent session rather than continuing silently.',
    EMPTY_TEXT,
    'Use `partial-unvalidated` if you edited files but cannot complete validation; use `interrupted` if the role stops before a clean checkpoint. A later worker or parent must add a checked superseded/discarded/revalidated checkpoint before closure.',
    `Valid statuses: ${SUBAGENT_ATTEMPT_STATUSES.map((status) => `\`${status}\``).join(', ')}.`,
    'Progress watchdog: after each completed subtask, update the combined checkpoint ledger before continuing. Silence after a checkpoint means the parent may interrupt or discard the attempt instead of promoting it.',
    EMPTY_TEXT,
    'Final handoff must include files changed, commands run with pass/fail result, whether you edited after the last checkpoint line, and any remaining blocker.',
    EMPTY_TEXT,
    '## Ledger Line',
    EMPTY_TEXT,
    role === ROLE_IMPLEMENTATION ?
      'The parent session records this implementation Sequencing Ledger line only after rerunning the focused proof locally and truthfully adding `parent revalidated focused proof: yes`:' :
      'Record this Sequencing Ledger line after the role completes:',
    EMPTY_TEXT,
    ledgerLine(role, packagePath, args),
    ...(role === ROLE_REVIEW ? [
      EMPTY_TEXT,
      'If metadata-only findings were fixed by the review agent, record this under `Fix subagent recorded or explicitly not needed` instead of spawning a fix subagent:',
      EMPTY_TEXT,
      reviewMetadataFixLedgerLine(packagePath, args),
    ] : []),
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
