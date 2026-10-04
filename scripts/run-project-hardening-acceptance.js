#!/usr/bin/env node

import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_ACCEPTANCE_MANIFEST,
  acceptanceArtifactIdentity,
  runAcceptanceManifest,
  writeAcceptanceReport,
} from './checks/acceptance-proof-manifest-runner.js';
import {ACCEPTANCE_PROOF} from './checks/acceptance-proof-manifest-constants.js';
import {readBoundedOutput, testFileVerdictReader} from './run-test-files.js';

const NEWLINE = '\n';
const FAILING_FILES_SHOWN = 20;
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

// Why a failing-file list cannot be called complete, or null when every file
// a classified run planned is covered by a runner summary, nothing ended by a
// signal, and every verdict line was read whole.
function incompleteness(read, command) {
  const signal = command.signal || read.signal;
  const reason = read.summaries === 0 ? 'summary line absent' :
    read.planned > read.summarised ? `${read.planned - read.summarised} of ` +
      `${read.planned} planned file(s) not covered by a summary` :
      signal ? `ended by ${signal}` :
        read.unread > 0 ? `${read.unread} verdict line(s) too long to read` : null;
  return reason && `${reason} - list may be incomplete`;
}

// A failed gate's terminal is often the only place anyone reads: name the
// failing command's failing test files, read line by line from its captured
// stdout through the bounded reader, bounded and counting what is withheld.
// Nothing when no test runner spoke in it.
function failingTestFileLines(root, command) {
  const stdout = `${command.artifactIdentity?.path}${ACCEPTANCE_PROOF.CAPTURED_STDOUT_SUFFIX}`;
  if (!command.artifactIdentity?.path || !fs.existsSync(path.join(root, stdout))) return [];
  const reader = testFileVerdictReader();
  readBoundedOutput(path.join(root, stdout), {onLinePrefix: reader.read});
  const read = reader.result();
  if (!read.runner) return [];
  const indent = ACCEPTANCE_PROOF.SUMMARY_INDENT;
  const withheld = read.failing.length - FAILING_FILES_SHOWN;
  return [`${indent}failing test files: ${incompleteness(read, command) ?? read.failing.length}`,
    ...read.failing.slice(0, FAILING_FILES_SHOWN).map((file) => `${indent}${indent}${file}`),
    ...(withheld > 0 ? [`${indent}${indent}... ${withheld} more withheld (all in ${stdout})`] : [])];
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

const USAGE = 'usage: run-project-hardening-acceptance.js [--manifest <file>] ' +
  '[--scenario <id>] [--receipt-dir <dir>]';
// A flag without its value is refused too: a trailing --manifest used to fall
// back to the default (whole-gate) manifest (push-gate-integrity).
function parseArgs(argv) {
  const options = {};
  const value = (index) => {
    if (argv[index] === undefined) {
      throw new Error(`argument requires a value: ${argv[index - 1]}\n${USAGE}`);
    }
    return argv[index];
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === ACCEPTANCE_PROOF.FLAG_MANIFEST) options.manifestPath = value(++index);
    else if (arg === ACCEPTANCE_PROOF.FLAG_SCENARIO) options.scenario = value(++index);
    else if (arg === ACCEPTANCE_PROOF.FLAG_RECEIPT_DIR) {
      options.receiptDir = value(++index);
    } else throw new Error(`unknown argument: ${arg}\n${USAGE}`);
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
