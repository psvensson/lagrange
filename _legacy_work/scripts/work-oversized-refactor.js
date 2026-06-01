#!/usr/bin/env node

import {execFileSync, spawn} from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {
  FILE_SIZE_SCOPE,
  buildExplicitFileSizeEntries,
  buildFileSizeEntries,
} from './check-file-size-thresholds.js';

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const NUM_ZERO = 0;
const NUM_ONE = 1;
const NUM_TWO = 2;
const NUM_MINUS_ONE = -1;
const DECIMAL_RADIX = 10;
const DEFAULT_MODEL = 'gpt-5.3-codex';
const DEFAULT_SCOPE = 'all';
const DEFAULT_MAX_PASSES = 8;
const SOURCE_DIRECTORY = 'src';
const TEST_DIRECTORY = 'test';
const FLAG_HELP = '--help';
const FLAG_RUN = '--run';
const FLAG_TOP = '--top';
const FLAG_SCOPE = '--scope';
const FLAG_MODEL = '--model';
const FLAG_CODEX_BIN = '--codex-bin';
const FLAG_MAX_PASSES = '--max-passes';
const FLAG_PRINT_PROMPTS = '--print-prompts';
const FLAG_CONTINUE_ON_ERROR = '--continue-on-error';
const CODEX_BIN = 'codex';
const GIT_BIN = 'git';
const CODEX_EXEC_COMMAND = 'exec';
const CODEX_PROMPT_STDIN = '-';
const CODEX_SANDBOX_MODE = 'workspace-write';
const CODEX_APPROVAL_POLICY = 'never';
const EMPTY_TEXT = '';
const NEWLINE = '\n';
const JSON_INDENT_SPACES = 2;
const SCHEMA_VERSION = 'direct-oversized-codex-refactor-v1';
const DIGIT_PATTERN = /\d/u;
const VALID_SCOPES = Object.freeze([
  DEFAULT_SCOPE,
  FILE_SIZE_SCOPE.SOURCE,
  FILE_SIZE_SCOPE.TEST,
]);
const HELP_TEXT = [
  'Usage:',
  '  npm run work:oversized-refactor -- [--run] [--top <count>] [--scope all|source|test]',
  '',
  'Options:',
  '  --run                 Launch codex exec once per selected oversized file.',
  '  --top <count>         Limit the selected oversized files after sorting by size.',
  '  --model <model>       Override the default gpt-5.3-codex model.',
  '  --codex-bin <path>    Override the codex executable.',
  '  --max-passes <count>  Maximum Codex passes per file before stopping.',
  '  --print-prompts       Print each generated Codex prompt without running it.',
  '  --continue-on-error   Keep running later files if one Codex run fails.',
  '',
  'Bypasses work-package creation. Codex is instructed to use semantic new',
  'filenames and to avoid digit characters in every new filename.',
].join(NEWLINE);

function normalizeText(value) {
  return String(value || EMPTY_TEXT).trim();
}

function parseOptionValue(args, optionName) {
  const optionIndex = args.indexOf(optionName);
  if (optionIndex === NUM_MINUS_ONE) {
    return EMPTY_TEXT;
  }
  return normalizeText(args[optionIndex + NUM_ONE]);
}

function parsePositiveInteger(value) {
  const parsed = Number.parseInt(normalizeText(value), DECIMAL_RADIX);
  return Number.isInteger(parsed) && parsed > NUM_ZERO ? parsed : null;
}

function parseScope(args) {
  const scope = parseOptionValue(args, FLAG_SCOPE) || DEFAULT_SCOPE;
  if (!VALID_SCOPES.includes(scope)) {
    throw new Error(
      `Invalid scope "${scope}". Expected one of: ${VALID_SCOPES.join(', ')}.`,
    );
  }
  return scope;
}

