#!/usr/bin/env node

import {fileURLToPath} from 'node:url';
import path from 'node:path';

import {
  DEFAULT_ACCEPTANCE_MANIFEST,
  acceptanceArtifactIdentity,
  runAcceptanceManifest,
  writeAcceptanceReport,
} from './checks/acceptance-proof-manifest-runner.js';
import {ACCEPTANCE_PROOF} from './checks/acceptance-proof-manifest-constants.js';

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
    `${run.manifest.id || ACCEPTANCE_PROOF.FALLBACK_MANIFEST_ID}: ` +
    `${run.passed ? ACCEPTANCE_PROOF.STATUS_PASS : ACCEPTANCE_PROOF.STATUS_FAIL} — ` +
    `${run.summary.passed}/` +
    `${run.summary.total} commands passed\nreceipt: ${receiptPath}\n` +
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
