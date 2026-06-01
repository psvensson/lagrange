#!/usr/bin/env node

import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
  resolvePackagePath,
  validateAgentReports,
} from './work-agent-cards.js';

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const NUM_ONE = 1;
const NUM_TWO = 2;
const NEWLINE = '\n';
const FLAG_ALLOW_MISSING = '--allow-missing';

async function runCli(args = process.argv.slice(NUM_TWO)) {
  const packagePath = await resolvePackagePath(args);
  const validation = await validateAgentReports(packagePath, {
    allowMissing: args.includes(FLAG_ALLOW_MISSING),
  });
  const lines = [
    `Package: ${packagePath}`,
    `Report dir: ${validation.reportDir || 'none'}`,
    `Cards loaded: ${validation.cards.length}`,
    `Cards missing: ${validation.missing.length}`,
  ];
  if (validation.errors.length > 0) {
    lines.push('', 'Validation errors:');
    for (const error of validation.errors) {
      lines.push(`- ${error}`);
    }
  } else {
    lines.push('', 'Agent route cards valid.');
  }
  return {
    ok: validation.errors.length === 0,
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
