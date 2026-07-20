#!/usr/bin/env node

// STYLE-0012 machine check (GOV-0110: an enforceable steering rule must be a
// machine check). "terminalize" is not a word: new identifiers, comments, and test
// strings must say terminate/terminating/terminal state. Inherited usages are
// known debt held by the count baseline — a one-way ratchet: any file whose
// occurrence count RISES above its baselined count fails. Baseline identity is
// per file path, so renaming a baselined file surfaces its inherited occurrences
// as failures — clean them up in the rename, or re-run --update-baseline.

import {
  applyCountBaseline,
  buildGuidelineViolationReport,
  formatGuidelineHumanSummary,
  loadCountBaseline,
  runGuidelineCheck,
  runGuidelineCheckWhenDirect,
  writeCountBaseline,
} from './guideline-check-shared.js';

const RULE_REFERENCE =
  'STYLE-0012: terminalize is not a word — an operation/handoff terminates; ' +
  'the terminal state is reached by terminating. Use terminate/termination in ' +
  'new or newly edited identifiers, comments, strings, and prose.';

const VIOLATION_KIND = Object.freeze({
  TERMINAL_VOCABULARY: 'terminalize_vocabulary',
});

const VIOLATION_REASON = Object.freeze({
  [VIOLATION_KIND.TERMINAL_VOCABULARY]:
    'uses terminaliz*/terminalis* vocabulary; say terminate/termination instead',
});

const VIOLATION_LABEL = 'terminalize vocabulary';
const IDENTITY_SEPARATOR = '|';
const NUMERIC_LITERAL_ZERO = 0;
const NUMERIC_LITERAL_TWO = 2;

// Matches every inflection: terminalize(s|d), terminalizing, terminalization,
// and the -ise spellings. Bare "terminal"/"terminally" stay legal.
const TERMINAL_VOCABULARY_PATTERN = /terminali[sz]/giu;

// The vocabulary rule covers test names and assertion strings too (the recorded
// verifier rejection was six new terminaliz* TEST strings), so tests and the
// live-demo examples are scanned unconditionally.
const DEFAULT_SCAN_ROOTS = Object.freeze(['src', 'scripts', 'test', 'examples']);

const TERMINAL_VOCABULARY_BASELINE_FILE_URL = new URL(
  './check-style-terminal-vocabulary-baseline.json',
  import.meta.url,
);

// This checker must name the forbidden word to explain it; it is the one file
// exempt from its own scan.
const SELF_FILE_SUFFIX = 'check-style-terminal-vocabulary.js';

function collectTerminalVocabularyViolationsFromSource(source, filePath) {
  const violations = [];
  if (filePath.endsWith(SELF_FILE_SUFFIX)) return violations;
  const lines = source.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const matches = lines[index].match(TERMINAL_VOCABULARY_PATTERN);
    if (!matches) continue;
    for (const _match of matches) {
      violations.push({
        filePath,
        line: index + 1,
        column: NUMERIC_LITERAL_ZERO,
        functionName: null,
        kind: VIOLATION_KIND.TERMINAL_VOCABULARY,
        reason: VIOLATION_REASON[VIOLATION_KIND.TERMINAL_VOCABULARY],
        ruleReference: RULE_REFERENCE,
      });
    }
  }
  return violations;
}

// Per-file count identity: line numbers shift on unrelated edits, so the ratchet
// tracks how many occurrences a file holds, not where they sit.
function buildTerminalVocabularyViolationIdentity(violation) {
  return [
    violation.filePath,
    violation.kind,
  ].join(IDENTITY_SEPARATOR);
}

async function collectTerminalVocabularyViolations(pathsToScan, options) {
  const entryPaths = pathsToScan.length > NUMERIC_LITERAL_ZERO ?
    pathsToScan :
    [...DEFAULT_SCAN_ROOTS];
  return buildGuidelineViolationReport(
    entryPaths,
    options,
    collectTerminalVocabularyViolationsFromSource,
  );
}

async function collectTerminalVocabularyViolationsWithBaseline(
  pathsToScan,
  options = {},
) {
  const [report, baseline] = await Promise.all([
    collectTerminalVocabularyViolations(pathsToScan, options),
    loadCountBaseline(
      TERMINAL_VOCABULARY_BASELINE_FILE_URL,
      buildTerminalVocabularyViolationIdentity,
    ),
  ]);
  return applyCountBaseline(
    report,
    baseline,
    buildTerminalVocabularyViolationIdentity,
  );
}

function formatHumanSummary(report) {
  const summary = formatGuidelineHumanSummary(report, VIOLATION_LABEL);
  if (!Number.isFinite(report.inheritedViolationCount)) {
    return summary;
  }
  return [
    summary,
    `Matched ${report.inheritedViolationCount} inherited terminalize-` +
      'vocabulary baseline violations',
  ].join('\n');
}

const UPDATE_BASELINE_FLAG = '--update-baseline';

async function main(argv = process.argv.slice(NUMERIC_LITERAL_TWO)) {
  if (argv.includes(UPDATE_BASELINE_FLAG)) {
    const report = await collectTerminalVocabularyViolations(
      argv.filter((arg) => arg !== UPDATE_BASELINE_FLAG),
      {},
    );
    await writeCountBaseline(
      TERMINAL_VOCABULARY_BASELINE_FILE_URL,
      report,
      'terminal-vocabulary',
    );
    return NUMERIC_LITERAL_ZERO;
  }
  return runGuidelineCheck(
    argv,
    collectTerminalVocabularyViolationsWithBaseline,
    formatHumanSummary,
  );
}

runGuidelineCheckWhenDirect(import.meta.url, main);

export {
  RULE_REFERENCE,
  VIOLATION_KIND,
  buildTerminalVocabularyViolationIdentity,
  collectTerminalVocabularyViolations,
  collectTerminalVocabularyViolationsFromSource,
  collectTerminalVocabularyViolationsWithBaseline,
};
