#!/usr/bin/env node

import process from 'node:process';
import {buildCausalAnalysis, buildCausalAnalysisSchema} from '../src/diagnostics/index.js';
import {
  readArtifactWithSidecarsSync,
} from './artifact-sidecar-loader.js';

const ARG_HELP_SHORT = '-h';
const ARG_HELP_LONG = '--help';
const ARG_SCHEMA = '--schema';
const JSON_INDENT_SPACES = 2;
const EXIT_SUCCESS = 0;
const EXIT_USAGE = 1;
const EXIT_FAILURE = 2;
const ARGUMENT_START_INDEX = 2;
const STDOUT_NEWLINE = '\n';
const HELP_TEXT = [
  'Usage: node scripts/analyze-causal-model.js <report-or-failure-bundle.json>',
  '       node scripts/analyze-causal-model.js --schema',
  '',
  'Reads a rolling-restart report or failure-bundle JSON artifact and prints',
  'a deterministic read-only causal-analysis JSON artifact.',
].join(STDOUT_NEWLINE);

function main(argv) {
  const args = argv.slice(ARGUMENT_START_INDEX);
  if (args.includes(ARG_HELP_SHORT) || args.includes(ARG_HELP_LONG)) {
    process.stdout.write(`${HELP_TEXT}${STDOUT_NEWLINE}`);
    return EXIT_SUCCESS;
  }
  if (args.includes(ARG_SCHEMA)) {
    writeJson(buildCausalAnalysisSchema());
    return EXIT_SUCCESS;
  }
  const artifactPath = args[0];
  if (!artifactPath) {
    process.stderr.write(`${HELP_TEXT}${STDOUT_NEWLINE}`);
    return EXIT_USAGE;
  }
  try {
    const artifact = readArtifactWithSidecarsSync(artifactPath);
    writeJson(buildCausalAnalysis(artifact));
    return EXIT_SUCCESS;
  } catch (error) {
    process.stderr.write(`${error.message}${STDOUT_NEWLINE}`);
    return EXIT_FAILURE;
  }
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, JSON_INDENT_SPACES)}${STDOUT_NEWLINE}`);
}

process.exitCode = main(process.argv);