function parseCli(args = []) {
  return {
    codexBin: parseOptionValue(args, FLAG_CODEX_BIN) || CODEX_BIN,
    continueOnError: args.includes(FLAG_CONTINUE_ON_ERROR),
    model: parseOptionValue(args, FLAG_MODEL) || DEFAULT_MODEL,
    maxPasses: parsePositiveInteger(parseOptionValue(args, FLAG_MAX_PASSES)) ||
      DEFAULT_MAX_PASSES,
    printPrompts: args.includes(FLAG_PRINT_PROMPTS),
    run: args.includes(FLAG_RUN),
    scope: parseScope(args),
    top: parsePositiveInteger(parseOptionValue(args, FLAG_TOP)),
  };
}

function compareOversizedEntries(left, right) {
  if (right.lines !== left.lines) {
    return right.lines - left.lines;
  }
  return left.path.localeCompare(right.path);
}

function buildOversizedRefactorPlanFromEntries(
  sourceEntries = [],
  testEntries = [],
  options = {},
) {
  const scope = options.scope || DEFAULT_SCOPE;
  const allEntries = [
    ...(scope === FILE_SIZE_SCOPE.TEST ? [] : sourceEntries),
    ...(scope === FILE_SIZE_SCOPE.SOURCE ? [] : testEntries),
  ].sort(compareOversizedEntries);
  const selectedEntries = options.top ?
    allEntries.slice(NUM_ZERO, options.top) :
    allEntries;
  return {
    schemaVersion: SCHEMA_VERSION,
    model: options.model || DEFAULT_MODEL,
    run: Boolean(options.run),
    scope,
    oversizedCount: allEntries.length,
    selectedCount: selectedEntries.length,
    entries: selectedEntries,
  };
}

async function buildOversizedRefactorPlan(options = {}) {
  const sourceEntries = options.scope === FILE_SIZE_SCOPE.TEST ?
    [] :
    await buildFileSizeEntries(FILE_SIZE_SCOPE.SOURCE, SOURCE_DIRECTORY);
  const testEntries = options.scope === FILE_SIZE_SCOPE.SOURCE ?
    [] :
    await buildFileSizeEntries(FILE_SIZE_SCOPE.TEST, TEST_DIRECTORY);
  return buildOversizedRefactorPlanFromEntries(sourceEntries, testEntries, options);
}

function formatEntry(entry) {
  return `- ${entry.path} (${entry.lines}/${entry.threshold} ${entry.scope} lines)`;
}

function renderPlan(plan) {
  const lines = [
    `Oversized files selected for direct ${plan.model} refactor:`,
    `Scope: ${plan.scope}`,
    `Selected: ${plan.selectedCount}/${plan.oversizedCount}`,
    EMPTY_TEXT,
  ];
  if (plan.entries.length === NUM_ZERO) {
    lines.push('- No oversized files matched the selected scope.');
    return lines.join(NEWLINE);
  }
  lines.push(...plan.entries.map(formatEntry));
  if (!plan.run) {
    lines.push(
      EMPTY_TEXT,
      'No Codex runs launched. Add `--run` to refactor these files directly.',
    );
  }
  return lines.join(NEWLINE);
}

