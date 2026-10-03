#!/usr/bin/env node

import {fileURLToPath} from 'node:url';
import path from 'node:path';

import {
  DEFAULT_ACCEPTANCE_MANIFEST,
  acceptanceArtifactIdentity,
  readCapturedStdout,
  runAcceptanceManifest,
  writeAcceptanceReport,
} from './checks/acceptance-proof-manifest-runner.js';
import {ACCEPTANCE_PROOF} from './checks/acceptance-proof-manifest-constants.js';
import {RELAYED_LINE_PREFIX} from './lab/probe.js';
import {testFileVerdictReader} from './run-test-files.js';

const NEWLINE = '\n';
const EMPTY = '';
// A line too long to read whole that may be a file verdict: unread, it could
// leave a red file out of the list, so the list is not called complete.
const UNREAD_VERDICT = /^(?:ok|not ok) [^\s\d]/u;
const LIST_COMPLETE = 'complete';
const RECEIPT_DIR = 'test-output/acceptance';
const SCENARIO_REPORT_DIR = 'test-output/reports';

function scenarioReport(run, scenario, receiptIdentity) {
  const commandFailures = run.summary.failed + run.summary.notRun;
  const runLevelFailures = !run.passed && commandFailures === 0 ? 1 : 0;
  const failed = commandFailures + runLevelFailures;
  return {
    timestamp: run.timestamp,
    scenario,
    producer: ACCEPTANCE_PROOF.PRODUCER,
    fidelity: ACCEPTANCE_PROOF.FIDELITY,
    manifest: run.manifest,
    receipt: receiptIdentity,
    summary: {
      total: run.summary.total + runLevelFailures,
      passed: run.summary.passed,
      failed,
    },
    optimizationSummary: {totalPriorityItems: failed},
    standardSummary: {
      scenarios: [{
        scenario,
        passed: run.passed,
        current: {
          passed: run.passed,
          verdict: run.passed ?
            ACCEPTANCE_PROOF.STATUS_PASS : ACCEPTANCE_PROOF.STATUS_FAIL,
        },
        detail: {
          manifest: run.manifest,
          validationProblems: run.validationProblems,
          commands: run.commands,
          receipt: receiptIdentity,
        },
      }],
    },
  };
}

// The failing test files a command's captured stdout names, a lab machine's
// relayed lines included; null when the command left no captured stdout.
function failingTestFiles(root, command) {
  const reader = testFileVerdictReader();
  let unread = 0;
  const captured = readCapturedStdout(root, command.artifactIdentity?.path,
    (text, whole) => {
      const line = text.replace(RELAYED_LINE_PREFIX, EMPTY);
      if (whole) reader.read(line);
      else if (UNREAD_VERDICT.test(line)) unread += 1;
    });
  return captured ?
    {failing: reader.failing(), summaries: reader.summaries(), unread} : null;
}

// Why the list cannot be called complete - no runner summarised, the command
// was cut off, or a verdict line went unread - or LIST_COMPLETE.
function incompleteness(read, command) {
  const reason = read.summaries === 0 ? ACCEPTANCE_PROOF.SUMMARY_LINE_ABSENT :
    command.signal ? ACCEPTANCE_PROOF.ENDED_BY_SIGNAL_PREFIX + command.signal :
      read.unread > 0 ? `${read.unread}${ACCEPTANCE_PROOF.UNREAD_VERDICTS_SUFFIX}` :
        LIST_COMPLETE;
  return reason === LIST_COMPLETE ? LIST_COMPLETE :
    `${reason}${ACCEPTANCE_PROOF.INCOMPLETE_SUFFIX}`;
}

