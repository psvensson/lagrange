#!/usr/bin/env node

import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
  buildPlanLines,
  readPackageMetadata,
  resolvePackagePath,
  validateParallelDiagnostics,
} from './work-agent-cards.js';

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const NUM_ONE = 1;
const NUM_TWO = 2;
const NEWLINE = '\n';

async function runCli(args = process.argv.slice(NUM_TWO)) {
  const packagePath = await resolvePackagePath(args);
  const {metadata} = await readPackageMetadata(packagePath);
  const errors = validateParallelDiagnostics(packagePath, metadata);
  const lines = buildPlanLines(packagePath, metadata);
  if (errors.length > 0) {
    lines.push('', '## Configuration Errors', '');
    for (const error of errors) {
      lines.push(`- ${error}`);
    }
  }
  return {
    ok: errors.length === 0,
    output: `${lines.join(NEWLINE)}${NEWLINE}`,
  };
}

function isDirectRun() {
  return process.argv[NUM_ONE] === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  runCli()
    .then((result) => {
      process.stdout.write(result.output);
      process.exitCode = result.ok ? EXIT_SUCCESS : EXIT_FAILURE;
    })
    .catch((error) => {
      process.stderr.write(`${error.message}${NEWLINE}`);
      process.exitCode = EXIT_FAILURE;
    });
}

export {
  runCli,
};