function buildRefactorPrompt(entry, plan = {}) {
  const model = plan.model || DEFAULT_MODEL;
  return [
    `You are ${model}, launched by npm run work:oversized-refactor for one oversized-file refactor.`,
    '',
    'User request:',
    '- Bypass the regular work-package process for this oversized cleanup.',
    '- Do not create or edit work packages, sprint trackers, current-blocker files, model-ledger entries, or package ceremony files.',
    '- Refactor the oversized file directly while preserving behavior.',
    '- The goal is to bring the target file under its configured line threshold.',
    '',
    'Target file:',
    `- ${entry.path}`,
    `- ${entry.lines} lines with threshold ${entry.threshold}`,
    '',
    'Allowed scope:',
    `- Edit ${entry.path}.`,
    '- Add only semantically named helper files that are directly needed by this extraction.',
    '- Every helper file you add for this extraction must also be under its configured line threshold before you finalize.',
    '- Update imports, exports, and focused tests only when required by the extraction.',
    '- Do not revert or rewrite unrelated dirty worktree changes.',
    '',
    'Naming constraints for new files:',
    '- New filenames must describe the semantic owner, boundary, state model, decision table, evidence normalizer, routing behavior, or helper concern they contain.',
    '- Do not use any digit character in a new filename.',
    '- Do not carry segment, stage, part, batch, tranche, ordinal, numbered suffix, or source filename numbering into a new filename.',
    '- Do not append a generic helper suffix to a numbered source-file stem; choose the real semantic concern name.',
    '',
    'Refactor constraints:',
    '- Extract cohesive semantic concerns until the target file is under its threshold, or until a real blocker prevents further safe extraction.',
    '- Do not move the oversized body intact into one new oversized sidecar or wrapper target; split new helper modules by semantic concern in the same pass.',
    '- Prefer high-impact extraction boundaries such as registered test groups, fixture builders, decision-table fixtures, state-model constants, or evidence normalizers.',
    '- Do not stop after a single extraction if the target file remains over threshold and another safe semantic concern can be moved.',
    '- Keep public entrypoints stable unless the file already has an established export wrapper pattern that requires a small import update.',
    '- Preserve runtime/domain state names and owner boundaries.',
    '- Prefer canonical constants and existing helper patterns over new ad hoc policy.',
    '',
    'Validation:',
    `- Run npm run audit:file-size -- ${entry.path}`,
    '- Run npm run audit:file-size:strict -- <target-and-every-helper-you-added-or-edited> before finalizing.',
    '- Run the most focused relevant test or static guardrail you can identify.',
    '- If focused validation fails, determine whether the failure existed before your edit when practical; fix introduced failures before finalizing.',
    '- Report the final line count, whether the target is still oversized, validation commands, and any blocker clearly in your final response.',
  ].join(NEWLINE);
}

function buildCodexArgs(options = {}) {
  return [
    '--model',
    options.model || DEFAULT_MODEL,
    '--cd',
    process.cwd(),
    '--sandbox',
    CODEX_SANDBOX_MODE,
    '--ask-for-approval',
    CODEX_APPROVAL_POLICY,
    CODEX_EXEC_COMMAND,
    '--color',
    'never',
    CODEX_PROMPT_STDIN,
  ];
}

