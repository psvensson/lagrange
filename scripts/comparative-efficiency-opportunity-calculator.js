#!/usr/bin/env node

import {readFileSync} from 'node:fs';
import {
  calculateComparativeOpportunity,
} from '../src/diagnostics/comparative-efficiency-opportunity-calculator.js';
import {
  serializeJsonData,
} from '../src/diagnostics/comparative-efficiency-opportunity-input-integrity.js';

const parseJson = JSON.parse;
const ARGUMENT = Object.freeze({
  INPUT: '--input',
  PRETTY: '--pretty',
  STDIN: '-',
});
const CLI_TEXT = Object.freeze({
  ERROR_PREFIX: 'opportunity-calculator: ',
  NEWLINE: '\n',
  USAGE: 'usage: --input <fixture.json> [--pretty]',
});

function parseArgs(argv) {
  const args = {input: '', pretty: false};
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === ARGUMENT.INPUT) {
      args.input = argv[index + 1] || '';
      index += 1;
    } else if (value === ARGUMENT.PRETTY) {
      args.pretty = true;
    } else {
      throw new TypeError(`unsupported argument: ${value}`);
    }
  }
  if (!args.input) {
    throw new TypeError(CLI_TEXT.USAGE);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const inputSource = args.input === ARGUMENT.STDIN ? 0 : args.input;
  const input = parseJson(readFileSync(inputSource, 'utf8'));
  const output = calculateComparativeOpportunity(input);
  const spacing = args.pretty ? 2 : 0;
  process.stdout.write(
    serializeJsonData(output, {spacing}) + CLI_TEXT.NEWLINE,
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `${CLI_TEXT.ERROR_PREFIX}${error.message}${CLI_TEXT.NEWLINE}`,
  );
  process.exitCode = 1;
}