// A failed gate's terminal is often the only place anyone reads, and the
// capture it buffered may not outlive the gate checkout: name the failing
// files there, bounded, counting what is withheld.
function failingTestFileLines(root, command) {
  const read = failingTestFiles(root, command);
  if (!read) return [];
  const indent = ACCEPTANCE_PROOF.SUMMARY_INDENT;
  const shown = ACCEPTANCE_PROOF.FAILING_FILES_SHOWN;
  const reason = incompleteness(read, command);
  const lines = [`${indent}${ACCEPTANCE_PROOF.FAILING_FILES_LABEL}` +
    `${reason === LIST_COMPLETE ? read.failing.length : reason}`];
  for (const file of read.failing.slice(0, shown)) lines.push(`${indent}${indent}${file}`);
  if (read.failing.length > shown) {
    lines.push(`${indent}${indent}${ACCEPTANCE_PROOF.FAILING_FILES_WITHHELD_PREFIX}` +
      `${read.failing.length - shown}${ACCEPTANCE_PROOF.FAILING_FILES_WITHHELD_MIDDLE}` +
      `${command.artifactIdentity.path}${ACCEPTANCE_PROOF.FAILING_FILES_WITHHELD_SUFFIX}`);
  }
  return lines;
}

// Per-state counts, never a fraction. The manifest fails fast, so every command
// after the first failure is NOT_RUN rather than failed; `1/6 commands passed`
// invited the reading "five broke" when one did. The first failing command is
// named because it is the only one worth diagnosing - the NOT_RUN entries carry
// no verdict at all. Its failing test files follow, read from its capture
// under `root`.
export function renderRunSummary(run, root) {
  const label = (text) =>
    `${ACCEPTANCE_PROOF.SUMMARY_INDENT}` +
    `${text.padEnd(ACCEPTANCE_PROOF.SUMMARY_LABEL_WIDTH)}`;
  const firstFailure = (run.commands || []).find(
    (command) => command.status === ACCEPTANCE_PROOF.STATUS_FAIL);
  const lines = [
    `${run.manifest.id || ACCEPTANCE_PROOF.FALLBACK_MANIFEST_ID}: ` +
    `${run.passed ?
      ACCEPTANCE_PROOF.STATUS_PASS : ACCEPTANCE_PROOF.STATUS_FAIL}`,
    `${label(ACCEPTANCE_PROOF.STATUS_PASS)}${run.summary.passed}`,
    `${label(ACCEPTANCE_PROOF.STATUS_FAIL)}${run.summary.failed}`,
    `${label(ACCEPTANCE_PROOF.STATUS_NOT_RUN)}${run.summary.notRun}`,
  ];
  if (firstFailure) {
    lines.push(
      `${ACCEPTANCE_PROOF.SUMMARY_INDENT}` +
      `${ACCEPTANCE_PROOF.FIRST_FAILURE_LABEL}${firstFailure.id}`,
      ...failingTestFileLines(root, firstFailure));
  }
  return `${lines.join(NEWLINE)}${NEWLINE}`;
}

export function runProjectHardeningAcceptance(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const run = runAcceptanceManifest({
    root,
    manifestPath: options.manifestPath || DEFAULT_ACCEPTANCE_MANIFEST,
    execute: options.execute,
  });
  const receiptPath = writeAcceptanceReport(
    root,
    run,
    options.receiptDir || RECEIPT_DIR,
    run.manifest.id || ACCEPTANCE_PROOF.INVALID_MANIFEST_ID,
  );
  const receiptIdentity = acceptanceArtifactIdentity(root, receiptPath);
  let scenarioPath = null;
  if (options.scenario) {
    scenarioPath = writeAcceptanceReport(
      root,
      scenarioReport(run, options.scenario, receiptIdentity),
      options.scenarioReportDir || SCENARIO_REPORT_DIR,
      options.scenario,
    );
  }
  process.stdout.write(
    renderRunSummary(run, root) + `receipt: ${receiptPath}\n` +
    (scenarioPath ? `report: ${scenarioPath}\n` : ''),
  );
  return {run, receiptPath, scenarioPath};
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === ACCEPTANCE_PROOF.FLAG_MANIFEST) options.manifestPath = argv[++index];
    else if (arg === ACCEPTANCE_PROOF.FLAG_SCENARIO) options.scenario = argv[++index];
    else if (arg === ACCEPTANCE_PROOF.FLAG_RECEIPT_DIR) {
      options.receiptDir = argv[++index];
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const result = runProjectHardeningAcceptance(parseArgs(process.argv.slice(2)));
    process.exitCode = result.run.passed ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