function readGitPathSet(args) {
  try {
    return new Set(
      execFileSync(GIT_BIN, args, {
        cwd: process.cwd(),
        encoding: 'utf8',
      })
        .split('\0')
        .map(normalizeText)
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

function readNewFileInventory() {
  return new Set([
    ...readGitPathSet(['ls-files', '--others', '--exclude-standard', '-z']),
    ...readGitPathSet(['diff', '--cached', '--name-only', '--diff-filter=A', '-z']),
  ]);
}

function findNewFilenameViolations(beforePaths, afterPaths) {
  return [...afterPaths]
    .filter((filePath) => !beforePaths.has(filePath))
    .filter((filePath) => DIGIT_PATTERN.test(path.basename(filePath)))
    .sort();
}

function findNewPaths(beforePaths, afterPaths) {
  return [...afterPaths]
    .filter((filePath) => !beforePaths.has(filePath))
    .sort();
}

async function findNewOversizedHelperEntries(beforePaths, afterPaths) {
  const newPaths = findNewPaths(beforePaths, afterPaths);
  if (newPaths.length === NUM_ZERO) {
    return [];
  }
  return buildExplicitFileSizeEntries(newPaths);
}

async function readOversizedEntry(filePath) {
  const entries = await buildExplicitFileSizeEntries([filePath]);
  return entries[NUM_ZERO] || null;
}

function runCodex(codexBin, args, prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn(codexBin, args, {
      cwd: process.cwd(),
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve(exitCode);
    });
    child.stdin.end(prompt);
  });
}

function formatPassMessage(entry, passIndex, maxPasses) {
  return `${NEWLINE}Launching Codex pass ${passIndex}/${maxPasses} for ` +
    `${entry.path} (${entry.lines}/${entry.threshold})${NEWLINE}`;
}

async function runPlan(plan, options = {}) {
  for (const initialEntry of plan.entries) {
    let currentEntry = initialEntry;
    for (
      let passIndex = NUM_ONE;
      currentEntry && passIndex <= options.maxPasses;
      passIndex += NUM_ONE
    ) {
      const prompt = buildRefactorPrompt(currentEntry, plan);
      const args = buildCodexArgs({model: plan.model});
      const beforeNewFiles = readNewFileInventory();
      process.stdout.write(
        formatPassMessage(currentEntry, passIndex, options.maxPasses),
      );
      const exitCode = await runCodex(
        options.codexBin || CODEX_BIN,
        args,
        prompt,
      );
      const filenameViolations = findNewFilenameViolations(
        beforeNewFiles,
        readNewFileInventory(),
      );
      if (filenameViolations.length > NUM_ZERO) {
        throw new Error(
          'New filenames must not contain digit characters: ' +
          filenameViolations.join(', '),
        );
      }
      const oversizedNewHelperEntries = await findNewOversizedHelperEntries(
        beforeNewFiles,
        readNewFileInventory(),
      );
      if (oversizedNewHelperEntries.length > NUM_ZERO) {
        throw new Error(
          'New helper files must not remain oversized: ' +
          oversizedNewHelperEntries.map(formatEntry).join(', '),
        );
      }
      if (exitCode !== EXIT_SUCCESS && !options.continueOnError) {
        throw new Error(
          `Codex exited with ${exitCode} while refactoring ` +
          `${currentEntry.path}.`,
        );
      }
      const nextEntry = await readOversizedEntry(currentEntry.path);
      if (!nextEntry) {
        process.stdout.write(
          `File is now under threshold: ${currentEntry.path}${NEWLINE}`,
        );
        currentEntry = null;
        break;
      }
      if (nextEntry.lines >= currentEntry.lines) {
        throw new Error(
          `${currentEntry.path} remains oversized at ${nextEntry.lines}/` +
          `${nextEntry.threshold} lines and did not shrink in pass ` +
          `${passIndex}.`,
        );
      }
      currentEntry = nextEntry;
    }
    if (currentEntry) {
      throw new Error(
        `${currentEntry.path} remains oversized after ${options.maxPasses} ` +
        `passes: ${currentEntry.lines}/${currentEntry.threshold} lines.`,
      );
    }
  }
}

async function runCli(args = process.argv.slice(NUM_TWO)) {
  if (args.includes(FLAG_HELP)) {
    return `${HELP_TEXT}${NEWLINE}`;
  }
  const options = parseCli(args);
  const plan = await buildOversizedRefactorPlan(options);
  const output = [renderPlan(plan)];
  if (options.printPrompts) {
    output.push(
      EMPTY_TEXT,
      JSON.stringify(
        plan.entries.map((entry) => ({
          path: entry.path,
          prompt: buildRefactorPrompt(entry, plan),
        })),
        null,
        JSON_INDENT_SPACES,
      ),
    );
  }
  process.stdout.write(`${output.join(NEWLINE)}${NEWLINE}`);
  if (options.run) {
    await runPlan(plan, options);
  }
  return EMPTY_TEXT;
}

function isDirectRun() {
  return process.argv[NUM_ONE] === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  runCli()
    .then((output) => {
      if (output) {
        process.stdout.write(output);
      }
      process.exitCode = EXIT_SUCCESS;
    })
    .catch((error) => {
      process.stderr.write(`${error.message}${NEWLINE}`);
      process.exitCode = EXIT_FAILURE;
    });
}

export {
  buildCodexArgs,
  buildOversizedRefactorPlan,
  buildOversizedRefactorPlanFromEntries,
  buildRefactorPrompt,
  findNewFilenameViolations,
  findNewOversizedHelperEntries,
  findNewPaths,
  formatPassMessage,
  parseCli,
  readOversizedEntry,
  renderPlan,
  runCli,
};
